import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeRouter } from './routes/analyze.js';
import { aiRouter } from './routes/ai.js';
import { memoryRouter, handleGraphHealthCheck } from './routes/memory.js';
import { incidentRouter } from './routes/incident.js';
import { repositoryRouter } from './routes/repository.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

const defaultBodyLimit = () => process.env.JSON_BODY_LIMIT || '256kb';
const aiBodyLimit = () => process.env.AI_BODY_LIMIT || '1mb';

// Apply a configurable larger limit specifically to AI, ingestion, and incident routes that receive analysis context
app.use('/api/ai', (req, res, next) => express.json({ limit: aiBodyLimit() })(req, res, next));
app.use('/api/memory/ingest', (req, res, next) => express.json({ limit: aiBodyLimit() })(req, res, next));
app.use('/api/incident', (req, res, next) => express.json({ limit: aiBodyLimit() })(req, res, next));
app.use((req, res, next) => express.json({ limit: defaultBodyLimit() })(req, res, next));

// API Routes
app.use('/api', analyzeRouter);
app.use('/api/repository', repositoryRouter);
app.use('/api/ai', aiRouter);
app.use('/api/memory', memoryRouter);
app.use('/api/incident', incidentRouter);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'TraceForge Analyzer',
    version: '1.0.0-mvp',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health/graph', handleGraphHealthCheck);

// Structured JSON error handler for PayloadTooLargeError (413) and malformed JSON (400)
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413)) {
    return res.status(413).json({
      available: false,
      code: 'PAYLOAD_TOO_LARGE',
      error:
        'Request payload exceeds the maximum allowed size. Send a compact analysis payload without the full file tree.',
      limit: err.limit || null,
      length: err.length || null
    });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      available: false,
      code: 'INVALID_JSON',
      error: 'Malformed JSON request body.'
    });
  }
  return next(err);
});

// Serve static frontend files in production if dist exists
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

app.use((req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const isMainModule =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).toLowerCase() === path.resolve(__filename).toLowerCase();

if (process.env.VERCEL !== '1' && isMainModule) {
  app.listen(PORT, () => {
    console.log(`[TraceForge] Server running on http://localhost:${PORT}`);
  });
}

export default app;
