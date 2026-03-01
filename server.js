const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8001;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');

const SHARE_TTL_DAYS = parseInt(process.env.SHARE_TTL_DAYS, 10) || 5;
const SHARE_MAX_FILES = parseInt(process.env.SHARE_MAX_FILES, 10) || 100;
const SHARE_MAX_SIZE_MB = parseInt(process.env.SHARE_MAX_SIZE_MB, 10) || 20;

fs.mkdirSync(DATA_DIR, { recursive: true });

function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

function getDataFiles() {
  try {
    return fs.readdirSync(DATA_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const fp = path.join(DATA_DIR, f);
        const stat = fs.statSync(fp);
        let created;
        try {
          const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
          created = new Date(data.created).getTime();
        } catch {
          created = stat.mtimeMs;
        }
        return { file: f, path: fp, size: stat.size, created };
      })
      .sort((a, b) => a.created - b.created);
  } catch {
    return [];
  }
}

function sweepExpired() {
  if (SHARE_TTL_DAYS <= 0) return 0;
  const cutoff = Date.now() - SHARE_TTL_DAYS * 86400000;
  const files = getDataFiles();
  let removed = 0;
  for (const f of files) {
    if (f.created < cutoff) {
      try { fs.unlinkSync(f.path); removed++; } catch {}
    }
  }
  if (removed > 0) console.log(`[cleanup] TTL sweep removed ${removed} expired file(s)`);
  return removed;
}

function enforceStorageCaps() {
  const files = getDataFiles();

  if (SHARE_MAX_FILES > 0) {
    while (files.length > SHARE_MAX_FILES) {
      const oldest = files.shift();
      try { fs.unlinkSync(oldest.path); } catch {}
      console.log(`[cleanup] Evicted ${oldest.file} (file count cap)`);
    }
  }

  if (SHARE_MAX_SIZE_MB > 0) {
    const maxBytes = SHARE_MAX_SIZE_MB * 1024 * 1024;
    let totalSize = files.reduce((sum, f) => sum + f.size, 0);
    while (totalSize > maxBytes && files.length > 0) {
      const oldest = files.shift();
      try { fs.unlinkSync(oldest.path); } catch {}
      totalSize -= oldest.size;
      console.log(`[cleanup] Evicted ${oldest.file} (size cap)`);
    }
  }
}

// Hourly TTL sweep
setInterval(sweepExpired, 3600000);
sweepExpired();

app.use(express.json({ limit: '2mb' }));
app.use(express.text({ limit: '2mb' }));

// Serve puml.html as the default landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'puml.html'));
});

// Static files from public/ (editor.html, puml.html accessible by direct path)
app.use(express.static(PUBLIC_DIR, {
  index: false,
  extensions: ['html'],
}));

// --- Share API ---

app.post('/api/share', (req, res) => {
  const content = typeof req.body === 'string' ? req.body : req.body.content;
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Missing content' });
  }
  if (content.length > 2 * 1024 * 1024) {
    return res.status(413).json({ error: 'Content too large (max 2MB)' });
  }

  enforceStorageCaps();

  const id = generateId();
  const record = { id, content, created: new Date().toISOString() };
  fs.writeFileSync(path.join(DATA_DIR, `${id}.json`), JSON.stringify(record));
  res.json({ id });
});

app.get('/api/share/:id', (req, res) => {
  const id = req.params.id.replace(/[^a-f0-9]/gi, '');
  const fp = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(fp)) {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const record = JSON.parse(fs.readFileSync(fp, 'utf8'));
    res.json({ content: record.content, created: record.created });
  } catch {
    res.status(500).json({ error: 'Read error' });
  }
});

app.delete('/api/share/cleanup/expired', (req, res) => {
  const removed = sweepExpired();
  res.json({ removed });
});

app.delete('/api/share/:id', (req, res) => {
  const id = req.params.id.replace(/[^a-f0-9]/gi, '');
  const fp = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(fp)) {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    fs.unlinkSync(fp);
    res.json({ deleted: id });
  } catch {
    res.status(500).json({ error: 'Delete error' });
  }
});

app.listen(PORT, () => {
  console.log(`PlantUML Editor server running on port ${PORT}`);
  console.log(`Config: TTL=${SHARE_TTL_DAYS}d, MAX_FILES=${SHARE_MAX_FILES}, MAX_SIZE=${SHARE_MAX_SIZE_MB}MB`);
});
