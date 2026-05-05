const express = require('express');
const logger = require('./logger');
const { metricsMiddleware, generateMetrics } = require('./metrics');
const { validateProduct } = require('./validators');
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const products = [
  { id: 1, name: 'Clavier mécanique', price: 89.99, stock: 12, category: 'other' },
  { id: 2, name: 'Souris ergonomique', price: 49.99, stock: 8, category: 'other' },
];

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
    service: 'catalogue',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      memory: { status: used_mb > 400 ? 'degraded' : 'ok', used_mb, threshold_mb: 400 },
      dataStore: { status: 'ok', records: products.length }
    }
  });
});

app.get('/products', (req, res) => res.json(products));

app.get('/products/:id', (req, res) => {
  const p = products.find(p => p.id === parseInt(req.params.id));
  if (!p) return res.status(404).json({ error: 'Produit introuvable' });
  res.json(p);
});

app.post('/products', (req, res) => {
  const errors = validateProduct(req.body);
  if (errors.length > 0) return res.status(400).json({ error: 'Validation failed', details: errors });
  const p = { id: Date.now(), ...req.body };
  products.push(p);
  res.status(201).json(p);
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(generateMetrics('catalogue', { records_total: products.length }));
});

app.use((req, res) => {
  logger.warn('Route not found', { method: req.method, path: req.path });
  res.status(404).json({ error: 'Not Found', message: `La route ${req.method} ${req.path} n'existe pas` });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, path: req.path, method: req.method });
  res.status(500).json({ error: 'Internal Server Error', message: 'Une erreur inattendue s\'est produite', requestId: Date.now().toString() });
});

const PORT = 3001;
const server = app.listen(PORT, () => logger.info('Service started', { port: PORT }));

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => process.exit(0));
});
