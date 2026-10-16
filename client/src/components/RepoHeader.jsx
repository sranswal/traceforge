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

  const isAdvancedActive = activeTab === 'architecture';

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
    <div className="border-b border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#0c111a] pt-3 transition-colors relative z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Repo Title & Meta Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pb-2.5">
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-1.5 truncate">
                <span>{repository.fullName}</span>
                <a
                  href={repository.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-0.5"
                  title="View on Provider"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </h1>

              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-[#131b2c] dark:text-slate-300 border border-slate-200 dark:border-[#202d45]">
                {repository.branch}
              </span>

              <span className="text-[11px] font-mono uppercase px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-cyan-300 border border-violet-200 dark:border-violet-900/60">
                {repository.provider || 'GitHub'}
              </span>

              <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
                {projectType} · {architecture.pattern}
              </span>
            </div>

            {repository.description && (
              <p 
                className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl truncate leading-normal"
                title={repository.description}
              >
                {formatCleanDescription(repository.description)}
              </p>
            )}
          </div>

          {/* Quick Metrics & Provider Status */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap text-xs">
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100/80 dark:bg-[#111726] border border-slate-200 dark:border-[#202d45] text-slate-600 dark:text-slate-400 text-[11px] font-mono">
              <Star className="w-3 h-3 text-amber-500" />
              <span>{repository.stars.toLocaleString()}</span>
            </div>

            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100/80 dark:bg-[#111726] border border-slate-200 dark:border-[#202d45] text-slate-600 dark:text-slate-400 text-[11px] font-mono">
              <Clock className="w-3 h-3 text-teal-500" />
              <span>{metrics.analysisTimeMs}ms</span>
            </div>

            <button
              type="button"
              onClick={() => onSelectTab('memory')}
              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                isMemoryConnected
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-300'
                  : 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800/60 dark:text-amber-300'
              }`}
              title={`Open ${providerName} Project Memory`}
            >
              <Database className="w-3 h-3" />
              <span>
                {isMemoryConnected
                  ? `${providerName} · ${counts.symbols ?? 0} symbols`
                  : `${providerName} Ready`}
              </span>
            </button>
          </div>
        </div>

        {/* Primary Navigation Tabs Strip: 1. Repository Overview, 2. Graph Memory, 3. Investigation Workspace */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 dark:border-[#1a2336]/60">
          <nav className="flex items-center gap-1 -mb-px overflow-x-auto py-0 flex-1 min-w-0" aria-label="Tabs">
            {/* 1. Repository Overview (Default) */}
            <button
              type="button"
              onClick={() => onSelectTab('overview')}
              className={`flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap focus:outline-none cursor-pointer ${
                activeTab === 'overview'
                  ? 'border-teal-600 text-teal-700 dark:text-white font-semibold'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <LayoutDashboard className={`w-3.5 h-3.5 ${activeTab === 'overview' ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'}`} />
              <span>Repository Overview</span>
            </button>

            {/* 2. Graph Memory */}
            <button
              type="button"
              onClick={() => onSelectTab('memory')}
              className={`flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap focus:outline-none cursor-pointer ${
                activeTab === 'memory'
                  ? 'border-teal-600 text-teal-700 dark:text-white font-semibold'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <Database className={`w-3.5 h-3.5 ${activeTab === 'memory' ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'}`} />
              <span>Graph Memory</span>
              {memoryItemCount !== undefined && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-[#182236] text-teal-700 dark:text-teal-300 border border-slate-200 dark:border-[#2b3a58]">
                  {memoryItemCount}
                </span>
              )}
            </button>

            {/* 3. Investigation Workspace */}
            <button
              type="button"
              onClick={() => onSelectTab('incident')}
              className={`flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap focus:outline-none cursor-pointer ${
                activeTab === 'incident'
                  ? 'border-violet-600 text-violet-700 dark:text-white font-semibold'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <ShieldAlert className={`w-3.5 h-3.5 ${activeTab === 'incident' ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'}`} />
              <span>Investigation Workspace</span>
            </button>
          </nav>

          {/* 4. Advanced Tools Dropdown */}
          <div ref={menuRef} className="relative shrink-0 -mb-px">
            <button
              type="button"
              id="advanced-tools-button"
              aria-expanded={showAdvancedMenu}
              aria-haspopup="menu"
              onClick={() => setShowAdvancedMenu(prev => !prev)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap focus:outline-none cursor-pointer ${
                isAdvancedActive
                  ? 'border-slate-600 dark:border-slate-400 text-slate-900 dark:text-white font-semibold'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <Compass className={`w-4 h-4 ${isAdvancedActive ? 'text-slate-800 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`} />
              <span>Advanced Tools</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${showAdvancedMenu ? 'rotate-180' : ''}`} />
            </button>

            {showAdvancedMenu && (
              <div 
                role="menu"
                aria-labelledby="advanced-tools-button"
                className="absolute right-0 top-full mt-1.5 w-56 rounded-lg bg-white dark:bg-[#111726] border border-slate-200 dark:border-[#23314b] shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-[#1c273c] mb-1">
                  Codebase Intelligence
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSelectTab('architecture');
                    setShowAdvancedMenu(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left hover:bg-slate-50 dark:hover:bg-[#18233a] cursor-pointer transition-colors ${
                    activeTab === 'architecture' ? 'text-violet-700 dark:text-violet-300 font-semibold bg-violet-50/60 dark:bg-[#162035]' : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-200">Architecture Explorer</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Component dependency map</div>
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


