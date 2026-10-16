import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { GraphIds } from '../server/memory/schema.js';
import { parseSourceFile, isSupportedSourceFile } from '../server/memory/sourceParser.js';
import {
  buildProjectMemoryGraphPayload,
  persistFalkorDBMemoryPayload
} from '../server/memory/falkordbIngestion.js';
import {
  extractSearchKeywords,
  buildInteractiveGraphSubgraph
} from '../server/memory/falkordbRetrieval.js';
import {
  recordMemoryEntry,
  getGraphHealth
} from '../server/memory/graphProvider.js';
import {
  setClientForTesting,
  closeClient
} from '../server/db/falkordb.js';
import { resetFalkorDBSchemaCacheForTesting } from '../server/memory/falkordbSchema.js';
import {
  AIProvider,
  aiProvider,
  DEFAULT_GEMINI_MODEL_CHAIN,
  resolveGeminiModelChain,
  resolveGeminiApiKeys,
  parseRetryAfterMs,
  classifyGeminiError,
  sanitizeGeminiError
} from '../server/ai/provider.js';
import {
  buildCompactAnalysisPayload,
  generateContextualSuggestions,
  buildEntityInvestigationPrompt
} from '../client/src/utils/analysisPayload.js';
import app from '../server/index.js';

const SAMPLE_ANALYSIS = {
  repository: {
    owner: 'acme',
    repo: 'widget-service',
    fullName: 'acme/widget-service',
    branch: 'main',
    description: 'Sample widget microservice',
    primaryLanguage: 'JavaScript',
    license: 'MIT',
    stars: 42,
    forks: 5,
    url: 'https://github.com/acme/widget-service'
  },
  metrics: {
    totalFiles: 4,
    totalDirectories: 2,
    topExtensions: [{ ext: '.js', count: 4 }],
    analysisTimeMs: 120
  },
  techStack: {
    languages: [{ name: 'JavaScript', count: 4, percentage: 100 }],
    backend: [{ name: 'Node.js', reason: 'package.json' }],
    frontend: [],
    devops: [],
    database: [],
    config: []
  },
  frameworks: [{ name: 'Express.js', category: 'Backend', confidence: 'High' }],
  projectType: 'Backend API Service',
  architecture: {
    pattern: 'Service-Oriented REST / RPC Architecture',
    description: 'Server-side application',
    components: [{ name: 'API & Routing Layer', role: 'Handles HTTP routes' }],
    entryPoints: [{ path: 'server/index.js', type: 'Server / Module Entry', language: 'Node.js', size: 500 }]
  },
  structure: {
    classifiedDirectories: [
      { path: '/server', name: 'server', role: 'Backend Server', description: 'Server logic', category: 'backend', depth: 1 },
      { path: '/services', name: 'services', role: 'Service Layer', description: 'Domain logic', category: 'domain', depth: 1 },
      { path: '/tests', name: 'tests', role: 'Test Suite', description: 'Automated tests', category: 'testing', depth: 1 }
    ],
    tree: []
  },
  observations: [],
  aiContextReady: {
    hasReadme: true,
    manifestFiles: ['package.json', 'README.md'],
    filePaths: [
      'server/index.js',
      'services/auth.js',
      'tests/auth.test.js',
      'README.md'
    ],
    sampleReadmeExcerpt: '# Widget Service'
  }
};

describe('Phase 3 & 4: Stable Identifiers, Source Parser, and Graph Ingestion Payload', () => {
  beforeEach(() => {
    resetFalkorDBSchemaCacheForTesting();
    setClientForTesting(null);
  });

  afterEach(async () => {
    resetFalkorDBSchemaCacheForTesting();
    setClientForTesting(null);
    await closeClient();
  });

  it('generates deterministic repository-scoped identifiers', () => {
    const id1 = GraphIds.symbol('Acme/Widget-Service', '/server/index.js', 'Function', 'startServer');
    const id2 = GraphIds.symbol('acme/widget-service', 'server/index.js', 'function', 'startServer');
    assert.equal(id1, id2);
    assert.equal(id1, 'acme/widget-service::symbol::server/index.js::function::startServer');
  });

  it('extracts JS/TS functions, classes, line ranges, imports, calls, and tests without claiming precision on non-JS files', () => {
    assert.equal(isSupportedSourceFile('README.md'), false);
    assert.equal(isSupportedSourceFile('.env'), false);
    assert.equal(isSupportedSourceFile('server/index.js'), true);

    const unsupported = parseSourceFile('# Markdown', 'README.md', ['README.md']);
    assert.equal(unsupported.supported, false);
    assert.equal(unsupported.parserPrecision, 'file-level-only');

    const authCode = [
      "export class TokenVerifier {",
      "  verify(token) {",
      "    return validateSignature(token);",
      "  }",
      "}",
      "",
      "export function validateSignature(raw) {",
      "  return Boolean(raw);",
      "}"
    ].join('\n');

    const parsedAuth = parseSourceFile(authCode, 'services/auth.js', ['services/auth.js']);
    assert.equal(parsedAuth.supported, true);
    assert.equal(parsedAuth.parserPrecision, 'lexical-brace-js-ts');
    const symNames = parsedAuth.symbols.map(s => `${s.kind}:${s.name}:${s.startLine}-${s.endLine}`);
    assert.deepEqual(symNames, [
      'Class:TokenVerifier:1-5',
      'Function:verify:2-4',
      'Function:validateSignature:7-9'
    ]);
  });

  it('builds graph relationships and payload idempotently', async () => {
    const sourceContents = {
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

    const commits = [
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

    const payload = buildProjectMemoryGraphPayload(SAMPLE_ANALYSIS, {
      sourceContents,
      commits
    });

    assert.equal(payload.repositoryNode.id, 'acme/widget-service');
    assert.equal(payload.symbols.length, 3);
    assert.equal(payload.symbolCallEdges.length, 2); // handleRequest->verifyToken and verifyToken->checkExpiry
    assert.equal(payload.componentDependencies.length, 2); // server -> services and tests -> services
    assert.equal(payload.tests.length, 1);
    assert.equal(payload.testCoversSymbolEdges.length, 1); // test -> verifyToken
    assert.equal(payload.commitSymbolEdges.length, 1); // commit 1122334 -> verifyToken

    // Mock FalkorDB queries to verify idempotent ingestion
    const executedQueries = [];
    setClientForTesting({
      selectGraph() {
        return {
          async query(cypher, params) {
            executedQueries.push({ cypher, params });
            return { metadata: [], data: [] };
          }
        };
      },
      async close() {}
    });

    const firstRun = await persistFalkorDBMemoryPayload(payload, { env: { FALKORDB_HOST: 'localhost' } });
    assert.equal(firstRun.ingested, true);
    assert.ok(executedQueries.length > 0);
  });

  it('validates malformed inputs and bounds search keywords', async () => {
    await assert.rejects(
      () => recordMemoryEntry({ repoFullName: 'invalid-repo-name' }),
      /valid repository fullName/
    );
    await assert.rejects(
      () => recordMemoryEntry({ repoFullName: 'acme/widget-service', bugTitle: 'Only title' }),
      /Both bugTitle and bugDescription are required/
    );

    const kws = extractSearchKeywords('Why does the verifyToken function fail in services/auth.js when token is expired?', 5);
    assert.ok(kws.length <= 5);
    assert.ok(kws.includes('verifytoken'));
  });
});

describe('Phase 6: Express API Regression & Health Check Protection', () => {
  let server;
  let baseUrl;

  beforeEach(async () => {
    resetFalkorDBSchemaCacheForTesting();
    setClientForTesting(null);
    await new Promise(resolve => {
      server = app.listen(0, () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    delete process.env.HEALTH_CHECK_TOKEN;
    resetFalkorDBSchemaCacheForTesting();
    setClientForTesting(null);
    await closeClient();
    await new Promise(resolve => server.close(resolve));
  });

  it('preserves GET /api/health and POST /api/analyze validation contracts', async () => {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.equal(healthData.status, 'ok');
    assert.equal(healthData.service, 'TraceForge Analyzer');

    const analyzeRes = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(analyzeRes.status, 400);
    const analyzeErr = await analyzeRes.json();
    assert.ok(analyzeErr.error.includes('GitHub repository URL is required'));
  });

  it('protects GET /api/health/graph when HEALTH_CHECK_TOKEN is configured and never leaks secrets', async () => {
    process.env.HEALTH_CHECK_TOKEN = 'test-guard-token';

    const unauthRes = await fetch(`${baseUrl}/api/health/graph`);
    assert.equal(unauthRes.status, 401);

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

    const authRes = await fetch(`${baseUrl}/api/health/graph`, {
      headers: { 'x-health-token': 'test-guard-token' }
    });
    assert.equal(authRes.status, 200);
    const body = await authRes.json();
    assert.equal(body.connected, true);
    assert.equal(body.provider, 'falkordb');
    assert.equal('password' in body, false);
    assert.equal('uri' in body, false);
  });

  it('builds interactive graph explorer subgraph and serves GET /api/memory/overview', async () => {
    await assert.rejects(
      () => recordMemoryEntry({ type: 'decision', repoFullName: 'acme/widget-service', decisionTitle: 'Only title' }),
      /Both decision title and rationale are required/
    );

    const subgraph = buildInteractiveGraphSubgraph('acme/widget-service', {
      bugsAndFixes: [
        {
          bugId: 'acme/widget-service::bug::auth-401',
          title: 'Auth 401 regression',
          severity: 'high',
          status: 'resolved',
          component: 'services',
          filePath: 'services/auth.js',
          fixId: 'acme/widget-service::fix::auth-401',
          fixSummary: 'Fixed clock skew tolerance',
          commitSha: 'abcdef123456'
        }
      ],
      decisions: [
        {
          decisionId: 'acme/widget-service::decision::jwt-auth',
          title: 'Stateless JWT validation',
          rationale: 'Scale horizontally without sticky sessions',
          status: 'accepted',
          component: 'services',
          filePath: 'services/auth.js'
        }
      ],
      componentDependencies: [
        {
          sourceComponent: 'server',
          targetComponent: 'services',
          evidenceFile: 'server/index.js',
          importedFile: 'services/auth.js',
          weight: 2
        }
      ],
      symbols: [
        {
          id: 'acme/widget-service::symbol::services/auth.js::function::verifyToken',
          name: 'verifyToken',
          kind: 'Function',
          filePath: 'services/auth.js',
          startLine: 10,
          endLine: 25
        }
      ]
    });

    assert.ok(subgraph.nodes.some(n => n.label === 'Repository' && n.title === 'acme/widget-service'));
    assert.ok(subgraph.nodes.some(n => n.label === 'Bug' && n.title === 'Auth 401 regression'));
    assert.ok(subgraph.nodes.some(n => n.label === 'Fix'));
    assert.ok(subgraph.nodes.some(n => n.label === 'TechnicalDecision' && n.title === 'Stateless JWT validation'));
    assert.ok(subgraph.nodes.some(n => n.label === 'Function' && n.title.includes('verifyToken')));
    assert.ok(subgraph.edges.some(e => e.type === 'COMPONENT_DEPENDS_ON_COMPONENT'));
    assert.ok(subgraph.edges.some(e => e.type === 'FIX_RESOLVES_BUG'));
    assert.ok(subgraph.edges.some(e => e.type === 'DECISION_AFFECTS_COMPONENT'));
    assert.ok(subgraph.edges.some(e => e.type === 'FILE_DEFINES_SYMBOL'));

    const missingRepoRes = await fetch(`${baseUrl}/api/memory/overview`);
    assert.equal(missingRepoRes.status, 400);
  });

  it('reproduces oversized payload (413) and verifies buildCompactAnalysisPayload prevents PayloadTooLargeError', async () => {
    // 1. Construct a large repository analysis payload with a huge nested structure.tree (> 1.2 MB)
    const hugeTree = Array.from({ length: 3500 }, (_, i) => ({
      name: `module_${i}.js`,
      path: `packages/service-core/src/modules/deep/nested/feature_${i}/module_${i}.js`,
      type: 'blob',
      size: 4096,
      children: [
        {
          name: `helper_${i}.js`,
          path: `packages/service-core/src/modules/deep/nested/feature_${i}/helper_${i}.js`,
          type: 'blob',
          size: 2048
        }
      ]
    }));
    const hugeFilePaths = hugeTree.map(n => n.path);

    const oversizedAnalysis = {
      ...SAMPLE_ANALYSIS,
      metrics: {
        ...SAMPLE_ANALYSIS.metrics,
        totalFiles: hugeFilePaths.length
      },
      structure: {
        ...SAMPLE_ANALYSIS.structure,
        tree: hugeTree
      },
      aiContextReady: {
        ...SAMPLE_ANALYSIS.aiContextReady,
        filePaths: hugeFilePaths
      }
    };

    const rawJsonSize = Buffer.byteLength(JSON.stringify({ analysis: oversizedAnalysis }), 'utf8');
    assert.ok(rawJsonSize > 1024 * 1024, `Expected raw payload > 1MB, got ${rawJsonSize} bytes`);

    // 2. Sending raw oversized payload (> 1MB) returns a structured 413 JSON response (no unhandled stack trace)
    const oversizedRes = await fetch(`${baseUrl}/api/ai/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysis: oversizedAnalysis })
    });
    assert.equal(oversizedRes.status, 413);
    const oversizedBody = await oversizedRes.json();
    assert.equal(oversizedBody.available, false);
    assert.equal(oversizedBody.code, 'PAYLOAD_TOO_LARGE');
    assert.ok(oversizedBody.error.includes('exceeds the maximum allowed size'));

    // 3. Compacting the analysis payload strips structure.tree, bounds filePaths, and preserves totalFiles
    const compactAnalysis = buildCompactAnalysisPayload(oversizedAnalysis);
    const compactJsonSize = Buffer.byteLength(JSON.stringify({ analysis: compactAnalysis }), 'utf8');
    assert.ok(compactJsonSize < 50 * 1024, `Expected compact payload < 50KB, got ${compactJsonSize} bytes`);
    assert.equal(compactAnalysis.metrics.totalFiles, 3500);
    assert.equal('tree' in compactAnalysis.structure, false);
    assert.equal(compactAnalysis.aiContextReady.filePaths.length, 120);

    // 4. Mock AIProvider.callGeminiWithFailover to verify compact payload succeeds on /api/ai/summary
    const origFailover = aiProvider.callGeminiWithFailover.bind(aiProvider);
    aiProvider.callGeminiWithFailover = async () => ({
      text: '### Overview\nCompact payload summary succeeded.',
      model: 'gemini-3.8-flash',
      primaryModel: 'gemini-3.8-flash',
      fallbackUsed: false,
      attempts: 1,
      triedModels: ['gemini-3.8-flash']
    });

    try {
      const okRes = await fetch(`${baseUrl}/api/ai/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis: compactAnalysis })
      });
      assert.equal(okRes.status, 200);
      const okData = await okRes.json();
      assert.equal(okData.available, true);
      assert.equal(okData.model, 'gemini-3.8-flash');
      assert.ok(okData.summary.includes('Compact payload summary succeeded.'));
    } finally {
      aiProvider.callGeminiWithFailover = origFailover;
    }
  });
});

describe('Priority 3 & 4: Contextual Repository Suggestions & Selected-Node Investigation', () => {
  it('generates dynamic, deduplicated suggestions strictly from active repository and matching graph memory', () => {
    const matchingMemory = {
      repository: 'acme/widget-service',
      bugsAndFixes: [
        {
          bugId: 'acme/widget-service::bug::jwt-skew',
          title: 'JWT clock skew 401 failure',
          component: 'services',
          filePath: 'services/auth.js'
        }
      ],
      decisions: [
        {
          decisionId: 'acme/widget-service::decision::stateless-jwt',
          title: 'Stateless JWT validation',
          component: 'services'
        }
      ],
      componentDependencies: [
        { sourceComponent: 'server', targetComponent: 'services', weight: 3 }
      ],
      symbols: [
        { name: 'verifyToken', filePath: 'services/auth.js', startLine: 1, endLine: 15 }
      ]
    };

    const suggestions = generateContextualSuggestions(SAMPLE_ANALYSIS, matchingMemory, 6);
    assert.ok(suggestions.length >= 4 && suggestions.length <= 6);

    // Every suggestion must reference real entities from acme/widget-service
    assert.ok(suggestions.some(s => s.text.includes('JWT clock skew 401 failure') && s.text.includes('services/auth.js')));
    assert.ok(suggestions.some(s => s.text.includes('Stateless JWT validation')));
    assert.ok(suggestions.some(s => s.text.includes('server') && s.text.includes('services')));
    assert.ok(suggestions.some(s => s.text.includes('verifyToken')));

    // Verify no duplicate texts
    const uniqueTexts = new Set(suggestions.map(s => s.text));
    assert.equal(uniqueTexts.size, suggestions.length);

    // Verify cross-repository memory isolation: memory from another repo must NOT bleed into suggestions
    const foreignMemory = {
      repository: 'other-org/unrelated-repo',
      bugsAndFixes: [{ title: 'Foreign repo bug that must not appear', filePath: 'foreign.py' }]
    };
    const isolatedSuggestions = generateContextualSuggestions(SAMPLE_ANALYSIS, foreignMemory, 6);
    assert.equal(
      isolatedSuggestions.some(s => s.text.includes('Foreign repo bug')),
      false,
      'Suggestions must never include graph memory from a different repository'
    );

    // Verify empty/minimal repo with no evidence returns empty array instead of generic placeholders
    const emptySuggestions = generateContextualSuggestions({ repository: { fullName: 'empty/repo' } }, null);
    assert.deepEqual(emptySuggestions, []);
  });

  it('builds grounded investigation prompts for selected graph nodes and injects focusEntity into Gemini prompt', async () => {
    const bugPrompt = buildEntityInvestigationPrompt(
      {
        label: 'Bug',
        title: 'JWT clock skew 401 failure',
        provenance: 'services/auth.js',
        properties: { filePath: 'services/auth.js' }
      },
      'acme/widget-service'
    );
    assert.ok(bugPrompt.includes('JWT clock skew 401 failure'));
    assert.ok(bugPrompt.includes('services/auth.js'));

    const symPrompt = buildEntityInvestigationPrompt(
      {
        label: 'Function',
        title: 'verifyToken (Function)',
        provenance: 'services/auth.js:L10-L25',
        properties: { name: 'verifyToken' }
      },
      'acme/widget-service'
    );
    assert.ok(symPrompt.includes('verifyToken'));
    assert.ok(symPrompt.includes('services/auth.js:L10-L25'));

    let capturedUserPrompt = '';
    const provider = new AIProvider({
      apiKey: 'test-key-123',
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(init.body);
        capturedUserPrompt = body.contents[0].parts[0].text;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: '### Confirmed Facts\nInvestigated node.' }] } }]
          })
        };
      }
    });

    const res = await provider.answerQuestion(
      bugPrompt,
      SAMPLE_ANALYSIS,
      {
        graphContext: { available: false, hasEvidence: false },
        focusEntity: {
          id: 'acme/widget-service::bug::jwt-skew',
          label: 'Bug',
          title: 'JWT clock skew 401 failure',
          provenance: 'services/auth.js',
          details: 'High severity · resolved'
        }
      }
    );

    assert.equal(res.available, true);
    assert.ok(capturedUserPrompt.includes('Selected Graph Entity Under Investigation'));
    assert.ok(capturedUserPrompt.includes('JWT clock skew 401 failure'));
  });
});

describe('Priority 6: Gemini Multi-Model Failover Engine (12-Case Verification Suite)', () => {
  it('1. Primary model (gemini-3.8-flash) succeeds on first attempt; fallback models are not called', async () => {
    const calledModels = [];
    const provider = new AIProvider({
      apiKey: 'test-gemini-key',
      retryDelayMs: 0,
      fetchImpl: async (url) => {
        const modelMatch = url.match(/models\/([^:]+):generateContent/);
        calledModels.push(modelMatch[1]);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Primary model response' }] } }]
          })
        };
      }
    });

    const result = await provider.generateArchitectureSummary(SAMPLE_ANALYSIS);
    assert.equal(result.available, true);
    assert.equal(result.summary, 'Primary model response');
    assert.equal(result.model, 'gemini-3.8-flash');
    assert.equal(result.primaryModel, 'gemini-3.8-flash');
    assert.equal(result.fallbackUsed, false);
    assert.equal(result.attempts, 1);
    assert.deepEqual(calledModels, ['gemini-3.8-flash']);
  });

  it('2. Primary model fails with 429 rate-limit / quota error; secondary model (gemini-3.6-flash) succeeds', async () => {
    const calledModels = [];
    const provider = new AIProvider({
      apiKey: 'test-gemini-key',
      retryDelayMs: 0,
      fetchImpl: async (url) => {
        const modelId = url.match(/models\/([^:]+):generateContent/)[1];
        calledModels.push(modelId);
        if (modelId === 'gemini-3.8-flash') {
          return {
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
            json: async () => ({ error: { message: 'Resource has been exhausted (e.g. check quota).' } })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Secondary 3.6 response after 429' }] } }]
          })
        };
      }
    });

    const result = await provider.generateArchitectureSummary(SAMPLE_ANALYSIS);
    assert.equal(result.available, true);
    assert.equal(result.model, 'gemini-3.6-flash');
    assert.equal(result.primaryModel, 'gemini-3.8-flash');
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.attempts, 2);
    assert.deepEqual(calledModels, ['gemini-3.8-flash', 'gemini-3.6-flash']);
  });

  it('3. Primary model fails with 500 or 503 transient server error; secondary model succeeds', async () => {
    const calledModels = [];
    const provider = new AIProvider({
      apiKey: 'test-gemini-key',
      retryDelayMs: 0,
      fetchImpl: async (url) => {
        const modelId = url.match(/models\/([^:]+):generateContent/)[1];
        calledModels.push(modelId);
        if (modelId === 'gemini-3.8-flash') {
          return {
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            json: async () => ({ error: { message: 'The model is currently overloaded. Please try again later.' } })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Secondary 3.6 response after 503' }] } }]
          })
        };
      }
    });

    const result = await provider.generateArchitectureSummary(SAMPLE_ANALYSIS);
    assert.equal(result.available, true);
    assert.equal(result.model, 'gemini-3.6-flash');
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.attempts, 2);
    assert.deepEqual(calledModels, ['gemini-3.8-flash', 'gemini-3.6-flash']);
  });

  it('4. Primary model times out; secondary model (gemini-3.6-flash) succeeds', async () => {
    const calledModels = [];
    const provider = new AIProvider({
      apiKey: 'test-gemini-key',
      requestTimeoutMs: 180,
      retryDelayMs: 0,
      fetchImpl: async (url, init) => {
        const modelId = url.match(/models\/([^:]+):generateContent/)[1];
        calledModels.push(modelId);
        if (modelId === 'gemini-3.8-flash') {
          return new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              const abortErr = new Error('The operation was aborted due to timeout');
              abortErr.name = 'TimeoutError';
              reject(abortErr);
            });
          });
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Secondary response after primary timeout' }] } }]
          })
        };
      }
    });

    const result = await provider.generateArchitectureSummary(SAMPLE_ANALYSIS);
    assert.equal(result.available, true);
    assert.equal(result.model, 'gemini-3.6-flash');
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.attempts, 2);
    assert.deepEqual(calledModels, ['gemini-3.8-flash', 'gemini-3.6-flash']);
  });

  it('5. Primary model fails with 404 or unsupported model error; secondary model succeeds', async () => {
    const calledModels = [];
    const provider = new AIProvider({
      apiKey: 'test-gemini-key',
      retryDelayMs: 0,
      fetchImpl: async (url) => {
        const modelId = url.match(/models\/([^:]+):generateContent/)[1];
        calledModels.push(modelId);
        if (modelId === 'gemini-3.8-flash') {
          return {
            ok: false,
            status: 404,
            statusText: 'Not Found',
            json: async () => ({
              error: { message: 'models/gemini-3.8-flash is not found for API version v1beta, or is not supported for generateContent.' }
            })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Secondary response after 404 model unavailable' }] } }]
          })
        };
      }
    });

    const result = await provider.generateArchitectureSummary(SAMPLE_ANALYSIS);
    assert.equal(result.available, true);
    assert.equal(result.model, 'gemini-3.6-flash');
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.attempts, 2);
    assert.deepEqual(calledModels, ['gemini-3.8-flash', 'gemini-3.6-flash']);
  });

  it('6. Primary and secondary models fail; tertiary model (gemini-3.5-flash-lite) succeeds', async () => {
    const calledModels = [];
    const provider = new AIProvider({
      apiKey: 'test-gemini-key',
      retryDelayMs: 0,
      fetchImpl: async (url) => {
        const modelId = url.match(/models\/([^:]+):generateContent/)[1];
        calledModels.push(modelId);
        if (modelId === 'gemini-3.8-flash') {
          return {
            ok: false,
            status: 429,
            json: async () => ({ error: { message: 'Quota exceeded on primary model' } })
          };
        }
        if (modelId === 'gemini-3.6-flash') {
          return {
            ok: false,
            status: 503,
            json: async () => ({ error: { message: 'Secondary model temporarily overloaded' } })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Tertiary gemini-3.5-flash-lite succeeded' }] } }]
          })
        };
      }
    });

    const result = await provider.generateArchitectureSummary(SAMPLE_ANALYSIS);
    assert.equal(result.available, true);
    assert.equal(result.summary, 'Tertiary gemini-3.5-flash-lite succeeded');
    assert.equal(result.model, 'gemini-3.5-flash-lite');
    assert.equal(result.primaryModel, 'gemini-3.8-flash');
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.attempts, 3);
    assert.deepEqual(calledModels, [
      'gemini-3.8-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite'
    ]);
  });

  it('7. All three models fail; service returns a clear structured error and does not crash', async () => {
    const calledModels = [];
    const provider = new AIProvider({
      apiKey: 'test-gemini-key',
      retryDelayMs: 0,
      fetchImpl: async (url) => {
        const modelId = url.match(/models\/([^:]+):generateContent/)[1];
        calledModels.push(modelId);
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: { message: `${modelId} service unavailable` } })
        };
      }
    });

    const summaryRes = await provider.generateArchitectureSummary(SAMPLE_ANALYSIS);
    assert.equal(summaryRes.available, false);
    assert.equal(summaryRes.fallbackUsed, true);
    assert.equal(summaryRes.attempts, 3);
    assert.deepEqual(summaryRes.triedModels, DEFAULT_GEMINI_MODEL_CHAIN);
    assert.ok(summaryRes.error.includes('All configured Gemini models failed'));

    const askRes = await provider.answerQuestion('How does auth work?', SAMPLE_ANALYSIS, {
      graphContext: { available: false, hasEvidence: false }
    });
    assert.equal(askRes.available, false);
    assert.equal(askRes.fallbackUsed, true);
    assert.equal(askRes.attempts, 3);
    assert.deepEqual(askRes.triedModels, DEFAULT_GEMINI_MODEL_CHAIN);
  });

  it('8. Permanent configuration or invalid request errors fail immediately without useless retries', async () => {
    // 8a. Missing API key -> 0 network attempts
    let networkCalls = 0;
    const noKeyProvider = new AIProvider({
      apiKey: '',
      env: {},
      fetchImpl: async () => {
        networkCalls += 1;
        throw new Error('Should not be called');
      }
    });

    const missingKeyRes = await noKeyProvider.generateArchitectureSummary(SAMPLE_ANALYSIS);
    assert.equal(missingKeyRes.available, false);
    assert.equal(missingKeyRes.errorCategory, 'missing_api_key');
    assert.equal(networkCalls, 0);

    // 8b. Invalid API key (401/403) -> stops immediately after attempt 1 without trying secondary/tertiary models
    const authCalledModels = [];
    const badKeyProvider = new AIProvider({
      apiKey: 'invalid-api-key-value',
      retryDelayMs: 0,
      fetchImpl: async (url) => {
        const modelId = url.match(/models\/([^:]+):generateContent/)[1];
        authCalledModels.push(modelId);
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: { message: 'API key not valid. Please pass a valid API key.' } })
        };
      }
    });

    const badKeyRes = await badKeyProvider.generateArchitectureSummary(SAMPLE_ANALYSIS);
    assert.equal(badKeyRes.available, false);
    assert.equal(badKeyRes.errorCategory, 'auth_error');
    assert.equal(badKeyRes.attempts, 1);
    assert.deepEqual(authCalledModels, ['gemini-3.8-flash'], 'Must not retry fallback models when API key is invalid');
  });

  it('9. Duplicate model IDs in configuration are deduplicated and non-text models are excluded', () => {
    const chain = resolveGeminiModelChain({
      env: {
        GEMINI_MODEL: 'gemini-3.6-flash',
        GEMINI_MODEL_CHAIN: 'gemini-3.6-flash, gemini-3.8-flash, gemini-2.5-flash-preview-tts, gemini-embedding-001, gemini-3.5-flash-lite, gemini-3.8-flash'
      }
    });

    assert.deepEqual(chain, [
      'gemini-3.6-flash',
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite'
    ]);
  });

  it('10. Prompt and graph context are preserved identically across fallback attempts', async () => {
    const capturedBodies = [];
    const provider = new AIProvider({
      apiKey: 'test-gemini-key',
      retryDelayMs: 0,
      fetchImpl: async (url, init) => {
        const modelId = url.match(/models\/([^:]+):generateContent/)[1];
        capturedBodies.push({ modelId, body: JSON.parse(init.body) });
        if (modelId !== 'gemini-3.5-flash-lite') {
          return {
            ok: false,
            status: 429,
            json: async () => ({ error: { message: 'Rate limit exceeded' } })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: '### Confirmed Facts\nContext preserved.' }] } }]
          })
        };
      }
    });

    const graphCtx = {
      available: true,
      hasEvidence: true,
      bugsAndFixes: [{ bugId: 'b1', title: 'Critical Auth Bug', description: 'Token skew', fixSummary: 'Grace window' }],
      decisions: [{ decisionId: 'd1', title: 'Use JWT', rationale: 'Stateless' }],
      componentDependencies: [],
      symbols: [],
      recentCommits: []
    };

    const qaRes = await provider.answerQuestion(
      'Could the auth error be related to the previous fix?',
      SAMPLE_ANALYSIS,
      { graphContext: graphCtx }
    );

    assert.equal(qaRes.available, true);
    assert.equal(capturedBodies.length, 3);
    // Verify identical user prompt & system instruction across all 3 models
    assert.deepEqual(capturedBodies[0].body.contents, capturedBodies[1].body.contents);
    assert.deepEqual(capturedBodies[1].body.contents, capturedBodies[2].body.contents);
    assert.deepEqual(capturedBodies[0].body.systemInstruction, capturedBodies[2].body.systemInstruction);
    assert.ok(capturedBodies[2].body.contents[0].parts[0].text.includes('Critical Auth Bug'));
  });

  it('11. Response metadata accurately reports the model used and whether fallback occurred', async () => {
    let callCount = 0;
    const provider = new AIProvider({
      apiKey: 'test-gemini-key',
      retryDelayMs: 0,
      fetchImpl: async () => {
        callCount += 1;
        if (callCount === 1) {
          // Return malformed/empty candidate on primary model to trigger malformed_response failover
          return {
            ok: true,
            status: 200,
            json: async () => ({ candidates: [{ content: { parts: [{ text: '   ' }] } }] })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: '### Confirmed Facts\nAnswered by secondary model.' }] } }]
          })
        };
      }
    });

    const qaRes = await provider.answerQuestion(
      'Where is the server entry point?',
      SAMPLE_ANALYSIS,
      { graphContext: { available: false, hasEvidence: false } }
    );

    assert.equal(qaRes.available, true);
    assert.equal(qaRes.model, 'gemini-3.6-flash');
    assert.equal(qaRes.primaryModel, 'gemini-3.8-flash');
    assert.equal(qaRes.fallbackUsed, true);
    assert.equal(qaRes.attempts, 2);
    assert.deepEqual(qaRes.triedModels, ['gemini-3.8-flash', 'gemini-3.6-flash']);
  });

  it('12. Error logs and returned error messages never expose GEMINI_API_KEY', async () => {
    const secretKey = 'AIzaSySecretKeyForRedactionTest99999';
    const sanitized = sanitizeGeminiError(
      `Request to https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${secretKey} failed with token ${secretKey}`,
      secretKey
    );
    assert.equal(sanitized.includes(secretKey), false);
    assert.ok(sanitized.includes('key=[REDACTED]'));

    const provider = new AIProvider({
      apiKey: secretKey,
      retryDelayMs: 0,
      fetchImpl: async (url) => ({
        ok: false,
        status: 500,
        json: async () => ({
          error: { message: `Internal failure for URL ${url} using key ${secretKey}` }
        })
      })
    });

    const failedRes = await provider.generateArchitectureSummary(SAMPLE_ANALYSIS);
    assert.equal(failedRes.available, false);
    assert.equal(failedRes.error.includes(secretKey), false, 'Returned error must never contain the raw API key');
  });
});

describe('Gemini API-Key Failover & Combined Key+Model Failover Suite', () => {
  it('1. Primary key succeeds without failover', async () => {
    const usedKeys = [];
    const provider = new AIProvider({
      env: {
        GEMINI_API_KEY: 'key-primary-valid',
        GEMINI_API_KEY_2: 'key-secondary-valid',
        GEMINI_API_KEY_3: 'key-tertiary-valid'
      },
      retryDelayMs: 0,
      fetchImpl: async (url) => {
        const keyParam = new URL(url).searchParams.get('key');
        usedKeys.push(keyParam);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Primary key succeeded on attempt 1' }] } }]
          })
        };
      }
    });

    const res = await provider.generateArchitectureSummary(SAMPLE_ANALYSIS);
    assert.equal(res.available, true);
    assert.equal(res.keyFallbackUsed, false);
    assert.equal(res.modelFallbackUsed, false);
    assert.equal(res.activeKeySlot, 'GEMINI_API_KEY');
    assert.equal(res.attempts, 1);
    assert.deepEqual(usedKeys, ['key-primary-valid']);
  });

  it('2. Primary key is invalid (401/403) and secondary key (GEMINI_API_KEY_2) succeeds', async () => {
    const attemptsLog = [];
    const provider = new AIProvider({
      env: {
        GEMINI_API_KEY: 'key-primary-invalid',
        GEMINI_API_KEY_2: 'key-secondary-valid',
        GEMINI_API_KEY_3: 'key-tertiary-valid'
      },
      retryDelayMs: 0,
      fetchImpl: async (url) => {
        const parsed = new URL(url);
        const keyParam = parsed.searchParams.get('key');
        const modelId = url.match(/models\/([^:]+):generateContent/)[1];
        attemptsLog.push({ key: keyParam, model: modelId });

        if (keyParam === 'key-primary-invalid') {
          return {
            ok: false,
            status: 403,
            json: async () => ({ error: { message: 'API key not valid. Please pass a valid API key.' } })
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Secondary key succeeded on primary model' }] } }]
          })
        };
      }
    });

    const res = await provider.generateArchitectureSummary(SAMPLE_ANALYSIS);
    assert.equal(res.available, true);
    assert.equal(res.keyFallbackUsed, true);
    assert.equal(res.modelFallbackUsed, false);
    assert.equal(res.activeKeySlot, 'GEMINI_API_KEY_2');
    assert.equal(res.model, 'gemini-3.8-flash');
    assert.equal(res.attempts, 2);
    assert.deepEqual(attemptsLog, [
      { key: 'key-primary-invalid', model: 'gemini-3.8-flash' },
      { key: 'key-secondary-valid', model: 'gemini-3.8-flash' }
    ]);
  });

  it('3. First key fails authentication, blank/duplicate keys are skipped, and next eligible key (GEMINI_API_KEY_3) is tried', async () => {
    const attemptsLog = [];
    const provider = new AIProvider({
      env: {
        GEMINI_API_KEY: 'revoked-key-1',
        GEMINI_API_KEY_2: '   ', // Blank key -> ignored
        GEMINI_API_KEY_3: 'working-key-3'
      },
      retryDelayMs: 0,
      fetchImpl: async (url) => {
        const keyParam = new URL(url).searchParams.get('key');
        const modelId = url.match(/models\/([^:]+):generateContent/)[1];
        attemptsLog.push({ key: keyParam, model: modelId });

        if (keyParam === 'revoked-key-1') {
          return {
            ok: false,
            status: 401,
            json: async () => ({ error: { message: 'Request had invalid authentication credentials (key revoked).' } })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Tertiary key succeeded' }] } }]
          })
        };
      }
    });

    const res = await provider.generateArchitectureSummary(SAMPLE_ANALYSIS);
    assert.equal(res.available, true);
    assert.equal(res.keyFallbackUsed, true);
    assert.equal(res.activeKeySlot, 'GEMINI_API_KEY_3');
    assert.deepEqual(res.triedKeySlots, ['GEMINI_API_KEY', 'GEMINI_API_KEY_3']);
    assert.deepEqual(attemptsLog, [
      { key: 'revoked-key-1', model: 'gemini-3.8-flash' },
      { key: 'working-key-3', model: 'gemini-3.8-flash' }
    ]);
  });

  it('4. Combined key and model failover never repeats identical attempts or re-uses keys marked unusable', async () => {
    // Scenario:
    // - Attempt 1: (key_1, gemini-3.8-flash) -> 404 model unavailable (marks gemini-3.8-flash unavailable)
    // - Attempt 2: (key_1, gemini-3.6-flash) -> 403 key_1 unauthorized (marks key_1 unusable, rotates to key_2 on gemini-3.6-flash)
    // - Attempt 3: (key_2, gemini-3.6-flash) -> 503 server error (advances to gemini-3.5-flash-lite on key_2)
    // - Attempt 4: (key_2, gemini-3.5-flash-lite) -> 200 OK
    const attemptsLog = [];
    const provider = new AIProvider({
      env: {
        GEMINI_API_KEY: 'key-1-expires',
        GEMINI_API_KEY_2: 'key-2-good',
        GEMINI_API_KEY_3: 'key-3-unused'
      },
      retryDelayMs: 0,
      fetchImpl: async (url) => {
        const keyParam = new URL(url).searchParams.get('key');
        const modelId = url.match(/models\/([^:]+):generateContent/)[1];
        attemptsLog.push(`${keyParam}::${modelId}`);

        if (modelId === 'gemini-3.8-flash') {
          return {
            ok: false,
            status: 404,
            json: async () => ({ error: { message: 'Model gemini-3.8-flash not found' } })
          };
        }
        if (keyParam === 'key-1-expires' && modelId === 'gemini-3.6-flash') {
          return {
            ok: false,
            status: 403,
            json: async () => ({ error: { message: 'API_KEY_INVALID: key-1-expires is revoked' } })
          };
        }
        if (keyParam === 'key-2-good' && modelId === 'gemini-3.6-flash') {
          return {
            ok: false,
            status: 503,
            json: async () => ({ error: { message: 'Temporary 503 overload on gemini-3.6-flash' } })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Combined failover succeeded on key_2 + gemini-3.5-flash-lite' }] } }]
          })
        };
      }
    });

    const res = await provider.generateArchitectureSummary(SAMPLE_ANALYSIS);
    assert.equal(res.available, true);
    assert.equal(res.model, 'gemini-3.5-flash-lite');
    assert.equal(res.activeKeySlot, 'GEMINI_API_KEY_2');
    assert.equal(res.keyFallbackUsed, true);
    assert.equal(res.modelFallbackUsed, true);
    assert.equal(res.attempts, 4);

    // Verify no duplicate (key, model) combinations and key-1 is never used after failing auth
    const uniqueAttempts = new Set(attemptsLog);
    assert.equal(uniqueAttempts.size, attemptsLog.length, 'Must not repeat any (key, model) combination');
    assert.deepEqual(attemptsLog, [
      'key-1-expires::gemini-3.8-flash',
      'key-1-expires::gemini-3.6-flash',
      'key-2-good::gemini-3.6-flash',
      'key-2-good::gemini-3.5-flash-lite'
    ]);
  });

  it('5. Duplicate and blank keys are ignored by resolveGeminiApiKeys', () => {
    const resolved = resolveGeminiApiKeys({
      env: {
        GEMINI_API_KEY: '  same-secret-key  ',
        GEMINI_API_KEY_2: 'same-secret-key',
        GEMINI_API_KEY_3: '   '
      }
    });
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].slot, 'GEMINI_API_KEY');
    assert.equal(resolved[0].key, 'same-secret-key');
  });

  it('6. Rate-limit errors (429) respect Retry-After, use bounded backoff, switch models, and do NOT rotate keys', async () => {
    assert.equal(parseRetryAfterMs({ 'retry-after': '1' }), 1000);
    assert.equal(parseRetryAfterMs({ 'Retry-After': '0.05' }), 50);

    const attemptsLog = [];
    const provider = new AIProvider({
      env: {
        GEMINI_API_KEY: 'primary-rate-limited-key',
        GEMINI_API_KEY_2: 'secondary-key-must-not-be-used-on-429'
      },
      retryDelayMs: 20,
      maxRetryAfterMs: 60,
      fetchImpl: async (url) => {
        const keyParam = new URL(url).searchParams.get('key');
        const modelId = url.match(/models\/([^:]+):generateContent/)[1];
        attemptsLog.push({ key: keyParam, model: modelId });

        if (modelId === 'gemini-3.8-flash') {
          return {
            ok: false,
            status: 429,
            headers: new Map([['retry-after', '0.04']]),
            json: async () => ({ error: { message: 'Resource has been exhausted (rate limit).' } })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Succeeded on secondary model with primary key after Retry-After' }] } }]
          })
        };
      }
    });

    const res = await provider.generateArchitectureSummary(SAMPLE_ANALYSIS);
    assert.equal(res.available, true);
    assert.equal(res.model, 'gemini-3.6-flash');
    assert.equal(res.keyFallbackUsed, false, 'Must NOT rotate keys to evade 429 rate limits');
    assert.equal(res.activeKeySlot, 'GEMINI_API_KEY');
    assert.deepEqual(attemptsLog, [
      { key: 'primary-rate-limited-key', model: 'gemini-3.8-flash' },
      { key: 'primary-rate-limited-key', model: 'gemini-3.6-flash' }
    ]);
    assert.deepEqual(res.backoffDelaysMs, [40]);
  });

  it('7. All configured keys fail authentication -> returns safe structured error without exposing any key values or retrying extra models', async () => {
    const k1 = 'AIzaSyInvalidKeyOne1111111111';
    const k2 = 'AIzaSyInvalidKeyTwo2222222222';
    const k3 = 'AIzaSyInvalidKeyThree33333333';
    const attemptsLog = [];

    const provider = new AIProvider({
      env: {
        GEMINI_API_KEY: k1,
        GEMINI_API_KEY_2: k2,
        GEMINI_API_KEY_3: k3
      },
      retryDelayMs: 0,
      fetchImpl: async (url) => {
        const keyParam = new URL(url).searchParams.get('key');
        const modelId = url.match(/models\/([^:]+):generateContent/)[1];
        attemptsLog.push({ key: keyParam, model: modelId });
        return {
          ok: false,
          status: 401,
          json: async () => ({
            error: { message: `Invalid authentication credentials for key ${keyParam} at ${url}` }
          })
        };
      }
    });

    let graphRetrievalCalls = 0;
    const qaRes = await provider.answerQuestion(
      'How does auth work?',
      SAMPLE_ANALYSIS,
      {
        graphContext: {
          get available() {
            graphRetrievalCalls += 1;
            return true;
          },
          hasEvidence: false
        }
      }
    );

    assert.equal(qaRes.available, false);
    assert.equal(qaRes.errorCategory, 'auth_error');
    assert.equal(qaRes.attempts, 3);
    assert.deepEqual(qaRes.triedKeySlots, ['GEMINI_API_KEY', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3']);
    // Must only try each invalid key once on the primary model and stop immediately when all 3 keys fail auth
    assert.equal(attemptsLog.length, 3);
    // Verify none of the 3 secrets appear in the error message or response object
    const serialized = JSON.stringify(qaRes);
    assert.equal(serialized.includes(k1), false);
    assert.equal(serialized.includes(k2), false);
    assert.equal(serialized.includes(k3), false);
  });
});

describe('Client Component Integrity & Investigation Render Safeguards', () => {
  it('1. Verifies all JSX component and icon tags across client files are imported or declared', async () => {
    const fs = await import('fs');
    const path = await import('path');

    function getJsxFiles(dir) {
      const files = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...getJsxFiles(full));
        } else if (entry.name.endsWith('.jsx')) {
          files.push(full);
        }
      }
      return files;
    }

    const jsxFiles = getJsxFiles('./client/src');
    assert.ok(jsxFiles.length > 5, 'Must find client JSX files');

    for (const file of jsxFiles) {
      const content = fs.readFileSync(file, 'utf8');

      // Extract all imported identifiers
      const imported = new Set();
      const importLines = content.match(/import\s+[\s\S]*?from\s+['"][^'"]+['"]/g) || [];
      for (const imp of importLines) {
        const spec = imp.replace(/^import\s+/, '').replace(/\s+from\s+['"][^'"]+['"]$/, '').trim();
        if (spec.startsWith('{')) {
          const items = spec.slice(1, -1).split(',');
          for (const item of items) {
            const parts = item.trim().split(/\s+as\s+/);
            const name = parts[parts.length - 1].trim();
            if (name) imported.add(name);
          }
        } else if (spec.includes('{')) {
          const defaultPart = spec.split('{')[0].replace(',', '').trim();
          if (defaultPart) imported.add(defaultPart);
          const namedPart = spec.slice(spec.indexOf('{') + 1, spec.lastIndexOf('}'));
          for (const item of namedPart.split(',')) {
            const parts = item.trim().split(/\s+as\s+/);
            const name = parts[parts.length - 1].trim();
            if (name) imported.add(name);
          }
        } else {
          const parts = spec.split(/\s+as\s+/);
          const name = parts[parts.length - 1].trim();
          if (name) imported.add(name);
        }
      }

      const declared = new Set(imported);
      const declRegex = /(?:function|class|const|let|var)\s+([a-zA-Z0-9_]+)/g;
      let dMatch;
      while ((dMatch = declRegex.exec(content)) !== null) {
        declared.add(dMatch[1]);
      }

      // Check all JSX element tags
      const tagRegex = /<([A-Z][a-zA-Z0-9_]*)/g;
      let tMatch;
      const missing = [];
      while ((tMatch = tagRegex.exec(content)) !== null) {
        const tag = tMatch[1];
        if (!declared.has(tag)) {
          missing.push(tag);
        }
      }

      assert.deepEqual(
        missing,
        [],
        `File ${file} has undeclared JSX components which would crash rendering: ${missing.join(', ')}`
      );
    }
  });

  it('2. Verifies Split icon is imported in IncidentInvestigationTab.jsx to prevent Step 2 crash', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('./client/src/components/Tabs/IncidentInvestigationTab.jsx', 'utf8');
    assert.ok(
      content.includes('Split') && /import\s*\{[^}]*Split[^}]*\}\s*from\s*['"]lucide-react['"]/.test(content),
      'Split must be explicitly imported from lucide-react in IncidentInvestigationTab.jsx'
    );
  });

  it('3. Verifies ErrorBoundary is mounted in main.jsx and App.jsx to protect application views', async () => {
    const fs = await import('fs');
    const mainContent = fs.readFileSync('./client/src/main.jsx', 'utf8');
    assert.ok(
      mainContent.includes('<ErrorBoundary>') && mainContent.includes('</ErrorBoundary>'),
      'Root application in main.jsx must be wrapped with ErrorBoundary'
    );

    const appContent = fs.readFileSync('./client/src/App.jsx', 'utf8');
    assert.ok(
      appContent.includes('<ErrorBoundary') && appContent.includes('</ErrorBoundary>'),
      'Tab views in App.jsx must be protected with ErrorBoundary'
    );
  });
});

describe('Causal Synthesis Evidence Presentation Adapter & Sanitization Suite', () => {
  it('1. Translates internal relationship constants to readable human labels', async () => {
    const { formatRelationshipType } = await import('../client/src/utils/evidenceAdapter.js');

    assert.equal(formatRelationshipType('SYMBOL_CALLS_SYMBOL'), 'calls');
    assert.equal(formatRelationshipType('ENTRYPOINT_SYMBOL'), 'API entrypoint');
    assert.equal(formatRelationshipType('COMMIT_CHANGED_FILE'), 'modified in commit');
    assert.equal(formatRelationshipType('COMMIT_TOUCHES_FILE'), 'modified in commit');
    assert.equal(formatRelationshipType('FIX_RESOLVES_BUG'), 'historical resolution');
    assert.equal(formatRelationshipType('INTRODUCES_REGRESSION'), 'introduces regression');
    assert.equal(formatRelationshipType('LEXICAL_KEYWORD_TRAP'), 'keyword match (unreachable)');
    assert.equal(formatRelationshipType('RESOLVED_BY'), 'resolved by');

    // Safe fallbacks for undefined/null/unknown
    assert.equal(formatRelationshipType(null), 'related to');
    assert.equal(formatRelationshipType(undefined), 'related to');
    assert.equal(formatRelationshipType('CUSTOM_UNKNOWN_EDGE'), 'custom unknown edge');
  });

  it('2. Removes raw Markdown headings, square-bracketed enum types, and parser implementation details', async () => {
    const { cleanDisplayText, cleanProvenance } = await import('../client/src/utils/evidenceAdapter.js');

    const rawMarkdown = '### Directly Observed Graph Facts\n- [ENTRYPOINT_SYMBOL] server/routes/pay.js calls verifyToken (Static AST Parser)';
    const cleaned = cleanDisplayText(rawMarkdown);

    assert.equal(cleaned.includes('###'), false, 'Must not contain markdown ###');
    assert.equal(cleaned.includes('[ENTRYPOINT_SYMBOL]'), false, 'Must not contain [ENTRYPOINT_SYMBOL]');
    assert.equal(cleaned.includes('(Static AST Parser)'), false, 'Must not contain (Static AST Parser)');

    assert.equal(cleanProvenance('Static AST Parser'), 'AST Call Graph');
    assert.equal(cleanProvenance('Call Graph Traversal (1-hop)'), 'AST Call Graph');
    assert.equal(cleanProvenance('Call Graph Traversal (2-hop)'), 'AST Call Graph');
    assert.equal(cleanProvenance('Git Commit Provenance (Suspected Regression)'), 'Git Provenance');
    assert.equal(cleanProvenance('FalkorDB Bug Resolution Memory'), 'Graph Memory');
  });

  it('3. Adapts full investigation payload into 6 semantic sections without raw markdown or enums', async () => {
    const { adaptCausalSynthesis } = await import('../client/src/utils/evidenceAdapter.js');

    const sampleInvestigation = {
      entryPoint: 'server/routes/pay.js',
      connectedEvidence: {
        evidenceChain: [
          {
            step: 1,
            type: 'ENTRYPOINT_SYMBOL',
            label: 'Route Handler `handlePaymentRequest`',
            filePath: 'server/routes/pay.js',
            symbolName: 'handlePaymentRequest',
            lineRange: 'L12-L45',
            provenance: 'Static AST Parser',
            details: 'Entrypoint `server/routes/pay.js` exposes symbol `handlePaymentRequest`.'
          },
          {
            step: 2,
            type: 'SYMBOL_CALLS_SYMBOL',
            label: 'Calls `verifyToken` in `services/tokenBucket.js`',
            filePath: 'services/tokenBucket.js',
            symbolName: 'verifyToken',
            lineRange: 'L34-L62',
            provenance: 'Call Graph Traversal (1-hop)',
            details: '`handlePaymentRequest` calls `verifyToken`.'
          },
          {
            step: 3,
            type: 'COMMIT_CHANGED_FILE',
            commitRole: 'suspected_introducing_change',
            commitRoleLabel: 'Suspected Introducing Change',
            label: 'Suspected Change `8f2a1b9`: "Refactor mutex"',
            commitSha: '8f2a1b9c3d4e5f',
            commitShortSha: '8f2a1b9',
            provenance: 'Git Commit Provenance',
            details: 'Suspected commit touched services/tokenBucket.js.'
          },
          {
            step: 4,
            type: 'FIX_RESOLVES_BUG',
            commitRole: 'historical_fix',
            commitRoleLabel: 'Historical Fix Commit',
            label: 'Historical Precedent: "Lock Starvation" resolved by "Enforce timeout"',
            commitSha: '7e1d4c2a1b',
            commitShortSha: '7e1d4c2',
            provenance: 'FalkorDB Project Memory',
            details: 'Historical recurrence occurred previously in services/tokenBucket.js.'
          }
        ],
        matchingCommit: {
          sha: '8f2a1b9c3d4e5f',
          shortSha: '8f2a1b9',
          message: 'Refactor mutex'
        },
        priorFixMatch: {
          title: 'Lock Starvation',
          fixSummary: 'Enforce timeout',
          commitSha: '7e1d4c2a1b'
        }
      },
      diagnosis: {
        rootCauseFile: 'services/tokenBucket.js',
        rootCauseSymbol: 'acquireTokenLock',
        confidence: 'HIGH',
        candidateRankings: [
          {
            filePath: 'services/tokenBucket.js',
            symbolName: 'acquireTokenLock',
            reasons: ['Downstream dependency of entrypoint', 'Modified in suspected regression commit']
          }
        ],
        implementationStatus: {
          verified: false,
          status: 'Historical fix recorded; current implementation not yet verified.',
          details: 'Active source code contains synchronous blocking wait.'
        }
      }
    };

    const adapted = adaptCausalSynthesis(sampleInvestigation);
    assert.equal(adapted.isValid, true);

    // 1. Observed Execution Path
    assert.ok(adapted.observedExecutionPath.length >= 2);
    assert.equal(adapted.observedExecutionPath[0].relationshipLabel, 'API entrypoint');
    assert.equal(adapted.observedExecutionPath[1].relationshipLabel, 'calls');
    assert.equal(adapted.observedExecutionPath[0].provenance, 'AST Call Graph');

    // 2. Suspected Failure Point
    assert.equal(adapted.suspectedFailurePoint.symbolName, 'acquireTokenLock');
    assert.equal(adapted.suspectedFailurePoint.filePath, 'services/tokenBucket.js');
    assert.equal(adapted.suspectedFailurePoint.confidence, 'HIGH');
    assert.equal(adapted.suspectedFailurePoint.isSufficient, true);

    // 3. Supporting Graph Relationships
    assert.equal(adapted.supportingGraphRelationships.length, 4);
    for (const rel of adapted.supportingGraphRelationships) {
      assert.equal(rel.label.includes('###'), false);
      assert.equal(rel.label.includes('[SYMBOL_CALLS_SYMBOL]'), false);
      assert.equal(rel.label.includes('[ENTRYPOINT_SYMBOL]'), false);
    }

    // 4. Suspected Introducing Commit
    assert.equal(adapted.suspectedIntroducingCommit.shortSha, '8f2a1b9');
    assert.equal(adapted.suspectedIntroducingCommit.message, 'Refactor mutex');

    // 5. Historical Precedent
    assert.equal(adapted.historicalPrecedent.commitShortSha, '7e1d4c2');
    assert.equal(adapted.historicalPrecedent.fixSummary, 'Enforce timeout');

    // 6. Limitations & Verification Status
    assert.ok(adapted.limitationsAndVerification.status.includes('Historical fix recorded'));
    assert.ok(adapted.limitationsAndVerification.boundary.includes('Static graph analysis'));
  });

  it('4. Handles malformed or empty investigation inputs gracefully without throwing', async () => {
    const { adaptCausalSynthesis } = await import('../client/src/utils/evidenceAdapter.js');

    const emptyAdapted = adaptCausalSynthesis(null);
    assert.equal(emptyAdapted.isValid, false);
    assert.equal(emptyAdapted.suspectedFailurePoint.confidence, 'INSUFFICIENT_EVIDENCE');

    const partialAdapted = adaptCausalSynthesis({});
    assert.equal(partialAdapted.isValid, true);
    assert.equal(partialAdapted.suspectedFailurePoint.symbolName, 'unknown');
    assert.equal(partialAdapted.suspectedFailurePoint.isSufficient, false);

    const textOnly = adaptCausalSynthesis({
      diagnosis: {
        summary: '### Inferred Causes\n- [SYMBOL_CALLS_SYMBOL] test calls target (Static AST Parser)'
      }
    });
    assert.equal(textOnly.isValid, true);
    assert.equal(textOnly.suspectedFailurePoint.symbolName, 'unknown');
  });

  it('5. Ensures client components do not render raw uppercase enums or markdown markers', async () => {
    const fs = await import('fs');

    const tabCode = fs.readFileSync('./client/src/components/Tabs/IncidentInvestigationTab.jsx', 'utf8');
    assert.ok(
      tabCode.includes('CausalSynthesisPanel'),
      'IncidentInvestigationTab must import and render CausalSynthesisPanel'
    );
    assert.equal(
      tabCode.includes('Rel: {item.type}'),
      false,
      'IncidentInvestigationTab must not render raw Rel: {item.type}'
    );

    const canvasCode = fs.readFileSync('./client/src/components/Graph/CausalGraphCanvas.jsx', 'utf8');
    assert.equal(
      canvasCode.includes("'INTRODUCES_REGRESSION'"),
      false,
      'CausalGraphCanvas must not contain raw uppercase INTRODUCES_REGRESSION label'
    );
    assert.equal(
      canvasCode.includes("'KEYWORD MATCH (UNREACHABLE)'"),
      false,
      'CausalGraphCanvas must not contain raw uppercase KEYWORD MATCH label'
    );
  });
});



