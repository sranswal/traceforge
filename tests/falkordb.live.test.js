/**
 * Opt-In Live FalkorDB Integration & Smoke Test (FailureChain Phase 1.5)
 * - Verifies real connectivity, Cypher execution, parameterized node/edge creation,
 *   read-only query routing, and result shape against a real FalkorDB instance.
 * - Uses an isolated, uniquely named temporary test graph. Never touches or resets default graphs.
 * - Cleans up the test graph and closes the client in an after() hook, including on failure.
 * - Skips cleanly when FalkorDB is unreachable or unconfigured.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkFalkorDBHealth,
  getClient,
  runQuery,
  closeClient
} from '../server/db/falkordb.js';
import {
  ensureFalkorDBSchema,
  resetFalkorDBSchemaCacheForTesting
} from '../server/memory/falkordbSchema.js';
import {
  persistFalkorDBMemoryPayload,
  ingestFalkorDBRepositoryAnalysis
} from '../server/memory/falkordbIngestion.js';
import {
  recordFalkorDBMemoryEntry,
  retrieveFalkorDBGraphContextForQuestion,
  getFalkorDBRepositoryMemoryOverview,
  formatFalkorDBGraphEvidenceMarkdown
} from '../server/memory/falkordbRetrieval.js';
import {
  getGraphHealth,
  ingestRepositoryToGraph,
  retrieveGraphContext,
  recordMemoryEntry,
  getRepositoryOverview
} from '../server/memory/graphProvider.js';
import { AIProvider } from '../server/ai/provider.js';
import { buildProjectMemoryGraphPayload } from '../server/memory/falkordbIngestion.js';
import { SYNTHETIC_INCIDENT_FIXTURE } from '../server/ai/investigation.js';
import app from '../server/index.js';

const LIVE_HOST = process.env.FALKORDB_LIVE_HOST || process.env.FALKORDB_HOST || 'localhost';
const LIVE_PORT = Number(process.env.FALKORDB_LIVE_PORT || process.env.FALKORDB_PORT) || 6379;
const LIVE_PASSWORD = process.env.FALKORDB_LIVE_PASSWORD || process.env.FALKORDB_PASSWORD || '';
const LIVE_URL = process.env.FALKORDB_LIVE_URL || process.env.FALKORDB_URL || '';

const LIVE_ENV = {
  FALKORDB_HOST: LIVE_HOST,
  FALKORDB_PORT: String(LIVE_PORT),
  FALKORDB_PASSWORD: LIVE_PASSWORD,
  ...(LIVE_URL ? { FALKORDB_URL: LIVE_URL } : {})
};

// Check if live FalkorDB instance is available
let isFalkorDBLive = false;
let liveHealthResult = null;

try {
  liveHealthResult = await checkFalkorDBHealth(LIVE_ENV);
  isFalkorDBLive = Boolean(liveHealthResult.connected);
} catch {
  isFalkorDBLive = false;
}

const skipReason = isFalkorDBLive
  ? false
  : `FalkorDB live instance not reachable on ${LIVE_HOST}:${LIVE_PORT} (${liveHealthResult?.error || 'unreachable'}). Set FALKORDB_HOST/PORT or start Docker to run live tests.`;

describe('FailureChain Phase 1.5: Live FalkorDB Smoke Test', { skip: skipReason }, () => {
  const TEST_GRAPH = `smoke_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let testGraphHandle = null;

  after(async () => {
    try {
      if (testGraphHandle && typeof testGraphHandle.delete === 'function') {
        await testGraphHandle.delete();
      }
    } catch (err) {
      console.warn(`[Live Test Cleanup] Notice: Could not delete temporary test graph ${TEST_GRAPH}:`, err.message);
    } finally {
      await closeClient();
    }
  });

  it('1. Connects to real FalkorDB instance and validates RETURN 1 AS ok result shape', async () => {
    const health = await checkFalkorDBHealth({
      ...LIVE_ENV,
      FALKORDB_GRAPH: TEST_GRAPH
    });
    assert.equal(health.connected, true, 'Health check must report connected: true');
    assert.equal(health.status, 'connected');

    const res = await runQuery('RETURN 1 AS ok', {}, {
      graph: TEST_GRAPH,
      accessMode: 'READ',
      env: LIVE_ENV
    });

    assert.ok(Array.isArray(res.records), 'Result records must be an array');
    assert.equal(res.records.length, 1, 'Expected 1 record');
    assert.equal(res.records[0].ok, 1, 'RETURN 1 AS ok must evaluate to 1');
    assert.ok(res.metadata, 'Response should include server metadata');

    // Acquire graph handle for teardown
    const client = await getClient({ env: LIVE_ENV });
    testGraphHandle = client.selectGraph(TEST_GRAPH);
  });

  it('2. Creates a test node with parameterized properties and verifies returned entity', async () => {
    const nodePayload = {
      id: 'incident-live-001',
      title: 'Authentication Skew Cascade',
      severity: 'high',
      symptoms: 'HTTP 401 on /api/auth',
      retryCount: 3
    };

    const createRes = await runQuery(
      `CREATE (inc:Incident {
        id: $node.id,
        title: $node.title,
        severity: $node.severity,
        symptoms: $node.symptoms,
        retryCount: $node.retryCount
      }) RETURN inc`,
      { node: nodePayload },
      { graph: TEST_GRAPH, env: LIVE_ENV }
    );

    assert.equal(createRes.records.length, 1);
    const incNode = createRes.records[0].inc;
    assert.ok(incNode, 'Created node must be returned');
    assert.equal(incNode.id, 'incident-live-001');
    assert.equal(incNode.title, 'Authentication Skew Cascade');
    assert.equal(incNode.severity, 'high');
    assert.equal(incNode.symptoms, 'HTTP 401 on /api/auth');
    assert.equal(incNode.retryCount, 3);
  });

  it('3. Reads the node back using parameterized MATCH and verifies property fidelity', async () => {
    const readRes = await runQuery(
      `MATCH (inc:Incident { id: $targetId })
       RETURN inc.id AS id, inc.title AS title, inc.severity AS severity, inc.retryCount AS retryCount`,
      { targetId: 'incident-live-001' },
      { graph: TEST_GRAPH, accessMode: 'READ', env: LIVE_ENV }
    );

    assert.equal(readRes.records.length, 1);
    const record = readRes.records[0];
    assert.equal(record.id, 'incident-live-001');
    assert.equal(record.title, 'Authentication Skew Cascade');
    assert.equal(record.severity, 'high');
    assert.equal(record.retryCount, 3);
  });

  it('4. Creates and verifies a directed relationship with edge properties', async () => {
    const relRes = await runQuery(
      `MATCH (inc:Incident { id: $incId })
       CREATE (sym:Symbol { id: $symId, name: $symName, filePath: $filePath })
       CREATE (inc)-[r:TRIGGERED_BY { confidence: $conf, weight: $weight }]->(sym)
       RETURN inc.id AS incidentId,
              type(r) AS relationshipType,
              r.confidence AS confidence,
              r.weight AS weight,
              sym.name AS symbolName,
              sym.filePath AS filePath`,
      {
        incId: 'incident-live-001',
        symId: 'symbol-live-001',
        symName: 'verifyAuthToken',
        filePath: 'services/auth.js',
        conf: 0.98,
        weight: 1
      },
      { graph: TEST_GRAPH, env: LIVE_ENV }
    );

    assert.equal(relRes.records.length, 1);
    const relRow = relRes.records[0];
    assert.equal(relRow.incidentId, 'incident-live-001');
    assert.equal(relRow.relationshipType, 'TRIGGERED_BY');
    assert.equal(relRow.confidence, 0.98);
    assert.equal(relRow.weight, 1);
    assert.equal(relRow.symbolName, 'verifyAuthToken');
    assert.equal(relRow.filePath, 'services/auth.js');
  });

  it('5. Executes a read-only query traversing the graph relationship via roQuery', async () => {
    const traverseRes = await runQuery(
      `MATCH (inc:Incident)-[r:TRIGGERED_BY]->(sym:Symbol)
       WHERE sym.filePath = $path
       RETURN inc.title AS incidentTitle, type(r) AS rel, sym.name AS targetSymbol`,
      { path: 'services/auth.js' },
      { graph: TEST_GRAPH, accessMode: 'READ', env: LIVE_ENV }
    );

    assert.equal(traverseRes.records.length, 1);
    assert.equal(traverseRes.records[0].incidentTitle, 'Authentication Skew Cascade');
    assert.equal(traverseRes.records[0].rel, 'TRIGGERED_BY');
    assert.equal(traverseRes.records[0].targetSymbol, 'verifyAuthToken');
  });
});

describe('FailureChain Phase 2: Live FalkorDB Schema and Ingestion', { skip: skipReason }, () => {
  const TEST_GRAPH = `live_phase2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let testGraphHandle = null;

  before(async () => {
    resetFalkorDBSchemaCacheForTesting();
    const client = await getClient({ env: LIVE_ENV });
    testGraphHandle = client.selectGraph(TEST_GRAPH);
  });

  after(async () => {
    try {
      if (testGraphHandle && typeof testGraphHandle.delete === 'function') {
        await testGraphHandle.delete();
      }
    } catch (err) {
      console.warn(`[Live Phase 2 Cleanup] Notice: Could not delete temporary test graph ${TEST_GRAPH}:`, err.message);
    } finally {
      resetFalkorDBSchemaCacheForTesting();
      await closeClient();
    }
  });

  const SAMPLE_ANALYSIS = {
    repository: {
      fullName: 'acme/widget-service',
      owner: 'acme',
      repo: 'widget-service',
      branch: 'main',
      primaryLanguage: 'JavaScript',
      description: 'Core widget backend service'
    },
    projectType: 'Node.js Backend',
    architecture: {
      pattern: 'Microservice',
      entryPoints: [{ path: 'server/index.js' }]
    },
    structure: {
      classifiedDirectories: [
        { path: 'services', name: 'services', role: 'Business Logic', category: 'core', description: 'Domain services' },
        { path: 'server', name: 'server', role: 'API Server', category: 'api', description: 'Express server' }
      ]
    },
    aiContextReady: {
      filePaths: ['server/index.js', 'services/auth.js', 'tests/auth.test.js']
    }
  };

  const SOURCE_CONTENTS = {
    'services/auth.js': [
      "export function verifyToken(token) {",
      "  return checkExpiry(token);",
      "}",
      "export function checkExpiry(t) {",
      "  return Boolean(t);",
      "}"
    ].join('\n'),
    'server/index.js': [
      "import { verifyToken } from '../services/auth.js';",
      "export function handleRequest(req) {",
      "  return verifyToken(req.token);",
      "}"
    ].join('\n'),
    'tests/auth.test.js': [
      "import { verifyToken } from '../services/auth.js';",
      "it('validates token expiry correctly', () => {",
      "  verifyToken('abc');",
      "});"
    ].join('\n')
  };

  const COMMITS = [
    {
      sha: '1122334455667788',
      shortSha: '1122334',
      message: 'Fix token verification edge case',
      author: 'alice',
      date: '2026-10-10T10:00:00Z',
      files: [
        {
          path: 'services/auth.js',
          status: 'modified',
          additions: 2,
          deletions: 1,
          changedRanges: [{ startLine: 1, endLine: 2 }]
        }
      ]
    }
  ];

  it('1. Initializes FalkorDB schema with exact-match indexes and UNIQUE constraints on real server', async () => {
    const res = await ensureFalkorDBSchema({
      env: LIVE_ENV,
      graph: TEST_GRAPH,
      force: true
    });

    assert.equal(res.initialized, true);
    assert.equal(res.constraintsCreated, 9, 'Must create 9 UNIQUE constraints');
    assert.equal(res.indexesCreated, 17, 'Must create 17 indexes (9 id + 8 repoFullName)');
  });

  it('2. Repeated schema initialization on live server is idempotent', async () => {
    const res = await ensureFalkorDBSchema({
      env: LIVE_ENV,
      graph: TEST_GRAPH,
      force: true
    });

    assert.equal(res.initialized, true);
    assert.equal(res.indexesExisted, 17, 'All 17 indexes must be recognized as existing');
    assert.equal(res.constraintsExisted, 9, 'All 9 constraints must be recognized as existing');
  });

  it('3. Uniqueness constraint blocks duplicate node creation on live server', async () => {
    await runQuery(
      "CREATE (r:Repository { id: 'dup-test-repo', fullName: 'dup/test' })",
      {},
      { graph: TEST_GRAPH, env: LIVE_ENV }
    );

    await assert.rejects(
      () => runQuery(
        "CREATE (r:Repository { id: 'dup-test-repo', fullName: 'dup/test' })",
        {},
        { graph: TEST_GRAPH, env: LIVE_ENV }
      ),
      /unique constraint violation/
    );

    // Clean up test node
    await runQuery(
      "MATCH (r:Repository { id: 'dup-test-repo' }) DELETE r",
      {},
      { graph: TEST_GRAPH, env: LIVE_ENV }
    );
  });

  it('4. Ingests deterministic repository analysis into FalkorDB graph', async () => {
    const ingestRes = await ingestFalkorDBRepositoryAnalysis(SAMPLE_ANALYSIS, {
      env: LIVE_ENV,
      graph: TEST_GRAPH,
      sourceContents: SOURCE_CONTENTS,
      commits: COMMITS
    });

    assert.equal(ingestRes.ingested, true);
    assert.equal(ingestRes.status, 'ingested');
    assert.equal(ingestRes.repositoryId, 'acme/widget-service');
    assert.equal(ingestRes.counts.files, 3);
    assert.equal(ingestRes.counts.symbols, 3);
    assert.equal(ingestRes.counts.tests, 1);
    assert.equal(ingestRes.counts.commits, 1);
  });

  it('5. Queries and asserts all expected node types, labels, and properties', async () => {
    // Repository
    const repoRes = await runQuery(
      'MATCH (r:Repository { id: $id }) RETURN r',
      { id: 'acme/widget-service' },
      { graph: TEST_GRAPH, accessMode: 'READ', env: LIVE_ENV }
    );
    assert.equal(repoRes.records.length, 1);
    const repo = repoRes.records[0].r;
    assert.equal(repo.fullName, 'acme/widget-service');
    assert.equal(repo.branch, 'main');
    assert.ok(repo.updatedAt, 'updatedAt timestamp must be recorded');

    // Components
    const compRes = await runQuery(
      'MATCH (c:Component { repoFullName: $repo }) RETURN c.path AS path, c.name AS name ORDER BY path',
      { repo: 'acme/widget-service' },
      { graph: TEST_GRAPH, accessMode: 'READ', env: LIVE_ENV }
    );
    assert.ok(compRes.records.length >= 3);
    const compPaths = compRes.records.map(c => c.path);
    assert.ok(compPaths.includes('root'));
    assert.ok(compPaths.includes('services'));
    assert.ok(compPaths.includes('server'));

    // Files
    const fileRes = await runQuery(
      'MATCH (f:File { repoFullName: $repo }) RETURN f.path AS path, f.isEntryPoint AS isEntry ORDER BY path',
      { repo: 'acme/widget-service' },
      { graph: TEST_GRAPH, accessMode: 'READ', env: LIVE_ENV }
    );
    assert.equal(fileRes.records.length, 3);
    const entryFile = fileRes.records.find(f => f.path === 'server/index.js');
    assert.equal(entryFile.isEntry, true);

    // Symbols with secondary labels
    const symRes = await runQuery(
      'MATCH (s:Symbol { repoFullName: $repo }) RETURN s.name AS name, s.kind AS kind, labels(s) AS labels ORDER BY name',
      { repo: 'acme/widget-service' },
      { graph: TEST_GRAPH, accessMode: 'READ', env: LIVE_ENV }
    );
    assert.equal(symRes.records.length, 3);
    const fnNames = symRes.records.map(s => s.name);
    assert.ok(fnNames.includes('verifyToken'));
    assert.ok(fnNames.includes('checkExpiry'));
    assert.ok(fnNames.includes('handleRequest'));
    for (const sym of symRes.records) {
      assert.ok(sym.labels.includes('Symbol'));
      assert.ok(sym.labels.includes('Function'));
    }

    // Tests
    const testRes = await runQuery(
      'MATCH (t:Test { repoFullName: $repo }) RETURN t.name AS name, t.filePath AS filePath',
      { repo: 'acme/widget-service' },
      { graph: TEST_GRAPH, accessMode: 'READ', env: LIVE_ENV }
    );
    assert.equal(testRes.records.length, 1);
    assert.equal(testRes.records[0].name, 'validates token expiry correctly');

    // Commits
    const commitRes = await runQuery(
      'MATCH (cm:Commit { repoFullName: $repo }) RETURN cm.shortSha AS shortSha, cm.author AS author',
      { repo: 'acme/widget-service' },
      { graph: TEST_GRAPH, accessMode: 'READ', env: LIVE_ENV }
    );
    assert.equal(commitRes.records.length, 1);
    assert.equal(commitRes.records[0].shortSha, '1122334');
    assert.equal(commitRes.records[0].author, 'alice');
  });

  it('6. Queries and asserts all expected relationship types and edge properties', async () => {
    // SYMBOL_CALLS_SYMBOL
    const callRes = await runQuery(
      `MATCH (caller:Symbol)-[r:SYMBOL_CALLS_SYMBOL]->(callee:Symbol)
       RETURN caller.name AS caller, callee.name AS callee, r.callerFile AS callerFile
       ORDER BY caller, callee`,
      {},
      { graph: TEST_GRAPH, accessMode: 'READ', env: LIVE_ENV }
    );
    assert.equal(callRes.records.length, 2);
    assert.deepEqual(
      callRes.records.map(c => `${c.caller}->${c.callee}`),
      ['handleRequest->verifyToken', 'verifyToken->checkExpiry']
    );

    // COMPONENT_DEPENDS_ON_COMPONENT
    const depRes = await runQuery(
      `MATCH (src:Component)-[r:COMPONENT_DEPENDS_ON_COMPONENT]->(tgt:Component)
       RETURN src.path AS src, tgt.path AS tgt`,
      {},
      { graph: TEST_GRAPH, accessMode: 'READ', env: LIVE_ENV }
    );
    assert.ok(depRes.records.length >= 1);
    const hasServerServicesDep = depRes.records.some(d => d.src === 'server' && d.tgt === 'services');
    assert.ok(hasServerServicesDep, 'Must establish server -> services component dependency');

    // TEST_COVERS_SYMBOL
    const coverRes = await runQuery(
      `MATCH (t:Test)-[r:TEST_COVERS_SYMBOL]->(s:Symbol)
       RETURN t.name AS test, s.name AS sym`,
      {},
      { graph: TEST_GRAPH, accessMode: 'READ', env: LIVE_ENV }
    );
    assert.equal(coverRes.records.length, 1);
    assert.equal(coverRes.records[0].test, 'validates token expiry correctly');
    assert.equal(coverRes.records[0].sym, 'verifyToken');

    // COMMIT_CHANGED_FILE
    const cfRes = await runQuery(
      `MATCH (cm:Commit)-[r:COMMIT_CHANGED_FILE]->(f:File)
       RETURN cm.shortSha AS sha, f.path AS path, r.status AS status, r.additions AS additions`,
      {},
      { graph: TEST_GRAPH, accessMode: 'READ', env: LIVE_ENV }
    );
    assert.equal(cfRes.records.length, 1);
    assert.equal(cfRes.records[0].sha, '1122334');
    assert.equal(cfRes.records[0].path, 'services/auth.js');
    assert.equal(cfRes.records[0].status, 'modified');
    assert.equal(cfRes.records[0].additions, 2);

    // COMMIT_CHANGED_SYMBOL
    const csRes = await runQuery(
      `MATCH (cm:Commit)-[r:COMMIT_CHANGED_SYMBOL]->(s:Symbol)
       RETURN cm.shortSha AS sha, s.name AS sym`,
      {},
      { graph: TEST_GRAPH, accessMode: 'READ', env: LIVE_ENV }
    );
    assert.equal(csRes.records.length, 1);
    assert.equal(csRes.records[0].sha, '1122334');
    assert.equal(csRes.records[0].sym, 'verifyToken');
  });

  it('7. Ingests the same fixture a second time and verifies strict idempotency', async () => {
    // Record node and edge counts prior to second ingestion
    const countBeforeRes = await runQuery(
      'MATCH (n) RETURN count(n) AS nodeCount',
      {},
      { graph: TEST_GRAPH, env: LIVE_ENV }
    );
    const edgeBeforeRes = await runQuery(
      'MATCH ()-[r]->() RETURN count(r) AS edgeCount',
      {},
      { graph: TEST_GRAPH, env: LIVE_ENV }
    );

    const nodeCountBefore = Number(countBeforeRes.records[0].nodeCount);
    const edgeCountBefore = Number(edgeBeforeRes.records[0].edgeCount);

    // Run second ingestion
    const secondIngestRes = await ingestFalkorDBRepositoryAnalysis(SAMPLE_ANALYSIS, {
      env: LIVE_ENV,
      graph: TEST_GRAPH,
      sourceContents: SOURCE_CONTENTS,
      commits: COMMITS
    });

    assert.equal(secondIngestRes.ingested, true);

    // Count after second ingestion
    const countAfterRes = await runQuery(
      'MATCH (n) RETURN count(n) AS nodeCount',
      {},
      { graph: TEST_GRAPH, env: LIVE_ENV }
    );
    const edgeAfterRes = await runQuery(
      'MATCH ()-[r]->() RETURN count(r) AS edgeCount',
      {},
      { graph: TEST_GRAPH, env: LIVE_ENV }
    );

    const nodeCountAfter = Number(countAfterRes.records[0].nodeCount);
    const edgeCountAfter = Number(edgeAfterRes.records[0].edgeCount);

    assert.equal(nodeCountAfter, nodeCountBefore, 'Node count must remain identical after repeated ingestion');
    assert.equal(edgeCountAfter, edgeCountBefore, 'Relationship count must remain identical after repeated ingestion');
  });

  it('8. Ingests empty repository gracefully without errors or broken relationships', async () => {
    const EMPTY_ANALYSIS = {
      repository: {
        fullName: 'empty/repo',
        owner: 'empty',
        repo: 'repo',
        branch: 'main'
      },
      projectType: 'Empty Repository',
      structure: { classifiedDirectories: [] },
      aiContextReady: { filePaths: [] }
    };

    const res = await ingestFalkorDBRepositoryAnalysis(EMPTY_ANALYSIS, {
      env: LIVE_ENV,
      graph: TEST_GRAPH,
      sourceContents: {},
      commits: []
    });

    assert.equal(res.ingested, true);
    assert.equal(res.status, 'ingested');
    assert.equal(res.repositoryId, 'empty/repo');
    assert.equal(res.counts.files, 0);
    assert.equal(res.counts.symbols, 0);
    assert.equal(res.counts.commits, 0);

    const checkRes = await runQuery(
      'MATCH (r:Repository { id: $id }) RETURN r.fullName AS name',
      { id: 'empty/repo' },
      { graph: TEST_GRAPH, accessMode: 'READ', env: LIVE_ENV }
    );
    assert.equal(checkRes.records.length, 1);
    assert.equal(checkRes.records[0].name, 'empty/repo');
  });
});

describe('FailureChain Phase 3: Live FalkorDB Retrieval & Verification', { skip: skipReason }, () => {
  const TEST_GRAPH = `live_phase3_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let testGraphHandle = null;

  before(async () => {
    resetFalkorDBSchemaCacheForTesting();
    const client = await getClient({ env: LIVE_ENV });
    testGraphHandle = client.selectGraph(TEST_GRAPH);

    // 1. Initialize schema
    await ensureFalkorDBSchema({
      env: LIVE_ENV,
      graph: TEST_GRAPH,
      force: true
    });

    // 2. Ingest target fixture (acme/widget-service)
    const TARGET_ANALYSIS = {
      repository: {
        fullName: 'acme/widget-service',
        owner: 'acme',
        repo: 'widget-service',
        branch: 'main',
        primaryLanguage: 'JavaScript',
        description: 'Core widget backend service'
      },
      projectType: 'Node.js Backend',
      architecture: {
        pattern: 'Microservice',
        entryPoints: [{ path: 'server/index.js' }]
      },
      structure: {
        classifiedDirectories: [
          { path: 'services', name: 'services', role: 'Business Logic', category: 'core', description: 'Domain services' },
          { path: 'server', name: 'server', role: 'API Server', category: 'api', description: 'Express server' }
        ]
      },
      aiContextReady: {
        filePaths: ['server/index.js', 'services/auth.js', 'tests/auth.test.js']
      }
    };

    const TARGET_SOURCES = {
      'services/auth.js': [
        "export function verifyToken(token) {",
        "  return checkExpiry(token);",
        "}",
        "export function checkExpiry(t) {",
        "  return Boolean(t);",
        "}"
      ].join('\n'),
      'server/index.js': [
        "import { verifyToken } from '../services/auth.js';",
        "export function handleRequest(req) {",
        "  return verifyToken(req.token);",
        "}"
      ].join('\n'),
      'tests/auth.test.js': [
        "import { verifyToken } from '../services/auth.js';",
        "it('validates token expiry correctly', () => {",
        "  verifyToken('abc');",
        "});"
      ].join('\n')
    };

    const TARGET_COMMITS = [
      {
        sha: '1122334455667788',
        shortSha: '1122334',
        message: 'Fix token verification edge case',
        author: 'alice',
        date: '2026-10-10T10:00:00Z',
        files: [
          {
            path: 'services/auth.js',
            status: 'modified',
            additions: 2,
            deletions: 1,
            changedRanges: [{ startLine: 1, endLine: 2 }]
          }
        ]
      }
    ];

    await ingestFalkorDBRepositoryAnalysis(TARGET_ANALYSIS, {
      env: LIVE_ENV,
      graph: TEST_GRAPH,
      sourceContents: TARGET_SOURCES,
      commits: TARGET_COMMITS
    });

    // 3. Record a Bug & Fix for acme/widget-service
    await recordFalkorDBMemoryEntry(
      {
        repoFullName: 'acme/widget-service',
        bugTitle: 'Token Replay Flaw',
        bugDescription: 'Revoked tokens could be reused within 5 minute cache window',
        severity: 'high',
        symptoms: 'HTTP 200 on revoked credentials',
        filePath: 'services/auth.js',
        componentPath: 'services',
        fixSummary: 'Revocation Cache Validation',
        fixDescription: 'Check Redis blacklist on every auth verification',
        commitSha: '1122334455667788',
        decisionTitle: 'Use Redis Token Blacklist',
        decisionRationale: 'Sub-millisecond revocation lookups across all service instances'
      },
      { env: LIVE_ENV, graph: TEST_GRAPH }
    );

    // 4. Ingest hard-negative entity for an unrelated repository (other-org/billing-service)
    const HARD_NEGATIVE_ANALYSIS = {
      repository: {
        fullName: 'other-org/billing-service',
        owner: 'other-org',
        repo: 'billing-service',
        branch: 'main'
      },
      projectType: 'Payment Microservice',
      structure: {
        classifiedDirectories: [{ path: 'payments', name: 'payments', role: 'Payment Gateway' }]
      },
      aiContextReady: { filePaths: ['payments/gateway.js'] }
    };

    const HARD_NEGATIVE_SOURCES = {
      'payments/gateway.js': [
        "export function processStripePayment(charge) {",
        "  return charge.execute();",
        "}"
      ].join('\n')
    };

    await ingestFalkorDBRepositoryAnalysis(HARD_NEGATIVE_ANALYSIS, {
      env: LIVE_ENV,
      graph: TEST_GRAPH,
      sourceContents: HARD_NEGATIVE_SOURCES,
      commits: []
    });

    await recordFalkorDBMemoryEntry(
      {
        repoFullName: 'other-org/billing-service',
        bugTitle: 'Payment Gateway Timeout',
        bugDescription: 'Stripe webhook timeout during checkout',
        severity: 'critical',
        symptoms: 'HTTP 504 on /checkout',
        filePath: 'payments/gateway.js',
        componentPath: 'payments'
      },
      { env: LIVE_ENV, graph: TEST_GRAPH }
    );
  });

  after(async () => {
    try {
      if (testGraphHandle && typeof testGraphHandle.delete === 'function') {
        await testGraphHandle.delete();
      }
    } catch (err) {
      console.warn(`[Live Phase 3 Cleanup] Notice: Could not delete temporary test graph ${TEST_GRAPH}:`, err.message);
    } finally {
      resetFalkorDBSchemaCacheForTesting();
      await closeClient();
    }
  });

  it('1. Retrieves contextual graph evidence matching developer question', async () => {
    const context = await retrieveFalkorDBGraphContextForQuestion(
      'acme/widget-service',
      'how does token verification and revocation work?',
      { env: LIVE_ENV, graph: TEST_GRAPH }
    );

    assert.equal(context.available, true);
    assert.equal(context.repoFullName, 'acme/widget-service');
    assert.equal(context.hasEvidence, true);

    // Verified bugs & fixes
    assert.ok(context.bugsAndFixes.length >= 1);
    const tokenBug = context.bugsAndFixes.find(b => b.title === 'Token Replay Flaw');
    assert.ok(tokenBug, 'Expected Token Replay Flaw bug to be retrieved');
    assert.equal(tokenBug.fixSummary, 'Revocation Cache Validation');
    assert.equal(tokenBug.commitSha, '1122334455667788');

    // Verified decisions
    assert.ok(context.decisions.length >= 1);
    const dec = context.decisions.find(d => d.title === 'Use Redis Token Blacklist');
    assert.ok(dec, 'Expected Use Redis Token Blacklist decision');

    // Verified symbols & calls
    assert.ok(context.symbols.length >= 1);
    const verifySym = context.symbols.find(s => s.name === 'verifyToken');
    assert.ok(verifySym, 'Expected verifyToken symbol');
    assert.ok(verifySym.callsSymbols.includes('checkExpiry'));
    assert.ok(verifySym.calledBySymbols.includes('handleRequest'));
    assert.ok(verifySym.coveredByTests.includes('validates token expiry correctly'));

    // Verified component dependencies
    assert.ok(context.componentDependencies.length >= 1);
    const dep = context.componentDependencies.find(d => d.sourceComponent === 'server' && d.targetComponent === 'services');
    assert.ok(dep, 'Expected server -> services component dependency');

    // Verified recent commits
    assert.ok(context.recentCommits.length >= 1);
    const c = context.recentCommits.find(cm => cm.shortSha === '1122334');
    assert.ok(c, 'Expected commit 1122334');
  });

  it('2. Enforces strict repository isolation and excludes hard-negative entities', async () => {
    const context = await retrieveFalkorDBGraphContextForQuestion(
      'acme/widget-service',
      'checkout stripe payment gateway timeout',
      { env: LIVE_ENV, graph: TEST_GRAPH }
    );

    // Hard negatives from other-org/billing-service must never leak into acme/widget-service retrieval
    assert.equal(
      context.bugsAndFixes.some(b => b.title.includes('Payment Gateway Timeout')),
      false,
      'Bugs from other repositories must not leak into results'
    );
    assert.equal(
      context.symbols.some(s => s.name.includes('processStripePayment')),
      false,
      'Symbols from other repositories must not leak into results'
    );
    assert.equal(
      context.decisions.some(d => d.componentPath?.includes('payments')),
      false,
      'Decisions from other repositories must not leak into results'
    );
  });

  it('3. Multi-hop traversal returns connected evidence and preserves provenance', async () => {
    const overview = await getFalkorDBRepositoryMemoryOverview(
      'acme/widget-service',
      { env: LIVE_ENV, graph: TEST_GRAPH, query: 'auth' }
    );

    assert.equal(overview.available, true);
    assert.equal(overview.status, 'connected');
    assert.ok(overview.counts.files >= 3);
    assert.ok(overview.counts.symbols >= 3);
    assert.ok(overview.counts.bugs >= 1);
    assert.ok(overview.counts.fixes >= 1);
    assert.ok(overview.counts.decisions >= 1);

    // Verify graph nodes & edges structure
    const { nodes, edges } = overview.graph;
    assert.ok(nodes.length >= 5);
    assert.ok(edges.length >= 4);

    // Every node has provenance
    for (const n of nodes) {
      assert.ok(n.provenance, `Node ${n.id} must have provenance`);
      assert.ok(n.title, `Node ${n.id} must have title`);
    }

    // Edges connect the chain
    const hasCallEdge = edges.some(e => e.type === 'SYMBOL_CALLS_SYMBOL');
    assert.ok(hasCallEdge, 'Graph explorer must contain SYMBOL_CALLS_SYMBOL edge');

    const hasTestEdge = edges.some(e => e.type === 'TEST_COVERS_SYMBOL');
    assert.ok(hasTestEdge, 'Graph explorer must contain TEST_COVERS_SYMBOL edge');

    const hasFixEdge = edges.some(e => e.type === 'FIX_RESOLVES_BUG');
    assert.ok(hasFixEdge, 'Graph explorer must contain FIX_RESOLVES_BUG edge');
  });

  it('4. Enforces result limits and bounds context correctly', async () => {
    const bounded = await retrieveFalkorDBGraphContextForQuestion(
      'acme/widget-service',
      'auth token',
      {
        env: LIVE_ENV,
        graph: TEST_GRAPH,
        maxBugs: 1,
        maxSymbols: 1,
        maxCommits: 1
      }
    );

    assert.ok(bounded.bugsAndFixes.length <= 1, 'maxBugs limit must be enforced');
    assert.ok(bounded.symbols.length <= 1, 'maxSymbols limit must be enforced');
    assert.ok(bounded.recentCommits.length <= 1, 'maxCommits limit must be enforced');
  });

  it('5. Handles unknown repository and empty inputs gracefully', async () => {
    const unknown = await retrieveFalkorDBGraphContextForQuestion(
      'nonexistent/repository',
      'any question',
      { env: LIVE_ENV, graph: TEST_GRAPH }
    );

    assert.equal(unknown.available, true);
    assert.equal(unknown.hasEvidence, false);
    assert.equal(unknown.bugsAndFixes.length, 0);
    assert.equal(unknown.symbols.length, 0);
  });

  it('6. Repeated retrieval is deterministic and returns identical results', async () => {
    const run1 = await retrieveFalkorDBGraphContextForQuestion(
      'acme/widget-service',
      'token verification',
      { env: LIVE_ENV, graph: TEST_GRAPH }
    );
    const run2 = await retrieveFalkorDBGraphContextForQuestion(
      'acme/widget-service',
      'token verification',
      { env: LIVE_ENV, graph: TEST_GRAPH }
    );

    assert.deepEqual(run1.bugsAndFixes, run2.bugsAndFixes);
    assert.deepEqual(run1.symbols, run2.symbols);
    assert.deepEqual(run1.decisions, run2.decisions);
  });

  it('7. Formats live evidence markdown for AI prompt grounding', async () => {
    const context = await retrieveFalkorDBGraphContextForQuestion(
      'acme/widget-service',
      'how does token verification work?',
      { env: LIVE_ENV, graph: TEST_GRAPH }
    );

    const md = formatFalkorDBGraphEvidenceMarkdown(context);
    assert.ok(md.includes('FalkorDB Project Memory Graph Evidence'));
    assert.ok(md.includes('Token Replay Flaw'));
    assert.ok(md.includes('verifyToken'));
    assert.ok(md.includes('Calls: `checkExpiry`'));
    assert.ok(md.includes('Covered by tests: "validates token expiry correctly"'));
  });
});

describe('FailureChain Phase 4: Live End-to-End Application Workflow', { skip: skipReason }, () => {
  const TEST_GRAPH = `live_e2e_phase4_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let testGraphHandle = null;

  const E2E_ENV = {
    ...LIVE_ENV,
    GRAPH_DATABASE_PROVIDER: 'falkordb',
    FALKORDB_GRAPH: TEST_GRAPH
  };

  before(async () => {
    resetFalkorDBSchemaCacheForTesting();
    const client = await getClient({ env: E2E_ENV });
    testGraphHandle = client.selectGraph(TEST_GRAPH);
  });

  after(async () => {
    try {
      if (testGraphHandle && typeof testGraphHandle.delete === 'function') {
        await testGraphHandle.delete();
      }
    } catch (err) {
      console.warn(`[Live Phase 4 Cleanup] Notice: Could not delete temporary test graph ${TEST_GRAPH}:`, err.message);
    } finally {
      resetFalkorDBSchemaCacheForTesting();
      await closeClient();
    }
  });

  const SYNTHETIC_REPO = {
    repository: {
      fullName: 'acme/incident-service',
      owner: 'acme',
      repo: 'incident-service',
      branch: 'main',
      primaryLanguage: 'JavaScript',
      description: 'Incident response and correlation backend'
    },
    projectType: 'Node.js Microservice',
    architecture: {
      pattern: 'Event-Driven Microservice',
      entryPoints: [{ path: 'server/index.js' }]
    },
    structure: {
      classifiedDirectories: [
        { path: 'services', name: 'services', role: 'Correlation Engine', category: 'core', description: 'Failure correlation logic' },
        { path: 'server', name: 'server', role: 'API Server', category: 'api', description: 'HTTP endpoints' }
      ]
    },
    aiContextReady: {
      filePaths: ['server/index.js', 'services/correlator.js', 'tests/correlator.test.js']
    }
  };

  const SYNTHETIC_SOURCES = {
    'services/correlator.js': [
      "export function correlateFailure(incident) {",
      "  return computeRootCause(incident);",
      "}",
      "export function computeRootCause(inc) {",
      "  return Boolean(inc.id);",
      "}"
    ].join('\n'),
    'server/index.js': [
      "import { correlateFailure } from '../services/correlator.js';",
      "export function handleIncident(req) {",
      "  return correlateFailure(req.incident);",
      "}"
    ].join('\n'),
    'tests/correlator.test.js': [
      "import { correlateFailure } from '../services/correlator.js';",
      "it('correlates failure cascades accurately', () => {",
      "  correlateFailure({ id: 'inc-100' });",
      "});"
    ].join('\n')
  };

  const SYNTHETIC_COMMITS = [
    {
      sha: 'ccddeeff00112233',
      shortSha: 'ccddeef',
      message: 'Improve cascade root cause correlation',
      author: 'carol',
      date: '2026-10-14T08:00:00Z',
      files: [
        {
          path: 'services/correlator.js',
          status: 'modified',
          additions: 5,
          deletions: 1,
          changedRanges: [{ startLine: 1, endLine: 3 }]
        }
      ]
    }
  ];

  it('1. Verifies health check routing detects FalkorDB as active provider', async () => {
    const health = await getGraphHealth({ env: E2E_ENV });
    assert.equal(health.provider, 'falkordb');
    assert.equal(health.connected, true);
    assert.equal(health.status, 'connected');
    assert.equal(health.graph, TEST_GRAPH);
  });

  it('2. Initializes schema and ingests synthetic repository into FalkorDB', async () => {
    await ensureFalkorDBSchema({
      env: E2E_ENV,
      graph: TEST_GRAPH,
      force: true
    });

    const ingestRes = await ingestRepositoryToGraph(SYNTHETIC_REPO, {
      env: E2E_ENV,
      graph: TEST_GRAPH,
      sourceContents: SYNTHETIC_SOURCES,
      commits: SYNTHETIC_COMMITS
    });

    assert.equal(ingestRes.ingested, true);
    assert.equal(ingestRes.status, 'ingested');
    assert.equal(ingestRes.repositoryId, 'acme/incident-service');
    assert.equal(ingestRes.counts.files, 3);
    assert.equal(ingestRes.counts.symbols, 3);
    assert.equal(ingestRes.counts.tests, 1);
    assert.equal(ingestRes.counts.commits, 1);
  });

  it('3. Requests repository overview and verifies connected graph nodes, edges, and provenance', async () => {
    const overview = await getRepositoryOverview('acme/incident-service', {
      env: E2E_ENV,
      graph: TEST_GRAPH
    });

    assert.equal(overview.available, true);
    assert.equal(overview.connected, true);
    assert.equal(overview.status, 'connected');
    assert.equal(overview.repoFullName, 'acme/incident-service');
    assert.equal(overview.counts.files, 3);
    assert.equal(overview.counts.symbols, 3);
    assert.equal(overview.counts.commits, 1);

    const { nodes, edges } = overview.graph;
    assert.ok(nodes.length >= 6);
    assert.ok(edges.length >= 4);

    // Assert provenance tags
    for (const n of nodes) {
      assert.ok(n.provenance, `Node ${n.id} must have provenance tag`);
    }

    const callEdge = edges.find(e => e.type === 'SYMBOL_CALLS_SYMBOL');
    assert.ok(callEdge, 'Must have SYMBOL_CALLS_SYMBOL edge');
    assert.ok(callEdge.details.provenance);

    const testEdge = edges.find(e => e.type === 'TEST_COVERS_SYMBOL');
    assert.ok(testEdge, 'Must have TEST_COVERS_SYMBOL edge');

    const commitEdge = edges.find(e => e.type === 'COMMIT_CHANGED_FILE');
    assert.ok(commitEdge, 'Must have COMMIT_CHANGED_FILE edge');
  });

  it('4. Asks developer question through AI provider and verifies prompt receives FalkorDB evidence', async () => {
    let capturedSystemInstruction = null;
    let capturedPrompt = null;

    const mockAIProvider = new AIProvider({
      apiKey: 'test-e2e-gemini-key',
      fetchImpl: async (url, init) => {
        const body = JSON.parse(init.body);
        capturedSystemInstruction = body.systemInstruction?.parts?.[0]?.text;
        capturedPrompt = body.contents?.[0]?.parts?.[0]?.text;

        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: `### Confirmed Facts\n- \`correlateFailure\` calls \`computeRootCause\` in \`services/correlator.js:L1-L3\`.\n- Covered by test "correlates failure cascades accurately".`
                    }
                  ]
                }
              }
            ]
          })
        };
      }
    });

    const answerRes = await mockAIProvider.answerQuestion(
      'How does failure correlation work?',
      SYNTHETIC_REPO,
      { env: E2E_ENV, graph: TEST_GRAPH }
    );

    assert.equal(answerRes.available, true);
    assert.ok(answerRes.answer.includes('Confirmed Facts'));

    // Verify system instruction strictly requires FalkorDB evidence
    assert.ok(
      capturedSystemInstruction.includes('FalkorDB Project Memory Graph Evidence'),
      'AI system prompt must instruct grounding on FalkorDB Project Memory'
    );

    // Verify prompt contains graph facts extracted from live FalkorDB
    assert.ok(capturedPrompt.includes('correlateFailure'), 'Prompt must contain correlateFailure symbol');
    assert.ok(capturedPrompt.includes('computeRootCause'), 'Prompt must contain computeRootCause symbol');
    assert.ok(capturedPrompt.includes('correlates failure cascades accurately'), 'Prompt must contain test reference');
    assert.ok(capturedPrompt.includes('services/correlator.js'), 'Prompt must contain file path');
  });

  it('5. Records a Bug + Fix memory entry and retrieves it in a fresh request', async () => {
    const recordRes = await recordMemoryEntry(
      {
        repoFullName: 'acme/incident-service',
        bugTitle: 'Cascade Recursion Exhaustion',
        bugDescription: 'Cyclic call graph triggers stack overflow during correlation',
        severity: 'high',
        symptoms: 'RangeError: Maximum call stack size exceeded',
        filePath: 'services/correlator.js',
        componentPath: 'services',
        fixSummary: 'Cycle Detection Cache',
        fixDescription: 'Maintain a visited incident set to abort cycles',
        commitSha: 'ccddeeff00112233'
      },
      { env: E2E_ENV, graph: TEST_GRAPH }
    );

    assert.equal(recordRes.recorded, true);
    assert.equal(recordRes.type, 'bug_fix');
    assert.ok(recordRes.bugId);
    assert.ok(recordRes.fixId);

    // Fresh retrieval (Simulating subsequent HTTP request)
    const freshContext = await retrieveGraphContext(
      'acme/incident-service',
      'cycle recursion stack overflow',
      { env: E2E_ENV, graph: TEST_GRAPH }
    );

    assert.equal(freshContext.available, true);
    assert.equal(freshContext.hasEvidence, true);
    const recordedBug = freshContext.bugsAndFixes.find(b => b.title === 'Cascade Recursion Exhaustion');
    assert.ok(recordedBug, 'Recorded bug must be retrieved');
    assert.equal(recordedBug.fixSummary, 'Cycle Detection Cache');
    assert.equal(recordedBug.commitSha, 'ccddeeff00112233');
  });

  it('6. Proves persistence across repeated independent query executions', async () => {
    // Second fresh retrieval proves persistence in FalkorDB storage, not in-memory cache
    const secondContext = await retrieveGraphContext(
      'acme/incident-service',
      'cascade recursion',
      { env: E2E_ENV, graph: TEST_GRAPH }
    );

    assert.equal(secondContext.available, true);
    const bug = secondContext.bugsAndFixes.find(b => b.title === 'Cascade Recursion Exhaustion');
    assert.ok(bug, 'Bug must persist across independent calls');
    assert.equal(bug.status, 'resolved');
  });

  it('7. Enforces repository isolation against hard-negative repository', async () => {
    // Ingest unrelated repo into same graph
    await ingestRepositoryToGraph(
      {
        repository: { fullName: 'unrelated/auth-service' },
        structure: { classifiedDirectories: [] },
        aiContextReady: { filePaths: [] }
      },
      {
        env: E2E_ENV,
        graph: TEST_GRAPH,
        sourceContents: {},
        commits: []
      }
    );

    await recordMemoryEntry(
      {
        repoFullName: 'unrelated/auth-service',
        bugTitle: 'OAuth Secret Leak',
        bugDescription: 'Plaintext secret in query param',
        severity: 'critical'
      },
      { env: E2E_ENV, graph: TEST_GRAPH }
    );

    // Query incident-service
    const context = await retrieveGraphContext(
      'acme/incident-service',
      'oauth secret leak',
      { env: E2E_ENV, graph: TEST_GRAPH }
    );

    const hasLeakedBug = context.bugsAndFixes.some(b => b.title.includes('OAuth Secret Leak'));
    assert.equal(hasLeakedBug, false, 'Unrelated repository bug must NEVER appear in target repository context');
  });
});

describe('FailureChain Phase 4.1: Real Express HTTP Route Integration Suite', { skip: skipReason }, () => {
  const TEST_GRAPH = `live_http_phase41_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let server = null;
  let baseUrl = '';
  let savedEnv = {};

  before(async () => {
    savedEnv = {
      GRAPH_DATABASE_PROVIDER: process.env.GRAPH_DATABASE_PROVIDER,
      FALKORDB_HOST: process.env.FALKORDB_HOST,
      FALKORDB_PORT: process.env.FALKORDB_PORT,
      FALKORDB_GRAPH: process.env.FALKORDB_GRAPH,
      FALKORDB_PASSWORD: process.env.FALKORDB_PASSWORD,
      HEALTH_CHECK_TOKEN: process.env.HEALTH_CHECK_TOKEN
    };

    process.env.GRAPH_DATABASE_PROVIDER = 'falkordb';
    process.env.FALKORDB_HOST = LIVE_HOST;
    process.env.FALKORDB_PORT = String(LIVE_PORT);
    process.env.FALKORDB_GRAPH = TEST_GRAPH;
    process.env.FALKORDB_PASSWORD = LIVE_PASSWORD;
    delete process.env.HEALTH_CHECK_TOKEN;

    resetFalkorDBSchemaCacheForTesting();

    await new Promise(resolve => {
      server = app.listen(0, () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    try {
      const client = await getClient({
        env: {
          FALKORDB_HOST: LIVE_HOST,
          FALKORDB_PORT: String(LIVE_PORT),
          FALKORDB_PASSWORD: LIVE_PASSWORD
        }
      });
      const graph = client.selectGraph(TEST_GRAPH);
      if (typeof graph.delete === 'function') {
        await graph.delete();
      }
    } catch (err) {
      console.warn(`[Live Phase 4.1 HTTP Cleanup] Notice: Could not delete graph ${TEST_GRAPH}:`, err.message);
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      resetFalkorDBSchemaCacheForTesting();
      await closeClient();
    }
  });

  it('1. Exercises GET /api/memory/health via HTTP (public and protected modes)', async () => {
    // Public health check
    const res = await fetch(`${baseUrl}/api/memory/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.provider, 'falkordb');
    assert.equal(body.connected, true);
    assert.equal(body.configured, true);
    assert.equal(body.status, 'connected');
    assert.equal(body.graph, TEST_GRAPH);

    // Protected mode with HEALTH_CHECK_TOKEN
    process.env.HEALTH_CHECK_TOKEN = 'test-phase41-guard-token';

    const unauthRes = await fetch(`${baseUrl}/api/memory/health`);
    assert.equal(unauthRes.status, 401);
    const unauthBody = await unauthRes.json();
    assert.equal(unauthBody.status, 'unauthorized');

    const wrongTokenRes = await fetch(`${baseUrl}/api/memory/health`, {
      headers: { 'x-health-token': 'wrong-token' }
    });
    assert.equal(wrongTokenRes.status, 401);

    const authRes = await fetch(`${baseUrl}/api/memory/health`, {
      headers: { 'x-health-token': 'test-phase41-guard-token' }
    });
    assert.equal(authRes.status, 200);
    const authBody = await authRes.json();
    assert.equal(authBody.connected, true);

    delete process.env.HEALTH_CHECK_TOKEN;
  });

  it('2. Exercises POST /api/memory/ingest via HTTP (validation, valid ingestion, empty repo)', async () => {
    // 2a. Validation failure on empty or missing body
    const badRes = await fetch(`${baseUrl}/api/memory/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(badRes.status, 400);
    const badBody = await badRes.json();
    assert.ok(badBody.error.includes('Valid repository analysis object is required'));

    // 2b. Ingest valid repository analysis via HTTP POST
    const validRes = await fetch(`${baseUrl}/api/memory/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        analysis: {
          repository: {
            fullName: 'acme/queue-service',
            owner: 'acme',
            repo: 'queue-service',
            branch: 'main',
            primaryLanguage: 'JavaScript',
            description: 'Queue service for event ingestion'
          },
          projectType: 'Node.js Service',
          architecture: {
            pattern: 'Queue Worker',
            entryPoints: [{ path: 'server/index.js' }]
          },
          structure: {
            classifiedDirectories: [
              { path: 'services', name: 'services', role: 'Worker Engine', category: 'core', description: 'Worker logic' }
            ]
          },
          aiContextReady: {
            filePaths: ['server/index.js', 'services/worker.js', 'tests/worker.test.js']
          }
        },
        sourceContents: {
          'services/worker.js': "export function processJob(job) { return executeTask(job); }\nexport function executeTask(j) { return Boolean(j); }",
          'server/index.js': "import { processJob } from '../services/worker.js';\nexport function run() { processJob({ id: 1 }); }",
          'tests/worker.test.js': "import { processJob } from '../services/worker.js';\nit('processes job cleanly', () => { processJob({ id: 1 }); });"
        },
        commits: [
          {
            sha: 'aa11bb22cc334455',
            shortSha: 'aa11bb2',
            message: 'Add worker pipeline',
            author: 'alice',
            date: '2026-10-14T09:00:00Z',
            files: [{ path: 'services/worker.js', status: 'modified', additions: 3, deletions: 1, changedRanges: [{ startLine: 1, endLine: 2 }] }]
          }
        ]
      })
    });

    assert.equal(validRes.status, 200);
    const validBody = await validRes.json();
    assert.equal(validBody.ingested, true);
    assert.equal(validBody.status, 'ingested');
    assert.equal(validBody.repositoryId, 'acme/queue-service');
    assert.equal(validBody.counts.files, 3);
    assert.equal(validBody.counts.symbols, 3);
    assert.equal(validBody.counts.tests, 1);
    assert.equal(validBody.counts.commits, 1);

    // 2c. Empty repository ingestion via HTTP POST
    const emptyRes = await fetch(`${baseUrl}/api/memory/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        analysis: {
          repository: { fullName: 'acme/empty-test-repo' }
        }
      })
    });
    assert.equal(emptyRes.status, 200);
    const emptyBody = await emptyRes.json();
    assert.equal(emptyBody.ingested, true);
    assert.equal(emptyBody.counts.files, 0);
  });

  it('3. Exercises GET /api/memory/overview via HTTP and verifies un-inflated counts', async () => {
    // Missing repo parameter
    const missingRes = await fetch(`${baseUrl}/api/memory/overview`);
    assert.equal(missingRes.status, 400);

    // Malformed repo parameter
    const malformedRes = await fetch(`${baseUrl}/api/memory/overview?repo=notanownerrepo`);
    assert.equal(malformedRes.status, 400);

    // Valid overview request
    const overviewRes = await fetch(`${baseUrl}/api/memory/overview?repo=acme/queue-service`);
    assert.equal(overviewRes.status, 200);
    const body = await overviewRes.json();

    assert.equal(body.available, true);
    assert.equal(body.connected, true);
    assert.equal(body.status, 'connected');
    assert.equal(body.repoFullName, 'acme/queue-service');
    assert.equal(body.counts.files, 3);
    assert.equal(body.counts.symbols, 3);
    assert.equal(body.counts.commits, 1);

    // Verify graph structure and provenance
    assert.ok(Array.isArray(body.graph.nodes));
    assert.ok(Array.isArray(body.graph.edges));
    for (const node of body.graph.nodes) {
      assert.ok(node.provenance, `Node ${node.id} must carry provenance`);
    }
  });

  it('4. Exercises POST /api/memory/record via HTTP and verifies idempotent recording', async () => {
    // 4a. Invalid body (missing fields)
    const badRes = await fetch(`${baseUrl}/api/memory/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoFullName: 'acme/queue-service' })
    });
    assert.equal(badRes.status, 400);

    // 4b. Valid record
    const recordPayload = {
      repoFullName: 'acme/queue-service',
      type: 'bug_fix',
      bugTitle: 'Deadlock in Worker Batch',
      bugDescription: 'Worker threads deadlocked on unbuffered channel',
      severity: 'critical',
      filePath: 'services/worker.js',
      componentPath: 'services',
      fixSummary: 'Enforce channel buffer size',
      fixDescription: 'Allocate buffered channel with capacity 100',
      commitSha: 'aa11bb22cc334455'
    };

    const firstRes = await fetch(`${baseUrl}/api/memory/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recordPayload)
    });
    assert.equal(firstRes.status, 201);
    const firstBody = await firstRes.json();
    assert.equal(firstBody.recorded, true);
    assert.equal(firstBody.type, 'bug_fix');
    assert.equal(firstBody.repoFullName, 'acme/queue-service');
    assert.ok(firstBody.bugId);
    assert.ok(firstBody.fixId);

    // 4c. Repeated recording of the exact same entry
    const secondRes = await fetch(`${baseUrl}/api/memory/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recordPayload)
    });
    assert.equal(secondRes.status, 201);

    // Verify counts in overview are NOT inflated
    const overviewRes = await fetch(`${baseUrl}/api/memory/overview?repo=acme/queue-service`);
    const overviewBody = await overviewRes.json();

    assert.equal(overviewBody.counts.bugs, 1, 'Bug count must not duplicate on repeated recording');
    assert.equal(overviewBody.counts.fixes, 1, 'Fix count must not duplicate on repeated recording');

    const bugNodes = overviewBody.graph.nodes.filter(n => n.type === 'Bug');
    const fixNodes = overviewBody.graph.nodes.filter(n => n.type === 'Fix');
    assert.equal(bugNodes.length, 1, 'Bug node must not duplicate in graph explorer');
    assert.equal(fixNodes.length, 1, 'Fix node must not duplicate in graph explorer');

    const resolveEdges = overviewBody.graph.edges.filter(e => e.type === 'FIX_RESOLVES_BUG');
    assert.equal(resolveEdges.length, 1, 'FIX_RESOLVES_BUG edge must be singular and not duplicated');
    assert.equal(resolveEdges[0].source, fixNodes[0].id, 'Source of FIX_RESOLVES_BUG must be Fix');
    assert.equal(resolveEdges[0].target, bugNodes[0].id, 'Target of FIX_RESOLVES_BUG must be Bug');
  });

  it('5. Exercises GET /api/memory/context via HTTP', async () => {
    // Missing repo parameter
    const missingRes = await fetch(`${baseUrl}/api/memory/context`);
    assert.equal(missingRes.status, 400);

    // Valid context query
    const contextRes = await fetch(`${baseUrl}/api/memory/context?repo=acme/queue-service&q=deadlock+channel`);
    assert.equal(contextRes.status, 200);
    const body = await contextRes.json();

    assert.equal(body.available, true);
    assert.equal(body.repoFullName, 'acme/queue-service');
    assert.ok(body.bugsAndFixes.length >= 1);
    const recordedBug = body.bugsAndFixes.find(b => b.title === 'Deadlock in Worker Batch');
    assert.ok(recordedBug, 'Recorded bug must be retrieved via HTTP');
    assert.equal(recordedBug.fixSummary, 'Enforce channel buffer size');
  });

  it('6. Handles database failure and redacts credentials over HTTP endpoints', async () => {
    const SECRET_PW = 'verySecretFalkorPassword789';
    process.env.FALKORDB_PORT = '59998'; // Unreachable port
    process.env.FALKORDB_PASSWORD = SECRET_PW;

    try {
      // 6a. Health endpoint reports 503 and redacts password
      const healthRes = await fetch(`${baseUrl}/api/memory/health`);
      assert.equal(healthRes.status, 503);
      const healthBody = await healthRes.json();
      assert.equal(healthBody.connected, false);
      const healthJsonStr = JSON.stringify(healthBody);
      assert.equal(healthJsonStr.includes(SECRET_PW), false, 'Password must never leak in health response');

      // 6b. Record endpoint reports 503 or 500 and redacts password
      const recordRes = await fetch(`${baseUrl}/api/memory/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoFullName: 'acme/queue-service',
          bugTitle: 'Fail Test',
          bugDescription: 'Should fail due to unreachable db'
        })
      });
      assert.ok(recordRes.status >= 500, 'Must return 5xx when database is unreachable');
      const recordBody = await recordRes.json();
      const recordJsonStr = JSON.stringify(recordBody);
      assert.equal(recordJsonStr.includes(SECRET_PW), false, 'Password must never leak in record error response');
    } finally {
      process.env.FALKORDB_PORT = String(LIVE_PORT);
      process.env.FALKORDB_PASSWORD = LIVE_PASSWORD;
    }
  });
});

describe('FailureChain Phase 5: Live Incident Investigation & Fresh Memory Recall', { skip: skipReason }, () => {
  const TEST_GRAPH = `live_phase5_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let server = null;
  let baseUrl = '';
  let savedEnv = {};

  before(async () => {
    savedEnv = {
      GRAPH_DATABASE_PROVIDER: process.env.GRAPH_DATABASE_PROVIDER,
      FALKORDB_HOST: process.env.FALKORDB_HOST,
      FALKORDB_PORT: process.env.FALKORDB_PORT,
      FALKORDB_GRAPH: process.env.FALKORDB_GRAPH,
      FALKORDB_PASSWORD: process.env.FALKORDB_PASSWORD
    };

    process.env.GRAPH_DATABASE_PROVIDER = 'falkordb';
    process.env.FALKORDB_HOST = LIVE_HOST;
    process.env.FALKORDB_PORT = String(LIVE_PORT);
    process.env.FALKORDB_GRAPH = TEST_GRAPH;
    process.env.FALKORDB_PASSWORD = LIVE_PASSWORD;

    resetFalkorDBSchemaCacheForTesting();

    await new Promise(resolve => {
      server = app.listen(0, () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    try {
      const client = await getClient({
        env: {
          FALKORDB_HOST: LIVE_HOST,
          FALKORDB_PORT: String(LIVE_PORT),
          FALKORDB_PASSWORD: LIVE_PASSWORD
        }
      });
      const graph = client.selectGraph(TEST_GRAPH);
      if (typeof graph.delete === 'function') {
        await graph.delete();
      }
    } catch (err) {
      console.warn(`[Live Phase 5 Cleanup] Could not delete graph ${TEST_GRAPH}:`, err.message);
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      resetFalkorDBSchemaCacheForTesting();
      await closeClient();
    }
  });

  let investigationOutcome = null;

  it('1. Enforces read-only GET /api/incident/seed and state-changing POST /api/incident/seed', async () => {
    // 1a. GET is strictly read-only inspection (zero database mutations)
    const getRes = await fetch(`${baseUrl}/api/incident/seed`);
    assert.equal(getRes.status, 200);
    const getBody = await getRes.json();
    assert.equal(getBody.success, true);
    assert.equal(getBody.seeded, false, 'GET must be read-only inspection and not perform state mutations');
    assert.equal(getBody.repository.fullName, 'acme/payment-gateway');
    assert.equal(getBody.misleadingSurfaceSuspect, 'services/rateLimiter.js');

    // 1b. POST performs state-changing idempotent seeding
    const postRes = await fetch(`${baseUrl}/api/incident/seed`, { method: 'POST' });
    assert.equal(postRes.status, 200);
    const postBody = await postRes.json();
    assert.equal(postBody.success, true);
    assert.equal(postBody.seeded, true, 'POST must perform state mutation and seed the fixture');
    assert.equal(postBody.repository.fullName, 'acme/payment-gateway');
    assert.equal(postBody.misleadingSurfaceSuspect, 'services/rateLimiter.js');

    // 1c. Repeated POST seeding is strictly idempotent
    const repeatRes = await fetch(`${baseUrl}/api/incident/seed`, { method: 'POST' });
    assert.equal(repeatRes.status, 200);
    const repeatBody = await repeatRes.json();
    assert.equal(repeatBody.success, true);
    assert.equal(repeatBody.seeded, true);
  });

  it('2. Executes graph-native multi-hop investigation and proves rejection of decoy symptom', async () => {
    const res = await fetch(`${baseUrl}/api/incident/investigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        report: SYNTHETIC_INCIDENT_FIXTURE.incidentReport,
        analysis: SYNTHETIC_INCIDENT_FIXTURE
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    investigationOutcome = body;

    // A. Verify keyword baseline falsely points to decoy
    assert.equal(body.keywordBaseline.topSuspectFile, 'services/rateLimiter.js');

    // B. Verify connected graph diagnosis pinpoints true root cause
    assert.equal(body.diagnosis.rootCauseFile, 'services/tokenBucket.js');
    assert.equal(body.diagnosis.rootCauseSymbol, 'acquireTokenLock');
    assert.equal(body.diagnosis.confidence, 'HIGH');

    // C. Verify multi-hop evidence chain
    assert.ok(body.connectedEvidence.evidenceChain.length >= 4);
    assert.ok(body.connectedEvidence.connectedFiles.includes('services/tokenBucket.js'));
    assert.ok(body.diagnosis.summary.includes('Competing Hypotheses Evaluated'));
    assert.ok(body.diagnosis.summary.includes('Explicit Uncertainty'));
  });

  it('3. Simulates recovery safely without modifying repository or production systems', async () => {
    const res = await fetch(`${baseUrl}/api/incident/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        investigation: investigationOutcome,
        action: 'revert_blocking_mutex'
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.simulated, true);
    assert.equal(body.safe, true);
    assert.equal(body.riskLevel, 'LOW');
    assert.equal(body.blastRadius.filesCount, 2);
    assert.ok(body.blastRadius.files.includes('services/tokenBucket.js'));
    assert.ok(body.blastRadius.files.includes('services/auth.js'));
    assert.ok(body.simulatedDiff.includes('tryAcquireWithTimeout'));
  });

  it('4. Records confirmed investigation outcome to live FalkorDB graph memory', async () => {
    const res = await fetch(`${baseUrl}/api/incident/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ investigation: investigationOutcome })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.recorded, true);
    assert.equal(body.repoFullName, 'acme/payment-gateway');
  });

  it('5. Verifies fresh-request memory recall: newly recorded fix is retrieved in fresh query', async () => {
    const res = await fetch(
      `${baseUrl}/api/memory/context?repo=acme/payment-gateway&q=token+bucket+lock+timeout`
    );
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.available, true);
    assert.equal(body.repoFullName, 'acme/payment-gateway');
    assert.ok(body.bugsAndFixes.length >= 1);

    const freshFix = body.bugsAndFixes.find(b =>
      b.title.includes('Payment Gateway 504') || (b.fixSummary && b.fixSummary.includes('acquireTokenLock'))
    );
    assert.ok(freshFix, 'Fresh request must recall the recorded investigation resolution');
    assert.ok(freshFix.fixSummary.includes('acquireTokenLock'));
  });

  it('6. Re-investigating after recording outcome maintains HIGH confidence and matches canonical prior bug without self-contamination', async () => {
    const res = await fetch(`${baseUrl}/api/incident/investigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        report: SYNTHETIC_INCIDENT_FIXTURE.incidentReport,
        analysis: { repository: { fullName: 'acme/payment-gateway' } }
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.diagnosis.confidence, 'HIGH');
    assert.equal(body.diagnosis.rootCauseFile, 'services/tokenBucket.js');
    assert.equal(body.diagnosis.rootCauseSymbol, 'acquireTokenLock');
    assert.ok(body.connectedEvidence.priorFixMatch);
    assert.equal(body.connectedEvidence.priorFixMatch.title, 'Worker Thread Lock Starvation under High Concurrency');
    assert.notEqual(body.connectedEvidence.priorFixMatch.title, 'Payment Gateway 504 Gateway Timeout Cascade');
  });

  it('7. Exercises live GET /api/incident/recall and verifies strict repository isolation', async () => {
    // 7a. Live recall endpoint retrieves recorded token-bucket fix for acme/payment-gateway
    const recallRes = await fetch(`${baseUrl}/api/incident/recall?repo=acme/payment-gateway&q=token+bucket+lock+timeout`);
    assert.equal(recallRes.status, 200);
    const recallBody = await recallRes.json();

    assert.equal(recallBody.success, true);
    assert.equal(recallBody.repoFullName, 'acme/payment-gateway');
    assert.ok(recallBody.recalledFix, 'Live recall must return recorded historical remediation precedent');
    assert.equal(recallBody.recalledFix.filePath, 'services/tokenBucket.js');
    assert.ok(recallBody.recalledFix.provenance.includes('FIX_RESOLVES_BUG'));
    assert.equal(recallBody.recalledFix.evidenceType, 'historical_fix_precedent');
    assert.equal(recallBody.recalledFix.implementationStatus, 'unverified_in_current_runtime');
    assert.ok(recallBody.recalledFix.verificationStatus.includes('not yet verified'));

    // 7b. Strict repository isolation: querying an unrelated repo (e.g. spf13/cobra) returns null fix
    const cobraRes = await fetch(`${baseUrl}/api/incident/recall?repo=spf13/cobra&q=token+bucket+lock+timeout`);
    assert.equal(cobraRes.status, 200);
    const cobraBody = await cobraRes.json();

    assert.equal(cobraBody.success, true);
    assert.equal(cobraBody.repoFullName, 'spf13/cobra');
    assert.equal(cobraBody.bugsAndFixes.length, 0, 'Unrelated repository must receive 0 bugs from payment-gateway');
    assert.equal(cobraBody.recalledFix, null, 'Unrelated repository must NOT receive payment-gateway recalled fix');
  });

  it('8. Live Ask Codebase path (POST /api/ai/ask) recalls historical incident fix when scoped, and isolates Cobra', async () => {
    // 8a. Scoped Ask Codebase query via targetRepo recalls recorded fix from live FalkorDB
    const scopedAskRes = await fetch(`${baseUrl}/api/ai/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'What fix was recorded for the previous lock-starvation incident?',
        analysis: { repository: { fullName: 'spf13/cobra' } },
        targetRepo: 'acme/payment-gateway'
      })
    });

    assert.equal(scopedAskRes.status, 200);
    const scopedBody = await scopedAskRes.json();
    assert.equal(scopedBody.available, true);
    assert.equal(scopedBody.graphMemory.repoFullName, 'acme/payment-gateway');
    assert.equal(scopedBody.graphMemory.used, true);
    const tokenBucketFix = scopedBody.graphMemory.bugsAndFixes.find(b =>
      b.filePath === 'services/tokenBucket.js' &&
      b.title === 'Worker Thread Lock Starvation under High Concurrency'
    );
    assert.ok(tokenBucketFix, 'Expected historical lock starvation fix in retrieved live graph context');
    assert.equal(tokenBucketFix.title, 'Worker Thread Lock Starvation under High Concurrency');
    assert.equal(tokenBucketFix.filePath, 'services/tokenBucket.js');
    assert.ok(tokenBucketFix.fixSummary.includes('circuit breaker timeout'));

    // 8b. Scoped Ask Codebase query via focusEntity override
    const focusEntityRes = await fetch(`${baseUrl}/api/ai/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'What fix was recorded for the previous lock-starvation incident?',
        analysis: { repository: { fullName: 'spf13/cobra' } },
        focusEntity: {
          id: 'acme/payment-gateway::bug::lock-starvation-01',
          label: 'Bug',
          title: 'Worker Thread Lock Starvation under High Concurrency'
        }
      })
    });

    assert.equal(focusEntityRes.status, 200);
    const focusBody = await focusEntityRes.json();
    assert.equal(focusBody.available, true);
    assert.equal(focusBody.graphMemory.repoFullName, 'acme/payment-gateway');
    assert.equal(focusBody.graphMemory.used, true);

    // 8c. Unscoped Cobra query must NOT leak acme/payment-gateway memory
    const cobraAskRes = await fetch(`${baseUrl}/api/ai/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'What fix was recorded for the previous lock-starvation incident?',
        analysis: { repository: { fullName: 'spf13/cobra' } }
      })
    });

    assert.equal(cobraAskRes.status, 200);
    const cobraAskBody = await cobraAskRes.json();
    assert.equal(cobraAskBody.available, true);
    assert.equal(cobraAskBody.graphMemory.repoFullName, 'spf13/cobra');
    assert.equal(cobraAskBody.graphMemory.bugsAndFixes.length, 0, 'Unscoped Cobra query must NOT receive payment-gateway bugs or fixes');
  });

  it('9. Verifies incident provenance integrity on live FalkorDB: suspected refactor commit vs historical fix commit, idempotent seeding, and resolution recording', async () => {
    // 9a. Re-seed to verify idempotent seeding and clean relationship integrity
    const reseedRes = await fetch(`${baseUrl}/api/incident/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: true })
    });
    assert.equal(reseedRes.status, 200);
    const reseedBody = await reseedRes.json();
    assert.equal(reseedBody.success, true);
    assert.equal(reseedBody.seeded, true);

    // 9b. Verify graph structure: Commit 8f2a1b9 is suspected_refactor, Commit 7e1d4c2 is historical_fix
    const commitQuery = await runQuery(
      `MATCH (c:Commit {repoFullName: 'acme/payment-gateway'})
       RETURN c.sha AS sha, c.role AS role, c.message AS message
       ORDER BY c.sha`,
      {},
      { graph: TEST_GRAPH, accessMode: 'READ', env: LIVE_ENV }
    );
    assert.ok(commitQuery.data && commitQuery.data.length >= 2, 'Should have at least 2 commits seeded');
    const refactorCommit = commitQuery.data.find(c => c.sha && c.sha.startsWith('8f2a1b9'));
    const fixCommit = commitQuery.data.find(c => c.sha && c.sha.startsWith('7e1d4c2'));
    assert.ok(refactorCommit, 'Refactor commit 8f2a1b9 must be present');
    assert.equal(refactorCommit.role, 'suspected_refactor');
    assert.ok(fixCommit, 'Historical fix commit 7e1d4c2 must be present');
    assert.equal(fixCommit.role, 'historical_fix');

    // 9c. Verify Fix node resolves Bug and is linked via FIX_APPLIED_IN_COMMIT to 7e1d4c2, NOT 8f2a1b9
    const fixEdgeQuery = await runQuery(
      `MATCH (b:Bug)-[:FIX_RESOLVES_BUG]-(f:Fix)-[:FIX_APPLIED_IN_COMMIT]->(c:Commit)
       WHERE b.repoFullName = 'acme/payment-gateway'
       RETURN b.title AS bugTitle, f.title AS fixTitle, c.sha AS commitSha, c.role AS commitRole`,
      {},
      { graph: TEST_GRAPH, accessMode: 'READ', env: LIVE_ENV }
    );
    assert.ok(fixEdgeQuery.data && fixEdgeQuery.data.length >= 1, 'Fix node must resolve Bug and link to Commit');
    const priorBugFix = fixEdgeQuery.data.find(row => row.bugTitle.includes('Lock Starvation'));
    assert.ok(priorBugFix, 'Prior Bug (Lock Starvation) must have resolved Fix');
    assert.ok(priorBugFix.commitSha.startsWith('7e1d4c2'), 'Fix must be applied in commit 7e1d4c2');
    assert.equal(priorBugFix.commitRole, 'historical_fix');
    assert.notEqual(priorBugFix.commitSha, refactorCommit.sha, 'Fix must NOT be applied in refactor commit 8f2a1b9');

    // 9d. Run fresh investigation via POST /api/incident/investigate and verify explicit provenance
    const invRes = await fetch(`${baseUrl}/api/incident/investigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        report: SYNTHETIC_INCIDENT_FIXTURE.incidentReport,
        analysis: SYNTHETIC_INCIDENT_FIXTURE
      })
    });
    assert.equal(invRes.status, 200);
    const invBody = await invRes.json();

    assert.ok(invBody.suspectedIntroducingCommit, 'Must return suspectedIntroducingCommit');
    assert.equal(invBody.suspectedIntroducingCommit.shortSha, '8f2a1b9');
    assert.equal(invBody.suspectedIntroducingCommit.role, 'suspected_refactor');

    assert.ok(invBody.historicalFix, 'Must return historicalFix');
    assert.equal(invBody.historicalFix.shortSha, '7e1d4c2');
    assert.equal(invBody.historicalFix.role, 'historical_fix');
    assert.ok(invBody.historicalFix.fixSummary.includes('circuit breaker timeout'));

    assert.ok(invBody.implementationStatus, 'Must return implementationStatus');
    assert.equal(invBody.implementationStatus.status, 'Historical fix recorded; current implementation not yet verified.');

    // 9e. Record outcome and verify it does NOT link newly recorded resolution bug to refactor commit
    const recordRes = await fetch(`${baseUrl}/api/incident/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ investigation: invBody })
    });
    assert.equal(recordRes.status, 201);

    const checkNoRefactorFix = await runQuery(
      `MATCH (b:Bug)-[:FIX_RESOLVES_BUG]-(f:Fix)-[:FIX_APPLIED_IN_COMMIT]->(c:Commit {sha: '8f2a1b9c0d1e2f3a'})
       RETURN b.title AS bugTitle`,
      {},
      { graph: TEST_GRAPH, accessMode: 'READ', env: LIVE_ENV }
    );
    assert.equal(checkNoRefactorFix.data.length, 0, 'No Fix node should be linked via FIX_APPLIED_IN_COMMIT to suspected refactor commit 8f2a1b9');

    // 9f. Recall endpoint confirms historical fix commit is 7e1d4c2
    const recallCheck = await fetch(`${baseUrl}/api/incident/recall?repo=acme/payment-gateway&q=lock+starvation`);
    assert.equal(recallCheck.status, 200);
    const recallData = await recallCheck.json();
    assert.ok(recallData.recalledFix);
    assert.equal(recallData.recalledFix.commitShortSha, '7e1d4c2');
    assert.equal(recallData.recalledFix.commitRole, 'historical_fix');
    assert.equal(recallData.recalledFix.evidenceType, 'historical_fix_precedent');
    assert.equal(recallData.recalledFix.implementationStatus, 'unverified_in_current_runtime');
    assert.ok(recallData.recalledFix.verificationStatus.includes('not yet verified'));
  });
});


