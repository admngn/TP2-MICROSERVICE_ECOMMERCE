const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const store = {}; 
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 100;

function rateLimiter(req, res, next) {
  const ip = req.ip || '0.0.0.0';
  const now = Date.now();

  if (!store[ip]) store[ip] = { count: 0, resetAt: now + WINDOW_MS };
  if (now > store[ip].resetAt) {
    store[ip].count = 0;
    store[ip].resetAt = now + WINDOW_MS;
  }

  store[ip].count++;

  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - store[ip].count));
  res.setHeader('X-RateLimit-Reset', store[ip].resetAt);

  if (store[ip].count > MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too Many Requests' });
  }
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const ip in store) {
    if (now > store[ip].resetAt) delete store[ip];
  }
}, WINDOW_MS);

app.use(rateLimiter);

async function withRetry(fn, options = {}) {
  const { maxAttempts = 3, baseDelayMs = 200, maxDelayMs = 5000, onRetry = null } = options;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err.response && err.response.status >= 400 && err.response.status < 500) throw err;
      if (attempt === maxAttempts) break;
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * exponentialDelay * 0.3;
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);
      if (onRetry) onRetry(attempt, delay, err.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

const CATALOGUE_URL = 'http://catalogue:3001';
const PANIER_URL = 'http://panier:3002';
const COMMANDES_URL = 'http://commandes:3003';
const NOTIFICATIONS_URL = 'http://notifications:3004';

async function proxyRequest(req, res, targetUrl) {
    try {
        const response = await withRetry(() => axios({
            method: req.method,
            url: targetUrl,
            data: req.body,
            params: req.query,
            timeout: 5000
        }));
        res.status(response.status).json(response.data);
    } catch (error) {
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(503).json({ error: 'Service Unavailable' });
        }
    }
}

app.use('/products', (req, res) => proxyRequest(req, res, `${CATALOGUE_URL}/products${req.url}`));
app.use('/cart', (req, res) => proxyRequest(req, res, `${PANIER_URL}/cart${req.url}`));
app.use('/orders', (req, res) => proxyRequest(req, res, `${COMMANDES_URL}/orders${req.url}`));
app.use('/notifications', (req, res) => proxyRequest(req, res, `${NOTIFICATIONS_URL}/notifications${req.url}`));

app.get('/health', async (req, res) => {
  const start = Date.now();
  const checks = await Promise.allSettled([
    axios.get(`${CATALOGUE_URL}/health`, { timeout: 2000 }).then(r => ({ name: 'catalogue', ...r.data })).catch(e => { throw { name: 'catalogue', error: e.code || e.message } }),
    axios.get(`${PANIER_URL}/health`, { timeout: 2000 }).then(r => ({ name: 'panier', ...r.data })).catch(e => { throw { name: 'panier', error: e.code || e.message } }),
    axios.get(`${COMMANDES_URL}/health`, { timeout: 2000 }).then(r => ({ name: 'commandes', ...r.data })).catch(e => { throw { name: 'commandes', error: e.code || e.message } }),
    axios.get(`${NOTIFICATIONS_URL}/health`, { timeout: 2000 }).then(r => ({ name: 'notifications', ...r.data })).catch(e => { throw { name: 'notifications', error: e.code || e.message } })
  ]);

  const services = {};
  let degraded = false;

  checks.forEach(result => {
    if (result.status === 'fulfilled') {
      services[result.value.name] = { status: 'ok', responseTime: Date.now() - start };
    } else {
      degraded = true;
      services[result.reason.name] = { status: 'down', responseTime: null, error: result.reason.error };
    }
  });

  const response = {
    status: degraded ? 'degraded' : 'ok',
    gateway: 'ok',
    services,
    timestamp: new Date().toISOString(),
    totalResponseTime: Date.now() - start
  };

  res.status(degraded ? 503 : 200).json(response);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`[gateway] http://localhost:${PORT}`);
});
