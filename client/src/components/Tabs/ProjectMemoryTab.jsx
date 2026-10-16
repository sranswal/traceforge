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
  MessageSquare,
  Crosshair,
  Filter,
  Eye,
  X
} from 'lucide-react';
import { buildEntityInvestigationPrompt } from '../../utils/analysisPayload';

const NODE_STYLES = {
  Repository: {
    bg: 'bg-violet-50 dark:bg-violet-950/40',
    border: 'border-violet-300 dark:border-violet-800',
    text: 'text-violet-700 dark:text-violet-300',
    dot: '#8b5cf6',
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
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    border: 'border-rose-300 dark:border-rose-800',
    text: 'text-rose-700 dark:text-rose-400',
    dot: '#f43f5e',
    radius: 15
  },
  Fix: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-emerald-300 dark:border-emerald-800',
    text: 'text-emerald-700 dark:text-emerald-400',
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
    bg: 'bg-slate-100 dark:bg-slate-800',
    border: 'border-slate-300 dark:border-slate-700',
    text: 'text-slate-700 dark:text-slate-300',
    dot: '#64748b',
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
      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
        isRecorded
          ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/50'
          : 'bg-slate-100 dark:bg-[#1a2336] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-[#26344d]'
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
            ? 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 font-semibold'
            : isDirectory
              ? 'text-slate-800 dark:text-slate-200 font-medium hover:bg-slate-100 dark:hover:bg-[#1a2336]'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#1a2336]'
        }`}
        style={{ paddingLeft: `${depth * 1.1 + 0.5}rem` }}
      >
        {isDirectory ? (
          <>
            <span className="text-slate-400 dark:text-slate-500 w-3 shrink-0">
              {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </span>
            {isOpen ? (
              <FolderOpen className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
            )}
            <span className="truncate">{node.name}</span>
            {node.fileCount > 0 && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-sans font-normal ml-1">
                ({node.fileCount})
              </span>
            )}
            {node.role && (
              <span className="ml-auto text-[10px] font-sans font-normal px-1.5 py-0.2 rounded bg-slate-100 dark:bg-[#1e293d] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#2b3a56] hidden sm:inline">
                {node.role}
              </span>
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <FileCode className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
            <span className="truncate group-hover:text-violet-600 dark:group-hover:text-violet-400">
              {node.name}
            </span>
            {formattedSize && (
              <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500 font-sans">
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

  // Layout switcher: 'concentric' | 'hierarchical' | 'neighborhood'
  const [layoutMode, setLayoutMode] = useState('concentric');
  // 1-hop neighborhood focus filter
  const [neighborhoodFocusNodeId, setNeighborhoodFocusNodeId] = useState(null);
  // Custom user-dragged coordinates: { [nodeId]: { x, y } }
  const [customNodeCoords, setCustomNodeCoords] = useState({});
  const [activeDragNodeId, setActiveDragNodeId] = useState(null);
  const svgRef = useRef(null);

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

  // Filter graph nodes by search query, nodeTypeFilter, and neighborhood focus
  const filteredGraphData = useMemo(() => {
    let baseNodes = rawGraphNodes;
    let baseEdges = rawGraphEdges;

    // If 1-hop neighborhood focus is active, restrict base graph to focus node + connected neighbors
    if (neighborhoodFocusNodeId) {
      const allowedNodeIds = new Set([neighborhoodFocusNodeId]);
      for (const e of rawGraphEdges) {
        if (e.source === neighborhoodFocusNodeId) allowedNodeIds.add(e.target);
        if (e.target === neighborhoodFocusNodeId) allowedNodeIds.add(e.source);
      }
      baseNodes = baseNodes.filter(n => allowedNodeIds.has(n.id));
      baseEdges = baseEdges.filter(e => allowedNodeIds.has(e.source) && allowedNodeIds.has(e.target));
    }

    const q = graphSearch.trim().toLowerCase();
    const matchingNodes = baseNodes.filter((n) => {
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
        n.id?.toLowerCase().includes(q) ||
        JSON.stringify(n.details || {}).toLowerCase().includes(q)
      );
    });

    const nodeIds = new Set(matchingNodes.map(n => n.id));
    const matchingEdges = baseEdges.filter(
      e => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    return { nodes: matchingNodes, edges: matchingEdges };
  }, [rawGraphNodes, rawGraphEdges, graphSearch, nodeTypeFilter, neighborhoodFocusNodeId]);

  // Determine active selected node or edge
  const activeNode = useMemo(() => {
    if (customEntity) return customEntity;
    if (selectedNodeId) {
      const matchInRaw = rawGraphNodes.find(n => n.id === selectedNodeId);
      if (matchInRaw) return matchInRaw;
    }
    return rawGraphNodes[0] || null;
  }, [customEntity, selectedNodeId, rawGraphNodes]);

  // Compute graph layout (Concentric, Hierarchical, or Neighborhood)
  const positionedGraph = useMemo(() => {
    const nodes = filteredGraphData.nodes.slice(0, 48);
    if (nodes.length === 0) return { nodes: [], edges: [], nodeById: new Map() };

    const width = 840;
    const height = 520;
    const centerX = width / 2;
    const centerY = height / 2;

    const positioned = [];

    if (layoutMode === 'neighborhood') {
      // Focus node in center, 1-hop neighbors radiating around it
      const targetCenterNode = (activeNode && nodes.find(n => n.id === activeNode.id)) || nodes[0];
      positioned.push({ ...targetCenterNode, x: centerX, y: centerY });

      const otherNodes = nodes.filter(n => n.id !== targetCenterNode.id);
      const directNeighbors = otherNodes.filter(n =>
        filteredGraphData.edges.some(e =>
          (e.source === targetCenterNode.id && e.target === n.id) ||
          (e.target === targetCenterNode.id && e.source === n.id)
        )
      );
      const nonNeighbors = otherNodes.filter(n => !directNeighbors.includes(n));

      // Inner ring: direct neighbors (radius ~155)
      directNeighbors.forEach((item, idx) => {
        const angle = (2 * Math.PI * idx) / Math.max(directNeighbors.length, 1);
        positioned.push({
          ...item,
          x: Math.round(centerX + Math.cos(angle) * 165),
          y: Math.round(centerY + Math.sin(angle) * 130)
        });
      });

      // Outer ring: non-neighbors (radius ~300)
      nonNeighbors.forEach((item, idx) => {
        const angle = 0.35 + (2 * Math.PI * idx) / Math.max(nonNeighbors.length, 1);
        positioned.push({
          ...item,
          x: Math.round(centerX + Math.cos(angle) * 315),
          y: Math.round(centerY + Math.sin(angle) * 215)
        });
      });
    } else if (layoutMode === 'hierarchical') {
      // Tiered hierarchical layout by entity taxonomy level
      const tiers = {
        0: [], // Repository
        1: [], // Component
        2: [], // File, Commit
        3: [], // Symbol, Function, Class
        4: []  // Bug, Fix, TechnicalDecision, Test
      };

      for (const n of nodes) {
        const lbl = n.label || n.type;
        if (lbl === 'Repository') tiers[0].push(n);
        else if (lbl === 'Component') tiers[1].push(n);
        else if (lbl === 'File' || lbl === 'Commit') tiers[2].push(n);
        else if (lbl === 'Function' || lbl === 'Class' || lbl === 'Symbol') tiers[3].push(n);
        else tiers[4].push(n);
      }

      const activeTiers = Object.entries(tiers).filter(([, items]) => items.length > 0);
      const tierCount = activeTiers.length;

      activeTiers.forEach(([, items], tierIndex) => {
        const y = Math.round(60 + (tierIndex * (height - 120)) / Math.max(tierCount - 1, 1));
        items.forEach((item, idx) => {
          const x = Math.round((width / (items.length + 1)) * (idx + 1));
          positioned.push({ ...item, x, y });
        });
      });
    } else {
      // Concentric multi-ring layout
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

      placeRing(ring1, 140, 95, 0.15);
      placeRing(ring2, 260, 170, 0.45);
      placeRing(ring3, 355, 230, 0.8);
    }

    // Apply custom dragged node positions
    const finalNodes = positioned.map(n => {
      if (customNodeCoords[n.id]) {
        return { ...n, x: customNodeCoords[n.id].x, y: customNodeCoords[n.id].y };
      }
      return n;
    });

    const nodeById = new Map(finalNodes.map(n => [n.id, n]));
    const validEdges = filteredGraphData.edges
      .filter(e => nodeById.has(e.source) && nodeById.has(e.target))
      .map(e => ({
        ...e,
        sourceNode: nodeById.get(e.source),
        targetNode: nodeById.get(e.target)
      }));

    return { nodes: finalNodes, edges: validEdges, nodeById };
  }, [filteredGraphData, layoutMode, activeNode, customNodeCoords]);

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
  const handleZoomIn = () => setZoom(z => Math.min(Number((z + 0.15).toFixed(2)), 2.5));
  const handleZoomOut = () => setZoom(z => Math.max(Number((z - 0.15).toFixed(2)), 0.4));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setCustomNodeCoords({});
    setSelectedEdgeId(null);
    setNeighborhoodFocusNodeId(null);
  };

  const handleFitViewport = () => {
    if (positionedGraph.nodes.length === 0) {
      handleResetView();
      return;
    }
    const xs = positionedGraph.nodes.map(n => n.x);
    const ys = positionedGraph.nodes.map(n => n.y);
    const minX = Math.min(...xs) - 50;
    const maxX = Math.max(...xs) + 50;
    const minY = Math.min(...ys) - 50;
    const maxY = Math.max(...ys) + 50;
    const graphW = Math.max(maxX - minX, 120);
    const graphH = Math.max(maxY - minY, 120);
    const scale = Math.min(Math.max(Math.min(840 / graphW, 520 / graphH), 0.5), 2.0);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    setZoom(Number(scale.toFixed(2)));
    setPan({
      x: Math.round(420 - midX * scale),
      y: Math.round(260 - midY * scale)
    });
  };

  const handleCenterOnNode = (node) => {
    if (!node) return;
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setCustomEntity(null);
    setPan({
      x: Math.round(420 - node.x * zoom),
      y: Math.round(260 - node.y * zoom)
    });
  };

  const handleNodeMouseDown = (e, node) => {
    e.stopPropagation();
    setActiveDragNodeId(node.id);
  };

  const handleMouseDown = (e) => {
    if (e.target.closest('[data-graph-interactive="true"]')) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e) => {
    if (activeDragNodeId && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;
      const svgX = Math.round((rawX - pan.x - 420 * (1 - zoom)) / zoom);
      const svgY = Math.round((rawY - pan.y - 260 * (1 - zoom)) / zoom);
      setCustomNodeCoords(prev => ({
        ...prev,
        [activeDragNodeId]: { x: svgX, y: svgY }
      }));
      return;
    }
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    });
  };

  const handleMouseUp = () => {
    setActiveDragNodeId(null);
    setIsDragging(false);
  };

  const handleSvgWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    setZoom((prev) => Math.min(Math.max(Number((prev * factor).toFixed(2)), 0.4), 2.5));
  };

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
      <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-violet-600 dark:text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {providerName} Project Memory Workspace
            </h2>
          </div>

          {isConnected ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span>Connected · {counts.relationships || rawGraphEdges.length} relationships</span>
            </span>
          ) : !isConfigured ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
              <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span>{providerName} Not Configured (Static Fallback)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60">
              <AlertCircle className="w-3 h-3 text-red-600 dark:text-red-400" />
              <span>{providerName} Unavailable</span>
            </span>
          )}

          {/* Compact Entity Counters */}
          <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 pl-2 border-l border-slate-200 dark:border-[#1f2a3f]">
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
            <span className="text-emerald-600 dark:text-emerald-400">{counts.fixes} fixes</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsRecordOpen(prev => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white transition-colors shadow-xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>{isRecordOpen ? 'Hide Memory Recorder' : 'Record Decision / Bug & Fix'}</span>
          </button>

          <button
            type="button"
            onClick={onRefreshMemory}
            disabled={isLoadingMemory}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-[#222e44] bg-slate-50 dark:bg-[#151c2c] hover:bg-slate-100 dark:hover:bg-[#1f2a3f] text-slate-700 dark:text-slate-200 disabled:opacity-50 transition-colors"
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
        <div className="p-3.5 rounded-lg bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-semibold">{providerName} Project Memory is not configured</p>
            <p className="mt-0.5 text-amber-700 dark:text-amber-300/90">
              Configure your <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">{providerName}</code> connection in <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">.env</code> to persist decisions, bugs, fixes, and symbol call graphs. Static file & directory inspection remains active below.
            </p>
          </div>
        </div>
      )}

      {memoryError && (
        <div className="p-3.5 rounded-lg bg-red-50/90 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-800 dark:text-red-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
          <div>
            <p className="font-semibold">Failed to query {providerName} Project Memory</p>
            <p className="mt-0.5">{memoryError}</p>
          </div>
        </div>
      )}

      {/* Collapsible Record Decision / Bug & Fix Drawer */}
      {isRecordOpen && (
        <div className="rounded-xl border border-violet-200 dark:border-violet-900/50 bg-white dark:bg-[#101624] p-4 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-[#1f2a3f]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRecordMode('bug_fix')}
                className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
                  recordMode === 'bug_fix'
                    ? 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 font-semibold'
                    : 'bg-slate-50 dark:bg-[#151c2c] border-slate-200 dark:border-[#1f2a3f] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Record Bug & Fix
              </button>
              <button
                type="button"
                onClick={() => setRecordMode('decision')}
                className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
                  recordMode === 'decision'
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-semibold'
                    : 'bg-slate-50 dark:bg-[#151c2c] border-slate-200 dark:border-[#1f2a3f] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Record Technical Decision
              </button>
            </div>

            <button
              type="button"
              onClick={handleLoadDemoPreset}
              className="text-[11px] font-mono text-violet-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
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
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Bug Title *
                    </label>
                    <input
                      type="text"
                      required
                      value={bugTitle}
                      onChange={e => setBugTitle(e.target.value)}
                      placeholder="e.g. Authentication API 401 error on valid tokens due to clock skew"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#222e44] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Severity
                    </label>
                    <select
                      value={severity}
                      onChange={e => setSeverity(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#222e44] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-violet-500"
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
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Root Cause & Description *
                    </label>
                    <input
                      type="text"
                      required
                      value={bugDescription}
                      onChange={e => setBugDescription(e.target.value)}
                      placeholder="Describe why the failure occurred..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#222e44] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Observed Symptoms
                    </label>
                    <input
                      type="text"
                      value={symptoms}
                      onChange={e => setSymptoms(e.target.value)}
                      placeholder="e.g. Intermittent 401 Unauthorized responses"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#222e44] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Affected Component
                    </label>
                    <input
                      type="text"
                      value={componentPath}
                      onChange={e => setComponentPath(e.target.value)}
                      placeholder="e.g. server or services"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#222e44] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 font-mono text-[11px] focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Source File Path
                    </label>
                    <input
                      type="text"
                      value={filePath}
                      onChange={e => setFilePath(e.target.value)}
                      placeholder="e.g. services/auth.js"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#222e44] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 font-mono text-[11px] focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Commit SHA
                    </label>
                    <input
                      type="text"
                      value={commitSha}
                      onChange={e => setCommitSha(e.target.value)}
                      placeholder="e.g. 9f8e7d6"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#222e44] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 font-mono text-[11px] focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Verified Fix Summary
                  </label>
                  <input
                    type="text"
                    value={fixSummary}
                    onChange={e => setFixSummary(e.target.value)}
                    placeholder="How the bug was resolved..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#222e44] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Technical Decision Title *
                    </label>
                    <input
                      type="text"
                      required
                      value={decisionTitle}
                      onChange={e => setDecisionTitle(e.target.value)}
                      placeholder="e.g. Enforce strict stateless JWT exp claim validation"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#222e44] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Affected Component
                    </label>
                    <input
                      type="text"
                      value={decisionComponent}
                      onChange={e => setDecisionComponent(e.target.value)}
                      placeholder="e.g. services or server"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#222e44] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 font-mono text-[11px] focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Architectural Rationale *
                  </label>
                  <input
                    type="text"
                    required
                    value={decisionRationale}
                    onChange={e => setDecisionRationale(e.target.value)}
                    placeholder="Why this decision was made and what constraints it imposes..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#222e44] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500"
                  />
                </div>
              </>
            )}

            <div className="flex items-center justify-between pt-1">
              {saveFeedback ? (
                <span
                  className={`text-[11px] font-medium ${
                    saveFeedback.type === 'success'
                      ? 'text-emerald-600 dark:text-emerald-400'
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
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white disabled:opacity-50 transition-colors shadow-xs"
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
        <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] overflow-hidden flex flex-col shadow-xs">
          {/* Graph Explorer Toolbar */}
          <div className="p-3 border-b border-slate-200 dark:border-[#1f2a3f] bg-slate-50/80 dark:bg-[#0b0f17]/80 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Mode Switcher: Graph Canvas vs Repository File Tree */}
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#151c2c] p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setWorkspaceMode('graph')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    workspaceMode === 'graph'
                      ? 'bg-violet-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <GitFork className="w-3.5 h-3.5" />
                  <span>{providerName} Explorer ({positionedGraph.nodes.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceMode('files')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    workspaceMode === 'files'
                      ? 'bg-violet-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <FolderTree className="w-3.5 h-3.5" />
                  <span>Repository Files ({analysisData?.metrics?.totalFiles || 0})</span>
                </button>
              </div>

              {/* Layout Switcher & Zoom / Viewport Controls */}
              {workspaceMode === 'graph' && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {/* Layout Selector */}
                  <div className="flex items-center rounded-lg border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#151c2c] px-2 py-0.5">
                    <span className="text-[10px] uppercase font-mono text-slate-400 dark:text-slate-500 mr-1.5">Layout</span>
                    <select
                      value={layoutMode}
                      onChange={(e) => setLayoutMode(e.target.value)}
                      className="bg-transparent text-[11px] font-mono text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                      title="Choose layout visualization algorithm"
                    >
                      <option value="concentric" className="bg-white dark:bg-[#101624] text-slate-900 dark:text-slate-100">Concentric Rings</option>
                      <option value="hierarchical" className="bg-white dark:bg-[#101624] text-slate-900 dark:text-slate-100">Hierarchical Tier</option>
                      <option value="neighborhood" className="bg-white dark:bg-[#101624] text-slate-900 dark:text-slate-100">Radial Focus</option>
                    </select>
                  </div>

                  {/* Zoom controls */}
                  <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#151c2c] p-0.5">
                    <button
                      type="button"
                      onClick={handleZoomOut}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#1f2a3f] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] font-mono px-1 min-w-[34px] text-center text-slate-600 dark:text-slate-400">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={handleZoomIn}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#1f2a3f] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleFitViewport}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#1f2a3f] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors border-l border-slate-200 dark:border-[#1f2a3f]"
                      title="Fit to Viewport"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleResetView}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#1f2a3f] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                      title="Reset Pan & Zoom"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 1-Hop Focus Banner if active */}
            {neighborhoodFocusNodeId && (
              <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/60 text-xs text-cyan-800 dark:text-cyan-300">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Crosshair className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                  <span className="truncate">
                    1-Hop Neighborhood Isolation: <strong className="font-mono">{activeNode?.title || neighborhoodFocusNodeId}</strong> ({positionedGraph.nodes.length} nodes, {positionedGraph.edges.length} edges)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setNeighborhoodFocusNodeId(null)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono rounded bg-white dark:bg-[#101624] border border-cyan-300 dark:border-cyan-800 hover:bg-cyan-100 dark:hover:bg-cyan-950 text-cyan-700 dark:text-cyan-300 transition-colors shrink-0"
                >
                  <X className="w-3 h-3" />
                  <span>Clear Focus</span>
                </button>
              </div>
            )}

            {/* Search & Node Type Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={graphSearch}
                  onChange={e => setGraphSearch(e.target.value)}
                  placeholder="Search nodes by name, type, path, SHA, or attribute..."
                  className="w-full pl-8 pr-20 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[#222e44] bg-white dark:bg-[#101624] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500 shadow-2xs"
                />
                {graphSearch.trim() && (
                  <span className="absolute right-2.5 top-2 text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#151c2c] px-1.5 py-0.5 rounded">
                    {positionedGraph.nodes.length} matches
                  </span>
                )}
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
                      className={`px-2.5 py-1.5 text-[10px] font-mono rounded-lg border whitespace-nowrap transition-colors ${
                        nodeTypeFilter === tab.id
                          ? 'bg-violet-50 dark:bg-violet-950/40 border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-300 font-semibold'
                          : 'bg-white dark:bg-[#101624] border-slate-200 dark:border-[#1f2a3f] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
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
            <div className="relative bg-slate-100/60 dark:bg-[#070a10] select-none overflow-hidden">
              {positionedGraph.nodes.length > 0 ? (
                <svg
                  ref={svgRef}
                  viewBox="0 0 760 480"
                  className={`w-full h-[460px] sm:h-[520px] ${activeDragNodeId ? 'cursor-grabbing' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                  onWheel={handleSvgWheel}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  <defs>
                    <pattern id="mem-explorer-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                      <circle cx="2" cy="2" r="1" className="fill-slate-300 dark:fill-slate-800/80" />
                    </pattern>
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
                      <path d="M 0 1 L 10 5 L 0 9 z" fill="#06b6d4" />
                    </marker>
                  </defs>

                  {/* Dot Grid Background */}
                  <rect width="100%" height="100%" fill="url(#mem-explorer-grid)" />

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
                            strokeWidth="14"
                          />
                          <line
                            x1={edge.sourceNode.x}
                            y1={edge.sourceNode.y}
                            x2={edge.targetNode.x}
                            y2={edge.targetNode.y}
                            stroke={
                              isSelectedEdge || isIncidentToActive
                                ? '#06b6d4'
                                : isRecordedEdge
                                  ? '#f59e0b'
                                  : '#64748b'
                            }
                            strokeWidth={isSelectedEdge || isIncidentToActive ? 2.5 : 1.4}
                            strokeDasharray={isRecordedEdge ? '5,3' : undefined}
                            strokeOpacity={isDimmed ? 0.18 : 0.85}
                            markerEnd={
                              isSelectedEdge || isIncidentToActive
                                ? 'url(#arrow-active)'
                                : isRecordedEdge
                                  ? 'url(#arrow-recorded)'
                                  : 'url(#arrow-source)'
                            }
                          />
                          {(isSelectedEdge || isIncidentToActive) && (
                            <g transform={`translate(${midX}, ${midY - 4})`} className="pointer-events-none">
                              <rect
                                x={-edge.type.length * 3.2 - 6}
                                y={-10}
                                width={edge.type.length * 6.4 + 12}
                                height={14}
                                rx="3"
                                className="fill-white dark:fill-[#101624] stroke-cyan-500/50"
                                strokeWidth="0.8"
                              />
                              <text
                                textAnchor="middle"
                                className="fill-cyan-600 dark:fill-cyan-400 text-[8.5px] font-mono font-semibold"
                                dy="-1"
                              >
                                {edge.type}
                              </text>
                            </g>
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
                          onMouseDown={(e) => handleNodeMouseDown(e, node)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setCustomEntity(null);
                            setSelectedEdgeId(null);
                            setSelectedNodeId(node.id);
                          }}
                          className="cursor-pointer transition-opacity"
                          style={{ opacity: isDimmed ? 0.25 : 1 }}
                        >
                          {/* Selected / Neighbor Halo Rings */}
                          {isSelected && (
                            <circle
                              r={r + 6}
                              fill="none"
                              stroke="#06b6d4"
                              strokeWidth="2.5"
                              strokeDasharray="4,2"
                            />
                          )}
                          {isNeighbor && !isSelected && (
                            <circle
                              r={r + 4}
                              fill="none"
                              stroke="#8b5cf6"
                              strokeWidth="1.8"
                              strokeDasharray="2,2"
                              opacity="0.85"
                            />
                          )}

                          <circle
                            r={r}
                            fill={style.dot}
                            fillOpacity={isSelected ? 1 : 0.9}
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
                            y={r + 13}
                            textAnchor="middle"
                            className={`text-[9.5px] font-mono pointer-events-none ${
                              isSelected
                                ? 'fill-violet-700 dark:fill-cyan-400 font-bold'
                                : isNeighbor
                                  ? 'fill-slate-900 dark:fill-slate-100 font-semibold'
                                  : 'fill-slate-700 dark:fill-slate-300'
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
                <div className="h-[420px] flex flex-col items-center justify-center p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  <Database className="w-8 h-8 text-slate-400 dark:text-slate-600 mb-2" />
                  <p className="font-semibold text-slate-700 dark:text-slate-200">
                    No matching graph nodes for the current filter
                  </p>
                  <p className="mt-1 max-w-sm">
                    Clear the search filter or switch to <strong>Repository Files</strong> to inspect any file in the repository tree.
                  </p>
                </div>
              )}

              {/* Graph Legend Footer */}
              <div className="px-3 py-2 border-t border-slate-200 dark:border-[#1f2a3f] bg-white/95 dark:bg-[#101624]/95 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                <div className="flex flex-wrap items-center gap-2.5">
                  {Object.entries({
                    Repository: '#8b5cf6',
                    Component: '#6366f1',
                    File: '#64748b',
                    Symbol: '#d946ef',
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
                  <span className="text-cyan-600 dark:text-cyan-400">● Drag node to pin</span>
                </div>
              </div>
            </div>
          ) : (
            /* Integrated Repository File & Directory Explorer (replaces standalone Files tab) */
            <div className="p-3 max-h-[520px] overflow-y-auto space-y-3">
              {graphSearch.trim() && matchingFlatFiles.length > 0 && (
                <div className="p-2.5 rounded-lg border border-violet-200 dark:border-violet-900/50 bg-violet-50/40 dark:bg-violet-950/20 space-y-1.5">
                  <span className="text-[10px] font-mono uppercase text-violet-700 dark:text-cyan-400 block font-semibold">
                    Direct File Path Matches ({matchingFlatFiles.length})
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {matchingFlatFiles.map(fp => (
                      <button
                        key={fp}
                        type="button"
                        onClick={() => handleSelectFileOrDir(fp)}
                        className="text-left font-mono text-[11px] px-2 py-1 rounded-md hover:bg-violet-100 dark:hover:bg-[#1f2a3f] text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5 transition-colors"
                      >
                        <FileCode className="w-3 h-3 text-violet-500 shrink-0" />
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
                <div className="py-12 text-center text-xs text-slate-400 dark:text-slate-500">
                  No repository files matching "{graphSearch}".
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT PANEL: Selected Entity / Relationship Inspector */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-4 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-[#1f2a3f]">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-violet-600 dark:text-cyan-400" />
              <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100">
                {activeEdge ? 'Selected Relationship Inspector' : 'Selected Entity Inspector'}
              </h3>
            </div>
            {activeEdge && (
              <button
                type="button"
                onClick={() => setSelectedEdgeId(null)}
                className="text-[11px] text-violet-600 dark:text-cyan-400 hover:underline"
              >
                Back to Node
              </button>
            )}
          </div>

          {activeEdge ? (
            /* Edge Inspector View */
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f] space-y-2">
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/60 inline-block font-semibold">
                  {activeEdge.type}
                </span>
                <div className="text-xs font-mono text-slate-800 dark:text-slate-200 flex items-center gap-1.5 flex-wrap pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEdgeId(null);
                      setSelectedNodeId(activeEdge.sourceNode.id);
                    }}
                    className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-[#151c2c] hover:underline"
                  >
                    {activeEdge.sourceNode.title}
                  </button>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEdgeId(null);
                      setSelectedNodeId(activeEdge.targetNode.id);
                    }}
                    className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-[#151c2c] hover:underline"
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
                  <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 block font-semibold">
                    Relationship Evidence & Provenance
                  </span>
                  <div className="rounded-lg border border-slate-200 dark:border-[#1f2a3f] divide-y divide-slate-100 dark:divide-[#151c2c] overflow-hidden">
                    {Object.entries(activeEdge.details)
                      .filter(([, val]) => Boolean(val))
                      .map(([k, val]) => (
                        <div key={k} className="px-3 py-1.5 flex items-start justify-between gap-2 text-[11px]">
                          <span className="font-mono text-slate-500 dark:text-slate-400">{k}</span>
                          <span className="font-mono text-slate-900 dark:text-slate-100 text-right break-all">
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
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f] space-y-2">
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
                  <h4 className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100 break-all">
                    {activeNode.title}
                  </h4>
                  {activeNode.subtitle && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {activeNode.subtitle}
                    </p>
                  )}
                </div>

                {/* Primary Contextual Actions */}
                <div className="pt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleInvestigateEntity(activeNode)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white transition-colors shadow-2xs"
                  >
                    <MessageSquare className="w-3 h-3" />
                    <span>Investigate in Ask Codebase</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setNeighborhoodFocusNodeId(prev => (prev === activeNode.id ? null : activeNode.id))
                    }
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors ${
                      neighborhoodFocusNodeId === activeNode.id
                        ? 'bg-cyan-50 dark:bg-cyan-950/40 border-cyan-300 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300'
                        : 'border-slate-300 dark:border-[#222e44] bg-white dark:bg-[#151c2c] hover:bg-slate-100 dark:hover:bg-[#1f2a3f] text-slate-700 dark:text-slate-200'
                    }`}
                    title="Isolate this entity and its 1-hop connected neighbors"
                  >
                    <Crosshair className="w-3 h-3 text-cyan-500" />
                    <span>{neighborhoodFocusNodeId === activeNode.id ? 'Exit 1-Hop Focus' : 'Focus 1-Hop'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCenterOnNode(activeNode.id)}
                    className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded-lg border border-slate-300 dark:border-[#222e44] bg-white dark:bg-[#151c2c] hover:bg-slate-100 dark:hover:bg-[#1f2a3f] text-slate-700 dark:text-slate-200"
                    title="Center graph view on this node"
                  >
                    <Eye className="w-3 h-3 text-slate-400" />
                    <span>Center</span>
                  </button>

                  {((activeNode.label || activeNode.type) === 'Component' ||
                    (activeNode.label || activeNode.type) === 'File') && (
                    <button
                      type="button"
                      onClick={() => handleOpenRecordForEntity('bug_fix', activeNode)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-slate-300 dark:border-[#222e44] bg-white dark:bg-[#151c2c] hover:bg-slate-100 dark:hover:bg-[#1f2a3f] text-slate-700 dark:text-slate-200"
                    >
                      <PlusCircle className="w-3 h-3 text-amber-500" />
                      <span>Record Memory</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Entity Attributes Table (Only real fields supported by retrieved graph data) */}
              {activeNode.details && Object.keys(activeNode.details).length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-semibold">
                    Verified Entity Attributes
                  </span>
                  <div className="rounded-lg border border-slate-200 dark:border-[#1f2a3f] divide-y divide-slate-100 dark:divide-[#151c2c] overflow-hidden">
                    {Object.entries(activeNode.details)
                      .filter(([, val]) => val !== undefined && val !== null && val !== '')
                      .map(([key, val]) => (
                        <div
                          key={key}
                          className="px-3 py-1.5 flex items-start justify-between gap-3 text-[11px]"
                        >
                          <span className="font-mono text-slate-500 dark:text-slate-400 shrink-0">
                            {key}
                          </span>
                          <span className="font-mono text-slate-900 dark:text-slate-100 text-right break-all">
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
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-semibold">
                    Detected Technologies & Graph Summary
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(analysisData?.techStack?.languages || []).map(l => (
                      <span
                        key={l.name}
                        className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#151c2c] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-[#1f2a3f]"
                      >
                        {l.name} ({l.percentage}%)
                      </span>
                    ))}
                    {(analysisData?.frameworks || []).map(f => (
                      <span
                        key={f.name}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/60"
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
                  <span className="text-[10px] font-mono uppercase tracking-wider text-purple-600 dark:text-purple-400 block font-semibold">
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
                        className="font-mono text-[10px] px-2 py-1 rounded-md bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:underline"
                      >
                        {sym.name}() L{sym.startLine}-{sym.endLine}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(relatedEntityData.bugs.length > 0 || relatedEntityData.decisions.length > 0) && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400 block font-semibold">
                    Linked Project Memories ({relatedEntityData.bugs.length + relatedEntityData.decisions.length})
                  </span>
                  <div className="space-y-1.5">
                    {relatedEntityData.bugs.map(b => (
                      <div
                        key={b.bugId}
                        className="p-2 rounded-lg bg-red-50/60 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-[11px]"
                      >
                        <span className="font-semibold text-red-700 dark:text-red-300">
                          Bug: {b.title}
                        </span>
                        {b.fixSummary && (
                          <p className="text-emerald-700 dark:text-emerald-400 mt-0.5">
                            Fix: {b.fixSummary}
                          </p>
                        )}
                      </div>
                    ))}
                    {relatedEntityData.decisions.map(d => (
                      <div
                        key={d.id || d.title}
                        className="p-2 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-[11px]"
                      >
                        <span className="font-semibold text-amber-700 dark:text-amber-300">
                          Decision: {d.title}
                        </span>
                        <p className="text-slate-600 dark:text-slate-400 mt-0.5">{d.rationale}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Connected Graph Neighbors (1-hop traversal without reload) */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-semibold">
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
                          className="w-full text-left px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#1f2a3f] hover:border-violet-400 dark:hover:border-violet-700 bg-slate-50/70 dark:bg-[#0b0f17] flex items-center justify-between gap-2 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: style.dot }}
                            />
                            <span className="font-mono text-[11px] text-slate-900 dark:text-slate-100 truncate">
                              {other.title}
                            </span>
                          </div>
                          <span className="text-[9.5px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                            {edge.direction === 'outbound' ? `→ ${edge.type}` : `← ${edge.type}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                    No direct {providerName} edges connected to this entity in the current subgraph.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-400 dark:text-slate-500">
              Select any node or relationship in the {providerName} Graph Explorer to inspect its provenance and details.
            </div>
          )}
        </div>
      </div>

      {/* 3. Stored Project Memory Ledger (Quick Filterable Cards below the Split-Screen Workspace) */}
      <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-4 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-[#1f2a3f]">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100">
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
                className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors ${
                  cardFilter === tab.id
                    ? 'bg-slate-900 dark:bg-[#151c2c] text-white dark:text-slate-100 border-slate-900 dark:border-[#1f2a3f] font-semibold'
                    : 'bg-slate-50 dark:bg-[#0b0f17] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-[#1f2a3f] hover:text-slate-900 dark:hover:text-slate-200'
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
                className="p-3 rounded-xl border border-red-200/80 dark:border-red-900/40 bg-red-50/30 dark:bg-red-950/10 hover:border-red-400 cursor-pointer space-y-1.5 text-xs transition-colors shadow-2xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] text-red-700 dark:text-red-400 font-semibold uppercase">
                    <Bug className="w-3 h-3" />
                    <span>Bug · {b.severity || 'high'}</span>
                  </span>
                  {b.commitSha && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#151c2c] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#1f2a3f]">
                      {b.commitSha.slice(0, 7)}
                    </span>
                  )}
                </div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{b.title}</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2">
                  {b.description}
                </p>
                {b.fixSummary && (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium pt-1 border-t border-red-100 dark:border-red-900/30">
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
                className="p-3 rounded-xl border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/10 hover:border-amber-400 cursor-pointer space-y-1.5 text-xs transition-colors shadow-2xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-amber-700 dark:text-amber-400 font-semibold uppercase">
                    Technical Decision
                  </span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#151c2c] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#1f2a3f]">
                    {d.componentPath || 'root'}
                  </span>
                </div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{d.title}</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2">
                  {d.rationale}
                </p>
              </div>
            ))}

          {(cardFilter === 'all' || cardFilter === 'dependencies') &&
            (memoryOverview?.componentDependencies || []).slice(0, 6).map((dep, idx) => (
              <div
                key={`${dep.sourceComponent}-${dep.targetComponent}-${idx}`}
                className="p-3 rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-slate-50/60 dark:bg-[#0b0f17] space-y-1 text-xs shadow-2xs"
              >
                <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold uppercase block">
                  Component Dependency
                </span>
                <p className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {dep.sourceComponent} → {dep.targetComponent}
                </p>
                {dep.evidenceFile && (
                  <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    Import in: {dep.evidenceFile}
                  </p>
                )}
              </div>
            ))}

          {!(memoryOverview?.bugsAndFixes?.length) &&
            !(memoryOverview?.decisions?.length) &&
            !(memoryOverview?.componentDependencies?.length) && (
              <div className="col-span-full py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                No recorded decisions or bug fixes stored for this repository yet. Click <strong>Record Decision / Bug & Fix</strong> above to add project memory.
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
