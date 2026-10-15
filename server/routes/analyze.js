import express from 'express';
import { analyzeRepository } from '../analyzer/index.js';

export const analyzeRouter = express.Router();

analyzeRouter.post('/analyze', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'GitHub repository URL is required.' });
    }

    const result = await analyzeRepository(url);
    return res.json(result);
  } catch (error) {
    console.error('Analysis error:', error.message);
    const statusCode = error.message.includes('rate limit') ? 429 : 
                       error.message.includes('not found') ? 404 : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});
