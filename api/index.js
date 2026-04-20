const express = require('express');
const { createStorage } = require('../lib/storage');
const createShareRouter = require('../lib/api-routes');

const app = express();

let storage;
try {
  storage = createStorage();
} catch (e) {
  console.error('[api] Storage init failed:', e.message);
  storage = null;
}

app.use(express.json({ limit: '2mb' }));
app.use(express.text({ limit: '2mb' }));

app.get('/api/config', (req, res) => {
  res.json({
    krokiUrl: process.env.KROKI_URL || '',
  });
});

if (storage) {
  app.use(createShareRouter(storage));
} else {
  app.use('/api/share', (req, res) => {
    res.status(503).json({ error: 'Storage unavailable. Configure UPSTASH_REDIS_REST_URL for Vercel deployments.' });
  });
}

module.exports = app;
