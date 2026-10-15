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
  Info
} from 'lucide-react';

export default function CausalGraphCanvas({
  investigation,
  onSelectNode,
  selectedNodeId,
  className = ''
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);

  // Width and height of canvas coordinate space
  const canvasWidth = 780;
  const canvasHeight = 440;

  // Build the graph nodes and edges from the investigation payload
  const { nodes, edges } = useMemo(() => {
    if (!investigation) {
      return { nodes: [], edges: [] };
    }

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

    // Fixed readable positions for the causal chain layout
    const n = [
      // 1. API Entrypoint
      {
        id: 'node-entrypoint',
        label: 'handlePaymentRequest',
        filePath: entryPointPath,
        lineRange: 'L12-L45',
        type: 'entrypoint',
        role: 'API Entrypoint',
        category: 'Entrypoint',
        x: 100,
        y: 220,
        radius: 28,
        color: '#8b5cf6', // Violet
        bgColor: '#1e1438',
        borderColor: '#a78bfa',
        details: 'Incoming payment settlement endpoint receiving HTTP requests from clients.',
        badge: 'Entry'
      },
      // 2. Intermediate Hop: Token Verification
      {
        id: 'node-hop',
        label: 'verifyToken',
        filePath: 'services/auth.js',
        lineRange: 'L34-L62',
        type: 'call_hop',
        role: 'Authentication & Token Validation',
        category: 'Intermediate Hop',
        x: 290,
        y: 220,
        radius: 26,
        color: '#06b6d4', // Cyan
        bgColor: '#082531',
        borderColor: '#22d3ee',
        details: 'Validates client authorization header and requests token allocation from bucket.',
        badge: 'Hop 1'
      },
      // 3. True Root Cause: acquireTokenLock in tokenBucket.js
      {
        id: 'node-root-cause',
        label: rootCauseSymbol,
        filePath: rootCauseFile,
        lineRange: 'L54-L88',
        type: 'root_cause',
        role: 'True Root Cause (Lock Starvation)',
        category: 'Root Cause',
        x: 500,
        y: 220,
        radius: 34,
        color: '#f43f5e', // Rose/Crimson
        bgColor: '#310a14',
        borderColor: '#fb7185',
        details: 'Acquires blocking thread mutex without timeout, causing complete thread pool starvation under high concurrency.',
        badge: 'Root Cause',
        pulse: true
      },
      // 4. Suspect Refactor Commit
      {
        id: 'node-commit',
        label: `Commit ${suspectCommit.slice(0, 7)}`,
        filePath: rootCauseFile,
        type: 'commit',
        role: 'Suspected Introducing Change',
        category: 'Commit',
        x: 500,
        y: 80,
        radius: 24,
        color: '#f59e0b', // Amber
        bgColor: '#2a1a06',
        borderColor: '#fbbf24',
        details: `Suspected introducing change: commit ${suspectCommit.slice(0, 7)} modified ${rootCauseFile}.`,
        badge: 'Introducing Change'
      },
      // 5. Rejected Decoy: checkRateLimit in rateLimiter.js
      {
        id: 'node-decoy',
        label: decoySymbol,
        filePath: decoyFile,
        lineRange: 'L18-L35',
        type: 'decoy',
        role: 'Rejected Decoy (Keyword Trap)',
        category: 'Rejected Decoy',
        x: 290,
        y: 360,
        radius: 24,
        color: '#94a3b8', // Gray/Amber
        bgColor: '#161d28',
        borderColor: '#64748b',
        details: 'Identified by naive keyword search due to text match on "rate limit". Disproven by graph traversal as uncalled in causal path.',
        badge: 'Decoy (Rejected)',
        dashed: true
      },
      // 6. Historical Memory Precedent
      {
        id: 'node-memory',
        label: priorFix?.title || 'Worker Thread Lock Starvation',
        filePath: rootCauseFile,
        type: 'memory',
        role: 'Historical Fix Precedent',
        category: 'Historical Precedent',
        x: 690,
        y: 220,
        radius: 26,
        color: '#10b981', // Emerald
        bgColor: '#06261c',
        borderColor: '#34d399',
        details: `Historical fix recorded in commit ${fixCommitSha.slice(0, 7)}: ${priorFix?.fixSummary || 'Enforce non-blocking tryAcquire with circuit breaker timeout.'}`,
        badge: `Historical Fix: ${fixCommitSha.slice(0, 7)}`
      }
    ];

    const e = [
      // 1. Entrypoint -> verifyToken (Causal Call Path)
      {
        id: 'edge-1',
        source: 'node-entrypoint',
        target: 'node-hop',
        label: 'CALLS (sync)',
        isCausal: true,
        color: '#a78bfa',
        style: 'solid'
      },
      // 2. verifyToken -> acquireTokenLock (Causal Call Path)
      {
        id: 'edge-2',
        source: 'node-hop',
        target: 'node-root-cause',
        label: 'CALLS (blocking)',
        isCausal: true,
        color: '#f43f5e',
        style: 'solid'
      },
      // 3. Commit -> acquireTokenLock (Introduced regression)
      {
        id: 'edge-3',
        source: 'node-commit',
        target: 'node-root-cause',
        label: 'INTRODUCES_REGRESSION',
        isCausal: false,
        color: '#fbbf24',
        style: 'dashed'
      },
      // 4. Entrypoint -> Decoy (Keyword association - Rejected)
      {
        id: 'edge-4',
        source: 'node-entrypoint',
        target: 'node-decoy',
        label: 'KEYWORD MATCH (UNREACHABLE)',
        isCausal: false,
        color: '#64748b',
        style: 'dotted'
      },
      // 5. Root Cause -> Historical Memory Precedent
      {
        id: 'edge-5',
        source: 'node-root-cause',
        target: 'node-memory',
        label: `RESOLVED_BY (${fixCommitSha.slice(0, 7)})`,
        isCausal: false,
        color: '#34d399',
        style: 'solid'
      }
    ];

    return { nodes: n, edges: e };
  }, [investigation]);

  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

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
  };

  const activeNode = nodes.find(n => n.id === selectedNodeId) || nodes.find(n => n.id === 'node-root-cause');

  return (
    <div className={`relative flex flex-col rounded-xl border border-[#1f2a3f] bg-[#0c101a] overflow-hidden select-none ${className}`}>
      {/* Canvas Top Bar: Status, Scope & Controls */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1b2537] bg-[#0f1422] z-10">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-semibold text-slate-200">
            FalkorDB Causal Dependency Chain
          </span>
          <span className="text-[11px] font-mono text-slate-400 px-2 py-0.5 rounded bg-[#161f30] border border-[#232f46]">
            {nodes.length} nodes · 2 call hops
          </span>
        </div>

        {/* Zoom & Reset Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom(prev => Math.min(prev + 0.15, 2.5))}
            className="p-1 rounded hover:bg-[#1a2336] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(prev => Math.max(prev - 0.15, 0.5))}
            className="p-1 rounded hover:bg-[#1a2336] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="p-1 rounded hover:bg-[#1a2336] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer text-[11px] font-mono flex items-center gap-1 px-1.5"
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
        className={`w-full h-[400px] sm:h-[440px] relative overflow-hidden ${
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
              id="arrow-teal"
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
              <circle cx="2" cy="2" r="1" fill="#1b2436" />
            </pattern>
            <rect x="-1000" y="-1000" width="3000" height="3000" fill="url(#grid)" opacity="0.6" />

            {/* Edges */}
            {edges.map((edge) => {
              const src = nodeMap.get(edge.source);
              const tgt = nodeMap.get(edge.target);
              if (!src || !tgt) return null;

              const isCausalEdge = edge.isCausal;
              const markerId = edge.color === '#f43f5e' ? 'url(#arrow-causal)' : edge.color === '#22d3ee' || edge.color === '#a78bfa' ? 'url(#arrow-teal)' : edge.color === '#fbbf24' ? 'url(#arrow-amber)' : edge.color === '#34d399' ? 'url(#arrow-emerald)' : undefined;

              // Calculate midpoint for edge label
              const midX = (src.x + tgt.x) / 2;
              const midY = (src.y + tgt.y) / 2 - (edge.source === 'node-commit' ? 10 : 8);

              return (
                <g key={edge.id}>
                  {/* Subtle Glow Underlay for Causal Edges */}
                  {isCausalEdge && (
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
                    strokeWidth={isCausalEdge ? 2.5 : 1.5}
                    strokeDasharray={edge.style === 'dashed' ? '5,4' : edge.style === 'dotted' ? '3,3' : 'none'}
                    strokeOpacity={edge.color === '#64748b' ? 0.5 : 0.85}
                    markerEnd={markerId}
                  />

                  {/* Edge Label Badge */}
                  <g transform={`translate(${midX}, ${midY})`}>
                    <rect
                      x="-55"
                      y="-9"
                      width="110"
                      height="18"
                      rx="4"
                      fill="#0d121f"
                      stroke="#222e45"
                      strokeWidth="1"
                    />
                    <text
                      textAnchor="middle"
                      y="3.5"
                      fill={edge.color}
                      fontSize="9"
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
              const isSelected = selectedNodeId === node.id || (!selectedNodeId && node.id === 'node-root-cause');
              const isHovered = hoveredNodeId === node.id;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectNode) onSelectNode(node);
                  }}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  className="cursor-pointer"
                >
                  {/* Pulsing Outer Ring for Root Cause */}
                  {node.pulse && (
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
                      strokeWidth="2"
                      strokeOpacity="0.8"
                    />
                  )}

                  {/* Node Base Circle */}
                  <circle
                    r={node.radius}
                    fill={node.bgColor}
                    stroke={node.borderColor}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    strokeDasharray={node.dashed ? '4,3' : 'none'}
                    filter={node.type === 'root_cause' ? 'url(#glow-root-cause)' : undefined}
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
                    fill={node.type === 'decoy' ? '#94a3b8' : '#f1f5f9'}
                    fontSize="11"
                    fontWeight="700"
                    fontFamily="Inter, sans-serif"
                  >
                    {node.label}
                  </text>

                  {/* Node File Path / Role Subtext */}
                  <text
                    y={node.radius + 28}
                    textAnchor="middle"
                    fill="#64748b"
                    fontSize="9.5"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {node.filePath}
                  </text>

                  {/* Role Pill Badge */}
                  <g transform={`translate(0, ${-node.radius - 8})`}>
                    <rect
                      x="-38"
                      y="-8"
                      width="76"
                      height="16"
                      rx="3"
                      fill="#0c111c"
                      stroke={node.borderColor}
                      strokeWidth="1"
                      strokeOpacity="0.7"
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

        {/* Compact Graph Legend */}
        <div className="absolute bottom-3 left-3 bg-[#0d1320]/90 backdrop-blur border border-[#1f2c42] rounded-lg px-3 py-2 text-[10px] space-y-1 z-10">
          <div className="font-semibold text-slate-300 uppercase tracking-wider text-[9px] mb-1">
            Legend
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-violet-400" />
              <span>Entrypoint</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>Call Hop</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span>Root Cause</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Commit</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Bug Memory</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full border border-dashed border-slate-400" />
              <span>Rejected Decoy</span>
            </span>
          </div>
        </div>
      </div>

      {/* Selected Node Inspector Banner */}
      {activeNode && (
        <div className="px-4 py-2.5 bg-[#0e1424] border-t border-[#1b2537] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: activeNode.color }}
            />
            <span className="font-semibold text-slate-200">
              Selected: <code className="text-violet-300">{activeNode.label}</code> ({activeNode.filePath})
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#182136] text-slate-300 border border-[#263450]">
              {activeNode.role}
            </span>
          </div>

          <p className="text-[11px] text-slate-400 truncate max-w-md">
            {activeNode.details}
          </p>
        </div>
      )}
    </div>
  );
}
