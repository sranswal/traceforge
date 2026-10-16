import express from 'express';
import { sanitizeErrorMessage as sanitizeFalkorDBError } from '../db/falkordb.js';
import { resolveProvider } from '../providers/registry.js';
import {
  resolveGraphProvider,
  validateActiveGraphConfig,
  getGraphHealth,
  ingestRepositoryToGraph,
  retrieveGraphContext,
  recordMemoryEntry,
  getRepositoryOverview
} from '../memory/graphProvider.js';

export const memoryRouter = express.Router();

function sanitizeAnyError(msg) {
  return sanitizeFalkorDBError(msg);
}

/**
 * Middleware for protected health check on FalkorDB when HEALTH_CHECK_TOKEN is configured.
 * Always strips any sensitive fields from the response.
 */
export async function handleGraphHealthCheck(req, res) {
  try {
    const expectedToken = (process.env.HEALTH_CHECK_TOKEN || '').trim();
    if (expectedToken) {
      const providedToken = String(req.headers['x-health-token'] || '').trim();
      if (providedToken !== expectedToken) {
        return res.status(401).json({
          status: 'unauthorized',
          error: 'Valid x-health-token header is required.'
        });
      }
    }

    const health = await getGraphHealth();

    const safeResponse = {
      provider: health.provider,
      connected: Boolean(health.connected),
      configured: Boolean(health.configured),
      status: health.status,
      protocol: health.protocol || null,
      graph: health.graph || null,
      instanceName: health.instanceName || null,
      timestamp: health.timestamp
    };

    if (health.missing && health.missing.length > 0) {
      safeResponse.missing = health.missing;
    }
    if (health.errors && health.errors.length > 0) {
      safeResponse.errors = health.errors;
    }
    if (health.error) {
      safeResponse.error = sanitizeAnyError(health.error);
    }

    const statusCode = health.connected ? 200 : health.configured ? 503 : 200;
    return res.status(statusCode).json(safeResponse);
  } catch (err) {
    const safeMsg = sanitizeAnyError(err.message);
    return res.status(503).json({
      status: 'error',
      connected: false,
      configured: false,
      error: safeMsg
    });
  }
}

// Route health checks
memoryRouter.get('/health', handleGraphHealthCheck);

/**
 * GET /api/memory/overview?repo=owner/repo
 * Retrieves complete Project Memory overview, counts, stored records, provenance, and interactive graph subgraph
 * from FalkorDB.
 */
memoryRouter.get('/overview', async (req, res) => {
  try {
    const repo = String(req.query.repo || '').trim();
    const query = String(req.query.q || '').trim();
    const branch = String(req.query.branch || '').trim();
    const revision = String(req.query.revision || '').trim();
    const targetType = String(req.query.targetType || '').trim();
    const targetId = String(req.query.targetId || '').trim();

    if (!repo || !repo.includes('/')) {
      return res.status(400).json({ error: 'Query parameter "repo" (owner/repo) is required.' });
    }

    const sliceTarget = targetType && targetId ? { type: targetType, id: targetId } : null;

    // Enrich memory graph with provider branches, PRs, and issues when available
    let branches = [];
    let pullRequests = [];
    let issues = [];
    try {
      const adapter = resolveProvider(repo);
      let parsed;
      try {
        parsed = adapter.parseUrl(repo);
      } catch {
        const parts = repo.split('/');
        parsed = { owner: parts[0], repo: parts[1], fullName: repo, provider: adapter.name };
      }
      const [brRes, prRes, issRes] = await Promise.allSettled([
        adapter.getBranches(parsed),
        adapter.getPullRequests({ ...parsed, state: 'open', perPage: 8 }),
        adapter.getIssues({ ...parsed, state: 'open', perPage: 8 })
      ]);
      if (brRes.status === 'fulfilled' && Array.isArray(brRes.value)) branches = brRes.value;
      if (prRes.status === 'fulfilled' && Array.isArray(prRes.value)) pullRequests = prRes.value;
      if (issRes.status === 'fulfilled' && Array.isArray(issRes.value)) issues = issRes.value;
    } catch {
      // Soft fail: graph falls back to pure FalkorDB entities
    }

    const overview = await getRepositoryOverview(repo, { query, branch, revision, sliceTarget, branches, pullRequests, issues });
    return res.json(overview);
  } catch (err) {
    return res.status(500).json({ error: sanitizeAnyError(err.message) });
  }
});

/**
 * POST /api/memory/record
 * Records a Bug + Fix (+ Component/File/Commit) or TechnicalDecision into FalkorDB.
 */
memoryRouter.post('/record', async (req, res) => {
  try {
    const validation = validateActiveGraphConfig();
    if (!validation.valid) {
      return res.status(503).json({
        error: `FalkorDB Project Memory is not configured. Missing: ${validation.missing.join(', ')}.`
      });
    }

    const result = await recordMemoryEntry(req.body);
    return res.status(201).json(result);
  } catch (err) {
    const safeMsg = sanitizeAnyError(err.message);
    const status = safeMsg.includes('required') || safeMsg.includes('valid') ? 400 : 500;
    return res.status(status).json({ error: safeMsg });
  }
});

/**
 * GET /api/memory/context?repo=owner/repo&q=debugging+question
 * Retrieves bugs, fixes, technical decisions, component dependencies, symbols, and commits from FalkorDB.
 */
memoryRouter.get('/context', async (req, res) => {
  try {
    const repo = String(req.query.repo || '').trim();
    const question = String(req.query.q || '').trim();

    if (!repo || !repo.includes('/')) {
      return res.status(400).json({ error: 'Query parameter "repo" (owner/repo) is required.' });
    }

    const context = await retrieveGraphContext(repo, question);
    return res.json(context);
  } catch (err) {
    return res.status(500).json({ error: sanitizeAnyError(err.message) });
  }
});

/**
 * POST /api/memory/ingest
 * Explicitly ingests or re-ingests an analysis payload into FalkorDB.
 */
memoryRouter.post('/ingest', async (req, res) => {
  try {
    const { analysis, sourceContents, commits } = req.body || {};
    if (!analysis || !analysis.repository?.fullName) {
      return res.status(400).json({ error: 'Valid repository analysis object is required.' });
    }

    const validation = validateActiveGraphConfig();
    if (!validation.valid) {
      return res.status(503).json({
        error: `FalkorDB Project Memory is not configured. Missing: ${validation.missing.join(', ')}.`
      });
    }

    const result = await ingestRepositoryToGraph(analysis, {
      sourceContents,
      commits
    });

    if (!result.ingested) {
      return res.status(503).json(result);
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: sanitizeAnyError(err.message) });
  }
});
