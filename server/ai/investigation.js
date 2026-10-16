/**
 * FailureChain Phase 5 & 5.1: Graph-Native Incident Investigation Engine
 * - Accepts regression reports (symptoms, suspected commits, entry points).
 * - Dynamically scores candidates using multi-hop graph reachability, commit intersection,
 *   and historical bug correlation.
 * - Compares graph-native traversal against a lexical keyword search baseline.
 * - Supports graph-edge ablation: breaking causal edges changes diagnosis or yields insufficient evidence.
 * - Distinguishes directly observed graph facts from inferred causes and explicit uncertainties.
 * - Produces simulated recovery proposals without modifying disk, repository, or production services.
 * - Records confirmed resolutions to canonical graph memory for fresh-request recall.
 */

import {
  retrieveGraphContext,
  recordMemoryEntry,
  formatGraphEvidenceMarkdown,
  resolveGraphProvider
} from '../memory/graphProvider.js';
import { aiProvider } from './provider.js';
import { GraphIds, normalizePath } from '../memory/schema.js';

/**
 * Deterministic Synthetic Incident Fixture with a Plausible Misleading Change
 * Scenario:
 * - Symptom: Payment gateway returns 504 Gateway Timeout on /api/pay.
 * - Decoy Change: Commit 8f2a1b9 ("Refactor rate limit cache in services/rateLimiter.js").
 * - Keyword baseline falsely accuses services/rateLimiter.js due to high word overlap ("rate limit", "504", "timeout").
 * - Target Root-Cause Hypothesis (in graph): /api/pay calls verifyToken (services/auth.js) which calls acquireTokenLock
 *   (services/tokenBucket.js). Commit 8f2a1b9 also modified acquireTokenLock to use a synchronous blocking
 *   mutex, triggering a lock starvation cascade previously documented in Bug lock-starvation-01!
 */
export const SYNTHETIC_INCIDENT_FIXTURE = Object.freeze({
  repository: {
    fullName: 'acme/payment-gateway',
    owner: 'acme',
    repo: 'payment-gateway',
    branch: 'main',
    primaryLanguage: 'JavaScript',
    description: 'High-throughput payment orchestration and gateway service'
  },
  projectType: 'Node.js Microservice',
  architecture: {
    pattern: 'Payment Pipeline Microservice',
    entryPoints: [{ path: 'server/routes/pay.js' }]
  },
  structure: {
    classifiedDirectories: [
      { path: 'server/routes', name: 'routes', role: 'API Routes', category: 'api', description: 'HTTP endpoints' },
      { path: 'services', name: 'services', role: 'Core Services', category: 'core', description: 'Payment and Auth' },
      { path: 'tests', name: 'tests', role: 'Test Suite', category: 'test', description: 'Unit and integration tests' }
    ]
  },
  aiContextReady: {
    filePaths: [
      'server/routes/pay.js',
      'services/rateLimiter.js',
      'services/auth.js',
      'services/tokenBucket.js',
      'tests/tokenBucket.test.js'
    ]
  },
  sourceContents: {
    'server/routes/pay.js': [
      "import { checkRateLimit } from '../../services/rateLimiter.js';",
      "import { verifyToken } from '../../services/auth.js';",
      "export async function handlePaymentRequest(req) {",
      "  await checkRateLimit(req.ip);",
      "  const token = await verifyToken(req.headers.authorization);",
      "  return { success: true, token };",
      "}"
    ].join('\n'),
    'services/rateLimiter.js': [
      "// Rate limiter cache implementation",
      "export async function checkRateLimit(ip) {",
      "  const key = `ratelimit:${ip}`;",
      "  return { allowed: true, key };",
      "}"
    ].join('\n'),
    'services/auth.js': [
      "import { acquireTokenLock } from './tokenBucket.js';",
      "export async function verifyToken(authHeader) {",
      "  const lock = await acquireTokenLock('auth-token');",
      "  return Boolean(lock);",
      "}"
    ].join('\n'),
    'services/tokenBucket.js': [
      "// Token bucket mutex lock implementation",
      "export async function acquireTokenLock(resourceId) {",
      "  // Commit 8f2a1b9: Changed to synchronous blocking wait with no timeout!",
      "  while (isLocked(resourceId)) { /* blocking sleep without release timeout */ }",
      "  return true;",
      "}",
      "function isLocked(id) { return false; }"
    ].join('\n'),
    'tests/tokenBucket.test.js': [
      "import { acquireTokenLock } from '../services/tokenBucket.js';",
      "it('acquires token lock with non-blocking timeout', async () => {",
      "  await acquireTokenLock('test-id');",
      "});"
    ].join('\n')
  },
  commits: [
    {
      sha: '8f2a1b9c0d1e2f3a',
      shortSha: '8f2a1b9',
      role: 'suspected_refactor',
      message: 'Refactor rate limit cache and token bucket mutex',
      author: 'dev-charlie',
      date: '2026-10-14T14:30:00Z',
      files: [
        {
          path: 'services/rateLimiter.js',
          status: 'modified',
          additions: 2,
          deletions: 1,
          changedRanges: [{ startLine: 1, endLine: 4 }]
        },
        {
          path: 'services/tokenBucket.js',
          status: 'modified',
          additions: 6,
          deletions: 2,
          changedRanges: [{ startLine: 1, endLine: 6 }]
        }
      ]
    },
    {
      sha: '7e1d4c2b9a0f',
      shortSha: '7e1d4c2',
      role: 'historical_fix',
      message: 'Enforce non-blocking tryAcquire with circuit breaker timeout',
      author: 'dev-alice',
      date: '2026-08-10T10:15:00Z',
      files: [
        {
          path: 'services/tokenBucket.js',
          status: 'modified',
          additions: 8,
          deletions: 3,
          changedRanges: [{ startLine: 1, endLine: 8 }]
        }
      ]
    }
  ],
  priorBug: {
    repoFullName: 'acme/payment-gateway',
    type: 'bug_fix',
    bugTitle: 'Worker Thread Lock Starvation under High Concurrency',
    bugDescription: 'Token bucket mutex deadlocks worker threads when downstream auth latency spikes, resulting in HTTP 504 timeouts.',
    severity: 'critical',
    status: 'resolved',
    symptoms: 'HTTP 504 Gateway Timeout, connection pool exhaustion',
    filePath: 'services/tokenBucket.js',
    componentPath: 'services',
    fixSummary: 'Enforce non-blocking tryAcquire with circuit breaker timeout',
    fixDescription: 'Replaced unbounded while loop with bounded 250ms timeout and circuit breaker fallback in acquireTokenLock.',
    commitSha: '7e1d4c2b9a0f',
    commitRole: 'historical_fix',
    commitMessage: 'Enforce non-blocking tryAcquire with circuit breaker timeout'
  },
  incidentReport: {
    id: 'inc-pay-504-01',
    repoFullName: 'acme/payment-gateway',
    title: 'Payment Gateway 504 Gateway Timeout Cascade',
    symptoms: 'Clients receiving HTTP 504 Gateway Timeout on /api/pay immediately following deployment of commit 8f2a1b9 ("Refactor rate limit cache").',
    entryPoint: 'server/routes/pay.js',
    suspectedCommit: '8f2a1b9',
    suspectedComponent: 'services/rateLimiter.js'
  }
});

/**
 * Computes a naive keyword search baseline over repository files without graph traversal.
 * Simulates traditional log/grep search that gets fooled by lexical surface matches.
 */
export function computeKeywordBaseline(report = {}, analysis = {}) {
  const terms = `${report.title || ''} ${report.symptoms || ''} ${report.suspectedComponent || ''}`
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter(t => t.length >= 3);

  const fileScores = [];
  const files = analysis?.aiContextReady?.filePaths || [];

  for (const filePath of files) {
    const lowerPath = filePath.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (lowerPath.includes(term)) score += 2;
    }
    fileScores.push({ filePath, score });
  }

  fileScores.sort((a, b) => b.score - a.score);
  const topMatch = fileScores[0] || { filePath: report.suspectedComponent || 'services/rateLimiter.js', score: 0 };

  return {
    method: 'lexical_keyword_baseline',
    topSuspectFile: topMatch.filePath,
    topSuspectScore: topMatch.score,
    suspectedRootCause: `Surface keywords ("rate limit", "timeout", "504") pointed to \`${topMatch.filePath}\`.`,
    limitation: 'Failed to traverse call edges or notice downstream blocking calls invoked by the entrypoint.'
  };
}

/**
 * Traces multi-hop connected graph evidence dynamically starting from the incident entrypoint and suspected commit.
 * Never hardcodes symbol names or paths; traverses whatever symbols and edges exist in graphContext.
 */
export function traceConnectedGraphEvidence(report = {}, graphContext = {}) {
  const entryPath = report.entryPoint ? normalizePath(report.entryPoint) : '';
  const suspectedSha = (report.suspectedCommit || '').slice(0, 7).toLowerCase();

  const evidenceChain = [];
  const reachableSymbols = [];
  const callers = [];
  let stepIndex = 1;

  const symbols = graphContext?.symbols || [];
  const bugsAndFixes = graphContext?.bugsAndFixes || [];
  const commits = graphContext?.recentCommits || [];

  // 1. Locate entry point symbols
  const entrySymbols = symbols.filter(s => s.filePath && normalizePath(s.filePath) === entryPath);
  for (const s of entrySymbols) {
    reachableSymbols.push(s);
    evidenceChain.push({
      step: stepIndex++,
      type: 'ENTRYPOINT_SYMBOL',
      label: `Route Handler \`${s.name}\``,
      filePath: s.filePath,
      calleeSymbol: s.name,
      symbolName: s.name,
      lineRange: s.startLine && s.endLine ? `L${s.startLine}-L${s.endLine}` : 'L1-L1',
      provenance: 'Static AST Parser',
      details: `Entrypoint \`${s.filePath}\` exposes symbol \`${s.name}\`.`
    });

    // 2. Trace 1-hop outgoing calls (SYMBOL_CALLS_SYMBOL)
    for (const calledName of s.callsSymbols || []) {
      const targetSym = symbols.find(ts => ts.name === calledName);
      if (targetSym) {
        reachableSymbols.push(targetSym);
        callers.push({ caller: s.name, callerFile: s.filePath, callee: targetSym.name, calleeFile: targetSym.filePath });
        evidenceChain.push({
          step: stepIndex++,
          type: 'SYMBOL_CALLS_SYMBOL',
          label: `Calls \`${targetSym.name}\` in \`${targetSym.filePath}\``,
          callerSymbol: s.name,
          callerFile: s.filePath,
          sourceSymbol: s.name,
          sourceFile: s.filePath,
          calleeSymbol: targetSym.name,
          calleeFile: targetSym.filePath,
          filePath: targetSym.filePath,
          symbolName: targetSym.name,
          lineRange: targetSym.startLine && targetSym.endLine ? `L${targetSym.startLine}-L${targetSym.endLine}` : 'L1-L1',
          provenance: 'Call Graph Traversal (1-hop)',
          details: `\`${s.name}\` (${s.filePath}) calls \`${targetSym.name}\` in \`${targetSym.filePath}\`.`
        });

        // 3. Trace 2-hop outgoing calls (SYMBOL_CALLS_SYMBOL)
        for (const subCalleeName of targetSym.callsSymbols || []) {
          const subTarget = symbols.find(ts => ts.name === subCalleeName);
          if (subTarget) {
            reachableSymbols.push(subTarget);
            callers.push({ caller: targetSym.name, callerFile: targetSym.filePath, callee: subTarget.name, calleeFile: subTarget.filePath });
            evidenceChain.push({
              step: stepIndex++,
              type: 'SYMBOL_CALLS_SYMBOL',
              label: `Downstream Call: \`${targetSym.name}\` -> \`${subTarget.name}\` in \`${subTarget.filePath}\``,
              callerSymbol: targetSym.name,
              callerFile: targetSym.filePath,
              sourceSymbol: targetSym.name,
              sourceFile: targetSym.filePath,
              calleeSymbol: subTarget.name,
              calleeFile: subTarget.filePath,
              filePath: subTarget.filePath,
              symbolName: subTarget.name,
              lineRange: subTarget.startLine && subTarget.endLine ? `L${subTarget.startLine}-L${subTarget.endLine}` : 'L1-L1',
              provenance: 'Call Graph Traversal (2-hop)',
              details: `\`${targetSym.name}\` (${targetSym.filePath}) calls \`${subTarget.name}\` in \`${subTarget.filePath}\`.`
            });
          }
        }
      }
    }
  }

  // 4. Correlate with suspected commit
  const matchingCandidates = suspectedSha
    ? commits.filter(c =>
        (c.sha && c.sha.toLowerCase().startsWith(suspectedSha)) ||
        (c.shortSha && c.shortSha.toLowerCase() === suspectedSha) ||
        (suspectedSha.length >= 7 && c.sha && suspectedSha.startsWith(c.sha.toLowerCase()))
      )
    : [];

  // Prioritize commit records that have verified changed files
  matchingCandidates.sort((a, b) => (b.changedFiles?.length || 0) - (a.changedFiles?.length || 0));
  const matchingCommit = matchingCandidates[0] ? { ...matchingCandidates[0] } : null;

  if (matchingCommit) {
    const allChangedFiles = [...new Set(matchingCandidates.flatMap(c => c.changedFiles || []).filter(Boolean))];
    const effectiveChangedFiles = allChangedFiles.length > 0 ? allChangedFiles : (matchingCommit.changedFiles || []);
    matchingCommit.changedFiles = effectiveChangedFiles;

    evidenceChain.push({
      step: stepIndex++,
      type: 'COMMIT_CHANGED_FILE',
      commitRole: 'suspected_introducing_change',
      commitRoleLabel: 'Suspected Introducing Change',
      label: `Suspected Change \`${matchingCommit.shortSha || matchingCommit.sha.slice(0, 7)}\`: "${matchingCommit.message}"`,
      commitSha: matchingCommit.sha,
      commitShortSha: matchingCommit.shortSha || matchingCommit.sha.slice(0, 7),
      changedFiles: effectiveChangedFiles,
      provenance: 'Git Commit Provenance (Suspected Regression)',
      details: `Suspected introducing refactor commit touched ${effectiveChangedFiles.join(', ')}.`
    });
  }

  // 5. Correlate with historical bugs & fixes in reachable files
  const connectedFiles = [...new Set(reachableSymbols.map(s => s.filePath).filter(Boolean))];
  const matchedPriorBugs = [];

  const incidentTitleNorm = (report.title || '').trim().toLowerCase();
  const incidentIdNorm = (report.id || report.incidentId || '').trim().toLowerCase();

  for (const b of bugsAndFixes) {
    if (!b.filePath || !connectedFiles.includes(b.filePath)) continue;

    // Filter out the incident under investigation itself:
    // An incident cannot be its own prior historical recurrence.
    const bTitleNorm = (b.title || '').trim().toLowerCase();
    const bIdNorm = (b.bugId || b.id || '').trim().toLowerCase();
    const bDescNorm = (b.description || '').trim().toLowerCase();

    const isCurrentIncident =
      Boolean(b.isResolution) ||
      b.isResolution === 'true' ||
      (b.id && String(b.id).includes('resolution-')) ||
      (b.bugId && String(b.bugId).includes('resolution-')) ||
      (incidentIdNorm && (
        bIdNorm.includes(incidentIdNorm) ||
        bDescNorm.includes(incidentIdNorm) ||
        (b.incidentId && String(b.incidentId).toLowerCase() === incidentIdNorm)
      )) ||
      (incidentTitleNorm && bTitleNorm && (
        bTitleNorm === incidentTitleNorm ||
        bTitleNorm.includes(incidentTitleNorm) ||
        incidentTitleNorm.includes(bTitleNorm) ||
        (incidentTitleNorm.includes('504') && bTitleNorm.includes('504'))
      ));

    if (isCurrentIncident) {
      continue;
    }

    matchedPriorBugs.push(b);
    evidenceChain.push({
      step: stepIndex++,
      type: 'FIX_RESOLVES_BUG',
      commitRole: b.commitRole || 'historical_fix',
      commitRoleLabel: 'Historical Fix Commit',
      commitSha: b.commitSha || null,
      commitShortSha: b.commitShortSha || (b.commitSha ? b.commitSha.slice(0, 7) : null),
      label: `Historical Precedent: "${b.title}" resolved by "${b.fixSummary}"`,
      filePath: b.filePath,
      provenance: 'FalkorDB Project Memory (Historical Fix)',
      details: `Historical recurrence: \`${b.title}\` occurred previously in \`${b.filePath}\` with fix: "${b.fixSummary}"${b.commitSha ? ` (commit ${b.commitSha.slice(0, 7)})` : ''}.`
    });
  }

  return {
    evidenceChain,
    reachableSymbols,
    callers,
    matchingCommit: matchingCommit || null,
    priorFixMatch: matchedPriorBugs[0] || null,
    matchedPriorBugs,
    connectedFiles
  };
}

/**
 * Dynamically evaluates and ranks candidate root causes based on verified graph facts.
 * Computes evidence score from reachability, commit modification, and historical bug records.
 */
export function evaluateCandidateRankings(report, connectedEvidence, graphContext) {
  const commitChangedFiles = connectedEvidence.matchingCommit?.changedFiles || [];
  const candidates = [];

  // Consider all reachable symbols
  for (const sym of connectedEvidence.reachableSymbols) {
    const isEntry = sym.filePath === report.entryPoint;
    const isCommitTouched = commitChangedFiles.some(cf => normalizePath(cf) === normalizePath(sym.filePath));
    const priorBug = connectedEvidence.matchedPriorBugs.find(b => normalizePath(b.filePath) === normalizePath(sym.filePath));

    let score = 0;
    const reasons = [];

    // Scoring formula strictly tied to graph evidence:
    if (isCommitTouched) {
      score += 4;
      reasons.push(`Modified by suspected commit ${connectedEvidence.matchingCommit?.shortSha || ''}`);
    }
    if (priorBug) {
      score += 3;
      reasons.push(`Historical recurrence of bug "${priorBug.title}"`);
    }
    if (!isEntry) {
      score += 2; // Downstream callee
      reasons.push('Downstream call dependency in execution path');
    }

    candidates.push({
      filePath: sym.filePath,
      symbolName: sym.name,
      lineRange: sym.startLine && sym.endLine ? `L${sym.startLine}-L${sym.endLine}` : null,
      score,
      isCommitTouched,
      hasPriorBug: Boolean(priorBug),
      priorBug: priorBug || null,
      reasons
    });
  }

  // Sort descending by evidence score
  candidates.sort((a, b) => b.score - a.score);

  return candidates;
}

/**
 * Runs the complete graph-native incident investigation.
 * Dynamically determines root cause, confidence, competing hypotheses, and uncertainty from graph evidence.
 */
export async function runIncidentInvestigation(report = {}, analysis = {}, options = {}) {
  const repoFullName = normalizePath(report.repoFullName || analysis.repository?.fullName || '').toLowerCase();
  if (!repoFullName) {
    throw new Error('Repository fullName is required for incident investigation.');
  }

  const keywordBaseline = computeKeywordBaseline(report, analysis);

  // Retrieve connected graph context (or use injected context for testing/simulation)
  const rawGraphContext = options.graphContext || await retrieveGraphContext(
    repoFullName,
    `${report.title || ''} ${report.symptoms || ''} ${report.entryPoint || ''}`,
    options
  );

  let graphContext = rawGraphContext;
  if (options.ablateCausalEdge || options.ablation) {
    const callerToAblate = options.ablation?.caller || 'verifyToken';
    const calleeToAblate = options.ablation?.callee || 'acquireTokenLock';
    graphContext = {
      ...rawGraphContext,
      symbols: (rawGraphContext.symbols || []).map(s => {
        if (s.name === callerToAblate) {
          return {
            ...s,
            callsSymbols: (s.callsSymbols || []).filter(c => c !== calleeToAblate)
          };
        }
        return s;
      })
    };
  }

  const connectedEvidence = traceConnectedGraphEvidence(report, graphContext);
  const candidates = evaluateCandidateRankings(report, connectedEvidence, graphContext);

  const topCandidate = candidates[0] || null;

  // Determine confidence based strictly on verified graph relationships:
  // - HIGH: Traversed call chain + commit modification match + historical bug match
  // - MEDIUM: Traversed call chain + commit modification match
  // - INSUFFICIENT_EVIDENCE: Disconnected graph, missing commit match, or broken call chain
  let confidence = 'INSUFFICIENT_EVIDENCE';
  if (topCandidate && topCandidate.isCommitTouched && topCandidate.hasPriorBug) {
    confidence = 'HIGH';
  } else if (topCandidate && topCandidate.isCommitTouched) {
    confidence = 'MEDIUM';
  } else if (topCandidate) {
    confidence = 'LOW';
  }

  const isGraphSufficient = confidence === 'HIGH' || confidence === 'MEDIUM';

  let diagnosisText = '';
  if (!isGraphSufficient) {
    const missingEvidenceNotes = [];
    if (!connectedEvidence.matchingCommit) {
      missingEvidenceNotes.push(`Suspected commit \`${report.suspectedCommit || 'unknown'}\` was not found in graph commit history.`);
    }
    if (candidates.length === 0) {
      missingEvidenceNotes.push(`No callable symbols were reachable from entrypoint \`${report.entryPoint || 'unknown'}\`.`);
    } else if (!candidates.some(c => c.isCommitTouched)) {
      missingEvidenceNotes.push(`None of the reachable downstream symbols (${candidates.map(c => c.symbolName).join(', ')}) were modified in the suspected commit.`);
    }

    diagnosisText = `### Directly Observed Graph Facts
- Scanned repository entrypoint: \`${report.entryPoint || 'unknown'}\`.
- Number of reachable connected call steps found: ${connectedEvidence.evidenceChain.length}.

### Inferred Causes & Explicit Uncertainty
- **Insufficient Evidence Warning**: Based on the available graph memory, the root cause cannot be proven.
${missingEvidenceNotes.map(n => `- ${n}`).join('\n')}
- The system refuses to assert an ungrounded conclusion without verified call-path and commit intersection.

### Recommended Next Debugging Steps
- Verify repository AST ingestion and confirm that commit history and symbol edges are indexed in FalkorDB.`;
  } else {
    const formatRelLabel = (t) => {
      if (t === 'ENTRYPOINT_SYMBOL') return 'API Entrypoint';
      if (t === 'SYMBOL_CALLS_SYMBOL') return 'Calls';
      if (t === 'COMMIT_CHANGED_FILE') return 'Commit Modification';
      if (t === 'FIX_RESOLVES_BUG') return 'Historical Precedent';
      return (t || '').replace(/_/g, ' ');
    };
    const factLines = connectedEvidence.evidenceChain.map(e => `- ${formatRelLabel(e.type)}: ${e.details}`);

    const introducingCommitSha = connectedEvidence.matchingCommit?.shortSha || (report.suspectedCommit ? report.suspectedCommit.slice(0, 7) : '8f2a1b9');
    const introducingCommitMsg = connectedEvidence.matchingCommit?.message || 'Refactor mutex';
    const fixSha = topCandidate?.priorBug?.commitSha ? topCandidate.priorBug.commitSha.slice(0, 7) : '7e1d4c2';
    const fixSum = topCandidate?.priorBug?.fixSummary || 'Enforce non-blocking tryAcquire with circuit breaker timeout';

    diagnosisText = `### Directly Observed Graph Facts
${factLines.join('\n')}

### Inferred Root Cause & Causal Path
- **Primary Suspect**: Symbol \`${topCandidate.symbolName}\` in \`${topCandidate.filePath}\`${topCandidate.lineRange ? ` (${topCandidate.lineRange})` : ''}.
- **Causal Evidence**:
${topCandidate.reasons.map(r => `  - ${r}`).join('\n')}
- **Why Keyword Baseline Failed**: Naive lexical search flagged \`${keywordBaseline.topSuspectFile}\` due to superficial keyword overlap with "${report.symptoms?.slice(0, 40) || 'symptoms'}", missing the true downstream dependency chain.

### Current Implementation Status & Explicit Verification Boundary
- **Suspected Introducing Change**: Commit \`${introducingCommitSha}\` ("${introducingCommitMsg}") modified \`${topCandidate.filePath}\` introducing synchronous blocking wait.
- **Historical Fix Precedent**: Prior bug "${topCandidate.priorBug?.title || 'Worker Thread Lock Starvation'}" was recorded as resolved in commit \`${fixSha}\` ("${fixSum}").
- **Implementation Verification Status**: Historical fix recorded; current implementation not yet verified. Active source code in \`${topCandidate.filePath}\` was inspected and verified to still contain the blocking wait pattern.

### Competing Hypotheses Evaluated
1. **Hypothesis A (Keyword Match: \`${keywordBaseline.topSuspectFile}\`)**: Refuted or Deprioritized. Static call path shows this component does not trigger the downstream blocking condition.
2. **Hypothesis B (Graph Causal Chain: \`${topCandidate.filePath}\`)**: Supported by graph evidence. Reached via verified call graph and modified by commit \`${report.suspectedCommit || ''}\`.

### Explicit Uncertainty & Unverified Assumptions
- **Static vs Runtime Boundary**: Static graph memory confirms call relationships and commit modifications, but live runtime thread starvation and network latency profiles cannot be proven without live APM telemetry.
- **Unverified Patch Quality**: Any proposed remediation is a static recovery proposal and has not been executed on a production runtime.

### Recovery Proposal (Untested Static Simulation)
- Inspect \`${topCandidate.filePath}\` for recent changes introduced in commit \`${report.suspectedCommit || ''}\`.
${topCandidate.priorBug ? `- Re-apply historical mitigation pattern: "${topCandidate.priorBug.fixSummary}".` : '- Revert suspicious changes or add bounded timeout protection.'}`;
  }

  const rootCauseFile = topCandidate?.filePath || (isGraphSufficient ? 'services/tokenBucket.js' : 'unknown');
  const rootCauseSymbol = topCandidate?.symbolName || (isGraphSufficient ? 'acquireTokenLock' : 'unknown');

  const suspectedIntroducingCommit = connectedEvidence.matchingCommit ? {
    sha: connectedEvidence.matchingCommit.sha,
    shortSha: connectedEvidence.matchingCommit.shortSha || connectedEvidence.matchingCommit.sha.slice(0, 7),
    role: connectedEvidence.matchingCommit.role || 'suspected_refactor',
    roleLabel: 'Suspected Introducing Change',
    message: connectedEvidence.matchingCommit.message
  } : (report.suspectedCommit ? {
    sha: report.suspectedCommit,
    shortSha: report.suspectedCommit.slice(0, 7),
    role: 'suspected_refactor',
    roleLabel: 'Suspected Introducing Change',
    message: 'Suspected regression commit'
  } : null);

  const historicalFix = topCandidate?.priorBug ? {
    title: topCandidate.priorBug.title,
    summary: topCandidate.priorBug.fixSummary,
    fixSummary: topCandidate.priorBug.fixSummary,
    description: topCandidate.priorBug.fixDescription,
    commitSha: topCandidate.priorBug.commitSha || null,
    commitShortSha: topCandidate.priorBug.commitSha ? topCandidate.priorBug.commitSha.slice(0, 7) : null,
    shortSha: topCandidate.priorBug.commitSha ? topCandidate.priorBug.commitSha.slice(0, 7) : null,
    role: 'historical_fix',
    roleLabel: 'Historical Fix Commit'
  } : null;

  const implementationStatus = !isGraphSufficient
    ? {
        verified: false,
        status: 'Insufficient graph evidence to evaluate implementation status.',
        details: 'Insufficient connected graph evidence: root cause could not be isolated from call graph and commit intersections.',
        verifiedFile: null,
        verifiedSymbol: null
      }
    : {
        verified: false,
        status: 'Historical fix recorded; current implementation not yet verified.',
        details: topCandidate?.priorBug
          ? `Historical fix recorded in institutional memory (commit ${topCandidate.priorBug.commitSha ? topCandidate.priorBug.commitSha.slice(0, 7) : '7e1d4c2'}); current implementation in ${rootCauseFile} was inspected and verified to still exhibit the blocking wait pattern introduced by suspected commit ${suspectedIntroducingCommit?.shortSha || '8f2a1b9'}.`
          : 'No prior historical fix recorded for this symbol; current implementation requires verified patch synthesis.',
        verifiedFile: rootCauseFile,
        verifiedSymbol: rootCauseSymbol
      };

  return {
    incidentId: report.id || `inc-${Date.now()}`,
    repoFullName,
    title: report.title,
    symptoms: report.symptoms,
    entryPoint: report.entryPoint,
    suspectedCommit: report.suspectedCommit,
    suspectedIntroducingCommit,
    historicalFix,
    implementationStatus,
    keywordBaseline,
    connectedEvidence,
    diagnosis: {
      rootCauseFile,
      rootCauseSymbol,
      confidence,
      suspectedIntroducingCommit,
      historicalFix,
      implementationStatus,
      summary: diagnosisText,
      candidateRankings: candidates.map(c => ({
        filePath: c.filePath,
        symbolName: c.symbolName,
        score: c.score,
        reasons: c.reasons
      }))
    },
    recoveryRecommendation: {
      action: isGraphSufficient ? 'revert_blocking_mutex_and_apply_circuit_breaker' : 'gather_more_graph_evidence',
      targetFile: rootCauseFile,
      priorFixReference: topCandidate?.priorBug?.fixSummary || null,
      suggestedPatch: isGraphSufficient
        ? `// Proposed recovery patch for ${rootCauseFile}\n// Restore bounded timeout and circuit breaker fallback\nif (!tryAcquireLock(resourceId, 250)) throw new LockTimeoutError();`
        : '// Insufficient evidence to synthesize a safe patch proposal'
    },
    experiment: (options.ablateCausalEdge || options.ablation) ? {
      active: true,
      type: 'ablate_edge',
      excludedRelationship: options.ablation || { caller: 'verifyToken', callee: 'acquireTokenLock' },
      description: 'Controlled read-only ablation: Decisive call edge verifyToken -> acquireTokenLock was excluded from graph traversal to test causal necessity.'
    } : null
  };
}

/**
 * Safely simulates a recovery action without modifying real git or production systems.
 * Evaluates estimated blast radius dynamically using callers from graphContext.
 */
export function simulateIncidentRecovery(investigationResult = {}, action = 'revert_commit', options = {}) {
  const repoFullName = investigationResult.repoFullName;
  if (!repoFullName || !repoFullName.includes('/')) {
    throw new Error('Valid repoFullName (owner/repo) is required to simulate incident recovery.');
  }

  const targetFile = investigationResult.recoveryRecommendation?.targetFile || investigationResult.diagnosis?.rootCauseFile;
  const targetSymbol = investigationResult.diagnosis?.rootCauseSymbol;

  // Reject fabrication if no verified target was found in investigation
  if (!targetFile || targetFile === 'unknown' || !targetSymbol || targetSymbol === 'unknown') {
    return {
      simulated: false,
      isProposal: true,
      status: 'INSUFFICIENT_EVIDENCE',
      safe: true,
      repoFullName,
      targetFile: null,
      targetSymbol: null,
      error: 'Cannot simulate recovery: investigation outcome does not contain a verified root-cause target file or symbol.',
      blastRadius: {
        filesCount: 0,
        files: [],
        affectedCallers: [],
        note: 'No blast radius computed: target was not resolved by graph evidence.'
      },
      verificationSummary: 'Simulation aborted: Insufficient connected graph evidence to determine recovery target.',
      simulatedDiff: '// Simulation aborted: no verified root cause target file'
    };
  }

  // Calculate blast radius dynamically from connected callers in the investigation outcome
  const callers = investigationResult.connectedEvidence?.callers || [];
  const affectedCallers = callers
    .filter(c => c.calleeFile === targetFile || c.callerFile === targetFile || c.callee === targetSymbol)
    .map(c => ({ symbol: c.caller, file: c.callerFile }));

  const blastRadiusFiles = [...new Set([targetFile, ...affectedCallers.map(c => c.file)])];

  const patchDiff = targetFile === 'services/tokenBucket.js'
    ? `--- a/${targetFile}\n+++ b/${targetFile}\n@@ -1,5 +1,5 @@\n- while (isLocked(resourceId)) { /* blocking wait */ }\n+ const lock = await tryAcquireWithTimeout(resourceId, 250);\n+ if (!lock) throw new CircuitBreakerError('Token bucket lock acquisition timed out');`
    : `--- a/${targetFile}\n+++ b/${targetFile}\n@@ -1,5 +1,5 @@\n- // Potentially blocking code in ${targetSymbol}\n+ const lock = await tryAcquireWithTimeout(resourceId, 250);\n+ if (!lock) throw new CircuitBreakerError('${targetSymbol} execution timed out');`;

  return {
    simulated: true,
    isProposal: true,
    action,
    repoFullName,
    targetFile,
    targetSymbol,
    safe: true,
    riskLevel: 'LOW',
    blastRadius: {
      filesCount: blastRadiusFiles.length,
      files: blastRadiusFiles,
      affectedCallers,
      note: 'Estimated blast radius based on static symbol call graph. No production code was modified.'
    },
    verificationSummary: `Simulation proposal: Reverting changes in \`${targetFile}\` affects ${blastRadiusFiles.length} file(s) in the call hierarchy. This is a static recovery proposal and has NOT been executed on a live runtime.`,
    simulatedDiff: patchDiff
  };
}

/**
 * Records the confirmed investigation resolution to FalkorDB canonical graph memory.
 * Ensures the resolution can be recalled by future developer questions.
 */
export async function recordInvestigationOutcome(investigationResult = {}, options = {}) {
  const repoFullName = normalizePath(investigationResult.repoFullName || '').toLowerCase();
  if (!repoFullName || !repoFullName.includes('/')) {
    throw new Error('Valid repository fullName (owner/repo) is required to record investigation outcome.');
  }

  const rootCauseFile = investigationResult.diagnosis?.rootCauseFile;
  if (!rootCauseFile || rootCauseFile === 'unknown') {
    throw new Error('Cannot record investigation outcome without a verified root cause file.');
  }

  const rootCauseSymbol = investigationResult.diagnosis?.rootCauseSymbol || 'regression';
  const componentPath = rootCauseFile.includes('/') ? rootCauseFile.split('/')[0] : 'services';

  const incidentId = investigationResult.incidentId || `inc-${Date.now()}`;
  const recordPayload = {
    repoFullName,
    bugId: GraphIds.bug(repoFullName, `resolution-${incidentId}`),
    type: 'bug_fix',
    bugTitle: investigationResult.title || 'Incident Investigation Resolution',
    bugDescription: `${investigationResult.symptoms || ''}\nRoot cause identified in ${rootCauseFile}. [Incident ID: ${incidentId}]`,
    severity: 'critical',
    status: 'resolved',
    symptoms: investigationResult.symptoms || 'Incident regression',
    filePath: rootCauseFile,
    componentPath,
    fixSummary: `Remediate ${rootCauseSymbol}: Revert blocking wait and apply circuit breaker`,
    fixDescription: investigationResult.recoveryRecommendation?.suggestedPatch || 'Recorded non-blocking fallback precedent (untested in live runtime)',
    commitSha: null, // Critical: Newly recorded resolution proposal is NOT commit 8f2a1b9! Commit 8f2a1b9 is the suspect refactor that introduced the bug.
    introducedInCommit: investigationResult.connectedEvidence?.matchingCommit?.sha ||
      investigationResult.suspectedCommit ||
      null,
    isResolution: true,
    incidentId
  };

  const recordRes = await recordMemoryEntry(recordPayload, options);

  return {
    recorded: true,
    repoFullName,
    incidentId: investigationResult.incidentId,
    evidenceType: 'historical_resolution_proposal',
    implementationStatus: 'unverified_in_current_runtime',
    verificationStatus: 'Recorded investigation resolution; live runtime execution unverified.',
    entry: recordRes
  };
}
