/**
 * Server-Side FalkorDB Connection & Session Manager (FailureChain Phase 1)
 * - Canonical graph store adapter for FalkorDB using the official `falkordb` client.
 * - Maintains a single client instance per application process (serverless-safe).
 * - Enforces parameterized Cypher queries, graph selection, and connection cleanup.
 * - Never logs or returns credentials or sensitive connection details.
 */

import { FalkorDB } from 'falkordb';

export const VALID_FALKORDB_PROTOCOLS = Object.freeze([
  'falkor://',
  'falkors://',
  'redis://',
  'rediss://'
]);

let clientInstance = null;
let clientConfigSignature = null;

/**
 * Redacts any accidental credentials or sensitive tokens from error messages.
 */
export function sanitizeErrorMessage(message = '', secretPassword = process.env.FALKORDB_PASSWORD) {
  if (!message || typeof message !== 'string') return 'Unknown database error';
  let sanitized = message;

  const password = secretPassword || process.env.FALKORDB_PASSWORD;
  if (password && typeof password === 'string' && password.trim().length > 0) {
    sanitized = sanitized.split(password.trim()).join('[REDACTED]');
  }

  // Redact user:pass@host patterns in URIs or host strings (e.g., user:pass@host, redis://user:pass@host)
  sanitized = sanitized.replace(/(?:[a-zA-Z0-9+.-]+:\/\/)?([^:@/\s]+):([^@/\s]+)@([a-zA-Z0-9.-]+)/g, (match, user, pass, host) => {
    const proto = match.includes('://') ? match.split('://')[0] + '://' : '';
    return `${proto}[REDACTED]:[REDACTED]@${host}`;
  });

  // Redact key/token query param patterns
  sanitized = sanitized.replace(/([?&](?:password|passwd|key|token|auth)=)([^&\s]+)/gi, '$1[REDACTED]');
  return sanitized;
}

/**
 * Validates FalkorDB environment configuration without exposing secrets.
 */
export function validateFalkorDBConfig(env = process.env) {
  if (env === process.env && clientInstance && clientConfigSignature === 'test-override') {
    const graph = (env.FALKORDB_GRAPH || '').trim() || 'traceforge';
    return {
      valid: true,
      configured: true,
      partiallyConfigured: false,
      missing: [],
      errors: [],
      url: null,
      host: 'test-override',
      port: 6379,
      username: null,
      password: null,
      graph,
      protocol: 'falkor'
    };
  }

  const url = (env.FALKORDB_URL || '').trim();
  const host = (env.FALKORDB_HOST || '').trim();
  const portRaw = env.FALKORDB_PORT !== undefined && env.FALKORDB_PORT !== null ? String(env.FALKORDB_PORT).trim() : '';
  const username = (env.FALKORDB_USERNAME || '').trim();
  const password = (env.FALKORDB_PASSWORD || '').trim();
  const graph = (env.FALKORDB_GRAPH || '').trim() || 'traceforge';

  const errors = [];
  const missing = [];

  const hasUrl = Boolean(url);
  const hasHost = Boolean(host);
  const hasPort = Boolean(portRaw);
  const hasPassword = Boolean(password);

  const anyConfigured = hasUrl || hasHost || hasPort || hasPassword;

  let protocol = null;
  let parsedPort = 6379;

  if (hasUrl) {
    const matchedProtocol = VALID_FALKORDB_PROTOCOLS.find(p => url.toLowerCase().startsWith(p));
    if (!matchedProtocol) {
      errors.push(
        `FALKORDB_URL must start with a valid FalkorDB/Redis protocol (${VALID_FALKORDB_PROTOCOLS.join(', ')})`
      );
    } else {
      protocol = matchedProtocol.replace('://', '');
    }
  } else if (hasPort) {
    const p = parseInt(portRaw, 10);
    if (Number.isNaN(p) || p <= 0 || p > 65535) {
      errors.push('FALKORDB_PORT must be a valid integer between 1 and 65535.');
    } else {
      parsedPort = p;
    }
  }

  if (hasPassword && !hasUrl && !hasHost) {
    errors.push('FALKORDB_PASSWORD was provided without FALKORDB_HOST or FALKORDB_URL.');
  }

  if (!anyConfigured) {
    missing.push('FALKORDB_HOST (or FALKORDB_URL)');
  }

  const configured = anyConfigured;
  const valid = configured && errors.length === 0;
  const partiallyConfigured = configured && errors.length > 0;

  return {
    valid,
    configured,
    partiallyConfigured,
    missing,
    errors,
    url: hasUrl ? url : null,
    host: hasHost ? host : hasUrl ? null : 'localhost',
    port: parsedPort,
    username: username || null,
    password: hasPassword ? password : null,
    graph,
    protocol: protocol || (hasUrl ? null : 'falkor')
  };
}

/**
 * Returns the process-wide singleton FalkorDB client instance, or null if not configured.
 * Throws a descriptive error if invalidly configured when `throwOnInvalid` is true.
 */
export async function getClient({ env = process.env, throwOnInvalid = false } = {}) {
  if (clientInstance && clientConfigSignature === 'test-override') {
    if (clientInstance instanceof Error) {
      if (throwOnInvalid) throw clientInstance;
      return null;
    }
    return clientInstance;
  }

  const validation = validateFalkorDBConfig(env);
  if (!validation.valid) {
    if (throwOnInvalid) {
      const reason = validation.errors[0] || `FalkorDB is not configured: missing ${validation.missing.join(', ')}`;
      throw new Error(`FalkorDB configuration invalid: ${reason}`);
    }
    return null;
  }

  const signature = validation.url
    ? `${validation.url}|${validation.graph}`
    : `${validation.host}|${validation.port}|${validation.username || ''}|${validation.graph}`;

  if (!clientInstance || clientConfigSignature !== signature) {
    if (clientInstance) {
      try {
        await clientInstance.close();
      } catch {
        // Ignore errors on closing previous connection
      }
    }

    const connectTimeout = Number(env.FALKORDB_CONNECT_TIMEOUT_MS) || 10000;
    const resolvedPassword = (env.FALKORDB_PASSWORD || validation.password || '').trim();

    let options;
    if (validation.url) {
      options = {
        url: validation.url,
        socket: {
          connectTimeout
        }
      };
      if (resolvedPassword) {
        options.password = resolvedPassword;
      }
    } else {
      options = {
        host: validation.host,
        port: validation.port,
        socket: {
          connectTimeout
        }
      };
      if (validation.username) {
        options.username = validation.username;
      }
      if (resolvedPassword) {
        options.password = resolvedPassword;
      }
    }

    try {
      clientInstance = await FalkorDB.connect(options);
      clientConfigSignature = signature;
    } catch (err) {
      if (throwOnInvalid) {
        throw err;
      }
      return null;
    }
  }

  return clientInstance;
}

/**
 * Recursively normalizes FalkorDB return structures into plain JavaScript objects/primitives.
 */
export function normalizeFalkorDBValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (Array.isArray(value)) {
    return value.map(normalizeFalkorDBValue);
  }
  if (typeof value === 'object') {
    // FalkorDB Node structure: { id, labels, properties }
    // FalkorDB Edge structure: { id, relationshipType, sourceId, destinationId, properties }
    if (value.properties && (value.labels || value.relationshipType)) {
      return normalizeFalkorDBValue(value.properties);
    }
    const normalized = {};
    for (const [k, v] of Object.entries(value)) {
      normalized[k] = normalizeFalkorDBValue(v);
    }
    return normalized;
  }
  return value;
}

/**
 * Executes a parameterized Cypher query against the configured FalkorDB graph.
 */
export async function runQuery(cypher, params = {}, options = {}) {
  if (!cypher || typeof cypher !== 'string') {
    throw new Error('A valid Cypher query string is required.');
  }
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new Error('Cypher parameters must be a plain object.');
  }

  const env = options.env || process.env;
  const validation = validateFalkorDBConfig(env);
  const activeClient = await getClient({ env, throwOnInvalid: true });

  const graphName = options.graph || validation.graph || 'traceforge';
  const graph = activeClient.selectGraph(graphName);

  const queryOptions = {};
  if (Object.keys(params).length > 0) {
    queryOptions.params = params;
  }
  if (options.timeoutMs) {
    queryOptions.TIMEOUT = options.timeoutMs;
  }

  const isReadOnly = options.accessMode === 'READ';

  try {
    let rawResult;
    if (isReadOnly && typeof graph.roQuery === 'function') {
      try {
        rawResult = await graph.roQuery(cypher, queryOptions);
      } catch (roErr) {
        // In FalkorDB, roQuery on an uninitialized/empty graph key throws "Invalid graph operation on empty key".
        // Fall back to query() so reading an empty/new graph returns empty data instead of crashing.
        if (roErr?.message && roErr.message.includes('empty key')) {
          rawResult = await graph.query(cypher, queryOptions);
        } else {
          throw roErr;
        }
      }
    } else {
      rawResult = await graph.query(cypher, queryOptions);
    }

    const dataRows = Array.isArray(rawResult?.data) ? rawResult.data : [];
    const records = dataRows.map(row => normalizeFalkorDBValue(row));

    return {
      records,
      data: records,
      metadata: rawResult?.metadata || null,
      headers: rawResult?.headers || null,
      raw: rawResult
    };
  } catch (err) {
    const safeMsg = sanitizeErrorMessage(err.message, env.FALKORDB_PASSWORD);
    const wrapped = new Error(`FalkorDB query failed: ${safeMsg}`);
    wrapped.code = err.code || 'FALKORDB_QUERY_ERROR';
    throw wrapped;
  }
}

/**
 * Checks FalkorDB connectivity without exposing credentials or sensitive host data.
 */
export async function checkFalkorDBHealth(env = process.env) {
  const validation = validateFalkorDBConfig(env);

  if (clientInstance && clientConfigSignature === 'test-override') {
    try {
      const graph = clientInstance.selectGraph(validation.graph || 'traceforge');
      if (typeof graph.query === 'function') {
        await graph.query('RETURN 1 AS ok');
      } else if (typeof graph.roQuery === 'function') {
        await graph.roQuery('RETURN 1 AS ok');
      }
      return {
        connected: true,
        configured: true,
        status: 'connected',
        graph: validation.graph || 'traceforge',
        protocol: validation.protocol || 'falkor',
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return {
        connected: false,
        configured: true,
        status: 'error',
        graph: validation.graph || 'traceforge',
        error: sanitizeErrorMessage(err.message, env.FALKORDB_PASSWORD),
        timestamp: new Date().toISOString()
      };
    }
  }

  if (!validation.valid) {
    return {
      connected: false,
      configured: validation.configured,
      status: validation.partiallyConfigured ? 'invalid_config' : 'unconfigured',
      graph: validation.graph,
      missing: validation.missing,
      errors: validation.errors,
      timestamp: new Date().toISOString()
    };
  }

  try {
    const activeClient = await getClient({ env, throwOnInvalid: true });
    const graph = activeClient.selectGraph(validation.graph || 'traceforge');
    await graph.query('RETURN 1 AS ok');

    return {
      connected: true,
      configured: true,
      status: 'connected',
      graph: validation.graph,
      protocol: validation.protocol,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return {
      connected: false,
      configured: true,
      status: 'unreachable',
      graph: validation.graph,
      protocol: validation.protocol,
      error: sanitizeErrorMessage(err.message, env.FALKORDB_PASSWORD),
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Closes the singleton client cleanly (for process shutdown or test teardown).
 */
export async function closeClient() {
  if (clientInstance) {
    const current = clientInstance;
    clientInstance = null;
    clientConfigSignature = null;
    if (typeof current.close === 'function') {
      await current.close();
    }
  }
}

/**
 * Test helper: inject a mock FalkorDB client for unit tests.
 */
export function setClientForTesting(mockClient) {
  clientInstance = mockClient;
  clientConfigSignature = mockClient ? 'test-override' : null;
}

export { FalkorDB };
