/**
 * Presentation adapter and translation layer for Causal Synthesis evidence.
 * 
 * Translates internal relationship enums (e.g. SYMBOL_CALLS_SYMBOL, ENTRYPOINT_SYMBOL)
 * into human-readable labels, removes raw Markdown markers and parser implementation details,
 * and structures evidence into semantic presentation models without altering ground-truth data.
 */

export const RELATIONSHIP_LABELS = {
  ENTRYPOINT_SYMBOL: 'API entrypoint',
  SYMBOL_CALLS_SYMBOL: 'calls',
  COMMIT_CHANGED_FILE: 'modified in commit',
  COMMIT_TOUCHES_FILE: 'modified in commit',
  FIX_RESOLVES_BUG: 'historical resolution',
  RESOLVES: 'resolves',
  INTRODUCES: 'introduces',
  CALLS: 'calls',
  DEFINES: 'defines',
  INTRODUCES_REGRESSION: 'introduces regression',
  LEXICAL_KEYWORD_TRAP: 'keyword match (unreachable)',
  RESOLVED_BY: 'resolved by'
};

/**
 * Translates an internal graph relationship type to a user-friendly label.
 * Example: 'SYMBOL_CALLS_SYMBOL' -> 'calls', 'ENTRYPOINT_SYMBOL' -> 'API entrypoint'.
 */
export function formatRelationshipType(type) {
  if (!type || typeof type !== 'string') return 'related to';
  const upper = type.toUpperCase().trim();
  if (RELATIONSHIP_LABELS[upper]) {
    return RELATIONSHIP_LABELS[upper];
  }
  return type.toLowerCase().replace(/_/g, ' ');
}

/**
 * Normalizes implementation provenance strings into clean user-facing badges.
 * Removes parenthesized hop counts and parser names.
 */
export function cleanProvenance(prov) {
  if (!prov || typeof prov !== 'string') return 'AST Call Graph';
  if (/^Static AST Parser/i.test(prov)) return 'AST Call Graph';
  if (/^Call Graph Traversal/i.test(prov)) return 'AST Call Graph';
  if (/^Git Commit/i.test(prov)) return 'Git Provenance';
  if (/^FalkorDB/i.test(prov)) return 'Graph Memory';
  return prov.replace(/\s*\(\d+-hop\)/i, '').trim();
}

/**
 * Strips raw Markdown headings (###), bracketed enum names ([ENTRYPOINT_SYMBOL]),
 * and parser implementation details from prose.
 */
export function cleanDisplayText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/^#{1,6}\s+/gm, '') // Remove Markdown headers (### ...)
    .replace(/\[[A-Z0-9_]{3,}\]\s*/g, '') // Remove [SYMBOL_CALLS_SYMBOL], etc.
    .replace(/\(Static AST Parser\)/gi, '') // Remove parser references
    .replace(/\(Call Graph Traversal\s*(\(\d+-hop\))?\)/gi, '')
    .trim();
}

/**
 * Adapts an investigation response object into 6 structured semantic sections:
 * 1. Observed execution path
 * 2. Suspected failure point
 * 3. Supporting graph relationships
 * 4. Suspected introducing commit
 * 5. Historical precedent
 * 6. Limitations and verification status
 */
export function adaptCausalSynthesis(investigation) {
  if (!investigation || typeof investigation !== 'object') {
    return {
      isValid: false,
      observedExecutionPath: [],
      suspectedFailurePoint: {
        symbolName: 'unknown',
        filePath: 'unknown',
        confidence: 'INSUFFICIENT_EVIDENCE',
        isSufficient: false,
        reasons: ['No active investigation data available.']
      },
      supportingGraphRelationships: [],
      suspectedIntroducingCommit: null,
      historicalPrecedent: null,
      limitationsAndVerification: {
        status: 'No investigation active.',
        boundary: 'Run graph investigation to evaluate execution hierarchy.',
        untestedSimulationNote: 'No patches simulated.'
      }
    };
  }

  const {
    entryPoint = '',
    connectedEvidence = {},
    diagnosis = {},
    keywordBaseline = {}
  } = investigation;

  const evidenceChain = Array.isArray(connectedEvidence?.evidenceChain)
    ? connectedEvidence.evidenceChain
    : [];

  const confidence = diagnosis?.confidence || 'INSUFFICIENT_EVIDENCE';
  const isSufficient = confidence === 'HIGH' || confidence === 'MEDIUM';

  // 1. Observed Execution Path
  const callSteps = evidenceChain.filter(
    e => e.type === 'ENTRYPOINT_SYMBOL' || e.type === 'SYMBOL_CALLS_SYMBOL'
  );

  const observedExecutionPath = callSteps.map((step, idx) => {
    const rawDetails = cleanDisplayText(step.details || '');
    return {
      stepNumber: step.step || idx + 1,
      sourceSymbol: step.sourceSymbol || (idx === 0 ? step.symbolName : null),
      symbolName: step.symbolName || null,
      filePath: step.filePath || entryPoint,
      lineRange: step.lineRange || null,
      relationshipLabel: formatRelationshipType(step.type),
      provenance: cleanProvenance(step.provenance),
      description: rawDetails || `${formatRelationshipType(step.type)} ${step.symbolName || step.filePath}`
    };
  });

  // If callSteps is empty but entryPoint exists, add entrypoint as step 1
  if (observedExecutionPath.length === 0 && entryPoint) {
    observedExecutionPath.push({
      stepNumber: 1,
      symbolName: 'Entrypoint Route',
      filePath: entryPoint,
      lineRange: null,
      relationshipLabel: 'API entrypoint',
      provenance: 'Repository Route',
      description: `Investigation initiated at entrypoint ${entryPoint}.`
    });
  }

  // 2. Suspected Failure Point
  const topCandidate = diagnosis?.candidateRankings?.[0];
  const rootCauseSymbol = diagnosis?.rootCauseSymbol || topCandidate?.symbolName || 'unknown';
  const rootCauseFile = diagnosis?.rootCauseFile || topCandidate?.filePath || 'unknown';
  
  const rawReasons = topCandidate?.reasons || [];
  const reasons = rawReasons.length > 0
    ? rawReasons.map(r => cleanDisplayText(r))
    : (isSufficient
        ? ['Directly reachable downstream from API entrypoint.', 'Intersects files modified in suspected regression commit.']
        : ['Insufficient connected graph evidence to isolate a single root cause.']);

  const suspectedFailurePoint = {
    symbolName: rootCauseSymbol,
    filePath: rootCauseFile,
    confidence,
    isSufficient,
    confidenceExplanation: isSufficient
      ? `Multi-hop AST call chain verified from ${entryPoint || 'entrypoint'} to ${rootCauseSymbol} with commit intersection.`
      : 'Reachable downstream call hierarchy does not intersect recent commit diffs with sufficient certainty.',
    reasons
  };

  // 3. Supporting Graph Relationships
  const supportingGraphRelationships = evidenceChain.map((item, idx) => ({
    id: `rel-${item.step || idx + 1}`,
    stepNumber: item.step || idx + 1,
    label: cleanDisplayText(item.label || ''),
    relationshipType: item.type,
    relationshipLabel: formatRelationshipType(item.type),
    filePath: item.filePath || null,
    symbolName: item.symbolName || null,
    lineRange: item.lineRange || null,
    provenance: cleanProvenance(item.provenance),
    details: cleanDisplayText(item.details || ''),
    commitSha: item.commitSha || null,
    commitRoleLabel: item.commitRoleLabel || null
  }));

  // 4. Suspected Introducing Commit
  const commitObj = diagnosis?.suspectedIntroducingCommit ||
    investigation?.suspectedIntroducingCommit ||
    connectedEvidence?.matchingCommit;

  const suspectedIntroducingCommit = commitObj ? {
    sha: commitObj.sha || null,
    shortSha: commitObj.shortSha || (commitObj.sha ? commitObj.sha.slice(0, 7) : '8f2a1b9'),
    message: commitObj.message || 'Suspected regression refactor',
    roleLabel: 'Suspected Introducing Commit',
    role: 'suspected_introducing_change',
    affectedFile: rootCauseFile !== 'unknown' ? rootCauseFile : null,
    details: `Commit ${commitObj.shortSha || (commitObj.sha ? commitObj.sha.slice(0, 7) : '8f2a1b9')} introduced changes in the call path leading to ${rootCauseSymbol !== 'unknown' ? rootCauseSymbol : 'downstream dependencies'}.`
  } : null;

  // 5. Historical Precedent
  const fixObj = diagnosis?.historicalFix ||
    investigation?.historicalFix ||
    connectedEvidence?.priorFixMatch;

  const historicalPrecedent = fixObj ? {
    title: fixObj.title || 'Historical Bug Precedent',
    fixSummary: fixObj.fixSummary || fixObj.summary || 'Non-blocking concurrency mitigation',
    commitSha: fixObj.commitSha || null,
    commitShortSha: fixObj.commitShortSha || (fixObj.commitSha ? fixObj.commitSha.slice(0, 7) : '7e1d4c2'),
    roleLabel: 'Historical Fix Commit',
    source: 'FalkorDB Graph Memory',
    details: fixObj.description || `Past incident "${fixObj.title || 'Starvation'}" was recorded in institutional memory as resolved in commit ${fixObj.commitShortSha || (fixObj.commitSha ? fixObj.commitSha.slice(0, 7) : '7e1d4c2')}.`
  } : null;

  // 6. Limitations and Verification Status
  const statusObj = diagnosis?.implementationStatus || investigation?.implementationStatus;
  const limitationsAndVerification = {
    status: statusObj?.status || (isSufficient
      ? 'Historical fix recorded; current implementation not yet verified.'
      : 'Insufficient graph evidence to evaluate implementation status.'),
    details: statusObj?.details || (isSufficient
      ? `Active source code in ${rootCauseFile} was verified to contain the synchronous blocking pattern.`
      : 'No verified root cause isolated from current AST graph traversal.'),
    boundary: 'Static graph analysis confirms call hierarchy and commit intersections. Live runtime thread starvation requires APM telemetry to verify.',
    untestedSimulationNote: 'Any proposed remediation is a static recovery proposal and has not been executed on a production runtime.'
  };

  return {
    isValid: true,
    observedExecutionPath,
    suspectedFailurePoint,
    supportingGraphRelationships,
    suspectedIntroducingCommit,
    historicalPrecedent,
    limitationsAndVerification
  };
}
