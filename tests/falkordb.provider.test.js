/**
 * FailureChain Phase 4 Unit Tests: Database Provider Selection & Route Integration
 * - Tests FalkorDB provider resolution ('falkordb').
 * - Verifies absence of silent fallback on database failure.
 * - Verifies health check, ingestion, retrieval, and overview routing.
 * - Verifies AI prompt receives evidence matching FalkorDB.
 * - Tests response shape compatibility and credential sanitization.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveGraphProvider,
  validateActiveGraphConfig,
  getGraphHealth,
  ingestRepositoryToGraph,
  retrieveGraphContext,
  recordMemoryEntry,
  getRepositoryOverview,
  formatGraphEvidenceMarkdown,
  SUPPORTED_GRAPH_PROVIDERS
} from '../server/memory/graphProvider.js';
import { setClientForTesting } from '../server/db/falkordb.js';
import { resetFalkorDBSchemaCacheForTesting } from '../server/memory/falkordbSchema.js';
import { AIProvider } from '../server/ai/provider.js';
import { analyzeRepository } from '../server/analyzer/index.js';

describe('FailureChain Phase 4: Graph Provider Selection & Safe Delegation', () => {
  beforeEach(() => {
    resetFalkorDBSchemaCacheForTesting();
    setClientForTesting(null);
  });

  afterEach(() => {
    resetFalkorDBSchemaCacheForTesting();
    setClientForTesting(null);
  });

  it('resolves explicit provider configuration correctly', () => {
    assert.equal(resolveGraphProvider({ GRAPH_DATABASE_PROVIDER: 'falkordb' }), 'falkordb');
    assert.equal(resolveGraphProvider({ GRAPH_DATABASE_PROVIDER: 'FALKORDB' }), 'falkordb');
    assert.equal(resolveGraphProvider({ GRAPH_BACKEND: 'falkordb' }), 'falkordb');
    assert.equal(resolveGraphProvider({ DATABASE_PROVIDER: 'falkordb' }), 'falkordb');

    assert.throws(
      () => resolveGraphProvider({ GRAPH_DATABASE_PROVIDER: 'unsupported_provider' }),
      /Invalid GRAPH_DATABASE_PROVIDER "unsupported_provider"/
    );
    assert.throws(
      () => resolveGraphProvider({ GRAPH_DATABASE_PROVIDER: 'postgres' }),
      /Invalid GRAPH_DATABASE_PROVIDER "postgres"/
    );
  });

  it('resolves default provider when no explicit provider is set', () => {
    assert.equal(
      resolveGraphProvider({ FALKORDB_HOST: 'localhost', FALKORDB_GRAPH: 'traceforge' }),
      'falkordb'
    );
    assert.equal(resolveGraphProvider({}), 'falkordb');
  });

  it('strictly handles FalkorDB failure without silent fallbacks', async () => {
    let falkorCalled = false;

    // FalkorDB configured to fail
    setClientForTesting({
      selectGraph() {
        falkorCalled = true;
        return {
          async query() {
            throw new Error('FalkorDB connection timeout');
          }
        };
      },
      async close() {}
    });

    const env = {
      GRAPH_DATABASE_PROVIDER: 'falkordb',
      FALKORDB_HOST: 'localhost'
    };

    const res = await retrieveGraphContext('test/repo', 'how does auth work?', { env });

    assert.equal(falkorCalled, true, 'FalkorDB must be called');
    assert.equal(res.available, false);
    assert.equal(res.status, 'error');
    assert.ok(res.error.includes('FalkorDB connection timeout') || res.error.includes('FalkorDB query failed'));
  });

  it('routes health check to active provider without credential exposure', async () => {
    setClientForTesting({
      selectGraph() {
        return {
          async query(cypher) {
            assert.equal(cypher, 'RETURN 1 AS ok');
            return { metadata: [], data: [{ ok: 1 }] };
          }
        };
      },
      async close() {}
    });

    const env = {
      GRAPH_DATABASE_PROVIDER: 'falkordb',
      FALKORDB_HOST: 'localhost',
      FALKORDB_PASSWORD: 'superSecretFalkorPassword'
    };

    const health = await getGraphHealth({ env });
    assert.equal(health.provider, 'falkordb');
    assert.equal(health.connected, true);
    assert.equal('password' in health, false);
  });

  it('routes AI question answering and contextual markdown to FalkorDB when active', async () => {
    let retrievedProvider = null;
    let capturedSystemInstruction = null;
    let capturedPrompt = null;

    setClientForTesting({
      selectGraph() {
        retrievedProvider = 'falkordb';
        return {
          async query(cypher) {
            if (cypher.includes('MATCH (b:Bug')) {
              return {
                data: [
                  {
                    bugId: 'acme/widget::bug::rate-limit-cascade',
                    title: 'Rate Limit Cascade',
                    severity: 'critical',
                    status: 'resolved',
                    symptoms: 'HTTP 429 flood',
                    componentPath: 'services',
                    filePath: 'services/rateLimiter.js',
                    fixSummary: 'Implement leaky bucket backoff',
                    relevanceScore: 2
                  }
                ]
              };
            }
            return { data: [] };
          }
        };
      },
      async close() {}
    });

    const provider = new AIProvider({
      apiKey: 'test-key',
      fetchImpl: async (url, init) => {
        const body = JSON.parse(init.body);
        capturedSystemInstruction = body.systemInstruction?.parts?.[0]?.text;
        capturedPrompt = body.contents?.[0]?.parts?.[0]?.text;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Answer grounded in FalkorDB evidence.' }] } }]
          })
        };
      }
    });

    const env = {
      GRAPH_DATABASE_PROVIDER: 'falkordb',
      FALKORDB_HOST: 'localhost'
    };

    const answer = await provider.answerQuestion(
      'Why did rate limiting fail?',
      {
        repository: { fullName: 'acme/widget-service' },
        structure: { tree: [] },
        techStack: [],
        frameworks: []
      },
      { env }
    );

    assert.equal(retrievedProvider, 'falkordb', 'AI question answering must query FalkorDB');
    assert.equal(answer.available, true);
    assert.ok(capturedSystemInstruction.includes('FalkorDB Project Memory Graph Evidence'), 'System prompt must reference FalkorDB');
    assert.ok(capturedPrompt.includes('Rate Limit Cascade'), 'Prompt must contain FalkorDB bug evidence');
    assert.ok(capturedPrompt.includes('Implement leaky bucket backoff'), 'Prompt must contain FalkorDB fix evidence');
  });

  it('produces complete and validated response shape for repository overview', async () => {
    const mockData = {
      filesCount: 5,
      componentsCount: 2,
      symbolsCount: 12,
      decisionsCount: 1,
      bugsCount: 1,
      fixesCount: 1,
      commitsCount: 2,
      relationshipsCount: 15
    };

    setClientForTesting({
      selectGraph() {
        return {
          async query(cypher) {
            if (cypher.includes('filesCount')) {
              return { data: [mockData] };
            }
            return { data: [] };
          }
        };
      },
      async close() {}
    });

    const falkorOverview = await getRepositoryOverview('acme/widget', {
      env: { GRAPH_DATABASE_PROVIDER: 'falkordb', FALKORDB_HOST: 'localhost' }
    });

    assert.equal(falkorOverview.available, true);
    assert.equal(falkorOverview.status, 'connected');
    assert.equal(falkorOverview.repoFullName, 'acme/widget');
    assert.equal(falkorOverview.provider, 'falkordb');
    assert.ok(falkorOverview.counts);
    assert.equal(falkorOverview.counts.files, 5);
    assert.equal(falkorOverview.counts.components, 2);
    assert.equal(falkorOverview.counts.symbols, 12);
    assert.equal(falkorOverview.counts.decisions, 1);
    assert.equal(falkorOverview.counts.bugs, 1);
    assert.equal(falkorOverview.counts.fixes, 1);
    assert.equal(falkorOverview.counts.commits, 2);
    assert.equal(falkorOverview.counts.relationships, 15);
    assert.ok(Array.isArray(falkorOverview.graph.nodes));
    assert.ok(Array.isArray(falkorOverview.graph.edges));
  });

  it('ensures repository analysis is non-blocking when graph ingestion throws', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async (url) => {
        if (typeof url === 'string' && url.includes('/git/trees')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              tree: [
                { path: 'package.json', type: 'blob', size: 120 },
                { path: 'server.js', type: 'blob', size: 450 }
              ]
            })
          };
        }
        if (typeof url === 'string' && url.includes('api.github.com/repos/')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              full_name: 'acme/widget-service',
              default_branch: 'main',
              description: 'Widget service',
              language: 'JavaScript'
            })
          };
        }
        return { ok: false, status: 404 };
      };

      // Set invalid graph database provider to trigger a throw during graph ingestion
      const result = await analyzeRepository('https://github.com/acme/widget-service', {
        env: { GRAPH_DATABASE_PROVIDER: 'broken-unsupported-db' },
        sourceContents: { 'server.js': 'console.log("hello");' },
        commits: []
      });

      assert.ok(result, 'Main analysis must succeed');
      assert.equal(result.repository.fullName, 'acme/widget-service');
      assert.ok(result.metrics.totalFiles >= 1);
      assert.equal(result.projectMemory.ingested, false);
      assert.equal(result.projectMemory.status, 'error');
      assert.ok(result.projectMemory.error.includes('broken-unsupported-db'));
    } finally {
      global.fetch = originalFetch;
    }
  });
});
