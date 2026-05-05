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

// Stockage en mémoire (pas de DB pour simplifier)
let cart = [];

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

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'panier', items: cart.length }));

app.get('/cart', (req, res) => {
  res.json(cart);
});

app.post('/cart', (req, res) => {
  const { productId, name, price } = req.body;
  if (!productId || !name || price === undefined)
    return res.status(400).json({ error: 'productId, name et price requis' });
  cart.push({ productId, name, price });
  res.status(201).json({ message: 'Ajouté', cart });
});

app.delete('/cart/:productId', (req, res) => {
  const id = parseInt(req.params.productId);
  const idx = cart.findIndex(i => i.productId === id);
  if (idx === -1) return res.status(404).json({ error: 'Article introuvable' });
  cart.splice(idx, 1);
  res.json({ message: 'Supprimé', cart });
});

app.delete('/cart', (req, res) => {
  cart = [];
  res.json({ message: 'Panier vidé' });
});

// TODO ETUDIANT : exposer GET /metrics — DONE
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

const PORT = 3002;
app.listen(PORT, () => console.log(`[panier] http://localhost:${PORT}`));
