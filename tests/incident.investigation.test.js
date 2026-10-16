/**
 * FailureChain Phase 5 Unit Tests: Graph-Native Incident Investigation
 * - Verifies multi-hop connected graph evidence chain.
 * - Compares graph traversal against lexical keyword search baseline.
 * - Verifies repository isolation (no leakage across repositories).
 * - Tests explicit uncertainty and resistance to unsupported conclusions.
 * - Verifies graceful empty evidence handling.
 * - Tests safe recovery simulation (no disk or production modification).
 * - Verifies fresh-request memory recall after recording investigation outcome.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  SYNTHETIC_INCIDENT_FIXTURE,
  computeKeywordBaseline,
  traceConnectedGraphEvidence,
  evaluateCandidateRankings,
  runIncidentInvestigation,
  simulateIncidentRecovery,
  recordInvestigationOutcome
} from '../server/ai/investigation.js';
import app from '../server/index.js';
import { getRepositoryOverview, retrieveGraphContext } from '../server/memory/graphProvider.js';
import { setClientForTesting } from '../server/db/falkordb.js';
import { resetFalkorDBSchemaCacheForTesting } from '../server/memory/falkordbSchema.js';
import { aiProvider } from '../server/ai/provider.js';

describe('FailureChain Phase 5: Graph-Native Incident Investigation', () => {
  beforeEach(() => {
    resetFalkorDBSchemaCacheForTesting();
    setClientForTesting(null);
  });

  afterEach(() => {
    resetFalkorDBSchemaCacheForTesting();
    setClientForTesting(null);
  });

  const MOCK_GRAPH_CONTEXT = {
    available: true,
    hasEvidence: true,
    symbols: [
      {
        id: 'acme/payment-gateway::symbol::server/routes/pay.js::function::handlePaymentRequest',
        name: 'handlePaymentRequest',
        kind: 'Function',
        filePath: 'server/routes/pay.js',
        startLine: 3,
        endLine: 7,
        callsSymbols: ['checkRateLimit', 'verifyToken']
      },
      {
        id: 'acme/payment-gateway::symbol::services/rateLimiter.js::function::checkRateLimit',
        name: 'checkRateLimit',
        kind: 'Function',
        filePath: 'services/rateLimiter.js',
        startLine: 2,
        endLine: 5,
        callsSymbols: []
      },
      {
        id: 'acme/payment-gateway::symbol::services/auth.js::function::verifyToken',
        name: 'verifyToken',
        kind: 'Function',
        filePath: 'services/auth.js',
        startLine: 2,
        endLine: 5,
        callsSymbols: ['acquireTokenLock']
      },
      {
        id: 'acme/payment-gateway::symbol::services/tokenBucket.js::function::acquireTokenLock',
        name: 'acquireTokenLock',
        kind: 'Function',
        filePath: 'services/tokenBucket.js',
        startLine: 2,
        endLine: 6,
        callsSymbols: ['isLocked']
      }
    ],
    recentCommits: [
      {
        sha: '8f2a1b9c0d1e2f3a',
        shortSha: '8f2a1b9',
        role: 'suspected_refactor',
        message: 'Refactor rate limit cache and token bucket mutex',
        author: 'dev-charlie',
        date: '2026-10-14T14:30:00Z',
        changedFiles: ['services/rateLimiter.js', 'services/tokenBucket.js']
      },
      {
        sha: '7e1d4c2b9a0f',
        shortSha: '7e1d4c2',
        role: 'historical_fix',
        message: 'Enforce non-blocking tryAcquire with circuit breaker timeout',
        author: 'dev-alice',
        date: '2026-08-10T10:15:00Z',
        changedFiles: ['services/tokenBucket.js']
      }
    ],
    bugsAndFixes: [
      {
        bugId: 'acme/payment-gateway::bug::lock-starvation-01',
        title: 'Worker Thread Lock Starvation under High Concurrency',
        description: 'Token bucket mutex deadlocks worker threads when downstream auth latency spikes, resulting in HTTP 504 timeouts.',
        severity: 'critical',
        status: 'resolved',
        symptoms: 'HTTP 504 Gateway Timeout',
        filePath: 'services/tokenBucket.js',
        fixSummary: 'Enforce non-blocking tryAcquire with circuit breaker timeout',
        fixDescription: 'Replaced unbounded while loop with bounded 250ms timeout in acquireTokenLock.',
        commitSha: '7e1d4c2b9a0f',
        commitShortSha: '7e1d4c2',
        commitRole: 'historical_fix'
      }
    ],
    componentDependencies: [
      {
        sourceComponent: 'server/routes',
        targetComponent: 'services',
        evidenceFile: 'server/routes/pay.js',
        importedFile: 'services/auth.js'
      }
    ]
  };

  it('1. Compares keyword search baseline against connected graph traversal (proving decoy rejection)', () => {
    const report = SYNTHETIC_INCIDENT_FIXTURE.incidentReport;
    const analysis = SYNTHETIC_INCIDENT_FIXTURE;

    // A. Naive keyword search
    const baseline = computeKeywordBaseline(report, analysis);
    assert.equal(baseline.method, 'lexical_keyword_baseline');
    assert.equal(baseline.topSuspectFile, 'services/rateLimiter.js', 'Keyword search must falsely accuse decoy file due to high lexical overlap');
    assert.ok(baseline.topSuspectScore > 0);

    // B. Graph multi-hop traversal
    const graphTrace = traceConnectedGraphEvidence(report, MOCK_GRAPH_CONTEXT);
    assert.ok(graphTrace.evidenceChain.length >= 4, 'Must trace multi-hop call chain and commit evidence');
    assert.ok(graphTrace.connectedFiles.includes('services/tokenBucket.js'), 'Graph must reach true downstream root cause file');
    assert.ok(graphTrace.priorFixMatch, 'Graph must correlate historical bug in services/tokenBucket.js');

    // Proof of value: Graph rejects the decoy that fooled keyword search
    assert.notEqual(graphTrace.priorFixMatch.filePath, baseline.topSuspectFile);
  });

  it('2. Extracts complete multi-hop evidence chain with source paths, line ranges, and provenance', () => {
    const report = SYNTHETIC_INCIDENT_FIXTURE.incidentReport;
    const graphTrace = traceConnectedGraphEvidence(report, MOCK_GRAPH_CONTEXT);

    const entryStep = graphTrace.evidenceChain.find(e => e.type === 'ENTRYPOINT_SYMBOL');
    assert.ok(entryStep);
    assert.equal(entryStep.filePath, 'server/routes/pay.js');
    assert.equal(entryStep.lineRange, 'L3-L7');
    assert.equal(entryStep.provenance, 'Static AST Parser');

    const callStep = graphTrace.evidenceChain.find(e => e.type === 'SYMBOL_CALLS_SYMBOL' && e.symbolName === 'acquireTokenLock');
    assert.ok(callStep);
    assert.equal(callStep.filePath, 'services/tokenBucket.js');
    assert.equal(callStep.lineRange, 'L2-L6');

    const commitStep = graphTrace.evidenceChain.find(e => e.type === 'COMMIT_CHANGED_FILE');
    assert.ok(commitStep);
    assert.equal(commitStep.commitSha, '8f2a1b9c0d1e2f3a');

    const bugStep = graphTrace.evidenceChain.find(e => e.type === 'FIX_RESOLVES_BUG');
    assert.ok(bugStep);
    assert.equal(bugStep.filePath, 'services/tokenBucket.js');
    assert.ok(bugStep.details.includes('Worker Thread Lock Starvation'));
  });

  it('3. Enforces strict repository isolation (no leakage across repositories)', () => {
    // Other repo context with unrelated secrets
    const otherRepoContext = {
      symbols: [
        {
          name: 'leakSecret',
          filePath: 'secret/vault.js',
          callsSymbols: []
        }
      ],
      bugsAndFixes: [
        {
          title: 'Unrelated Secret Leak',
          filePath: 'secret/vault.js'
        }
      ]
    };

    const report = {
      repoFullName: 'acme/isolated-repo',
      entryPoint: 'server/main.js'
    };

    const trace = traceConnectedGraphEvidence(report, otherRepoContext);
    assert.equal(trace.connectedFiles.includes('services/tokenBucket.js'), false);
    assert.equal(trace.connectedFiles.includes('services/rateLimiter.js'), false);
    assert.equal(trace.priorFixMatch, null);
  });

  it('4. Handles unsupported conclusions and reports explicit uncertainty when evidence is missing', async () => {
    // Empty graph context
    const emptyContext = { symbols: [], recentCommits: [], bugsAndFixes: [] };

    setClientForTesting({
      selectGraph() {
        return {
          async query() {
            return { data: [] };
          }
        };
      },
      async close() {}
    });

    const report = {
      repoFullName: 'acme/payment-gateway',
      title: 'Unknown mysterious crash',
      symptoms: 'Crash with zero logs',
      entryPoint: 'server/unknown.js'
    };

    const result = await runIncidentInvestigation(report, { repository: { fullName: 'acme/payment-gateway' } }, {
      env: { GRAPH_DATABASE_PROVIDER: 'falkordb', FALKORDB_HOST: 'localhost' }
    });

    assert.equal(result.diagnosis.confidence, 'INSUFFICIENT_EVIDENCE');
    assert.ok(result.diagnosis.summary.includes('Explicit Uncertainty') || result.diagnosis.summary.includes('Inferred Causes & Explicit Uncertainty'));
    assert.ok(
      result.diagnosis.summary.includes('Insufficient Evidence Warning') ||
      result.diagnosis.summary.includes('root cause cannot be proven')
    );
  });

  it('5. Handles empty evidence and malformed inputs gracefully without throwing', async () => {
    await assert.rejects(
      () => runIncidentInvestigation({}, {}),
      /Repository fullName is required/
    );

    const baseline = computeKeywordBaseline({}, {});
    assert.ok(baseline);
    assert.equal(baseline.method, 'lexical_keyword_baseline');

    const trace = traceConnectedGraphEvidence({}, null);
    assert.equal(trace.evidenceChain.length, 0);
  });

  it('6. Simulates incident recovery safely without modifying disk, repository, or production', () => {
    const investigationResult = {
      incidentId: 'inc-sim-test-01',
      repoFullName: 'acme/payment-gateway',
      connectedEvidence: {
        callers: [
          { caller: 'verifyToken', callerFile: 'services/auth.js', callee: 'acquireTokenLock', calleeFile: 'services/tokenBucket.js' },
          { caller: 'handlePaymentRequest', callerFile: 'server/routes/pay.js', callee: 'acquireTokenLock', calleeFile: 'services/tokenBucket.js' }
        ]
      },
      diagnosis: {
        rootCauseFile: 'services/tokenBucket.js',
        rootCauseSymbol: 'acquireTokenLock'
      },
      recoveryRecommendation: {
        targetFile: 'services/tokenBucket.js',
        action: 'revert_commit'
      }
    };

    const simulation = simulateIncidentRecovery(investigationResult, 'revert_commit');

    assert.equal(simulation.simulated, true);
    assert.equal(simulation.safe, true);
    assert.equal(simulation.riskLevel, 'LOW');
    assert.equal(simulation.targetFile, 'services/tokenBucket.js');
    assert.equal(simulation.blastRadius.filesCount, 3);
    assert.ok(simulation.simulatedDiff.includes('tryAcquireWithTimeout'));
    assert.ok(simulation.verificationSummary.includes('Simulation proposal'));
    assert.ok(simulation.verificationSummary.includes('static recovery proposal'));
  });

  it('7. Records confirmed resolution to graph memory and verifies fresh-request recall structure', async () => {
    let recordedEntry = null;

    setClientForTesting({
      selectGraph() {
        return {
          async query(cypher, optionsOrParams) {
            if (cypher.includes('MERGE (b:Bug')) {
              recordedEntry = optionsOrParams?.params || optionsOrParams;
              return { data: [{ bugId: 'acme/payment-gateway::bug::payment-504' }] };
            }
            return { data: [] };
          }
        };
      },
      async close() {}
    });

    const investigationResult = {
      incidentId: 'inc-record-test-01',
      repoFullName: 'acme/payment-gateway',
      title: 'Payment Gateway 504 Timeout',
      symptoms: 'HTTP 504 Gateway Timeout under concurrency',
      suspectedCommit: '8f2a1b9c0d1e2f3a',
      diagnosis: {
        rootCauseFile: 'services/tokenBucket.js',
        rootCauseSymbol: 'acquireTokenLock'
      },
      recoveryRecommendation: {
        suggestedPatch: 'Restored non-blocking circuit breaker timeout'
      }
    };

    const outcome = await recordInvestigationOutcome(investigationResult, {
      env: { GRAPH_DATABASE_PROVIDER: 'falkordb', FALKORDB_HOST: 'localhost' }
    });

    assert.equal(outcome.recorded, true);
    assert.equal(outcome.repoFullName, 'acme/payment-gateway');
    assert.ok(recordedEntry);
    assert.equal(recordedEntry.repoFullName, 'acme/payment-gateway');
    assert.equal(recordedEntry.bug.filePath, 'services/tokenBucket.js');
    assert.ok(recordedEntry.fix.summary.includes('acquireTokenLock'));
    assert.equal(recordedEntry.commit.sha, null, 'Fix commitSha must be null on newly recorded resolution, never the suspect refactor commit');
    assert.equal(recordedEntry.bug.introducedInCommit, '8f2a1b9c0d1e2f3a', 'Bug must record suspected refactor as introducedInCommit');
  });

  it('8. Graph-edge ablation: removing decisive call edge verifyToken -> acquireTokenLock changes ranking to insufficient evidence', async () => {
    const report = SYNTHETIC_INCIDENT_FIXTURE.incidentReport;

    // Normal baseline evaluation with complete graph context
    const normalTrace = traceConnectedGraphEvidence(report, MOCK_GRAPH_CONTEXT);
    const normalRankings = evaluateCandidateRankings(report, normalTrace, MOCK_GRAPH_CONTEXT);
    assert.equal(normalRankings[0].symbolName, 'acquireTokenLock');
    assert.equal(normalRankings[0].filePath, 'services/tokenBucket.js');
    assert.equal(normalRankings[0].score, 9);

    const normalInvestigation = await runIncidentInvestigation(
      report,
      SYNTHETIC_INCIDENT_FIXTURE,
      { graphContext: MOCK_GRAPH_CONTEXT }
    );
    assert.equal(normalInvestigation.diagnosis.rootCauseSymbol, 'acquireTokenLock');
    assert.equal(normalInvestigation.diagnosis.rootCauseFile, 'services/tokenBucket.js');
    assert.equal(normalInvestigation.diagnosis.confidence, 'HIGH');

    // ABLATION 1: Sever decisive call edge verifyToken -[:SYMBOL_CALLS_SYMBOL]-> acquireTokenLock
    const ablatedContext1 = {
      ...MOCK_GRAPH_CONTEXT,
      symbols: MOCK_GRAPH_CONTEXT.symbols.map(s => {
        if (s.name === 'verifyToken') {
          return { ...s, callsSymbols: [] }; // Decisive edge removed!
        }
        return s;
      })
    };

    const ablatedTrace1 = traceConnectedGraphEvidence(report, ablatedContext1);
    // acquireTokenLock is now completely disconnected from entrypoint call graph
    assert.equal(ablatedTrace1.connectedFiles.includes('services/tokenBucket.js'), false);
    assert.equal(ablatedTrace1.priorFixMatch, null, 'Historical bug in tokenBucket.js must no longer be reachable');

    const ablatedRankings1 = evaluateCandidateRankings(report, ablatedTrace1, ablatedContext1);
    // acquireTokenLock is eliminated from reachable candidates
    assert.equal(ablatedRankings1.some(c => c.symbolName === 'acquireTokenLock'), false);

    const ablatedInvestigation1 = await runIncidentInvestigation(
      report,
      SYNTHETIC_INCIDENT_FIXTURE,
      { graphContext: ablatedContext1 }
    );
    // Confidence drops from HIGH because downstream prior bug evidence was severed
    assert.notEqual(ablatedInvestigation1.diagnosis.confidence, 'HIGH');
    assert.notEqual(ablatedInvestigation1.diagnosis.rootCauseSymbol, 'acquireTokenLock');

    // ABLATION 2: Sever entrypoint call edges completely (handlePaymentRequest.callsSymbols = [])
    const ablatedContext2 = {
      ...MOCK_GRAPH_CONTEXT,
      symbols: MOCK_GRAPH_CONTEXT.symbols.map(s => {
        if (s.name === 'handlePaymentRequest') {
          return { ...s, callsSymbols: [] }; // All downstream call edges severed!
        }
        return s;
      })
    };

    const ablatedInvestigation2 = await runIncidentInvestigation(
      report,
      SYNTHETIC_INCIDENT_FIXTURE,
      { graphContext: ablatedContext2 }
    );
    // With zero downstream reachability to commit-modified files, confidence collapses to LOW
    assert.equal(ablatedInvestigation2.diagnosis.confidence, 'LOW');
    assert.ok(ablatedInvestigation2.diagnosis.summary.includes('Explicit Uncertainty') || ablatedInvestigation2.diagnosis.summary.includes('Inferred Causes'));
    assert.ok(ablatedInvestigation2.diagnosis.summary.includes('None of the reachable downstream symbols'));
  });

  it('9. Enforces POST /api/incident/seed for state-changing seeding and leaves GET /api/incident/seed strictly read-only', async () => {
    let server;
    let baseUrl;
    let queryExecuted = false;
    const savedProvider = process.env.GRAPH_DATABASE_PROVIDER;
    const savedHost = process.env.FALKORDB_HOST;

    process.env.GRAPH_DATABASE_PROVIDER = 'falkordb';
    process.env.FALKORDB_HOST = 'localhost';

    setClientForTesting({
      selectGraph() {
        return {
          async query() {
            queryExecuted = true;
            return { data: [] };
          }
        };
      },
      async close() {}
    });

    try {
      await new Promise(resolve => {
        server = app.listen(0, () => {
          const { port } = server.address();
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });

      // 1. GET is strictly read-only inspection (zero database mutations/queries)
      queryExecuted = false;
      const getRes = await fetch(`${baseUrl}/api/incident/seed`);
      assert.equal(getRes.status, 200);
      const getBody = await getRes.json();
      assert.equal(getBody.success, true);
      assert.equal(getBody.seeded, false, 'GET must never perform state-changing seeding');
      assert.equal(getBody.repository.fullName, 'acme/payment-gateway');
      assert.equal(queryExecuted, false, 'GET must execute zero database queries');

      // 2. POST performs state-changing seeding
      const postRes = await fetch(`${baseUrl}/api/incident/seed`, { method: 'POST' });
      assert.equal(postRes.status, 200);
      const postBody = await postRes.json();
      assert.equal(postBody.success, true);
      assert.equal(postBody.seeded, true, 'POST must perform state mutation');
      assert.equal(postBody.repository.fullName, 'acme/payment-gateway');
      assert.equal(queryExecuted, true, 'POST must execute database ingestion queries');
    } finally {
      if (savedProvider !== undefined) process.env.GRAPH_DATABASE_PROVIDER = savedProvider;
      else delete process.env.GRAPH_DATABASE_PROVIDER;
      if (savedHost !== undefined) process.env.FALKORDB_HOST = savedHost;
      else delete process.env.FALKORDB_HOST;

      if (server) {
        await new Promise(resolve => server.close(resolve));
      }
    }
  });

  it('10. Rejects invalid or missing parameters across all incident endpoints', async () => {
    let server;
    let baseUrl;

    try {
      await new Promise(resolve => {
        server = app.listen(0, () => {
          const { port } = server.address();
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });

      // 1. /api/incident/investigate requires report and title
      const res1 = await fetch(`${baseUrl}/api/incident/investigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      assert.equal(res1.status, 400);

      const res2 = await fetch(`${baseUrl}/api/incident/investigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: { title: 'Missing Repo' } })
      });
      assert.equal(res2.status, 400);
      const body2 = await res2.json();
      assert.ok(body2.error.includes('Valid repository fullName'));

      // 2. /api/incident/simulate requires investigation object and valid repoFullName
      const res3 = await fetch(`${baseUrl}/api/incident/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      assert.equal(res3.status, 400);

      const res4 = await fetch(`${baseUrl}/api/incident/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investigation: { repoFullName: 'invalid-repo' } })
      });
      assert.equal(res4.status, 400);

      // 3. /api/incident/record requires investigation object and valid repoFullName
      const res5 = await fetch(`${baseUrl}/api/incident/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      assert.equal(res5.status, 400);

      const res6 = await fetch(`${baseUrl}/api/incident/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investigation: { repoFullName: 'invalid-repo' } })
      });
      assert.equal(res6.status, 400);
    } finally {
      if (server) {
        await new Promise(resolve => server.close(resolve));
      }
    }
  });

  it('11. Recovery simulation rejects unresolved/unknown root cause without fabricating fallbacks', () => {
    // Missing repoFullName throws
    assert.throws(
      () => simulateIncidentRecovery({}),
      /Valid repoFullName/
    );

    // Unresolved root cause returns simulated: false with INSUFFICIENT_EVIDENCE
    const unresolvedResult = {
      incidentId: 'inc-unresolved-01',
      repoFullName: 'acme/payment-gateway',
      diagnosis: {
        rootCauseFile: 'unknown',
        rootCauseSymbol: 'unknown',
        confidence: 'INSUFFICIENT_EVIDENCE'
      },
      recoveryRecommendation: {
        targetFile: 'unknown',
        action: 'gather_more_graph_evidence'
      }
    };

    const sim = simulateIncidentRecovery(unresolvedResult);
    assert.equal(sim.simulated, false);
    assert.equal(sim.status, 'INSUFFICIENT_EVIDENCE');
    assert.equal(sim.targetFile, null);
    assert.equal(sim.targetSymbol, null);
    assert.equal(sim.blastRadius.filesCount, 0);
    assert.ok(sim.error.includes('does not contain a verified root-cause target'));
    assert.ok(sim.verificationSummary.includes('Simulation aborted'));
  });

  it('12. POST /api/incident/simulate and record reject unresolved root causes with 400 Bad Request', async () => {
    let server;
    let baseUrl;

    try {
      await new Promise(resolve => {
        server = app.listen(0, () => {
          const { port } = server.address();
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });

      // simulate rejects unknown root cause
      const simRes = await fetch(`${baseUrl}/api/incident/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investigation: {
            repoFullName: 'acme/payment-gateway',
            diagnosis: { rootCauseFile: 'unknown', rootCauseSymbol: 'unknown' }
          }
        })
      });
      assert.equal(simRes.status, 400);
      const simBody = await simRes.json();
      assert.ok(simBody.error.includes('verified root-cause target'));

      // record rejects unknown root cause
      const recRes = await fetch(`${baseUrl}/api/incident/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investigation: {
            repoFullName: 'acme/payment-gateway',
            diagnosis: { rootCauseFile: 'unknown', rootCauseSymbol: 'unknown' }
          }
        })
      });
      assert.equal(recRes.status, 400);
      const recBody = await recRes.json();
      assert.ok(recBody.error.includes('verified root-cause target'));
    } finally {
      if (server) {
        await new Promise(resolve => server.close(resolve));
      }
    }
  });

  it('13. POST /api/incident/seed returns complete fixture payload for deterministic scenario selection', async () => {
    let server;
    let baseUrl;

    setClientForTesting({
      selectGraph() {
        return {
          async query() {
            return { data: [] };
          }
        };
      },
      async close() {}
    });

    const savedProvider = process.env.GRAPH_DATABASE_PROVIDER;
    const savedHost = process.env.FALKORDB_HOST;
    process.env.GRAPH_DATABASE_PROVIDER = 'falkordb';
    process.env.FALKORDB_HOST = 'localhost';

    try {
      await new Promise(resolve => {
        server = app.listen(0, () => {
          const { port } = server.address();
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });

      const res = await fetch(`${baseUrl}/api/incident/seed`, { method: 'POST' });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.seeded, true);
      assert.equal(body.repository.fullName, 'acme/payment-gateway');
      assert.ok(body.fixture, 'Must include complete fixture analysis object in seed response');
      assert.equal(body.fixture.repository.fullName, 'acme/payment-gateway');
      assert.ok(Array.isArray(body.fixture.aiContextReady.filePaths));
    } finally {
      if (savedProvider !== undefined) process.env.GRAPH_DATABASE_PROVIDER = savedProvider;
      else delete process.env.GRAPH_DATABASE_PROVIDER;
      if (savedHost !== undefined) process.env.FALKORDB_HOST = savedHost;
      else delete process.env.FALKORDB_HOST;

      if (server) {
        await new Promise(resolve => server.close(resolve));
      }
    }
  });

  it('14. getRepositoryOverview always reports active provider dynamically', async () => {
    setClientForTesting({
      selectGraph() {
        return {
          async query() {
            return { data: [{ filesCount: 3, componentsCount: 2, symbolsCount: 4 }] };
          }
        };
      },
      async close() {}
    });

    const overview = await getRepositoryOverview('acme/payment-gateway', {
      env: { GRAPH_DATABASE_PROVIDER: 'falkordb', FALKORDB_HOST: 'localhost' }
    });

    assert.equal(overview.available, true);
    assert.equal(overview.provider, 'falkordb', 'Overview must explicitly report active provider as falkordb');
  });

  it('15. Excludes self-referential recorded incident from matching as historical bug', async () => {
    const report = SYNTHETIC_INCIDENT_FIXTURE.incidentReport;
    const contaminatedContext = {
      ...MOCK_GRAPH_CONTEXT,
      bugsAndFixes: [
        {
          bugId: 'acme/payment-gateway::bug::payment-gateway-504-gateway-timeout-cascade',
          title: 'Payment Gateway 504 Gateway Timeout Cascade',
          filePath: 'services/tokenBucket.js',
          fixSummary: 'Remediate acquireTokenLock: Revert blocking wait and apply circuit breaker'
        },
        {
          bugId: 'acme/payment-gateway::bug::lock-starvation-01',
          title: 'Worker Thread Lock Starvation under High Concurrency',
          filePath: 'services/tokenBucket.js',
          fixSummary: 'Enforce non-blocking tryAcquire with circuit breaker timeout'
        }
      ]
    };

    const evidence = traceConnectedGraphEvidence(report, contaminatedContext);
    assert.equal(evidence.matchedPriorBugs.length, 1);
    assert.equal(evidence.matchedPriorBugs[0].title, 'Worker Thread Lock Starvation under High Concurrency');
    assert.equal(evidence.priorFixMatch.title, 'Worker Thread Lock Starvation under High Concurrency');
  });

  it('16. Prioritizes commits with verified changed files over duplicate/empty short SHA commits', async () => {
    const report = SYNTHETIC_INCIDENT_FIXTURE.incidentReport;
    const contextWithShadowCommit = {
      ...MOCK_GRAPH_CONTEXT,
      recentCommits: [
        {
          sha: '8f2a1b9',
          shortSha: '8f2a1b9',
          message: 'Remediate acquireTokenLock',
          changedFiles: []
        },
        {
          sha: '8f2a1b9c0d1e2f3a',
          shortSha: '8f2a1b9',
          message: 'Refactor rate limit cache and token bucket mutex',
          changedFiles: ['services/rateLimiter.js', 'services/tokenBucket.js']
        }
      ]
    };

    const evidence = traceConnectedGraphEvidence(report, contextWithShadowCommit);
    assert.ok(evidence.matchingCommit);
    assert.deepEqual(evidence.matchingCommit.changedFiles, ['services/rateLimiter.js', 'services/tokenBucket.js']);

    const rankings = evaluateCandidateRankings(report, evidence, contextWithShadowCommit);
    const top = rankings[0];
    assert.equal(top.filePath, 'services/tokenBucket.js');
    assert.equal(top.isCommitTouched, true);
    assert.equal(top.hasPriorBug, true);

    const outcome = await runIncidentInvestigation(report, SYNTHETIC_INCIDENT_FIXTURE, {
      graphContext: contextWithShadowCommit
    });
    assert.equal(outcome.diagnosis.confidence, 'HIGH');
    assert.equal(outcome.diagnosis.rootCauseFile, 'services/tokenBucket.js');
  });

  it('17. POST /api/incident/investigate gracefully falls back to complete fixture analysis when client sends partial analysis', async () => {
    const report = SYNTHETIC_INCIDENT_FIXTURE.incidentReport;
    const outcome = await runIncidentInvestigation(report, { repository: { fullName: 'acme/payment-gateway' } }, {
      graphContext: MOCK_GRAPH_CONTEXT
    });
    assert.equal(outcome.diagnosis.confidence, 'HIGH');
    assert.equal(outcome.diagnosis.rootCauseFile, 'services/tokenBucket.js');
    assert.equal(outcome.diagnosis.rootCauseSymbol, 'acquireTokenLock');
  });

  it('18. Fresh-request recall: recorded resolution is recalled by developer questions in graph context', async () => {
    const recordedBugs = [
      {
        bugId: 'acme/payment-gateway::bug::lock-starvation-01',
        title: 'Worker Thread Lock Starvation under High Concurrency',
        description: 'Token bucket mutex deadlocks worker threads.',
        filePath: 'services/tokenBucket.js',
        fixSummary: 'Enforce non-blocking tryAcquire with circuit breaker timeout'
      },
      {
        bugId: 'acme/payment-gateway::bug::resolution-inc-pay-504-01',
        title: 'Payment Gateway 504 Gateway Timeout Cascade',
        description: 'Root cause identified in services/tokenBucket.js. [Incident ID: inc-pay-504-01]',
        filePath: 'services/tokenBucket.js',
        fixSummary: 'Remediate acquireTokenLock: Revert blocking wait and apply circuit breaker'
      }
    ];

    setClientForTesting({
      selectGraph() {
        return {
          async query(cypher) {
            if (cypher.includes('MATCH (b:Bug')) {
              return {
                data: recordedBugs.map(b => ({
                  bugId: b.bugId,
                  title: b.title,
                  description: b.description,
                  filePath: b.filePath,
                  fixSummary: b.fixSummary,
                  relevanceScore: 1
                }))
              };
            }
            return { data: [] };
          },
          async roQuery(cypher) {
            return this.query(cypher);
          }
        };
      },
      async close() {}
    });

    const context = await retrieveGraphContext(
      'acme/payment-gateway',
      'How was the 504 gateway timeout cascade resolved in services/tokenBucket.js?',
      { env: { GRAPH_DATABASE_PROVIDER: 'falkordb', FALKORDB_HOST: 'localhost' } }
    );

    assert.equal(context.available, true);
    assert.equal(context.bugsAndFixes.length, 2);
    const recalledResolution = context.bugsAndFixes.find(b => b.bugId.includes('resolution-inc-pay-504-01'));
    assert.ok(recalledResolution, 'Fresh query must recall the persisted incident resolution from graph memory');
    assert.equal(recalledResolution.filePath, 'services/tokenBucket.js');
    assert.ok(recalledResolution.fixSummary.includes('circuit breaker'));
  });

  it('19. Seed cleanup: preserves canonical prior bug and purges recorded incident resolutions', async () => {
    const executedQueries = [];

    setClientForTesting({
      selectGraph() {
        return {
          async query(cypher, optionsOrParams) {
            executedQueries.push({ cypher, params: optionsOrParams?.params || optionsOrParams });
            return { data: [] };
          }
        };
      },
      async close() {}
    });

    let server;
    let baseUrl;
    const savedProvider = process.env.GRAPH_DATABASE_PROVIDER;
    const savedHost = process.env.FALKORDB_HOST;

    process.env.GRAPH_DATABASE_PROVIDER = 'falkordb';
    process.env.FALKORDB_HOST = 'localhost';

    try {
      await new Promise(resolve => {
        server = app.listen(0, () => {
          const { port } = server.address();
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });

      const res = await fetch(`${baseUrl}/api/incident/seed`, { method: 'POST' });
      assert.equal(res.status, 200);

      const cleanupQuery = executedQueries.find(q => q.cypher.includes('b.title <> $priorBugTitle'));
      assert.ok(cleanupQuery, 'Must execute deterministic cleanup retaining priorBugTitle');
      assert.equal(cleanupQuery.params.repoTarget, 'acme/payment-gateway');
      assert.equal(cleanupQuery.params.priorBugTitle, 'Worker Thread Lock Starvation under High Concurrency');
    } finally {
      if (savedProvider !== undefined) process.env.GRAPH_DATABASE_PROVIDER = savedProvider;
      else delete process.env.GRAPH_DATABASE_PROVIDER;
      if (savedHost !== undefined) process.env.FALKORDB_HOST = savedHost;
      else delete process.env.FALKORDB_HOST;

      if (server) {
        await new Promise(resolve => server.close(resolve));
      }
    }
  });

  it('20. Multi-hop ablation: severing Hop 1 vs Hop 2 alters evidence and restores cleanly', async () => {
    const report = SYNTHETIC_INCIDENT_FIXTURE.incidentReport;

    // Normal 2-hop baseline
    const baselineTrace = traceConnectedGraphEvidence(report, MOCK_GRAPH_CONTEXT);
    assert.equal(baselineTrace.reachableSymbols.length, 4);
    assert.equal(baselineTrace.priorFixMatch.filePath, 'services/tokenBucket.js');

    // ABLATION HOP 1: Sever entrypoint calls
    const ablatedHop1Context = {
      ...MOCK_GRAPH_CONTEXT,
      symbols: MOCK_GRAPH_CONTEXT.symbols.map(s => {
        if (s.filePath === 'server/routes/pay.js') {
          return { ...s, callsSymbols: [] };
        }
        return s;
      })
    };
    const ablatedHop1Trace = traceConnectedGraphEvidence(report, ablatedHop1Context);
    assert.equal(ablatedHop1Trace.reachableSymbols.length, 1);
    assert.equal(ablatedHop1Trace.priorFixMatch, null);
    assert.equal(ablatedHop1Trace.connectedFiles.includes('services/tokenBucket.js'), false);

    // ABLATION HOP 2: Sever auth -> tokenBucket call
    const ablatedHop2Context = {
      ...MOCK_GRAPH_CONTEXT,
      symbols: MOCK_GRAPH_CONTEXT.symbols.map(s => {
        if (s.name === 'verifyToken') {
          return { ...s, callsSymbols: [] };
        }
        return s;
      })
    };
    const ablatedHop2Trace = traceConnectedGraphEvidence(report, ablatedHop2Context);
    assert.equal(ablatedHop2Trace.reachableSymbols.length, 3);
    assert.equal(ablatedHop2Trace.priorFixMatch, null);
    assert.equal(ablatedHop2Trace.connectedFiles.includes('services/tokenBucket.js'), false);

    // RESTORE: Baseline graph context immediately regains 2-hop reachability and HIGH confidence
    const restoredInvestigation = await runIncidentInvestigation(report, SYNTHETIC_INCIDENT_FIXTURE, {
      graphContext: MOCK_GRAPH_CONTEXT
    });
    assert.equal(restoredInvestigation.diagnosis.confidence, 'HIGH');
    assert.equal(restoredInvestigation.diagnosis.rootCauseSymbol, 'acquireTokenLock');
    assert.equal(restoredInvestigation.diagnosis.rootCauseFile, 'services/tokenBucket.js');
  });

  it('21. Context handoff: preserves incident repository identity and retrieves recorded fix via recall endpoint', async () => {
    const recordedBugs = [
      {
        bugId: 'acme/payment-gateway::bug::resolution-inc-pay-504-01',
        title: 'Payment Gateway 504 Gateway Timeout Cascade',
        description: 'Root cause identified in services/tokenBucket.js. [Incident ID: inc-pay-504-01]',
        filePath: 'services/tokenBucket.js',
        fixSummary: 'Remediate acquireTokenLock: Enforce non-blocking tryAcquire with circuit breaker timeout'
      }
    ];

    setClientForTesting({
      selectGraph() {
        return {
          async query(cypher, optionsOrParams) {
            const params = optionsOrParams?.params || optionsOrParams || {};
            if (params.repoFullName && params.repoFullName !== 'acme/payment-gateway') {
              return { data: [] };
            }
            if (cypher.includes('MATCH (b:Bug')) {
              return {
                data: recordedBugs.map(b => ({
                  bugId: b.bugId,
                  title: b.title,
                  description: b.description,
                  filePath: b.filePath,
                  fixSummary: b.fixSummary,
                  relevanceScore: 1
                }))
              };
            }
            return { data: [] };
          },
          async roQuery(cypher, optionsOrParams) {
            return this.query(cypher, optionsOrParams);
          }
        };
      },
      async close() {}
    });

    let server;
    let baseUrl;
    const savedProvider = process.env.GRAPH_DATABASE_PROVIDER;
    const savedHost = process.env.FALKORDB_HOST;

    process.env.GRAPH_DATABASE_PROVIDER = 'falkordb';
    process.env.FALKORDB_HOST = 'localhost';

    try {
      await new Promise(resolve => {
        server = app.listen(0, () => {
          const { port } = server.address();
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });

      // Calling GET /api/incident/recall with acme/payment-gateway repository
      const res = await fetch(`${baseUrl}/api/incident/recall?repo=acme/payment-gateway&q=token+bucket+timeout`);
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(data.success, true);
      assert.equal(data.repoFullName, 'acme/payment-gateway');
      assert.ok(data.recalledFix, 'Must recall the confirmed incident fix');
      assert.equal(data.recalledFix.filePath, 'services/tokenBucket.js');
      assert.ok(data.recalledFix.fixSummary.includes('circuit breaker'));
      assert.ok(data.recalledFix.provenance.includes('FIX_RESOLVES_BUG'));
    } finally {
      if (savedProvider !== undefined) process.env.GRAPH_DATABASE_PROVIDER = savedProvider;
      else delete process.env.GRAPH_DATABASE_PROVIDER;
      if (savedHost !== undefined) process.env.FALKORDB_HOST = savedHost;
      else delete process.env.FALKORDB_HOST;

      if (server) {
        await new Promise(resolve => server.close(resolve));
      }
    }
  });

  it('22. Recall returns the recorded token-bucket fix from canonical graph memory', async () => {
    const recordedBugs = [
      {
        bugId: 'acme/payment-gateway::bug::lock-starvation-01',
        title: 'Worker Thread Lock Starvation under High Concurrency',
        description: 'Token bucket mutex deadlocks worker threads when downstream auth latency spikes.',
        filePath: 'services/tokenBucket.js',
        fixSummary: 'Enforce non-blocking tryAcquire with circuit breaker timeout'
      }
    ];

    setClientForTesting({
      selectGraph() {
        return {
          async query(cypher, optionsOrParams) {
            const params = optionsOrParams?.params || optionsOrParams || {};
            if (params.repoFullName === 'acme/payment-gateway' && cypher.includes('MATCH (b:Bug')) {
              return {
                data: recordedBugs.map(b => ({
                  bugId: b.bugId,
                  title: b.title,
                  description: b.description,
                  filePath: b.filePath,
                  fixSummary: b.fixSummary,
                  relevanceScore: 1
                }))
              };
            }
            return { data: [] };
          },
          async roQuery(cypher, optionsOrParams) {
            return this.query(cypher, optionsOrParams);
          }
        };
      },
      async close() {}
    });

    const context = await retrieveGraphContext(
      'acme/payment-gateway',
      'What recorded resolution exists in FalkorDB for the payment gateway timeout incident?',
      { env: { GRAPH_DATABASE_PROVIDER: 'falkordb', FALKORDB_HOST: 'localhost' } }
    );

    assert.equal(context.available, true);
    assert.equal(context.repoFullName, 'acme/payment-gateway');
    assert.ok(context.bugsAndFixes.length >= 1);

    const tokenBucketFix = context.bugsAndFixes.find(b => b.filePath === 'services/tokenBucket.js');
    assert.ok(tokenBucketFix, 'Expected token bucket fix in retrieved graph context');
    assert.equal(tokenBucketFix.title, 'Worker Thread Lock Starvation under High Concurrency');
    assert.ok(tokenBucketFix.fixSummary.includes('circuit breaker timeout'));
  });

  it('23. Strict repository isolation: different repository does not receive the incident fix as evidence', async () => {
    const recordedBugs = [
      {
        bugId: 'acme/payment-gateway::bug::resolution-inc-pay-504-01',
        title: 'Payment Gateway 504 Gateway Timeout Cascade',
        description: 'Root cause identified in services/tokenBucket.js. [Incident ID: inc-pay-504-01]',
        filePath: 'services/tokenBucket.js',
        fixSummary: 'Remediate acquireTokenLock: Enforce non-blocking tryAcquire with circuit breaker timeout'
      }
    ];

    setClientForTesting({
      selectGraph() {
        return {
          async query(cypher, optionsOrParams) {
            const params = optionsOrParams?.params || optionsOrParams || {};
            // Strict repository isolation: only return bugs for acme/payment-gateway
            if (params.repoFullName === 'acme/payment-gateway' && cypher.includes('MATCH (b:Bug')) {
              return {
                data: recordedBugs.map(b => ({
                  bugId: b.bugId,
                  title: b.title,
                  description: b.description,
                  filePath: b.filePath,
                  fixSummary: b.fixSummary,
                  relevanceScore: 1
                }))
              };
            }
            // For any other repo (e.g. spf13/cobra), return zero bugs
            return { data: [] };
          },
          async roQuery(cypher, optionsOrParams) {
            return this.query(cypher, optionsOrParams);
          }
        };
      },
      async close() {}
    });

    // Querying with spf13/cobra must return zero incident fixes from acme/payment-gateway
    const cobraContext = await retrieveGraphContext(
      'spf13/cobra',
      'What recorded resolution exists in FalkorDB for the payment gateway timeout incident?',
      { env: { GRAPH_DATABASE_PROVIDER: 'falkordb', FALKORDB_HOST: 'localhost' } }
    );

    assert.equal(cobraContext.available, true);
    assert.equal(cobraContext.repoFullName, 'spf13/cobra');
    assert.equal(cobraContext.bugsAndFixes.length, 0, 'Cobra must NOT receive payment-gateway incident bugs or fixes');

    // Querying with other-org/payment-service must also return zero incident fixes
    const otherContext = await retrieveGraphContext(
      'other-org/payment-service',
      'lock starvation timeout token bucket',
      { env: { GRAPH_DATABASE_PROVIDER: 'falkordb', FALKORDB_HOST: 'localhost' } }
    );

    assert.equal(otherContext.available, true);
    assert.equal(otherContext.repoFullName, 'other-org/payment-service');
    assert.equal(otherContext.bugsAndFixes.length, 0, 'Unrelated repository must NOT receive payment-gateway incident bugs or fixes');
  });

  it('24. Regression: active repo spf13/cobra with incident target acme/payment-gateway recalls recorded fix; unscoped Cobra query does not leak', async () => {
    const recordedBugs = [
      {
        bugId: 'acme/payment-gateway::bug::lock-starvation-01',
        title: 'Worker Thread Lock Starvation under High Concurrency',
        description: 'Token bucket mutex deadlocks worker threads when downstream auth latency spikes, resulting in HTTP 504 timeouts.',
        severity: 'critical',
        status: 'resolved',
        symptoms: 'HTTP 504 Gateway Timeout',
        filePath: 'services/tokenBucket.js',
        componentPath: 'services',
        fixSummary: 'Enforce non-blocking tryAcquire with circuit breaker timeout',
        fixDescription: 'Replaced unbounded while loop with bounded 250ms timeout and circuit breaker fallback in acquireTokenLock.',
        commitSha: '7e1d4c2b9a0f'
      }
    ];

    setClientForTesting({
      selectGraph() {
        return {
          async query(cypher, optionsOrParams) {
            const params = optionsOrParams?.params || optionsOrParams || {};
            if (params.repoFullName === 'acme/payment-gateway' && cypher.includes('MATCH (b:Bug')) {
              return {
                data: recordedBugs.map(b => ({
                  bugId: b.bugId,
                  title: b.title,
                  description: b.description,
                  severity: b.severity,
                  status: b.status,
                  symptoms: b.symptoms,
                  filePath: b.filePath,
                  componentPath: b.componentPath,
                  fixId: 'acme/payment-gateway::fix::fix-lock-starvation-01',
                  fixSummary: b.fixSummary,
                  fixDescription: b.fixDescription,
                  commitSha: b.commitSha,
                  relevanceScore: 2
                }))
              };
            }
            if (params.repoFullName === 'acme/payment-gateway' && cypher.includes('MATCH (s:Symbol')) {
              return {
                data: [
                  {
                    id: 'acme/payment-gateway::symbol::services/tokenBucket.js::function::acquireTokenLock',
                    name: 'acquireTokenLock',
                    kind: 'Function',
                    filePath: 'services/tokenBucket.js',
                    startLine: 2,
                    endLine: 6,
                    callsSymbols: [],
                    calledBySymbols: ['verifyToken'],
                    coveredByTests: ['tokenBucket.test.js'],
                    changedInCommits: ['8f2a1b9'],
                    score: 2
                  }
                ]
              };
            }
            // For spf13/cobra or anything else, return zero bugs and zero symbols
            return { data: [] };
          },
          async roQuery(cypher, optionsOrParams) {
            return this.query(cypher, optionsOrParams);
          }
        };
      },
      async close() {}
    });

    const origFailover = aiProvider.callGeminiWithFailover.bind(aiProvider);
    let capturedPrompt = '';
    aiProvider.callGeminiWithFailover = async (sys, prompt) => {
      capturedPrompt = prompt;
      return {
        text: `### Confirmed Facts\n- The historical fix recorded in FalkorDB for \`services/tokenBucket.js\` is: "Enforce non-blocking tryAcquire with circuit breaker timeout".\n- Function \`acquireTokenLock\` was updated to replace the blocking while-loop with a bounded timeout.\n\n### Inferred Causes & Uncertainty\n- High concurrency requests caused worker threads to wait indefinitely on mutex acquisition.\n\n### Recommended Next Debugging Steps\n- Verify circuit breaker metrics under load.`,
        model: 'gemini-3.8-flash',
        primaryModel: 'gemini-3.8-flash',
        fallbackUsed: false,
        attempts: 1,
        triedModels: ['gemini-3.8-flash']
      };
    };

    try {
      const activeCobraAnalysis = {
        repository: {
          owner: 'spf13',
          repo: 'cobra',
          fullName: 'spf13/cobra',
          primaryLanguage: 'Go'
        },
        aiContextReady: {
          filePaths: ['cobra.go', 'command.go']
        }
      };

      // Part A: Scoped query via targetRepo
      const scopedResult = await aiProvider.answerQuestion(
        'What fix was recorded for the previous lock-starvation incident?',
        activeCobraAnalysis,
        {
          targetRepo: 'acme/payment-gateway',
          env: { GRAPH_DATABASE_PROVIDER: 'falkordb', FALKORDB_HOST: 'localhost' }
        }
      );

      assert.equal(scopedResult.available, true);
      assert.equal(scopedResult.graphMemory.used, true);
      assert.equal(scopedResult.graphMemory.repoFullName, 'acme/payment-gateway');
      assert.equal(scopedResult.graphMemory.bugsAndFixes.length, 1);
      assert.equal(scopedResult.graphMemory.bugsAndFixes[0].filePath, 'services/tokenBucket.js');
      assert.equal(scopedResult.graphMemory.bugsAndFixes[0].fixSummary, 'Enforce non-blocking tryAcquire with circuit breaker timeout');
      assert.ok(scopedResult.answer.includes('services/tokenBucket.js'));
      assert.ok(scopedResult.answer.includes('acquireTokenLock'));
      assert.ok(scopedResult.answer.includes('Enforce non-blocking tryAcquire with circuit breaker timeout'));
      assert.ok(capturedPrompt.includes('acme/payment-gateway'));
      assert.ok(capturedPrompt.includes('Enforce non-blocking tryAcquire with circuit breaker timeout'));

      // Part B: Scoped query via focusEntity override
      const focusEntityResult = await aiProvider.answerQuestion(
        'What fix was recorded for the previous lock-starvation incident?',
        activeCobraAnalysis,
        {
          focusEntity: {
            id: 'acme/payment-gateway::bug::lock-starvation-01',
            label: 'Bug',
            title: 'Worker Thread Lock Starvation under High Concurrency'
          },
          env: { GRAPH_DATABASE_PROVIDER: 'falkordb', FALKORDB_HOST: 'localhost' }
        }
      );

      assert.equal(focusEntityResult.available, true);
      assert.equal(focusEntityResult.graphMemory.used, true);
      assert.equal(focusEntityResult.graphMemory.repoFullName, 'acme/payment-gateway');
      assert.equal(focusEntityResult.graphMemory.bugsAndFixes.length, 1);
      assert.equal(focusEntityResult.graphMemory.bugsAndFixes[0].filePath, 'services/tokenBucket.js');

      // Part C: Unscoped Cobra query must NOT leak payment-gateway memory
      let cobraPrompt = '';
      aiProvider.callGeminiWithFailover = async (sys, prompt) => {
        cobraPrompt = prompt;
        return {
          text: `### Confirmed Facts\n- The repository spf13/cobra is a Go CLI library.\n- Based on the scanned repository context, no lock-starvation fix was recorded.\n\n### Inferred Causes & Uncertainty\n- None.\n\n### Recommended Next Debugging Steps\n- Search Go documentation.`,
          model: 'gemini-3.8-flash',
          primaryModel: 'gemini-3.8-flash',
          fallbackUsed: false,
          attempts: 1,
          triedModels: ['gemini-3.8-flash']
        };
      };

      const unscopedCobraResult = await aiProvider.answerQuestion(
        'What fix was recorded for the previous lock-starvation incident?',
        activeCobraAnalysis,
        {
          env: { GRAPH_DATABASE_PROVIDER: 'falkordb', FALKORDB_HOST: 'localhost' }
        }
      );

      assert.equal(unscopedCobraResult.available, true);
      assert.equal(unscopedCobraResult.graphMemory.repoFullName, 'spf13/cobra');
      assert.equal(unscopedCobraResult.graphMemory.bugsAndFixes.length, 0, 'Unscoped Cobra query must NOT receive payment-gateway bugs or fixes');
      assert.ok(!cobraPrompt.includes('acme/payment-gateway'), 'Prompt must NOT contain payment-gateway context');
      assert.ok(!cobraPrompt.includes('services/tokenBucket.js'), 'Prompt must NOT contain tokenBucket.js');
      assert.ok(!unscopedCobraResult.answer.includes('Enforce non-blocking tryAcquire'), 'Answer must not claim payment-gateway fix exists');
    } finally {
      aiProvider.callGeminiWithFailover = origFailover;
    }
  });

  it('25. Provenance integrity: suspect refactor commit (8f2a1b9) and historical fix commit (7e1d4c2) have distinct roles and are not conflated', async () => {
    const report = SYNTHETIC_INCIDENT_FIXTURE.incidentReport;
    const outcome = await runIncidentInvestigation(report, SYNTHETIC_INCIDENT_FIXTURE, {
      graphContext: MOCK_GRAPH_CONTEXT
    });

    // 1. Suspected introducing commit is 8f2a1b9
    assert.ok(outcome.diagnosis.suspectedIntroducingCommit);
    assert.equal(outcome.diagnosis.suspectedIntroducingCommit.shortSha, '8f2a1b9');
    assert.ok(
      outcome.diagnosis.suspectedIntroducingCommit.role === 'suspected_introducing_change' ||
      outcome.diagnosis.suspectedIntroducingCommit.role === 'suspected_refactor'
    );

    // 2. Historical fix commit is 7e1d4c2
    assert.ok(outcome.diagnosis.historicalFix);
    assert.equal(outcome.diagnosis.historicalFix.commitShortSha, '7e1d4c2');
    assert.equal(outcome.diagnosis.historicalFix.role, 'historical_fix');
    assert.notEqual(outcome.diagnosis.historicalFix.commitSha, outcome.diagnosis.suspectedIntroducingCommit.sha);

    // 3. Evidence chain explicitly distinguishes commit roles
    const commitStep = outcome.connectedEvidence.evidenceChain.find(e => e.type === 'COMMIT_CHANGED_FILE');
    assert.ok(commitStep);
    assert.equal(commitStep.commitRole, 'suspected_introducing_change');
    assert.ok(commitStep.commitSha.startsWith('8f2a1b9'));

    const fixStep = outcome.connectedEvidence.evidenceChain.find(e => e.type === 'FIX_RESOLVES_BUG');
    assert.ok(fixStep);
    assert.equal(fixStep.commitRole, 'historical_fix');
    assert.ok(fixStep.commitSha.startsWith('7e1d4c2'));
  });

  it('26. Diagnosis response provides explicit implementation status and avoids unsupported certainty claims', async () => {
    const report = SYNTHETIC_INCIDENT_FIXTURE.incidentReport;
    const outcome = await runIncidentInvestigation(report, SYNTHETIC_INCIDENT_FIXTURE, {
      graphContext: MOCK_GRAPH_CONTEXT
    });

    // Implementation status is explicitly qualified
    assert.ok(outcome.diagnosis.implementationStatus);
    assert.equal(outcome.diagnosis.implementationStatus.verified, false);
    assert.ok(outcome.diagnosis.implementationStatus.status.includes('Historical fix recorded; current implementation not yet verified'));
    assert.equal(outcome.diagnosis.implementationStatus.verifiedFile, 'services/tokenBucket.js');
    assert.equal(outcome.diagnosis.implementationStatus.verifiedSymbol, 'acquireTokenLock');

    // Summary contains explicit verification status and boundaries
    assert.ok(outcome.diagnosis.summary.includes('Current Implementation Status & Explicit Verification Boundary'));
    assert.ok(outcome.diagnosis.summary.includes('Historical fix recorded; current implementation not yet verified'));
    assert.ok(outcome.diagnosis.summary.includes('Suspected Introducing Change'));
    assert.ok(outcome.diagnosis.summary.includes('Historical Fix Precedent'));
  });

  it('27. Seeding is idempotent and does not create duplicate Bug/Fix nodes or contradictory relationships', async () => {
    let queryCount = 0;
    const executedQueries = [];

    setClientForTesting({
      selectGraph() {
        return {
          async query(cypher, params) {
            queryCount++;
            executedQueries.push({ cypher, params });
            if (cypher.includes('MATCH (b:Bug')) {
              return { data: [{ bugId: 'acme/payment-gateway::bug::worker-thread-lock-starvation-under-high-concurrency' }] };
            }
            return { data: [] };
          }
        };
      },
      async close() {}
    });

    // Ingest fixture commits
    const commits = SYNTHETIC_INCIDENT_FIXTURE.commits;
    assert.equal(commits.length, 2, 'Fixture must contain both suspect refactor and historical fix commits');

    const refactorCommit = commits.find(c => c.shortSha === '8f2a1b9');
    const fixCommit = commits.find(c => c.shortSha === '7e1d4c2');

    assert.ok(refactorCommit);
    assert.equal(refactorCommit.role, 'suspected_refactor');
    assert.ok(refactorCommit.files.some(f => f.path === 'services/tokenBucket.js'));

    assert.ok(fixCommit);
    assert.equal(fixCommit.role, 'historical_fix');
    assert.ok(fixCommit.files.some(f => f.path === 'services/tokenBucket.js'));

    // Historical bug resolves Worker Thread Lock Starvation, not the incident itself
    assert.equal(SYNTHETIC_INCIDENT_FIXTURE.priorBug.bugTitle, 'Worker Thread Lock Starvation under High Concurrency');
    assert.equal(SYNTHETIC_INCIDENT_FIXTURE.priorBug.commitSha, '7e1d4c2b9a0f');
    assert.equal(SYNTHETIC_INCIDENT_FIXTURE.priorBug.commitRole, 'historical_fix');
  });

  it('28. Ensures an unverified current implementation cannot be described as a confirmed or tested current fix', async () => {
    let server;
    let baseUrl;
    const savedProvider = process.env.GRAPH_DATABASE_PROVIDER;
    const savedHost = process.env.FALKORDB_HOST;

    process.env.GRAPH_DATABASE_PROVIDER = 'falkordb';
    process.env.FALKORDB_HOST = 'localhost';

    setClientForTesting({
      selectGraph() {
        return {
          async query(cypher, optionsOrParams) {
            const params = optionsOrParams?.params || optionsOrParams || {};
            if (params.repoFullName && params.repoFullName !== 'acme/payment-gateway') {
              return { data: [] };
            }
            if (cypher.includes('MATCH (b:Bug')) {
              return {
                data: [
                  {
                    bugId: 'acme/payment-gateway::bug::lock-starvation-01',
                    title: 'Worker Thread Lock Starvation under High Concurrency',
                    description: 'Token bucket mutex deadlocks worker threads',
                    filePath: 'services/tokenBucket.js',
                    fixSummary: 'Enforce non-blocking tryAcquire with circuit breaker timeout',
                    fixDescription: 'Replaced unbounded while loop with bounded 250ms timeout',
                    commitSha: '7e1d4c2b9a0f',
                    commitShortSha: '7e1d4c2',
                    commitRole: 'historical_fix',
                    introducedInCommit: '8f2a1b9c0d1e2f3a',
                    isResolution: false,
                    relevanceScore: 1
                  }
                ]
              };
            }
            return { data: [] };
          },
          async roQuery(cypher, optionsOrParams) {
            return this.query(cypher, optionsOrParams);
          }
        };
      },
      async close() {}
    });

    try {
      await new Promise(resolve => {
        server = app.listen(0, () => {
          const { port } = server.address();
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });

      // 1. Call GET /api/incident/recall and assert evidence language accuracy
      const recallRes = await fetch(`${baseUrl}/api/incident/recall?repo=acme/payment-gateway&q=lock+starvation`);
      assert.equal(recallRes.status, 200);
      const recallData = await recallRes.json();
      assert.ok(recallData.recalledFix);

      // Must be classified as historical precedent, not confirmed/tested current fix
      assert.equal(recallData.recalledFix.evidenceType, 'historical_fix_precedent');
      assert.equal(recallData.recalledFix.remediationCategory, 'Recorded Historical Remediation');
      assert.equal(recallData.recalledFix.implementationStatus, 'unverified_in_current_runtime');
      assert.ok(recallData.recalledFix.verificationStatus.includes('current implementation not yet verified in live runtime'));
      assert.ok(recallData.recalledFix.verificationNote.includes('historical fix precedent'));

      // Negative assertions: must NOT claim to be confirmed or tested in current code
      assert.equal(recallData.recalledFix.verificationNote.toLowerCase().includes('confirmed, tested remediation'), false);
      assert.equal(recallData.recalledFix.verificationStatus.toLowerCase().includes('confirmed'), false);
      assert.equal(recallData.recalledFix.verificationStatus.toLowerCase().includes('tested in production'), false);

      // Verify commit roles remain strictly distinguished
      assert.equal(recallData.recalledFix.commitShortSha, '7e1d4c2');
      assert.equal(recallData.recalledFix.commitRole, 'historical_fix');
      assert.equal(recallData.recalledFix.introducedInCommit.slice(0, 7), '8f2a1b9');

      // 2. Call recordInvestigationOutcome and verify unverified runtime metadata
      const mockInvestigation = {
        repoFullName: 'acme/payment-gateway',
        incidentId: 'inc-test-01',
        title: 'Payment Gateway 504 Gateway Timeout Cascade',
        symptoms: 'HTTP 504 timeouts',
        diagnosis: {
          rootCauseFile: 'services/tokenBucket.js',
          rootCauseSymbol: 'acquireTokenLock'
        },
        recoveryRecommendation: {
          suggestedPatch: '// simulated patch'
        },
        connectedEvidence: {
          matchingCommit: { sha: '8f2a1b9c0d1e2f3a' }
        }
      };

      const recordRes = await recordInvestigationOutcome(mockInvestigation);
      assert.equal(recordRes.recorded, true);
      assert.equal(recordRes.evidenceType, 'historical_resolution_proposal');
      assert.equal(recordRes.implementationStatus, 'unverified_in_current_runtime');
      assert.ok(recordRes.verificationStatus.includes('live runtime execution unverified'));
    } finally {
      if (savedProvider !== undefined) process.env.GRAPH_DATABASE_PROVIDER = savedProvider;
      else delete process.env.GRAPH_DATABASE_PROVIDER;
      if (savedHost !== undefined) process.env.FALKORDB_HOST = savedHost;
      else delete process.env.FALKORDB_HOST;

      if (server) {
        await new Promise(resolve => server.close(resolve));
      }
    }
  });
});

describe('P0 Production Seed Verification Suite (HTTP 500 Root Cause & Resilient Status Codes)', () => {
  beforeEach(() => {
    resetFalkorDBSchemaCacheForTesting();
    setClientForTesting(null);
  });

  afterEach(() => {
    resetFalkorDBSchemaCacheForTesting();
    setClientForTesting(null);
  });

  it('1. Returns HTTP 200 and complete canonical fixture on successful seed with configured FalkorDB', async () => {
    let server;
    let baseUrl;
    const executedQueries = [];

    setClientForTesting({
      selectGraph() {
        return {
          async query(cypher, options) {
            executedQueries.push({ cypher, params: options?.params || {} });
            return { data: [] };
          }
        };
      },
      async close() {}
    });

    try {
      await new Promise(resolve => {
        server = app.listen(0, () => {
          const { port } = server.address();
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });

      const res = await fetch(`${baseUrl}/api/incident/seed`, {
        method: 'POST',
        headers: {
          'x-vercel-id': 'gs2bg-1792101692051-b137a7efb595',
          'Content-Type': 'application/json'
        }
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.seeded, true);
      assert.equal(data.graphConfigured, true);
      assert.equal(data.requestId, 'gs2bg-1792101692051-b137a7efb595');
      assert.equal(data.repository.fullName, 'acme/payment-gateway');
      assert.equal(data.incident.title, 'Payment Gateway 504 Gateway Timeout Cascade');
      assert.equal(data.misleadingSurfaceSuspect, 'services/rateLimiter.js');
      assert.ok(data.fixture, 'Must return complete fixture analysis object');
      assert.ok(executedQueries.length > 0, 'Database queries must have been executed');
    } finally {
      if (server) await new Promise(resolve => server.close(resolve));
    }
  });

  it('2. Returns HTTP 503 (GRAPH_CONFIG_MISSING) when required FalkorDB environment configuration is absent', async () => {
    let server;
    let baseUrl;

    const savedHost = process.env.FALKORDB_HOST;
    const savedUrl = process.env.FALKORDB_URL;
    const savedPort = process.env.FALKORDB_PORT;
    const savedPass = process.env.FALKORDB_PASSWORD;

    delete process.env.FALKORDB_HOST;
    delete process.env.FALKORDB_URL;
    delete process.env.FALKORDB_PORT;
    delete process.env.FALKORDB_PASSWORD;

    setClientForTesting(null);

    try {
      await new Promise(resolve => {
        server = app.listen(0, () => {
          const { port } = server.address();
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });

      const res = await fetch(`${baseUrl}/api/incident/seed`, {
        method: 'POST',
        headers: {
          'x-request-id': 'test-missing-cfg-001',
          'Content-Type': 'application/json'
        }
      });

      // Must be 503 Service Unavailable, NOT unhandled 500 and NOT fake 200
      assert.equal(res.status, 503);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.code, 'GRAPH_CONFIG_MISSING');
      assert.equal(data.stage, 'CONFIG_CHECK');
      assert.equal(data.requestId, 'test-missing-cfg-001');
      assert.ok(Array.isArray(data.missing));
      assert.ok(data.missing.includes('FALKORDB_HOST (or FALKORDB_URL)'));
      assert.ok(data.error.includes('FalkorDB is not configured'));
    } finally {
      if (savedHost !== undefined) process.env.FALKORDB_HOST = savedHost;
      if (savedUrl !== undefined) process.env.FALKORDB_URL = savedUrl;
      if (savedPort !== undefined) process.env.FALKORDB_PORT = savedPort;
      if (savedPass !== undefined) process.env.FALKORDB_PASSWORD = savedPass;

      if (server) await new Promise(resolve => server.close(resolve));
    }
  });

  it('3. Returns HTTP 503 (DATABASE_CONNECTION_FAILED) when FalkorDB connection fails (e.g. ECONNREFUSED)', async () => {
    let server;
    let baseUrl;

    // Simulate connection failure (e.g. ECONNREFUSED on AWS Lambda)
    setClientForTesting(new Error('connect ECONNREFUSED 127.0.0.1:6379'));

    try {
      await new Promise(resolve => {
        server = app.listen(0, () => {
          const { port } = server.address();
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });

      const res = await fetch(`${baseUrl}/api/incident/seed`, {
        method: 'POST',
        headers: {
          'x-vercel-id': 'gs2bg-econnrefused-repro',
          'Content-Type': 'application/json'
        }
      });

      // Must be 503 Service Unavailable with sanitized diagnostic code, NOT 500
      assert.equal(res.status, 503);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.code, 'DATABASE_CONNECTION_FAILED');
      assert.equal(data.stage, 'DB_CONNECT');
      assert.equal(data.requestId, 'gs2bg-econnrefused-repro');
      assert.ok(data.error.includes('Failed to connect to FalkorDB database'));
      assert.ok(data.error.includes('ECONNREFUSED'));
    } finally {
      if (server) await new Promise(resolve => server.close(resolve));
    }
  });

  it('4. Returns HTTP 503 (DATABASE_CONNECTION_FAILED) when ping/graph selection fails', async () => {
    let server;
    let baseUrl;

    setClientForTesting({
      selectGraph() {
        return {
          async query(cypher) {
            if (cypher.includes('RETURN 1')) {
              throw new Error('Connection reset by peer');
            }
            return { data: [] };
          }
        };
      },
      async close() {}
    });

    try {
      await new Promise(resolve => {
        server = app.listen(0, () => {
          const { port } = server.address();
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });

      const res = await fetch(`${baseUrl}/api/incident/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      assert.equal(res.status, 503);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.code, 'DATABASE_CONNECTION_FAILED');
      assert.equal(data.stage, 'DB_CONNECT');
      assert.ok(data.error.includes('FalkorDB connection verification failed'));
    } finally {
      if (server) await new Promise(resolve => server.close(resolve));
    }
  });

  it('5. Returns HTTP 502 (GRAPH_INGESTION_FAILED) when graph ingestion fails', async () => {
    let server;
    let baseUrl;

    setClientForTesting({
      selectGraph() {
        return {
          async query(cypher) {
            if (cypher.includes('RETURN 1')) {
              return { data: [{ ok: 1 }] };
            }
            if (cypher.includes('MERGE (r:Repository')) {
              throw new Error('Disk full during Cypher write');
            }
            return { data: [] };
          }
        };
      },
      async close() {}
    });

    try {
      await new Promise(resolve => {
        server = app.listen(0, () => {
          const { port } = server.address();
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });

      const res = await fetch(`${baseUrl}/api/incident/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      assert.equal(res.status, 502);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.code, 'GRAPH_INGESTION_FAILED');
      assert.equal(data.stage, 'INGEST_FIXTURE');
      assert.ok(data.error.includes('Disk full'));
    } finally {
      if (server) await new Promise(resolve => server.close(resolve));
    }
  });

  it('6. Retry/idempotency: repeated seeding succeeds and preserves canonical fixture commit roles', async () => {
    let server;
    let baseUrl;
    const executedQueries = [];

    setClientForTesting({
      selectGraph() {
        return {
          async query(cypher, options) {
            executedQueries.push({ cypher, params: options?.params || {} });
            return { data: [] };
          }
        };
      },
      async close() {}
    });

    try {
      await new Promise(resolve => {
        server = app.listen(0, () => {
          const { port } = server.address();
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });

      // Pass 1
      const res1 = await fetch(`${baseUrl}/api/incident/seed`, { method: 'POST' });
      assert.equal(res1.status, 200);
      const data1 = await res1.json();
      assert.equal(data1.success, true);
      assert.equal(data1.seeded, true);

      // Pass 2 (Retry)
      const res2 = await fetch(`${baseUrl}/api/incident/seed`, { method: 'POST' });
      assert.equal(res2.status, 200);
      const data2 = await res2.json();
      assert.equal(data2.success, true);
      assert.equal(data2.seeded, true);

      // Verify canonical fixture structure
      assert.equal(data2.repository.fullName, 'acme/payment-gateway');
      assert.equal(data2.incident.title, 'Payment Gateway 504 Gateway Timeout Cascade');
      assert.equal(data2.incident.suspectedCommit, '8f2a1b9');
      assert.equal(data2.incident.suspectedComponent, 'services/rateLimiter.js');
      assert.equal(data2.fixture.priorBug.commitSha, '7e1d4c2b9a0f');
      assert.equal(data2.fixture.priorBug.commitRole, 'historical_fix');
      assert.equal(data2.fixture.commits[0].sha, '8f2a1b9c0d1e2f3a');
      assert.equal(data2.fixture.commits[0].role, 'suspected_refactor');
      assert.equal(data2.fixture.commits[1].sha, '7e1d4c2b9a0f');
      assert.equal(data2.fixture.commits[1].role, 'historical_fix');

      // Verify cleanup was executed deterministically on both passes
      const cleanupQueries = executedQueries.filter(q => q.cypher.includes('b.title <> $priorBugTitle'));
      assert.equal(cleanupQueries.length, 2, 'Cleanup query must run on every seed call');
    } finally {
      if (server) await new Promise(resolve => server.close(resolve));
    }
  });

  it('7. Error sanitization: error response never exposes stack traces or secret credentials', async () => {
    let server;
    let baseUrl;

    setClientForTesting(new Error('Auth failed for user secret_user:SuperSecretPassword123@db.host.com'));

    try {
      await new Promise(resolve => {
        server = app.listen(0, () => {
          const { port } = server.address();
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });

      const res = await fetch(`${baseUrl}/api/incident/seed`, { method: 'POST' });
      assert.equal(res.status, 503);
      const data = await res.json();

      assert.equal(data.success, false);
      assert.equal(data.stack, undefined, 'Must not expose stack trace');
      assert.equal(JSON.stringify(data).includes('SuperSecretPassword123'), false, 'Must not expose password');
    } finally {
      setClientForTesting(null);
      if (server) await new Promise(resolve => server.close(resolve));
    }
  });
});

describe('Graph Quality Sprint: Controlled Experiment, Competing Hypotheses & Provenance Invariants', () => {
  let server;
  let baseUrl;

  before(async () => {
    setClientForTesting(null);
    await new Promise(resolve => {
      server = app.listen(0, () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    setClientForTesting(null);
    if (server) {
      server.closeAllConnections?.();
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('1. Controlled Read-Only Graph Experiment: ablating causal edge verifyToken -> acquireTokenLock eliminates root cause without mutating data', async () => {
    const reportPayload = {
      repoFullName: SYNTHETIC_INCIDENT_FIXTURE.repository.fullName,
      title: SYNTHETIC_INCIDENT_FIXTURE.incidentReport.title,
      symptoms: SYNTHETIC_INCIDENT_FIXTURE.incidentReport.symptoms,
      entryPoint: SYNTHETIC_INCIDENT_FIXTURE.incidentReport.entryPoint,
      suspectedCommit: SYNTHETIC_INCIDENT_FIXTURE.incidentReport.suspectedCommit,
      suspectedComponent: SYNTHETIC_INCIDENT_FIXTURE.incidentReport.suspectedComponent
    };

    // 1. Run controlled experiment with ablateCausalEdge
    const expRes = await fetch(`${baseUrl}/api/incident/investigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        report: reportPayload,
        analysis: SYNTHETIC_INCIDENT_FIXTURE,
        experiment: {
          ablateCausalEdge: true,
          caller: 'verifyToken',
          callee: 'acquireTokenLock'
        }
      })
    });

    assert.equal(expRes.status, 200);
    const expData = await expRes.json();

    assert.ok(expData.experiment, 'Experiment metadata must be present');
    assert.equal(expData.experiment.active, true);
    assert.notEqual(expData.diagnosis.confidence, 'HIGH', 'Confidence must drop from HIGH when causal edge is cut');
    assert.notEqual(expData.diagnosis.rootCauseSymbol, 'acquireTokenLock', 'Root cause acquireTokenLock must be unreachable');
    assert.equal(expData.connectedEvidence.connectedFiles.includes('services/tokenBucket.js'), false, 'tokenBucket.js must be disconnected');
    assert.equal(expData.diagnosis.historicalFix, null, 'Historical fix precedent must be disconnected');
  });

  it('2. Baseline Restoration: running investigation without experiment restores intact causal path with HIGH confidence', async () => {
    const reportPayload = {
      repoFullName: SYNTHETIC_INCIDENT_FIXTURE.repository.fullName,
      title: SYNTHETIC_INCIDENT_FIXTURE.incidentReport.title,
      symptoms: SYNTHETIC_INCIDENT_FIXTURE.incidentReport.symptoms,
      entryPoint: SYNTHETIC_INCIDENT_FIXTURE.incidentReport.entryPoint,
      suspectedCommit: SYNTHETIC_INCIDENT_FIXTURE.incidentReport.suspectedCommit,
      suspectedComponent: SYNTHETIC_INCIDENT_FIXTURE.incidentReport.suspectedComponent
    };

    const res = await fetch(`${baseUrl}/api/incident/investigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        report: reportPayload,
        analysis: SYNTHETIC_INCIDENT_FIXTURE
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.experiment, null, 'Experiment must be null during baseline investigation');
    assert.equal(data.diagnosis.confidence, 'HIGH', 'Confidence must be HIGH in intact graph');
    assert.equal(data.diagnosis.rootCauseSymbol, 'acquireTokenLock');
    assert.equal(data.diagnosis.rootCauseFile, 'services/tokenBucket.js');
  });

  it('3. Competing Hypotheses: decoy is correctly identified and distinguished from root cause and commit roles', async () => {
    const reportPayload = {
      repoFullName: SYNTHETIC_INCIDENT_FIXTURE.repository.fullName,
      title: SYNTHETIC_INCIDENT_FIXTURE.incidentReport.title,
      symptoms: SYNTHETIC_INCIDENT_FIXTURE.incidentReport.symptoms,
      entryPoint: SYNTHETIC_INCIDENT_FIXTURE.incidentReport.entryPoint,
      suspectedCommit: SYNTHETIC_INCIDENT_FIXTURE.incidentReport.suspectedCommit,
      suspectedComponent: SYNTHETIC_INCIDENT_FIXTURE.incidentReport.suspectedComponent
    };

    const res = await fetch(`${baseUrl}/api/incident/investigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        report: reportPayload,
        analysis: SYNTHETIC_INCIDENT_FIXTURE
      })
    });

    const data = await res.json();

    // Decoy verification
    assert.equal(data.keywordBaseline.topSuspectFile, 'services/rateLimiter.js');
    assert.ok(data.keywordBaseline.limitation.includes('Failed to traverse call edges'));

    // Suspected introducing commit vs historical remediation commit
    assert.equal(data.diagnosis.suspectedIntroducingCommit.shortSha, '8f2a1b9');
    assert.equal(data.diagnosis.suspectedIntroducingCommit.roleLabel, 'Suspected Introducing Change');

    assert.equal(data.diagnosis.historicalFix.shortSha, '7e1d4c2');
    assert.equal(data.diagnosis.historicalFix.roleLabel, 'Historical Fix Commit');
    assert.notEqual(data.diagnosis.suspectedIntroducingCommit.shortSha, data.diagnosis.historicalFix.shortSha);
  });
});

