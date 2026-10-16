/**
 * Mock Repository Provider Adapter
 * Grounded fixture data for testing repository isolation, branch switching,
 * commits, issues, and PR reviews without network or API token dependency.
 */

import { BaseProviderAdapter } from './base.js';

export const MOCK_REPOSITORIES = {
  'acme/payment-gateway': {
    metadata: {
      provider: 'mock',
      owner: 'acme',
      repo: 'payment-gateway',
      fullName: 'acme/payment-gateway',
      branch: 'main',
      defaultBranch: 'main',
      url: 'https://github.com/acme/payment-gateway',
      description: 'Distributed payment settlement and token bucket rate limiter service',
      stars: 1840,
      forks: 312,
      openIssuesCount: 4,
      isPrivate: false,
      primaryLanguage: 'JavaScript',
      license: 'MIT'
    },
    branches: [
      { name: 'main', commitSha: '8f2a1b9c', isDefault: true, protected: true },
      { name: 'feat-circuit-breaker', commitSha: '7e1d4c2a', isDefault: false, protected: false }
    ],
    commits: [
      {
        sha: '8f2a1b9c45a7',
        shortSha: '8f2a1b9',
        message: 'Add synchronous token bucket rate limiter and lock acquisition',
        author: 'Sarah Chen',
        date: '2026-03-12T14:22:00Z',
        url: 'https://github.com/acme/payment-gateway/commit/8f2a1b9c45a7'
      },
      {
        sha: '3a9b1c0d89ef',
        shortSha: '3a9b1c0',
        message: 'Initial payment gateway orchestrator with routing tables',
        author: 'Alex Vance',
        date: '2026-03-10T09:15:00Z',
        url: 'https://github.com/acme/payment-gateway/commit/3a9b1c0d89ef'
      }
    ],
    issues: [
      {
        id: 101,
        number: 101,
        title: 'Worker thread starvation under burst payment volume',
        body: 'During peak processing windows, synchronous locks in tokenBucket.js cause queue backup and 504 timeouts.',
        state: 'open',
        author: 'ops-lead',
        commentsCount: 5,
        labels: ['incident', 'performance', 'critical'],
        createdAt: '2026-03-14T10:00:00Z',
        updatedAt: '2026-03-14T12:00:00Z',
        url: 'https://github.com/acme/payment-gateway/issues/101'
      }
    ],
    pullRequests: [
      {
        id: 12,
        number: 12,
        title: 'Implement non-blocking acquireTokenLock with timeout',
        body: 'Replaces synchronous lock spin with bounded timeout promise to prevent worker thread hang.',
        state: 'open',
        author: 'schen',
        base: 'main',
        head: 'feat-circuit-breaker',
        baseSha: '3a9b1c0d89ef',
        headSha: '7e1d4c2a98cb',
        draft: false,
        createdAt: '2026-03-14T14:00:00Z',
        updatedAt: '2026-03-14T15:30:00Z',
        url: 'https://github.com/acme/payment-gateway/pull/12'
      }
    ],
    prDiff: {
      pullNumber: 12,
      rawDiff: `diff --git a/services/tokenBucket.js b/services/tokenBucket.js
--- a/services/tokenBucket.js
+++ b/services/tokenBucket.js
@@ -45,3 +45,5 @@
-  acquireTokenLockSync();
+  await acquireTokenLockAsync({ timeoutMs: 500 });
`,
      changedFiles: [
        {
          filename: 'services/tokenBucket.js',
          status: 'modified',
          additions: 4,
          deletions: 1,
          changes: 5,
          patch: '-  acquireTokenLockSync();\n+  await acquireTokenLockAsync({ timeoutMs: 500 });'
        }
      ],
      totalFilesChanged: 1
    },
    files: [
      { path: 'services/paymentOrchestrator.js', size: 3420 },
      { path: 'services/tokenBucket.js', size: 1980 },
      { path: 'package.json', size: 850 }
    ]
  },

  'ecommerce/order-service': {
    metadata: {
      provider: 'mock',
      owner: 'ecommerce',
      repo: 'order-service',
      fullName: 'ecommerce/order-service',
      branch: 'main',
      defaultBranch: 'main',
      url: 'https://github.com/ecommerce/order-service',
      description: 'Cart checkout and idempotent order processing pipeline',
      stars: 420,
      forks: 85,
      openIssuesCount: 2,
      isPrivate: false,
      primaryLanguage: 'TypeScript',
      license: 'Apache-2.0'
    },
    branches: [
      { name: 'main', commitSha: 'c4d2e10f', isDefault: true, protected: true },
      { name: 'fix-idempotency', commitSha: 'a1b2c3d4', isDefault: false, protected: false }
    ],
    commits: [
      {
        sha: 'c4d2e10f8721',
        shortSha: 'c4d2e10',
        message: 'Enforce idempotency key check on order checkout pipeline',
        author: 'Elena Gomez',
        date: '2026-03-11T16:45:00Z',
        url: 'https://github.com/ecommerce/order-service/commit/c4d2e10f8721'
      },
      {
        sha: 'b1a2f3c4d5e6',
        shortSha: 'b1a2f3c',
        message: 'Setup Kafka event publisher for confirmed orders',
        author: 'Marcus Brody',
        date: '2026-03-08T11:20:00Z',
        url: 'https://github.com/ecommerce/order-service/commit/b1a2f3c4d5e6'
      }
    ],
    issues: [
      {
        id: 205,
        number: 205,
        title: 'Duplicate charges generated on rapid checkout double-click',
        body: 'Checkout controller does not check idempotency before invoking Stripe charge helper.',
        state: 'open',
        author: 'support-agent',
        commentsCount: 3,
        labels: ['bug', 'checkout', 'p0'],
        createdAt: '2026-03-13T08:30:00Z',
        updatedAt: '2026-03-13T10:15:00Z',
        url: 'https://github.com/ecommerce/order-service/issues/205'
      }
    ],
    pullRequests: [
      {
        id: 44,
        number: 44,
        title: 'Add Redis distributed lock for order checkout deduplication',
        body: 'Ensures concurrent requests with identical idempotencyKey fail fast with HTTP 409.',
        state: 'open',
        author: 'egomez',
        base: 'main',
        head: 'fix-idempotency',
        baseSha: 'b1a2f3c4d5e6',
        headSha: 'a1b2c3d4e5f6',
        draft: false,
        createdAt: '2026-03-13T12:00:00Z',
        updatedAt: '2026-03-13T13:45:00Z',
        url: 'https://github.com/ecommerce/order-service/pull/44'
      }
    ],
    prDiff: {
      pullNumber: 44,
      rawDiff: `diff --git a/src/controllers/checkoutController.ts b/src/controllers/checkoutController.ts
--- a/src/controllers/checkoutController.ts
+++ b/src/controllers/checkoutController.ts
@@ -20,3 +20,6 @@
+  const lockAcquired = await redisLock.acquire(idempotencyKey);
+  if (!lockAcquired) throw new ConflictError('Order already in process');
`,
      changedFiles: [
        {
          filename: 'src/controllers/checkoutController.ts',
          status: 'modified',
          additions: 6,
          deletions: 0,
          changes: 6,
          patch: '+  const lockAcquired = await redisLock.acquire(idempotencyKey);\n+  if (!lockAcquired) throw new ConflictError(\'Order already in process\');'
        }
      ],
      totalFilesChanged: 1
    },
    files: [
      { path: 'src/controllers/checkoutController.ts', size: 4120 },
      { path: 'src/services/orderValidator.ts', size: 2890 },
      { path: 'package.json', size: 920 }
    ]
  }
};

export class MockProviderAdapter extends BaseProviderAdapter {
  constructor(customRepos = {}) {
    super('mock');
    this.repositories = { ...MOCK_REPOSITORIES, ...customRepos };
  }

  setRepositoryData(repoFullName, data) {
    this.repositories[repoFullName.toLowerCase()] = data;
  }

  parseUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('Please provide a valid repository URL.');
    }
    const cleanUrl = url.trim().replace(/\/+$/, '');
    const parts = cleanUrl.split('/').slice(-2);
    if (parts.length < 2) {
      throw new Error('Invalid repository identifier. Expected format: owner/repo');
    }
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, '');
    return {
      provider: 'mock',
      owner,
      repo,
      branch: 'main',
      fullName: `${owner}/${repo}`
    };
  }

  _getRepo(owner, repo) {
    const fullName = `${owner}/${repo}`.toLowerCase();
    const data = this.repositories[fullName];
    if (!data) {
      const err = new Error(`Mock repository ${fullName} not found`);
      err.code = 'NOT_FOUND_OR_PRIVATE';
      err.status = 404;
      throw err;
    }
    return data;
  }

  async getRepoMetadata({ owner, repo, branch }) {
    const data = this._getRepo(owner, repo);
    return {
      ...data.metadata,
      branch: branch || data.metadata.branch || data.metadata.defaultBranch
    };
  }

  async getBranches({ owner, repo }) {
    const data = this._getRepo(owner, repo);
    return data.branches || [];
  }

  async getCommits({ owner, repo, branch, perPage = 10, page = 1 }) {
    const data = this._getRepo(owner, repo);
    return (data.commits || []).slice((page - 1) * perPage, page * perPage);
  }

  async getIssues({ owner, repo, state = 'open', perPage = 10, page = 1 }) {
    const data = this._getRepo(owner, repo);
    const filtered = (data.issues || []).filter(i => state === 'all' || i.state === state);
    return filtered.slice((page - 1) * perPage, page * perPage);
  }

  async getPullRequests({ owner, repo, state = 'open', perPage = 10, page = 1 }) {
    const data = this._getRepo(owner, repo);
    const filtered = (data.pullRequests || []).filter(pr => state === 'all' || pr.state === state);
    return filtered.slice((page - 1) * perPage, page * perPage);
  }

  async getPullRequestDiff({ owner, repo, pullNumber }) {
    const data = this._getRepo(owner, repo);
    if (data.prDiff && Number(data.prDiff.pullNumber) === Number(pullNumber)) {
      return data.prDiff;
    }
    return {
      pullNumber: Number(pullNumber),
      rawDiff: '',
      changedFiles: [],
      totalFilesChanged: 0
    };
  }

  async getFileContent({ owner, repo, path }) {
    const data = this._getRepo(owner, repo);
    const file = (data.files || []).find(f => f.path === path);
    if (!file) throw new Error(`File ${path} not found in mock repository`);
    return file.content || `// Content for ${path}`;
  }

  async getTree({ owner, repo }) {
    const data = this._getRepo(owner, repo);
    return {
      tree: (data.files || []).map(f => ({ path: f.path, type: 'blob', size: f.size || 100 }))
    };
  }

  async fetchFullScan({ owner, repo, branch }) {
    const metadata = await this.getRepoMetadata({ owner, repo, branch });
    const branches = await this.getBranches({ owner, repo });
    const commits = await this.getCommits({ owner, repo, branch: metadata.branch });
    const issues = await this.getIssues({ owner, repo, state: 'open' });
    const pullRequests = await this.getPullRequests({ owner, repo, state: 'open' });
    const data = this._getRepo(owner, repo);

    return {
      repoInfo: metadata,
      files: data.files || [],
      directories: [],
      extensions: { '.js': 2, '.json': 1 },
      manifests: {},
      totalFiles: (data.files || []).length,
      totalDirectories: 1,
      providerData: {
        provider: 'mock',
        branches: { status: 'loaded', data: branches, error: null },
        commits: { status: 'loaded', data: commits, error: null },
        issues: { status: 'loaded', data: issues, error: null },
        pullRequests: { status: 'loaded', data: pullRequests, error: null }
      }
    };
  }
}

export const mockAdapter = new MockProviderAdapter();
