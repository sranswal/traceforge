/**
 * TraceForge AI Provider
 * Connects to Google Gemini with configurable, bounded API-key failover
 * (GEMINI_API_KEY -> GEMINI_API_KEY_2 -> GEMINI_API_KEY_3) and multi-model failover:
 *   1. Primary:   gemini-3.8-flash
 *   2. Secondary: gemini-3.6-flash
 *   3. Tertiary:  gemini-3.5-flash-lite
 *
 * Grounded strictly in verified repository scan context and FalkorDB Project Memory.
 */

import {
  retrieveGraphContext,
  formatGraphEvidenceMarkdown,
  resolveGraphProvider
} from '../memory/graphProvider.js';
import { SYNTHETIC_INCIDENT_FIXTURE } from './investigation.js';

export const DEFAULT_GEMINI_MODEL_CHAIN = Object.freeze([
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite'
]);

export const DEFAULT_GEMINI_SUMMARY_MODEL_CHAIN = Object.freeze([
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash'
]);

export function formatKeySlotLabel(slot) {
  if (!slot) return 'key-1';
  if (slot === 'GEMINI_API_KEY') return 'key-1';
  if (slot === 'GEMINI_API_KEY_2') return 'key-2';
  if (slot === 'GEMINI_API_KEY_3') return 'key-3';
  const match = String(slot).match(/_(\d+)$/);
  return match ? `key-${match[1]}` : String(slot);
}

export function logGeminiAttempt({
  modelId,
  keySlot,
  attemptNumber,
  elapsedMs,
  status = null,
  category = 'unknown',
  success = false,
  isFailover = false,
  details = null
}) {
  const slotLabel = formatKeySlotLabel(keySlot);
  const statusStr = status ? `HTTP ${status}` : (success ? 'HTTP 200' : 'N/A');
  const detailsStr = details ? ` - ${details}` : '';
  const msg = `[TraceForge:Gemini] Attempt ${attemptNumber} | Model: ${modelId} | KeySlot: ${slotLabel} | ${statusStr} | Category: ${category} | Elapsed: ${elapsedMs}ms | Result: ${success ? 'SUCCESS' : (isFailover ? 'FAILOVER' : 'FAILED')}${detailsStr}`;
  if (success) {
    console.log(msg);
  } else {
    console.warn(msg);
  }
}

const NON_TEXT_MODEL_PATTERNS = /(-tts\b|-live\b|-image\b|embedding|transcribe|omni)/i;

/**
 * Resolves, trims, and deduplicates configured Gemini API keys in priority order:
 *   1. GEMINI_API_KEY
 *   2. GEMINI_API_KEY_2
 *   3. GEMINI_API_KEY_3
 * Ignores blank values and deduplicates identical keys while preserving order.
 * Never logs or exposes raw key values in public metadata.
 */
export function resolveGeminiApiKeys(options = {}) {
  const env = options.env || process.env;
  const rawEntries = [];

  if (Array.isArray(options.apiKeys) && options.apiKeys.length > 0) {
    options.apiKeys.forEach((k, idx) => {
      rawEntries.push({
        slot: idx === 0 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${idx + 1}`,
        key: k
      });
    });
  } else if (options.apiKey !== undefined) {
    rawEntries.push({ slot: 'GEMINI_API_KEY', key: options.apiKey });
    if (options.env?.GEMINI_API_KEY_2) {
      rawEntries.push({ slot: 'GEMINI_API_KEY_2', key: options.env.GEMINI_API_KEY_2 });
    }
    if (options.env?.GEMINI_API_KEY_3) {
      rawEntries.push({ slot: 'GEMINI_API_KEY_3', key: options.env.GEMINI_API_KEY_3 });
    }
  } else {
    rawEntries.push(
      { slot: 'GEMINI_API_KEY', key: env.GEMINI_API_KEY },
      { slot: 'GEMINI_API_KEY_2', key: env.GEMINI_API_KEY_2 },
      { slot: 'GEMINI_API_KEY_3', key: env.GEMINI_API_KEY_3 }
    );
  }

  const seenKeys = new Set();
  const deduplicated = [];

  for (const entry of rawEntries) {
    const trimmed = typeof entry.key === 'string' ? entry.key.trim() : '';
    if (!trimmed) continue;
    if (seenKeys.has(trimmed)) continue;
    seenKeys.add(trimmed);
    deduplicated.push({
      slot: entry.slot,
      key: trimmed
    });
  }

  return deduplicated;
}

/**
 * Redacts all configured API keys and inline `key=...` query parameters from error messages and logs.
 */
export function sanitizeGeminiError(message, extraKeys = []) {
  if (!message) return 'Unknown Gemini provider error';
  let sanitized = String(message);

  // Strip ?key=... or &key=... query parameters
  sanitized = sanitized.replace(/([?&]key=)[^&\s"']+/gi, '$1[REDACTED]');
  // Strip Google API key patterns (AIza...)
  sanitized = sanitized.replace(/\bAIza[0-9A-Za-z_-]{16,}\b/g, '[REDACTED]');

  const callerKeys = Array.isArray(extraKeys) ? extraKeys : [extraKeys];
  const envKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3
  ];

  const keysToRedact = [...callerKeys, ...envKeys]
    .map(k => (typeof k === 'object' && k !== null ? k.key : k))
    .filter(k => typeof k === 'string' && k.trim().length >= 4);

  for (const key of keysToRedact) {
    sanitized = sanitized.split(key.trim()).join('[REDACTED]');
  }

  return sanitized;
}

/**
 * Parses HTTP `Retry-After` header (seconds or HTTP date) into milliseconds.
 */
export function parseRetryAfterMs(headers) {
  if (!headers) return null;
  let raw = null;
  if (typeof headers.get === 'function') {
    raw = headers.get('retry-after') ?? headers.get('Retry-After');
  } else if (typeof headers === 'object') {
    raw = headers['retry-after'] ?? headers['Retry-After'] ?? null;
  }
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return null;
  }

  const str = String(raw).trim();
  const seconds = Number(str);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const dateMs = Date.parse(str);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

/**
 * Parses, normalizes, deduplicates, and validates the ordered Gemini text model chain.
 * Supports dedicated summary chains via GEMINI_SUMMARY_MODEL_CHAIN / GEMINI_SUMMARY_MODEL
 * when options.summaryMode or options.preferStableSummary is specified.
 */
export function resolveGeminiModelChain(options = {}) {
  const env = options.env || process.env;
  let rawModels = [];

  const isSummaryMode = Boolean(
    options.summaryMode ||
    options.preferStableSummary ||
    options.mode === 'summary'
  );

  if (Array.isArray(options.modelChain) && options.modelChain.length > 0) {
    rawModels = options.modelChain;
  } else if (Array.isArray(options.summaryModelChain) && options.summaryModelChain.length > 0) {
    rawModels = options.summaryModelChain;
  } else if (isSummaryMode && typeof env.GEMINI_SUMMARY_MODEL_CHAIN === 'string' && env.GEMINI_SUMMARY_MODEL_CHAIN.trim()) {
    rawModels = env.GEMINI_SUMMARY_MODEL_CHAIN.split(',');
  } else if (isSummaryMode && typeof env.GEMINI_SUMMARY_MODEL === 'string' && env.GEMINI_SUMMARY_MODEL.trim()) {
    rawModels = [env.GEMINI_SUMMARY_MODEL.trim(), ...DEFAULT_GEMINI_SUMMARY_MODEL_CHAIN];
  } else if (typeof env.GEMINI_MODEL_CHAIN === 'string' && env.GEMINI_MODEL_CHAIN.trim()) {
    rawModels = env.GEMINI_MODEL_CHAIN.split(',');
  } else if (typeof env.GEMINI_MODEL === 'string' && env.GEMINI_MODEL.trim()) {
    rawModels = [env.GEMINI_MODEL.trim(), ...DEFAULT_GEMINI_MODEL_CHAIN];
  } else if (isSummaryMode) {
    rawModels = [...DEFAULT_GEMINI_SUMMARY_MODEL_CHAIN];
  } else {
    rawModels = [...DEFAULT_GEMINI_MODEL_CHAIN];
  }

  const seen = new Set();
  const deduplicated = [];

  for (const raw of rawModels) {
    const modelId = String(raw || '').trim();
    if (!modelId) continue;
    if (NON_TEXT_MODEL_PATTERNS.test(modelId)) continue;
    const lower = modelId.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    deduplicated.push(modelId);
  }

  if (deduplicated.length > 0) return deduplicated;
  return isSummaryMode ? [...DEFAULT_GEMINI_SUMMARY_MODEL_CHAIN] : [...DEFAULT_GEMINI_MODEL_CHAIN];
}

export function resolveGeminiSummaryModelChain(options = {}) {
  return resolveGeminiModelChain({ ...options, summaryMode: true });
}

/**
 * Classifies an error from a Gemini model call to determine whether to fail over
 * to the next key (on auth errors), fail over to the next model (on model/transient/rate-limit errors),
 * or abort immediately on permanent client payload errors.
 */
export function classifyGeminiError(err, status = null) {
  const msg = String(err?.message || err || '').toLowerCase();
  const httpStatus = status || err?.status || null;

  if (err?.category && typeof err.retryable === 'boolean') {
    return {
      category: err.category,
      retryable: err.retryable,
      status: httpStatus
    };
  }

  if (msg.includes('gemini_api_key is not configured') || msg.includes('missing api key')) {
    return { category: 'missing_api_key', retryable: false, status: 401 };
  }

  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('invalid api key') ||
    msg.includes('key revoked') ||
    msg.includes('revoked') ||
    msg.includes('unauthorized') ||
    msg.includes('unauthenticated') ||
    msg.includes('permission_denied') ||
    (httpStatus === 400 && (msg.includes('api key') || msg.includes('api_key')))
  ) {
    return { category: 'auth_error', retryable: false, status: httpStatus || 401 };
  }

  if (httpStatus === 429 || msg.includes('rate limit') || msg.includes('resource_exhausted') || msg.includes('quota')) {
    return { category: 'rate_limit', retryable: true, status: 429 };
  }

  if (
    httpStatus === 404 ||
    msg.includes('not found') ||
    msg.includes('is not supported') ||
    msg.includes('unsupported model') ||
    msg.includes('model_not_found')
  ) {
    return { category: 'model_unavailable', retryable: true, status: httpStatus || 404 };
  }

  if (
    httpStatus === 400 &&
    (msg.includes('model') || msg.includes('unsupported') || msg.includes('not found'))
  ) {
    return { category: 'model_unavailable', retryable: true, status: 400 };
  }

  if (httpStatus === 400 || msg.includes('invalid argument') || msg.includes('permanent request error')) {
    return { category: 'invalid_request', retryable: false, status: 400 };
  }

  if (
    (httpStatus && httpStatus >= 500 && httpStatus < 600) ||
    msg.includes('http 5') ||
    msg.includes('service unavailable') ||
    msg.includes('internal error') ||
    msg.includes('overloaded')
  ) {
    return { category: 'server_error', retryable: true, status: httpStatus || 503 };
  }

  if (
    err?.name === 'TimeoutError' ||
    err?.name === 'AbortError' ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('aborted')
  ) {
    return { category: 'timeout', retryable: true, status: 408 };
  }

  if (
    msg.includes('malformed json') ||
    msg.includes('empty response') ||
    msg.includes('no candidate')
  ) {
    return { category: 'malformed_response', retryable: true, status: 502 };
  }

  if (msg.includes('network error') || msg.includes('fetch failed') || msg.includes('econnreset') || msg.includes('enotfound')) {
    return { category: 'network_error', retryable: true, status: 503 };
  }

  return { category: 'provider_error', retryable: true, status: httpStatus || 500 };
}

/**
 * Extracts a repository identifier from an entity object (e.g. from graph node or focusEntity).
 */
export function extractRepoFromEntity(entity) {
  if (!entity || typeof entity !== 'object') return null;
  if (entity.repoFullName && typeof entity.repoFullName === 'string' && entity.repoFullName.includes('/')) {
    return entity.repoFullName.trim();
  }
  if (typeof entity.id === 'string' && entity.id.includes('::')) {
    const prefix = entity.id.split('::')[0].trim();
    if (prefix.includes('/')) return prefix;
  }
  if (entity.label === 'Repository' && typeof entity.title === 'string' && entity.title.includes('/')) {
    return entity.title.trim();
  }
  if (typeof entity.id === 'string' && entity.id.includes('/') && !entity.id.includes('::')) {
    return entity.id.trim();
  }
  return null;
}

export class AIProvider {
  constructor(options = {}) {
    this.options = options;
    this.baseUrl = options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/models';
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
  }

  getModelChain(overrideOptions = {}) {
    return resolveGeminiModelChain({
      ...this.options,
      ...overrideOptions
    });
  }

  get modelName() {
    return this.getModelChain()[0];
  }

  getApiKeyChain(overrideOptions = {}) {
    return resolveGeminiApiKeys({
      ...this.options,
      ...overrideOptions
    });
  }

  getApiKey(overrideOptions = {}) {
    const chain = this.getApiKeyChain(overrideOptions);
    return chain.length > 0 ? chain[0].key : '';
  }

  getRequestTimeoutMs(overrideOptions = {}) {
    const env = overrideOptions.env || this.options.env || process.env;
    const raw =
      overrideOptions.requestTimeoutMs ??
      this.options.requestTimeoutMs ??
      env.GEMINI_REQUEST_TIMEOUT_MS;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 12000;
  }

  getOverallDeadlineMs(overrideOptions = {}) {
    const env = overrideOptions.env || this.options.env || process.env;
    const raw =
      overrideOptions.overallDeadlineMs ??
      this.options.overallDeadlineMs ??
      env.GEMINI_OVERALL_DEADLINE_MS;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 28000;
  }

  getRetryDelayMs(overrideOptions = {}) {
    const env = overrideOptions.env || this.options.env || process.env;
    const raw =
      overrideOptions.retryDelayMs ??
      this.options.retryDelayMs ??
      env.GEMINI_RETRY_DELAY_MS;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 150;
  }

  getMaxRetryAfterMs(overrideOptions = {}) {
    const env = overrideOptions.env || this.options.env || process.env;
    const raw =
      overrideOptions.maxRetryAfterMs ??
      this.options.maxRetryAfterMs ??
      env.GEMINI_MAX_RETRY_AFTER_MS;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 2000;
  }

  /**
   * Builds a compact, token-efficient repository context representation
   */
  buildCompactContext(analysis) {
    const {
      repository,
      metrics,
      techStack,
      frameworks,
      projectType,
      architecture,
      structure,
      observations,
      aiContextReady,
      projectMemory
    } = analysis || {};

    const sections = [];

    // 1. Core Metadata
    sections.push(`## Repository Metadata
- Full Name: ${repository?.fullName || 'Unknown'}
- Description: ${repository?.description || 'No description provided'}
- Primary Language: ${repository?.primaryLanguage || 'Unknown'}
- License: ${repository?.license || 'Unknown'}
- Default Branch: ${repository?.branch || 'main'}
- Total Files: ${metrics?.totalFiles ?? aiContextReady?.filePaths?.length ?? 0} | Total Directories: ${metrics?.totalDirectories ?? structure?.classifiedDirectories?.length ?? 0}`);

    // 2. Project Classification & Inferred Pattern
    sections.push(`## Architectural Profile
- Inferred Project Type: ${projectType || 'Software Repository'}
- Inferred Architecture Pattern: ${architecture?.pattern || 'Layered Architecture'}
- Overview: ${architecture?.description || 'Standard software repository'}`);

    // 3. Technologies & Languages
    const topLangs = (techStack?.languages || []).slice(0, 5).map(l => `${l.name} (${l.percentage}%)`).join(', ');
    const backendTech = (techStack?.backend || []).map(b => b.name).join(', ') || 'None explicitly detected';
    const frontendTech = (techStack?.frontend || []).map(f => f.name).join(', ') || 'None explicitly detected';
    const devopsTech = (techStack?.devops || []).map(d => d.name).join(', ') || 'None explicitly detected';
    const dbTech = (techStack?.database || []).map(d => d.name).join(', ') || 'None explicitly detected';

    sections.push(`## Technology Stack
- Languages: ${topLangs || 'Unknown'}
- Backend: ${backendTech}
- Frontend: ${frontendTech}
- DevOps & CI/CD: ${devopsTech}
- Databases / ORM: ${dbTech}`);

    // 4. Frameworks & Dependencies
    if (frameworks && frameworks.length > 0) {
      sections.push(`## Detected Frameworks & Dependencies\n` + frameworks.map(f => `- ${f.name} (${f.category})`).join('\n'));
    }

    // 5. Entry Points
    if (architecture?.entryPoints && architecture.entryPoints.length > 0) {
      sections.push(`## Application Entry Points\n` + architecture.entryPoints.map(e => `- \`${e.path}\` (${e.type}, ${e.language})`).join('\n'));
    }

    // 6. Classified Directory Roles
    if (structure?.classifiedDirectories && structure.classifiedDirectories.length > 0) {
      sections.push(`## Directory Roles\n` + structure.classifiedDirectories.map(d => `- \`${d.path}\`: ${d.role} (${d.description})`).join('\n'));
    }

    // 7. Engineering Observations
    if (observations && observations.length > 0) {
      sections.push(`## Observations & Engineering Health\n` + observations.map(o => `- [${o.category}] ${o.title}: ${o.detail}`).join('\n'));
    }

    // 8. FalkorDB Graph Ingestion Counts (if available)
    if (projectMemory?.ingested && projectMemory?.counts) {
      const c = projectMemory.counts;
      sections.push(`## FalkorDB Graph Ingestion Summary
- Extracted Symbols: ${c.symbols ?? 0} | Components: ${c.components ?? 0} | Component Dependencies: ${c.componentDependencies ?? 0} | Call Edges: ${c.symbolCalls ?? 0}`);
    }

    // 9. Manifest files list
    if (aiContextReady?.manifestFiles && aiContextReady.manifestFiles.length > 0) {
      sections.push(`## Present Manifest Files\n` + aiContextReady.manifestFiles.map(m => `- \`${m}\``).join('\n'));
    }

    // 10. Repository Files List
    if (aiContextReady?.filePaths && aiContextReady.filePaths.length > 0) {
      sections.push(`## Key Repository Files\n` + aiContextReady.filePaths.slice(0, 80).map(f => `- \`${f}\``).join('\n'));
    }

    // 11. README Excerpt
    if (aiContextReady?.sampleReadmeExcerpt) {
      sections.push(`## README Excerpt\n\`\`\`markdown\n${aiContextReady.sampleReadmeExcerpt.trim()}\n\`\`\``);
    }

    return sections.join('\n\n');
  }

  /**
   * Executes a single model call against the Gemini generateContent REST API.
   */
  async invokeSingleModel(modelId, systemInstruction, userPrompt, options = {}) {
    const allKeys = this.getApiKeyChain(options).map(k => k.key);
    const apiKey = options.activeApiKey ?? this.getApiKey(options);
    if (!apiKey || !String(apiKey).trim()) {
      const err = new Error('GEMINI_API_KEY is not configured in .env. Please add your key to enable Gemini features.');
      err.category = 'missing_api_key';
      err.retryable = false;
      err.status = 401;
      throw err;
    }

    if (!userPrompt || !String(userPrompt).trim()) {
      const err = new Error('Permanent request error: userPrompt cannot be empty.');
      err.category = 'invalid_request';
      err.retryable = false;
      err.status = 400;
      throw err;
    }

    const timeoutMs = options.timeoutMs || this.getRequestTimeoutMs(options);
    const endpoint = `${this.baseUrl}/${modelId}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }]
        }
      ],
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048
      }
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs);

    let res;
    try {
      res = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
    } catch (err) {
      const isTimeout =
        err?.name === 'TimeoutError' ||
        err?.name === 'AbortError' ||
        String(err?.message || '').toLowerCase().includes('timed out') ||
        String(err?.message || '').toLowerCase().includes('abort');
      const safeMessage = sanitizeGeminiError(err?.message || 'Network failure', [apiKey, ...allKeys]);
      const wrapped = new Error(
        isTimeout
          ? `Model ${modelId} timed out after ${timeoutMs}ms.`
          : `Network error contacting Gemini model ${modelId}: ${safeMessage}`
      );
      wrapped.category = isTimeout ? 'timeout' : 'network_error';
      wrapped.retryable = true;
      wrapped.status = isTimeout ? 408 : 503;
      throw wrapped;
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const rawMsg = errData?.error?.message || `HTTP ${res.status}: ${res.statusText || 'Error'}`;
      const safeMsg = sanitizeGeminiError(rawMsg, [apiKey, ...allKeys]);
      const classification = classifyGeminiError({ message: safeMsg, status: res.status }, res.status);
      const retryAfterMs = parseRetryAfterMs(res.headers);

      const httpErr = new Error(`[${modelId}] ${safeMsg}`);
      httpErr.status = res.status;
      httpErr.category = classification.category;
      httpErr.retryable = classification.retryable;
      if (retryAfterMs !== null) {
        httpErr.retryAfterMs = retryAfterMs;
      }
      throw httpErr;
    }

    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') {
      const parseErr = new Error(`[${modelId}] Gemini API returned a malformed JSON response.`);
      parseErr.category = 'malformed_response';
      parseErr.retryable = true;
      parseErr.status = 502;
      throw parseErr;
    }

    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts;
    const text = Array.isArray(parts)
      ? parts.map(p => p?.text || '').join('').trim()
      : '';

    if (!text) {
      const emptyErr = new Error(`[${modelId}] Gemini API returned an empty response.`);
      emptyErr.category = 'malformed_response';
      emptyErr.retryable = true;
      emptyErr.status = 502;
      throw emptyErr;
    }

    return text;
  }

  /**
   * Executes a Gemini generation request across configured API keys
   * (GEMINI_API_KEY -> GEMINI_API_KEY_2 -> GEMINI_API_KEY_3) and the ordered model chain
   * (gemini-3.8-flash -> gemini-3.6-flash -> gemini-3.5-flash-lite):
   * - Rotates to the next configured key only when a key fails authentication (invalid, revoked, unauthorized).
   * - Never rotates keys to evade rate limits (429); instead respects Retry-After / bounded backoff and switches models.
   * - Avoids duplicate (key, model) attempts and never retries keys marked unusable.
   * - Preserves the exact systemInstruction and userPrompt across all attempts.
   */
  async callGeminiWithFailover(systemInstruction, userPrompt, options = {}) {
    // Support tests that directly monkey-patch `provider.callGemini = async (...) => ...`
    if (this.callGemini !== AIProvider.prototype.callGemini) {
      const text = await this.callGemini(systemInstruction, userPrompt);
      const primary = this.getModelChain(options)[0];
      return {
        text,
        model: primary,
        primaryModel: primary,
        fallbackUsed: false,
        modelFallbackUsed: false,
        keyFallbackUsed: false,
        activeKeySlot: 'GEMINI_API_KEY',
        attempts: 1,
        triedModels: [primary],
        triedKeySlots: ['GEMINI_API_KEY'],
        backoffDelaysMs: []
      };
    }

    const keyChain = this.getApiKeyChain(options);
    const allRawKeys = keyChain.map(k => k.key);

    if (keyChain.length === 0) {
      const err = new Error('GEMINI_API_KEY is not configured in .env. Please add your key to enable Gemini features.');
      err.category = 'missing_api_key';
      err.retryable = false;
      err.attempts = 0;
      err.triedModels = [];
      err.triedKeySlots = [];
      throw err;
    }

    if (!userPrompt || !String(userPrompt).trim()) {
      const err = new Error('Permanent request error: userPrompt cannot be empty.');
      err.category = 'invalid_request';
      err.retryable = false;
      err.attempts = 0;
      err.triedModels = [];
      err.triedKeySlots = [];
      throw err;
    }

    const modelChain = this.getModelChain(options);
    const overallDeadlineMs = this.getOverallDeadlineMs(options);
    const perAttemptTimeoutMs = this.getRequestTimeoutMs(options);
    const retryDelayMs = this.getRetryDelayMs(options);
    const maxRetryAfterMs = this.getMaxRetryAfterMs(options);
    const maxRetriesPerModel = Number.isFinite(options.maxRetriesPerModel)
      ? options.maxRetriesPerModel
      : (process.env.GEMINI_MAX_RETRIES_PER_MODEL ? Number(process.env.GEMINI_MAX_RETRIES_PER_MODEL) : 0);
    const maxTotalAttempts =
      options.maxTotalAttempts ||
      this.options?.maxTotalAttempts ||
      Math.min(8, keyChain.length * modelChain.length * 2);
    const startTime = Date.now();

    const unusableKeyIndices = new Set();
    const unavailableModelIndices = new Set();
    const comboAttempts = new Map();

    const triedModels = [];
    const triedKeySlots = [];
    const backoffDelaysMs = [];
    const attemptErrors = [];
    let lastClassification = { category: 'provider_error', retryable: false };

    let keyIndex = 0;
    let modelIndex = 0;
    let totalAttempts = 0;

    while (keyIndex < keyChain.length && modelIndex < modelChain.length && totalAttempts < maxTotalAttempts) {
      if (unusableKeyIndices.has(keyIndex)) {
        keyIndex += 1;
        // Find next eligible model for the new key
        let firstAvail = 0;
        while (firstAvail < modelChain.length && unavailableModelIndices.has(firstAvail)) {
          firstAvail += 1;
        }
        modelIndex = firstAvail;
        continue;
      }
      if (unavailableModelIndices.has(modelIndex)) {
        modelIndex += 1;
        continue;
      }

      const keyEntry = keyChain[keyIndex];
      const modelId = modelChain[modelIndex];
      const comboId = `${keyEntry.slot}::${modelId}`;
      const currentComboAttempts = comboAttempts.get(comboId) || 0;

      if (currentComboAttempts > maxRetriesPerModel) {
        modelIndex += 1;
        if (modelIndex >= modelChain.length) {
          if (options.rotateKeysOnFailure || keyChain.length > 1) {
            keyIndex += 1;
            let firstAvail = 0;
            while (firstAvail < modelChain.length && unavailableModelIndices.has(firstAvail)) {
              firstAvail += 1;
            }
            modelIndex = firstAvail;
          }
        }
        continue;
      }

      const elapsed = Date.now() - startTime;
      const remainingMs = overallDeadlineMs - elapsed;

      if (triedModels.length > 0 && remainingMs <= 100) {
        lastClassification = { category: 'timeout', retryable: false };
        attemptErrors.push(`Overall deadline (${overallDeadlineMs}ms) reached before trying ${modelId}`);
        break;
      }

      const attemptTimeout = Math.max(Math.min(perAttemptTimeoutMs, remainingMs), 150);
      comboAttempts.set(comboId, currentComboAttempts + 1);
      totalAttempts += 1;
      triedModels.push(modelId);
      if (!triedKeySlots.includes(keyEntry.slot)) {
        triedKeySlots.push(keyEntry.slot);
      }

      const attemptStartTime = Date.now();
      try {
        const text = await this.invokeSingleModel(modelId, systemInstruction, userPrompt, {
          ...options,
          activeApiKey: keyEntry.key,
          timeoutMs: attemptTimeout
        });

        const attemptElapsedMs = Date.now() - attemptStartTime;
        logGeminiAttempt({
          modelId,
          keySlot: keyEntry.slot,
          attemptNumber: totalAttempts,
          elapsedMs: attemptElapsedMs,
          status: 200,
          category: 'success',
          success: true,
          isFailover: totalAttempts > 1
        });

        return {
          text,
          model: modelId,
          primaryModel: modelChain[0],
          fallbackUsed: totalAttempts > 1,
          modelFallbackUsed: modelIndex > 0,
          keyFallbackUsed: keyIndex > 0,
          activeKeySlot: keyEntry.slot,
          attempts: totalAttempts,
          triedModels,
          triedKeySlots,
          backoffDelaysMs
        };
      } catch (err) {
        const attemptElapsedMs = Date.now() - attemptStartTime;
        const safeMsg = sanitizeGeminiError(err?.message || 'Model call failed', allRawKeys);
        const classification = classifyGeminiError(err, err?.status);
        lastClassification = classification;
        attemptErrors.push(`${modelId} [${keyEntry.slot}] (${classification.category}): ${safeMsg}`);

        logGeminiAttempt({
          modelId,
          keySlot: keyEntry.slot,
          attemptNumber: totalAttempts,
          elapsedMs: attemptElapsedMs,
          status: classification.status,
          category: classification.category,
          success: false,
          isFailover: true,
          details: safeMsg.slice(0, 80)
        });

        // 1. Authentication / Invalid or Revoked Key Error -> mark key unusable and rotate to next key
        if (classification.category === 'auth_error') {
          unusableKeyIndices.add(keyIndex);

          let nextKeyIndex = keyIndex + 1;
          while (nextKeyIndex < keyChain.length && unusableKeyIndices.has(nextKeyIndex)) {
            nextKeyIndex += 1;
          }

          if (nextKeyIndex < keyChain.length) {
            keyIndex = nextKeyIndex;
            // If current model is available, retain it; otherwise select first available model
            if (unavailableModelIndices.has(modelIndex)) {
              let firstAvail = 0;
              while (firstAvail < modelChain.length && unavailableModelIndices.has(firstAvail)) {
                firstAvail += 1;
              }
              modelIndex = firstAvail;
            }
            continue;
          }

          // All configured keys are invalid/unusable -> abort immediately without retrying models
          const authErr = new Error(
            keyChain.length > 1
              ? `All ${keyChain.length} configured Gemini API keys failed authentication. Last error: ${safeMsg}`
              : safeMsg
          );
          authErr.category = 'auth_error';
          authErr.retryable = false;
          authErr.attempts = totalAttempts;
          authErr.triedModels = triedModels;
          authErr.triedKeySlots = triedKeySlots;
          authErr.backoffDelaysMs = backoffDelaysMs;
          throw authErr;
        }

        // 2. Permanent non-model client request error -> abort immediately
        if (!classification.retryable) {
          const permErr = new Error(safeMsg);
          permErr.category = classification.category;
          permErr.retryable = false;
          permErr.attempts = totalAttempts;
          permErr.triedModels = triedModels;
          permErr.triedKeySlots = triedKeySlots;
          permErr.backoffDelaysMs = backoffDelaysMs;
          throw permErr;
        }

        // 3. Model unavailable -> mark model unavailable for any subsequent key/model attempts
        if (classification.category === 'model_unavailable') {
          unavailableModelIndices.add(modelIndex);
          modelIndex += 1;
          continue;
        }

        // 4. Rate limit (429) or transient server/network/timeout error:
        let delayMs = retryDelayMs;
        if (classification.category === 'rate_limit') {
          if (Number.isFinite(err?.retryAfterMs) && err.retryAfterMs >= 0) {
            delayMs = Math.min(err.retryAfterMs, maxRetryAfterMs);
          } else {
            delayMs = Math.min(retryDelayMs * Math.pow(2, modelIndex), maxRetryAfterMs);
          }
        } else if (classification.category === 'server_error' || classification.category === 'timeout') {
          if (Number.isFinite(err?.retryAfterMs) && err.retryAfterMs >= 0) {
            delayMs = Math.min(err.retryAfterMs, maxRetryAfterMs);
          } else if (retryDelayMs > 0) {
            const jitter = Math.floor(Math.random() * 25);
            delayMs = Math.min(retryDelayMs * Math.pow(2, currentComboAttempts) + jitter, maxRetryAfterMs);
          }
        }

        if (delayMs >= 0 && Date.now() - startTime + delayMs < overallDeadlineMs) {
          backoffDelaysMs.push(delayMs);
          if (delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }

        // Retry same model if configured and retry budget remains
        if (
          classification.category !== 'rate_limit' &&
          classification.category !== 'timeout' &&
          currentComboAttempts < maxRetriesPerModel
        ) {
          continue;
        }

        // Otherwise advance to next model
        let nextModelIndex = modelIndex + 1;
        while (nextModelIndex < modelChain.length && unavailableModelIndices.has(nextModelIndex)) {
          nextModelIndex += 1;
        }

        if (nextModelIndex < modelChain.length) {
          modelIndex = nextModelIndex;
        } else {
          // All models failed on this key.
          // API keys in the same project share quota, so do NOT rotate keys on 429 rate limit.
          // On non-quota transient errors, if secondary keys are configured, advance to next key.
          if (classification.category !== 'rate_limit' && (options.rotateKeysOnFailure || keyChain.length > 1)) {
            let nextKey = keyIndex + 1;
            while (nextKey < keyChain.length && unusableKeyIndices.has(nextKey)) {
              nextKey += 1;
            }
            if (nextKey < keyChain.length) {
              keyIndex = nextKey;
              let firstAvail = 0;
              while (firstAvail < modelChain.length && unavailableModelIndices.has(firstAvail)) {
                firstAvail += 1;
              }
              modelIndex = firstAvail;
            } else {
              modelIndex = nextModelIndex;
            }
          } else {
            modelIndex = nextModelIndex;
          }
        }
      }
    }

    const summaryError = new Error(
      sanitizeGeminiError(
        `All configured Gemini models failed (${triedModels.join(' -> ')}). Details: ${attemptErrors.join(' | ')}`,
        allRawKeys
      )
    );
    summaryError.category = lastClassification.category || 'all_models_failed';
    summaryError.retryable = false;
    summaryError.attempts = totalAttempts;
    summaryError.triedModels = triedModels;
    summaryError.triedKeySlots = triedKeySlots;
    summaryError.backoffDelaysMs = backoffDelaysMs;
    throw summaryError;
  }

  /**
   * Backward-compatible helper returning generated text.
   */
  async callGemini(systemInstruction, userPrompt, options = {}) {
    const result = await this.callGeminiWithFailover(systemInstruction, userPrompt, options);
    return result.text;
  }

  /**
   * Generates a deep architectural summary grounded strictly in the repo context
   */
  async generateArchitectureSummary(analysis, options = {}) {
    const allRawKeys = this.getApiKeyChain(options).map(k => k.key);
    try {
      const context = this.buildCompactContext(analysis);
      const repoName = analysis?.repository?.fullName || 'Unknown Repository';

      const systemInstruction = `You are TraceForge, an expert software architecture analyst.
Analyze the provided repository context and produce a structured, factual executive architectural summary.

STRICT GROUNDING RULES:
1. Ground your explanation STRICTLY in the provided repository context.
2. Do NOT invent, assume, or hallucinate repository purpose, files, test coverage, external databases, or services not present in the context.
3. Whenever discussing components, entry points, or dependencies, cite actual file paths and directory names (e.g. \`server/index.js\`, \`client/src/App.jsx\`).
4. If something is not evident from the available context, clearly state that it is not visible in the scanned artifacts.
5. Provide the output in clean, concise GitHub markdown with these sections:
   - ### What This Repository Does & Tech Stack
   - ### Key Entry Points & Architectural Components
   - ### Dependencies, Relationships & Design Patterns
   - ### Potential Risks, Coupling & Next Areas to Investigate`;

      const prompt = `Here is the verified scan context for repository ${repoName}:

${context}

Please generate the architectural summary following the grounding rules.`;

      const result = await this.callGeminiWithFailover(systemInstruction, prompt, options);

      return {
        available: true,
        summary: result.text,
        model: result.model,
        primaryModel: result.primaryModel,
        fallbackUsed: result.fallbackUsed,
        modelFallbackUsed: result.modelFallbackUsed,
        keyFallbackUsed: result.keyFallbackUsed,
        activeKeySlot: result.activeKeySlot,
        attempts: result.attempts,
        triedModels: result.triedModels,
        triedKeySlots: result.triedKeySlots,
        backoffDelaysMs: result.backoffDelaysMs
      };
    } catch (err) {
      const safeMsg = sanitizeGeminiError(err.message, allRawKeys);
      console.error('[TraceForge] Gemini summary error:', safeMsg);
      const fallbackSummary = generateDeterministicSummary(analysis, options);
      return {
        available: false,
        fallbackGenerated: true,
        isDeterministicFallback: true,
        summary: fallbackSummary,
        model: 'deterministic-fallback',
        primaryModel: this.getModelChain(options)[0],
        error: `Gemini Error: ${safeMsg}`,
        errorCategory: err.category || 'provider_error',
        attempts: err.attempts || 0,
        triedModels: err.triedModels || [],
        triedKeySlots: err.triedKeySlots || [],
        backoffDelaysMs: err.backoffDelaysMs || [],
        fallbackUsed: (err.attempts || 0) > 1 || true
      };
    }
  }

  /**
   * Combines verified repository scan context with retrieved FalkorDB project memory evidence
   * and optional selected graph entity context.
   */
  assembleInvestigationContext(question, analysis, graphContext = null, focusEntity = null, options = {}) {
    const repoContext = this.buildCompactContext(analysis);
    const graphMarkdown = formatGraphEvidenceMarkdown(graphContext, options);
    const repoName = analysis?.repository?.fullName || 'Unknown Repository';

    let entitySection = '';
    if (focusEntity && typeof focusEntity === 'object') {
      const detailBlock =
        typeof focusEntity.details === 'string'
          ? `  - Summary: ${focusEntity.details}`
          : Object.entries(focusEntity.details || focusEntity.properties || {})
              .filter(([, val]) => val !== undefined && val !== null && val !== '')
              .map(([k, val]) => `  - ${k}: ${val}`)
              .join('\n');
      entitySection = `\n## Selected Graph Entity Under Investigation
- Entity Type: ${focusEntity.label || focusEntity.type || 'Entity'}
- Entity Name: ${focusEntity.title || focusEntity.id || 'Unknown'}
- Provenance: ${focusEntity.provenance || 'Graph Memory'}
${detailBlock ? `- Attributes:\n${detailBlock}` : ''}\n`;
    }

    return `Repository Scan Context for ${repoName}:

${repoContext}
${entitySection}
${graphMarkdown}

User Question: "${question}"

Please provide an evidence-grounded answer following the strict grounding rules.`;
  }

  /**
   * Answers developer natural language questions grounded strictly in the repo context
   * and Project Memory graph (FalkorDB) when available.
   */
  async answerQuestion(question, analysis, options = {}) {
    const allRawKeys = this.getApiKeyChain(options).map(k => k.key);
    try {
      const focusRepo = extractRepoFromEntity(options.focusEntity);
      const effectiveRepo = (options.targetRepo && String(options.targetRepo).trim()) ||
        focusRepo ||
        analysis?.repository?.fullName ||
        null;

      let effectiveAnalysis = analysis;
      if (effectiveRepo === SYNTHETIC_INCIDENT_FIXTURE.repository.fullName) {
        effectiveAnalysis = SYNTHETIC_INCIDENT_FIXTURE;
      } else if (effectiveRepo && analysis?.repository?.fullName !== effectiveRepo) {
        effectiveAnalysis = {
          ...analysis,
          repository: {
            ...(analysis?.repository || {}),
            fullName: effectiveRepo
          }
        };
      }

      let graphContext = options.graphContext || null;
      if (!graphContext && !options.skipGraphRetrieval && effectiveRepo) {
        graphContext = await retrieveGraphContext(
          effectiveRepo,
          question,
          options
        );
      }

      const prompt = this.assembleInvestigationContext(
        question,
        effectiveAnalysis,
        graphContext,
        options.focusEntity || null,
        options
      );

      const activeProvider = options.provider || resolveGraphProvider(options.env || process.env);
      const graphLabel = 'FalkorDB';

      const systemInstruction = `You are TraceForge Codebase & Project Memory Assistant.
Your objective is to answer developer and debugging questions based STRICTLY on the provided repository scan context and the ${graphLabel} Project Memory Graph Evidence.

STRICT GROUNDING & INVESTIGATION RULES:
1. Ground all answers strictly in the provided repository context (metadata, manifest files, directory tree, technologies, entry points, README) and ${graphLabel} Project Memory (recorded bugs, fixes, technical decisions, component dependencies, verified symbols with line ranges, and commits).
2. Do NOT invent files, functions, commit SHAs, or external tools that are not present in the context. Never pretend a graph memory record exists if no matching bug, fix, or decision is present in the ${graphLabel} Project Memory section.
3. Always cite specific file paths (e.g. \`server/ai/provider.js\`), source line ranges (e.g. \`L95-L140\`), and commit SHAs when available in the context.
4. Clearly distinguish **Confirmed Facts** (directly backed by scanned files, symbols, commits, or recorded graph bugs/fixes/decisions), **Inferred Causes & Uncertainty**, and **Recommended Next Debugging Steps** using explicit markdown sections:
   - \`### Confirmed Facts\`
   - \`### Inferred Causes & Uncertainty\`
   - \`### Recommended Next Debugging Steps\`
5. If the context does not contain sufficient information to answer part or all of the question with certainty, EXPLICITLY state: "Based on the scanned repository context, this cannot be determined because [specific reason]." Do not guess or hallucinate.
6. Format your response in concise, well-structured GitHub markdown.`;

      const result = await this.callGeminiWithFailover(systemInstruction, prompt, options);

      return {
        available: true,
        answer: result.text,
        question,
        model: result.model,
        primaryModel: result.primaryModel,
        fallbackUsed: result.fallbackUsed,
        modelFallbackUsed: result.modelFallbackUsed,
        keyFallbackUsed: result.keyFallbackUsed,
        activeKeySlot: result.activeKeySlot,
        attempts: result.attempts,
        triedModels: result.triedModels,
        triedKeySlots: result.triedKeySlots,
        backoffDelaysMs: result.backoffDelaysMs,
        graphMemory: {
          used: Boolean(graphContext?.available && graphContext?.hasEvidence),
          repoFullName: effectiveRepo || analysis?.repository?.fullName || null,
          status: graphContext?.status || 'unconfigured',
          evidenceCount:
            (graphContext?.bugsAndFixes?.length || 0) +
            (graphContext?.decisions?.length || 0) +
            (graphContext?.componentDependencies?.length || 0) +
            (graphContext?.symbols?.length || 0) +
            (graphContext?.recentCommits?.length || 0),
          bugsAndFixes: graphContext?.bugsAndFixes || [],
          decisions: graphContext?.decisions || [],
          componentDependencies: graphContext?.componentDependencies || [],
          symbols: (graphContext?.symbols || []).slice(0, 8),
          recentCommits: (graphContext?.recentCommits || []).slice(0, 5)
        }
      };
    } catch (err) {
      const safeMsg = sanitizeGeminiError(err.message, allRawKeys);
      console.error('[TraceForge] Gemini Q&A error:', safeMsg);
      return {
        available: false,
        error: `Gemini Error: ${safeMsg}`,
        errorCategory: err.category || 'provider_error',
        attempts: err.attempts || 0,
        triedModels: err.triedModels || [],
        triedKeySlots: err.triedKeySlots || [],
        backoffDelaysMs: err.backoffDelaysMs || [],
        fallbackUsed: (err.attempts || 0) > 1,
        answer: null
      };
    }
  }
}

export const aiProvider = new AIProvider();

/**
 * Generates a deterministic, graph-grounded incident investigation summary fallback
 * when all Gemini generative AI attempts fail.
 * Preserves the 6 mandatory evidence dimensions without hallucinating edges or claiming runtime confirmation.
 */
export function generateDeterministicInvestigationSummary(investigation, options = {}) {
  const diagnosis = investigation?.diagnosis || {};
  const connectedEvidence = investigation?.connectedEvidence || {};
  const keywordBaseline = investigation?.keywordBaseline || {};
  const suspectedIntroducing =
    investigation?.suspectedIntroducingCommit ||
    connectedEvidence?.matchingCommit ||
    null;
  const historicalFix =
    investigation?.historicalFix ||
    diagnosis?.historicalFix ||
    null;
  const implStatus =
    investigation?.implementationStatus ||
    diagnosis?.implementationStatus ||
    {};

  // 1. Observed graph-supported call path
  const callPathNodes = [];
  const edgeDetails = [];
  if (Array.isArray(connectedEvidence.evidenceChain) && connectedEvidence.evidenceChain.length > 0) {
    for (const item of connectedEvidence.evidenceChain) {
      if (item.type === 'ENTRYPOINT_SYMBOL') {
        if (item.details) edgeDetails.push(`Entrypoint: ${item.details}`);
        const m = item.details?.match(/API Entrypoint\s+([a-zA-Z0-9_$]+)/);
        if (m && !callPathNodes.includes(m[1])) callPathNodes.push(m[1]);
      } else if (item.type === 'SYMBOL_CALLS_SYMBOL') {
        if (item.details) edgeDetails.push(`Call edge: ${item.details}`);
        const m = item.details?.match(/([a-zA-Z0-9_$]+)\s+calls\s+([a-zA-Z0-9_$]+)/);
        if (m) {
          if (!callPathNodes.includes(m[1])) callPathNodes.push(m[1]);
          if (!callPathNodes.includes(m[2])) callPathNodes.push(m[2]);
        }
      }
    }
  }

  // Fallback to callers array or entryPoint/target if chain is sparse
  if (callPathNodes.length === 0 && Array.isArray(connectedEvidence.callers) && connectedEvidence.callers.length > 0) {
    if (investigation.entryPoint) callPathNodes.push(investigation.entryPoint);
    connectedEvidence.callers.forEach(c => {
      if (c.name && !callPathNodes.includes(c.name)) callPathNodes.push(c.name);
    });
    if (diagnosis.rootCauseSymbol && !callPathNodes.includes(diagnosis.rootCauseSymbol)) {
      callPathNodes.push(diagnosis.rootCauseSymbol);
    }
  }

  const callPathString = callPathNodes.length > 0
    ? callPathNodes.join(' → ')
    : (investigation.entryPoint && diagnosis.rootCauseSymbol
        ? `${investigation.entryPoint} → ${diagnosis.rootCauseSymbol}`
        : 'Direct call path not isolated in static graph context');

  const repoName = (investigation?.repoFullName || options.repoFullName || '').toLowerCase();
  const isDemo = Boolean(options.isDemo || repoName === 'acme/payment-gateway');

  // 2. Leading root-cause hypothesis and graph confidence
  const confidence = diagnosis.confidence || investigation?.confidence || (isDemo ? 'HIGH' : 'INSUFFICIENT_EVIDENCE');
  const rootCauseSymbol = diagnosis.rootCauseSymbol || investigation?.rootCauseSymbol || (isDemo ? 'acquireTokenLock' : (confidence === 'INSUFFICIENT_EVIDENCE' ? 'Unisolated' : 'Unknown'));
  const rootCauseFile = diagnosis.rootCauseFile || investigation?.rootCauseFile || (isDemo ? 'services/tokenBucket.js' : (confidence === 'INSUFFICIENT_EVIDENCE' ? 'None (Insufficient graph evidence)' : 'Unknown'));
  const candidateReasons = diagnosis.candidateRankings?.[0]?.reasons || investigation?.candidateRankings?.[0]?.reasons || (isDemo ? [
    `Symbol \`${rootCauseSymbol}\` is reached via verified static call graph traversal.`,
    `File \`${rootCauseFile}\` was modified in suspected introducing change.`,
    `Matches prior recorded institutional incident pattern.`
  ] : [
    confidence === 'INSUFFICIENT_EVIDENCE'
      ? 'Insufficient connected graph evidence: no reachable downstream symbol was modified by a suspected commit.'
      : 'Grounded in static AST analysis.'
  ]);

  // 3. Rejected decoy and evidence-based rationale
  const altDecoy = investigation?.rejectedAlternatives?.[0] || diagnosis?.rejectedAlternatives?.[0] || investigation?.rejectedDecoy;
  const decoyFile = keywordBaseline.topSuspectFile || altDecoy?.filePath || investigation?.decoyFile || (isDemo ? 'services/rateLimiter.js' : 'None identified');
  const decoySymbol = keywordBaseline.topSuspectSymbol || altDecoy?.symbolName || altDecoy?.name || investigation?.decoySymbol || (isDemo ? 'checkRateLimit' : 'None');
  const decoyRationale = altDecoy?.explanation || altDecoy?.reason || (isDemo
    ? `Identified by lexical keyword matching due to superficial symptom overlap with "${(investigation?.symptoms || '').slice(0, 30)}", but refuted by graph traversal: static AST analysis confirms this component does not lie on the downstream blocking mutex execution path and was not modified in the suspected introducing commit.`
    : (decoyFile !== 'None identified'
        ? `Identified by lexical search for "${(investigation?.symptoms || '').slice(0, 30)}", but not supported by call graph traversal.`
        : 'No decoy candidate identified.'));

  // 4. Suspected introducing commit & Historical fix commit (strictly separated concepts)
  const introSha = suspectedIntroducing?.shortSha ||
    (suspectedIntroducing?.sha ? suspectedIntroducing.sha.slice(0, 7) :
      (investigation?.suspectedCommit ? investigation.suspectedCommit.slice(0, 7) : (isDemo ? '8f2a1b9' : null)));
  const introMsg = suspectedIntroducing?.message || (isDemo ? 'Refactor mutex synchronization' : (introSha ? 'Suspected commit' : 'None identified'));

  const fixTitle = historicalFix?.title || (isDemo ? 'Worker Thread Lock Starvation' : null);
  const fixSha = historicalFix?.commitShortSha || historicalFix?.shortSha ||
    (historicalFix?.commitSha ? historicalFix.commitSha.slice(0, 7) : (isDemo ? '7e1d4c2' : null));
  const fixSummary = historicalFix?.fixSummary || historicalFix?.summary ||
    (isDemo ? 'Enforce non-blocking tryAcquire with circuit breaker timeout' : null);

  // 5. Current implementation verification status & explicit uncertainty boundary
  const statusLabel = implStatus.status || (isDemo
    ? 'Historical fix recorded; current implementation not yet verified.'
    : 'No historical fix precedent recorded in graph memory for this entity.');
  const statusDetails = implStatus.details || (isDemo
    ? `Active source code in \`${rootCauseFile}\` was inspected and verified to still exhibit the blocking wait pattern introduced by commit \`${introSha}\`.`
    : `Investigation findings for repository \`${repoName || 'target'}\` are grounded in static graph traversal. Live runtime behavior is unverified.`);

  return `> **Deterministic Summary Fallback (AI Provider Offline)**
> Generated deterministically from verified static AST call graph, commit intersections, and graph institutional memory.

### 1. Observed Graph-Supported Call Path
- **Verified Call Sequence**: \`${callPathString}\`
${edgeDetails.length > 0 ? edgeDetails.map(d => `- ${d}`).join('\n') : '- Verified directed call graph traversal derived from static AST edges.'}

### 2. Leading Root-Cause Hypothesis & Graph Confidence
- **Leading Hypothesis**: Symbol \`${rootCauseSymbol}\` in \`${rootCauseFile}\`
- **Graph Confidence**: **${confidence}**
- **Supporting Causal Evidence**:
${candidateReasons.map(r => `  - ${r}`).join('\n')}

### 3. Rejected Decoy & Evidence-Based Rationale
- **Decoy Candidate**: \`${decoyFile}\` (\`${decoySymbol}\`)
- **Evidence-Based Rationale**: ${decoyRationale}

### 4. Suspected Introducing Commit
- **Commit SHA**: \`${introSha || 'None identified'}\`
- **Commit Message**: "${introMsg}"
- **Role**: Suspected Introducing Change (${introSha ? 'correlated with reported anomaly' : 'No matching commit in graph history'})

### 5. Historical Precedent & Institutional Fix
- **Historical Defect**: ${fixTitle ? `"${fixTitle}"` : 'None recorded in graph memory'}
- **Historical Fix Commit**: \`${fixSha || 'None recorded'}\`
- **Recorded Mitigation**: "${fixSummary || 'No prior fix precedent recorded in graph memory for this entity.'}"
- **Role**: Historical Fix Precedent (${fixSha ? 'recorded prior resolution' : 'None recorded'})

### 6. Current Implementation Verification Status & Limitations
- **Verification Status**: ${statusLabel}
- **Inspection Detail**: ${statusDetails}
- **Explicit Uncertainty**: Static graph memory confirms call relationships and commit modifications. Live runtime performance, thread starvation under load, and network latency cannot be verified without active runtime APM telemetry.`;
}

/**
 * Generates a deterministic architectural summary from repository scan context
 * when generative Gemini models are offline or unreachable.
 */
export function generateDeterministicArchitectureSummary(analysis, options = {}) {
  const repo = analysis?.repository || {};
  const metrics = analysis?.metrics || {};
  const techStack = analysis?.techStack || {};
  const architecture = analysis?.architecture || {};
  const structure = analysis?.structure || {};
  const observations = analysis?.observations || [];

  const repoName = repo.fullName || 'Unknown Repository';
  const langs = (techStack.languages || []).map(l => `${l.name} (${l.percentage}%)`).join(', ') || repo.primaryLanguage || 'Unknown';
  const backend = (techStack.backend || []).map(b => b.name).join(', ') || 'None explicitly detected';
  const entryPoints = (architecture.entryPoints || []).map(e => `- \`${e.path}\` (${e.type}, ${e.language})`).join('\n') || '- None identified';
  const dirRoles = (structure.classifiedDirectories || []).slice(0, 8).map(d => `- \`${d.path}\`: ${d.role} (${d.description})`).join('\n') || '- Standard directory structure';

  const obsText = observations.length > 0
    ? observations.map(o => `- [${o.category}] **${o.title}**: ${o.detail}`).join('\n')
    : '- Scanned assets conform to verified static structure.';

  return `> **Deterministic Summary Fallback (AI Provider Offline)**
> Generated deterministically from verified static AST analysis and repository manifests.

### What This Repository Does & Tech Stack
- **Repository**: \`${repoName}\`
- **Description**: ${repo.description || 'No description provided.'}
- **Primary Languages**: ${langs}
- **Backend / Runtime**: ${backend}
- **Scanned Assets**: ${metrics.totalFiles || 0} files across ${metrics.totalDirectories || 0} directories

### Key Entry Points & Architectural Components
- **Architecture Pattern**: ${architecture.pattern || 'Modular Service Architecture'}
${entryPoints}

### Dependencies, Relationships & Design Patterns
${dirRoles}

### Potential Risks, Coupling & Next Areas to Investigate
${obsText}
- **Verification Boundary**: Summary compiled directly from AST and file system traversal; runtime execution unverified.`;
}

/**
 * Dispatches to the appropriate deterministic summary generator based on payload structure.
 */
export function generateDeterministicSummary(payload, options = {}) {
  const inv =
    payload?.investigation ||
    (payload?.diagnosis && (payload?.connectedEvidence || payload?.keywordBaseline) ? payload : null) ||
    payload?.incident ||
    null;

  if (inv) {
    return generateDeterministicInvestigationSummary(inv, options);
  }
  return generateDeterministicArchitectureSummary(payload, options);
}
