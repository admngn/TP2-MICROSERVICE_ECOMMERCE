const express = require('express');
const logger = require('./logger');
const { metricsMiddleware, generateMetrics } = require('./metrics');
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

let carts = {}; 

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
    service: 'panier',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      memory: { status: used_mb > 400 ? 'degraded' : 'ok', used_mb, threshold_mb: 400 },
      dataStore: { status: 'ok', records: Object.keys(carts).length }
    }
  });
});

app.get('/cart/:userId/summary', (req, res) => {
  const userId = req.params.userId;
  const cart = carts[userId] || { items: [], total: 0, itemCount: 0 };
  res.json({
    userId,
    itemCount: cart.itemCount || 0,
    uniqueProducts: cart.items ? cart.items.length : 0,
    total: cart.total || 0,
    isEmpty: !cart.items || cart.items.length === 0
  });
});

app.get('/cart/:userId', (req, res) => {
  const userId = req.params.userId;
  if (!carts[userId]) carts[userId] = { userId, items: [], total: 0, itemCount: 0 };
  res.json(carts[userId]);
});

app.post('/cart/:userId/items', (req, res) => {
  const userId = req.params.userId;
  if (!carts[userId]) carts[userId] = { userId, items: [], total: 0, itemCount: 0 };
  
  const { productId, quantity, unitPrice, productName } = req.body;
  if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: 'invalid quantity' });
  
  const cart = carts[userId];
  const existing = cart.items.find(i => i.productId === productId);
  if (existing) {
    existing.quantity += quantity;
    existing.subtotal = existing.quantity * existing.unitPrice;
  } else {
    cart.items.push({
      itemId: Date.now().toString(),
      productId,
      productName,
      quantity,
      unitPrice,
      subtotal: quantity * unitPrice
    });
  }
  
  cart.itemCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);
  cart.total = cart.items.reduce((sum, i) => sum + i.subtotal, 0);
  
  res.status(201).json(cart);
});

app.delete('/cart/:userId', (req, res) => {
  const userId = req.params.userId;
  carts[userId] = { userId, items: [], total: 0, itemCount: 0 };
  res.json(carts[userId]);
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(generateMetrics('panier', { records_total: Object.keys(carts).length }));
});

app.use((req, res) => {
  logger.warn('Route not found', { method: req.method, path: req.path });
  res.status(404).json({ error: 'Not Found', message: `La route ${req.method} ${req.path} n'existe pas` });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, path: req.path, method: req.method });
  res.status(500).json({ error: 'Internal Server Error', message: 'Une erreur inattendue s\'est produite', requestId: Date.now().toString() });
});

const PORT = 3002;
const server = app.listen(PORT, () => logger.info('Service started', { port: PORT }));

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => process.exit(0));
});
