/**
 * FalkorDB Graph Schema Module (FailureChain Phase 2)
 * Defines node labels, relationship types, deterministic identifiers,
 * exact-match indexes, and FalkorDB uniqueness constraints.
 */

import { getClient, validateFalkorDBConfig, sanitizeErrorMessage } from '../db/falkordb.js';
import { NODE_LABELS, REL_TYPES, GraphIds, normalizePath, slugify } from './schema.js';

export { NODE_LABELS, REL_TYPES, GraphIds, normalizePath, slugify };

/**
 * Node labels requiring primary ID indexes and UNIQUE constraints.
 */
export const FALKORDB_INDEXED_LABELS = Object.freeze([
  NODE_LABELS.REPOSITORY,
  NODE_LABELS.FILE,
  NODE_LABELS.COMPONENT,
  NODE_LABELS.SYMBOL,
  NODE_LABELS.COMMIT,
  NODE_LABELS.BUG,
  NODE_LABELS.FIX,
  NODE_LABELS.TECHNICAL_DECISION,
  NODE_LABELS.TEST
]);

/**
 * Node labels requiring secondary repoFullName property indexes for fast repository-scoped lookups.
 */
export const FALKORDB_REPO_INDEXED_LABELS = Object.freeze([
  NODE_LABELS.FILE,
  NODE_LABELS.COMPONENT,
  NODE_LABELS.SYMBOL,
  NODE_LABELS.COMMIT,
  NODE_LABELS.BUG,
  NODE_LABELS.FIX,
  NODE_LABELS.TECHNICAL_DECISION,
  NODE_LABELS.TEST
]);

let schemaInitialized = false;

/**
 * Ensures FalkorDB indexes and uniqueness constraints are created.
 * Safe and idempotent across repeated invocations.
 */
export async function ensureFalkorDBSchema(options = {}) {
  if (schemaInitialized && !options.force) {
    return { initialized: true, cached: true };
  }

  const env = options.env || process.env;
  let graph = options.graphClient || null;

  if (!graph) {
    const validation = validateFalkorDBConfig(env);
    const activeClient = options.client || (await getClient({ env, throwOnInvalid: true }));
    const graphName = options.graph || validation.graph || 'traceforge';
    graph = activeClient.selectGraph(graphName);
  }

  let indexesCreated = 0;
  let indexesExisted = 0;
  let constraintsCreated = 0;
  let constraintsExisted = 0;

  try {
    // 1. Create exact-match indexes and uniqueness constraints on primary entity ID
    for (const label of FALKORDB_INDEXED_LABELS) {
      // 1a. Supporting exact-match index on ID
      try {
        await graph.query(`CREATE INDEX FOR (n:${label}) ON (n.id)`);
        indexesCreated++;
      } catch (err) {
        if (err?.message && err.message.includes('already indexed')) {
          indexesExisted++;
        } else {
          throw err;
        }
      }

      // 1b. FalkorDB uniqueness constraint on ID (requires the exact index above)
      if (typeof graph.constraintCreate === 'function') {
        try {
          await graph.constraintCreate('UNIQUE', 'NODE', label, 'id');
          constraintsCreated++;
        } catch (err) {
          if (err?.message && err.message.includes('already exists')) {
            constraintsExisted++;
          } else {
            throw err;
          }
        }
      }
    }

    // 2. Create repoFullName secondary indexes for bounded query performance
    for (const label of FALKORDB_REPO_INDEXED_LABELS) {
      try {
        await graph.query(`CREATE INDEX FOR (n:${label}) ON (n.repoFullName)`);
        indexesCreated++;
      } catch (err) {
        if (err?.message && err.message.includes('already indexed')) {
          indexesExisted++;
        } else {
          throw err;
        }
      }
    }

    schemaInitialized = true;
    return {
      initialized: true,
      indexesCreated,
      indexesExisted,
      constraintsCreated,
      constraintsExisted,
      totalIndexedLabels: FALKORDB_INDEXED_LABELS.length
    };
  } catch (err) {
    const safeMsg = sanitizeErrorMessage(err.message, env.FALKORDB_PASSWORD);
    const error = new Error(`FalkorDB schema initialization failed: ${safeMsg}`);
    error.code = err.code || 'FALKORDB_SCHEMA_ERROR';
    throw error;
  }
}

/**
 * Resets the in-memory schema initialized flag for test isolation.
 */
export function resetFalkorDBSchemaCacheForTesting() {
  schemaInitialized = false;
}

