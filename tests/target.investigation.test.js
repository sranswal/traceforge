import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runPrReviewInvestigation,
  runIssueDiagnosisInvestigation,
  runIncidentInvestigation,
  parseDiffText
} from '../server/ai/investigation.js';
import { MOCK_REPOSITORIES } from '../server/providers/mock.js';

describe('Target-Aware Investigation Workspace: PR Review & Issue Diagnosis Suite', () => {
  it('1. parseDiffText accurately parses diff headers, hunk line ranges, additions, and deletions', () => {
    const rawDiff = `diff --git a/services/auth.js b/services/auth.js
--- a/services/auth.js
+++ b/services/auth.js
@@ -10,3 +10,5 @@
-  const token = verifyOldToken(header);
+  const token = await verifyNewToken(header, { timeout: 1000 });
+  if (!token) throw new AuthError();
`;
    const parsed = parseDiffText(rawDiff);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].filename, 'services/auth.js');
    assert.equal(parsed[0].additions, 2);
    assert.equal(parsed[0].deletions, 1);
    assert.equal(parsed[0].hunks.length, 1);
    assert.equal(parsed[0].hunks[0].oldStart, 10);
    assert.equal(parsed[0].hunks[0].newStart, 10);
  });

  it('2. PR review on acme/payment-gateway maps diff to affected symbols, callers, and missing tests', async () => {
    const mockRepo = MOCK_REPOSITORIES['acme/payment-gateway'];
    const pr = mockRepo.pullRequests[0];
    const diff = mockRepo.prDiff;

    const analysis = {
      repository: mockRepo.metadata,
      aiContextReady: { filePaths: ['services/tokenBucket.js', 'services/auth.js', 'server/routes/pay.js'] }
    };

    const graphContext = {
      symbols: [
        {
          name: 'acquireTokenLock',
          filePath: 'services/tokenBucket.js',
          startLine: 40,
          endLine: 60,
          callsSymbols: []
        },
        {
          name: 'verifyToken',
          filePath: 'services/auth.js',
          startLine: 10,
          endLine: 25,
          callsSymbols: ['acquireTokenLock']
        }
      ],
      callers: [
        {
          caller: 'verifyToken',
          callerFile: 'services/auth.js',
          callee: 'acquireTokenLock',
          calleeFile: 'services/tokenBucket.js'
        }
      ],
      bugsAndFixes: [
        {
          bugId: 'bug-01',
          title: 'Worker Thread Lock Starvation',
          filePath: 'services/tokenBucket.js',
          fixSummary: 'Enforce non-blocking tryAcquire with circuit breaker timeout',
          commitSha: '7e1d4c2'
        }
      ]
    };

    const result = await runIncidentInvestigation(
      {
        targetType: 'pr',
        repoFullName: 'acme/payment-gateway',
        prNumber: pr.number,
        title: pr.title,
        baseBranch: pr.base,
        headBranch: pr.head,
        changedFiles: diff.changedFiles,
        diff: diff.rawDiff
      },
      analysis,
      { graphContext }
    );

    assert.equal(result.targetType, 'pr');
    assert.equal(result.prNumber, 12);
    assert.equal(result.repoFullName, 'acme/payment-gateway');
    assert.equal(result.affectedSymbols.length, 1);
    assert.equal(result.affectedSymbols[0].symbolName, 'acquireTokenLock');

    // Regression risk caller detection
    assert.equal(result.potentialRegressionCallers.length, 1);
    assert.equal(result.potentialRegressionCallers[0].callerSymbol, 'verifyToken');
    assert.equal(result.potentialRegressionCallers[0].callerFile, 'services/auth.js');

    // Missing test detection (acquireTokenLock has 0 covering tests)
    assert.equal(result.missingTestCoverage.length, 1);
    assert.equal(result.missingTestCoverage[0].symbolName, 'acquireTokenLock');

    // Historical fix correlation
    assert.ok(result.historicalFix);
    assert.equal(result.historicalFix.commitSha, '7e1d4c2');

    // Scientific qualification: never claim tests passed or runtime reproduced
    const unverifiedText = result.diagnosis.unverifiedClaims.join(' ');
    assert.ok(unverifiedText.includes('Unverified'));
    assert.ok(unverifiedText.includes('dynamic test runners') || unverifiedText.includes('test'));
  });

  it('3. PR review on ecommerce/order-service produces distinct target evidence without leakage', async () => {
    const mockRepo = MOCK_REPOSITORIES['ecommerce/order-service'];
    const pr = mockRepo.pullRequests[0];
    const diff = mockRepo.prDiff;

    const analysis = {
      repository: mockRepo.metadata,
      aiContextReady: { filePaths: ['src/controllers/checkoutController.ts', 'src/services/redis.ts'] }
    };

    const graphContext = {
      symbols: [
        {
          name: 'handleCheckout',
          filePath: 'src/controllers/checkoutController.ts',
          startLine: 15,
          endLine: 45,
          callsSymbols: ['redisLock']
        }
      ],
      callers: [
        {
          caller: 'orderRouter',
          callerFile: 'src/routes/orderRoutes.ts',
          callee: 'handleCheckout',
          calleeFile: 'src/controllers/checkoutController.ts'
        }
      ],
      bugsAndFixes: []
    };

    const result = await runIncidentInvestigation(
      {
        targetType: 'pr',
        repoFullName: 'ecommerce/order-service',
        prNumber: pr.number,
        title: pr.title,
        baseBranch: pr.base,
        headBranch: pr.head,
        changedFiles: diff.changedFiles,
        diff: diff.rawDiff
      },
      analysis,
      { graphContext }
    );

    assert.equal(result.targetType, 'pr');
    assert.equal(result.prNumber, 44);
    assert.equal(result.repoFullName, 'ecommerce/order-service');
    assert.equal(result.affectedSymbols[0].symbolName, 'handleCheckout');
    assert.equal(result.potentialRegressionCallers[0].callerSymbol, 'orderRouter');

    // Strict repository isolation: zero acme/payment-gateway facts
    const jsonStr = JSON.stringify(result);
    assert.equal(jsonStr.includes('tokenBucket'), false);
    assert.equal(jsonStr.includes('acquireTokenLock'), false);
    assert.equal(jsonStr.includes('8f2a1b9'), false);
    assert.equal(jsonStr.includes('7e1d4c2'), false);
  });

  it('4. Issue diagnosis correlates issue tokens with repository symbols and historical fixes', async () => {
    const mockRepo = MOCK_REPOSITORIES['acme/payment-gateway'];
    const issue = mockRepo.issues[0];

    const analysis = {
      repository: mockRepo.metadata,
      aiContextReady: { filePaths: ['services/tokenBucket.js', 'services/rateLimiter.js'] }
    };

    const graphContext = {
      symbols: [
        {
          name: 'acquireTokenLock',
          filePath: 'services/tokenBucket.js',
          startLine: 40,
          endLine: 60
        }
      ],
      bugsAndFixes: [
        {
          bugId: 'bug-01',
          title: 'Worker Thread Lock Starvation',
          description: 'Synchronous lock spin in tokenBucket.js',
          filePath: 'services/tokenBucket.js',
          fixSummary: 'Enforce non-blocking tryAcquire with circuit breaker timeout',
          commitSha: '7e1d4c2'
        }
      ]
    };

    const result = await runIncidentInvestigation(
      {
        targetType: 'issue',
        repoFullName: 'acme/payment-gateway',
        issueNumber: issue.number,
        title: issue.title,
        description: issue.body,
        comments: ['Observed on production payment cluster during traffic burst']
      },
      analysis,
      { graphContext }
    );

    assert.equal(result.targetType, 'issue');
    assert.equal(result.issueNumber, 101);
    assert.equal(result.repoFullName, 'acme/payment-gateway');
    assert.ok(result.correlatedFiles.includes('services/tokenBucket.js'));
    assert.ok(result.historicalFix);
    assert.equal(result.historicalFix.commitSha, '7e1d4c2');

    // Unverified claim boundary
    const unverifiedText = result.diagnosis.unverifiedClaims.join(' ');
    assert.ok(unverifiedText.includes('Unverified'));
    assert.ok(unverifiedText.includes('reproduction') || unverifiedText.includes('Reproduction'));
  });

  it('5. PR review correctly identifies covering tests when test files call modified symbols', async () => {
    const analysis = {
      repository: { fullName: 'my-org/my-service' },
      aiContextReady: { filePaths: ['src/math.js', 'test/math.test.js'] }
    };

    const graphContext = {
      symbols: [
        {
          name: 'calculateTax',
          filePath: 'src/math.js',
          startLine: 1,
          endLine: 20
        }
      ],
      callers: [
        {
          caller: 'testCalculateTax',
          callerFile: 'test/math.test.js',
          callee: 'calculateTax',
          calleeFile: 'src/math.js'
        }
      ],
      bugsAndFixes: []
    };

    const result = await runPrReviewInvestigation(
      {
        targetType: 'pr',
        repoFullName: 'my-org/my-service',
        title: 'Update tax calculation logic',
        changedFiles: [{ filename: 'src/math.js', additions: 5, deletions: 1, status: 'modified' }]
      },
      analysis,
      { graphContext }
    );

    assert.equal(result.targetType, 'pr');
    assert.equal(result.missingTestCoverage.length, 0, 'Should have 0 missing test coverage');
    assert.equal(result.coveringTests.length, 1, 'Should find 1 covering test');
    assert.equal(result.coveringTests[0].symbolName, 'calculateTax');
    assert.equal(result.coveringTests[0].tests[0].testFile, 'test/math.test.js');
  });

  it('6. Strict truth boundaries: All target investigations prohibit fabricating runtime reproduction or dynamic tests', async () => {
    const prResult = await runPrReviewInvestigation(
      {
        targetType: 'pr',
        repoFullName: 'test-org/repo-a',
        title: 'PR #1 Test',
        changedFiles: [{ filename: 'index.js', additions: 1, deletions: 0 }]
      },
      { repository: { fullName: 'test-org/repo-a' } },
      { graphContext: { symbols: [], callers: [], bugsAndFixes: [] } }
    );

    const issueResult = await runIssueDiagnosisInvestigation(
      {
        targetType: 'issue',
        repoFullName: 'test-org/repo-a',
        title: 'Issue #1 Test',
        description: 'Testing truth boundary enforcement'
      },
      { repository: { fullName: 'test-org/repo-a' } },
      { graphContext: { symbols: [], callers: [], bugsAndFixes: [] } }
    );

    for (const res of [prResult, issueResult]) {
      const allText = JSON.stringify(res.diagnosis);
      assert.equal(allText.includes('True Root Cause'), false, 'Prohibited term: True Root Cause');
      assert.equal(allText.includes('Confirmed Root Cause'), false, 'Prohibited term: Confirmed Root Cause');
      assert.ok(res.diagnosis.unverifiedClaims.length >= 2, 'Must include explicit unverified claims');
      assert.ok(
        res.diagnosis.unverifiedClaims.some(c => c.toLowerCase().includes('unverified')),
        'Must explicitly state unverified claims'
      );
    }
  });

  it('7. Client tab IncidentInvestigationTab.jsx includes all 3 investigation modes and target inputs', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('./client/src/components/Tabs/IncidentInvestigationTab.jsx', 'utf8');

    assert.ok(content.includes("'pr'"), 'Must support PR mode');
    assert.ok(content.includes("'issue'"), 'Must support Issue mode');
    assert.ok(content.includes("'bug'"), 'Must support Bug mode');
    assert.ok(content.includes('availablePrs'), 'Must bind available PRs');
    assert.ok(content.includes('availableIssues'), 'Must bind available Issues');
    assert.ok(content.includes('prDiff'), 'Must include PR diff input');
    assert.ok(content.includes('potentialRegressionCallers'), 'Must render regression callers');
    assert.ok(content.includes('missingTestCoverage'), 'Must render missing test coverage');
  });
});
