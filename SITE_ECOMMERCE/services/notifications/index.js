const express = require('express');
const logger = require('./logger');
const { metricsMiddleware, generateMetrics } = require('./metrics');
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

let notifications = [];

app.use(metricsMiddleware);

app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/metrics') return next();
  const start = Date.now();
  res.on('finish', () => {
    logger.info('Request handled', { method: req.method, path: req.path, status: res.statusCode, duration_ms: Date.now() - start });
  });
  next();
});

app.get('/health', (req, res) => {
  const used_mb = Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100;
  res.json({
    status: used_mb > 400 ? 'degraded' : 'ok',
    service: 'notifications',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      memory: { status: used_mb > 400 ? 'degraded' : 'ok', used_mb, threshold_mb: 400 },
      dataStore: { status: 'ok', records: notifications.length }
    }
  });
});

const templates = {
  order_created: true,
  order_confirmed: true,
  order_shipped: true,
  order_delivered: true,
  order_cancelled: true,
  low_stock: true,
};

app.post('/notify', (req, res) => {
  const { type, userId, orderId } = req.body;
  if (!type || !templates[type]) return res.status(400).json({ error: 'Unknown notification type' });

  const notif = {
    id: 'notif-' + Date.now(),
    type,
    userId,
    orderId,
    sentAt: new Date().toISOString(),
  };
  notifications.push(notif);
  logger.info('Email sent', { type, userId, orderId });
  res.status(201).json(notif);
});

app.get('/notifications/stats', (req, res) => {
  const byType = {};
  notifications.forEach(n => {
    byType[n.type] = (byType[n.type] || 0) + 1;
  });
  res.json({ byType });
});

app.get('/notifications', (req, res) => {
  let filtered = notifications;
  if (req.query.userId) filtered = filtered.filter(n => n.userId === req.query.userId);
  if (req.query.type) filtered = filtered.filter(n => n.type === req.query.type);
  res.json(filtered);
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(generateMetrics('notifications', { records_total: notifications.length }));
});

app.use((req, res) => {
  logger.warn('Route not found', { method: req.method, path: req.path });
  res.status(404).json({ error: 'Not Found', message: `La route ${req.method} ${req.path} n'existe pas` });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, path: req.path, method: req.method });
  res.status(500).json({ error: 'Internal Server Error', message: 'Une erreur inattendue s\'est produite', requestId: Date.now().toString() });
});

const PORT = 3004;
const server = app.listen(PORT, () => logger.info('Service started', { port: PORT }));

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => process.exit(0));
});
