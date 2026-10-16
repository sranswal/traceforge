import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  GitCommit, 
  Bug, 
  ShieldAlert, 
  Layers,
  ArrowRight,
  Info,
  Activity,
  Zap,
  HelpCircle,
  ExternalLink,
  Split
} from 'lucide-react';

export default function CausalGraphCanvas({
  investigation,
  onSelectNode,
  selectedNodeId,
  onSelectEdge,
  selectedEdgeId,
  className = ''
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null);
  const [internalSelectedEdgeId, setInternalSelectedEdgeId] = useState(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);

  const activeEdgeId = selectedEdgeId !== undefined ? selectedEdgeId : internalSelectedEdgeId;

  // Canvas coordinate space
  const canvasWidth = 820;
  const canvasHeight = 440;

  // Check if read-only ablation experiment is active
  const isAblated = Boolean(
    investigation?.experiment?.active || 
    investigation?.diagnosis?.confidence === 'INSUFFICIENT_EVIDENCE' && investigation?.experiment
  );

  // Build the graph nodes and edges from the real investigation payload
  const { nodes, edges } = useMemo(() => {
    if (!investigation) {
      return { nodes: [], edges: [] };
    }

    const isDemo = Boolean(investigation.isDemo || investigation.repoFullName === 'acme/payment-gateway');

    // For real repositories, dynamically construct nodes & edges from actual investigation evidence
    if (!isDemo) {
      const realNodes = [];
      const realEdges = [];
      const chain = investigation.connectedEvidence?.evidenceChain || [];
      const rootCauseFile = investigation.diagnosis?.rootCauseFile;
      const rootCauseSymbol = investigation.diagnosis?.rootCauseSymbol;
      const confidence = investigation.diagnosis?.confidence;
      const isSufficient = confidence === 'HIGH' || confidence === 'MEDIUM';

      // 1. API Entrypoint node
      const entryStep = chain.find(c => c.type === 'ENTRYPOINT_SYMBOL') || chain[0];
      const entryLabel = entryStep?.symbolName || entryStep?.calleeSymbol || entryStep?.label || 'API Entrypoint';
      const entryFile = entryStep?.filePath || investigation.entryPoint || 'entrypoint';

      realNodes.push({
        id: 'node-entrypoint',
        label: entryLabel,
        filePath: entryFile,
        lineRange: entryStep?.lineRange || 'L1',
        type: 'entrypoint',
        evidenceCategory: 'source_evidence',
        role: 'API Entrypoint',
        category: 'Source Evidence',
        x: 95,
        y: 220,
        radius: 26,
        color: '#8b5cf6',
        bgColor: '#1e1438',
        borderColor: '#a78bfa',
        provenance: entryStep?.provenance || 'Repository Route AST',
        details: entryStep?.details || `Execution entrypoint in ${entryFile}.`,
        badge: 'Source Evidence'
      });

      // 2. Traversed call hops from evidenceChain
      const callSteps = chain.filter(c => c.type === 'SYMBOL_CALLS_SYMBOL');
      callSteps.forEach((callStep, idx) => {
        const hopId = `node-hop-${idx + 1}`;
        const isTarget = isSufficient && callStep.calleeSymbol === rootCauseSymbol && callStep.filePath === rootCauseFile;
        const hopX = 280 + idx * 170;

        realNodes.push({
          id: hopId,
          label: callStep.calleeSymbol || `Hop ${idx + 1}`,
          filePath: callStep.filePath || 'dependency',
          lineRange: callStep.lineRange || 'L1',
          type: isTarget ? 'root_cause' : 'call_hop',
          evidenceCategory: isTarget ? 'suspected_change' : 'inferred_relationship',
          role: isTarget ? 'Leading Root-Cause Hypothesis' : 'Call Chain Dependency',
          category: isTarget ? 'Leading Root-Cause Hypothesis' : 'Inferred Relationship',
          x: hopX,
          y: 220,
          radius: isTarget ? 30 : 25,
          color: isTarget ? '#f43f5e' : '#06b6d4',
          bgColor: isTarget ? '#310a14' : '#082531',
          borderColor: isTarget ? '#fb7185' : '#22d3ee',
          provenance: callStep.provenance || 'AST Call Graph',
          details: callStep.details || `Call relationship to ${callStep.calleeSymbol}.`,
          badge: isTarget ? 'Suspected Target' : 'Inferred Hop',
          pulse: isTarget
        });

        const prevId = idx === 0 ? 'node-entrypoint' : `node-hop-${idx}`;
        realEdges.push({
          id: `edge-hop-${idx + 1}`,
          source: prevId,
          target: hopId,
          label: 'calls',
          relationshipType: 'SYMBOL_CALLS_SYMBOL',
          isCausal: isTarget,
          color: isTarget ? '#f43f5e' : '#a78bfa',
          style: 'solid',
          provenance: callStep.provenance || 'AST Call Graph',
          description: callStep.details || `Calls ${callStep.calleeSymbol}.`
        });
      });

      // 3. Isolated root cause node if not matched in call hops
      const hasRootNode = realNodes.some(n => n.type === 'root_cause');
      if (!hasRootNode && rootCauseFile && rootCauseFile !== 'unknown' && isSufficient) {
        const rootId = 'node-root-cause';
        realNodes.push({
          id: rootId,
          label: rootCauseSymbol || 'Root Cause',
          filePath: rootCauseFile,
          type: 'root_cause',
          evidenceCategory: 'suspected_change',
          role: 'Leading Root-Cause Hypothesis',
          category: 'Leading Root-Cause Hypothesis',
          x: 495,
          y: 220,
          radius: 30,
          color: '#f43f5e',
          bgColor: '#310a14',
          borderColor: '#fb7185',
          provenance: 'FalkorDB Graph Traversal',
          details: `Isolated root cause in ${rootCauseFile}.`,
          badge: 'Suspected Target',
          pulse: true
        });

        const lastNode = realNodes[realNodes.length - 2];
        if (lastNode) {
          realEdges.push({
            id: 'edge-to-root',
            source: lastNode.id,
            target: rootId,
            label: 'correlated',
            relationshipType: 'SYMBOL_CALLS_SYMBOL',
            isCausal: true,
            color: '#f43f5e',
            style: 'solid',
            provenance: 'FalkorDB Graph Traversal',
            description: `Correlated leading cause ${rootCauseSymbol}.`
          });
        }
      }

      // 4. Suspect commit node if present in real investigation
      const suspectCommit = investigation.diagnosis?.suspectedIntroducingCommit || investigation.connectedEvidence?.matchingCommit;
      if (suspectCommit?.sha) {
        const commitId = 'node-commit';
        realNodes.push({
          id: commitId,
          label: `Commit ${suspectCommit.shortSha || suspectCommit.sha.slice(0, 7)}`,
          filePath: rootCauseFile || entryFile,
          type: 'commit',
          evidenceCategory: 'suspected_change',
          role: 'Suspected Introducing Change',
          category: 'Suspected Change',
          x: 495,
          y: 75,
          radius: 22,
          color: '#f59e0b',
          bgColor: '#2a1a06',
          borderColor: '#fbbf24',
          provenance: 'Git History',
          details: `Commit ${suspectCommit.shortSha || suspectCommit.sha.slice(0, 7)}: ${suspectCommit.message || 'Modified files in repository'}.`,
          badge: 'Suspected Change'
        });

        const targetForCommit = realNodes.find(n => n.type === 'root_cause') || realNodes[realNodes.length - 2];
        if (targetForCommit) {
          realEdges.push({
            id: 'edge-commit',
            source: commitId,
            target: targetForCommit.id,
            label: 'modifies file',
            relationshipType: 'COMMIT_CHANGED_FILE',
            isCausal: false,
            color: '#fbbf24',
            style: 'dashed',
            provenance: 'Git Delta',
            description: `Commit modified ${targetForCommit.filePath}.`
          });
        }
      }

      // 5. Decoy / Keyword Baseline node if present
      const decoyFile = investigation.keywordBaseline?.topSuspectFile;
      if (decoyFile && decoyFile !== rootCauseFile && decoyFile !== 'unknown') {
        const decoyId = 'node-decoy';
        realNodes.push({
          id: decoyId,
          label: decoyFile.split('/').pop(),
          filePath: decoyFile,
          type: 'decoy',
          evidenceCategory: 'uncertain_information',
          role: 'Rejected Decoy (Keyword Match)',
          category: 'Uncertain / Decoy',
          x: 285,
          y: 365,
          radius: 22,
          color: '#94a3b8',
          bgColor: '#141a24',
          borderColor: '#475569',
          provenance: 'Lexical Match',
          details: investigation.keywordBaseline?.limitation || 'Selected by lexical search but not verified in execution call path.',
          badge: 'Decoy (Rejected)',
          dashed: true
        });

        realEdges.push({
          id: 'edge-decoy',
          source: 'node-entrypoint',
          target: decoyId,
          label: 'keyword match (unreachable)',
          relationshipType: 'LEXICAL_KEYWORD_TRAP',
          isCausal: false,
          color: '#64748b',
          style: 'dotted',
          provenance: 'Lexical Search',
          description: 'Lexical overlap without AST call edge.'
        });
      }

      // 6. Historical fix memory node if present
      const priorFix = investigation.diagnosis?.historicalFix || investigation.connectedEvidence?.priorFixMatch;
      if (priorFix) {
        const memId = 'node-memory';
        realNodes.push({
          id: memId,
          label: priorFix.title || 'Historical Fix Precedent',
          filePath: priorFix.filePath || rootCauseFile || 'unknown',
          type: 'memory',
          evidenceCategory: 'historical_fix',
          role: 'Historical Fix Precedent',
          category: 'Historical Precedent',
          x: 700,
          y: 220,
          radius: 26,
          color: '#10b981',
          bgColor: '#06261c',
          borderColor: '#34d399',
          provenance: 'FalkorDB Memory',
          details: `Historical precedent: ${priorFix.summary || priorFix.fixSummary || 'Resolved prior incident'}.`,
          badge: 'Historical Fix'
        });

        const targetForMem = realNodes.find(n => n.type === 'root_cause') || realNodes[realNodes.length - 2];
        if (targetForMem) {
          realEdges.push({
            id: 'edge-memory',
            source: targetForMem.id,
            target: memId,
            label: 'resolved previously',
            relationshipType: 'FIX_RESOLVES_BUG',
            isCausal: false,
            color: '#34d399',
            style: 'solid',
            provenance: 'FalkorDB Memory',
            description: 'Institutional fix precedent in FalkorDB.'
          });
        }
      }

      return { nodes: realNodes, edges: realEdges };
    }

    // Explicit Demo Scenario (acme/payment-gateway)
    const entryPointPath = investigation.entryPoint || 'server/routes/pay.js';
    const rootCauseFile = investigation.diagnosis?.rootCauseFile || 'services/tokenBucket.js';
    const rootCauseSymbol = investigation.diagnosis?.rootCauseSymbol || 'acquireTokenLock';
    const suspectCommit = investigation.diagnosis?.suspectedIntroducingCommit?.sha ||
      investigation.connectedEvidence?.matchingCommit?.sha ||
      investigation.suspectedCommit ||
      '8f2a1b9';
    const decoyFile = investigation.keywordBaseline?.topSuspectFile || 'services/rateLimiter.js';
    const decoySymbol = 'checkRateLimit';
    const priorFix = investigation.connectedEvidence?.priorFixMatch || investigation.diagnosis?.historicalFix;
    const fixCommitSha = priorFix?.commitSha || investigation.diagnosis?.historicalFix?.commitSha || '7e1d4c2';

    // Graph Nodes
    const n = [
      // 1. API Entrypoint (Source Evidence)
      {
        id: 'node-entrypoint',
        label: 'handlePaymentRequest',
        filePath: entryPointPath,
        lineRange: 'L12-L45',
        type: 'entrypoint',
        evidenceCategory: 'source_evidence',
        role: 'API Entrypoint',
        category: 'Source Evidence',
        x: 95,
        y: 220,
        radius: 26,
        color: '#8b5cf6', // Violet
        bgColor: '#1e1438',
        borderColor: '#a78bfa',
        provenance: 'Repository Route AST',
        details: 'Incoming payment settlement endpoint identified as the origin of HTTP 504 timeouts.',
        badge: 'Source Evidence'
      },
      // 2. Intermediate Hop: Token Verification (Inferred Relationship)
      {
        id: 'node-hop',
        label: 'verifyToken',
        filePath: 'services/auth.js',
        lineRange: 'L34-L62',
        type: 'call_hop',
        evidenceCategory: 'inferred_relationship',
        role: 'Auth & Token Validation',
        category: 'Inferred Relationship',
        x: 285,
        y: 220,
        radius: 25,
        color: '#06b6d4', // Cyan
        bgColor: '#082531',
        borderColor: '#22d3ee',
        provenance: 'Static AST Call Graph (1-Hop)',
        details: 'Intermediate call hop in execution pipeline. Validates client authorization header and requests token allocation.',
        badge: 'Inferred Hop'
      },
      // 3. Leading Root-Cause Hypothesis: acquireTokenLock in tokenBucket.js
      {
        id: 'node-root-cause',
        label: isAblated ? 'acquireTokenLock (Severed)' : rootCauseSymbol,
        filePath: rootCauseFile,
        lineRange: 'L54-L88',
        type: 'root_cause',
        evidenceCategory: isAblated ? 'uncertain_information' : 'suspected_change',
        role: isAblated ? 'Disconnected Symbol (Ablated)' : 'Leading Root-Cause Hypothesis (Lock Starvation)',
        category: isAblated ? 'Severed Target' : 'Leading Root-Cause Hypothesis',
        x: 495,
        y: 220,
        radius: 30,
        color: isAblated ? '#94a3b8' : '#f43f5e', // Rose/Crimson or Muted Slate
        bgColor: isAblated ? '#161c28' : '#310a14',
        borderColor: isAblated ? '#64748b' : '#fb7185',
        provenance: '2-Hop Call Graph + Git Commit Intersect',
        details: isAblated 
          ? 'Controlled experiment severed the call edge verifyToken -> acquireTokenLock. This symbol is disconnected from the entrypoint.' 
          : 'Acquires blocking thread mutex without timeout, causing complete thread pool starvation under high concurrency.',
        badge: isAblated ? 'Unreachable' : 'Suspected Target',
        pulse: !isAblated
      },
      // 4. Suspect Refactor Commit (Suspected Change)
      {
        id: 'node-commit',
        label: `Commit ${suspectCommit.slice(0, 7)}`,
        filePath: rootCauseFile,
        type: 'commit',
        evidenceCategory: 'suspected_change',
        role: 'Suspected Introducing Change',
        category: 'Suspected Change',
        x: 495,
        y: 75,
        radius: 22,
        color: '#f59e0b', // Amber
        bgColor: '#2a1a06',
        borderColor: '#fbbf24',
        provenance: 'Git Commit Provenance (Suspected Regression)',
        details: `Suspected introducing refactor by dev-charlie (${suspectCommit.slice(0, 7)}) modified ${rootCauseFile} and added blocking mutex.`,
        badge: 'Suspected Change'
      },
      // 5. Rejected Decoy: checkRateLimit in rateLimiter.js (Uncertain / Rejected)
      {
        id: 'node-decoy',
        label: decoySymbol,
        filePath: decoyFile,
        lineRange: 'L18-L35',
        type: 'decoy',
        evidenceCategory: 'uncertain_information',
        role: 'Rejected Decoy (Keyword Match Trap)',
        category: 'Uncertain / Decoy',
        x: 285,
        y: 365,
        radius: 22,
        color: '#94a3b8', // Gray
        bgColor: '#141a24',
        borderColor: '#475569',
        provenance: 'Superficial Lexical Overlap (Uncalled)',
        details: 'Identified by naive keyword search due to surface match on "rate limit". Disproven by graph traversal: 0 incoming calls from entrypoint.',
        badge: 'Decoy (Rejected)',
        dashed: true
      },
      // 6. Historical Memory Precedent (Historical Fix)
      {
        id: 'node-memory',
        label: priorFix?.title || 'Prior Lock Starvation Fix',
        filePath: rootCauseFile,
        type: 'memory',
        evidenceCategory: 'historical_fix',
        role: 'Historical Fix Precedent',
        category: 'Historical Precedent',
        x: 700,
        y: 220,
        radius: 26,
        color: '#10b981', // Emerald
        bgColor: '#06261c',
        borderColor: '#34d399',
        provenance: 'FalkorDB Bug Resolution Index',
        details: `Historical institutional remediation recorded in commit ${fixCommitSha.slice(0, 7)} by dev-alice: ${priorFix?.fixSummary || 'Enforce non-blocking tryAcquire with circuit breaker timeout.'} (Untested in current runtime).`,
        badge: `Historical Fix: ${fixCommitSha.slice(0, 7)}`
      }
    ];

    // Graph Edges
    const e = [
      // 1. Entrypoint -> verifyToken (Causal Call Path - 1st Hop)
      {
        id: 'edge-1',
        source: 'node-entrypoint',
        target: 'node-hop',
        label: 'calls (sync)',
        relationshipType: 'SYMBOL_CALLS_SYMBOL',
        isCausal: true,
        color: '#a78bfa',
        style: 'solid',
        provenance: 'AST Static Call Graph (1-Hop)',
        description: 'handlePaymentRequest in server/routes/pay.js calls verifyToken in services/auth.js synchronously.'
      },
      // 2. verifyToken -> acquireTokenLock (Causal Call Path - 2nd Hop)
      {
        id: 'edge-2',
        source: 'node-hop',
        target: 'node-root-cause',
        label: isAblated ? 'severed call' : 'calls (blocking)',
        relationshipType: 'SYMBOL_CALLS_SYMBOL',
        isCausal: !isAblated,
        isAblated,
        color: isAblated ? '#ef4444' : '#f43f5e',
        style: isAblated ? 'dashed' : 'solid',
        provenance: 'AST Static Call Graph (2-Hop)',
        description: isAblated 
          ? 'Controlled experiment severed this call edge. acquireTokenLock is now unreachable from the entrypoint.' 
          : 'verifyToken in services/auth.js invokes acquireTokenLock in services/tokenBucket.js which enters unbounded blocking wait.'
      },
      // 3. Suspected Commit -> acquireTokenLock (Introduced Regression)
      {
        id: 'edge-3',
        source: 'node-commit',
        target: 'node-root-cause',
        label: 'introduces regression',
        relationshipType: 'COMMIT_TOUCHES_FILE',
        isCausal: false,
        color: '#fbbf24',
        style: 'dashed',
        provenance: 'Git Commit File Delta',
        description: `Suspected introducing refactor commit ${suspectCommit.slice(0, 7)} modified services/tokenBucket.js changing lock implementation.`
      },
      // 4. Entrypoint -> Decoy (Superficial Lexical Overlap - Unreachable)
      {
        id: 'edge-4',
        source: 'node-entrypoint',
        target: 'node-decoy',
        label: 'keyword match (unreachable)',
        relationshipType: 'LEXICAL_KEYWORD_TRAP',
        isCausal: false,
        color: '#64748b',
        style: 'dotted',
        provenance: 'Naive Lexical Search Heuristic',
        description: 'Surface lexical match on "rate limit". Graph reachability traversal verifies this function is NOT in the execution call tree.'
      },
      // 5. Root Cause -> Historical Memory Precedent
      {
        id: 'edge-5',
        source: 'node-root-cause',
        target: 'node-memory',
        label: `resolved in ${fixCommitSha.slice(0, 7)}`,
        relationshipType: 'FIX_RESOLVES_BUG',
        isCausal: false,
        color: '#34d399',
        style: 'solid',
        provenance: 'FalkorDB Bug Resolution Memory',
        description: `Historical precedent: prior recurrence was resolved by commit ${fixCommitSha.slice(0, 7)} ("Enforce non-blocking tryAcquire"). Untested in current runtime.`
      }
    ];

    return { nodes: n, edges: e };
  }, [investigation, isAblated]);

  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const edgeMap = useMemo(() => new Map(edges.map(e => [e.id, e])), [edges]);

  // Causal path node set
  const causalNodeIds = useMemo(() => new Set(nodes.filter(n => n.type === 'entrypoint' || n.type === 'call_hop' || n.type === 'root_cause').map(n => n.id)), [nodes]);

  // Determine dimming opacity for each node based on selection
  const getNodeOpacity = (nodeId) => {
    if (activeEdgeId) {
      const activeEdge = edgeMap.get(activeEdgeId);
      if (activeEdge) {
        return activeEdge.source === nodeId || activeEdge.target === nodeId ? 1 : 0.18;
      }
    }
    if (selectedNodeId) {
      if (selectedNodeId === nodeId) return 1;
      // If connected to selected node, keep full opacity
      const isNeighbor = edges.some(e => 
        (e.source === selectedNodeId && e.target === nodeId) ||
        (e.target === selectedNodeId && e.source === nodeId)
      );
      return isNeighbor ? 0.95 : 0.18;
    }
    // Default view: highlight causal path, dim decoy
    if (nodeId === 'node-decoy') return 0.45;
    return 1;
  };

  // Determine dimming opacity for edges
  const getEdgeOpacity = (edge) => {
    if (activeEdgeId) {
      return edge.id === activeEdgeId ? 1 : 0.12;
    }
    if (selectedNodeId) {
      return edge.source === selectedNodeId || edge.target === selectedNodeId ? 1 : 0.12;
    }
    if (edge.id === 'edge-4') return 0.35; // Decoy edge is dimmed by default
    return 0.85;
  };

  // Pan handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Wheel zoom
  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.min(Math.max(prev * factor, 0.5), 2.5));
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    if (onSelectNode) onSelectNode(null);
    if (onSelectEdge) onSelectEdge(null);
    setInternalSelectedEdgeId(null);
  };

  const handleEdgeClick = (edge) => {
    setInternalSelectedEdgeId(edge.id);
    if (onSelectEdge) onSelectEdge(edge);
    if (onSelectNode) onSelectNode(null); // Clear node selection to focus on edge
  };

  const handleNodeClick = (node) => {
    setInternalSelectedEdgeId(null);
    if (onSelectEdge) onSelectEdge(null);
    if (onSelectNode) onSelectNode(node);
  };

  // Active inspectable entity (node or edge)
  const activeSelectedEdge = activeEdgeId ? edgeMap.get(activeEdgeId) : null;
  const activeSelectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) : (!activeSelectedEdge ? nodeMap.get('node-root-cause') : null);

  return (
    <div className={`relative flex flex-col rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-slate-50 dark:bg-[#0c101a] overflow-hidden select-none transition-colors ${className}`}>
      {/* Canvas Top Bar: Status, Scope & Controls */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-[#1b2537] bg-white dark:bg-[#0f1422] z-10 transition-colors">
        <div className="flex items-center gap-2 flex-wrap">
          <Layers className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          <span className="text-xs font-semibold text-slate-900 dark:text-slate-200">
            FalkorDB Causal Dependency Chain
          </span>
          <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded bg-slate-100 dark:bg-[#161f30] border border-slate-200 dark:border-[#232f46]">
            {nodes.length} nodes · {isAblated ? '1 call hop (1 ablated)' : '2 call hops'}
          </span>
          {isAblated && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800/60 font-bold animate-pulse">
              [Controlled Experiment: Ablated Edge]
            </span>
          )}
        </div>

        {/* Zoom & Reset Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setZoom(prev => Math.min(prev + 0.15, 2.5))}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#1a2336] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors cursor-pointer"
            title="Zoom In"
            aria-label="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(prev => Math.max(prev - 0.15, 0.5))}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#1a2336] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors cursor-pointer"
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#1a2336] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors cursor-pointer text-[11px] font-mono flex items-center gap-1 px-1.5"
            title="Reset View"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* SVG Canvas Workspace */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className={`w-full h-[390px] sm:h-[430px] relative overflow-hidden ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <svg
          viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
          className="w-full h-full"
        >
          <defs>
            {/* Arrow Marker for Causal Edges */}
            <marker
              id="arrow-causal"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#fb7185" />
            </marker>

            <marker
              id="arrow-cyan"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#22d3ee" />
            </marker>

            <marker
              id="arrow-amber"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#fbbf24" />
            </marker>

            <marker
              id="arrow-emerald"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#34d399" />
            </marker>

            <marker
              id="arrow-red"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
            </marker>

            {/* Glowing Root Cause Filter */}
            <filter id="glow-root-cause" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Group with Zoom & Pan Transformations */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Background Grid Pattern */}
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" className="fill-slate-300 dark:fill-[#1b2436]" />
            </pattern>
            <rect x="-1000" y="-1000" width="3000" height="3000" fill="url(#grid)" opacity="0.6" />

            {/* Edges */}
            {edges.map((edge) => {
              const src = nodeMap.get(edge.source);
              const tgt = nodeMap.get(edge.target);
              if (!src || !tgt) return null;

              const isCausalEdge = edge.isCausal;
              const isSelected = activeEdgeId === edge.id;
              const isHovered = hoveredEdgeId === edge.id;
              const opacity = getEdgeOpacity(edge);

              const markerId = edge.isAblated 
                ? 'url(#arrow-red)' 
                : edge.color === '#f43f5e' 
                  ? 'url(#arrow-causal)' 
                  : edge.color === '#22d3ee' || edge.color === '#a78bfa' 
                    ? 'url(#arrow-cyan)' 
                    : edge.color === '#fbbf24' 
                      ? 'url(#arrow-amber)' 
                      : edge.color === '#34d399' 
                        ? 'url(#arrow-emerald)' 
                        : undefined;

              // Calculate midpoint for edge label
              const midX = (src.x + tgt.x) / 2;
              const midY = (src.y + tgt.y) / 2 - (edge.source === 'node-commit' ? 0 : 9);

              const labelLen = edge.label.length;
              const badgeWidth = Math.min(Math.max(labelLen * 6.4 + 14, 84), 136);
              const halfWidth = badgeWidth / 2;

              return (
                <g 
                  key={edge.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdgeClick(edge);
                  }}
                  onMouseEnter={() => setHoveredEdgeId(edge.id)}
                  onMouseLeave={() => setHoveredEdgeId(null)}
                  className="cursor-pointer"
                  style={{ opacity, transition: 'opacity 0.2s ease' }}
                >
                  <title>{`${edge.label}: ${edge.description}\nProvenance: ${edge.provenance}`}</title>

                  {/* Invisible Hitbox for Easy Clicking */}
                  <line
                    x1={src.x}
                    y1={src.y}
                    x2={tgt.x}
                    y2={tgt.y}
                    stroke="transparent"
                    strokeWidth="16"
                  />

                  {/* Selected / Hover Halo Underlay */}
                  {(isSelected || isHovered) && (
                    <line
                      x1={src.x}
                      y1={src.y}
                      x2={tgt.x}
                      y2={tgt.y}
                      stroke={edge.color}
                      strokeWidth="8"
                      strokeOpacity="0.4"
                    />
                  )}

                  {/* Subtle Glow Underlay for Causal Edges */}
                  {isCausalEdge && !isSelected && !isHovered && (
                    <line
                      x1={src.x}
                      y1={src.y}
                      x2={tgt.x}
                      y2={tgt.y}
                      stroke={edge.color}
                      strokeWidth="5"
                      strokeOpacity="0.25"
                    />
                  )}

                  {/* Primary Edge Line */}
                  <line
                    x1={src.x}
                    y1={src.y}
                    x2={tgt.x}
                    y2={tgt.y}
                    stroke={edge.color}
                    strokeWidth={isCausalEdge ? 2.5 : isSelected ? 2.5 : 1.5}
                    strokeDasharray={edge.style === 'dashed' ? '5,4' : edge.style === 'dotted' ? '3,3' : 'none'}
                    markerEnd={markerId}
                  />

                  {/* Edge Label Badge with Safe Clearances */}
                  <g transform={`translate(${midX}, ${midY})`}>
                    <rect
                      x={-halfWidth}
                      y="-9"
                      width={badgeWidth}
                      height="18"
                      rx="4"
                      className="fill-white dark:fill-[#0d121f] stroke-slate-300 dark:stroke-[#222e45]"
                      stroke={isSelected ? '#a78bfa' : isHovered ? '#64748b' : undefined}
                      strokeWidth={isSelected ? 1.5 : 1}
                    />
                    <text
                      textAnchor="middle"
                      y="3.5"
                      fill={edge.color}
                      fontSize="8.5"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="600"
                    >
                      {edge.label}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const isSelected = selectedNodeId === node.id || (!selectedNodeId && !activeEdgeId && node.id === 'node-root-cause');
              const isHovered = hoveredNodeId === node.id;
              const opacity = getNodeOpacity(node.id);

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNodeClick(node);
                  }}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  className="cursor-pointer"
                  style={{ opacity, transition: 'opacity 0.2s ease' }}
                >
                  <title>{`${node.label} (${node.role})\nFile: ${node.filePath}${node.lineRange ? ' ' + node.lineRange : ''}\nProvenance: ${node.provenance}\nDetails: ${node.details}`}</title>
                  {/* Pulsing Outer Ring for Root Cause */}
                  {node.pulse && !isAblated && (
                    <circle
                      r={node.radius + 8}
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="1.5"
                      strokeOpacity="0.4"
                      className="animate-ping"
                    />
                  )}

                  {/* Selected / Hover Ring */}
                  {(isSelected || isHovered) && (
                    <circle
                      r={node.radius + 5}
                      fill="none"
                      stroke={node.color}
                      strokeWidth="2.5"
                      strokeOpacity="0.85"
                    />
                  )}

                  {/* Node Base Circle */}
                  <circle
                    r={node.radius}
                    fill={node.bgColor}
                    stroke={node.borderColor}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    strokeDasharray={node.dashed ? '4,3' : 'none'}
                    filter={node.type === 'root_cause' && !isAblated ? 'url(#glow-root-cause)' : undefined}
                  />

                  {/* Node Role Icon */}
                  {node.type === 'root_cause' ? (
                    <ShieldAlert
                      x="-10"
                      y="-10"
                      className="w-5 h-5 text-rose-400 pointer-events-none"
                    />
                  ) : node.type === 'commit' ? (
                    <GitCommit
                      x="-9"
                      y="-9"
                      className="w-4.5 h-4.5 text-amber-400 pointer-events-none"
                    />
                  ) : node.type === 'memory' ? (
                    <Bug
                      x="-9"
                      y="-9"
                      className="w-4.5 h-4.5 text-emerald-400 pointer-events-none"
                    />
                  ) : node.type === 'decoy' ? (
                    <XCircle
                      x="-9"
                      y="-9"
                      className="w-4.5 h-4.5 text-slate-400 pointer-events-none"
                    />
                  ) : (
                    <CheckCircle2
                      x="-9"
                      y="-9"
                      className="w-4.5 h-4.5 text-violet-300 pointer-events-none"
                    />
                  )}

                  {/* Node Label Text */}
                  <text
                    y={node.radius + 15}
                    textAnchor="middle"
                    className={node.type === 'decoy' ? 'fill-slate-500 dark:fill-slate-400' : 'fill-slate-900 dark:fill-slate-100'}
                    fontSize="11"
                    fontWeight="700"
                    fontFamily="Inter, sans-serif"
                  >
                    {node.label.length > 22 ? `${node.label.slice(0, 20)}…` : node.label}
                  </text>

                  {/* Node File Path / Role Subtext */}
                  <text
                    y={node.radius + 28}
                    textAnchor="middle"
                    className="fill-slate-500 dark:fill-slate-400"
                    fontSize="9.5"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {node.filePath}
                  </text>

                  {/* Role Pill Badge */}
                  <g transform={`translate(0, ${-node.radius - 8})`}>
                    <rect
                      x="-42"
                      y="-8"
                      width="84"
                      height="16"
                      rx="3"
                      className="fill-white dark:fill-[#0c111c]"
                      stroke={node.borderColor}
                      strokeWidth="1"
                      strokeOpacity="0.75"
                    />
                    <text
                      textAnchor="middle"
                      y="4"
                      fill={node.color}
                      fontSize="8"
                      fontWeight="700"
                      fontFamily="Inter, sans-serif"
                    >
                      {node.badge}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Visual Graph Legend */}
        <div className="absolute bottom-3 left-3 bg-white/95 dark:bg-[#0d1320]/95 backdrop-blur border border-slate-200 dark:border-[#1f2c42] rounded-lg px-3 py-2 text-[10px] space-y-1 z-10 shadow-lg transition-colors">
          <div className="font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[9px] mb-1 flex items-center justify-between gap-3">
            <span>Graph Legend & Taxonomy</span>
            <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400">Click node/edge to inspect</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 dark:text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-violet-500" />
              <span>Source Evidence</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
              <span>Inferred Call Hop</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>Leading Root-Cause Hypothesis</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span>Introducing Change</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span>Historical Precedent</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border border-dashed border-slate-400 dark:border-slate-500 bg-slate-200 dark:bg-slate-800" />
              <span>Rejected Decoy</span>
            </span>
          </div>
        </div>
      </div>

      {/* Contextual Evidence Inspector (Node OR Edge) */}
      {activeSelectedEdge ? (
        /* Edge Inspector */
        <div className="px-4 py-3 bg-white dark:bg-[#0e1424] border-t border-slate-200 dark:border-[#1b2537] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: activeSelectedEdge.color }}
              />
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                Edge: <code className="text-violet-600 dark:text-violet-300 font-mono">{activeSelectedEdge.label}</code>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300 dark:bg-[#182136] dark:text-slate-300 dark:border-[#263450]">
                {activeSelectedEdge.relationshipType}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800/40">
                Provenance: {activeSelectedEdge.provenance}
              </span>
            </div>

            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              {activeSelectedEdge.description}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const srcNode = nodeMap.get(activeSelectedEdge.source);
                if (srcNode) handleNodeClick(srcNode);
              }}
              className="px-2.5 py-1 text-[11px] rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-[#162035] dark:hover:bg-[#1e2a44] dark:text-slate-200 dark:border-[#283750] transition-colors cursor-pointer"
            >
              Inspect Source
            </button>
            <button
              type="button"
              onClick={() => {
                const tgtNode = nodeMap.get(activeSelectedEdge.target);
                if (tgtNode) handleNodeClick(tgtNode);
              }}
              className="px-2.5 py-1 text-[11px] rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-[#162035] dark:hover:bg-[#1e2a44] dark:text-slate-200 dark:border-[#283750] transition-colors cursor-pointer"
            >
              Inspect Target
            </button>
            <button
              type="button"
              onClick={() => {
                setInternalSelectedEdgeId(null);
                if (onSelectEdge) onSelectEdge(null);
              }}
              className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer underline ml-1"
            >
              Clear Edge
            </button>
          </div>
        </div>
      ) : activeSelectedNode ? (
        /* Node Inspector */
        <div className="px-4 py-3 bg-white dark:bg-[#0e1424] border-t border-slate-200 dark:border-[#1b2537] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: activeSelectedNode.color }}
              />
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                Node: <code className="text-violet-600 dark:text-violet-300 font-mono">{activeSelectedNode.label}</code>
              </span>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                ({activeSelectedNode.filePath} {activeSelectedNode.lineRange ? activeSelectedNode.lineRange : ''})
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300 dark:bg-[#182136] dark:text-slate-300 dark:border-[#263450]">
                {activeSelectedNode.role}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800/40">
                Provenance: {activeSelectedNode.provenance}
              </span>
            </div>

            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              {activeSelectedNode.details}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeSelectedNode.type === 'decoy' && (
              <span className="text-[10px] font-mono px-2 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/40 font-semibold">
                Refuted by Call Graph
              </span>
            )}
            {activeSelectedNode.type === 'root_cause' && (
              <span className="text-[10px] font-mono px-2 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/40 font-semibold">
                {isAblated ? 'Ablated from Traversal' : 'Graph-Supported Candidate'}
              </span>
            )}
            {activeSelectedNode.type === 'commit' && (
              <span className="text-[10px] font-mono px-2 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/40 font-semibold">
                Suspected Introducing Refactor
              </span>
            )}
            {activeSelectedNode.type === 'memory' && (
              <span className="text-[10px] font-mono px-2 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/40 font-semibold">
                Historical Institutional Fix
              </span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
