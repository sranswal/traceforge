import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import RepoHeader from './components/RepoHeader';
import RepoInput from './components/RepoInput';
import AnalysisProgress from './components/AnalysisProgress';
import OverviewTab from './components/Tabs/OverviewTab';
import ArchitectureTab from './components/Tabs/ArchitectureTab';
import ProjectMemoryTab from './components/Tabs/ProjectMemoryTab';
import IncidentInvestigationTab from './components/Tabs/IncidentInvestigationTab';
import AskCodebaseTab from './components/Tabs/AskCodebaseTab';
import { buildCompactAnalysisPayload } from './utils/analysisPayload';

const SESSION_ANALYSIS_KEY = 'traceforge_last_analysis';
const SESSION_TAB_KEY = 'traceforge_active_tab';
const SESSION_SUMMARY_PREFIX = 'traceforge_summary_';

export default function App() {
  // Theme state: default 'dark', persisted in localStorage
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('traceforge_theme') || 'dark';
  });

  // Analysis state (restored across page refresh so FalkorDB persistence can be verified on reload)
  const [analysisData, setAnalysisData] = useState(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_ANALYSIS_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = sessionStorage.getItem(SESSION_TAB_KEY) || 'incident';
    return savedTab === 'files' ? 'memory' : savedTab;
  }); // 'incident' | 'overview' | 'memory' | 'architecture' | 'ask'
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Persistent Project Memory & Graph Database Health state
  const [memoryOverview, setMemoryOverview] = useState(null);
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);
  const [memoryError, setMemoryError] = useState(null);
  const [graphHealth, setGraphHealth] = useState(null);

  // Fetch active graph provider health on initial application load
  useEffect(() => {
    fetch('/api/health/graph')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data) setGraphHealth(data);
      })
      .catch(() => { });
  }, []);

  // AI Summary state (automatic per repository with session cache & in-flight deduplication)
  const [summary, setSummary] = useState(null);
  const [summaryMeta, setSummaryMeta] = useState(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const summaryInFlightRepoRef = useRef(null);
  const autoSummaryAttemptedRepoRef = useRef(null);

  // Ask Codebase & Selected-Node Investigation state
  const [qaHistory, setQaHistory] = useState([]);
  const [isAsking, setIsAsking] = useState(false);
  const [qaError, setQaError] = useState(null);
  const [investigationTarget, setInvestigationTarget] = useState(null);

  // Apply theme class to document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('traceforge_theme', theme);
  }, [theme]);

  useEffect(() => {
    try {
      if (analysisData) {
        sessionStorage.setItem(SESSION_ANALYSIS_KEY, JSON.stringify(analysisData));
      } else {
        sessionStorage.removeItem(SESSION_ANALYSIS_KEY);
      }
    } catch {
      // Ignore storage quota errors
    }
  }, [analysisData]);

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_TAB_KEY, activeTab);
    } catch {
      // Ignore storage errors
    }
  }, [activeTab]);

  const fetchMemoryOverview = useCallback(async (repoFullName) => {
    const targetRepo = repoFullName || analysisData?.repository?.fullName;
    if (!targetRepo) return;

    setIsLoadingMemory(true);
    setMemoryError(null);

    try {
      const res = await fetch(`/api/memory/overview?repo=${encodeURIComponent(targetRepo)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load project memory overview.');
      }
      setMemoryOverview(data);
    } catch (err) {
      setMemoryError(err.message);
    } finally {
      setIsLoadingMemory(false);
    }
  }, [analysisData?.repository?.fullName]);

  const generateSummaryForRepo = useCallback(async (targetAnalysis, { forceRefresh = false } = {}) => {
    const repoData = targetAnalysis || analysisData;
    const repoFullName = repoData?.repository?.fullName;
    if (!repoData || !repoFullName) return;

    // 1. Check session cache unless forced
    const cacheKey = `${SESSION_SUMMARY_PREFIX}${repoFullName}`;
    if (!forceRefresh) {
      try {
        const cachedRaw = sessionStorage.getItem(cacheKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached?.summary) {
            setSummary(cached.summary);
            setSummaryMeta(cached.meta || null);
            setSummaryError(null);
            return;
          }
        }
      } catch {
        // Ignore storage errors
      }
    }

    // 2. Prevent duplicate concurrent Gemini requests for the same repository
    if (summaryInFlightRepoRef.current === repoFullName) {
      return;
    }

    summaryInFlightRepoRef.current = repoFullName;
    setIsGeneratingSummary(true);
    setSummaryError(null);

    try {
      const compactAnalysis = buildCompactAnalysisPayload(repoData);
      const res = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis: compactAnalysis })
      });

      const data = await res.json();
      if (res.status === 413 || data.code === 'PAYLOAD_TOO_LARGE') {
        throw new Error(
          data.error ||
          'Repository analysis payload exceeded the request size limit (413). Compact payload mode is required.'
        );
      }
      if (!res.ok || !data.available) {
        throw new Error(data.error || 'Failed to generate AI summary.');
      }

      const meta = {
        model: data.model || null,
        primaryModel: data.primaryModel || null,
        fallbackUsed: Boolean(data.fallbackUsed),
        attempts: data.attempts || 1
      };
      setSummary(data.summary);
      setSummaryMeta(meta);

      try {
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({ summary: data.summary, meta })
        );
      } catch {
        // Ignore storage errors
      }
    } catch (err) {
      setSummaryError(err.message);
    } finally {
      if (summaryInFlightRepoRef.current === repoFullName) {
        summaryInFlightRepoRef.current = null;
      }
      setIsGeneratingSummary(false);
    }
  }, [analysisData]);

  // Automatically fetch FalkorDB overview and generate AI summary when a repository is loaded
  useEffect(() => {
    const repoFullName = analysisData?.repository?.fullName;
    if (repoFullName) {
      fetchMemoryOverview(repoFullName);
      if (autoSummaryAttemptedRepoRef.current !== repoFullName) {
        autoSummaryAttemptedRepoRef.current = repoFullName;
        generateSummaryForRepo(analysisData, { forceRefresh: false });
      }
    } else {
      setMemoryOverview(null);
      autoSummaryAttemptedRepoRef.current = null;
    }
  }, [analysisData, fetchMemoryOverview, generateSummaryForRepo]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleAnalyze = async (repoUrl) => {
    setIsLoading(true);
    setError(null);
    setSummary(null);
    setSummaryMeta(null);
    setSummaryError(null);
    setQaHistory([]);
    setQaError(null);
    setInvestigationTarget(null);
    setMemoryOverview(null);
    summaryInFlightRepoRef.current = null;
    autoSummaryAttemptedRepoRef.current = null;

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: repoUrl })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze repository');
      }

      setAnalysisData(data);
      setActiveTab('overview');
    } catch (err) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred during analysis');
      setAnalysisData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateSummary = () => {
    if (!analysisData) return;
    generateSummaryForRepo(analysisData, { forceRefresh: true });
  };

  const handleAskQuestion = async (
    query,
    focusEntity = null,
    targetAnalysisOverride = null,
    targetRepoOverride = null
  ) => {
    const activeEntity = focusEntity || investigationTarget?.entity || null;

    const entityRepo =
      activeEntity?.repoFullName ||
      (typeof activeEntity?.id === 'string' &&
        activeEntity.id.includes('::') &&
        activeEntity.id.split('::')[0].includes('/')
        ? activeEntity.id.split('::')[0]
        : null) ||
      (activeEntity?.label === 'Repository' && activeEntity?.title?.includes('/')
        ? activeEntity.title
        : null);

    const activeTargetRepo =
      targetRepoOverride ||
      investigationTarget?.targetRepo ||
      entityRepo ||
      targetAnalysisOverride?.repository?.fullName ||
      investigationTarget?.targetAnalysis?.repository?.fullName ||
      analysisData?.repository?.fullName ||
      null;

    const isCrossRepo = Boolean(
      activeTargetRepo &&
      analysisData?.repository?.fullName &&
      activeTargetRepo !== analysisData.repository.fullName
    );

    const activeAnalysis =
      targetAnalysisOverride ||
      investigationTarget?.targetAnalysis ||
      (isCrossRepo ? { repository: { fullName: activeTargetRepo } } : analysisData);

    if (!activeAnalysis || !query.trim()) return;
    setIsAsking(true);
    setQaError(null);

    try {
      const compactAnalysis = buildCompactAnalysisPayload(activeAnalysis);
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: query,
          analysis: compactAnalysis,
          focusEntity: activeEntity,
          targetRepo: activeTargetRepo
        })
      });

      const data = await res.json();
      if (res.status === 413 || data.code === 'PAYLOAD_TOO_LARGE') {
        throw new Error(
          data.error ||
          'Request payload exceeded the server size limit (413). Try narrowing the query or refreshing repository analysis.'
        );
      }
      if (!res.ok || !data.available) {
        throw new Error(data.error || 'Failed to retrieve answer from Gemini.');
      }

      setQaHistory(prev => [
        {
          question: query,
          answer: data.answer,
          graphMemory: data.graphMemory || null,
          focusEntity: activeEntity,
          targetRepo: activeTargetRepo,
          model: data.model || null,
          fallbackUsed: Boolean(data.fallbackUsed),
          attempts: data.attempts || 1,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        },
        ...prev
      ]);
    } catch (err) {
      setQaError(err.message);
    } finally {
      setIsAsking(false);
    }
  };

  const handleAskFromMemory = (promptText, entity = null) => {
    const entityRepo =
      entity?.repoFullName ||
      (typeof entity?.id === 'string' &&
        entity.id.includes('::') &&
        entity.id.split('::')[0].includes('/')
        ? entity.id.split('::')[0]
        : null) ||
      (entity?.label === 'Repository' && entity?.title?.includes('/')
        ? entity.title
        : null) ||
      analysisData?.repository?.fullName ||
      null;

    const isCrossRepo = Boolean(
      entityRepo &&
      analysisData?.repository?.fullName &&
      entityRepo !== analysisData.repository.fullName
    );

    const targetAnalysis = isCrossRepo
      ? { repository: { fullName: entityRepo } }
      : analysisData;

    const effectiveTarget = {
      prompt: promptText,
      entity: entity || null,
      targetRepo: entityRepo,
      targetAnalysis: targetAnalysis || null
    };

    setInvestigationTarget(effectiveTarget);
    setActiveTab('ask');
    handleAskQuestion(promptText, entity || null, targetAnalysis || null, entityRepo);
  };

  const handleAskFromIncident = ({ prompt, entity = null, targetRepo = null, targetAnalysis = null }) => {
    const effectiveRepo =
      targetRepo ||
      targetAnalysis?.repository?.fullName ||
      entity?.repoFullName ||
      (typeof entity?.id === 'string' &&
        entity.id.includes('::') &&
        entity.id.split('::')[0].includes('/')
        ? entity.id.split('::')[0]
        : null) ||
      analysisData?.repository?.fullName ||
      null;

    const effectiveTarget = {
      prompt: prompt || '',
      entity: entity || null,
      targetRepo: effectiveRepo,
      targetAnalysis: targetAnalysis || (effectiveRepo ? { repository: { fullName: effectiveRepo } } : null)
    };
    setInvestigationTarget(effectiveTarget);
    setActiveTab('ask');
    if (prompt) {
      handleAskQuestion(prompt, entity || null, effectiveTarget.targetAnalysis, effectiveRepo);
    }
  };


  const handleClearQA = () => {
    setQaHistory([]);
    setQaError(null);
  };

  const handleNewSearch = () => {
    setAnalysisData(null);
    setMemoryOverview(null);
    setSummary(null);
    setSummaryMeta(null);
    setSummaryError(null);
    setInvestigationTarget(null);
    setError(null);
    setActiveTab('incident');
  };

  const handleExploreSampleIncident = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await fetch('/api/incident/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: 'acme/payment-gateway' })
      });

      const sampleData = {
        repository: {
          name: 'payment-gateway',
          fullName: 'acme/payment-gateway',
          url: 'https://github.com/acme/payment-gateway',
          branch: 'main',
          stars: 1840,
          forks: 312,
          description: 'Distributed payment settlement and token bucket rate limiter service'
        },
        metrics: {
          totalFiles: 38,
          analysisTimeMs: 95
        },
        projectType: 'Payment Infrastructure',
        architecture: {
          pattern: 'Microservices & Distributed Locking'
        },
        projectMemory: {
          ingested: true,
          provider: 'falkordb'
        }
      };

      setAnalysisData(sampleData);
      setActiveTab('incident');
      fetchMemoryOverview('acme/payment-gateway');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to initialize sample incident');
    } finally {
      setIsLoading(false);
    }
  };

  const currentActiveRepo = investigationTarget?.targetRepo || analysisData?.repository?.fullName || null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090d14] text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      {/* 1. Global Application Header */}
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        onNewSearch={handleNewSearch}
        currentRepo={currentActiveRepo}
        graphHealth={graphHealth}
        isLoading={isLoading}
      />

      {/* 2. Repository Workspace Header (Shown when repository is analyzed) */}
      {analysisData && !isLoading && (
        <RepoHeader
          analysisData={analysisData}
          memoryOverview={memoryOverview}
          graphHealth={graphHealth}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
        />
      )}

      {/* 3. Main Workspace Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {/* State A: Loading in progress */}
        {isLoading && <AnalysisProgress />}

        {/* State B: Empty initial state (No repo loaded yet) */}
        {!analysisData && !isLoading && (
          <RepoInput
            onAnalyze={handleAnalyze}
            onExploreSample={handleExploreSampleIncident}
            isLoading={isLoading}
            error={error}
          />
        )}

        {/* State C: Active Repository Workspace with Tabs */}
        {analysisData && !isLoading && (
          <div className="animate-in fade-in duration-200">
            {activeTab === 'overview' && (
              <OverviewTab
                analysisData={analysisData}
                memoryOverview={memoryOverview}
                summary={summary}
                summaryMeta={summaryMeta}
                isGeneratingSummary={isGeneratingSummary}
                summaryError={summaryError}
                onGenerateSummary={handleGenerateSummary}
                onNavigateToTab={setActiveTab}
              />
            )}

            {activeTab === 'architecture' && (
              <ArchitectureTab analysisData={analysisData} />
            )}

            {activeTab === 'memory' && (
              <ProjectMemoryTab
                analysisData={analysisData}
                memoryOverview={memoryOverview}
                graphHealth={graphHealth}
                isLoadingMemory={isLoadingMemory}
                memoryError={memoryError}
                onRefreshMemory={() => fetchMemoryOverview(analysisData.repository?.fullName)}
                onAskInCodebase={handleAskFromMemory}
              />
            )}

            {activeTab === 'incident' && (
              <IncidentInvestigationTab
                analysisData={analysisData}
                memoryOverview={memoryOverview}
                graphHealth={graphHealth}
                onNavigateToTab={(tab, options) => {
                  if (options) {
                    handleAskFromIncident(options);
                  } else {
                    setActiveTab(tab);
                  }
                }}
                onAskInCodebase={handleAskFromIncident}
                onRefreshMemory={(targetRepo) => fetchMemoryOverview(targetRepo || analysisData?.repository?.fullName)}
              />
            )}

            {activeTab === 'ask' && (
              <AskCodebaseTab
                analysisData={analysisData}
                memoryOverview={memoryOverview}
                qaHistory={qaHistory}
                onAskQuestion={handleAskQuestion}
                isAsking={isAsking}
                qaError={qaError}
                onClearHistory={handleClearQA}
                onRefreshMemory={() => fetchMemoryOverview(analysisData.repository?.fullName)}
                onNavigateToTab={setActiveTab}
                investigationTarget={investigationTarget}
                onClearInvestigationTarget={() => setInvestigationTarget(null)}
              />
            )}
          </div>
        )}
      </main>

      {/* Minimal Developer Tool Footer */}
      <footer className="border-t border-[#1f2a3f] bg-[#0c111a] py-3 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <div>
            <span>TraceForge · Graph-Powered Incident Investigation & Codebase Intelligence · Built by </span>
            <a
              href="https://shubham-ranswal.web.app"
              target="_blank"
              rel="noreferrer"
              className="text-slate-300 hover:text-violet-400 hover:underline"
            >
              Shubham Singh Ranswal
            </a>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
            <span>v1.0.0</span>
            <span>·</span>
            <a
              href="https://github.com/sranswal/traceforge"
              target="_blank"
              rel="noreferrer"
              className="hover:underline hover:text-slate-300"
            >
              GitHub Source
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
