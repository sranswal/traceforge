/**
 * FailureChain Phase 2 Unit Tests: FalkorDB Schema & Ingestion
 * - Tests schema initialization, caching, idempotency, and error handling.
 * - Tests payload persistence, parameterization, and repeated ingestion idempotency.
 * - Tests high-level orchestrator configuration checks and error redaction.
 * - Runs completely offline using mock clients without requiring live Docker.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureFalkorDBSchema,
  resetFalkorDBSchemaCacheForTesting,
  FALKORDB_INDEXED_LABELS,
  FALKORDB_REPO_INDEXED_LABELS
} from '../server/memory/falkordbSchema.js';
import {
  persistFalkorDBMemoryPayload,
  ingestFalkorDBRepositoryAnalysis
} from '../server/memory/falkordbIngestion.js';
import { setClientForTesting } from '../server/db/falkordb.js';

describe('FailureChain Phase 2: FalkorDB Schema Initialization (Mocked)', () => {
  beforeEach(() => {
    resetFalkorDBSchemaCacheForTesting();
    setClientForTesting(null);
  });

  afterEach(() => {
    resetFalkorDBSchemaCacheForTesting();
    setClientForTesting(null);
  });

  it('creates all exact-match indexes, unique constraints, and repo-scoped indexes', async () => {
    const executedQueries = [];
    const createdConstraints = [];

    const mockGraph = {
      async query(cypher) {
        executedQueries.push(cypher);
        return { metadata: ['Indices created: 1'] };
      },
      async constraintCreate(type, entityType, label, prop) {
        createdConstraints.push({ type, entityType, label, prop });
        return undefined;
      }
    };

    setClientForTesting({
      selectGraph() {
        return mockGraph;
      },
      async close() {}
    });

    const result = await ensureFalkorDBSchema({
      env: { FALKORDB_HOST: 'localhost', FALKORDB_GRAPH: 'testgraph' }
    });

    assert.equal(result.initialized, true);
    assert.equal(result.constraintsCreated, FALKORDB_INDEXED_LABELS.length);
    assert.equal(result.indexesCreated, FALKORDB_INDEXED_LABELS.length + FALKORDB_REPO_INDEXED_LABELS.length);

    // Verify all 9 labels have ID indexes
    for (const label of FALKORDB_INDEXED_LABELS) {
      assert.ok(executedQueries.some(q => q.includes(`CREATE INDEX FOR (n:${label}) ON (n.id)`)));
    }

    // Verify all 9 labels have unique constraints
    assert.equal(createdConstraints.length, 9);
    for (const label of FALKORDB_INDEXED_LABELS) {
      assert.ok(createdConstraints.some(c => c.label === label && c.prop === 'id' && c.type === 'UNIQUE'));
    }

    // Verify all 8 repo-scoped labels have repoFullName indexes
    for (const label of FALKORDB_REPO_INDEXED_LABELS) {
      assert.ok(executedQueries.some(q => q.includes(`CREATE INDEX FOR (n:${label}) ON (n.repoFullName)`)));
    }
  });

  it('reuses cached schema initialization and skips repeat calls', async () => {
    let callCount = 0;
    const mockGraph = {
      async query() {
        callCount++;
        return { metadata: [] };
      },
      async constraintCreate() {
        callCount++;
      }
    };

    setClientForTesting({
      selectGraph() {
        return mockGraph;
      },
      async close() {}
    });

    const res1 = await ensureFalkorDBSchema({
      env: { FALKORDB_HOST: 'localhost' }
    });
    assert.equal(res1.initialized, true);
    const countAfterFirst = callCount;
    assert.ok(countAfterFirst > 0);

    const res2 = await ensureFalkorDBSchema({
      env: { FALKORDB_HOST: 'localhost' }
    });
    assert.equal(res2.initialized, true);
    assert.equal(res2.cached, true);
    assert.equal(callCount, countAfterFirst, 'Second call must be cached and not execute queries');
  });

  it('handles existing indexes and constraints idempotently when force: true', async () => {
    const mockGraph = {
      async query(cypher) {
        if (cypher.includes('CREATE INDEX')) {
          const err = new Error("Attribute 'id' is already indexed");
          throw err;
        }
        return { metadata: [] };
      },
      async constraintCreate() {
        const err = new Error('Constraint already exists');
        throw err;
      }
    };

    setClientForTesting({
      selectGraph() {
        return mockGraph;
      },
      async close() {}
    });

    const res = await ensureFalkorDBSchema({
      env: { FALKORDB_HOST: 'localhost' },
      force: true
    });

    assert.equal(res.initialized, true);
    assert.equal(res.indexesExisted, FALKORDB_INDEXED_LABELS.length + FALKORDB_REPO_INDEXED_LABELS.length);
    assert.equal(res.constraintsExisted, FALKORDB_INDEXED_LABELS.length);
  });

  it('propagates genuine schema errors and never silently swallows them', async () => {
    const mockGraph = {
      async query() {
        throw new Error('Connection lost to FalkorDB server');
      }
    };

    setClientForTesting({
      selectGraph() {
        return mockGraph;
      },
      async close() {}
    });

    await assert.rejects(
      () => ensureFalkorDBSchema({ env: { FALKORDB_HOST: 'localhost' }, force: true }),
      /FalkorDB schema initialization failed: Connection lost to FalkorDB server/
    );
  });
});

describe('FailureChain Phase 2: FalkorDB Payload Ingestion & Idempotency (Mocked)', () => {
  beforeEach(() => {
    resetFalkorDBSchemaCacheForTesting();
    setClientForTesting(null);
  });

  afterEach(() => {
    resetFalkorDBSchemaCacheForTesting();
    setClientForTesting(null);
  });

  const SAMPLE_PAYLOAD = {
    repositoryNode: {
      id: 'acme/widget-service',
      fullName: 'acme/widget-service',
      owner: 'acme',
      name: 'widget-service',
      branch: 'main',
      primaryLanguage: 'JavaScript',
      description: 'Core widget backend service',
      url: 'https://github.com/acme/widget-service',
      projectType: 'Node.js Backend',
      architecturePattern: 'Microservice'
    },
    components: [
      { id: 'acme/widget-service::component::server', repoFullName: 'acme/widget-service', path: 'server', name: 'server', role: 'API Server', category: 'api', description: '' }
    ],
    files: [
      { id: 'acme/widget-service::file::server/index.js', repoFullName: 'acme/widget-service', path: 'server/index.js', name: 'index.js', extension: '.js', size: 1024, isEntryPoint: true, isTest: false, parserPrecision: 'lexical-brace-js-ts' }
    ],
    fileComponentEdges: [
      { componentId: 'acme/widget-service::component::server', fileId: 'acme/widget-service::file::server/index.js' }
    ],
    symbols: [
      { id: 'acme/widget-service::symbol::server/index.js::function::handleRequest', repoFullName: 'acme/widget-service', filePath: 'server/index.js', name: 'handleRequest', kind: 'Function', startLine: 1, endLine: 10, exported: true, parentClass: null, parserPrecision: 'lexical-brace-js-ts' }
    ],
    fileSymbolEdges: [
      { fileId: 'acme/widget-service::file::server/index.js', symbolId: 'acme/widget-service::symbol::server/index.js::function::handleRequest' }
    ],
    symbolCallEdges: [],
    componentDependencies: [],
    tests: [],
    testCoversSymbolEdges: [],
    commits: [],
    commitFileEdges: [],
    commitSymbolEdges: []
  };

  it('persists structured graph entities idempotently with parameterized MERGE', async () => {
    const executedQueries = [];
    const mergedIds = new Set();

    const mockGraph = {
      async query(cypher, options = {}) {
        executedQueries.push({ cypher, options });
        const params = options.params || {};

        if (params.repo?.id) mergedIds.add(params.repo.id);
        if (Array.isArray(params.components)) params.components.forEach(c => mergedIds.add(c.id));
        if (Array.isArray(params.files)) params.files.forEach(f => mergedIds.add(f.id));
        if (Array.isArray(params.symbols)) params.symbols.forEach(s => mergedIds.add(s.id));

        return { metadata: [], data: [] };
      },
      async constraintCreate() {
        return undefined;
      }
    };

    setClientForTesting({
      selectGraph() {
        return mockGraph;
      },
      async close() {}
    });

    const env = { FALKORDB_HOST: 'localhost', FALKORDB_GRAPH: 'testgraph' };

    // First ingestion run
    const run1 = await persistFalkorDBMemoryPayload(SAMPLE_PAYLOAD, { env });
    assert.equal(run1.ingested, true);
    assert.equal(run1.status, 'ingested');
    assert.equal(run1.repositoryId, 'acme/widget-service');
    assert.equal(run1.counts.components, 1);
    assert.equal(run1.counts.files, 1);
    assert.equal(run1.counts.symbols, 1);

    const countAfterRun1 = mergedIds.size;
    assert.equal(countAfterRun1, 4); // repo, 1 comp, 1 file, 1 symbol

    // Second ingestion run (idempotency check)
    const run2 = await persistFalkorDBMemoryPayload(SAMPLE_PAYLOAD, { env });
    assert.equal(run2.ingested, true);
    assert.equal(mergedIds.size, countAfterRun1, 'Repeated ingestion must not create duplicate IDs');
    assert.deepEqual(run1.counts, run2.counts);

    // Verify all queries were parameterized
    for (const q of executedQueries) {
      if (q.cypher.includes('$repo') || q.cypher.includes('$components') || q.cypher.includes('$files')) {
        assert.ok(q.options && q.options.params, 'MERGE queries must use query options with parameters');
      }
    }
  });

  it('reports unconfigured status when FalkorDB environment variables are absent', async () => {
    const res = await ingestFalkorDBRepositoryAnalysis(
      { repository: { fullName: 'test/repo' } },
      { env: {} }
    );
    assert.equal(res.ingested, false);
    assert.equal(res.status, 'unconfigured');
    assert.ok(res.reason.includes('FalkorDB is not configured'));
  });

  it('reports invalid_config status when FalkorDB is partially configured', async () => {
    const res = await ingestFalkorDBRepositoryAnalysis(
      { repository: { fullName: 'test/repo' } },
      { env: { FALKORDB_PASSWORD: 'secret-only-password' } }
    );
    assert.equal(res.ingested, false);
    assert.equal(res.status, 'invalid_config');
  });

  it('catches runtime ingestion errors, sanitizes credentials, and does not crash', async () => {
    const mockGraph = {
      async query() {
        throw new Error('Connection error with redis://admin:ultraSecretPass@localhost:6379');
      },
      async constraintCreate() {
        return undefined;
      }
    };

    setClientForTesting({
      selectGraph() {
        return mockGraph;
      },
      async close() {}
    });

    const env = {
      FALKORDB_HOST: 'localhost',
      FALKORDB_PASSWORD: 'ultraSecretPass'
    };

    const res = await ingestFalkorDBRepositoryAnalysis(
      { repository: { fullName: 'test/repo' }, structure: {} },
      { env, rawFiles: [], sourceContents: {}, commits: [] }
    );

    assert.equal(res.ingested, false);
    assert.equal(res.status, 'error');
    assert.equal(res.error.includes('ultraSecretPass'), false);
    assert.ok(res.error.includes('[REDACTED]'));
  });
});

