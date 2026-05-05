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

const products = [
  { id: 1, name: 'Clavier mécanique', emoji: '⌨️', price: 89.99, stock: 12 },
  { id: 2, name: 'Souris ergonomique', emoji: '🖱️', price: 49.99, stock: 8 },
  { id: 3, name: 'Écran 27"',          emoji: '🖥️', price: 299.99, stock: 5 },
  { id: 4, name: 'Casque audio',        emoji: '🎧', price: 129.99, stock: 20 },
  { id: 5, name: 'Hub USB-C',           emoji: '🔌', price: 39.99, stock: 15 },
  { id: 6, name: 'Webcam HD',           emoji: '📷', price: 69.99, stock: 7 },
];

// ── TODO ETUDIANT : instrumenter avec prom-client ── DONE ──────────────────
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

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'catalogue' }));

app.get('/products', (req, res) => {
  res.json(products);
});

app.get('/products/:id', (req, res) => {
  const p = products.find(p => p.id === parseInt(req.params.id));
  if (!p) return res.status(404).json({ error: 'Produit introuvable' });
  res.json(p);
});

// TODO ETUDIANT : exposer GET /metrics — DONE
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

const PORT = 3001;
app.listen(PORT, () => console.log(`[catalogue] http://localhost:${PORT}`));
