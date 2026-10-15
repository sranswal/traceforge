import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFalkorDBConfig,
  sanitizeErrorMessage,
  checkFalkorDBHealth,
  runQuery,
  normalizeFalkorDBValue,
  getClient,
  closeClient,
  setClientForTesting,
  VALID_FALKORDB_PROTOCOLS
} from '../server/db/falkordb.js';

describe('FailureChain Phase 1: FalkorDB Configuration Validation & Error Sanitization', () => {
  afterEach(async () => {
    setClientForTesting(null);
    await closeClient();
  });

  it('detects unconfigured environment gracefully', () => {
    const res = validateFalkorDBConfig({});
    assert.equal(res.valid, false);
    assert.equal(res.configured, false);
    assert.equal(res.partiallyConfigured, false);
    assert.ok(res.missing.includes('FALKORDB_HOST (or FALKORDB_URL)'));
    assert.equal(res.graph, 'traceforge');
    assert.equal(res.port, 6379);
  });

  it('accepts valid host and port configuration', () => {
    const res = validateFalkorDBConfig({
      FALKORDB_HOST: '127.0.0.1',
      FALKORDB_PORT: '6380',
      FALKORDB_GRAPH: 'failurechain'
    });
    assert.equal(res.valid, true);
    assert.equal(res.configured, true);
    assert.equal(res.host, '127.0.0.1');
    assert.equal(res.port, 6380);
    assert.equal(res.graph, 'failurechain');
    assert.equal(res.protocol, 'falkor');
  });

  it('flags invalid port numbers as configuration errors', () => {
    const resNegative = validateFalkorDBConfig({
      FALKORDB_HOST: 'localhost',
      FALKORDB_PORT: '-1'
    });
    assert.equal(resNegative.valid, false);
    assert.ok(resNegative.errors.some(e => e.includes('FALKORDB_PORT must be a valid integer')));

    const resTooLarge = validateFalkorDBConfig({
      FALKORDB_HOST: 'localhost',
      FALKORDB_PORT: '70000'
    });
    assert.equal(resTooLarge.valid, false);
    assert.ok(resTooLarge.errors.some(e => e.includes('FALKORDB_PORT must be a valid integer')));

    const resNan = validateFalkorDBConfig({
      FALKORDB_HOST: 'localhost',
      FALKORDB_PORT: 'abc'
    });
    assert.equal(resNan.valid, false);
  });

  it('validates supported FalkorDB / Redis connection URL schemes', () => {
    for (const proto of VALID_FALKORDB_PROTOCOLS) {
      const res = validateFalkorDBConfig({
        FALKORDB_URL: `${proto}falkor-cloud.example.com:6379`
      });
      assert.equal(res.valid, true, `Protocol ${proto} should be valid`);
      assert.equal(res.configured, true);
      assert.equal(res.protocol, proto.replace('://', ''));
    }
  });

  it('rejects unsupported URI protocols', () => {
    const res = validateFalkorDBConfig({
      FALKORDB_URL: 'http://localhost:6379'
    });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some(e => e.includes('must start with a valid FalkorDB/Redis protocol')));
  });

  it('flags password provided without host or URL', () => {
    const res = validateFalkorDBConfig({
      FALKORDB_PASSWORD: 'secret-falkor-pass'
    });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some(e => e.includes('FALKORDB_PASSWORD was provided without FALKORDB_HOST')));
  });

  it('redacts passwords and inline URI credentials from error messages', () => {
    const secret = 'ultra-secret-falkordb-pass-999';
    const msg = sanitizeErrorMessage(
      `Failed to connect to falkor://appuser:${secret}@10.0.0.5:6379 with key ${secret}`,
      secret
    );
    assert.equal(msg.includes(secret), false);
    assert.ok(msg.includes('[REDACTED]'));
    assert.ok(msg.includes('falkor://[REDACTED]:[REDACTED]@10.0.0.5:6379'));
  });

  it('handles empty or non-string error messages gracefully', () => {
    assert.equal(sanitizeErrorMessage(null), 'Unknown database error');
    assert.equal(sanitizeErrorMessage(''), 'Unknown database error');
    assert.equal(sanitizeErrorMessage(123), 'Unknown database error');
  });
});

describe('FailureChain Phase 1: FalkorDB Client Lifecycle & Query Execution (Mocked)', () => {
  afterEach(async () => {
    setClientForTesting(null);
    await closeClient();
  });

  it('normalizes node structures, edge structures, arrays, and primitives', () => {
    assert.equal(normalizeFalkorDBValue(null), null);
    assert.equal(normalizeFalkorDBValue('str'), 'str');
    assert.equal(normalizeFalkorDBValue(42), 42);

    const mockNode = {
      id: 101,
      labels: ['Component'],
      properties: {
        name: 'services',
        path: 'services',
        role: 'Service Layer'
      }
    };
    const normalizedNode = normalizeFalkorDBValue(mockNode);
    assert.deepEqual(normalizedNode, {
      name: 'services',
      path: 'services',
      role: 'Service Layer'
    });

    const mockEdge = {
      id: 202,
      relationshipType: 'COMPONENT_DEPENDS_ON_COMPONENT',
      sourceId: 101,
      destinationId: 102,
      properties: {
        evidenceFile: 'server/index.js'
      }
    };
    const normalizedEdge = normalizeFalkorDBValue(mockEdge);
    assert.deepEqual(normalizedEdge, {
      evidenceFile: 'server/index.js'
    });

    const mockRow = {
      comp: mockNode,
      rel: mockEdge,
      count: 5
    };
    const normalizedRow = normalizeFalkorDBValue(mockRow);
    assert.deepEqual(normalizedRow, {
      comp: { name: 'services', path: 'services', role: 'Service Layer' },
      rel: { evidenceFile: 'server/index.js' },
      count: 5
    });
  });

  it('validates query inputs before execution', async () => {
    await assert.rejects(
      () => runQuery(''),
      /A valid Cypher query string is required/
    );
    await assert.rejects(
      () => runQuery(null),
      /A valid Cypher query string is required/
    );
    await assert.rejects(
      () => runQuery('RETURN 1', 'not-an-object'),
      /Cypher parameters must be a plain object/
    );
  });

  it('executes write query with parameters via graph.query', async () => {
    let capturedQuery = null;
    let capturedOptions = null;
    let selectedGraphName = null;

    setClientForTesting({
      selectGraph(name) {
        selectedGraphName = name;
        return {
          async query(cypher, options) {
            capturedQuery = cypher;
            capturedOptions = options;
            return {
              data: [
                {
                  r: {
                    id: 1,
                    labels: ['Repository'],
                    properties: { id: 'acme/service', fullName: 'acme/service' }
                  }
                }
              ],
              metadata: ['Nodes created: 1']
            };
          }
        };
      },
      async close() {}
    });

    const result = await runQuery(
      'MERGE (r:Repository { id: $repo.id }) RETURN r',
      { repo: { id: 'acme/service' } },
      { graph: 'custom_graph' }
    );

    assert.equal(selectedGraphName, 'custom_graph');
    assert.equal(capturedQuery, 'MERGE (r:Repository { id: $repo.id }) RETURN r');
    assert.deepEqual(capturedOptions, { params: { repo: { id: 'acme/service' } } });
    assert.equal(result.records.length, 1);
    assert.deepEqual(result.records[0].r, { id: 'acme/service', fullName: 'acme/service' });
  });

  it('executes read query via graph.roQuery when accessMode is READ', async () => {
    let roQueryCalled = false;
    let writeQueryCalled = false;

    setClientForTesting({
      selectGraph() {
        return {
          async roQuery(cypher) {
            roQueryCalled = true;
            assert.equal(cypher, 'MATCH (n) RETURN count(n) AS cnt');
            return { data: [{ cnt: 10 }] };
          },
          async query() {
            writeQueryCalled = true;
            return { data: [] };
          }
        };
      },
      async close() {}
    });

    const result = await runQuery(
      'MATCH (n) RETURN count(n) AS cnt',
      {},
      { accessMode: 'READ' }
    );

    assert.equal(roQueryCalled, true);
    assert.equal(writeQueryCalled, false);
    assert.equal(result.records[0].cnt, 10);
  });

  it('catches query errors, sanitizes error message, and attaches error code', async () => {
    setClientForTesting({
      selectGraph() {
        return {
          async query() {
            const err = new Error('Syntax error near falkor://admin:secretPass456@127.0.0.1:6379');
            err.code = 'SYNTAX_ERROR';
            throw err;
          }
        };
      },
      async close() {}
    });

    await assert.rejects(
      async () => {
        await runQuery('INVALID CYPHER', {}, { env: { FALKORDB_PASSWORD: 'secretPass456' } });
      },
      (err) => {
        assert.ok(err.message.includes('FalkorDB query failed:'));
        assert.equal(err.message.includes('secretPass456'), false);
        assert.ok(err.message.includes('[REDACTED]'));
        assert.equal(err.code, 'SYNTAX_ERROR');
        return true;
      }
    );
  });

  it('reports healthy connectivity via checkFalkorDBHealth', async () => {
    let healthQueryRun = false;
    setClientForTesting({
      selectGraph(name) {
        assert.equal(name, 'test-graph');
        return {
          async roQuery(cypher) {
            assert.equal(cypher, 'RETURN 1 AS ok');
            healthQueryRun = true;
            return { data: [{ ok: 1 }] };
          }
        };
      },
      async close() {}
    });

    const health = await checkFalkorDBHealth({
      FALKORDB_HOST: 'localhost',
      FALKORDB_PORT: '6379',
      FALKORDB_GRAPH: 'test-graph'
    });

    assert.equal(health.connected, true);
    assert.equal(health.configured, true);
    assert.equal(health.status, 'connected');
    assert.equal(health.graph, 'test-graph');
    assert.equal(healthQueryRun, true);
  });

  it('reports unconfigured status when no FalkorDB environment variables are set', async () => {
    const health = await checkFalkorDBHealth({});
    assert.equal(health.connected, false);
    assert.equal(health.configured, false);
    assert.equal(health.status, 'unconfigured');
    assert.ok(health.missing.length > 0);
  });

  it('reports unreachable status and redacts secrets when health check fails', async () => {
    setClientForTesting({
      selectGraph() {
        return {
          async roQuery() {
            throw new Error('Connection refused by redis://default:secretAdminPass@127.0.0.1:6379');
          }
        };
      },
      async close() {}
    });

    const health = await checkFalkorDBHealth({
      FALKORDB_HOST: '127.0.0.1',
      FALKORDB_PORT: '6379',
      FALKORDB_PASSWORD: 'secretAdminPass'
    });

    assert.equal(health.connected, false);
    assert.equal(health.status, 'error');
    assert.equal(health.error.includes('secretAdminPass'), false);
    assert.ok(health.error.includes('[REDACTED]'));
  });

  it('closes client cleanly and resets singleton state', async () => {
    let clientClosed = false;
    setClientForTesting({
      selectGraph() { return {}; },
      async close() {
        clientClosed = true;
      }
    });

    await closeClient();
    assert.equal(clientClosed, true);

    // After closeClient, getClient returns null if env is unconfigured
    const unconfiguredClient = await getClient({ env: {} });
    assert.equal(unconfiguredClient, null);
  });
});

