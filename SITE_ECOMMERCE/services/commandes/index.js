const express = require('express');
const logger = require('./logger');
const { metricsMiddleware, generateMetrics } = require('./metrics');
const { validateOrder } = require('./validators');
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

let orders = [];

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
    service: 'commandes',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      memory: { status: used_mb > 400 ? 'degraded' : 'ok', used_mb, threshold_mb: 400 },
      dataStore: { status: 'ok', records: orders.length }
    }
  });
});

app.get('/orders/stats', (req, res) => {
  const total = orders.length;
  const byStatus = { pending: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0 };
  let totalRevenue = 0;
  let notCancelledCount = 0;
  
  orders.forEach(o => {
    if (byStatus[o.status] !== undefined) byStatus[o.status]++;
    if (o.status !== 'cancelled') {
      totalRevenue += o.total;
      notCancelledCount++;
    }
  });
  
  res.json({
    total,
    byStatus,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    averageOrderValue: notCancelledCount ? Math.round((totalRevenue / notCancelledCount) * 100) / 100 : 0
  });
});

app.get('/orders', (req, res) => {
  res.json(orders);
});

app.get('/orders/:id', (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json(order);
});

app.post('/orders', (req, res) => {
  const errors = validateOrder(req.body);
  if (errors.length > 0) return res.status(400).json({ error: 'Validation failed', details: errors });

  const { userId, items, shippingAddress } = req.body;
  const total = items.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0);
  const id = 'order-' + Date.now();
  
  const order = {
    id,
    userId,
    items: items.map(i => ({ ...i, subtotal: i.quantity * i.unitPrice })),
    total,
    status: 'pending',
    statusHistory: [{ status: 'pending', timestamp: new Date().toISOString() }],
    shippingAddress,
    createdAt: new Date().toISOString()
  };
  orders.push(order);

  fetch('http://notifications:3004/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'order_created', userId, orderId: id })
  }).catch(err => logger.warn('notifications unreachable:', { error: err.message }));

  res.status(201).json(order);
});

app.patch('/orders/:id/status', (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  
  const newStatus = req.body.status;
  const validTransitions = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['shipped', 'cancelled'],
    shipped: ['delivered']
  };
  
  if (!validTransitions[order.status] || !validTransitions[order.status].includes(newStatus)) {
    return res.status(400).json({ error: 'Invalid transition' });
  }
  
  order.status = newStatus;
  order.statusHistory.push({ status: newStatus, timestamp: new Date().toISOString() });
  res.json(order);
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(generateMetrics('commandes', { records_total: orders.length }));
});

app.use((req, res) => {
  logger.warn('Route not found', { method: req.method, path: req.path });
  res.status(404).json({ error: 'Not Found', message: `La route ${req.method} ${req.path} n'existe pas` });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, path: req.path, method: req.method });
  res.status(500).json({ error: 'Internal Server Error', message: 'Une erreur inattendue s\'est produite', requestId: Date.now().toString() });
});

const PORT = 3003;
const server = app.listen(PORT, () => logger.info('Service started', { port: PORT }));

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => process.exit(0));
});
