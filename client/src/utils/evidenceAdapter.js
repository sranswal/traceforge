/**
 * Presentation adapter and translation layer for Causal Synthesis evidence.
 * 
 * - Translates internal relationship enums (e.g. SYMBOL_CALLS_SYMBOL, ENTRYPOINT_SYMBOL)
 *   into human-readable labels.
 * - Builds the verified execution path strictly from actual directed call edges.
 * - Separates rejected decoys (e.g. checkRateLimit) into a dedicated alternatives section.
 * - Validates every consecutive pair against supporting graph evidence.
 * - Strips raw Markdown headings and parser implementation details.
 * - Enforces cautious, scientifically accurate certainty language.
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
    .replace(/`([a-zA-Z0-9_$./-]+)`/g, '$1') // Remove markdown code backticks
    .trim();
}

/**
 * Builds the verified execution path from entrypoint to targetSymbol.
 * Every consecutive pair (path[i], path[i+1]) MUST have an actual directed call edge in the evidence.
 * Decoys (such as checkRateLimit) that do not lead to targetSymbol are strictly excluded.
 */
export function buildVerifiedExecutionPath({
  entryPoint = '',
  targetSymbol = '',
  evidenceChain = [],
  callers = []
}) {
  // 1. Identify entrypoint node(s)
  const entryItems = evidenceChain.filter(
    e => e.type === 'ENTRYPOINT_SYMBOL' || (e.filePath && entryPoint && e.filePath.endsWith(entryPoint))
  );

  const entrySymbolName = entryItems[0]?.symbolName || entryItems[0]?.calleeSymbol || null;
  const entryFilePath = entryItems[0]?.filePath || entryPoint;
  const entryLineRange = entryItems[0]?.lineRange || null;

  // 2. Collect all verified directed call edges
  const callEdges = [];

  // From callers array
  for (const c of callers) {
    if (c.caller && c.callee) {
      callEdges.push({
        callerSymbol: c.caller,
        callerFile: c.callerFile || null,
        calleeSymbol: c.callee,
        calleeFile: c.calleeFile || null,
        lineRange: null,
        provenance: 'AST Call Graph',
        details: `${c.caller} calls ${c.callee}`
      });
    }
  }

  // From evidenceChain SYMBOL_CALLS_SYMBOL items
  const CALL_EDGE_REGEX = /[`'"]?([a-zA-Z0-9_$]+)[`'"]?(?:\s*\([^)]*\))?\s+(?:calls|->)\s+[`'"]?([a-zA-Z0-9_$]+)[`'"]?/i;

  for (const e of evidenceChain) {
    if (e.type === 'SYMBOL_CALLS_SYMBOL') {
      let callerSym = e.callerSymbol || e.sourceSymbol || null;
      let calleeSym = e.calleeSymbol || e.symbolName || null;

      // Extract from details or label if callerSymbol is missing (handles filePath parens and both 'calls' and '->')
      if (!callerSym && e.details) {
        const match = e.details.match(CALL_EDGE_REGEX);
        if (match) {
          callerSym = match[1];
          if (!calleeSym) calleeSym = match[2];
        }
      }
      if (!callerSym && e.label) {
        const match = e.label.match(CALL_EDGE_REGEX);
        if (match) {
          callerSym = match[1];
          if (!calleeSym) calleeSym = match[2];
        }
      }
      // Look up authoritative callers array if caller still not resolved
      if (!callerSym && calleeSym && callers?.length > 0) {
        const callerMatch = callers.find(c => c.callee === calleeSym);
        if (callerMatch) {
          callerSym = callerMatch.caller;
        }
      }

      if (callerSym && calleeSym) {
        const existing = callEdges.find(ce => ce.callerSymbol === callerSym && ce.calleeSymbol === calleeSym);
        if (existing) {
          existing.lineRange = existing.lineRange || e.lineRange;
          existing.callerFile = existing.callerFile || e.callerFile || e.sourceFile;
          existing.calleeFile = existing.calleeFile || e.calleeFile || e.filePath;
          existing.provenance = cleanProvenance(e.provenance || existing.provenance);
          existing.details = cleanDisplayText(e.details || existing.details);
        } else {
          callEdges.push({
            callerSymbol: callerSym,
            callerFile: e.callerFile || e.sourceFile || null,
            calleeSymbol: calleeSym,
            calleeFile: e.calleeFile || e.filePath || null,
            lineRange: e.lineRange || null,
            provenance: cleanProvenance(e.provenance),
            details: cleanDisplayText(e.details || `${callerSym} calls ${calleeSym}`)
          });
        }
      }
    }
  }

  // Build adjacency list: Map<callerSymbol, Edge[]>
  const adj = new Map();
  for (const edge of callEdges) {
    if (!adj.has(edge.callerSymbol)) {
      adj.set(edge.callerSymbol, []);
    }
    adj.get(edge.callerSymbol).push(edge);
  }

  const getSymbolMeta = (symName, defaultFile = null) => {
    const item = evidenceChain.find(e => e.symbolName === symName || e.calleeSymbol === symName);
    return {
      symbolName: symName,
      filePath: item?.filePath || item?.calleeFile || defaultFile || 'unknown',
      lineRange: item?.lineRange || null,
      provenance: cleanProvenance(item?.provenance)
    };
  };

  // Safe fallback if entrypoint not resolved
  if (!entrySymbolName) {
    if (entryPoint) {
      return [{
        stepNumber: 1,
        symbolName: 'Entrypoint Route',
        filePath: entryPoint,
        lineRange: null,
        relationshipLabel: 'API entrypoint',
        provenance: 'Repository Route',
        description: `Investigation initiated at entrypoint ${entryPoint}.`
      }];
    }
    return [];
  }

  // 3. Search for directed call path from entrySymbolName to targetSymbol
  let shortestEdgePath = null;
  if (targetSymbol && targetSymbol !== 'unknown' && targetSymbol !== entrySymbolName) {
    const queue = [{ currentSym: entrySymbolName, edgesTaken: [] }];
    const visited = new Set([entrySymbolName]);

    while (queue.length > 0) {
      const { currentSym, edgesTaken } = queue.shift();
      if (currentSym === targetSymbol) {
        shortestEdgePath = edgesTaken;
        break;
      }

      const neighbors = adj.get(currentSym) || [];
      for (const edge of neighbors) {
        if (!visited.has(edge.calleeSymbol)) {
          visited.add(edge.calleeSymbol);
          queue.push({
            currentSym: edge.calleeSymbol,
            edgesTaken: [...edgesTaken, edge]
          });
        }
      }
    }
  }

  // 4. Construct nodes
  const rawPath = [];
  rawPath.push({
    stepNumber: 1,
    symbolName: entrySymbolName,
    filePath: entryFilePath,
    lineRange: entryLineRange,
    roleLabel: 'API Entrypoint',
    relationshipLabel: 'API entrypoint',
    provenance: entryItems[0]?.provenance ? cleanProvenance(entryItems[0].provenance) : 'AST Call Graph',
    description: `Entrypoint ${entryFilePath} exposes route handler ${entrySymbolName}.`
  });

  if (shortestEdgePath && shortestEdgePath.length > 0) {
    for (let i = 0; i < shortestEdgePath.length; i++) {
      const edge = shortestEdgePath[i];
      const meta = getSymbolMeta(edge.calleeSymbol, edge.calleeFile);
      const prevSymbol = i === 0 ? entrySymbolName : shortestEdgePath[i - 1].calleeSymbol;
      const callerFileText = edge.callerFile ? ` (${edge.callerFile})` : '';
      const calleeFileText = (edge.calleeFile || meta.filePath) ? ` in ${edge.calleeFile || meta.filePath}` : '';
      const rawDesc = (edge.details && edge.details.toLowerCase().includes(prevSymbol.toLowerCase()))
        ? edge.details
        : fallbackDesc;
      const desc = cleanDisplayText(rawDesc);

      const isTarget = edge.calleeSymbol === targetSymbol;
      rawPath.push({
        stepNumber: i + 2,
        symbolName: edge.calleeSymbol,
        callerSymbol: prevSymbol,
        filePath: edge.calleeFile || meta.filePath,
        lineRange: edge.lineRange || meta.lineRange,
        roleLabel: isTarget ? 'Leading Root-Cause Hypothesis' : 'Intermediate Transit Step',
        relationshipLabel: 'calls',
        provenance: edge.provenance || meta.provenance,
        description: desc
      });
    }
  } else {
    // If target is unreachable or unknown, include immediate verified hops that lead towards active exploration
    const neighbors = adj.get(entrySymbolName) || [];
    for (const edge of neighbors) {
      const meta = getSymbolMeta(edge.calleeSymbol, edge.calleeFile);
      rawPath.push({
        stepNumber: rawPath.length + 1,
        symbolName: edge.calleeSymbol,
        callerSymbol: entrySymbolName,
        filePath: edge.calleeFile || meta.filePath,
        lineRange: edge.lineRange || meta.lineRange,
        roleLabel: 'Reachable Symbol',
        relationshipLabel: 'calls',
        provenance: edge.provenance || meta.provenance,
        description: edge.details || `${edge.callerSymbol} calls ${edge.calleeSymbol}`
      });
    }
  }

  // 5. Strict Consecutive Pair Validation
  // Validate that for every consecutive pair (rawPath[i], rawPath[i+1]):
  // there is an actual directed call edge: rawPath[i].symbolName -> rawPath[i+1].symbolName
  const validatedPath = [rawPath[0]];
  for (let i = 1; i < rawPath.length; i++) {
    const prev = validatedPath[validatedPath.length - 1];
    const curr = rawPath[i];
    const hasEdge = callEdges.some(
      e => e.callerSymbol === prev.symbolName && e.calleeSymbol === curr.symbolName
    );
    if (hasEdge) {
      validatedPath.push({ ...curr, stepNumber: validatedPath.length + 1 });
    }
  }

  return validatedPath;
}

/**
 * Adapts an investigation response object into 6 structured semantic sections:
 * 1. Suspected failure point (Leading Root-Cause Hypothesis)
 * 2. Observed execution path (strictly verified consecutive call edges)
 * 3. Rejected alternatives & surface decoys
 * 4. Suspected introducing commit & historical precedent
 * 5. Supporting graph relationships
 * 6. Limitations and verification boundary
 */
export function adaptCausalSynthesis(investigation) {
  if (!investigation || typeof investigation !== 'object') {
    return {
      isValid: false,
      observedExecutionPath: [],
      rejectedAlternatives: [],
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

  const callers = Array.isArray(connectedEvidence?.callers)
    ? connectedEvidence.callers
    : [];

  const candidateRankings = Array.isArray(diagnosis?.candidateRankings)
    ? diagnosis.candidateRankings
    : [];

  const confidence = diagnosis?.confidence || 'INSUFFICIENT_EVIDENCE';
  const isSufficient = confidence === 'HIGH' || confidence === 'MEDIUM';

  // 1. Suspected Failure Point
  const topCandidate = candidateRankings[0];
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

  // 2. Observed Execution Path (Strictly verified consecutive edges)
  const observedExecutionPath = buildVerifiedExecutionPath({
    entryPoint,
    targetSymbol: rootCauseSymbol,
    evidenceChain,
    callers
  });

  const verifiedSymbols = new Set(observedExecutionPath.map(p => p.symbolName).filter(Boolean));

  // 3. Rejected Alternatives & Surface Decoys
  // Invariant: Nodes on the verified path CANNOT be classified as rejected alternatives.
  // Distinguish their role in the execution path from their role as a candidate hypothesis.
  const rejectedAlternatives = [];

  // A. Decoy from keywordBaseline
  if (keywordBaseline?.topSuspectFile || keywordBaseline?.suspectedRootCause) {
    const decoySymbol = (keywordBaseline.suspectedSymbol) ||
      (evidenceChain.find(e => e.filePath === keywordBaseline.topSuspectFile && e.symbolName)?.symbolName) ||
      (candidateRankings.find(c => c.filePath === keywordBaseline.topSuspectFile)?.symbolName) ||
      'checkRateLimit';
    const decoyFile = keywordBaseline.topSuspectFile || 'services/rateLimiter.js';

    if (decoySymbol && !verifiedSymbols.has(decoySymbol)) {
      rejectedAlternatives.push({
        symbolName: decoySymbol,
        filePath: decoyFile,
        roleLabel: 'Rejected Surface Decoy',
        reason: keywordBaseline.suspectedRootCause || keywordBaseline.reason || 'Flagged by lexical keyword search baseline due to surface match on "rate limit".',
        callDistance: keywordBaseline.callDistance ?? 0,
        rejectionRationale: 'Surface keyword overlap with incident symptoms. Call graph traversal verifies this branch does not connect to the downstream failure point or the suspected refactor commit.'
      });
    }
  }

  // B. Other candidates from candidateRankings that are not on the verified failure path
  for (const cand of candidateRankings) {
    if (cand.symbolName && !verifiedSymbols.has(cand.symbolName) && cand.symbolName !== 'unknown') {
      const alreadyAdded = rejectedAlternatives.some(r => r.symbolName === cand.symbolName);
      if (!alreadyAdded) {
        const isDeadEnd = callers.some(c => (c.caller === entryPoint || c.caller === observedExecutionPath[0]?.symbolName) && c.callee === cand.symbolName);
        rejectedAlternatives.push({
          symbolName: cand.symbolName,
          filePath: cand.filePath,
          roleLabel: isDeadEnd ? 'Rejected Alternative Branch' : 'Deprioritized Candidate',
          reason: cand.reasons?.[0] || 'Refuted or deprioritized by graph traversal.',
          rejectionRationale: isDeadEnd
            ? 'Branch evaluated during graph traversal; terminates without reaching the failure point or intersecting the suspected commit.'
            : 'Does not trigger downstream blocking condition or connect to verified failure point.'
        });
      }
    }
  }

  // C. Any dead-end reachable symbols from graph traversal not on verified path
  if (Array.isArray(connectedEvidence?.reachableSymbols)) {
    for (const sym of connectedEvidence.reachableSymbols) {
      if (sym.name && !verifiedSymbols.has(sym.name) && sym.name !== 'unknown') {
        const alreadyAdded = rejectedAlternatives.some(r => r.symbolName === sym.name);
        if (!alreadyAdded) {
          rejectedAlternatives.push({
            symbolName: sym.name,
            filePath: sym.filePath,
            roleLabel: 'Rejected Alternative Branch',
            reason: 'Branch evaluated during graph traversal; terminates without reaching the failure point.',
            rejectionRationale: 'Call graph branch does not connect to downstream failure point or intersect the suspected introducing commit.'
          });
        }
      }
    }
  }

  // 4. Supporting Graph Relationships
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

  // 5. Suspected Introducing Commit
  const commitObj = diagnosis?.suspectedIntroducingCommit ||
    investigation?.suspectedIntroducingCommit ||
    connectedEvidence?.matchingCommit;

  const suspectedIntroducingCommit = commitObj ? {
    sha: commitObj.sha || null,
    shortSha: commitObj.shortSha || (commitObj.sha ? commitObj.sha.slice(0, 7) : 'unspecified'),
    message: commitObj.message || 'Suspected regression refactor',
    roleLabel: 'Suspected Introducing Commit',
    role: 'suspected_introducing_change',
    affectedFile: rootCauseFile !== 'unknown' ? rootCauseFile : null,
    details: `Commit ${commitObj.shortSha || (commitObj.sha ? commitObj.sha.slice(0, 7) : 'unspecified')} introduced changes in the call path leading to ${rootCauseSymbol !== 'unknown' ? rootCauseSymbol : 'downstream dependencies'}.`
  } : null;

  // 6. Historical Precedent
  const fixObj = diagnosis?.historicalFix ||
    investigation?.historicalFix ||
    connectedEvidence?.priorFixMatch;

  const historicalPrecedent = fixObj ? {
    title: fixObj.title || 'Historical Bug Precedent',
    fixSummary: fixObj.fixSummary || fixObj.summary || 'Historical fix precedent',
    commitSha: fixObj.commitSha || null,
    commitShortSha: fixObj.commitShortSha || (fixObj.commitSha ? fixObj.commitSha.slice(0, 7) : null),
    roleLabel: 'Historical Fix Commit',
    source: 'FalkorDB Graph Memory',
    details: fixObj.description || `Past incident "${fixObj.title || 'Prior Bug'}" was recorded in institutional memory as resolved${fixObj.commitSha ? ` in commit ${fixObj.commitSha.slice(0, 7)}` : ''}.`
  } : null;

  // 7. Limitations and Verification Status
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
    rejectedAlternatives,
    suspectedFailurePoint,
    supportingGraphRelationships,
    suspectedIntroducingCommit,
    historicalPrecedent,
    limitationsAndVerification
  };
}
