import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runIncidentInvestigation, computeKeywordBaseline } from '../server/ai/investigation.js';
import { generateDeterministicSummary } from '../server/ai/provider.js';

export const ECOMMERCE_ORDER_FIXTURE = Object.freeze({
  repository: {
    fullName: 'ecommerce/order-service',
    owner: 'ecommerce',
    repo: 'order-service',
    branch: 'main',
    primaryLanguage: 'JavaScript',
    description: 'Order processing and inventory reservation service'
  },
  aiContextReady: {
    filePaths: [
      'src/api/checkout.js',
      'src/services/inventory.js',
      'src/db/stockMutex.js',
      'src/utils/logger.js'
    ]
  },
  incidentReport: {
    id: 'inc-order-deadlock-99',
    repoFullName: 'ecommerce/order-service',
    title: 'Order Checkout Deadlock on /api/checkout',
    symptoms: 'HTTP 500 downstream payment deadlock when reserving stock under high concurrency',
    entryPoint: 'src/api/checkout.js',
    suspectedCommit: 'c4f1a2b',
    suspectedComponent: 'src/utils/logger.js'
  },
  graphContext: {
    symbols: [
      {
        id: 'ecommerce/order-service::src/api/checkout.js::handleCheckout',
        name: 'handleCheckout',
        kind: 'function',
        filePath: 'src/api/checkout.js',
        startLine: 10,
        endLine: 40,
        callsSymbols: ['reserveStock']
      },
      {
        id: 'ecommerce/order-service::src/services/inventory.js::reserveStock',
        name: 'reserveStock',
        kind: 'function',
        filePath: 'src/services/inventory.js',
        startLine: 15,
        endLine: 50,
        callsSymbols: ['acquireItemLock']
      },
      {
        id: 'ecommerce/order-service::src/db/stockMutex.js::acquireItemLock',
        name: 'acquireItemLock',
        kind: 'function',
        filePath: 'src/db/stockMutex.js',
        startLine: 5,
        endLine: 35,
        callsSymbols: []
      }
    ],
    recentCommits: [
      {
        sha: 'c4f1a2b8e9d01234',
        shortSha: 'c4f1a2b',
        message: 'Add transactional item lock in stockMutex.js',
        author: 'engineer-bob',
        date: '2026-10-01T12:00:00Z',
        changedFiles: ['src/db/stockMutex.js']
      }
    ],
    bugsAndFixes: [
      {
        bugId: 'ecommerce/order-service::bug::deadlock-order-01',
        title: 'Stock Lock Deadlock Bug #402',
        description: 'Out-of-order mutex acquisition caused worker deadlocks',
        filePath: 'src/db/stockMutex.js',
        fixSummary: 'Use ordered lock acquisition with circuit breaker',
        commitSha: 'd3a4b5c7e8f9',
        commitShortSha: 'd3a4b5c',
        commitRole: 'historical_fix',
        isResolution: false
      }
    ]
  }
});

export const PAYMENT_GATEWAY_FIXTURE = Object.freeze({
  repository: {
    fullName: 'acme/payment-gateway',
    owner: 'acme',
    repo: 'payment-gateway',
    branch: 'main',
    primaryLanguage: 'JavaScript',
    description: 'High-throughput payment gateway'
  },
  aiContextReady: {
    filePaths: [
      'server/routes/pay.js',
      'services/rateLimiter.js',
      'services/auth.js',
      'services/tokenBucket.js'
    ]
  },
  incidentReport: {
    id: 'inc-pay-504-01',
    repoFullName: 'acme/payment-gateway',
    title: 'Payment Gateway 504 Gateway Timeout Cascade',
    symptoms: 'HTTP 504 Gateway Timeout on /api/pay immediately following deployment of commit 8f2a1b9',
    entryPoint: 'server/routes/pay.js',
    suspectedCommit: '8f2a1b9',
    suspectedComponent: 'services/rateLimiter.js'
  },
  graphContext: {
    symbols: [
      {
        id: 'acme/payment-gateway::server/routes/pay.js::handlePaymentRequest',
        name: 'handlePaymentRequest',
        kind: 'function',
        filePath: 'server/routes/pay.js',
        startLine: 12,
        endLine: 45,
        callsSymbols: ['verifyToken']
      },
      {
        id: 'acme/payment-gateway::services/auth.js::verifyToken',
        name: 'verifyToken',
        kind: 'function',
        filePath: 'services/auth.js',
        startLine: 15,
        endLine: 38,
        callsSymbols: ['acquireTokenLock']
      },
      {
        id: 'acme/payment-gateway::services/tokenBucket.js::acquireTokenLock',
        name: 'acquireTokenLock',
        kind: 'function',
        filePath: 'services/tokenBucket.js',
        startLine: 54,
        endLine: 88,
        callsSymbols: []
      }
    ],
    recentCommits: [
      {
        sha: '8f2a1b9c0d1e2f3a',
        shortSha: '8f2a1b9',
        message: 'Refactor mutex synchronization',
        author: 'dev-bob',
        date: '2026-09-15T08:30:00Z',
        changedFiles: ['services/tokenBucket.js']
      }
    ],
    bugsAndFixes: [
      {
        bugId: 'acme/payment-gateway::bug::lock-starvation-01',
        title: 'Worker Thread Lock Starvation',
        description: 'Synchronous blocking mutex triggers 504 timeout cascade',
        filePath: 'services/tokenBucket.js',
        fixSummary: 'Enforce non-blocking tryAcquire with circuit breaker timeout',
        commitSha: '7e1d4c2b9a0f',
        commitShortSha: '7e1d4c2',
        commitRole: 'historical_fix',
        isResolution: false
      }
    ]
  }
});

describe('Repository Isolation & Non-Identical Diagnosis Suite', () => {
  it('1. Two different repositories produce completely different graph evidence and diagnoses', async () => {
    // Investigate Repo A (Payment Gateway)
    const outcomeA = await runIncidentInvestigation(
      PAYMENT_GATEWAY_FIXTURE.incidentReport,
      PAYMENT_GATEWAY_FIXTURE,
      { graphContext: PAYMENT_GATEWAY_FIXTURE.graphContext, isDemo: true }
    );

    // Investigate Repo B (Ecommerce Order Service)
    const outcomeB = await runIncidentInvestigation(
      ECOMMERCE_ORDER_FIXTURE.incidentReport,
      ECOMMERCE_ORDER_FIXTURE,
      { graphContext: ECOMMERCE_ORDER_FIXTURE.graphContext, isDemo: false }
    );

    // Verify Repo A Diagnosis
    assert.equal(outcomeA.repoFullName, 'acme/payment-gateway');
    assert.equal(outcomeA.diagnosis.rootCauseSymbol, 'acquireTokenLock');
    assert.equal(outcomeA.diagnosis.rootCauseFile, 'services/tokenBucket.js');
    assert.equal(outcomeA.suspectedIntroducingCommit.shortSha, '8f2a1b9');
    assert.equal(outcomeA.historicalFix.commitShortSha, '7e1d4c2');
    assert.ok(outcomeA.diagnosis.text.includes('acquireTokenLock'));

    // Verify Repo B Diagnosis
    assert.equal(outcomeB.repoFullName, 'ecommerce/order-service');
    assert.equal(outcomeB.diagnosis.rootCauseSymbol, 'acquireItemLock');
    assert.equal(outcomeB.diagnosis.rootCauseFile, 'src/db/stockMutex.js');
    assert.equal(outcomeB.suspectedIntroducingCommit.shortSha, 'c4f1a2b');
    assert.equal(outcomeB.historicalFix.commitShortSha, 'd3a4b5c');
    assert.ok(outcomeB.diagnosis.text.includes('acquireItemLock'));

    // Strict Cross-Contamination Invariant: Repo B must have NO Repo A symbols or commits
    assert.equal(outcomeB.diagnosis.text.includes('acquireTokenLock'), false);
    assert.equal(outcomeB.diagnosis.text.includes('services/tokenBucket.js'), false);
    assert.equal(outcomeB.diagnosis.text.includes('8f2a1b9'), false);
    assert.equal(outcomeB.diagnosis.text.includes('7e1d4c2'), false);
    assert.equal(outcomeB.diagnosis.text.includes('Worker Thread Lock Starvation'), false);

    // Strict Cross-Contamination Invariant: Repo A must have NO Repo B symbols or commits
    assert.equal(outcomeA.diagnosis.text.includes('acquireItemLock'), false);
    assert.equal(outcomeA.diagnosis.text.includes('src/db/stockMutex.js'), false);
    assert.equal(outcomeA.diagnosis.text.includes('c4f1a2b'), false);
    assert.equal(outcomeA.diagnosis.text.includes('d3a4b5c'), false);
  });

  it('2. Keyword baseline is repository-specific and does not hardcode payment rate-limit terms', () => {
    const baselineB = outcomeKeywordBaseline(
      ECOMMERCE_ORDER_FIXTURE.incidentReport,
      ECOMMERCE_ORDER_FIXTURE
    );

    assert.ok(!baselineB.suspectedRootCause.includes('rate limit'));
    assert.ok(!baselineB.suspectedRootCause.includes('504'));
    assert.ok(
      baselineB.suspectedRootCause.includes('checkout') ||
      baselineB.suspectedRootCause.includes('deadlock') ||
      baselineB.suspectedRootCause.includes('src/utils/logger.js')
    );
  });

  it('3. An unindexed real repository yields INSUFFICIENT_EVIDENCE without fabricating demo symbols or commits', async () => {
    const unindexedReport = {
      id: 'inc-unindexed-01',
      repoFullName: 'myorg/unindexed-service',
      title: 'Crash in user authentication',
      symptoms: 'Process terminated with SIGSEGV in auth handler',
      entryPoint: 'src/main.go',
      suspectedCommit: 'a1b2c3d'
    };

    const outcome = await runIncidentInvestigation(
      unindexedReport,
      { repository: { fullName: 'myorg/unindexed-service' }, aiContextReady: { filePaths: ['src/main.go'] } },
      { graphContext: { symbols: [], recentCommits: [], bugsAndFixes: [] }, isDemo: false }
    );

    assert.equal(outcome.diagnosis.confidence, 'INSUFFICIENT_EVIDENCE');
    assert.equal(outcome.diagnosis.rootCauseSymbol, 'unknown');
    assert.equal(outcome.diagnosis.rootCauseFile, 'unknown');
    assert.equal(outcome.historicalFix, null);
    assert.ok(outcome.diagnosis.text.includes('Insufficient Evidence Warning'));
    assert.equal(outcome.diagnosis.text.includes('acquireTokenLock'), false);
    assert.equal(outcome.diagnosis.text.includes('7e1d4c2'), false);
    assert.equal(outcome.diagnosis.text.includes('Worker Thread Lock Starvation'), false);
  });

  it('4. Deterministic summary fallback generates distinct truthful output for different repositories', () => {
    const fallbackA = generateDeterministicSummary({
      investigation: {
        repoFullName: 'acme/payment-gateway',
        ...PAYMENT_GATEWAY_FIXTURE.incidentReport,
        connectedEvidence: {
          evidenceChain: [
            { type: 'ENTRYPOINT_SYMBOL', details: 'API Entrypoint handlePaymentRequest in server/routes/pay.js' },
            { type: 'SYMBOL_CALLS_SYMBOL', details: 'handlePaymentRequest calls acquireTokenLock' }
          ]
        },
        diagnosis: {
          rootCauseSymbol: 'acquireTokenLock',
          rootCauseFile: 'services/tokenBucket.js',
          confidence: 'HIGH'
        },
        suspectedIntroducingCommit: { shortSha: '8f2a1b9', message: 'Refactor mutex' },
        historicalFix: { commitShortSha: '7e1d4c2', title: 'Worker Thread Lock Starvation', summary: 'Enforce timeout' }
      }
    }, { isDemo: true });

    const fallbackB = generateDeterministicSummary({
      investigation: {
        repoFullName: 'ecommerce/order-service',
        ...ECOMMERCE_ORDER_FIXTURE.incidentReport,
        connectedEvidence: {
          evidenceChain: [
            { type: 'ENTRYPOINT_SYMBOL', details: 'API Entrypoint handleCheckout in src/api/checkout.js' },
            { type: 'SYMBOL_CALLS_SYMBOL', details: 'handleCheckout calls acquireItemLock in src/db/stockMutex.js' }
          ]
        },
        diagnosis: {
          rootCauseSymbol: 'acquireItemLock',
          rootCauseFile: 'src/db/stockMutex.js',
          confidence: 'HIGH'
        },
        suspectedIntroducingCommit: { shortSha: 'c4f1a2b', message: 'Add item lock' },
        historicalFix: { commitShortSha: 'd3a4b5c', title: 'Deadlock Fix', summary: 'Ordered locks' }
      }
    }, { isDemo: false });

    assert.ok(fallbackA.includes('acquireTokenLock'));
    assert.ok(fallbackA.includes('8f2a1b9'));
    assert.ok(fallbackA.includes('7e1d4c2'));

    assert.ok(fallbackB.includes('acquireItemLock'));
    assert.ok(fallbackB.includes('c4f1a2b'));
    assert.ok(fallbackB.includes('d3a4b5c'));

    assert.equal(fallbackB.includes('acquireTokenLock'), false);
    assert.equal(fallbackB.includes('8f2a1b9'), false);
    assert.equal(fallbackB.includes('7e1d4c2'), false);
  });
});

function outcomeKeywordBaseline(report, analysis) {
  return computeKeywordBaseline(report, analysis);
}
