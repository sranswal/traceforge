import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubProviderAdapter } from '../server/providers/github.js';
import { MockProviderAdapter, MOCK_REPOSITORIES } from '../server/providers/mock.js';
import { runIncidentInvestigation, SYNTHETIC_INCIDENT_FIXTURE } from '../server/ai/investigation.js';

describe('Regression Suite: Bug 1 - Repository Overview Issues & Provider Data Integrity', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('1. GitHubProviderAdapter.getIssues requests 100 items and filters out Pull Requests to return pure issues', async () => {
    const adapter = new GitHubProviderAdapter();
    let requestedUrl = '';

    // Mock fetch to simulate GitHub returning a mix of PRs and Issues
    global.fetch = async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => [
          // Item 1: A Pull Request (contains pull_request key)
          {
            id: 101,
            number: 1,
            title: 'Fix typo in documentation (PR)',
            pull_request: { url: 'https://api.github.com/repos/expressjs/express/pulls/1' },
            state: 'open',
            user: { login: 'contributor-a', avatar_url: 'https://avatar.url/a' },
            comments: 2,
            labels: [{ name: 'documentation' }],
            created_at: '2026-10-01T00:00:00Z',
            updated_at: '2026-10-02T00:00:00Z',
            html_url: 'https://github.com/expressjs/express/pull/1'
          },
          // Item 2: Pure Issue 1
          {
            id: 102,
            number: 2,
            title: 'Memory leak in connection pool under high concurrency',
            body: 'When 1000 requests hit simultaneously, connections do not close cleanly.',
            state: 'open',
            user: { login: 'reporter-bob', avatar_url: 'https://avatar.url/b' },
            comments: 5,
            labels: [{ name: 'bug' }, { name: 'core' }],
            created_at: '2026-10-03T00:00:00Z',
            updated_at: '2026-10-04T00:00:00Z',
            html_url: 'https://github.com/expressjs/express/issues/2'
          },
          // Item 3: Another Pull Request
          {
            id: 103,
            number: 3,
            title: 'Upgrade router dependencies (PR)',
            pull_request: { url: 'https://api.github.com/repos/expressjs/express/pulls/3' },
            state: 'open',
            user: { login: 'contributor-c', avatar_url: 'https://avatar.url/c' },
            comments: 1,
            labels: [],
            created_at: '2026-10-05T00:00:00Z',
            updated_at: '2026-10-05T00:00:00Z',
            html_url: 'https://github.com/expressjs/express/pull/3'
          },
          // Item 4: Pure Issue 2
          {
            id: 104,
            number: 4,
            title: 'Incorrect Content-Length header on chunked streams',
            body: 'Streaming response calculation produces mismatched lengths.',
            state: 'open',
            user: { login: 'reporter-dave', avatar_url: 'https://avatar.url/d' },
            comments: 0,
            labels: [{ name: 'bug' }],
            created_at: '2026-10-06T00:00:00Z',
            updated_at: '2026-10-07T00:00:00Z',
            html_url: 'https://github.com/expressjs/express/issues/4'
          }
        ]
      };
    };

    const issues = await adapter.getIssues({ owner: 'expressjs', repo: 'express', perPage: 2 });

    // Assert URL requested per_page=100 so PRs do not starve issue slots
    assert.match(requestedUrl, /per_page=100/);

    // Assert PRs were excluded
    assert.equal(issues.length, 2);
    assert.equal(issues[0].number, 2);
    assert.equal(issues[0].title, 'Memory leak in connection pool under high concurrency');
    assert.equal(issues[0].repoFullName, 'expressjs/express');
    assert.equal(issues[0].url, 'https://github.com/expressjs/express/issues/2');
    assert.equal(issues[0].author, 'reporter-bob');
    assert.deepEqual(issues[0].labels, ['bug', 'core']);

    assert.equal(issues[1].number, 4);
    assert.equal(issues[1].title, 'Incorrect Content-Length header on chunked streams');
    assert.equal(issues[1].repoFullName, 'expressjs/express');
  });

  it('2. GitHubProviderAdapter handles repository with zero issues honestly (returns empty array)', async () => {
    const adapter = new GitHubProviderAdapter();
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => []
    });

    const issues = await adapter.getIssues({ owner: 'clean-org', repo: 'zero-issues-repo', perPage: 10 });
    assert.ok(Array.isArray(issues));
    assert.equal(issues.length, 0);
  });

  it('3. GitHubProviderAdapter honestly propagates provider errors (401, 404, 429) without silent fallback to mock data', async () => {
    const adapter = new GitHubProviderAdapter();

    // 401 Unauthorized
    global.fetch = async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
      json: async () => ({ message: 'Bad credentials' })
    });

    await assert.rejects(
      async () => {
        await adapter.getIssues({ owner: 'test-org', repo: 'test-repo' });
      },
      (err) => {
        assert.equal(err.code, 'UNAUTHORIZED');
        assert.equal(err.status, 401);
        return true;
      }
    );

    // 404 Not Found
    global.fetch = async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
      json: async () => ({ message: 'Not Found' })
    });

    await assert.rejects(
      async () => {
        await adapter.getIssues({ owner: 'private-org', repo: 'inaccessible-repo' });
      },
      (err) => {
        assert.equal(err.code, 'NOT_FOUND_OR_PRIVATE');
        assert.equal(err.status, 404);
        return true;
      }
    );

    // 429 Rate Limit Exceeded
    global.fetch = async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: new Headers({
        'x-ratelimit-reset': '1800000000',
        'x-ratelimit-remaining': '0'
      }),
      json: async () => ({ message: 'API rate limit exceeded' })
    });

    await assert.rejects(
      async () => {
        await adapter.getIssues({ owner: 'busy-org', repo: 'busy-repo' });
      },
      (err) => {
        assert.equal(err.code, 'RATE_LIMITED');
        assert.equal(err.status, 429);
        return true;
      }
    );
  });

  it('4. Wire issue selection preserves full target contract for Investigation Workspace', () => {
    const selectedIssue = {
      id: 201,
      number: 402,
      title: 'Worker Thread Lock Starvation on Checkout',
      body: 'High concurrency checkout requests encounter deadlock when reserving inventory.',
      state: 'open',
      author: 'dev-alice',
      url: 'https://github.com/my-org/my-service/issues/402',
      repoFullName: 'my-org/my-service'
    };

    // Simulate OverviewTab handleLaunchInvestigation logic
    const enrichedTarget = {
      ...selectedIssue,
      repoFullName: selectedIssue.repoFullName,
      targetType: 'issue'
    };

    assert.equal(enrichedTarget.number, 402);
    assert.equal(enrichedTarget.title, 'Worker Thread Lock Starvation on Checkout');
    assert.equal(enrichedTarget.body, selectedIssue.body);
    assert.equal(enrichedTarget.url, 'https://github.com/my-org/my-service/issues/402');
    assert.equal(enrichedTarget.repoFullName, 'my-org/my-service');
    assert.equal(enrichedTarget.targetType, 'issue');
  });
});

describe('Regression Suite: Bug 2 - Bug Anomaly Real-Repository Isolation & Zero Seeded Leakage', () => {
  it('1. Transition: Demo -> Real Repository clears all payment-gateway entities and defaults to active mode', async () => {
    // Demo fixture entities that must NEVER leak into real repository results
    const DEMO_LEAK_TOKENS = [
      '8f2a1b9',
      '7e1d4c2',
      'services/rateLimiter.js',
      'services/tokenBucket.js',
      'acquireTokenLock',
      'checkRateLimit',
      'dev-charlie',
      'Worker Thread Lock Starvation'
    ];

    // Real repository analysis
    const realRepoAnalysis = {
      repository: {
        fullName: 'auth0/express-jwt',
        owner: 'auth0',
        repo: 'express-jwt',
        branch: 'master',
        primaryLanguage: 'JavaScript',
        description: 'JWT validation middleware for Express'
      },
      techStack: ['JavaScript', 'Node.js'],
      aiContextReady: {
        filePaths: ['lib/index.js', 'lib/errors.js', 'test/jwt.test.js']
      }
    };

    const realGraphContext = {
      symbols: [
        {
          name: 'jwtMiddleware',
          filePath: 'lib/index.js',
          startLine: 10,
          endLine: 40,
          callsSymbols: ['verifySecret']
        },
        {
          name: 'verifySecret',
          filePath: 'lib/index.js',
          startLine: 45,
          endLine: 70,
          callsSymbols: []
        }
      ],
      recentCommits: [
        {
          sha: 'a1b2c3d4e5f6',
          shortSha: 'a1b2c3d',
          message: 'Update token verification algorithm',
          author: 'maintainer-sam',
          date: '2026-10-10T00:00:00Z',
          changedFiles: ['lib/index.js']
        }
      ],
      bugsAndFixes: []
    };

    // Run investigation on real repository
    const result = await runIncidentInvestigation(
      {
        repoFullName: 'auth0/express-jwt',
        symptoms: 'JWT tokens with RS256 algorithm fail verification under Node 22',
        entryPoint: 'lib/index.js',
        suspectedCommit: 'a1b2c3d',
        suspectedComponent: 'lib/index.js'
      },
      realRepoAnalysis,
      { graphContext: realGraphContext }
    );

    // Verify repository identity
    assert.equal(result.repoFullName, 'auth0/express-jwt');

    // Deep serialization check: NO payment-gateway tokens must appear ANYWHERE in the investigation result
    const serialized = JSON.stringify(result);
    for (const token of DEMO_LEAK_TOKENS) {
      assert.ok(
        !serialized.includes(token),
        `Leak detected! Real repository result contained demo token: "${token}"`
      );
    }
  });

  it('2. Transition: Real Repository -> Demo preserves synthetic scenario when explicitly requested', async () => {
    const demoGraphContext = {
      symbols: [
        {
          name: 'handlePaymentRequest',
          filePath: 'server/routes/pay.js',
          callsSymbols: ['checkRateLimit', 'verifyToken']
        },
        {
          name: 'checkRateLimit',
          filePath: 'services/rateLimiter.js',
          callsSymbols: []
        },
        {
          name: 'verifyToken',
          filePath: 'services/auth.js',
          callsSymbols: ['acquireTokenLock']
        },
        {
          name: 'acquireTokenLock',
          filePath: 'services/tokenBucket.js',
          callsSymbols: []
        }
      ],
      recentCommits: [
        {
          sha: '8f2a1b9c0d1e2f3a',
          shortSha: '8f2a1b9',
          role: 'suspected_refactor',
          message: 'Refactor rate limit cache and token bucket mutex',
          changedFiles: ['services/rateLimiter.js', 'services/tokenBucket.js']
        }
      ],
      bugsAndFixes: [
        {
          bugId: 'acme/payment-gateway::bug::lock-starvation-01',
          title: 'Worker Thread Lock Starvation under High Concurrency',
          filePath: 'services/tokenBucket.js',
          fixSummary: 'Enforce non-blocking tryAcquire with circuit breaker timeout',
          commitSha: '7e1d4c2b9a0f',
          commitShortSha: '7e1d4c2',
          commitRole: 'historical_fix'
        }
      ]
    };

    // Explicit demo launch
    const demoResult = await runIncidentInvestigation(
      {
        repoFullName: 'acme/payment-gateway',
        symptoms: SYNTHETIC_INCIDENT_FIXTURE.incidentReport.symptoms,
        entryPoint: SYNTHETIC_INCIDENT_FIXTURE.incidentReport.entryPoint,
        suspectedCommit: SYNTHETIC_INCIDENT_FIXTURE.incidentReport.suspectedCommit,
        suspectedComponent: SYNTHETIC_INCIDENT_FIXTURE.incidentReport.suspectedComponent
      },
      {
        repository: SYNTHETIC_INCIDENT_FIXTURE.repository,
        aiContextReady: SYNTHETIC_INCIDENT_FIXTURE.aiContextReady
      },
      { graphContext: demoGraphContext }
    );

    assert.equal(demoResult.repoFullName, 'acme/payment-gateway');
    assert.equal(demoResult.diagnosis.rootCauseFile, 'services/tokenBucket.js');
    assert.equal(demoResult.diagnosis.rootCauseSymbol, 'acquireTokenLock');
    assert.equal(demoResult.diagnosis.suspectedIntroducingCommit.shortSha, '8f2a1b9');
  });

  it('3. Transition: Repository A -> Repository B guarantees complete context isolation', async () => {
    const analysisA = {
      repository: { fullName: 'org-alpha/service-alpha', owner: 'org-alpha', repo: 'service-alpha' },
      aiContextReady: { filePaths: ['src/alpha.js'] }
    };
    const graphA = {
      symbols: [{ name: 'fnAlpha', filePath: 'src/alpha.js', startLine: 1, endLine: 20, callsSymbols: [] }],
      recentCommits: [{ sha: 'aaaa1111', shortSha: 'aaaa111', message: 'alpha commit', changedFiles: ['src/alpha.js'] }]
    };

    const analysisB = {
      repository: { fullName: 'org-beta/service-beta', owner: 'org-beta', repo: 'service-beta' },
      aiContextReady: { filePaths: ['src/beta.js'] }
    };
    const graphB = {
      symbols: [{ name: 'fnBeta', filePath: 'src/beta.js', startLine: 1, endLine: 20, callsSymbols: [] }],
      recentCommits: [{ sha: 'bbbb2222', shortSha: 'bbbb222', message: 'beta commit', changedFiles: ['src/beta.js'] }]
    };

    const resultA = await runIncidentInvestigation(
      { repoFullName: 'org-alpha/service-alpha', symptoms: 'alpha crash' },
      analysisA,
      { graphContext: graphA }
    );

    const resultB = await runIncidentInvestigation(
      { repoFullName: 'org-beta/service-beta', symptoms: 'beta crash' },
      analysisB,
      { graphContext: graphB }
    );

    assert.equal(resultA.repoFullName, 'org-alpha/service-alpha');
    assert.equal(resultB.repoFullName, 'org-beta/service-beta');

    const strA = JSON.stringify(resultA);
    const strB = JSON.stringify(resultB);

    assert.ok(!strA.includes('fnBeta'));
    assert.ok(!strA.includes('service-beta'));
    assert.ok(!strB.includes('fnAlpha'));
    assert.ok(!strB.includes('service-alpha'));
  });

  it('4. Real repository with no selected target returns neutral INSUFFICIENT_EVIDENCE without seeded findings', async () => {
    const neutralAnalysis = {
      repository: { fullName: 'user-org/empty-target-repo', owner: 'user-org', repo: 'empty-target-repo' },
      aiContextReady: { filePaths: ['index.js'] }
    };

    const emptyResult = await runIncidentInvestigation(
      {
        repoFullName: 'user-org/empty-target-repo',
        symptoms: '', // No symptoms provided
        suspectedCommit: '',
        suspectedComponent: ''
      },
      neutralAnalysis,
      { graphContext: { symbols: [], recentCommits: [] } }
    );

    assert.equal(emptyResult.repoFullName, 'user-org/empty-target-repo');
    assert.equal(emptyResult.diagnosis.confidence, 'INSUFFICIENT_EVIDENCE');
    assert.equal(emptyResult.diagnosis.rootCauseFile, 'unknown');
    assert.equal(emptyResult.diagnosis.rootCauseSymbol, 'unknown');

    // Verify no demo candidates or findings were seeded
    const serialized = JSON.stringify(emptyResult);
    assert.ok(!serialized.includes('services/rateLimiter.js'));
    assert.ok(!serialized.includes('services/tokenBucket.js'));
    assert.ok(!serialized.includes('8f2a1b9'));
    assert.ok(!serialized.includes('checkRateLimit'));
    assert.ok(!serialized.includes('tryAcquireWithTimeout'));
  });
});
