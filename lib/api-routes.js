const { Router } = require('express');

module.exports = function createShareRouter(storage) {
  const router = Router();

  router.post('/api/share', async (req, res) => {
    try {
      const content = typeof req.body === 'string' ? req.body : req.body.content;
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Missing content' });
      }
      if (content.length > 2 * 1024 * 1024) {
        return res.status(413).json({ error: 'Content too large (max 2MB)' });
      }
      const id = await storage.save(content);
      res.json({ id });
    } catch (err) {
      console.error('[share] Save error:', err);
      res.status(500).json({ error: 'Save error' });
    }
  });

  router.get('/api/share/:id', async (req, res) => {
    try {
      const id = req.params.id.replace(/[^a-f0-9]/gi, '');
      const record = await storage.get(id);
      if (!record) return res.status(404).json({ error: 'Not found' });
      res.json(record);
    } catch (err) {
      console.error('[share] Read error:', err);
      res.status(500).json({ error: 'Read error' });
    }
  });

  router.delete('/api/share/cleanup/expired', async (req, res) => {
    try {
      const removed = await storage.cleanup();
      res.json({ removed });
    } catch (err) {
      console.error('[share] Cleanup error:', err);
      res.status(500).json({ error: 'Cleanup error' });
    }
  });

  router.delete('/api/share/:id', async (req, res) => {
    try {
      const id = req.params.id.replace(/[^a-f0-9]/gi, '');
      const deleted = await storage.remove(id);
      if (!deleted) return res.status(404).json({ error: 'Not found' });
      res.json({ deleted: id });
    } catch (err) {
      console.error('[share] Delete error:', err);
      res.status(500).json({ error: 'Delete error' });
    }
  });

  return router;
};
