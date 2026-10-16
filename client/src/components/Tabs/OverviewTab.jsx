import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Play, 
  FileCode, 
  Folder, 
  Layers, 
  CheckCircle2, 
  Info, 
  AlertTriangle, 
  Loader2, 
  RefreshCw, 
  ArrowRight,
  Database,
  GitCommit,
  GitPullRequest,
  Bug,
  GitBranch,
  ExternalLink,
  ShieldAlert,
  Search,
  Clock,
  Star,
  GitFork
} from 'lucide-react';

function MarkdownView({ text }) {
  if (!text) return null;
  const lines = text.split('\n');

  return (
    <div className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 pt-2 pb-0.5 border-b border-slate-100 dark:border-[#1f2a3f]">
              {trimmed.replace('### ', '')}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={idx} className="text-sm font-bold text-slate-900 dark:text-slate-100 pt-3 pb-1 border-b border-slate-200 dark:border-[#1f2a3f]">
              {trimmed.replace('## ', '')}
            </h3>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const itemText = trimmed.substring(2);
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-slate-400 dark:text-slate-500 font-bold mt-0.5">•</span>
              <div>{renderInline(itemText)}</div>
            </div>
          );
        }
        if (!trimmed) return <div key={idx} className="h-1" />;
        return <p key={idx}>{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}

function renderInline(text) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#151c2c] text-violet-700 dark:text-cyan-400 border border-slate-200 dark:border-[#1f2a3f] mx-0.5">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-slate-900 dark:text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

const LANG_COLORS = {
  Go: '#00ADD8',
  Python: '#3572A5',
  TypeScript: '#3178C6',
  JavaScript: '#F1E05A',
  Rust: '#DEA584',
  Java: '#B07219',
  HTML: '#E34C26',
  CSS: '#563D7C'
};

export default function OverviewTab({ 
  analysisData, 
  memoryOverview,
  summary, 
  summaryMeta,
  isGeneratingSummary, 
  summaryError, 
  onGenerateSummary,
  onNavigateToTab,
  onStartInvestigation
}) {
  const { repository, techStack, frameworks, architecture, structure, observations, metrics } = analysisData;
  const repoFullName = repository?.fullName;

  // Provider Data State (commits, branches, issues, PRs)
  const [providerData, setProviderData] = useState(() => analysisData?.providerData || null);
  const [isRefreshingProvider, setIsRefreshingProvider] = useState(false);
  const [providerFetchError, setProviderFetchError] = useState(null);

  // Dynamic Pagination State for Issues and Pull Requests
  const [issuesList, setIssuesList] = useState(() => analysisData?.providerData?.issues?.data || []);
  const [issuesPage, setIssuesPage] = useState(1);
  const [hasMoreIssues, setHasMoreIssues] = useState(true);
  const [isLoadingMoreIssues, setIsLoadingMoreIssues] = useState(false);
  const [loadMoreIssuesError, setLoadMoreIssuesError] = useState(null);

  const [prList, setPrList] = useState(() => analysisData?.providerData?.pullRequests?.data || []);
  const [prPage, setPrPage] = useState(1);
  const [hasMorePRs, setHasMorePRs] = useState(true);
  const [isLoadingMorePRs, setIsLoadingMorePRs] = useState(false);
  const [loadMorePRsError, setLoadMorePRsError] = useState(null);

  // Indexing status from analysisData or memoryOverview
  const counts = memoryOverview?.counts || analysisData?.projectMemory?.counts || analysisData?.indexing?.coverage || {};
  const isMemoryConnected = Boolean(
    memoryOverview?.available || 
    analysisData?.projectMemory?.ingested ||
    analysisData?.indexing?.status === 'indexed'
  );
  const indexingStatus = analysisData?.indexing?.status || (isMemoryConnected ? 'indexed' : 'unindexed');
  const lastSync = analysisData?.indexing?.lastSync || memoryOverview?.lastSync || null;

  // Reset provider data immediately when repository changes to guarantee no stale cache retention
  const lastRepoRef = useRef(repoFullName);
  useEffect(() => {
    if (repoFullName !== lastRepoRef.current) {
      lastRepoRef.current = repoFullName;
      setProviderData(null);
      setProviderFetchError(null);
      setIssuesList([]);
      setIssuesPage(1);
      setHasMoreIssues(true);
      setIsLoadingMoreIssues(false);
      setLoadMoreIssuesError(null);
      setPrList([]);
      setPrPage(1);
      setHasMorePRs(true);
      setIsLoadingMorePRs(false);
      setLoadMorePRsError(null);
    }
  }, [repoFullName]);

  // Keep issuesList and prList synchronized when providerData changes
  useEffect(() => {
    if (providerData?.issues?.data) {
      setIssuesList(providerData.issues.data);
      setIssuesPage(1);
      setHasMoreIssues(providerData.issues.data.length >= 5);
      setLoadMoreIssuesError(null);
    }
    if (providerData?.pullRequests?.data) {
      setPrList(providerData.pullRequests.data);
      setPrPage(1);
      setHasMorePRs(providerData.pullRequests.data.length >= 5);
      setLoadMorePRsError(null);
    }
  }, [providerData]);

  // Refresh provider data on demand or if not available in analysisData
  const refreshProviderData = async () => {
    if (!repoFullName) return;
    setIsRefreshingProvider(true);
    setProviderFetchError(null);
    try {
      const res = await fetch(`/api/repository/overview?repo=${encodeURIComponent(repoFullName)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to refresh repository provider data');
      }
      setProviderData({
        provider: data.repository?.provider || 'github',
        branches: data.branches,
        commits: data.commits,
        issues: data.issues,
        pullRequests: data.pullRequests
      });
    } catch (err) {
      setProviderFetchError(err.message);
    } finally {
      setIsRefreshingProvider(false);
    }
  };

  // Pagination handler: Load more issues
  const handleLoadMoreIssues = async () => {
    if (!repoFullName || isLoadingMoreIssues || !hasMoreIssues) return;
    setIsLoadingMoreIssues(true);
    setLoadMoreIssuesError(null);
    const nextPage = issuesPage + 1;
    try {
      const res = await fetch(`/api/repository/issues?repo=${encodeURIComponent(repoFullName)}&page=${nextPage}&perPage=5`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load more issues');
      }
      const newIssues = data.issues || [];
      if (newIssues.length === 0) {
        setHasMoreIssues(false);
      } else {
        setIssuesList(prev => {
          const existingIds = new Set(prev.map(i => i.id || i.number));
          const filtered = newIssues.filter(i => !existingIds.has(i.id || i.number));
          return [...prev, ...filtered];
        });
        if (newIssues.length < 5) {
          setHasMoreIssues(false);
        }
        setIssuesPage(nextPage);
      }
    } catch (err) {
      setLoadMoreIssuesError(err.message);
    } finally {
      setIsLoadingMoreIssues(false);
    }
  };

  // Pagination handler: Load more PRs
  const handleLoadMorePRs = async () => {
    if (!repoFullName || isLoadingMorePRs || !hasMorePRs) return;
    setIsLoadingMorePRs(true);
    setLoadMorePRsError(null);
    const nextPage = prPage + 1;
    try {
      const res = await fetch(`/api/repository/pulls?repo=${encodeURIComponent(repoFullName)}&page=${nextPage}&perPage=5`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load more pull requests');
      }
      const newPRs = data.pullRequests || [];
      if (newPRs.length === 0) {
        setHasMorePRs(false);
      } else {
        setPrList(prev => {
          const existingIds = new Set(prev.map(p => p.id || p.number));
          const filtered = newPRs.filter(p => !existingIds.has(p.id || p.number));
          return [...prev, ...filtered];
        });
        if (newPRs.length < 5) {
          setHasMorePRs(false);
        }
        setPrPage(nextPage);
      }
    } catch (err) {
      setLoadMorePRsError(err.message);
    } finally {
      setIsLoadingMorePRs(false);
    }
  };

  useEffect(() => {
    if (analysisData?.providerData && analysisData?.repository?.fullName === repoFullName) {
      setProviderData(analysisData.providerData);
    } else if (repoFullName && repoFullName !== 'acme/payment-gateway') {
      refreshProviderData();
    }
  }, [repoFullName, analysisData?.providerData, analysisData?.repository?.fullName]);

  const commits = providerData?.commits?.data || [];
  const commitsStatus = providerData?.commits?.status || 'empty';
  const commitsError = providerData?.commits?.error;

  const issuesStatus = providerData?.issues?.status || 'empty';
  const issuesError = providerData?.issues?.error;

  const pullsStatus = providerData?.pullRequests?.status || 'empty';
  const pullsError = providerData?.pullRequests?.error;

  const branches = providerData?.branches?.data || [];

  const handleLaunchInvestigation = (targetType, item = null) => {
    const currentRepo = repository?.fullName || repoFullName;
    const enrichedItem = item ? { ...item, repoFullName: currentRepo } : { repoFullName: currentRepo };
    if (onStartInvestigation) {
      onStartInvestigation({ targetType, item: enrichedItem });
    } else if (onNavigateToTab) {
      onNavigateToTab('incident', { targetType, item: enrichedItem });
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Repository Identity & Investigation Action Hub */}
      <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-[#1f2a3f]">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-mono font-semibold uppercase px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-950/60 text-violet-800 dark:text-cyan-300 border border-violet-200 dark:border-violet-800/60">
                {repository?.provider || 'GitHub'}
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>{repository?.fullName}</span>
                <a
                  href={repository?.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title="View on Provider"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#151c2c] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#1f2a3f]">
                branch: {repository?.branch || repository?.defaultBranch || 'main'}
              </span>
              {repository?.isPrivate ? (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                  Private
                </span>
              ) : (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                  Public
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl">
              {repository?.description || 'Repository intelligence grounded in source AST, Git history, and persistent FalkorDB graph memory.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={refreshProviderData}
              disabled={isRefreshingProvider}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#202d45] bg-slate-50 dark:bg-[#151c2c] hover:bg-slate-100 dark:hover:bg-[#1f2a3f] text-slate-700 dark:text-slate-200 transition-colors shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingProvider ? 'animate-spin text-teal-500' : ''}`} />
              <span>{isRefreshingProvider ? 'Syncing...' : 'Sync Provider'}</span>
            </button>
          </div>
        </div>

        {/* Action Buttons to investigate issue, review PR, or describe bug */}
        <div className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => handleLaunchInvestigation('issue')}
            className="flex items-start gap-3 p-3.5 rounded-xl border border-violet-200 dark:border-violet-900/50 bg-violet-50/50 dark:bg-violet-950/20 hover:bg-violet-100/60 dark:hover:bg-violet-950/40 transition-all text-left cursor-pointer group"
          >
            <div className="p-2 rounded-lg bg-violet-600 text-white shrink-0 shadow-xs">
              <Search className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                <span>Investigate an Issue</span>
                <ArrowRight className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Load issue description, comments, linked files, and historical fixes.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleLaunchInvestigation('pr')}
            className="flex items-start gap-3 p-3.5 rounded-xl border border-teal-200 dark:border-teal-900/50 bg-teal-50/50 dark:bg-teal-950/20 hover:bg-teal-100/60 dark:hover:bg-teal-950/40 transition-all text-left cursor-pointer group"
          >
            <div className="p-2 rounded-lg bg-teal-600 text-white shrink-0 shadow-xs">
              <GitPullRequest className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                <span>Review a Pull Request</span>
                <ArrowRight className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Analyze PR diff, affected symbols, call chains, and potential regression risks.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleLaunchInvestigation('bug')}
            className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-100/60 dark:hover:bg-amber-950/40 transition-all text-left cursor-pointer group"
          >
            <div className="p-2 rounded-lg bg-amber-600 text-white shrink-0 shadow-xs">
              <Bug className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                <span>Diagnose a Bug / Stack Trace</span>
                <ArrowRight className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Input logs, error message, or symptoms to pinpoint root cause in graph.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* 2. FalkorDB Indexing Status & Graph Coverage */}
      <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-[#1f2a3f]">
          <div className="flex flex-wrap items-center gap-2">
            <Database className="w-4 h-4 text-violet-600 dark:text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Graph Indexing Status & Coverage
            </h3>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
              indexingStatus === 'indexed'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                : indexingStatus === 'indexing'
                  ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60 animate-pulse'
                  : indexingStatus === 'error'
                    ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
            }`}>
              {indexingStatus === 'indexed'
                ? 'Indexed in FalkorDB'
                : indexingStatus === 'indexing'
                  ? 'Indexing in Progress'
                  : indexingStatus === 'error'
                    ? 'Indexing Failed'
                    : 'Unindexed / Initializing'}
            </span>
            {lastSync && (
              <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                Last sync: {new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => onNavigateToTab('memory')}
            className="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-cyan-400 hover:underline font-medium"
          >
            <span>Explore Full Graph Memory</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Indexing Metrics Grid */}
        <div className="pt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f]">
            <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 block">
              Scanned Files
            </span>
            <span className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
              {metrics?.totalFiles ?? 0}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f]">
            <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 block">
              Indexed Symbols
            </span>
            <span className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
              {counts.symbols ?? (isMemoryConnected ? '—' : 0)}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f]">
            <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 block">
              Recorded Decisions
            </span>
            <span className="text-sm font-bold font-mono text-purple-600 dark:text-purple-400">
              {counts.decisions ?? 0}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f]">
            <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 block">
              Recorded Bugs
            </span>
            <span className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400">
              {counts.bugs ?? 0}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f]">
            <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 block">
              Verified Fixes
            </span>
            <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {counts.fixes ?? 0}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f]">
            <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 block">
              Graph Edges
            </span>
            <span className="text-sm font-bold font-mono text-violet-600 dark:text-cyan-400">
              {counts.relationships ?? 0}
            </span>
          </div>
        </div>

        {indexingStatus !== 'indexed' && (
          <div className="mt-3 p-3 rounded-lg bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Graph indexing coverage notice: </span>
              {analysisData?.indexing?.error || 'Graph index is currently initializing or FalkorDB is not connected. Static source inspection is active, and investigations will truthfully reflect available evidence.'}
            </div>
          </div>
        )}
      </div>

      {/* 3. Live Provider Data: Open Pull Requests & Open Issues */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Open Pull Requests */}
        <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#1f2a3f]">
              <div className="flex items-center gap-2">
                <GitPullRequest className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Open Pull Requests
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {prList.length} displayed{!hasMorePRs && prList.length > 0 ? ' · all loaded' : ''}
              </span>
            </div>

            <div className="pt-3 divide-y divide-slate-100 dark:divide-[#151c2c]">
              {pullsError ? (
                <div className="p-3 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                  Provider PR notice: {pullsError}
                </div>
              ) : prList.length > 0 ? (
                prList.map((pr) => (
                  <div key={pr.id || pr.number} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-teal-600 dark:text-teal-400">
                          #{pr.number}
                        </span>
                        <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {pr.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        <span>by {pr.author}</span>
                        <span>·</span>
                        <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-[#151c2c] border border-slate-200 dark:border-[#1f2a3f]">
                          {pr.head} → {pr.base}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleLaunchInvestigation('pr', pr)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md border border-teal-200 dark:border-teal-900/60 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-950/70 transition-colors shrink-0 shadow-2xs"
                    >
                      <span>Review PR</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                  {isRefreshingProvider ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                      <span>Loading pull requests...</span>
                    </div>
                  ) : (
                    'No open pull requests recorded for this repository.'
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Load More PRs Control */}
          {prList.length > 0 && (
            <div className="pt-4 border-t border-slate-100 dark:border-[#151c2c] mt-2">
              {hasMorePRs ? (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={handleLoadMorePRs}
                    disabled={isLoadingMorePRs}
                    className="w-full sm:w-auto px-4 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#1f2a3f] bg-slate-50 dark:bg-[#111726] hover:bg-slate-100 dark:hover:bg-[#151c2c] text-slate-700 dark:text-slate-300 transition-colors inline-flex items-center justify-center gap-2 shadow-2xs disabled:opacity-60"
                  >
                    {isLoadingMorePRs ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-500" />
                        <span>Loading more pull requests...</span>
                      </>
                    ) : (
                      <span>Load more pull requests</span>
                    )}
                  </button>
                </div>
              ) : (
                prList.length >= 5 && (
                  <div className="text-center text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                    All open pull requests loaded
                  </div>
                )
              )}
              {loadMorePRsError && (
                <div className="mt-2 p-2 rounded bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 text-xs flex items-center justify-between">
                  <span>{loadMorePRsError}</span>
                  <button onClick={handleLoadMorePRs} className="underline font-semibold ml-2">Retry</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Open Issues */}
        <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#1f2a3f]">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Open Issues
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {issuesList.length} displayed{repository?.openIssuesCount && repository.openIssuesCount > issuesList.length ? ` · ${repository.openIssuesCount} total` : ''}
              </span>
            </div>

            <div className="pt-3 divide-y divide-slate-100 dark:divide-[#151c2c]">
              {issuesError ? (
                <div className="p-3 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                  Provider Issues notice: {issuesError}
                </div>
              ) : issuesList.length > 0 ? (
                issuesList.map((issue) => (
                  <div key={issue.id || issue.number} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-violet-600 dark:text-cyan-400">
                          #{issue.number}
                        </span>
                        <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {issue.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        <span>opened by {issue.author}</span>
                        {issue.labels?.length > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-[10px] text-violet-600 dark:text-violet-400">
                              {issue.labels.slice(0, 2).join(', ')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleLaunchInvestigation('issue', issue)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md border border-violet-200 dark:border-violet-900/60 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-cyan-300 hover:bg-violet-100 dark:hover:bg-violet-950/70 transition-colors shrink-0 shadow-2xs"
                    >
                      <span>Investigate</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                  {isRefreshingProvider ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                      <span>Loading issues...</span>
                    </div>
                  ) : (
                    'No open issues found for this repository.'
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Load More Issues Control */}
          {issuesList.length > 0 && (
            <div className="pt-4 border-t border-slate-100 dark:border-[#151c2c] mt-2">
              {hasMoreIssues ? (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={handleLoadMoreIssues}
                    disabled={isLoadingMoreIssues}
                    className="w-full sm:w-auto px-4 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#1f2a3f] bg-slate-50 dark:bg-[#111726] hover:bg-slate-100 dark:hover:bg-[#151c2c] text-slate-700 dark:text-slate-300 transition-colors inline-flex items-center justify-center gap-2 shadow-2xs disabled:opacity-60"
                  >
                    {isLoadingMoreIssues ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
                        <span>Loading more issues...</span>
                      </>
                    ) : (
                      <span>Load more issues</span>
                    )}
                  </button>
                </div>
              ) : (
                issuesList.length >= 5 && (
                  <div className="text-center text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                    All open issues loaded
                  </div>
                )
              )}
              {loadMoreIssuesError && (
                <div className="mt-2 p-2 rounded bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 text-xs flex items-center justify-between">
                  <span>{loadMoreIssuesError}</span>
                  <button onClick={handleLoadMoreIssues} className="underline font-semibold ml-2">Retry</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. Recent Commits & Branches Strip */}
      <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#1f2a3f]">
          <div className="flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Recent Commits & Revision History
            </h3>
          </div>
          {branches.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
              <GitBranch className="w-3.5 h-3.5" />
              <span>{branches.length} branches</span>
            </div>
          )}
        </div>

        <div className="pt-3">
          {commitsError ? (
            <div className="p-3 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
              Provider commit notice: {commitsError}
            </div>
          ) : commits.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-[#151c2c]">
              {commits.slice(0, 6).map((c) => (
                <div key={c.sha} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-start sm:items-center gap-2 min-w-0">
                    <code className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#151c2c] text-emerald-700 dark:text-emerald-400 border border-slate-200 dark:border-[#1f2a3f] shrink-0">
                      {c.shortSha || c.sha?.slice(0, 7)}
                    </code>
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {c.message}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500 font-mono shrink-0">
                    <span>{c.author}</span>
                    {c.date && <span>· {new Date(c.date).toLocaleDateString()}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-slate-400 dark:text-slate-500">
              {isRefreshingProvider ? 'Loading commits...' : 'No commit history available from provider.'}
            </div>
          )}
        </div>
      </div>

      {/* 5. Main 2-Column: AI Architecture Summary & Execution Architecture */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* AI Architectural Summary */}
          <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-[#1f2a3f]">
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-600 dark:text-cyan-400" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  AI Architectural Summary
                </h2>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#151c2c] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#1f2a3f]">
                  {summaryMeta?.model || 'Gemini'}
                </span>
                {summaryMeta?.isDeterministicFallback ? (
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60"
                    title="Generated deterministically from verified repository and graph evidence"
                  >
                    Deterministic Fallback
                  </span>
                ) : summaryMeta?.fallbackUsed ? (
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60"
                  >
                    Failover ({summaryMeta.attempts || 2} attempts)
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                onClick={onGenerateSummary}
                disabled={isGeneratingSummary}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-[#222e44] bg-slate-50 dark:bg-[#151c2c] hover:bg-slate-100 dark:hover:bg-[#1f2a3f] text-slate-800 dark:text-slate-100 disabled:opacity-50 transition-colors shrink-0 shadow-2xs"
              >
                {isGeneratingSummary ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-600 dark:text-cyan-400" />
                    <span>Synthesizing...</span>
                  </>
                ) : summaryError ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Summary</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Regenerate</span>
                  </>
                )}
              </button>
            </div>

            <div className="pt-4">
              {summary ? (
                <div className="space-y-3">
                  <MarkdownView text={summary} />
                </div>
              ) : isGeneratingSummary ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin text-violet-600 dark:text-cyan-400" />
                  <span className="text-xs font-medium">
                    Synthesizing repository summary from verified manifests & graph evidence...
                  </span>
                </div>
              ) : summaryError ? (
                <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/60 text-xs text-red-700 dark:text-red-400 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">Summary generation encountered an issue</p>
                    <p className="mt-0.5">{summaryError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={onGenerateSummary}
                    className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium shrink-0"
                  >
                    Retry Summary
                  </button>
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  <p>Preparing repository architectural summary...</p>
                </div>
              )}
            </div>
          </div>

          {/* Execution Entry Points */}
          <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#1f2a3f]">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Execution Entry Points
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {architecture?.entryPoints?.length || 0} identified
              </span>
            </div>

            <div className="pt-3 divide-y divide-slate-100 dark:divide-[#151c2c]">
              {architecture?.entryPoints && architecture.entryPoints.length > 0 ? (
                architecture.entryPoints.map((entry) => (
                  <div key={entry.path} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 font-mono text-slate-800 dark:text-cyan-400">
                      <FileCode className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                      <span className="font-medium">{entry.path}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#151c2c] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#1f2a3f] text-[11px]">
                        {entry.type}
                      </span>
                      <span className="text-slate-400 dark:text-slate-500 text-[11px] font-mono">
                        {entry.language}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-xs text-slate-400 dark:text-slate-500">
                  No standard root execution entry points identified.
                </p>
              )}
            </div>
          </div>

          {/* Classified Directory Roles */}
          <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#1f2a3f]">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-violet-500 dark:text-cyan-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Identified Directory Roles
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigateToTab('memory')}
                className="text-xs text-violet-600 dark:text-cyan-400 hover:underline flex items-center gap-1 font-medium"
              >
                <span>Inspect in Graph Explorer</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {structure?.classifiedDirectories && structure.classifiedDirectories.length > 0 ? (
                structure.classifiedDirectories.slice(0, 8).map((dir) => (
                  <div key={dir.path} className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f] space-y-1 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {dir.path}
                      </span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-200 dark:bg-[#151c2c] text-slate-700 dark:text-slate-300">
                        {dir.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                      {dir.description}
                    </p>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-xs text-slate-400 dark:text-slate-500 col-span-2">
                  No conventional directory roles categorized.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar: Languages, Tech Stack, & Observations */}
        <div className="space-y-6">
          {/* Languages Breakdown */}
          <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-5 shadow-xs">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 pb-3 border-b border-slate-200 dark:border-[#1f2a3f]">
              Languages
            </h3>

            {techStack?.languages && techStack.languages.length > 0 ? (
              <div className="pt-3 space-y-3">
                <div className="w-full h-2 rounded-full overflow-hidden flex bg-slate-100 dark:bg-[#151c2c]">
                  {techStack.languages.map((l) => (
                    <div
                      key={l.name}
                      style={{ 
                        width: `${Math.max(l.percentage, 4)}%`,
                        backgroundColor: LANG_COLORS[l.name] || '#8b949e'
                      }}
                      title={`${l.name}: ${l.percentage}% (${l.count} files)`}
                    />
                  ))}
                </div>

                <div className="space-y-1.5 pt-1">
                  {techStack.languages.map((l) => (
                    <div key={l.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: LANG_COLORS[l.name] || '#8b949e' }}
                        />
                        <span className="font-medium text-slate-800 dark:text-slate-200">{l.name}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-slate-500 dark:text-slate-400">
                        <span>{l.percentage}%</span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">({l.count} files)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="py-4 text-center text-xs text-slate-400">No language data</p>
            )}
          </div>

          {/* Tech Stack Modules */}
          <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-5 shadow-xs">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 pb-3 border-b border-slate-200 dark:border-[#1f2a3f]">
              Technologies & Frameworks
            </h3>

            <div className="pt-3 space-y-3">
              {techStack?.backend?.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Backend Runtime
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {techStack.backend.map(b => (
                      <span key={b.name} className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#151c2c] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-[#1f2a3f]">
                        {b.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {techStack?.frontend?.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Frontend
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {techStack.frontend.map(f => (
                      <span key={f.name} className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#151c2c] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-[#1f2a3f]">
                        {f.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {frameworks && frameworks.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Frameworks & Libraries
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {frameworks.map(f => (
                      <span key={f.name} className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#151c2c] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-[#1f2a3f]">
                        {f.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {techStack?.devops?.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    DevOps & Containers
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {techStack.devops.map(d => (
                      <span key={d.name} className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#151c2c] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-[#1f2a3f]">
                        {d.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(!techStack?.backend?.length && !techStack?.frontend?.length && !frameworks?.length && !techStack?.devops?.length) && (
                <p className="text-xs text-slate-400 italic">No external frameworks or servers detected.</p>
              )}
            </div>
          </div>

          {/* Engineering Observations */}
          <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-5 shadow-xs">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 pb-3 border-b border-slate-200 dark:border-[#1f2a3f]">
              Engineering Observations
            </h3>

            <div className="pt-3 space-y-2">
              {observations && observations.length > 0 ? (
                observations.map((obs, idx) => {
                  const isPos = obs.status === 'positive';
                  return (
                    <div key={idx} className="flex items-start gap-2 text-xs">
                      {isPos ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <Info className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{obs.title}</span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{obs.detail}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-slate-400">No specific observations noted.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
