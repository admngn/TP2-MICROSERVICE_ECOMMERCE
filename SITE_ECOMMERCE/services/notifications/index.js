const express = require('express');
const client = require('prom-client');
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

// ── TODO ETUDIANT : instrumenter avec prom-client ── DONE ──────────────────
// Idée : counter de notifications envoyées par type
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

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'notifications', sent: notifications.length }));

app.post('/notify', (req, res) => {
  const { orderId, total } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId requis' });

  const notif = {
    id: notifications.length + 1,
    orderId,
    message: `Commande #${orderId} confirmée — Total : ${total} €`,
    sentAt: new Date().toISOString(),
  };
  notifications.push(notif);
  console.log('[notifications] 📧', notif.message);
  res.status(201).json(notif);
});

app.get('/notifications', (req, res) => res.json(notifications));

// TODO ETUDIANT : exposer GET /metrics — DONE
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

const PORT = 3004;
app.listen(PORT, () => console.log(`[notifications] http://localhost:${PORT}`));
