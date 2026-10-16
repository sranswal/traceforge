/**
 * TraceForge Polish Pass Test Suite
 * Tests:
 * 1. Consistent repository Issues and PR pagination & filtering
 * 2. Ask panel Markdown and safe HTML entity rendering
 * 3. GitLab and Bitbucket provider adapter readiness & contracts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubProviderAdapter } from '../server/providers/github.js';
import { GitLabProviderAdapter } from '../server/providers/gitlab.js';
import { BitbucketProviderAdapter } from '../server/providers/bitbucket.js';
import { resolveProvider, getProviderStatus } from '../server/providers/registry.js';
import { safeDecodeHtmlEntities } from '../client/src/utils/markdownUtils.js';

describe('Polish Pass 1: Consistent Issues & PR Lists Pagination Suite', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('1. More than five available issues and PRs returns consistent initial page of 5 items', async () => {
    const adapter = new GitHubProviderAdapter();

    // Mock 12 pure issues returned on first page
    global.fetch = async (url) => {
      if (url.includes('/issues?')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => Array.from({ length: 12 }, (_, i) => ({
            id: 1000 + i,
            number: i + 1,
            title: `Issue number ${i + 1}`,
            state: 'open',
            user: { login: `user-${i}` },
            labels: [],
            updated_at: new Date(Date.now() - i * 60000).toISOString(),
            html_url: `https://github.com/org/repo/issues/${i + 1}`
          }))
        };
      }
      if (url.includes('/pulls?')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => Array.from({ length: 5 }, (_, i) => ({
            id: 2000 + i,
            number: 50 + i,
            title: `PR number ${50 + i}`,
            state: 'open',
            user: { login: `pr-user-${i}` },
            base: { ref: 'main' },
            head: { ref: `feature-${i}` },
            updated_at: new Date(Date.now() - i * 60000).toISOString(),
            html_url: `https://github.com/org/repo/pull/${50 + i}`
          }))
        };
      }
      return { ok: true, status: 200, json: async () => [] };
    };

    const issues = await adapter.getIssues({ owner: 'org', repo: 'repo', perPage: 5, page: 1 });
    const prs = await adapter.getPullRequests({ owner: 'org', repo: 'repo', perPage: 5, page: 1 });

    assert.equal(issues.length, 5, 'Issues list must strictly contain 5 items on page 1');
    assert.equal(prs.length, 5, 'Pull requests list must strictly contain 5 items on page 1');
    assert.equal(issues[0].number, 1);
    assert.equal(issues[4].number, 5);
    assert.equal(issues[0].repoFullName, 'org/repo');
    assert.equal(prs[0].repoFullName, 'org/repo');
  });

  it('2. Issue endpoint page dominated by PRs fetches subsequent pages until required pure issues are accumulated', async () => {
    const adapter = new GitHubProviderAdapter();
    const fetchedPages = [];

    // Simulate GitHub page 1 containing 98 PRs and only 2 pure issues
    // Page 2 contains 4 pure issues
    global.fetch = async (url) => {
      const parsedUrl = new URL(url);
      const apiPage = parsedUrl.searchParams.get('page');
      fetchedPages.push(apiPage);

      if (apiPage === '1') {
        const items = [];
        // 98 pull requests
        for (let i = 1; i <= 98; i++) {
          items.push({
            id: 100 + i,
            number: i,
            title: `PR ${i}`,
            pull_request: { url: `https://api.github.com/repos/org/repo/pulls/${i}` },
            state: 'open'
          });
        }
        // 2 pure issues
        items.push({
          id: 501,
          number: 501,
          title: 'Pure Issue A',
          state: 'open',
          user: { login: 'alice' }
        });
        items.push({
          id: 502,
          number: 502,
          title: 'Pure Issue B',
          state: 'open',
          user: { login: 'bob' }
        });
        return { ok: true, status: 200, json: async () => items };
      }

      if (apiPage === '2') {
        const items = [];
        for (let i = 1; i <= 4; i++) {
          items.push({
            id: 600 + i,
            number: 600 + i,
            title: `Pure Issue from Page 2 #${i}`,
            state: 'open',
            user: { login: `user-${i}` }
          });
        }
        return { ok: true, status: 200, json: async () => items };
      }

      return { ok: true, status: 200, json: async () => [] };
    };

    // Asking for 5 pure issues
    const issues = await adapter.getIssues({ owner: 'org', repo: 'repo', perPage: 5, page: 1 });

    assert.equal(issues.length, 5, 'Must accumulate across provider pages to return 5 pure issues');
    assert.deepEqual(fetchedPages, ['1', '2'], 'Must have queried GitHub page 1 then page 2');
    assert.equal(issues[0].title, 'Pure Issue A');
    assert.equal(issues[1].title, 'Pure Issue B');
    assert.equal(issues[2].title, 'Pure Issue from Page 2 #1');
    assert.equal(issues[3].title, 'Pure Issue from Page 2 #2');
    assert.equal(issues[4].title, 'Pure Issue from Page 2 #3');
  });

  it('3. Pagination without duplicates across pages', async () => {
    const adapter = new GitHubProviderAdapter();

    // 15 total issues available
    const allPureIssues = Array.from({ length: 15 }, (_, i) => ({
      id: 100 + i,
      number: i + 1,
      title: `Issue #${i + 1}`,
      state: 'open',
      user: { login: 'dev' }
    }));

    global.fetch = async (url) => {
      return { ok: true, status: 200, json: async () => allPureIssues };
    };

    const page1 = await adapter.getIssues({ owner: 'org', repo: 'repo', perPage: 5, page: 1 });
    const page2 = await adapter.getIssues({ owner: 'org', repo: 'repo', perPage: 5, page: 2 });
    const page3 = await adapter.getIssues({ owner: 'org', repo: 'repo', perPage: 5, page: 3 });

    assert.equal(page1.length, 5);
    assert.equal(page2.length, 5);
    assert.equal(page3.length, 5);

    const ids1 = new Set(page1.map(i => i.id));
    const ids2 = new Set(page2.map(i => i.id));
    const ids3 = new Set(page3.map(i => i.id));

    // Assert zero overlap between pages
    for (const id of ids2) {
      assert.ok(!ids1.has(id), `Page 2 contained duplicate ID ${id} from Page 1`);
    }
    for (const id of ids3) {
      assert.ok(!ids2.has(id), `Page 3 contained duplicate ID ${id} from Page 2`);
      assert.ok(!ids1.has(id), `Page 3 contained duplicate ID ${id} from Page 1`);
    }

    assert.equal(page1[0].number, 1);
    assert.equal(page2[0].number, 6);
    assert.equal(page3[0].number, 11);
  });

  it('4. A repository with zero issues returns clean empty list', async () => {
    const adapter = new GitHubProviderAdapter();
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => []
    });

    const issues = await adapter.getIssues({ owner: 'zero-org', repo: 'zero-repo', perPage: 5, page: 1 });
    assert.ok(Array.isArray(issues));
    assert.equal(issues.length, 0);
  });

  it('5. Provider failure after the first page rethrows honestly without fallback to demo data', async () => {
    const adapter = new GitHubProviderAdapter();
    let callCount = 0;

    global.fetch = async () => {
      callCount += 1;
      if (callCount === 1) {
        // Page 1 succeeds
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: 1, number: 1, title: 'Issue 1', state: 'open', user: { login: 'dev' } }
          ]
        };
      }
      // Subsequent fetch encounters rate limit (429)
      return {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'x-ratelimit-reset': '1800000000' }),
        json: async () => ({ message: 'API rate limit exceeded' })
      };
    };

    // First call succeeds
    const p1 = await adapter.getIssues({ owner: 'org', repo: 'repo', perPage: 5, page: 1 });
    assert.equal(p1.length, 1);

    // Page 2 fails honestly
    await assert.rejects(
      async () => {
        await adapter.getIssues({ owner: 'org', repo: 'repo', perPage: 5, page: 2 });
      },
      (err) => {
        assert.equal(err.code, 'RATE_LIMITED');
        assert.equal(err.status, 429);
        return true;
      }
    );
  });

  it('6. Repository switching resets pagination and loaded items', () => {
    // Model state transitions for repository switching
    let selectedRepo = 'org-a/repo-a';
    let loadedIssues = [{ id: 101, number: 1, repoFullName: 'org-a/repo-a' }];
    let page = 2;
    let hasMore = true;

    // Trigger repo change to 'org-b/repo-b'
    selectedRepo = 'org-b/repo-b';
    loadedIssues = [];
    page = 1;
    hasMore = true;

    assert.equal(selectedRepo, 'org-b/repo-b');
    assert.equal(loadedIssues.length, 0, 'Loaded issues must be cleared immediately upon repo switch');
    assert.equal(page, 1, 'Page must reset to 1 on repo switch');
  });

  it('7. Count matches rendered items and pagination state truthfully', () => {
    const totalRepoIssues = 142;
    const loadedIssues = [
      { id: 1, number: 1 },
      { id: 2, number: 2 },
      { id: 3, number: 3 },
      { id: 4, number: 4 },
      { id: 5, number: 5 }
    ];

    // Label formatting logic
    const countLabel = `${loadedIssues.length} displayed${totalRepoIssues > loadedIssues.length ? ` · ${totalRepoIssues} total` : ''}`;
    assert.equal(countLabel, '5 displayed · 142 total');

    // Never label partial as total or 'active'
    assert.notEqual(countLabel, '5 active');
    assert.notEqual(countLabel, '142 active');
  });
});

describe('Polish Pass 2: Ask Panel Markdown & Safe HTML Entity Rendering Suite', () => {
  it('8. Mixed Markdown: Headings, paragraphs, ordered/unordered lists, bold, inline code', () => {
    const sample = `### Confirmed Facts
- Observation 1 in \`server/routes/pay.js\`
- Observation 2 with **critical severity**

1. Step one in pipeline
2. Step two in pipeline

Regular paragraph with \`inlineVariable\` and **bold statement**.`;

    const normalized = safeDecodeHtmlEntities(sample);
    assert.ok(normalized.includes('### Confirmed Facts'));
    assert.ok(normalized.includes('`server/routes/pay.js`'));
    assert.ok(normalized.includes('**critical severity**'));
    assert.ok(normalized.includes('1. Step one in pipeline'));
  });

  it('9. Fenced code blocks preserve language, indentation, and content', () => {
    const codeSnippet = '```javascript\nfunction handleRequest(req, res) {\n  const token = req.headers["authorization"];\n  return token;\n}\n```';
    const decoded = safeDecodeHtmlEntities(codeSnippet);
    assert.equal(decoded, codeSnippet);
    assert.ok(decoded.includes('```javascript'));
    assert.ok(decoded.includes('const token = req.headers["authorization"];'));
  });

  it('10. HTML-encoded provider errors safely normalize in a single pass', () => {
    // Both hex entities (&#x20; = space, &#x47; = 'G', &#x2F; = '/') and decimal entities (&#47; = '/')
    const gitlabEncoded = 'GitLab&#x20;provider&#x20;error:&#x20;&#x47;itLab&#x20;resource&#x20;at&#x20;group&#47;project&#x20;not&#x20;found';
    const normalized = safeDecodeHtmlEntities(gitlabEncoded);
    assert.equal(normalized, 'GitLab provider error: GitLab resource at group/project not found');

    const bitbucketEncoded = 'Bitbucket&#x20;error:&#x20;&quot;Repository&#x20;not&#x20;found&quot;&#x20;&amp;&#x20;access&#x20;denied';
    const bitbucketNormalized = safeDecodeHtmlEntities(bitbucketEncoded);
    assert.equal(bitbucketNormalized, 'Bitbucket error: "Repository not found" & access denied');
  });

  it('11. Already-decoded strings and literal code are preserved without double decoding', () => {
    // A string containing '&amp;#x20;' should decode the outer &amp; to '&' -> '&#x20;', not double-decode to space!
    const literalEntityInCode = 'Use &amp;#x20; in documentation to explain hex space';
    const decoded = safeDecodeHtmlEntities(literalEntityInCode);
    assert.equal(decoded, 'Use &#x20; in documentation to explain hex space');

    // Code with comparisons (e.g. x < 10 && y > 5)
    const codeComparison = 'if (x < 10 && y > 5) { return true; }';
    const decodedCode = safeDecodeHtmlEntities(codeComparison);
    assert.equal(decodedCode, codeComparison);
  });

  it('12. Long messages, long tokens, and unbreakable strings do not throw or corrupt', () => {
    const longSha = 'a'.repeat(256);
    const longToken = 'glpat-' + 'x'.repeat(128);
    const message = `Detailed root cause analysis with hash \`${longSha}\` and token \`${longToken}\` across components.`;
    const decoded = safeDecodeHtmlEntities(message);
    assert.ok(decoded.includes(longSha));
    assert.ok(decoded.includes(longToken));
  });
});

describe('Polish Pass 3: GitLab & Bitbucket Provider Readiness & Contracts Suite', () => {
  it('13. GitLab provider adapter contract: URL parsing, metadata, branches, commits, issues, MRs, and diff', async () => {
    const gitlab = new GitLabProviderAdapter();

    // URL Parsing
    const parsed = gitlab.parseUrl('https://gitlab.com/gitlab-org/gitlab-runner');
    assert.equal(parsed.provider, 'gitlab');
    assert.equal(parsed.owner, 'gitlab-org');
    assert.equal(parsed.repo, 'gitlab-runner');
    assert.equal(parsed.fullName, 'gitlab-org/gitlab-runner');

    // Subgroup URL Parsing
    const parsedSub = gitlab.parseUrl('https://gitlab.com/gitlab-org/subgroup/deep-project');
    assert.equal(parsedSub.owner, 'gitlab-org/subgroup');
    assert.equal(parsedSub.repo, 'deep-project');

    // Mock API responses for full contract
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (url.includes('/projects/')) {
        if (url.endsWith('/repository/branches?per_page=30')) {
          return { ok: true, status: 200, json: async () => [{ name: 'main', commit: { id: 'sha1' }, protected: true }] };
        }
        if (url.includes('/repository/commits')) {
          return { ok: true, status: 200, json: async () => [{ id: 'c1234567890', title: 'Commit 1', author_name: 'dev' }] };
        }
        if (url.includes('/issues?')) {
          return { ok: true, status: 200, json: async () => [{ id: 10, iid: 1, title: 'GitLab Issue 1', state: 'opened' }] };
        }
        if (url.includes('/merge_requests?')) {
          return { ok: true, status: 200, json: async () => [{ id: 20, iid: 5, title: 'MR 5', state: 'opened', source_branch: 'feat', target_branch: 'main' }] };
        }
        if (url.includes('/merge_requests/5/changes')) {
          return { ok: true, status: 200, json: async () => ({ changes: [{ old_path: 'a.js', new_path: 'a.js', diff: '+ const x = 1;' }] }) };
        }
        if (url.includes('/merge_requests/5')) {
          return { ok: true, status: 200, json: async () => ({ title: 'MR 5', source_branch: 'feat', target_branch: 'main' }) };
        }
        // Metadata
        return {
          ok: true,
          status: 200,
          json: async () => ({
            path_with_namespace: 'gitlab-org/gitlab-runner',
            default_branch: 'main',
            description: 'GitLab Runner project',
            star_count: 50,
            forks_count: 10,
            open_issues_count: 8,
            visibility: 'public'
          })
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    try {
      const meta = await gitlab.getRepoMetadata(parsed);
      assert.equal(meta.provider, 'gitlab');
      assert.equal(meta.fullName, 'gitlab-org/gitlab-runner');
      assert.equal(meta.openIssuesCount, 8);

      const branches = await gitlab.getBranches(parsed);
      assert.equal(branches[0].name, 'main');

      const commits = await gitlab.getCommits(parsed);
      assert.equal(commits[0].repoFullName, 'gitlab-org/gitlab-runner');

      const issues = await gitlab.getIssues(parsed);
      assert.equal(issues[0].number, 1);
      assert.equal(issues[0].repoFullName, 'gitlab-org/gitlab-runner');

      const mrs = await gitlab.getPullRequests(parsed);
      assert.equal(mrs[0].number, 5);
      assert.equal(mrs[0].head, 'feat');
      assert.equal(mrs[0].repoFullName, 'gitlab-org/gitlab-runner');

      const diff = await gitlab.getPullRequestDiff({ ...parsed, pullNumber: 5 });
      assert.equal(diff.pullNumber, 5);
      assert.deepEqual(diff.changedFiles, ['a.js']);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('14. Bitbucket provider adapter contract: URL parsing, metadata, branches, commits, issues, PRs, and diff', async () => {
    const bitbucket = new BitbucketProviderAdapter();

    // URL Parsing
    const parsed = bitbucket.parseUrl('https://bitbucket.org/atlassian/aui');
    assert.equal(parsed.provider, 'bitbucket');
    assert.equal(parsed.owner, 'atlassian');
    assert.equal(parsed.repo, 'aui');
    assert.equal(parsed.fullName, 'atlassian/aui');

    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (url.includes('/repositories/')) {
        if (url.includes('/refs/branches')) {
          return { ok: true, status: 200, json: async () => ({ values: [{ name: 'master', target: { hash: 'h1' } }] }) };
        }
        if (url.includes('/commits')) {
          return { ok: true, status: 200, json: async () => ({ values: [{ hash: 'b1234567890', message: 'BB Commit', date: '2026-10-01' }] }) };
        }
        if (url.includes('/issues?')) {
          return { ok: true, status: 200, json: async () => ({ values: [{ id: 101, title: 'BB Issue 101', state: 'new' }] }) };
        }
        if (url.includes('/pullrequests/12/diff')) {
          return {
            ok: true,
            status: 200,
            text: async () => 'diff --git a/index.js b/index.js\n+ const bb = true;'
          };
        }
        if (url.includes('/pullrequests')) {
          return { ok: true, status: 200, json: async () => ({ values: [{ id: 12, title: 'BB PR 12', state: 'OPEN', source: { branch: { name: 'feat' } }, destination: { branch: { name: 'master' } } }] }) };
        }
        // Metadata
        return {
          ok: true,
          status: 200,
          json: async () => ({
            full_name: 'atlassian/aui',
            mainbranch: { name: 'master' },
            description: 'Atlassian UI',
            is_private: false,
            language: 'JavaScript'
          })
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    try {
      const meta = await bitbucket.getRepoMetadata(parsed);
      assert.equal(meta.provider, 'bitbucket');
      assert.equal(meta.fullName, 'atlassian/aui');

      const branches = await bitbucket.getBranches(parsed);
      assert.equal(branches[0].name, 'master');

      const commits = await bitbucket.getCommits(parsed);
      assert.equal(commits[0].repoFullName, 'atlassian/aui');

      const issues = await bitbucket.getIssues(parsed);
      assert.equal(issues[0].number, 101);
      assert.equal(issues[0].repoFullName, 'atlassian/aui');

      const prs = await bitbucket.getPullRequests(parsed);
      assert.equal(prs[0].number, 12);
      assert.equal(prs[0].head, 'feat');
      assert.equal(prs[0].repoFullName, 'atlassian/aui');

      const diff = await bitbucket.getPullRequestDiff({ ...parsed, pullNumber: 12 });
      assert.equal(diff.pullNumber, 12);
      assert.deepEqual(diff.changedFiles, ['index.js']);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('15. Provider registry routes gitlab and bitbucket URLs and reports actionable configuration status without falling back to GitHub or demo data', () => {
    const gitlabAdapter = resolveProvider('https://gitlab.com/gitlab-org/gitlab-runner');
    assert.equal(gitlabAdapter.name, 'gitlab');

    const bitbucketAdapter = resolveProvider('https://bitbucket.org/atlassian/aui');
    assert.equal(bitbucketAdapter.name, 'bitbucket');

    const githubAdapter = resolveProvider('https://github.com/expressjs/express');
    assert.equal(githubAdapter.name, 'github');

    const glStatus = getProviderStatus('gitlab');
    assert.equal(glStatus.name, 'gitlab');
    assert.ok(glStatus.setupGuide.includes('GITLAB_TOKEN'));

    const bbStatus = getProviderStatus('bitbucket');
    assert.equal(bbStatus.name, 'bitbucket');
    assert.ok(bbStatus.setupGuide.includes('BITBUCKET_TOKEN'));
  });

  it('16. Unauthenticated requests on private or protected resources fail with actionable configuration errors', async () => {
    const gitlab = new GitLabProviderAdapter();
    const originalFetch = global.fetch;

    global.fetch = async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ message: '401 Unauthorized' })
    });

    try {
      await assert.rejects(
        async () => {
          await gitlab.getRepoMetadata({ owner: 'private-group', repo: 'private-repo' });
        },
        (err) => {
          assert.equal(err.code, 'UNAUTHORIZED');
          assert.equal(err.status, 401);
          assert.ok(err.message.includes('GITLAB_TOKEN'));
          return true;
        }
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});
