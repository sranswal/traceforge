import express from 'express';
import { aiProvider } from '../ai/provider.js';

export const aiRouter = express.Router();

aiRouter.post('/summary', async (req, res) => {
  try {
    const { analysis } = req.body || {};
    if (!analysis || !analysis.repository?.fullName) {
      return res.status(400).json({
        available: false,
        error: 'Analysis data with a valid repository fullName is required for summary generation.'
      });
    }

    const summary = await aiProvider.generateArchitectureSummary(analysis, { summaryMode: true });
    return res.json(summary);
  } catch (err) {
    return res.status(500).json({ available: false, error: err.message });
  }
});

aiRouter.post('/ask', async (req, res) => {
  try {
    const { question, analysis, focusEntity, targetRepo } = req.body || {};
    if (!question || !String(question).trim() || !analysis || !analysis.repository?.fullName) {
      return res.status(400).json({
        available: false,
        error: 'Both a non-empty question and valid repository analysis context are required.'
      });
    }

    const answer = await aiProvider.answerQuestion(String(question).trim(), analysis, {
      focusEntity: focusEntity || null,
      targetRepo: targetRepo ? String(targetRepo).trim() : null
    });
    return res.json(answer);
  } catch (err) {
    return res.status(500).json({ available: false, error: err.message });
  }
});
