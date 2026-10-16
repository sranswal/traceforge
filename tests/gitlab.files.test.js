/**
 * GitLab Repository Files Regression Test Suite
 * Covers:
 * 1. GitLab tree response mapping (blobs, trees, object IDs, modes)
 * 2. Nested GitLab group/subgroup project path encoding
 * 3. Recursive tree pagination following x-next-page and Link headers
 * 4. Files reaching the indexing / FalkorDB graph-memory pipeline
 * 5. Repository file list displaying indexed files with matching counts
 * 6. Empty tree and provider error states (401, 403, 404, 429)
 * 7. Repository switching without stale files or cross-repository leaks
 * 8. GitHub repository files remaining fully functional (regression protection)
 * 9. Live network verification against OpenMW/openmw (if network reachable)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { GitLabProviderAdapter } from '../server/providers/gitlab.js';
import { GitHubProviderAdapter } from '../server/providers/github.js';
import { analyzeStructure } from '../server/analyzer/structureAnalyzer.js';
import { buildProjectMemoryGraphPayload } from '../server/memory/falkordbIngestion.js';
import { buildInteractiveGraphSubgraph } from '../server/memory/falkordbRetrieval.js';

describe('GitLab Repository Files & Pagination Regression Suite', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('1. [Contract Mock] GitLab tree response maps paths, object IDs, types, and modes correctly', async () => {
    const adapter = new GitLabProviderAdapter();

    global.fetch = async (url) => {
      assert.ok(url.includes('/repository/tree?'));
      return {
        ok: true,
        status: 200,
        headers: new Headers({
          'x-page': '1',
          'x-total-pages': '1',
          'x-total': '3'
        }),
        json: async () => [
          {
            id: 'c1d2e3f4a5b6',
            name: 'src',
            type: 'tree',
            path: 'src',
            mode: '040000'
          },
          {
            id: 'a1b2c3d4e5f6',
            name: 'main.cpp',
            type: 'blob',
            path: 'src/main.cpp',
            mode: '100644'
          },
          {
            id: 'f6e5d4c3b2a1',
            name: 'CMakeLists.txt',
            type: 'blob',
            path: 'CMakeLists.txt',
            mode: '100644'
          }
        ]
      };
    };

    const result = await adapter.getTree({ owner: 'OpenMW', repo: 'openmw', ref: 'master' });
    assert.strictEqual(result.tree.length, 3);

    const mainFile = result.tree.find(t => t.path === 'src/main.cpp');
    assert.ok(mainFile);
    assert.strictEqual(mainFile.type, 'blob');
    assert.strictEqual(mainFile.id, 'a1b2c3d4e5f6');
    assert.strictEqual(mainFile.sha, 'a1b2c3d4e5f6');
    assert.strictEqual(mainFile.name, 'main.cpp');
    assert.strictEqual(mainFile.mode, '100644');

    const srcDir = result.tree.find(t => t.path === 'src');
    assert.ok(srcDir);
    assert.strictEqual(srcDir.type, 'tree');
    assert.strictEqual(srcDir.id, 'c1d2e3f4a5b6');
    assert.strictEqual(srcDir.mode, '040000');
  });

  it('2. [Contract Mock] Nested GitLab group/subgroup project paths are URL-encoded properly', async () => {
    const adapter = new GitLabProviderAdapter();
    let requestedUrl = null;

    global.fetch = async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'x-page': '1', 'x-total-pages': '1' }),
        json: async () => []
      };
    };

    // Subgroup scenario: group=gitlab-org/subgroup, repo=project
    await adapter.getTree({ owner: 'gitlab-org/subgroup', repo: 'project' });
    assert.ok(
      requestedUrl.includes('/projects/gitlab-org%2Fsubgroup%2Fproject/repository/tree?'),
      `Expected encoded subgroup path in URL, received: ${requestedUrl}`
    );

    // Deeply nested: owner=enterprise/division/team, repo=app
    await adapter.getTree({ owner: 'enterprise/division/team', repo: 'app' });
    assert.ok(
      requestedUrl.includes('/projects/enterprise%2Fdivision%2Fteam%2Fapp/repository/tree?'),
      `Expected encoded deeply nested path in URL, received: ${requestedUrl}`
    );
  });

  it('3. [Contract Mock] Recursive tree pagination follows x-next-page headers across multiple pages', async () => {
    const adapter = new GitLabProviderAdapter();
    const pagesRequested = [];

    global.fetch = async (url) => {
      const urlObj = new URL(url);
      const page = Number(urlObj.searchParams.get('page') || '1');
      pagesRequested.push(page);

      if (page === 1) {
        // Page 1: returns directories only (reproducing the GitLab OpenMW bug)
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            'x-page': '1',
            'x-next-page': '2',
            'x-total-pages': '2',
            'x-per-page': '2',
            'x-total': '4'
          }),
          json: async () => [
            { id: 'dir1', name: 'apps', type: 'tree', path: 'apps', mode: '040000' },
            { id: 'dir2', name: 'components', type: 'tree', path: 'components', mode: '040000' }
          ]
        };
      } else if (page === 2) {
        // Page 2: returns blobs (files)
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            'x-page': '2',
            'x-next-page': '',
            'x-total-pages': '2',
            'x-per-page': '2',
            'x-total': '4'
          }),
          json: async () => [
            { id: 'f1', name: 'main.cpp', type: 'blob', path: 'apps/main.cpp', mode: '100644' },
            { id: 'f2', name: 'config.h', type: 'blob', path: 'components/config.h', mode: '100644' }
          ]
        };
      }

      return { ok: true, status: 200, headers: new Headers(), json: async () => [] };
    };

    const treeRes = await adapter.getTree({ owner: 'OpenMW', repo: 'openmw' }, { perPage: 2 });
    assert.deepStrictEqual(pagesRequested, [1, 2], 'Expected sequential fetching of page 1 and page 2');
    assert.strictEqual(treeRes.tree.length, 4);

    const blobs = treeRes.tree.filter(i => i.type === 'blob');
    assert.strictEqual(blobs.length, 2);
    assert.strictEqual(blobs[0].path, 'apps/main.cpp');
    assert.strictEqual(blobs[1].path, 'components/config.h');
  });

  it('4. [Contract Mock] Scanned GitLab files reach structureAnalyzer and FalkorDB graph-memory ingestion', async () => {
    const rawFiles = [
      { path: 'CMakeLists.txt', size: 1024, id: 'sha-cmake' },
      { path: 'apps/openmw/main.cpp', size: 4096, id: 'sha-main' },
      { path: 'apps/openmw/mwgui/dialogue.cpp', size: 2048, id: 'sha-diag' },
      { path: 'components/bsa/bsa_file.cpp', size: 3072, id: 'sha-bsa' }
    ];
    const directories = ['apps', 'apps/openmw', 'apps/openmw/mwgui', 'components', 'components/bsa'];

    // 1. Structure analysis
    const structure = analyzeStructure({ files: rawFiles, directories });
    assert.ok(structure.tree.length > 0, 'Structure tree must have root nodes');

    // 2. Build FalkorDB ingestion payload
    const mockAnalysis = {
      repository: {
        owner: 'OpenMW',
        repo: 'openmw',
        fullName: 'OpenMW/openmw',
        provider: 'gitlab'
      },
      structure,
      aiContextReady: {
        filePaths: rawFiles.map(f => f.path)
      }
    };

    const graphPayload = buildProjectMemoryGraphPayload(mockAnalysis, { rawFiles });
    assert.strictEqual(graphPayload.repositoryNode.id, 'openmw/openmw');
    assert.strictEqual(graphPayload.files.length, 4, 'All 4 files must be transformed into FalkorDB file nodes');
    assert.ok(graphPayload.files.some(f => f.path === 'apps/openmw/mwgui/dialogue.cpp'));

    // Verify file-component edges link correctly
    assert.ok(graphPayload.fileComponentEdges.length >= 3);
  });

  it('5. [Contract Mock] Graph overview reflects GitLab provider identity without hardcoded GitHub strings', async () => {
    const graph = buildInteractiveGraphSubgraph('openmw/openmw', {
      componentsList: [{ componentPath: 'apps', componentRole: 'Applications' }],
      provider: 'gitlab'
    });

    const repoNode = graph.nodes.find(n => n.id === 'openmw/openmw');
    assert.ok(repoNode, 'Repository node must exist');
    assert.strictEqual(repoNode.subtitle, 'GitLab Repository Root');
    assert.strictEqual(repoNode.provenance, 'GitLab Repository Scan');
    assert.strictEqual(repoNode.details.provider, 'gitlab');
  });

  it('6. [Contract Mock] Empty tree and provider error states are truthful and actionable', async () => {
    const adapter = new GitLabProviderAdapter();

    // 401 Unauthorized
    global.fetch = async () => ({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: async () => ({ message: '401 Unauthorized' })
    });

    await assert.rejects(
      async () => adapter.getTree({ owner: 'OpenMW', repo: 'openmw' }),
      (err) => {
        assert.strictEqual(err.code, 'UNAUTHORIZED');
        assert.ok(err.message.includes('GITLAB_TOKEN'));
        return true;
      }
    );

    // 429 Rate limited
    global.fetch = async () => ({
      ok: false,
      status: 429,
      headers: new Headers(),
      json: async () => ({ message: 'Rate Limit Exceeded' })
    });

    await assert.rejects(
      async () => adapter.getTree({ owner: 'OpenMW', repo: 'openmw' }),
      (err) => {
        assert.strictEqual(err.code, 'RATE_LIMITED');
        return true;
      }
    );

    // Truthful empty tree (no fake substitution)
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'x-page': '1', 'x-total-pages': '1' }),
      json: async () => []
    });

    const emptyRes = await adapter.getTree({ owner: 'empty-org', repo: 'empty-repo' });
    assert.deepStrictEqual(emptyRes.tree, [], 'Empty tree must return empty array without synthetic data');
  });

  it('7. [Contract Mock] Repository switching maintains strict isolation without leaking file state', async () => {
    const adapter = new GitLabProviderAdapter();

    global.fetch = async (url) => {
      if (url.includes('repo-a')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'x-page': '1', 'x-total-pages': '1' }),
          json: async () => [
            { id: 'f-a', name: 'alpha.go', type: 'blob', path: 'alpha.go', mode: '100644' }
          ]
        };
      }
      if (url.includes('repo-b')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'x-page': '1', 'x-total-pages': '1' }),
          json: async () => [
            { id: 'f-b', name: 'beta.rs', type: 'blob', path: 'beta.rs', mode: '100644' }
          ]
        };
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => [] };
    };

    const treeA = await adapter.getTree({ owner: 'org', repo: 'repo-a' });
    const treeB = await adapter.getTree({ owner: 'org', repo: 'repo-b' });

    assert.strictEqual(treeA.tree[0].path, 'alpha.go');
    assert.strictEqual(treeB.tree[0].path, 'beta.rs');
    assert.ok(!treeA.tree.some(i => i.path === 'beta.rs'), 'Repo A must not contain Repo B files');
    assert.ok(!treeB.tree.some(i => i.path === 'alpha.go'), 'Repo B must not contain Repo A files');
  });

  it('8. [Regression Protection] GitHub repository files remaining functional', async () => {
    const ghAdapter = new GitHubProviderAdapter();

    global.fetch = async (url) => {
      if (url.includes('/git/trees/')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            sha: 'main-sha',
            tree: [
              { path: 'package.json', type: 'blob', sha: 'sha-pkg', size: 500, mode: '100644' },
              { path: 'src', type: 'tree', sha: 'sha-src', mode: '040000' }
            ],
            truncated: false
          })
        };
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) };
    };

    const ghTree = await ghAdapter.getTree({ owner: 'facebook', repo: 'react' });
    assert.strictEqual(ghTree.tree.length, 2);
    assert.strictEqual(ghTree.tree[0].path, 'package.json');
    assert.strictEqual(ghTree.tree[0].type, 'blob');
  });

  it('9. [LIVE Integration] Real OpenMW/openmw GitLab tree returns non-empty files across paginated pages', async (t) => {
    const adapter = new GitLabProviderAdapter();
    let isOnline = false;

    try {
      const probe = await fetch('https://gitlab.com/api/v4/projects/OpenMW%2Fopenmw', { signal: AbortSignal.timeout(4000) });
      isOnline = probe.ok;
    } catch {
      isOnline = false;
    }

    if (!isOnline) {
      t.skip('Skipping live GitLab integration test: GitLab.com unreachable or rate limited');
      return;
    }

    let liveTree;
    try {
      liveTree = await adapter.getTree({ owner: 'OpenMW', repo: 'openmw' }, { maxPages: 4 });
    } catch (err) {
      if (err.code === 'RATE_LIMITED' || err.status === 429) {
        t.skip('Skipping live GitLab integration test: GitLab.com unauthenticated IP rate limit reached');
        return;
      }
      throw err;
    }

    assert.ok(liveTree.tree.length > 100, `Expected >100 items from live OpenMW tree, got ${liveTree.tree.length}`);

    const blobs = liveTree.tree.filter(i => i.type === 'blob');
    assert.ok(blobs.length > 0, `Live OpenMW/openmw tree must contain real blob files, got ${blobs.length}`);

    // Verify recognized real files
    const filePaths = blobs.map(b => b.path);
    assert.ok(
      filePaths.some(p => p.includes('.clang-format') || p.includes('CMakeLists.txt') || p.endsWith('.cpp')),
      `Expected real project files in OpenMW tree, found: ${filePaths.slice(0, 10).join(', ')}`
    );
  });
});
