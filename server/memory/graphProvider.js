/**
 * Graph Database Provider Abstraction & Gateway (FalkorDB Engine)
 * - Resolves the active graph provider ('falkordb').
 * - Routes health checks, repository ingestion, context retrieval, memory recording,
 *   overview requests, and markdown formatting to FalkorDB.
 */

import { checkFalkorDBHealth, validateFalkorDBConfig, sanitizeErrorMessage as sanitizeFalkorDBError } from '../db/falkordb.js';
import {
  ingestFalkorDBRepositoryAnalysis
} from './falkordbIngestion.js';
import {
  recordFalkorDBMemoryEntry,
  retrieveFalkorDBGraphContextForQuestion,
  getFalkorDBRepositoryMemoryOverview,
  formatFalkorDBGraphEvidenceMarkdown
} from './falkordbRetrieval.js';

export const SUPPORTED_GRAPH_PROVIDERS = Object.freeze(['falkordb']);

/**
 * Resolves the active graph database provider based on environment configuration.
 * Always resolves to 'falkordb'. Throws if an unsupported provider is requested.
 */
export function resolveGraphProvider(env = process.env) {
  const explicit = (
    env.GRAPH_DATABASE_PROVIDER ||
    env.GRAPH_BACKEND ||
    env.DATABASE_PROVIDER ||
    ''
  ).trim().toLowerCase();

  if (explicit) {
    if (SUPPORTED_GRAPH_PROVIDERS.includes(explicit)) {
      return explicit;
    }
    throw new Error(
      `Invalid GRAPH_DATABASE_PROVIDER "${explicit}". Supported providers are: ${SUPPORTED_GRAPH_PROVIDERS.join(', ')}`
    );
  }

  return 'falkordb';
}

/**
 * Validates configuration for FalkorDB without leaking credentials.
 */
export function validateActiveGraphConfig(env = process.env, options = {}) {
  const provider = options.provider || resolveGraphProvider(env);
  if (provider !== 'falkordb') {
    throw new Error(`Unsupported graph provider: ${provider}`);
  }
  return { provider: 'falkordb', ...validateFalkorDBConfig(env) };
}

/**
 * Checks connectivity for FalkorDB.
 */
export async function getGraphHealth(options = {}) {
  const env = options.env || process.env;
  const provider = options.provider || resolveGraphProvider(env);
  if (provider !== 'falkordb') {
    throw new Error(`Unsupported graph provider: ${provider}`);
  }

  const health = await checkFalkorDBHealth(env);
  return { provider: 'falkordb', ...health };
}

/**
 * Ingests repository analysis into FalkorDB.
 */
export async function ingestRepositoryToGraph(analysis, options = {}) {
  const env = options.env || process.env;
  const provider = options.provider || resolveGraphProvider(env);
  if (provider !== 'falkordb') {
    throw new Error(`Unsupported graph provider: ${provider}`);
  }

  return await ingestFalkorDBRepositoryAnalysis(analysis, { ...options, env });
}

/**
 * Retrieves contextual graph evidence for developer questions from FalkorDB.
 */
export async function retrieveGraphContext(repoFullName, question = '', options = {}) {
  const env = options.env || process.env;
  const provider = options.provider || resolveGraphProvider(env);
  if (provider !== 'falkordb') {
    throw new Error(`Unsupported graph provider: ${provider}`);
  }

  return await retrieveFalkorDBGraphContextForQuestion(repoFullName, question, { ...options, env });
}

/**
 * Records a Bug, Fix, or Technical Decision into FalkorDB.
 */
export async function recordMemoryEntry(input, options = {}) {
  const env = options.env || process.env;
  const provider = options.provider || resolveGraphProvider(env);
  if (provider !== 'falkordb') {
    throw new Error(`Unsupported graph provider: ${provider}`);
  }

  return await recordFalkorDBMemoryEntry(input, { ...options, env });
}

/**
 * Retrieves repository memory overview, counts, and interactive graph from FalkorDB.
 */
export async function getRepositoryOverview(repoFullName, options = {}) {
  const env = options.env || process.env;
  const provider = options.provider || resolveGraphProvider(env);
  if (provider !== 'falkordb') {
    throw new Error(`Unsupported graph provider: ${provider}`);
  }

  const overview = await getFalkorDBRepositoryMemoryOverview(repoFullName, { ...options, env });
  return {
    ...overview,
    provider: 'falkordb'
  };
}

/**
 * Formats graph context into Markdown for AI prompt grounding.
 */
export function formatGraphEvidenceMarkdown(graphContext, options = {}) {
  const env = options.env || process.env;
  const provider = options.provider || resolveGraphProvider(env);
  if (provider !== 'falkordb') {
    throw new Error(`Unsupported graph provider: ${provider}`);
  }

  return formatFalkorDBGraphEvidenceMarkdown(graphContext);
}
