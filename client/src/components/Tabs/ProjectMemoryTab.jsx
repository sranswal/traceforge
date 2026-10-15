import React, { useState, useMemo, useRef } from 'react';
import {
  Database,
  Bug,
  Wrench,
  FileText,
  GitFork,
  GitCommit,
  Code2,
  PlusCircle,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Layers,
  Sparkles,
  Loader2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  FolderTree,
  Folder,
  FolderOpen,
  FileCode,
  ChevronRight,
  ChevronDown,
  FlaskConical,
  Link2,
  MessageSquare
} from 'lucide-react';
import { buildEntityInvestigationPrompt } from '../../utils/analysisPayload';

const NODE_STYLES = {
  Repository: {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    border: 'border-blue-300 dark:border-blue-800',
    text: 'text-blue-700 dark:text-[#58a6ff]',
    dot: '#3b82f6',
    radius: 22
  },
  Component: {
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    border: 'border-indigo-300 dark:border-indigo-800',
    text: 'text-indigo-700 dark:text-indigo-300',
    dot: '#6366f1',
    radius: 17
  },
  Bug: {
    bg: 'bg-red-50 dark:bg-red-950/40',
    border: 'border-red-300 dark:border-red-800',
    text: 'text-red-700 dark:text-red-400',
    dot: '#ef4444',
    radius: 15
  },
  Fix: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-emerald-300 dark:border-emerald-800',
    text: 'text-emerald-700 dark:text-[#3fb950]',
    dot: '#10b981',
    radius: 15
  },
  TechnicalDecision: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-300 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-400',
    dot: '#f59e0b',
    radius: 15
  },
  File: {
    bg: 'bg-neutral-100 dark:bg-[#21262d]',
    border: 'border-neutral-300 dark:border-[#30363d]',
    text: 'text-neutral-700 dark:text-[#c9d1d9]',
    dot: '#8b949e',
    radius: 14
  },
  Function: {
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    border: 'border-purple-300 dark:border-purple-800',
    text: 'text-purple-700 dark:text-purple-300',
    dot: '#a855f7',
    radius: 13
  },
  Class: {
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    border: 'border-purple-300 dark:border-purple-800',
    text: 'text-purple-700 dark:text-purple-300',
    dot: '#a855f7',
    radius: 14
  },
  Symbol: {
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    border: 'border-purple-300 dark:border-purple-800',
    text: 'text-purple-700 dark:text-purple-300',
    dot: '#a855f7',
    radius: 13
  },
  Commit: {
    bg: 'bg-cyan-50 dark:bg-cyan-950/40',
    border: 'border-cyan-300 dark:border-cyan-800',
    text: 'text-cyan-700 dark:text-cyan-300',
    dot: '#06b6d4',
    radius: 13
  },
  Test: {
    bg: 'bg-teal-50 dark:bg-teal-950/40',
    border: 'border-teal-300 dark:border-teal-800',
    text: 'text-teal-700 dark:text-teal-300',
    dot: '#14b8a6',
    radius: 13
  }
};

const RECORDED_EDGE_TYPES = new Set([
  'BUG_AFFECTS_COMPONENT',
  'BUG_AFFECTS_FILE',
  'FIX_RESOLVES_BUG',
  'FIX_APPLIED_IN_COMMIT',
  'DECISION_AFFECTS_COMPONENT'
]);

function ProvenanceBadge({ provenance }) {
  if (!provenance) return null;
  const isRecorded = provenance.toLowerCase().includes('recorded');
  return (
    <span
      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
        isRecorded
          ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/50'
          : 'bg-neutral-100 dark:bg-[#21262d] text-neutral-600 dark:text-[#8b949e] border-neutral-200 dark:border-[#30363d]'
      }`}
    >
      {isRecorded ? `Recorded Memory · ${provenance}` : `Source-Derived · ${provenance}`}
    </span>
  );
}

function FileTreeItem({ node, depth = 0, filterText = '', onSelectTreeNode, selectedPath }) {
  const [isOpen, setIsOpen] = useState(depth === 0 || Boolean(filterText));
  const isDirectory = node.type === 'directory';
  const formattedSize = node.size ? `${(node.size / 1024).toFixed(1)} KB` : null;
  const isSelected = selectedPath === node.path;

  return (
    <div className="text-xs font-mono select-none">
      <div
        onClick={() => {
          if (isDirectory) setIsOpen(!isOpen);
          onSelectTreeNode(node);
        }}
        className={`flex items-center gap-1.5 py-1 px-2 rounded transition-colors cursor-pointer group ${
          isSelected
            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-[#58a6ff] font-semibold'
            : isDirectory
              ? 'text-neutral-800 dark:text-[#f0f6fc] font-medium hover:bg-neutral-100 dark:hover:bg-[#21262d]'
              : 'text-neutral-600 dark:text-[#8b949e] hover:bg-neutral-100 dark:hover:bg-[#21262d]'
        }`}
        style={{ paddingLeft: `${depth * 1.1 + 0.5}rem` }}
      >
        {isDirectory ? (
          <>
            <span className="text-neutral-400 dark:text-[#6e7681] w-3 shrink-0">
              {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </span>
            {isOpen ? (
              <FolderOpen className="w-3.5 h-3.5 text-blue-500 dark:text-[#58a6ff] shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-blue-500 dark:text-[#58a6ff] shrink-0" />
            )}
            <span className="truncate">{node.name}</span>
            {node.fileCount > 0 && (
              <span className="text-[10px] text-neutral-400 dark:text-[#6e7681] font-sans font-normal ml-1">
                ({node.fileCount})
              </span>
            )}
            {node.role && (
              <span className="ml-auto text-[10px] font-sans font-normal px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-600 dark:text-[#8b949e] border border-neutral-200 dark:border-[#30363d] hidden sm:inline">
                {node.role}
              </span>
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <FileCode className="w-3.5 h-3.5 text-neutral-400 dark:text-[#6e7681] shrink-0" />
            <span className="truncate group-hover:text-blue-600 dark:group-hover:text-[#58a6ff]">
              {node.name}
            </span>
            {formattedSize && (
              <span className="ml-auto text-[10px] text-neutral-400 dark:text-[#6e7681] font-sans">
                {formattedSize}
              </span>
            )}
          </>
        )}
      </div>

      {isDirectory && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              filterText={filterText}
              onSelectTreeNode={onSelectTreeNode}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProjectMemoryTab({
  analysisData,
  memoryOverview,
  graphHealth,
  isLoadingMemory,
  memoryError,
  onRefreshMemory,
  onAskInCodebase
}) {
  const rawProvider = memoryOverview?.provider || graphHealth?.provider || analysisData?.projectMemory?.provider;
  const providerName = 'FalkorDB';

  // Left workspace view mode: 'graph' (Graph Canvas) or 'files' (Integrated Repository File Tree)
  const [workspaceMode, setWorkspaceMode] = useState('graph');

  // Graph search, node-type filter, selection & viewport state
  const [graphSearch, setGraphSearch] = useState('');
  const [nodeTypeFilter, setNodeTypeFilter] = useState('ALL');
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [customEntity, setCustomEntity] = useState(null);

  // Zoom & Pan state for SVG Graph Canvas
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Collapsible Record Memory Drawer State
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [recordMode, setRecordMode] = useState('bug_fix'); // 'bug_fix' | 'decision'
  const [bugTitle, setBugTitle] = useState('');
  const [bugDescription, setBugDescription] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [severity, setSeverity] = useState('high');
  const [componentPath, setComponentPath] = useState('');
  const [filePath, setFilePath] = useState('');
  const [fixSummary, setFixSummary] = useState('');
  const [commitSha, setCommitSha] = useState('');
  const [decisionTitle, setDecisionTitle] = useState('');
  const [decisionRationale, setDecisionRationale] = useState('');
  const [decisionStatus, setDecisionStatus] = useState('accepted');
  const [decisionComponent, setDecisionComponent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(null);

  // Bottom memory cards filter
  const [cardFilter, setCardFilter] = useState('all');

  const repoFullName = analysisData?.repository?.fullName || '';
  const isConnected = Boolean(memoryOverview?.connected && memoryOverview?.status === 'connected');
  const isConfigured = Boolean(
    memoryOverview?.configured ?? analysisData?.projectMemory?.status !== 'unconfigured'
  );

  const counts = memoryOverview?.counts || {
    files: analysisData?.projectMemory?.counts?.files || analysisData?.metrics?.totalFiles || 0,
    components: analysisData?.projectMemory?.counts?.components || 0,
    symbols: analysisData?.projectMemory?.counts?.symbols || 0,
    decisions: memoryOverview?.decisions?.length || 0,
    bugs: memoryOverview?.bugsAndFixes?.length || 0,
    fixes: memoryOverview?.bugsAndFixes?.filter(b => b.fixSummary)?.length || 0,
    commits: memoryOverview?.recentCommits?.length || 0,
    relationships: 0
  };

  const availableComponents = useMemo(() => {
    const dirs = (analysisData?.structure?.classifiedDirectories || []).map(d =>
      d.path.replace(/^\/+/, '')
    );
    const defaults = ['server', 'client', 'api', 'services', 'root'];
    return Array.from(new Set([...dirs, ...defaults]));
  }, [analysisData]);

  // Build fallback Repository node if FalkorDB is disconnected or empty so the inspector always has honest repository context
  const rawGraphNodes = useMemo(() => {
    const nodes = memoryOverview?.graph?.nodes || [];
    if (nodes.length > 0) return nodes;
    if (!repoFullName) return [];
    return [
      {
        id: repoFullName.toLowerCase(),
        label: 'Repository',
        type: 'Repository',
        title: repoFullName,
        subtitle: analysisData?.projectType || 'GitHub Repository',
        provenance: 'Repository Scan',
        details: {
          fullName: repoFullName,
          primaryLanguage: analysisData?.repository?.primaryLanguage || 'Unknown',
          pattern: analysisData?.architecture?.pattern || 'Standard',
          totalFiles: analysisData?.metrics?.totalFiles || 0
        }
      }
    ];
  }, [memoryOverview, repoFullName, analysisData]);

  const rawGraphEdges = memoryOverview?.graph?.edges || [];

  // Filter graph nodes by search query and nodeTypeFilter
  const filteredGraphData = useMemo(() => {
    const q = graphSearch.trim().toLowerCase();
    const matchingNodes = rawGraphNodes.filter((n) => {
      const nLabel = n.label || n.type;
      const matchesType =
        nodeTypeFilter === 'ALL' ||
        nLabel === nodeTypeFilter ||
        (nodeTypeFilter === 'Symbol' && (nLabel === 'Function' || nLabel === 'Class' || nLabel === 'Symbol'));
      if (!matchesType) return false;
      if (!q) return true;
      return (
        n.title?.toLowerCase().includes(q) ||
        n.subtitle?.toLowerCase().includes(q) ||
        nLabel?.toLowerCase().includes(q) ||
        JSON.stringify(n.details || {}).toLowerCase().includes(q)
      );
    });

    // Always include Repository root or connected endpoints if filtering leaves nodes isolated
    const nodeIds = new Set(matchingNodes.map(n => n.id));
    const matchingEdges = rawGraphEdges.filter(
      e => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    return { nodes: matchingNodes, edges: matchingEdges };
  }, [rawGraphNodes, rawGraphEdges, graphSearch, nodeTypeFilter]);

  // Compute deterministic concentric multi-ring layout for the interactive SVG Graph Explorer
  const positionedGraph = useMemo(() => {
    const nodes = filteredGraphData.nodes.slice(0, 36);
    if (nodes.length === 0) return { nodes: [], edges: [] };

    const width = 760;
    const height = 480;
    const centerX = width / 2;
    const centerY = height / 2;

    const ring1 = []; // Components
    const ring2 = []; // Files, Decisions, Bugs, Commits
    const ring3 = []; // Functions, Classes, Fixes, Tests
    let repoNode = null;

    for (const n of nodes) {
      const lbl = n.label || n.type;
      if (lbl === 'Repository' && !repoNode) {
        repoNode = n;
      } else if (lbl === 'Component') {
        ring1.push(n);
      } else if (lbl === 'File' || lbl === 'TechnicalDecision' || lbl === 'Bug' || lbl === 'Commit') {
        ring2.push(n);
      } else {
        ring3.push(n);
      }
    }

    const positioned = [];
    if (repoNode) {
      positioned.push({ ...repoNode, x: centerX, y: centerY });
    }

    const placeRing = (items, rx, ry, angleOffset = 0) => {
      items.forEach((item, idx) => {
        const angle = angleOffset + (2 * Math.PI * idx) / Math.max(items.length, 1);
        positioned.push({
          ...item,
          x: Math.round(centerX + Math.cos(angle) * rx),
          y: Math.round(centerY + Math.sin(angle) * ry)
        });
      });
    };

    placeRing(ring1, 125, 85, 0.15);
    placeRing(ring2, 235, 155, 0.45);
    placeRing(ring3, 330, 210, 0.8);

    const nodeById = new Map(positioned.map(n => [n.id, n]));
    const validEdges = filteredGraphData.edges
      .filter(e => nodeById.has(e.source) && nodeById.has(e.target))
      .map(e => ({
        ...e,
        sourceNode: nodeById.get(e.source),
        targetNode: nodeById.get(e.target)
      }));

    return { nodes: positioned, edges: validEdges, nodeById };
  }, [filteredGraphData]);

  // Determine active selected node or edge
  const activeNode = useMemo(() => {
    if (customEntity) return customEntity;
    if (selectedNodeId && positionedGraph.nodeById?.has(selectedNodeId)) {
      return positionedGraph.nodeById.get(selectedNodeId);
    }
    const fullMatch = rawGraphNodes.find(n => n.id === selectedNodeId);
    if (fullMatch) return fullMatch;
    return positionedGraph.nodes[0] || rawGraphNodes[0] || null;
  }, [customEntity, selectedNodeId, positionedGraph, rawGraphNodes]);

  const activeEdge = useMemo(() => {
    if (!selectedEdgeId) return null;
    return positionedGraph.edges.find(e => e.id === selectedEdgeId) || null;
  }, [selectedEdgeId, positionedGraph]);

  // Compute 1-hop neighbors and incident edges for highlighting in the graph and listing in the inspector
  const { neighborIds, incidentEdges } = useMemo(() => {
    const nIds = new Set();
    const inc = [];
    if (!activeNode) return { neighborIds: nIds, incidentEdges: inc };

    nIds.add(activeNode.id);
    const allNodesMap = new Map(rawGraphNodes.map(n => [n.id, n]));

    for (const edge of rawGraphEdges) {
      if (edge.source === activeNode.id) {
        nIds.add(edge.target);
        inc.push({
          ...edge,
          direction: 'outbound',
          otherNode: allNodesMap.get(edge.target)
        });
      } else if (edge.target === activeNode.id) {
        nIds.add(edge.source);
        inc.push({
          ...edge,
          direction: 'inbound',
          otherNode: allNodesMap.get(edge.source)
        });
      }
    }
    return { neighborIds: nIds, incidentEdges: inc };
  }, [activeNode, rawGraphNodes, rawGraphEdges]);

  // Filtered repository file tree (replaces standalone FilesTab)
  const filteredFileTree = useMemo(() => {
    const tree = analysisData?.structure?.tree || [];
    if (!graphSearch.trim()) return tree;
    const term = graphSearch.toLowerCase().trim();

    function filterNode(node) {
      if (node.name.toLowerCase().includes(term) || node.path?.toLowerCase().includes(term)) {
        return node;
      }
      if (node.children) {
        const matchingChildren = node.children.map(filterNode).filter(Boolean);
        if (matchingChildren.length > 0) {
          return { ...node, children: matchingChildren };
        }
      }
      return null;
    }

    return tree.map(filterNode).filter(Boolean);
  }, [analysisData?.structure?.tree, graphSearch]);

  // Matching flat file paths when searching in large repositories
  const matchingFlatFiles = useMemo(() => {
    const q = graphSearch.trim().toLowerCase();
    if (!q) return [];
    const allPaths = analysisData?.aiContextReady?.filePaths || [];
    return allPaths.filter(p => p.toLowerCase().includes(q)).slice(0, 30);
  }, [analysisData?.aiContextReady?.filePaths, graphSearch]);

  // Select a file or directory from the file tree / search results and load it into the Inspector
  const handleSelectFileOrDir = (treeNodeOrPath) => {
    setSelectedEdgeId(null);
    const pathStr = typeof treeNodeOrPath === 'string' ? treeNodeOrPath : treeNodeOrPath.path;
    const isDir = typeof treeNodeOrPath === 'object' && treeNodeOrPath.type === 'directory';
    const cleanPath = String(pathStr || '').replace(/^\/+/, '');

    // Check if there is already a matching node in rawGraphNodes
    const existingGraphNode = rawGraphNodes.find(
      n =>
        (n.label === (isDir ? 'Component' : 'File')) &&
        (n.title === cleanPath || n.details?.path === cleanPath)
    );

    if (existingGraphNode) {
      setCustomEntity(null);
      setSelectedNodeId(existingGraphNode.id);
      return;
    }

    // Build an inspector entity backed by real static analysis & symbol data for this file/directory
    const fileSymbols = (memoryOverview?.symbols || []).filter(s => s.filePath === cleanPath);
    const ext = cleanPath.includes('.') ? '.' + cleanPath.split('.').pop() : 'None';
    const topComp = cleanPath.includes('/') ? cleanPath.split('/')[0] : 'root';

    setCustomEntity({
      id: `${repoFullName}::${isDir ? 'component' : 'file'}::${cleanPath}`,
      label: isDir ? 'Component' : 'File',
      type: isDir ? 'Component' : 'File',
      title: cleanPath,
      subtitle: isDir
        ? treeNodeOrPath.role || 'Repository Directory'
        : `Source File (${ext})`,
      provenance: 'Repository Scan (Git Trees API)',
      details: isDir
        ? {
            path: cleanPath,
            role: treeNodeOrPath.role || 'Directory',
            indexedFiles: treeNodeOrPath.fileCount || 0
          }
        : {
            path: cleanPath,
            extension: ext,
            size: treeNodeOrPath.size ? `${(treeNodeOrPath.size / 1024).toFixed(1)} KB` : 'Scanned via Git Tree',
            component: topComp,
            extractedSymbolsCount: fileSymbols.length,
            extractedSymbols: fileSymbols.map(s => `${s.name} (L${s.startLine}-L${s.endLine})`).join(', ') || 'None extracted'
          }
    });
  };

  // Zoom & Pan handlers
  const handleZoomIn = () => setZoom(z => Math.min(z + 0.2, 2.4));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.2, 0.5));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e) => {
    if (e.target.closest('[data-graph-interactive="true"]')) return;
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

  const handleInvestigateEntity = (entity) => {
    if (!entity || !onAskInCodebase) return;
    const entityRepo =
      entity.repoFullName ||
      (typeof entity.id === 'string' &&
        entity.id.includes('::') &&
        entity.id.split('::')[0].includes('/')
        ? entity.id.split('::')[0]
        : null) ||
      (entity.label === 'Repository' && entity.title && entity.title.includes('/')
        ? entity.title
        : null) ||
      repoFullName;

    const prompt = buildEntityInvestigationPrompt(entity, entityRepo);
    onAskInCodebase(prompt, {
      id: entity.id,
      label: entity.label || entity.type,
      title: entity.title,
      subtitle: entity.subtitle,
      provenance: entity.provenance,
      repoFullName: entityRepo,
      details: entity.details || {}
    });
  };

  const handleOpenRecordForEntity = (mode, entity) => {
    setRecordMode(mode);
    setIsRecordOpen(true);
    if (entity) {
      const lbl = entity.label || entity.type;
      if (lbl === 'Component') {
        setComponentPath(entity.title);
        setDecisionComponent(entity.title);
      } else if (lbl === 'File') {
        setFilePath(entity.title);
        const topSeg = entity.title.includes('/') ? entity.title.split('/')[0] : 'root';
        setComponentPath(topSeg);
        setDecisionComponent(topSeg);
      } else if (entity.details?.filePath && entity.details.filePath !== 'N/A') {
        setFilePath(entity.details.filePath);
      }
    }
  };

  const handleLoadDemoPreset = () => {
    setSaveFeedback(null);
    const defaultComp = availableComponents[0] || 'server';
    const defaultFile =
      analysisData?.architecture?.entryPoints?.[0]?.path || 'server/analyzer/github.js';

    if (recordMode === 'bug_fix') {
      setBugTitle('Authentication API 401 error on valid tokens due to clock skew');
      setBugDescription(
        'Token verification rejected newly issued JWT tokens when API gateway clock drifted by 5-15 seconds.'
      );
      setSymptoms('Intermittent 401 Unauthorized responses on protected API endpoints.');
      setSeverity('high');
      setComponentPath(defaultComp);
      setFilePath(defaultFile);
      setFixSummary('Added 30-second clock skew grace window in token verification.');
      setCommitSha('9f8e7d6');
    } else {
      setDecisionTitle('Enforce strict stateless JWT exp claim validation');
      setDecisionRationale(
        'Validating token expiry claims at the routing boundary avoids stateful session store lookups on every request.'
      );
      setDecisionStatus('accepted');
      setDecisionComponent(defaultComp);
    }
  };

  const handleSubmitRecord = async (e) => {
    e.preventDefault();
    setSaveFeedback(null);

    if (!repoFullName) {
      setSaveFeedback({ type: 'error', message: 'No active repository loaded.' });
      return;
    }

    if (recordMode === 'bug_fix') {
      if (!bugTitle.trim() || !bugDescription.trim()) {
        setSaveFeedback({ type: 'error', message: 'Bug title and description are both required.' });
        return;
      }
    } else {
      if (!decisionTitle.trim() || !decisionRationale.trim()) {
        setSaveFeedback({
          type: 'error',
          message: 'Decision title and rationale are both required.'
        });
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload =
        recordMode === 'bug_fix'
          ? {
              type: 'bug_fix',
              repoFullName,
              bugTitle: bugTitle.trim(),
              bugDescription: bugDescription.trim(),
              symptoms: symptoms.trim() || undefined,
              severity,
              componentPath: componentPath.trim() || 'server',
              filePath: filePath.trim() || undefined,
              fixSummary: fixSummary.trim() || undefined,
              commitSha: commitSha.trim() || undefined
            }
          : {
              type: 'decision',
              repoFullName,
              decisionTitle: decisionTitle.trim(),
              decisionRationale: decisionRationale.trim(),
              decisionStatus,
              componentPath: decisionComponent.trim() || componentPath.trim() || 'server',
              filePath: filePath.trim() || undefined,
              commitSha: commitSha.trim() || undefined
            };

      const res = await fetch('/api/memory/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to record entry in ${providerName}.`);
      }

      setSaveFeedback({
        type: 'success',
        message:
          recordMode === 'decision'
            ? `Saved Technical Decision in ${providerName} (${data.decisionId})`
            : `Saved Bug & Fix in ${providerName} (${data.bugId})`
      });

      if (recordMode === 'bug_fix') {
        setBugTitle('');
        setBugDescription('');
        setSymptoms('');
        setFixSummary('');
        setCommitSha('');
      } else {
        setDecisionTitle('');
        setDecisionRationale('');
      }

      if (onRefreshMemory) {
        await onRefreshMemory();
      }
    } catch (err) {
      setSaveFeedback({ type: 'error', message: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  // Related symbols, decisions, and bugs for the currently inspected entity
  const relatedEntityData = useMemo(() => {
    if (!activeNode) return { symbols: [], bugs: [], decisions: [], dependencies: [] };
    const lbl = activeNode.label || activeNode.type;
    const pathTarget = activeNode.details?.path || activeNode.title || '';

    const symbols = (memoryOverview?.symbols || []).filter(s => {
      if (lbl === 'File') return s.filePath === pathTarget;
      if (lbl === 'Component') return s.filePath?.startsWith(pathTarget + '/') || s.filePath === pathTarget;
      return false;
    });

    const bugs = (memoryOverview?.bugsAndFixes || []).filter(b => {
      if (lbl === 'Component') return (b.componentPath || b.component) === pathTarget;
      if (lbl === 'File') return b.filePath === pathTarget;
      return false;
    });

    const decisions = (memoryOverview?.decisions || []).filter(d => {
      if (lbl === 'Component') return (d.componentPath || d.component) === pathTarget;
      if (lbl === 'File') return d.filePath === pathTarget;
      return false;
    });

    const dependencies = (memoryOverview?.componentDependencies || []).filter(dep => {
      if (lbl === 'Component') {
        return dep.sourceComponent === pathTarget || dep.targetComponent === pathTarget;
      }
      return false;
    });

    return { symbols, bugs, decisions, dependencies };
  }, [activeNode, memoryOverview]);

  return (
    <div className="space-y-5">
      {/* 1. Compact FalkorDB Workspace Status & Action Header */}
      <div className="rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-600 dark:text-[#58a6ff]" />
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-[#f0f6fc]">
              {providerName} Project Memory Workspace
            </h2>
          </div>

          {isConnected ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-[#3fb950] border border-emerald-200 dark:border-emerald-900/50">
              <CheckCircle2 className="w-3 h-3" />
              <span>Connected · {counts.relationships || rawGraphEdges.length} relationships</span>
            </span>
          ) : !isConfigured ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
              <AlertCircle className="w-3 h-3" />
              <span>{providerName} Not Configured (Static Fallback)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/50">
              <AlertCircle className="w-3 h-3" />
              <span>{providerName} Unavailable</span>
            </span>
          )}

          {/* Compact Entity Counters */}
          <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-neutral-500 dark:text-[#8b949e] pl-2 border-l border-neutral-200 dark:border-[#30363d]">
            <span>{counts.components} components</span>
            <span>·</span>
            <span>{counts.files} files</span>
            <span>·</span>
            <span>{counts.symbols} symbols</span>
            <span>·</span>
            <span className="text-amber-600 dark:text-amber-400">{counts.decisions} decisions</span>
            <span>·</span>
            <span className="text-red-600 dark:text-red-400">{counts.bugs} bugs</span>
            <span>·</span>
            <span className="text-emerald-600 dark:text-[#3fb950]">{counts.fixes} fixes</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsRecordOpen(prev => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>{isRecordOpen ? 'Hide Memory Recorder' : 'Record Decision / Bug & Fix'}</span>
          </button>

          <button
            type="button"
            onClick={onRefreshMemory}
            disabled={isLoadingMemory}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#21262d] hover:bg-neutral-100 dark:hover:bg-[#30363d] text-neutral-700 dark:text-[#c9d1d9] disabled:opacity-50 transition-colors"
          >
            {isLoadingMemory ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>Sync Graph</span>
          </button>
        </div>
      </div>

      {/* Unconfigured or Error Banner */}
      {!isConfigured && (
        <div className="p-3.5 rounded-lg bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{providerName} Project Memory is not configured</p>
            <p className="mt-0.5 text-amber-700 dark:text-amber-400/90">
              Configure your <code className="font-mono">{providerName}</code> connection in <code className="font-mono">.env</code> to persist decisions, bugs, fixes, and symbol call graphs. Static file & directory inspection remains active below.
            </p>
          </div>
        </div>
      )}

      {memoryError && (
        <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Failed to query {providerName} Project Memory</p>
            <p className="mt-0.5">{memoryError}</p>
          </div>
        </div>
      )}

      {/* Collapsible Record Decision / Bug & Fix Drawer */}
      {isRecordOpen && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-900/60 bg-white dark:bg-[#161b22] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-200 dark:border-[#30363d]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRecordMode('bug_fix')}
                className={`px-3 py-1 text-xs font-medium rounded border transition-colors ${
                  recordMode === 'bug_fix'
                    ? 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300'
                    : 'bg-neutral-50 dark:bg-[#21262d] border-neutral-200 dark:border-[#30363d] text-neutral-600 dark:text-[#8b949e]'
                }`}
              >
                Record Bug & Fix
              </button>
              <button
                type="button"
                onClick={() => setRecordMode('decision')}
                className={`px-3 py-1 text-xs font-medium rounded border transition-colors ${
                  recordMode === 'decision'
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                    : 'bg-neutral-50 dark:bg-[#21262d] border-neutral-200 dark:border-[#30363d] text-neutral-600 dark:text-[#8b949e]'
                }`}
              >
                Record Technical Decision
              </button>
            </div>

            <button
              type="button"
              onClick={handleLoadDemoPreset}
              className="text-[11px] font-mono text-blue-600 dark:text-[#58a6ff] hover:underline flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" />
              <span>Fill Flagship Demo Preset ("The bug that came back")</span>
            </button>
          </div>

          <form onSubmit={handleSubmitRecord} className="space-y-3 text-xs">
            {recordMode === 'bug_fix' ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-[#8b949e] mb-1">
                      Bug Title *
                    </label>
                    <input
                      type="text"
                      required
                      value={bugTitle}
                      onChange={e => setBugTitle(e.target.value)}
                      placeholder="e.g. Authentication API 401 error on valid tokens due to clock skew"
                      className="w-full px-2.5 py-1.5 rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-[#8b949e] mb-1">
                      Severity
                    </label>
                    <select
                      value={severity}
                      onChange={e => setSeverity(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc]"
                    >
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-[#8b949e] mb-1">
                      Root Cause & Description *
                    </label>
                    <input
                      type="text"
                      required
                      value={bugDescription}
                      onChange={e => setBugDescription(e.target.value)}
                      placeholder="Describe why the failure occurred..."
                      className="w-full px-2.5 py-1.5 rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-[#8b949e] mb-1">
                      Observed Symptoms
                    </label>
                    <input
                      type="text"
                      value={symptoms}
                      onChange={e => setSymptoms(e.target.value)}
                      placeholder="e.g. Intermittent 401 Unauthorized responses"
                      className="w-full px-2.5 py-1.5 rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-[#8b949e] mb-1">
                      Affected Component
                    </label>
                    <input
                      type="text"
                      value={componentPath}
                      onChange={e => setComponentPath(e.target.value)}
                      placeholder="e.g. server or services"
                      className="w-full px-2.5 py-1.5 rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc] font-mono text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-[#8b949e] mb-1">
                      Source File Path
                    </label>
                    <input
                      type="text"
                      value={filePath}
                      onChange={e => setFilePath(e.target.value)}
                      placeholder="e.g. services/auth.js"
                      className="w-full px-2.5 py-1.5 rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc] font-mono text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-[#8b949e] mb-1">
                      Commit SHA
                    </label>
                    <input
                      type="text"
                      value={commitSha}
                      onChange={e => setCommitSha(e.target.value)}
                      placeholder="e.g. 9f8e7d6"
                      className="w-full px-2.5 py-1.5 rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc] font-mono text-[11px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-neutral-600 dark:text-[#8b949e] mb-1">
                    Verified Fix Summary
                  </label>
                  <input
                    type="text"
                    value={fixSummary}
                    onChange={e => setFixSummary(e.target.value)}
                    placeholder="How the bug was resolved..."
                    className="w-full px-2.5 py-1.5 rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc]"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-[#8b949e] mb-1">
                      Technical Decision Title *
                    </label>
                    <input
                      type="text"
                      required
                      value={decisionTitle}
                      onChange={e => setDecisionTitle(e.target.value)}
                      placeholder="e.g. Enforce strict stateless JWT exp claim validation"
                      className="w-full px-2.5 py-1.5 rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-[#8b949e] mb-1">
                      Affected Component
                    </label>
                    <input
                      type="text"
                      value={decisionComponent}
                      onChange={e => setDecisionComponent(e.target.value)}
                      placeholder="e.g. services or server"
                      className="w-full px-2.5 py-1.5 rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc] font-mono text-[11px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-neutral-600 dark:text-[#8b949e] mb-1">
                    Architectural Rationale *
                  </label>
                  <input
                    type="text"
                    required
                    value={decisionRationale}
                    onChange={e => setDecisionRationale(e.target.value)}
                    placeholder="Why this decision was made and what constraints it imposes..."
                    className="w-full px-2.5 py-1.5 rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc]"
                  />
                </div>
              </>
            )}

            <div className="flex items-center justify-between pt-1">
              {saveFeedback ? (
                <span
                  className={`text-[11px] font-medium ${
                    saveFeedback.type === 'success'
                      ? 'text-emerald-600 dark:text-[#3fb950]'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {saveFeedback.message}
                </span>
              ) : (
                <span />
              )}

              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
              >
                {isSaving ? `Persisting to ${providerName}...` : `Save to ${providerName} Graph`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. Primary Split-Screen Workspace: Left = Graph Explorer (7 cols), Right = Selected Entity Inspector (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT PANEL: Graph Explorer & Integrated Repository File Finder */}
        <div className="lg:col-span-7 rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] overflow-hidden flex flex-col">
          {/* Graph Explorer Toolbar */}
          <div className="p-3 border-b border-neutral-200 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Mode Switcher: Graph Canvas vs Repository File Tree */}
              <div className="inline-flex rounded border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] p-0.5">
                <button
                  type="button"
                  onClick={() => setWorkspaceMode('graph')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    workspaceMode === 'graph'
                      ? 'bg-blue-600 text-white'
                      : 'text-neutral-600 dark:text-[#8b949e] hover:text-neutral-900 dark:hover:text-[#f0f6fc]'
                  }`}
                >
                  <GitFork className="w-3.5 h-3.5" />
                  <span>{providerName} Graph Explorer ({positionedGraph.nodes.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceMode('files')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    workspaceMode === 'files'
                      ? 'bg-blue-600 text-white'
                      : 'text-neutral-600 dark:text-[#8b949e] hover:text-neutral-900 dark:hover:text-[#f0f6fc]'
                  }`}
                >
                  <FolderTree className="w-3.5 h-3.5" />
                  <span>Repository Files ({analysisData?.metrics?.totalFiles || 0})</span>
                </button>
              </div>

              {/* Zoom & Reset Controls */}
              {workspaceMode === 'graph' && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    className="p-1.5 rounded border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-neutral-600 dark:text-[#8b949e] hover:text-neutral-900 dark:hover:text-[#f0f6fc]"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-mono px-1.5 text-neutral-500 dark:text-[#8b949e]">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    className="p-1.5 rounded border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-neutral-600 dark:text-[#8b949e] hover:text-neutral-900 dark:hover:text-[#f0f6fc]"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleResetView}
                    className="p-1.5 rounded border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-neutral-600 dark:text-[#8b949e] hover:text-neutral-900 dark:hover:text-[#f0f6fc]"
                    title="Fit / Reset View"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Search & Node Type Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-neutral-400 dark:text-[#6e7681]" />
                <input
                  type="text"
                  value={graphSearch}
                  onChange={e => setGraphSearch(e.target.value)}
                  placeholder="Search graph nodes, symbols, components, or files..."
                  className="w-full pl-8 pr-3 py-1 text-xs rounded border border-neutral-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-neutral-900 dark:text-[#f0f6fc] placeholder-neutral-400 dark:placeholder-[#6e7681] focus:outline-none focus:border-blue-500"
                />
              </div>

              {workspaceMode === 'graph' && (
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                  {[
                    { id: 'ALL', label: 'All' },
                    { id: 'Component', label: 'Components' },
                    { id: 'File', label: 'Files' },
                    { id: 'Symbol', label: 'Symbols' },
                    { id: 'Bug', label: 'Bugs' },
                    { id: 'Fix', label: 'Fixes' },
                    { id: 'TechnicalDecision', label: 'Decisions' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setNodeTypeFilter(tab.id)}
                      className={`px-2 py-1 text-[10px] font-mono rounded border whitespace-nowrap transition-colors ${
                        nodeTypeFilter === tab.id
                          ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-400 dark:border-blue-700 text-blue-700 dark:text-[#58a6ff] font-semibold'
                          : 'bg-white dark:bg-[#161b22] border-neutral-200 dark:border-[#30363d] text-neutral-600 dark:text-[#8b949e]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Main Left Body: Interactive SVG Graph OR Integrated File Tree */}
          {workspaceMode === 'graph' ? (
            <div className="relative bg-neutral-950/5 dark:bg-[#090d13] select-none overflow-hidden">
              {positionedGraph.nodes.length > 0 ? (
                <svg
                  viewBox="0 0 760 480"
                  className={`w-full h-[460px] sm:h-[520px] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  <defs>
                    <marker
                      id="arrow-source"
                      viewBox="0 0 10 10"
                      refX="22"
                      refY="5"
                      markerWidth="5"
                      markerHeight="5"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
                    </marker>
                    <marker
                      id="arrow-recorded"
                      viewBox="0 0 10 10"
                      refX="22"
                      refY="5"
                      markerWidth="5"
                      markerHeight="5"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
                    </marker>
                    <marker
                      id="arrow-active"
                      viewBox="0 0 10 10"
                      refX="22"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
                    </marker>
                  </defs>

                  <g
                    transform={`translate(${pan.x + 380 * (1 - zoom)}, ${pan.y + 240 * (1 - zoom)}) scale(${zoom})`}
                  >
                    {/* Edges */}
                    {positionedGraph.edges.map((edge) => {
                      const isSelectedEdge = selectedEdgeId === edge.id;
                      const isIncidentToActive =
                        activeNode &&
                        (edge.source === activeNode.id || edge.target === activeNode.id);
                      const isRecordedEdge = RECORDED_EDGE_TYPES.has(edge.type);
                      const isDimmed =
                        activeNode && !isIncidentToActive && !isSelectedEdge;

                      const midX = (edge.sourceNode.x + edge.targetNode.x) / 2;
                      const midY = (edge.sourceNode.y + edge.targetNode.y) / 2;

                      return (
                        <g
                          key={edge.id}
                          data-graph-interactive="true"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEdgeId(edge.id);
                            setCustomEntity(null);
                          }}
                          className="cursor-pointer"
                        >
                          {/* Invisible wider hit line for easy clicking */}
                          <line
                            x1={edge.sourceNode.x}
                            y1={edge.sourceNode.y}
                            x2={edge.targetNode.x}
                            y2={edge.targetNode.y}
                            stroke="transparent"
                            strokeWidth="12"
                          />
                          <line
                            x1={edge.sourceNode.x}
                            y1={edge.sourceNode.y}
                            x2={edge.targetNode.x}
                            y2={edge.targetNode.y}
                            stroke={
                              isSelectedEdge || isIncidentToActive
                                ? '#38bdf8'
                                : isRecordedEdge
                                  ? '#f59e0b'
                                  : '#475569'
                            }
                            strokeWidth={isSelectedEdge || isIncidentToActive ? 2.4 : 1.4}
                            strokeDasharray={isRecordedEdge ? '5,3' : undefined}
                            strokeOpacity={isDimmed ? 0.2 : 0.85}
                            markerEnd={
                              isSelectedEdge || isIncidentToActive
                                ? 'url(#arrow-active)'
                                : isRecordedEdge
                                  ? 'url(#arrow-recorded)'
                                  : 'url(#arrow-source)'
                            }
                          />
                          {(isSelectedEdge || isIncidentToActive) && (
                            <text
                              x={midX}
                              y={midY - 5}
                              textAnchor="middle"
                              className="fill-sky-500 dark:fill-sky-300 text-[8px] font-mono pointer-events-none"
                            >
                              {edge.type}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* Nodes */}
                    {positionedGraph.nodes.map((node) => {
                      const lbl = node.label || node.type;
                      const style = NODE_STYLES[lbl] || NODE_STYLES.File;
                      const isSelected = activeNode?.id === node.id && !selectedEdgeId;
                      const isNeighbor = neighborIds.has(node.id);
                      const isDimmed = activeNode && !isNeighbor && !selectedEdgeId;
                      const r = style.radius || 15;

                      return (
                        <g
                          key={node.id}
                          data-graph-interactive="true"
                          transform={`translate(${node.x}, ${node.y})`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setCustomEntity(null);
                            setSelectedEdgeId(null);
                            setSelectedNodeId(node.id);
                          }}
                          className="cursor-pointer transition-opacity"
                          style={{ opacity: isDimmed ? 0.3 : 1 }}
                        >
                          {isSelected && (
                            <circle
                              r={r + 6}
                              fill="none"
                              stroke="#38bdf8"
                              strokeWidth="2.5"
                              strokeDasharray="3,2"
                            />
                          )}
                          <circle
                            r={r}
                            fill={style.dot}
                            fillOpacity={isSelected ? 1 : 0.88}
                            stroke={isSelected ? '#ffffff' : '#0f172a'}
                            strokeWidth={isSelected ? 2.5 : 1.5}
                          />
                          <text
                            y={3}
                            textAnchor="middle"
                            className="fill-white text-[8px] font-bold font-mono pointer-events-none"
                          >
                            {lbl.slice(0, 3).toUpperCase()}
                          </text>
                          <text
                            y={r + 12}
                            textAnchor="middle"
                            className={`text-[9.5px] font-mono pointer-events-none ${
                              isSelected
                                ? 'fill-blue-600 dark:fill-[#58a6ff] font-bold'
                                : 'fill-neutral-700 dark:fill-[#c9d1d9]'
                            }`}
                          >
                            {node.title?.length > 22
                              ? `${node.title.slice(0, 20)}…`
                              : node.title}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                </svg>
              ) : (
                <div className="h-[420px] flex flex-col items-center justify-center p-6 text-center text-xs text-neutral-500 dark:text-[#8b949e]">
                  <Database className="w-8 h-8 text-neutral-400 dark:text-[#6e7681] mb-2" />
                  <p className="font-semibold text-neutral-700 dark:text-[#c9d1d9]">
                    No matching graph nodes for the current filter
                  </p>
                  <p className="mt-1 max-w-sm">
                    Clear the search filter or switch to <strong>Repository Files</strong> to inspect any file in the repository tree.
                  </p>
                </div>
              )}

              {/* Graph Legend Footer */}
              <div className="px-3 py-2 border-t border-neutral-200 dark:border-[#30363d] bg-white/90 dark:bg-[#161b22]/90 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-neutral-500 dark:text-[#8b949e]">
                <div className="flex flex-wrap items-center gap-2.5">
                  {Object.entries({
                    Repository: '#3b82f6',
                    Component: '#6366f1',
                    File: '#8b949e',
                    Symbol: '#a855f7',
                    Bug: '#ef4444',
                    Fix: '#10b981',
                    Decision: '#f59e0b',
                    Commit: '#06b6d4'
                  }).map(([name, color]) => (
                    <span key={name} className="inline-flex items-center gap-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span>{name}</span>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <span>── Source-Derived</span>
                  <span className="text-amber-600 dark:text-amber-400">- - Recorded Memory</span>
                </div>
              </div>
            </div>
          ) : (
            /* Integrated Repository File & Directory Explorer (replaces standalone Files tab) */
            <div className="p-3 max-h-[520px] overflow-y-auto space-y-3">
              {graphSearch.trim() && matchingFlatFiles.length > 0 && (
                <div className="p-2.5 rounded border border-blue-200 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20 space-y-1.5">
                  <span className="text-[10px] font-mono uppercase text-blue-700 dark:text-[#58a6ff] block">
                    Direct File Path Matches ({matchingFlatFiles.length})
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {matchingFlatFiles.map(fp => (
                      <button
                        key={fp}
                        type="button"
                        onClick={() => handleSelectFileOrDir(fp)}
                        className="text-left font-mono text-[11px] px-2 py-1 rounded hover:bg-blue-100 dark:hover:bg-[#21262d] text-neutral-800 dark:text-[#c9d1d9] truncate flex items-center gap-1.5"
                      >
                        <FileCode className="w-3 h-3 text-blue-500 shrink-0" />
                        <span className="truncate">{fp}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filteredFileTree.length > 0 ? (
                filteredFileTree.map(node => (
                  <FileTreeItem
                    key={node.path}
                    node={node}
                    depth={0}
                    filterText={graphSearch}
                    onSelectTreeNode={handleSelectFileOrDir}
                    selectedPath={activeNode?.title}
                  />
                ))
              ) : (
                <div className="py-12 text-center text-xs text-neutral-400">
                  No repository files matching "{graphSearch}".
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT PANEL: Selected Entity / Relationship Inspector */}
        <div className="lg:col-span-5 rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] p-4 space-y-4">
          <div className="flex items-center justify-between pb-2.5 border-b border-neutral-200 dark:border-[#30363d]">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600 dark:text-[#58a6ff]" />
              <h3 className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-[#f0f6fc]">
                {activeEdge ? 'Selected Relationship Inspector' : 'Selected Entity Inspector'}
              </h3>
            </div>
            {activeEdge && (
              <button
                type="button"
                onClick={() => setSelectedEdgeId(null)}
                className="text-[11px] text-blue-600 dark:text-[#58a6ff] hover:underline"
              >
                Back to Node
              </button>
            )}
          </div>

          {activeEdge ? (
            /* Edge Inspector View */
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded bg-neutral-50 dark:bg-[#0d1117] border border-neutral-200 dark:border-[#30363d] space-y-2">
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-[#58a6ff] border border-blue-200 dark:border-blue-800 inline-block">
                  {activeEdge.type}
                </span>
                <div className="text-xs font-mono text-neutral-800 dark:text-[#f0f6fc] flex items-center gap-1.5 flex-wrap pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEdgeId(null);
                      setSelectedNodeId(activeEdge.sourceNode.id);
                    }}
                    className="px-2 py-0.5 rounded bg-neutral-200/70 dark:bg-[#21262d] hover:underline"
                  >
                    {activeEdge.sourceNode.title}
                  </button>
                  <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEdgeId(null);
                      setSelectedNodeId(activeEdge.targetNode.id);
                    }}
                    className="px-2 py-0.5 rounded bg-neutral-200/70 dark:bg-[#21262d] hover:underline"
                  >
                    {activeEdge.targetNode.title}
                  </button>
                </div>
                <ProvenanceBadge
                  provenance={
                    activeEdge.details?.provenance ||
                    (RECORDED_EDGE_TYPES.has(activeEdge.type)
                      ? 'Explicitly Recorded Memory'
                      : 'Static Source Analysis')
                  }
                />
              </div>

              {activeEdge.details && Object.keys(activeEdge.details).length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono uppercase text-neutral-400 dark:text-[#6e7681] block">
                    Relationship Evidence & Provenance
                  </span>
                  <div className="rounded border border-neutral-200 dark:border-[#30363d] divide-y divide-neutral-100 dark:divide-[#21262d]">
                    {Object.entries(activeEdge.details)
                      .filter(([, val]) => Boolean(val))
                      .map(([k, val]) => (
                        <div key={k} className="px-3 py-1.5 flex items-start justify-between gap-2 text-[11px]">
                          <span className="font-mono text-neutral-500 dark:text-[#8b949e]">{k}</span>
                          <span className="font-mono text-neutral-900 dark:text-[#f0f6fc] text-right break-all">
                            {String(val)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : activeNode ? (
            /* Node Inspector View */
            <div className="space-y-4 text-xs">
              {/* Entity Title & Provenance */}
              <div className="p-3 rounded-lg bg-neutral-50 dark:bg-[#0d1117] border border-neutral-200 dark:border-[#30363d] space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${
                      (NODE_STYLES[activeNode.label || activeNode.type] || NODE_STYLES.File).bg
                    } ${
                      (NODE_STYLES[activeNode.label || activeNode.type] || NODE_STYLES.File).border
                    } ${
                      (NODE_STYLES[activeNode.label || activeNode.type] || NODE_STYLES.File).text
                    }`}
                  >
                    {activeNode.label || activeNode.type}
                  </span>
                  <ProvenanceBadge provenance={activeNode.provenance} />
                </div>

                <div>
                  <h4 className="text-sm font-bold font-mono text-neutral-900 dark:text-[#f0f6fc] break-all">
                    {activeNode.title}
                  </h4>
                  {activeNode.subtitle && (
                    <p className="text-[11px] text-neutral-500 dark:text-[#8b949e] mt-0.5">
                      {activeNode.subtitle}
                    </p>
                  )}
                </div>

                {/* Primary Contextual Actions */}
                <div className="pt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleInvestigateEntity(activeNode)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                  >
                    <MessageSquare className="w-3 h-3" />
                    <span>Investigate in Ask Codebase</span>
                  </button>

                  {((activeNode.label || activeNode.type) === 'Component' ||
                    (activeNode.label || activeNode.type) === 'File') && (
                    <button
                      type="button"
                      onClick={() => handleOpenRecordForEntity('bug_fix', activeNode)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded border border-neutral-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] hover:bg-neutral-100 dark:hover:bg-[#21262d] text-neutral-700 dark:text-[#c9d1d9]"
                    >
                      <PlusCircle className="w-3 h-3 text-amber-500" />
                      <span>Record Bug / Decision Here</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Entity Attributes Table (Only real fields supported by data) */}
              {activeNode.details && Object.keys(activeNode.details).length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 dark:text-[#6e7681] block">
                    Verified Entity Attributes
                  </span>
                  <div className="rounded border border-neutral-200 dark:border-[#30363d] divide-y divide-neutral-100 dark:divide-[#21262d]">
                    {Object.entries(activeNode.details)
                      .filter(([, val]) => val !== undefined && val !== null && val !== '')
                      .map(([key, val]) => (
                        <div
                          key={key}
                          className="px-3 py-1.5 flex items-start justify-between gap-3 text-[11px]"
                        >
                          <span className="font-mono text-neutral-500 dark:text-[#8b949e] shrink-0">
                            {key}
                          </span>
                          <span className="font-mono text-neutral-900 dark:text-[#f0f6fc] text-right break-all">
                            {String(val)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Repository-Specific Tech Stack & Counts when Repository root is selected */}
              {(activeNode.label || activeNode.type) === 'Repository' && (
                <div className="space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 dark:text-[#6e7681] block">
                    Detected Technologies & Graph Summary
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(analysisData?.techStack?.languages || []).map(l => (
                      <span
                        key={l.name}
                        className="text-[11px] font-mono px-2 py-0.5 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-800 dark:text-[#c9d1d9] border border-neutral-200 dark:border-[#30363d]"
                      >
                        {l.name} ({l.percentage}%)
                      </span>
                    ))}
                    {(analysisData?.frameworks || []).map(f => (
                      <span
                        key={f.name}
                        className="text-[11px] px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-[#58a6ff] border border-blue-200 dark:border-blue-900/50"
                      >
                        {f.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Related Symbols, Bugs & Decisions for Component or File */}
              {relatedEntityData.symbols.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-purple-600 dark:text-purple-400 block">
                    Defined Symbols ({relatedEntityData.symbols.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {relatedEntityData.symbols.slice(0, 8).map(sym => (
                      <button
                        key={sym.id}
                        type="button"
                        onClick={() => {
                          setCustomEntity(null);
                          setSelectedEdgeId(null);
                          setSelectedNodeId(sym.id);
                        }}
                        className="font-mono text-[10px] px-2 py-1 rounded bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:underline"
                      >
                        {sym.name}() L{sym.startLine}-{sym.endLine}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(relatedEntityData.bugs.length > 0 || relatedEntityData.decisions.length > 0) && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
                    Linked Project Memories ({relatedEntityData.bugs.length + relatedEntityData.decisions.length})
                  </span>
                  <div className="space-y-1.5">
                    {relatedEntityData.bugs.map(b => (
                      <div
                        key={b.bugId}
                        className="p-2 rounded bg-red-50/60 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-[11px]"
                      >
                        <span className="font-semibold text-red-700 dark:text-red-300">
                          Bug: {b.title}
                        </span>
                        {b.fixSummary && (
                          <p className="text-emerald-700 dark:text-[#3fb950] mt-0.5">
                            Fix: {b.fixSummary}
                          </p>
                        )}
                      </div>
                    ))}
                    {relatedEntityData.decisions.map(d => (
                      <div
                        key={d.id || d.title}
                        className="p-2 rounded bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-[11px]"
                      >
                        <span className="font-semibold text-amber-700 dark:text-amber-300">
                          Decision: {d.title}
                        </span>
                        <p className="text-neutral-600 dark:text-[#8b949e] mt-0.5">{d.rationale}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Connected Graph Neighbors (1-hop traversal without reload) */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 dark:text-[#6e7681] block">
                  Connected Graph Relationships ({incidentEdges.length})
                </span>
                {incidentEdges.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                    {incidentEdges.map((edge) => {
                      const other = edge.otherNode;
                      if (!other) return null;
                      const otherLabel = other.label || other.type;
                      const style = NODE_STYLES[otherLabel] || NODE_STYLES.File;
                      return (
                        <button
                          key={edge.id}
                          type="button"
                          onClick={() => {
                            setCustomEntity(null);
                            setSelectedEdgeId(null);
                            setSelectedNodeId(other.id);
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded border border-neutral-200 dark:border-[#30363d] hover:border-blue-400 dark:hover:border-blue-700 bg-neutral-50/70 dark:bg-[#0d1117] flex items-center justify-between gap-2 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: style.dot }}
                            />
                            <span className="font-mono text-[11px] text-neutral-900 dark:text-[#f0f6fc] truncate">
                              {other.title}
                            </span>
                          </div>
                          <span className="text-[9.5px] font-mono text-neutral-500 dark:text-[#8b949e] shrink-0">
                            {edge.direction === 'outbound' ? `→ ${edge.type}` : `← ${edge.type}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-neutral-400 dark:text-[#6e7681] italic">
                    No direct {providerName} edges connected to this entity in the current subgraph.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-neutral-400 dark:text-[#6e7681]">
              Select any node or relationship in the {providerName} Graph Explorer to inspect its provenance and details.
            </div>
          )}
        </div>
      </div>

      {/* 3. Stored Project Memory Ledger (Quick Filterable Cards below the Split-Screen Workspace) */}
      <div className="rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-neutral-200 dark:border-[#30363d]">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-neutral-500 dark:text-[#8b949e]" />
            <h3 className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-[#f0f6fc]">
              Stored Project Memory Records
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {[
              { id: 'all', label: 'All Records' },
              { id: 'bugs', label: `Bugs & Fixes (${memoryOverview?.bugsAndFixes?.length || 0})` },
              { id: 'decisions', label: `Decisions (${memoryOverview?.decisions?.length || 0})` },
              { id: 'dependencies', label: `Component Deps (${memoryOverview?.componentDependencies?.length || 0})` }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCardFilter(tab.id)}
                className={`px-2.5 py-1 text-[11px] rounded border transition-colors ${
                  cardFilter === tab.id
                    ? 'bg-neutral-900 dark:bg-[#21262d] text-white dark:text-[#f0f6fc] border-neutral-900 dark:border-[#30363d]'
                    : 'bg-neutral-50 dark:bg-[#0d1117] text-neutral-600 dark:text-[#8b949e] border-neutral-200 dark:border-[#30363d]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(cardFilter === 'all' || cardFilter === 'bugs') &&
            (memoryOverview?.bugsAndFixes || []).map(b => (
              <div
                key={b.bugId}
                onClick={() => {
                  setWorkspaceMode('graph');
                  setSelectedEdgeId(null);
                  setCustomEntity(null);
                  setSelectedNodeId(b.bugId);
                }}
                className="p-3 rounded border border-red-200/80 dark:border-red-900/40 bg-red-50/30 dark:bg-red-950/10 hover:border-red-400 cursor-pointer space-y-1.5 text-xs transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] text-red-700 dark:text-red-400 font-semibold uppercase">
                    <Bug className="w-3 h-3" />
                    <span>Bug · {b.severity || 'high'}</span>
                  </span>
                  {b.commitSha && (
                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-600 dark:text-[#8b949e]">
                      {b.commitSha.slice(0, 7)}
                    </span>
                  )}
                </div>
                <p className="font-semibold text-neutral-900 dark:text-[#f0f6fc]">{b.title}</p>
                <p className="text-[11px] text-neutral-600 dark:text-[#8b949e] line-clamp-2">
                  {b.description}
                </p>
                {b.fixSummary && (
                  <p className="text-[11px] text-emerald-700 dark:text-[#3fb950] font-medium pt-1 border-t border-red-100 dark:border-red-900/30">
                    Fix: {b.fixSummary}
                  </p>
                )}
              </div>
            ))}

          {(cardFilter === 'all' || cardFilter === 'decisions') &&
            (memoryOverview?.decisions || []).map(d => (
              <div
                key={d.id || d.title}
                onClick={() => {
                  setWorkspaceMode('graph');
                  setSelectedEdgeId(null);
                  setCustomEntity(null);
                  setSelectedNodeId(d.id);
                }}
                className="p-3 rounded border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/10 hover:border-amber-400 cursor-pointer space-y-1.5 text-xs transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-amber-700 dark:text-amber-400 font-semibold uppercase">
                    Technical Decision
                  </span>
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-600 dark:text-[#8b949e]">
                    {d.componentPath || 'root'}
                  </span>
                </div>
                <p className="font-semibold text-neutral-900 dark:text-[#f0f6fc]">{d.title}</p>
                <p className="text-[11px] text-neutral-600 dark:text-[#8b949e] line-clamp-2">
                  {d.rationale}
                </p>
              </div>
            ))}

          {(cardFilter === 'all' || cardFilter === 'dependencies') &&
            (memoryOverview?.componentDependencies || []).slice(0, 6).map((dep, idx) => (
              <div
                key={`${dep.sourceComponent}-${dep.targetComponent}-${idx}`}
                className="p-3 rounded border border-neutral-200 dark:border-[#30363d] bg-neutral-50/60 dark:bg-[#0d1117] space-y-1 text-xs"
              >
                <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold uppercase block">
                  Component Dependency
                </span>
                <p className="font-mono font-semibold text-neutral-900 dark:text-[#f0f6fc]">
                  {dep.sourceComponent} → {dep.targetComponent}
                </p>
                {dep.evidenceFile && (
                  <p className="font-mono text-[10px] text-neutral-500 dark:text-[#8b949e] truncate">
                    Import in: {dep.evidenceFile}
                  </p>
                )}
              </div>
            ))}

          {!(memoryOverview?.bugsAndFixes?.length) &&
            !(memoryOverview?.decisions?.length) &&
            !(memoryOverview?.componentDependencies?.length) && (
              <div className="col-span-full py-6 text-center text-xs text-neutral-400 dark:text-[#6e7681]">
                No recorded decisions or bug fixes stored for this repository yet. Click <strong>Record Decision / Bug & Fix</strong> above to add project memory.
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
