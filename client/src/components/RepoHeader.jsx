import React, { useState, useEffect, useRef } from 'react';
import { 
  GitBranch, 
  Star, 
  GitFork, 
  ExternalLink, 
  Clock, 
  Compass, 
  MessageSquare, 
  LayoutDashboard,
  Database,
  ShieldAlert,
  ChevronDown
} from 'lucide-react';

function formatCleanDescription(rawDescription) {
  if (!rawDescription || typeof rawDescription !== 'string') {
    return 'No repository description provided.';
  }
  // Strip leading markdown headers like "# title" or "## title"
  let clean = rawDescription.replace(/^#+\s+/gm, '');
  // Strip markdown links [text](url) -> text
  clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Strip markdown image tags ![alt](url) -> ''
  clean = clean.replace(/!\[([^\]]*)\]\([^)]+\)/g, '');
  // Strip backticks
  clean = clean.replace(/`([^`]+)`/g, '$1');
  // Replace multiple newlines or tabs with a single space
  clean = clean.replace(/\r?\n+/g, ' ').trim();
  return clean || 'No repository description provided.';
}

export default function RepoHeader({ 
  analysisData, 
  memoryOverview,
  graphHealth,
  activeTab, 
  onSelectTab 
}) {
  const [showAdvancedMenu, setShowAdvancedMenu] = useState(false);
  const menuRef = useRef(null);

  const { repository, metrics, projectType, architecture } = analysisData;
  const counts = memoryOverview?.counts || analysisData?.projectMemory?.counts || {};
  const isMemoryConnected = Boolean(
    (memoryOverview?.available && memoryOverview?.status === 'connected') ||
    (graphHealth?.connected && memoryOverview?.status !== 'error')
  );
  const memoryItemCount = isMemoryConnected
    ? (counts.decisions || 0) + (counts.bugs || 0) + (counts.fixes || 0) + (counts.symbols || 0)
    : metrics.totalFiles;

  const rawProvider = memoryOverview?.provider || graphHealth?.provider || analysisData?.projectMemory?.provider;
  const providerName = 'FalkorDB';

  const isAdvancedActive = activeTab === 'overview' || activeTab === 'architecture' || activeTab === 'advanced';

  // Outside click and Escape key dismissal for the dropdown
  useEffect(() => {
    if (!showAdvancedMenu) return;

    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowAdvancedMenu(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowAdvancedMenu(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showAdvancedMenu]);

  return (
    <div className="border-b border-[#1f2a3f] bg-[#0c111a] pt-4 transition-colors relative z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Repo Title & Meta */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono px-2 py-0.5 rounded bg-[#131b2c] text-violet-300 border border-violet-800/40">
                {projectType}
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-400">
                {architecture.pattern}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              <span>{repository.fullName}</span>
              <a
                href={repository.url}
                target="_blank"
                rel="noreferrer"
                className="text-slate-400 hover:text-slate-200 transition-colors p-1"
                title="View on GitHub"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </h1>

            <p 
              className="text-xs sm:text-sm text-slate-400 max-w-3xl leading-relaxed line-clamp-2"
              title={repository.description}
            >
              {formatCleanDescription(repository.description)}
            </p>
          </div>

          {/* Quick Metrics & Badges */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap text-xs text-slate-400">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#111726] border border-[#202d45]">
              <GitBranch className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono text-slate-200 font-medium">
                {repository.branch}
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#111726] border border-[#202d45]">
              <Star className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-mono text-slate-200 font-medium">
                {repository.stars.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#111726] border border-[#202d45]">
              <Clock className="w-3.5 h-3.5 text-teal-400" />
              <span className="font-mono text-slate-200 font-medium">
                {metrics.analysisTimeMs}ms
              </span>
            </div>

            <button
              type="button"
              onClick={() => onSelectTab('memory')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                isMemoryConnected
                  ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                  : 'bg-amber-950/30 border-amber-800/40 text-amber-300'
              }`}
              title={`Open ${providerName} Project Memory`}
            >
              <Database className="w-3.5 h-3.5" />
              <span className="font-mono font-medium">
                {isMemoryConnected
                  ? `${providerName} · ${counts.symbols ?? 0} symbols`
                  : `${providerName} Ready`}
              </span>
            </button>
          </div>
        </div>

        {/* Primary Navigation Tabs Strip & Unconstrained Dropdown Container */}
        <div className="flex items-center justify-between gap-2 border-t border-[#1a2336]/60">
          {/* Scrollable Tabs */}
          <nav className="flex items-center gap-1 -mb-px overflow-x-auto py-0 flex-1 min-w-0" aria-label="Tabs">
            {/* 1. Investigation Workspace */}
            <button
              type="button"
              onClick={() => onSelectTab('incident')}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap focus:outline-none cursor-pointer ${
                activeTab === 'incident'
                  ? 'border-violet-500 text-white font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              <ShieldAlert className={`w-4 h-4 ${activeTab === 'incident' ? 'text-violet-400' : 'text-slate-400'}`} />
              <span>Investigation Workspace</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-violet-950/80 text-violet-300 border border-violet-800/50">
                Workflow
              </span>
            </button>

            {/* 2. Graph Memory & Provenance */}
            <button
              type="button"
              onClick={() => onSelectTab('memory')}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap focus:outline-none cursor-pointer ${
                activeTab === 'memory'
                  ? 'border-teal-500 text-white font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              <Database className={`w-4 h-4 ${activeTab === 'memory' ? 'text-teal-400' : 'text-slate-400'}`} />
              <span>Graph Memory</span>
              {memoryItemCount !== undefined && (
                <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-[#182236] text-teal-300 border border-[#2b3a58]">
                  {memoryItemCount}
                </span>
              )}
            </button>

            {/* 3. Memory Q&A Recall */}
            <button
              type="button"
              onClick={() => onSelectTab('ask')}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap focus:outline-none cursor-pointer ${
                activeTab === 'ask'
                  ? 'border-violet-500 text-white font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              <MessageSquare className={`w-4 h-4 ${activeTab === 'ask' ? 'text-violet-400' : 'text-slate-400'}`} />
              <span>Memory Q&A</span>
            </button>
          </nav>

          {/* 4. Advanced Tools Dropdown (Positioned outside overflow-x-auto to prevent clipping) */}
          <div ref={menuRef} className="relative shrink-0 -mb-px">
            <button
              type="button"
              id="advanced-tools-button"
              aria-expanded={showAdvancedMenu}
              aria-haspopup="menu"
              onClick={() => setShowAdvancedMenu(prev => !prev)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap focus:outline-none cursor-pointer ${
                isAdvancedActive
                  ? 'border-slate-400 text-white font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              <Compass className={`w-4 h-4 ${isAdvancedActive ? 'text-slate-200' : 'text-slate-400'}`} />
              <span>Advanced Tools</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${showAdvancedMenu ? 'rotate-180' : ''}`} />
            </button>

            {showAdvancedMenu && (
              <div 
                role="menu"
                aria-labelledby="advanced-tools-button"
                className="absolute right-0 top-full mt-1.5 w-52 rounded-lg bg-[#111726] border border-[#23314b] shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-[#1c273c] mb-1">
                  Codebase Intelligence
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSelectTab('architecture');
                    setShowAdvancedMenu(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left hover:bg-[#18233a] cursor-pointer transition-colors ${
                    activeTab === 'architecture' ? 'text-violet-300 font-semibold bg-[#162035]' : 'text-slate-300'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  <div>
                    <div className="font-medium">Architecture Explorer</div>
                    <div className="text-[10px] text-slate-400">Component dependency map</div>
                  </div>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSelectTab('overview');
                    setShowAdvancedMenu(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left hover:bg-[#18233a] cursor-pointer transition-colors ${
                    activeTab === 'overview' ? 'text-violet-300 font-semibold bg-[#162035]' : 'text-slate-300'
                  }`}
                >
                  <LayoutDashboard className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <div>
                    <div className="font-medium">Codebase Overview</div>
                    <div className="text-[10px] text-slate-400">Directory structure & metrics</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


