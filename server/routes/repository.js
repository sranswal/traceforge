import express from 'express';
import { resolveProvider } from '../providers/registry.js';
import { getRepositoryOverview } from '../memory/graphProvider.js';

export const repositoryRouter = express.Router();

function getTargetRepoParams(req) {
  const repo = req.query.repo || req.query.url;
  if (!repo) {
    const err = new Error('Repository parameter (repo or url) is required.');
    err.status = 400;
    throw err;
  }

  const adapter = resolveProvider(repo);
  let parsed;
  try {
    parsed = adapter.parseUrl(repo);
  } catch {
    // If repo is just owner/repo string without url
    const parts = repo.trim().split('/');
    if (parts.length === 2) {
      parsed = {
        provider: adapter.name,
        owner: parts[0],
        repo: parts[1],
        branch: req.query.branch || null,
        fullName: `${parts[0]}/${parts[1]}`
      };
    } else {
      throw new Error(`Invalid repository identifier: ${repo}`);
    }
  }

  return { adapter, parsed };
}

// GET /api/repository/overview
repositoryRouter.get('/overview', async (req, res) => {
  try {
    const { adapter, parsed } = getTargetRepoParams(req);
    const branch = req.query.branch || parsed.branch;

    const [metadataRes, branchesRes, commitsRes, issuesRes, pullsRes] = await Promise.allSettled([
      adapter.getRepoMetadata({ ...parsed, branch }),
      adapter.getBranches(parsed),
      adapter.getCommits({ ...parsed, branch, perPage: 8 }),
      adapter.getIssues({ ...parsed, state: 'open', perPage: 5, page: 1 }),
      adapter.getPullRequests({ ...parsed, state: 'open', perPage: 5, page: 1 })
    ]);

    // Check FalkorDB indexing status
    let indexingStatus = {
      status: 'unindexed',
      lastSync: null,
      coverage: { files: 0, symbols: 0, decisions: 0, bugs: 0, fixes: 0 },
      error: null
    };

    try {
      const memOverview = await getRepositoryOverview(parsed.fullName);
      if (memOverview?.available && memOverview?.counts) {
        const counts = memOverview.counts;
        const hasIndexedContent = (counts.symbols || 0) + (counts.files || 0) > 0;
        indexingStatus = {
          status: hasIndexedContent ? 'indexed' : 'unindexed',
          lastSync: memOverview.lastSync || new Date().toISOString(),
          coverage: {
            files: counts.files || 0,
            symbols: counts.symbols || 0,
            decisions: counts.decisions || 0,
            bugs: counts.bugs || 0,
            fixes: counts.fixes || 0
          },
          error: null
        };
      }
    } catch (dbErr) {
      indexingStatus.error = dbErr?.message || 'Graph database unreachable';
    }

    const metadata = metadataRes.status === 'fulfilled' ? metadataRes.value : {
      provider: adapter.name,
      owner: parsed.owner,
      repo: parsed.repo,
      fullName: parsed.fullName,
      branch: branch || 'main',
      defaultBranch: 'main',
      url: `https://github.com/${parsed.fullName}`,
      description: 'Repository information',
      stars: 0,
      forks: 0,
      openIssuesCount: 0,
      isPrivate: false,
      primaryLanguage: 'Unknown',
      license: 'None'
    };

    return res.json({
      repository: metadata,
      indexing: indexingStatus,
      branches: {
        status: branchesRes.status === 'fulfilled' ? (branchesRes.value.length ? 'loaded' : 'empty') : 'error',
        data: branchesRes.status === 'fulfilled' ? branchesRes.value : [],
        error: branchesRes.status === 'rejected' ? branchesRes.reason?.message : null
      },
      commits: {
        status: commitsRes.status === 'fulfilled' ? (commitsRes.value.length ? 'loaded' : 'empty') : 'error',
        data: commitsRes.status === 'fulfilled' ? commitsRes.value : [],
        error: commitsRes.status === 'rejected' ? commitsRes.reason?.message : null
      },
      issues: {
        status: issuesRes.status === 'fulfilled' ? (issuesRes.value.length ? 'loaded' : 'empty') : 'error',
        data: issuesRes.status === 'fulfilled' ? issuesRes.value : [],
        error: issuesRes.status === 'rejected' ? issuesRes.reason?.message : null,
        totalCount: metadata.openIssuesCount || (issuesRes.status === 'fulfilled' ? issuesRes.value.length : 0),
        page: 1,
        perPage: 5
      },
      pullRequests: {
        status: pullsRes.status === 'fulfilled' ? (pullsRes.value.length ? 'loaded' : 'empty') : 'error',
        data: pullsRes.status === 'fulfilled' ? pullsRes.value : [],
        error: pullsRes.status === 'rejected' ? pullsRes.reason?.message : null,
        page: 1,
        perPage: 5
      }
    });
  } catch (err) {
    const status = err.status || (err.code === 'RATE_LIMITED' ? 429 : err.code === 'NOT_FOUND_OR_PRIVATE' ? 404 : 500);
    return res.status(status).json({ error: err.message, code: err.code || 'PROVIDER_ERROR' });
  }
});

// GET /api/repository/branches
repositoryRouter.get('/branches', async (req, res) => {
  try {
    const { adapter, parsed } = getTargetRepoParams(req);
    const branches = await adapter.getBranches(parsed);
    return res.json({ branches });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
});

// GET /api/repository/commits
repositoryRouter.get('/commits', async (req, res) => {
  try {
    const { adapter, parsed } = getTargetRepoParams(req);
    const branch = req.query.branch || parsed.branch;
    const page = parseInt(req.query.page || '1', 10);
    const perPage = parseInt(req.query.perPage || '15', 10);

    const commits = await adapter.getCommits({ ...parsed, branch, perPage, page });
    return res.json({ commits, branch });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
});

// GET /api/repository/issues
repositoryRouter.get('/issues', async (req, res) => {
  try {
    const { adapter, parsed } = getTargetRepoParams(req);
    const state = req.query.state || 'open';
    const page = parseInt(req.query.page || '1', 10);
    const perPage = parseInt(req.query.perPage || '5', 10);

    const issues = await adapter.getIssues({ ...parsed, state, perPage, page });
    return res.json({ issues, page, perPage, count: issues.length });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message, code: err.code || 'PROVIDER_ERROR' });
  }
});

// GET /api/repository/pulls
repositoryRouter.get('/pulls', async (req, res) => {
  try {
    const { adapter, parsed } = getTargetRepoParams(req);
    const state = req.query.state || 'open';
    const page = parseInt(req.query.page || '1', 10);
    const perPage = parseInt(req.query.perPage || '5', 10);

    const pullRequests = await adapter.getPullRequests({ ...parsed, state, perPage, page });
    return res.json({ pullRequests, page, perPage, count: pullRequests.length });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message, code: err.code || 'PROVIDER_ERROR' });
  }
});

// GET /api/repository/pr-diff
repositoryRouter.get('/pr-diff', async (req, res) => {
  try {
    const { adapter, parsed } = getTargetRepoParams(req);
    const pullNumber = req.query.pullNumber;
    if (!pullNumber) {
      return res.status(400).json({ error: 'pullNumber query parameter is required.' });
    }

    const diff = await adapter.getPullRequestDiff({ ...parsed, pullNumber });
    return res.json(diff);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
});

// GET /api/repository/indexing
repositoryRouter.get('/indexing', async (req, res) => {
  try {
    const repo = req.query.repo;
    if (!repo) {
      return res.status(400).json({ error: 'repo parameter is required.' });
    }

    const memOverview = await getRepositoryOverview(repo);
    const counts = memOverview?.counts || {};
    const hasIndexedContent = (counts.symbols || 0) + (counts.files || 0) > 0;

    return res.json({
      repoFullName: repo,
      status: hasIndexedContent ? 'indexed' : 'unindexed',
      lastSync: memOverview?.lastSync || null,
      coverage: {
        files: counts.files || 0,
        symbols: counts.symbols || 0,
        decisions: counts.decisions || 0,
        bugs: counts.bugs || 0,
        fixes: counts.fixes || 0,
        relationships: counts.relationships || 0
      },
      graphProvider: 'falkordb'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
