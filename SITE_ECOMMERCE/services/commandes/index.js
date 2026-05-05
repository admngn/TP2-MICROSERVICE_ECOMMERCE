const express = require('express');
const client = require('prom-client');
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

let orders = [];
let nextId = 1;

// ── TODO ETUDIANT : instrumenter avec prom-client ── DONE ──────────────────
// Idées : counter commandes créées, histogram montant des commandes...
client.collectDefaultMetrics();
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Nombre total de requêtes HTTP',
  labelNames: ['method', 'route', 'status'],
});
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durée des requêtes HTTP en secondes',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 1, 3],
});
const ordersTotal = new client.Gauge({
  name: 'orders_total',
  help: 'Nombre total de commandes en mémoire',
});
app.use((req, res, next) => {
  if (req.path === '/metrics') return next();
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route?.path || req.path;
    const labels = { method: req.method, route, status: res.statusCode };
    httpRequestsTotal.inc(labels);
    end(labels);
  });
  next();
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'commandes', total: orders.length }));

app.get('/orders', (req, res) => {
  res.json(orders);
});

app.post('/orders', (req, res) => {
  const { items } = req.body;
  if (!items || !items.length)
    return res.status(400).json({ error: 'items requis et non vide' });

  const total = items.reduce((sum, i) => sum + i.price, 0);
  const order = {
    id: nextId++,
    items,
    total: Math.round(total * 100) / 100,
    status: 'confirmée',
    createdAt: new Date().toISOString(),
  };
  orders.push(order);
  ordersTotal.set(orders.length);

  // Appel async au service notifications (fire & forget)
  fetch('http://notifications:3004/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: order.id, total: order.total }),
  }).catch(err => console.warn('[commandes] notifications unreachable:', err.message));

  res.status(201).json(order);
});

// TODO ETUDIANT : exposer GET /metrics — DONE
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

const PORT = 3003;
app.listen(PORT, () => console.log(`[commandes] http://localhost:${PORT}`));
