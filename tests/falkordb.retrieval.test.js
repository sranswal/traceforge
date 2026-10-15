/**
 * FailureChain Phase 3 Unit Tests: FalkorDB Retrieval & Recording
 * - Tests query templates, parameters, bounds, result normalization, and repository isolation.
 * - Tests markdown formatting and interactive graph building.
 * - Tests error handling and credential sanitization.
 * - Runs completely offline using mock clients.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordFalkorDBMemoryEntry,
  retrieveFalkorDBGraphContextForQuestion,
  getFalkorDBRepositoryMemoryOverview,
  formatFalkorDBGraphEvidenceMarkdown,
  FALKORDB_CYPHER_TEMPLATES
} from '../server/memory/falkordbRetrieval.js';
import { setClientForTesting } from '../server/db/falkordb.js';
import { resetFalkorDBSchemaCacheForTesting } from '../server/memory/falkordbSchema.js';

describe('FailureChain Phase 3: FalkorDB Retrieval & Recording (Mocked)', () => {
  beforeEach(() => {
    resetFalkorDBSchemaCacheForTesting();
    setClientForTesting(null);
  });

  afterEach(() => {
    resetFalkorDBSchemaCacheForTesting();
    setClientForTesting(null);
  });

  it('validates malformed inputs for recording and retrieval', async () => {
    await assert.rejects(
      () => recordFalkorDBMemoryEntry({ repoFullName: 'invalid-repo' }),
      /valid repository fullName/
    );

    await assert.rejects(
      () => recordFalkorDBMemoryEntry({ repoFullName: 'owner/repo', type: 'decision' }),
      /Both decision title and rationale are required/
    );

    await assert.rejects(
      () => recordFalkorDBMemoryEntry({ repoFullName: 'owner/repo', type: 'bug_fix' }),
      /Both bugTitle and bugDescription are required/
    );

    const invalidContext = await retrieveFalkorDBGraphContextForQuestion('');
    assert.equal(invalidContext.available, false);
    assert.equal(invalidContext.status, 'invalid_input');

    await assert.rejects(
      () => getFalkorDBRepositoryMemoryOverview('invalid-repo'),
      /valid repository fullName/
    );
  });

  it('records a Bug and Fix with parameterized openCypher subquery template', async () => {
    const executed = [];
    const mockGraph = {
      async query(cypher, options = {}) {
        executed.push({ cypher, options });
        return { metadata: [], data: [{ bugId: 'acme/widget::bug::auth-crash' }] };
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
    const res = await recordFalkorDBMemoryEntry(
      {
        repoFullName: 'acme/widget',
        bugTitle: 'Auth Crash',
        bugDescription: 'Tokens with special characters cause crash',
        severity: 'high',
        symptoms: 'HTTP 500 on /login',
        filePath: 'services/auth.js',
        componentPath: 'services',
        fixSummary: 'Escape special characters in token parser',
        fixDescription: 'Added regex sanitization before token decoding',
        commitSha: 'a1b2c3d4e5f6',
        decisionTitle: 'Use Standard JWT Validator',
        decisionRationale: 'Avoid home-grown token parsers'
      },
      { env }
    );

    assert.equal(res.recorded, true);
    assert.equal(res.repoFullName, 'acme/widget');
    assert.ok(res.bugId.includes('auth-crash'));
    assert.ok(res.fixId);
    assert.ok(res.decisionId);

    // Verify parameters were passed
    const upsertQuery = executed.find(e => e.cypher.includes('MERGE (b:Bug'));
    assert.ok(upsertQuery, 'Must execute Bug upsert query');
    assert.ok(upsertQuery.options.params, 'Query options must contain params');
    assert.equal(upsertQuery.options.params.repoFullName, 'acme/widget');
    assert.equal(upsertQuery.options.params.bug.title, 'Auth Crash');
    assert.equal(upsertQuery.options.params.fix.commitSha, 'a1b2c3d4e5f6');
  });

  it('retrieves bounded graph context with repository isolation and keyword scoring', async () => {
    const executedQueries = [];
    const mockGraph = {
      async query(cypher, options = {}) {
        executedQueries.push({ cypher, options });

        if (cypher.includes('MATCH (b:Bug')) {
          return {
            data: [
              {
                bugId: 'acme/widget::bug::auth-crash',
                title: 'Auth Crash',
                description: 'Tokens with special characters cause crash',
                severity: 'high',
                status: 'resolved',
                symptoms: 'HTTP 500',
                filePath: 'services/auth.js',
                componentPath: 'services',
                fixId: 'acme/widget::fix::escape',
                fixSummary: 'Escape special characters',
                fixDescription: 'Regex sanitization',
                commitSha: 'a1b2c3d',
                commitMessage: 'Fix token sanitization',
                relevanceScore: 2
              }
            ]
          };
        }
        if (cypher.includes('MATCH (r:Repository') && cypher.includes('Component)')) {
          return {
            data: [
              {
                componentPath: 'services',
                componentRole: 'Module',
                decisions: [
                  { id: 'd1', title: 'Use Standard JWT', rationale: 'Security', status: 'accepted' }
                ],
                dependencies: [
                  { targetComponent: 'db', evidenceFile: 'services/auth.js', importedFile: 'db/index.js' }
                ]
              }
            ]
          };
        }
        if (cypher.includes('MATCH (s:Symbol')) {
          return {
            data: [
              {
                id: 's1',
                name: 'verifyToken',
                kind: 'Function',
                filePath: 'services/auth.js',
                startLine: 1,
                endLine: 15,
                parserPrecision: 'lexical-brace-js-ts',
                callsSymbols: ['checkExpiry'],
                calledBySymbols: ['handleLogin'],
                coveredByTests: ['token test'],
                changedInCommits: ['a1b2c3d'],
                score: 1
              }
            ]
          };
        }
        if (cypher.includes('MATCH (cm:Commit')) {
          return {
            data: [
              {
                sha: 'a1b2c3d4e5f6',
                shortSha: 'a1b2c3d',
                message: 'Fix token sanitization',
                author: 'alice',
                date: '2026-10-10T12:00:00Z',
                changedFiles: ['services/auth.js']
              }
            ]
          };
        }
        return { data: [] };
      }
    };

    setClientForTesting({
      selectGraph() {
        return mockGraph;
      },
      async close() {}
    });

    const env = { FALKORDB_HOST: 'localhost' };
    const context = await retrieveFalkorDBGraphContextForQuestion(
      'acme/widget',
      'how does auth token verification work?',
      { env }
    );

    assert.equal(context.available, true);
    assert.equal(context.repoFullName, 'acme/widget');
    assert.equal(context.hasEvidence, true);
    assert.equal(context.bugsAndFixes.length, 1);
    assert.equal(context.bugsAndFixes[0].title, 'Auth Crash');
    assert.equal(context.decisions.length, 1);
    assert.equal(context.componentDependencies.length, 1);
    assert.equal(context.symbols.length, 1);
    assert.equal(context.symbols[0].name, 'verifyToken');
    assert.equal(context.recentCommits.length, 1);

    // Verify all 4 queries enforced repository isolation
    for (const q of executedQueries) {
      assert.ok(
        q.options.params.repoFullName === 'acme/widget' || q.options.params.repoId === 'acme/widget',
        'Every query must isolate to the requested repository'
      );
    }
  });

  it('formats retrieved FalkorDB graph context into structured Markdown', () => {
    const mockContext = {
      available: true,
      hasEvidence: true,
      bugsAndFixes: [
        {
          title: 'Memory Leak',
          severity: 'high',
          status: 'resolved',
          description: 'Unclosed stream in parser',
          symptoms: 'OOM after 100 requests',
          componentPath: 'services',
          filePath: 'services/parser.js',
          fixSummary: 'Add stream.close() in finally block'
        }
      ],
      decisions: [
        {
          title: 'Use Streaming Parser',
          componentPath: 'services',
          status: 'accepted',
          rationale: 'Avoid loading full payload into RAM'
        }
      ],
      componentDependencies: [
        {
          sourceComponent: 'services',
          targetComponent: 'parser',
          evidenceFile: 'services/index.js',
          importedFile: 'parser/stream.js'
        }
      ],
      symbols: [
        {
          name: 'parseStream',
          kind: 'Function',
          filePath: 'parser/stream.js',
          startLine: 10,
          endLine: 35,
          callsSymbols: ['createReader'],
          calledBySymbols: ['handleUpload'],
          coveredByTests: ['stream parser test']
        }
      ],
      recentCommits: [
        {
          shortSha: 'c0ffee1',
          author: 'bob',
          date: '2026-10-12',
          message: 'Fix unclosed stream',
          changedFiles: ['parser/stream.js']
        }
      ]
    };

    const md = formatFalkorDBGraphEvidenceMarkdown(mockContext);
    assert.ok(md.includes('FalkorDB Project Memory Graph Evidence'));
    assert.ok(md.includes('Memory Leak'));
    assert.ok(md.includes('Add stream.close()'));
    assert.ok(md.includes('Use Streaming Parser'));
    assert.ok(md.includes('parseStream'));
    assert.ok(md.includes('c0ffee1'));

    const emptyMd = formatFalkorDBGraphEvidenceMarkdown({ available: false });
    assert.ok(emptyMd.includes('No prior bugs, fixes, decisions, or symbol graph records were found'));
  });

  it('builds complete repository memory overview with interactive graph and counts', async () => {
    const mockGraph = {
      async query(cypher) {
        if (cypher.includes('filesCount')) {
          return {
            data: [
              {
                filesCount: 10,
                componentsCount: 4,
                symbolsCount: 25,
                decisionsCount: 2,
                bugsCount: 1,
                fixesCount: 1,
                commitsCount: 3,
                relationshipsCount: 42
              }
            ]
          };
        }
        return { data: [] };
      }
    };

    setClientForTesting({
      selectGraph() {
        return mockGraph;
      },
      async close() {}
    });

    const env = { FALKORDB_HOST: 'localhost' };
    const overview = await getFalkorDBRepositoryMemoryOverview('acme/widget', { env });

    assert.equal(overview.available, true);
    assert.equal(overview.status, 'connected');
    assert.equal(overview.counts.files, 10);
    assert.equal(overview.counts.components, 4);
    assert.equal(overview.counts.relationships, 42);
    assert.ok(Array.isArray(overview.graph.nodes));
    assert.ok(Array.isArray(overview.graph.edges));
  });

  it('catches query errors, redacts sensitive passwords, and does not crash', async () => {
    const mockGraph = {
      async query() {
        throw new Error('Connection refused to redis://admin:ultraSecretPass@localhost:6379');
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

    const res = await retrieveFalkorDBGraphContextForQuestion('acme/widget', 'test query', { env });
    assert.equal(res.available, false);
    assert.equal(res.status, 'error');
    assert.equal(res.error.includes('ultraSecretPass'), false);
    assert.ok(res.error.includes('[REDACTED]'));
  });
});

