import express from 'express';
import { classify } from './classifier.js';
import { logger } from './logger.js';

export function createServer(config) {
  const app = express();
  app.use(express.json());

  // Auth middleware
  app.use((req, res, next) => {
    if (!config.server.apiKey) {
      return res.status(403).json({ error: 'API endpoint disabled — set server.apiKey in config' });
    }
    const provided = req.headers['x-api-key'] || req.query.apiKey;
    if (provided !== config.server.apiKey) {
      return res.status(401).json({ error: 'Invalid or missing API key' });
    }
    next();
  });

  // Single email classification endpoint
  app.post('/classify', async (req, res) => {
    try {
      const { subject, from, body } = req.body;
      if (!subject && !from && !body) {
        return res.status(400).json({ error: 'Provide subject, from, and body fields' });
      }

      const result = await classify(
        { subject: subject || '', from: from || '', body: body || '' },
        config
      );

      res.json(result);
    } catch (err) {
      logger.error('Classify endpoint error', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}
