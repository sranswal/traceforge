import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  GitCommit,
  GitBranch,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Play,
  RotateCcw,
  Sparkles,
  ArrowRight,
  FileCode,
  Layers,
  Database,
  Search,
  Zap,
  Info,
  Loader2,
  History,
  Bug,
  Activity,
  ChevronRight,
  ChevronDown,
  Terminal,
  ShieldAlert,
  Split
} from 'lucide-react';
import InvestigationStepIndicator from '../InvestigationStepIndicator';
import CausalGraphCanvas from '../Graph/CausalGraphCanvas';
import CausalSynthesisPanel from '../Investigation/CausalSynthesisPanel';
import { formatRelationshipType } from '../../utils/evidenceAdapter';

export default function IncidentInvestigationTab({
  analysisData,
  memoryOverview,
  graphHealth,
  onNavigateToTab,
  onAskInCodebase,
  onRefreshMemory
}) {
  const activeRepo = analysisData?.repository?.fullName || null;
  const providerName = 'FalkorDB';

  // Guided workflow step state: 'incident' | 'diagnosis' | 'recovery' | 'memory'
  const [currentStep, setCurrentStep] = useState('incident');
  const [completedSteps, setCompletedSteps] = useState([]);

  // Selected node & edge in causal graph canvas
  const [selectedGraphNode, setSelectedGraphNode] = useState(null);
  const [selectedGraphEdge, setSelectedGraphEdge] = useState(null);
  const [isEvidenceExpanded, setIsEvidenceExpanded] = useState(true);

  // Controlled graph experiment state
  const [isExperimentRunning, setIsExperimentRunning] = useState(false);
  const [baselineInvestigation, setBaselineInvestigation] = useState(null);

  // Scenario scope: 'synthetic' | 'active'
  const [scenarioMode, setScenarioMode] = useState('synthetic');
  const [targetRepo, setTargetRepo] = useState('acme/payment-gateway');
  const [fixtureAnalysis, setFixtureAnalysis] = useState(null);

  // Incident intake form state
  const [reportTitle, setReportTitle] = useState('Payment Gateway 504 Gateway Timeout Cascade');
  const [symptoms, setSymptoms] = useState(
    'Clients receiving HTTP 504 Gateway Timeout on /api/pay immediately following deployment of commit 8f2a1b9 ("Refactor rate limit cache in services/rateLimiter.js").'
  );
  const [entryPoint, setEntryPoint] = useState('server/routes/pay.js');
  const [suspectedCommit, setSuspectedCommit] = useState('8f2a1b9');
  const [suspectedComponent, setSuspectedComponent] = useState('services/rateLimiter.js');

  // Investigation & Simulation state
  const [isSeeding, setIsSeeding] = useState(false);
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [investigation, setInvestigation] = useState(null);
  const [investigationError, setInvestigationError] = useState(null);

  const [isSimulating, setIsSimulating] = useState(false);
  const [simulation, setSimulation] = useState(null);
  const [simulationError, setSimulationError] = useState(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordedOutcome, setRecordedOutcome] = useState(null);
  const [recordError, setRecordError] = useState(null);

  // In-tab memory recall state
  const [isRecalling, setIsRecalling] = useState(false);
  const [recalledData, setRecalledData] = useState(null);
  const [recallError, setRecallError] = useState(null);

  // Pre-fetch synthetic fixture analysis on mount or scenario change if not yet loaded
  useEffect(() => {
    if (scenarioMode === 'synthetic' && !fixtureAnalysis) {
      fetch('/api/incident/seed')
        .then(res => res.json())
        .then(data => {
          if (data?.fixture) {
            setFixtureAnalysis(data.fixture);
          }
        })
        .catch(() => {});
    }
  }, [scenarioMode, fixtureAnalysis]);

  // Switch scenario between Synthetic Incident Fixture and Active Analyzed Repository
  const handleSelectScenarioMode = (mode) => {
    setScenarioMode(mode);
    setInvestigation(null);
    setInvestigationError(null);
    setSimulation(null);
    setSimulationError(null);
    setRecordedOutcome(null);
    setRecordError(null);
    setRecalledData(null);
    setRecallError(null);
    setSelectedGraphNode(null);
    setSelectedGraphEdge(null);
    setBaselineInvestigation(null);
    setCurrentStep('incident');
    setCompletedSteps([]);

    if (mode === 'synthetic') {
      setTargetRepo('acme/payment-gateway');
      setReportTitle('Payment Gateway 504 Gateway Timeout Cascade');
      setSymptoms(
        'Clients receiving HTTP 504 Gateway Timeout on /api/pay immediately following deployment of commit 8f2a1b9 ("Refactor rate limit cache in services/rateLimiter.js").'
      );
      setEntryPoint('server/routes/pay.js');
      setSuspectedCommit('8f2a1b9');
      setSuspectedComponent('services/rateLimiter.js');
    } else {
      setTargetRepo(activeRepo || 'current/repo');
      setReportTitle(`Incident Investigation: ${activeRepo || 'current/repo'}`);
      setSymptoms('Describe observed anomaly or error symptoms in the active repository...');
      setEntryPoint(analysisData?.architecture?.entryPoints?.[0]?.path || 'server/index.js');
      setSuspectedCommit('');
      setSuspectedComponent('');
    }
  };

  // Load and pre-seed the deterministic synthetic incident scenario in FalkorDB
  const handleLoadScenario = async () => {
    setIsSeeding(true);
    setInvestigationError(null);
    setInvestigation(null);
    setSimulation(null);
    setSimulationError(null);
    setRecordedOutcome(null);
    setRecordError(null);
    setRecalledData(null);
    setRecallError(null);
    setSelectedGraphNode(null);
    setSelectedGraphEdge(null);
    setBaselineInvestigation(null);
    setCurrentStep('incident');
    setCompletedSteps([]);

    try {
      const res = await fetch('/api/incident/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to seed synthetic incident fixture.');
      }
      setScenarioMode('synthetic');
      setTargetRepo(data.repository.fullName);
      setFixtureAnalysis(data.fixture || { repository: data.repository });
      setReportTitle(data.incident.title);
      setSymptoms(data.incident.symptoms);
      setEntryPoint(data.incident.entryPoint);
      setSuspectedCommit(data.incident.suspectedCommit);
      setSuspectedComponent(data.incident.suspectedComponent);
      if (onRefreshMemory) {
        onRefreshMemory(data.repository.fullName);
      }
    } catch (err) {
      setInvestigationError(err.message);
    } finally {
      setIsSeeding(false);
    }
  };

  // Run graph-native incident investigation
  const handleRunInvestigation = async () => {
    setIsInvestigating(true);
    setInvestigationError(null);
    setSimulation(null);
    setSimulationError(null);
    setRecordedOutcome(null);
    setRecordError(null);

    try {
      const reportPayload = {
        repoFullName: targetRepo,
        title: reportTitle,
        symptoms,
        entryPoint,
        suspectedCommit,
        suspectedComponent
      };

      let currentFixture = fixtureAnalysis;
      if (scenarioMode === 'synthetic' && !currentFixture) {
        try {
          const seedRes = await fetch('/api/incident/seed');
          const seedData = await seedRes.json();
          if (seedData?.fixture) {
            currentFixture = seedData.fixture;
            setFixtureAnalysis(currentFixture);
          }
        } catch {
          // Soft fail
        }
      }

      const effectiveAnalysis = scenarioMode === 'synthetic'
        ? (currentFixture || { repository: { fullName: targetRepo } })
        : analysisData;

      const res = await fetch('/api/incident/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report: reportPayload,
          analysis: effectiveAnalysis
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Incident investigation failed.');
      }

      setInvestigation(data);
      setCompletedSteps(prev => Array.from(new Set([...prev, 'incident'])));
      // Automatically advance to Step 2 (Diagnosis) on successful investigation
      setCurrentStep('diagnosis');
    } catch (err) {
      setInvestigationError(err.message);
    } finally {
      setIsInvestigating(false);
    }
  };

  // Run controlled read-only graph edge ablation experiment
  const handleRunControlledExperiment = async () => {
    if (!investigation || isExperimentRunning) return;
    setIsExperimentRunning(true);
    setInvestigationError(null);

    try {
      if (!baselineInvestigation) {
        setBaselineInvestigation(investigation);
      }

      const reportPayload = {
        repoFullName: targetRepo,
        title: reportTitle,
        symptoms,
        entryPoint,
        suspectedCommit,
        suspectedComponent
      };

      const effectiveAnalysis = scenarioMode === 'synthetic'
        ? (fixtureAnalysis || { repository: { fullName: targetRepo } })
        : analysisData;

      const res = await fetch('/api/incident/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report: reportPayload,
          analysis: effectiveAnalysis,
          experiment: {
            ablateCausalEdge: true,
            caller: 'verifyToken',
            callee: 'acquireTokenLock'
          }
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Controlled experiment query failed.');
      }

      setInvestigation(data);
      setSelectedGraphEdge(null);
    } catch (err) {
      setInvestigationError(err.message);
    } finally {
      setIsExperimentRunning(false);
    }
  };

  // Restore normal investigation from baseline or rerun query
  const handleRestoreNormalInvestigation = async () => {
    if (baselineInvestigation) {
      setInvestigation(baselineInvestigation);
      setBaselineInvestigation(null);
      setSelectedGraphEdge(null);
      return;
    }
    await handleRunInvestigation();
  };

  // Run safe recovery simulation
  const handleSimulateRecovery = async () => {
    if (!investigation) return;
    setIsSimulating(true);
    setSimulationError(null);

    try {
      const res = await fetch('/api/incident/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investigation,
          action: 'revert_blocking_mutex_and_apply_circuit_breaker'
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Recovery simulation failed.');
      }

      setSimulation(data);
      setCompletedSteps(prev => Array.from(new Set([...prev, 'diagnosis', 'recovery'])));
      setCurrentStep('recovery');
    } catch (err) {
      setSimulationError(err.message);
    } finally {
      setIsSimulating(false);
    }
  };

  // Explicit in-tab memory recall query against active graph provider
  const handleVerifyRecall = async () => {
    setIsRecalling(true);
    setRecallError(null);

    try {
      const res = await fetch(`/api/incident/recall?repo=${encodeURIComponent(targetRepo)}&q=${encodeURIComponent('lock starvation timeout token bucket')}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to recall incident memory from graph.');
      }
      setRecalledData(data);
    } catch (err) {
      setRecallError(err.message);
    } finally {
      setIsRecalling(false);
    }
  };

  // Record confirmed resolution to graph memory
  const handleRecordResolution = async () => {
    if (!investigation) return;
    setIsRecording(true);
    setRecordError(null);

    try {
      const res = await fetch('/api/incident/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investigation })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record resolution to graph memory.');
      }

      setRecordedOutcome(data);
      setCompletedSteps(prev => Array.from(new Set([...prev, 'incident', 'diagnosis', 'recovery', 'memory'])));
      setCurrentStep('memory');
      if (onRefreshMemory) {
        onRefreshMemory(targetRepo);
      }
      // Immediately verify live recall in canonical graph memory
      handleVerifyRecall();
    } catch (err) {
      setRecordError(err.message);
    } finally {
      setIsRecording(false);
    }
  };

  // Navigates to Ask Codebase preserving the incident repository context
  const handleAskCodebaseAndRecall = () => {
    const prompt = `What recorded resolution exists in ${providerName} for the payment gateway timeout incident in ${targetRepo}?`;
    const recallEntity = {
      id: recordedOutcome?.bugId || `${targetRepo}::bug::resolution-inc-pay-504-01`,
      title: investigation?.report?.title || reportTitle,
      label: 'Bug Resolution',
      filePath: investigation?.recoveryRecommendation?.targetFile || 'services/tokenBucket.js',
      details: investigation?.recoveryRecommendation?.actionDescription || 'Recorded historical remediation precedent (untested in current runtime)',
      provenance: `${providerName} Canonical Graph Memory`
    };

    const effectiveAnalysis = scenarioMode === 'synthetic'
      ? (fixtureAnalysis || { repository: { fullName: targetRepo } })
      : analysisData;

    const navPayload = {
      prompt,
      entity: recallEntity,
      targetRepo,
      targetAnalysis: effectiveAnalysis
    };

    if (onAskInCodebase) {
      onAskInCodebase(navPayload);
    } else if (onNavigateToTab) {
      onNavigateToTab('ask', navPayload);
    }
  };

  // Response-derived indicators
  const isConfident = investigation?.diagnosis?.confidence === 'HIGH' || investigation?.diagnosis?.confidence === 'MEDIUM';
  const hasRootCause = Boolean(
    investigation?.diagnosis?.rootCauseFile &&
    investigation.diagnosis.rootCauseFile !== 'unknown' &&
    investigation?.diagnosis?.rootCauseSymbol &&
    investigation.diagnosis.rootCauseSymbol !== 'unknown'
  );
  const evidenceChain = investigation?.connectedEvidence?.evidenceChain || [];
  const callHopsCount = evidenceChain.filter(e => e.type === 'SYMBOL_CALLS_SYMBOL').length;
  const topCandidate = investigation?.diagnosis?.candidateRankings?.[0];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Persistent 4-Step Guided Workflow Indicator */}
      <InvestigationStepIndicator
        currentStep={currentStep}
        onSelectStep={setCurrentStep}
        completedSteps={completedSteps}
      />

      {/* STEP 1: Incident Intake & Purposeful Forensic Workspace */}
      {currentStep === 'incident' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column (7 cols): Compact Incident Scope & Anomaly Intake */}
            <div className="lg:col-span-7 xl:col-span-7 space-y-5">
              <div className="bg-white dark:bg-[#101624] border border-slate-200 dark:border-[#1f2a3f] rounded-xl p-5 shadow-lg transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-[#1b2537]">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800/40">
                        Step 1 · Intake
                      </span>
                      <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40">
                        {providerName} Active
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mt-1">
                      <ShieldAlert className="w-4.5 h-4.5 text-violet-600 dark:text-violet-400" />
                      Incident Scope & Anomaly Intake
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={handleLoadScenario}
                    disabled={isSeeding || isInvestigating}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 dark:text-amber-300 dark:border-amber-800/50 transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                    <span>{isSeeding ? 'Seeding in FalkorDB...' : 'Seed Sample Incident'}</span>
                  </button>
                </div>

                {/* Target Scope Switcher */}
                <div className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-200 dark:border-[#1b2537]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Target:</span>
                    <div className="inline-flex rounded-md shadow-xs" role="group">
                      <button
                        type="button"
                        onClick={() => handleSelectScenarioMode('synthetic')}
                        className={`px-2.5 py-1 text-xs font-medium rounded-l-md border transition-colors cursor-pointer ${
                          scenarioMode === 'synthetic'
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 dark:bg-[#151c2d] dark:text-slate-300 dark:border-[#25324b] dark:hover:bg-[#1a243a]'
                        }`}
                      >
                        Sample Incident (acme/payment-gateway)
                      </button>
                      {activeRepo && activeRepo !== 'acme/payment-gateway' && (
                        <button
                          type="button"
                          onClick={() => handleSelectScenarioMode('active')}
                          className={`px-2.5 py-1 text-xs font-medium rounded-r-md border transition-colors cursor-pointer ${
                            scenarioMode === 'active'
                              ? 'bg-violet-600 text-white border-violet-600'
                              : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 dark:bg-[#151c2d] dark:text-slate-300 dark:border-[#25324b] dark:hover:bg-[#1a243a]'
                          }`}
                        >
                          Active ({activeRepo})
                        </button>
                      )}
                    </div>
                  </div>

                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    Active Graph: <code className="text-slate-800 dark:text-slate-200 font-semibold">{targetRepo}</code>
                  </span>
                </div>

                {/* Form Fields: Grouped for Quick Scanning */}
                <div className="pt-3 space-y-3.5">
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Incident Title / Anomaly Summary
                      </label>
                      <input
                        type="text"
                        value={reportTitle}
                        onChange={(e) => setReportTitle(e.target.value)}
                        className="w-full text-xs font-mono px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-[#232f44] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Symptoms & Observable Failure Logs
                      </label>
                      <textarea
                        rows={2}
                        value={symptoms}
                        onChange={(e) => setSymptoms(e.target.value)}
                        className="w-full text-xs font-mono px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-[#232f44] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Forensic Anchors: 3-column compact grid */}
                  <div className="pt-2 border-t border-slate-100 dark:border-[#1b2537] grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        API Entrypoint
                      </label>
                      <input
                        type="text"
                        value={entryPoint}
                        onChange={(e) => setEntryPoint(e.target.value)}
                        className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-[#232f44] text-slate-900 dark:text-slate-100 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Suspect Refactor Commit
                      </label>
                      <input
                        type="text"
                        value={suspectedCommit}
                        onChange={(e) => setSuspectedCommit(e.target.value)}
                        className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-[#232f44] text-slate-900 dark:text-slate-100 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Surface Suspect (Decoy)
                      </label>
                      <input
                        type="text"
                        value={suspectedComponent}
                        onChange={(e) => setSuspectedComponent(e.target.value)}
                        className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-[#232f44] text-slate-900 dark:text-slate-100 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Action Bar */}
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-[#1b2537] flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Scope: <code className="font-mono text-slate-800 dark:text-slate-200">{targetRepo}</code>
                  </span>

                  <button
                    type="button"
                    onClick={handleRunInvestigation}
                    disabled={isInvestigating}
                    className="flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold rounded-lg bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-950/30 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isInvestigating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Traversing FalkorDB Graph...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>Investigate Failure Chain</span>
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </>
                    )}
                  </button>
                </div>

                {investigationError && (
                  <div className="mt-3 p-3 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-800/40 dark:text-rose-300 text-xs">
                    {investigationError}
                  </div>
                )}
              </div>

              {/* Keyword Baseline vs Graph Traversal Comparison (Below Intake) */}
              {investigation && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Naive Keyword Search Baseline */}
                  <div className="bg-white dark:bg-[#121622] border border-rose-200 dark:border-rose-900/50 rounded-xl p-4 flex flex-col justify-between shadow-md transition-colors text-xs space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50 flex items-center gap-1.5 text-[10px]">
                          <XCircle className="w-3 h-3 text-rose-500 dark:text-rose-400" /> Naive Keyword Search Baseline
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">0 Call Hops</span>
                      </div>

                      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                        Trapped on Decoy: <code className="text-rose-600 dark:text-rose-400">{investigation.keywordBaseline.topSuspectFile}</code>
                      </h3>

                      <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
                        {investigation.keywordBaseline.suspectedRootCause}
                      </p>

                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#212b3e] text-[11px] space-y-1 transition-colors">
                        <div className="font-semibold text-slate-800 dark:text-slate-300 flex items-center gap-1">
                          <HelpCircle className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                          <span>Why Keyword Search Failed:</span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-400">
                          {investigation.keywordBaseline.limitation}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-[#1a2336] text-[11px] text-rose-600 dark:text-rose-400/80">
                      Result: Developers waste hours modifying rateLimiter.js without fixing the lock starvation.
                    </div>
                  </div>

                  {/* Graph-Native Traversal */}
                  <div className="bg-white dark:bg-[#121622] border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-4 flex flex-col justify-between shadow-md transition-colors text-xs space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50 flex items-center gap-1.5 text-[10px]">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> Graph-Native Multi-Hop Traversal
                        </span>
                        <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                          {callHopsCount} Call Hops
                        </span>
                      </div>

                      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                        True Root Cause: <code className="text-emerald-600 dark:text-emerald-400">{investigation.diagnosis.rootCauseFile}</code>
                        <span className="ml-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">({investigation.diagnosis.rootCauseSymbol})</span>
                      </h3>

                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-[11px]">
                        Traced multi-hop call chain from entrypoint <code className="font-mono text-violet-600 dark:text-violet-300">{investigation.entryPoint}</code> to <code className="font-mono text-rose-600 dark:text-rose-300">{investigation.diagnosis.rootCauseSymbol}</code>. Correlated refactor commit <code className="font-mono text-amber-600 dark:text-amber-300">{investigation.suspectedCommit?.slice(0, 7)}</code> and verified prior fix in FalkorDB!
                      </p>

                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-emerald-200 dark:border-emerald-900/30 text-[11px] space-y-1 transition-colors">
                        <div className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          <span>Graph Discovery:</span>
                        </div>
                        <ul className="text-slate-700 dark:text-slate-300 list-disc list-inside space-y-0.5">
                          {topCandidate?.reasons?.map((reason, idx) => (
                            <li key={idx}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-[#1a2336] flex items-center justify-between text-xs">
                      <span className="font-medium text-emerald-600 dark:text-emerald-400 text-[11px]">
                        Confidence: {investigation.diagnosis.confidence}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentStep('diagnosis')}
                        className="text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-semibold flex items-center gap-1 cursor-pointer text-xs"
                      >
                        <span>View Causal Graph & Diagnosis</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column (5 cols): Purposeful Contextual Region - Forensic Hypotheses & Live Graph Context */}
            <div className="lg:col-span-5 xl:col-span-5 space-y-4">
              {/* Context Card 1: Competing Hypotheses & Topology Context */}
              <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-4 shadow-md space-y-3 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Pre-Flight Forensic Hypotheses & Topology
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 dark:bg-[#162035] dark:text-slate-400 dark:border-[#24334e]">
                    AST vs Lexical
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  {/* Decoy Surface Clue */}
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-slate-800 space-y-1.5 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        Hypothesis A · Lexical Decoy
                      </span>
                      <span className="text-[10px] font-mono text-rose-600 dark:text-rose-400 font-semibold">
                        0 Call Hops
                      </span>
                    </div>
                    <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                      services/rateLimiter.js
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                      Surface symptom match (&quot;rate limit&quot;, &quot;504 timeout&quot;) tricks lexical search into blaming recent cache refactor commit <code className="text-amber-600 dark:text-amber-300 font-mono">8f2a1b9</code>.
                    </p>
                  </div>

                  {/* Multi-Hop Causal Chain */}
                  <div className="p-3 rounded-lg bg-violet-50/50 dark:bg-[#0f1728] border border-violet-200 dark:border-violet-900/50 space-y-1.5 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-300">
                        Hypothesis B · Causal Call Chain
                      </span>
                      <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                        2 Call Hops
                      </span>
                    </div>
                    <div className="font-mono text-xs font-bold text-violet-700 dark:text-violet-300">
                      routes/pay.js ➔ auth.js ➔ tokenBucket.js
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                      AST traversal traces synchronous downstream calls from <code className="text-slate-800 dark:text-slate-200 font-mono">/api/pay</code> through <code className="text-violet-600 dark:text-violet-300 font-mono">verifyToken</code> into mutex acquisition in <code className="text-rose-600 dark:text-rose-300 font-mono">acquireTokenLock</code>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Context Card 2: FalkorDB Institutional Memory & Graph Readiness */}
              <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-4 shadow-md space-y-3 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      FalkorDB Memory Readiness
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/40 font-semibold">
                    Live Indexed
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1e293d] space-y-1 transition-colors">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Historical Precedent Bug:</span>
                      <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">Worker Thread Lock Starvation</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Recorded Fix Precedent:</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">Commit 7e1d4c2 (dev-alice)</span>
                    </div>
                    <p className="text-[10.5px] text-slate-500 dark:text-slate-400 italic pt-1 border-t border-slate-200 dark:border-[#1a2336]">
                      Remediation pattern: Non-blocking tryAcquire with circuit breaker timeout.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-teal-50/50 dark:bg-[#0a1622] border border-teal-200 dark:border-teal-900/40 text-[11px] text-slate-700 dark:text-slate-300 leading-snug">
                    <strong className="text-teal-800 dark:text-teal-300 block mb-0.5">Traversal Strategy:</strong>
                    Investigating traverses the live AST graph starting from the entrypoint, intersects candidate symbols with recent Git commit diffs, and evaluates FalkorDB historical memory for instant precedent recall.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Graph-First Diagnosis Workspace (~60% Causal Graph, ~40% Side Panel) */}
      {currentStep === 'diagnosis' && (
        <div className="space-y-6">
          {!investigation ? (
            <div className="p-8 rounded-xl bg-white dark:bg-[#101624] border border-slate-200 dark:border-[#1f2a3f] text-center space-y-4 shadow-sm transition-colors">
              <ShieldAlert className="w-8 h-8 text-amber-500 dark:text-amber-400 mx-auto" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                No Active Investigation Diagnosis
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                Please run the failure chain investigation or load the sample incident to generate the causal graph.
              </p>
              <button
                type="button"
                onClick={() => setCurrentStep('incident')}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold cursor-pointer shadow-sm transition-colors"
              >
                Go to Step 1: Incident Intake
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Controlled Read-Only Graph Experiment Banner / Control Bar */}
              {investigation?.experiment?.active ? (
                <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/60 shadow-lg text-xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-amber-300 font-bold">
                      <Split className="w-4 h-4 text-amber-400" />
                      <span>Controlled Read-Only Graph Experiment Active: Decisive Edge Ablated</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRestoreNormalInvestigation}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors text-xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore Normal Investigation</span>
                    </button>
                  </div>

                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    Decisive call edge <code className="text-amber-300 font-mono">verifyToken ➔ acquireTokenLock</code> was excluded from graph traversal to test causal necessity. No database records were mutated.
                  </p>

                  {/* Controlled Before/After Proof */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="p-3 rounded-lg bg-[#0d121c] border border-emerald-900/40 space-y-1">
                      <div className="text-[10px] font-mono text-emerald-400 font-bold uppercase">
                        Before Ablation (Intact Graph)
                      </div>
                      <div className="text-slate-200 font-semibold">
                        Root Cause: <code className="text-emerald-400">acquireTokenLock</code> in <span className="text-slate-300">services/tokenBucket.js</span>
                      </div>
                      <div className="text-slate-400 text-[10px]">
                        Confidence: <strong className="text-emerald-400">HIGH</strong> · Multi-hop traversal & commit verified
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[#140c10] border border-rose-900/60 space-y-1">
                      <div className="text-[10px] font-mono text-rose-400 font-bold uppercase">
                        After Ablation (Severed Edge)
                      </div>
                      <div className="text-slate-200 font-semibold">
                        Root Cause: <code className="text-rose-400">unknown</code> (Target Unreachable)
                      </div>
                      <div className="text-rose-400 text-[10px]">
                        Confidence: <strong>INSUFFICIENT_EVIDENCE</strong> · Refuses ungrounded guesswork
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1f2a3f] transition-colors">
                  <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <Split className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    <span><strong>Controlled Forensic Experiment:</strong> Test causal necessity by ablating the critical call edge in a read-only query.</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunControlledExperiment}
                    disabled={isExperimentRunning || isInvestigating}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 dark:bg-[#192236] dark:hover:bg-[#22304c] dark:text-violet-300 dark:border-violet-800/40 text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50 shrink-0"
                  >
                    {isExperimentRunning ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Running Experiment...</span>
                      </>
                    ) : (
                      <>
                        <Split className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                        <span>Run Read-Only Edge Ablation</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Main Workspace Layout: Dominant Causal Graph (~60%) + Forensic Side Panel (~40%) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Center Stage: Dominant Causal Graph Canvas (~60% width) */}
                <div className="lg:col-span-7 xl:col-span-8 space-y-5">
                  <CausalGraphCanvas
                    investigation={investigation}
                    onSelectNode={setSelectedGraphNode}
                    selectedNodeId={selectedGraphNode?.id}
                    onSelectEdge={setSelectedGraphEdge}
                    selectedEdgeId={selectedGraphEdge?.id}
                  />

                  {/* Forensic Candidate Matrix: Competing Hypotheses */}
                  <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#0f1422] p-5 shadow-lg space-y-4 transition-colors">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          Forensic Candidate Matrix: Competing Hypotheses
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 dark:bg-[#162035] dark:text-slate-400 dark:border-[#24334e]">
                        Canonical Evidence Contrast
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      {/* Candidate A: Decoy */}
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0a0e17] border border-slate-200 dark:border-slate-800/80 space-y-2.5 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                            Candidate A · Decoy Trap
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/50 font-bold">
                            REJECTED
                          </span>
                        </div>

                        <div>
                          <div className="font-bold text-slate-900 dark:text-slate-200">checkRateLimit</div>
                          <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">services/rateLimiter.js</div>
                        </div>

                        <div className="space-y-1.5 text-[11px]">
                          <div>
                            <span className="text-slate-500 dark:text-slate-400 font-semibold">Supporting Clues: </span>
                            <span className="text-slate-700 dark:text-slate-300">Surface keyword match (&quot;rate limit&quot;, &quot;504&quot;, &quot;timeout&quot;) in symptoms.</span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-slate-400 font-semibold">Contradictory Graph Proof: </span>
                            <span className="text-rose-600 dark:text-rose-300/90 font-medium">0 call hops from /api/pay. Static AST traversal confirms it is never invoked in the failure path.</span>
                          </div>
                        </div>
                      </div>

                      {/* Candidate B: True Root Cause */}
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0a0e17] border border-rose-200 dark:border-rose-900/60 space-y-2.5 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800/60">
                            Candidate B · True Root Cause
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/50 font-bold">
                            {investigation?.experiment?.active ? 'ABLATED' : 'CONFIRMED'}
                          </span>
                        </div>

                        <div>
                          <div className="font-bold text-slate-900 dark:text-slate-200">acquireTokenLock</div>
                          <div className="font-mono text-[11px] text-rose-600 dark:text-rose-300">services/tokenBucket.js</div>
                        </div>

                        <div className="space-y-1.5 text-[11px]">
                          <div>
                            <span className="text-slate-500 dark:text-slate-400 font-semibold">Verified Graph Evidence: </span>
                            <span className="text-slate-700 dark:text-slate-300">Direct 2-hop call path from /api/pay via verifyToken (services/auth.js).</span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-slate-400 font-semibold">Suspected Introducing Commit: </span>
                            <span className="text-amber-600 dark:text-amber-300 font-mono font-medium">8f2a1b9 (dev-charlie)</span>
                            <span className="text-slate-600 dark:text-slate-400"> added synchronous blocking wait.</span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-slate-400 font-semibold">Historical Remediation: </span>
                            <span className="text-emerald-600 dark:text-emerald-300 font-mono font-medium">7e1d4c2 (dev-alice)</span>
                            <span className="text-slate-600 dark:text-slate-400"> previously fixed with non-blocking tryAcquire.</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Collapsible Evidence Panel Below Graph */}
                  <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#0f1422] p-4 shadow-md transition-colors">
                    <button
                      type="button"
                      onClick={() => setIsEvidenceExpanded(!isEvidenceExpanded)}
                      className="w-full flex items-center justify-between text-left focus:outline-none cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-200">
                          Connected Graph Evidence & Traversal Provenance ({evidenceChain.length} Nodes)
                        </h4>
                      </div>
                      {isEvidenceExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      )}
                    </button>

                    {isEvidenceExpanded && (
                      <div className="mt-3 space-y-2 pt-2 border-t border-slate-200 dark:border-[#1b2537]">
                        {evidenceChain.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 dark:bg-[#0a0e17] border border-slate-200 dark:border-[#1d273a] text-xs transition-colors"
                          >
                            <span className="font-mono font-bold w-5 h-5 rounded-full bg-violet-100 text-violet-700 border border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800/40 flex items-center justify-center shrink-0 text-[10px]">
                              {item.step || idx + 1}
                            </span>

                            <div className="flex-1 space-y-0.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-slate-900 dark:text-slate-200">
                                  {item.label}
                                </span>
                                <span className="font-mono text-[10px] px-2 py-0.2 rounded bg-teal-50 text-teal-800 border border-teal-200 dark:bg-[#162033] dark:text-teal-300 dark:border-[#24334f]">
                                  {item.provenance}
                                </span>
                              </div>

                              <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                                {item.details}
                              </p>

                              <div className="flex flex-wrap items-center gap-2.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 pt-0.5">
                                {item.filePath && <span>Path: {item.filePath}</span>}
                                {item.lineRange && <span>Range: {item.lineRange}</span>}
                                {item.commitSha && (
                                  <span className={item.commitRole === 'historical_fix'
                                    ? 'px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/40 font-semibold'
                                    : 'px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/40 font-semibold'
                                  }>
                                    {item.commitRoleLabel || (item.commitRole === 'historical_fix' ? 'Historical Fix' : 'Suspected Change')}: {item.commitSha.slice(0, 7)}
                                  </span>
                                )}
                                <span className="text-violet-600 dark:text-violet-400 font-medium">Relationship: {formatRelationshipType(item.type)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Side Panel: Root Cause Candidate & Action Card (~40% width) */}
                <div className="lg:col-span-5 xl:col-span-4 space-y-4">
                  {/* Candidate Diagnosis Summary Card */}
                  <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-5 shadow-lg space-y-4 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
                        investigation.diagnosis.confidence === 'INSUFFICIENT_EVIDENCE'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/40'
                          : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/40'
                      }`}>
                        {investigation.diagnosis.confidence === 'INSUFFICIENT_EVIDENCE' ? 'Insufficient Evidence' : 'Root Cause Isolated'}
                      </span>
                      <span className={`text-xs font-mono font-semibold ${
                        investigation.diagnosis.confidence === 'HIGH' 
                          ? 'text-emerald-600 dark:text-emerald-400' 
                          : investigation.diagnosis.confidence === 'MEDIUM' 
                            ? 'text-teal-600 dark:text-teal-400' 
                            : 'text-amber-600 dark:text-amber-400'
                      }`}>
                        Confidence: {investigation.diagnosis.confidence}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-rose-500 dark:text-rose-400" />
                        <span>{investigation.diagnosis.rootCauseSymbol}</span>
                      </h3>
                      <div className="font-mono text-xs text-rose-600 dark:text-rose-300 mt-0.5">
                        {investigation.diagnosis.rootCauseFile}
                      </div>
                    </div>

                    {/* Explicit Provenance: Suspected Change vs Historical Fix vs Current Status */}
                    <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#212b3e] text-xs space-y-3 transition-colors">
                      {/* 1. Suspected Introducing Change */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-slate-800 dark:text-slate-300">
                          <span className="font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                            <GitCommit className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                            <span>Suspected Introducing Change:</span>
                          </span>
                          <span className="font-mono text-amber-700 dark:text-amber-300 font-semibold">
                            {investigation.diagnosis?.suspectedIntroducingCommit?.shortSha ||
                             investigation.connectedEvidence?.matchingCommit?.shortSha ||
                             investigation.suspectedCommit?.slice(0, 7) ||
                             'None'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 pl-5">
                          {investigation.diagnosis?.suspectedIntroducingCommit?.message ||
                           investigation.connectedEvidence?.matchingCommit?.message ||
                           'Refactor commit associated with regression'}
                        </div>
                      </div>

                      {/* 2. Historical Fix Precedent */}
                      <div className="space-y-1 pt-2 border-t border-slate-200 dark:border-[#1a2334]">
                        <div className="flex items-center justify-between text-slate-800 dark:text-slate-300">
                          <span className="font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                            <span>Historical Fix Commit:</span>
                          </span>
                          <span className="font-mono text-emerald-700 dark:text-emerald-300 font-semibold">
                            {investigation.diagnosis?.historicalFix?.commitShortSha ||
                             (investigation.connectedEvidence?.priorFixMatch?.commitSha ? investigation.connectedEvidence.priorFixMatch.commitSha.slice(0, 7) : 'None')}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 pl-5">
                          {investigation.diagnosis?.historicalFix?.summary ||
                           investigation.connectedEvidence?.priorFixMatch?.fixSummary ||
                           'Known institutional remediation'}
                        </div>
                      </div>

                      {/* 3. Current Implementation Status */}
                      <div className="pt-2 border-t border-slate-200 dark:border-[#1a2334]">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                          Current Implementation Status:
                        </span>
                        <div className="p-2 rounded bg-amber-50/80 border border-amber-200 text-[11px] text-amber-900 dark:bg-[#101827] dark:border-[#25324d] dark:text-amber-300/90 leading-snug">
                          {investigation.diagnosis?.implementationStatus?.status ||
                           'Historical fix recorded; current implementation not yet verified.'}
                        </div>
                      </div>
                    </div>

                    {/* Contextual Entity Inspector (Selected Edge OR Selected Node) */}
                    {selectedGraphEdge ? (
                      <div className="rounded-xl border border-violet-200 bg-violet-50/70 dark:border-violet-800/40 dark:bg-[#0d1322] p-4 text-xs space-y-2 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                            <Info className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                            <span>Edge: {selectedGraphEdge.label}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedGraphEdge(null)}
                            className="text-[10px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                          >
                            Close
                          </button>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">
                          {selectedGraphEdge.description}
                        </p>
                        <div className="font-mono text-[10px] text-teal-700 dark:text-teal-300">
                          Provenance: {selectedGraphEdge.provenance}
                        </div>
                      </div>
                    ) : selectedGraphNode ? (
                      <div className="rounded-xl border border-violet-200 bg-violet-50/70 dark:border-violet-800/40 dark:bg-[#0d1322] p-4 text-xs space-y-2 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                            <Info className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                            <span>Node: {selectedGraphNode.label}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedGraphNode(null)}
                            className="text-[10px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                          >
                            Close
                          </button>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 text-[11px]">
                          {selectedGraphNode.details}
                        </p>
                        <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                          File: {selectedGraphNode.filePath} {selectedGraphNode.lineRange ? `(${selectedGraphNode.lineRange})` : ''}
                        </div>
                        <div className="font-mono text-[10px] text-teal-700 dark:text-teal-300">
                          Provenance: {selectedGraphNode.provenance}
                        </div>
                      </div>
                    ) : null}

                    {/* Semantic Causal Synthesis Panel */}
                    <div className="space-y-2 pt-1">
                      <CausalSynthesisPanel investigation={investigation} />
                    </div>

                    {/* Next Action: Advance to Recovery Simulation */}
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleSimulateRecovery}
                        disabled={isSimulating}
                        className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-violet-950/30 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isSimulating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Simulating Patch...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-4 h-4 text-violet-200" />
                            <span>Simulate Safe Recovery</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: Safe Recovery Simulation */}
      {currentStep === 'recovery' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-6 shadow-lg space-y-5 transition-colors">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800/40">
                  Step 3 · Recovery Simulation
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mt-1">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  Blast-Radius Safe Patch Simulation
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Calculates side-effect blast radius and generates non-breaking patch simulation without modifying production code.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSimulateRecovery}
                  disabled={isSimulating}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-[#182236] dark:hover:bg-[#202c46] dark:text-slate-200 dark:border-[#2b3a58] transition-all cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span>{isSimulating ? 'Re-simulating...' : 'Re-run Simulation'}</span>
                </button>
              </div>
            </div>

            {simulation ? (
              <div className="space-y-4">
                {/* Proposal Banner */}
                <div className="p-3 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/40 dark:text-emerald-300 text-xs flex items-center justify-between transition-colors">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span><strong>Static Recovery Proposal:</strong> Replaces synchronous blocking mutex with non-blocking <code>tryAcquire</code> and circuit breaker timeout.</span>
                  </span>
                  <span className="font-mono text-[11px] text-emerald-800 dark:text-emerald-400 font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50">
                    Risk: {simulation.riskLevel}
                  </span>
                </div>

                {/* Diff Viewer */}
                <div>
                  <span className="font-mono font-semibold text-xs text-slate-700 dark:text-slate-300 block mb-1">
                    Simulated Patch Diff (Target: <code>{investigation?.diagnosis?.rootCauseFile}</code>):
                  </span>
                  <pre className="p-4 rounded-xl bg-slate-900 text-emerald-400 font-mono text-xs overflow-x-auto border border-slate-800 dark:bg-[#090d14] dark:border-[#1b2537] leading-relaxed">
                    {simulation.simulatedDiff}
                  </pre>
                </div>

                {/* Blast Radius & Verification */}
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#212b3e] text-xs space-y-1 transition-colors">
                  <div className="text-slate-800 dark:text-slate-300 font-semibold">
                    Blast Radius Assessment:
                  </div>
                  <p className="text-slate-600 dark:text-slate-400">
                    {simulation.verificationSummary}
                  </p>
                  {simulation.blastRadius?.note && (
                    <p className="text-[11px] text-slate-500 italic">
                      Note: {simulation.blastRadius.note}
                    </p>
                  )}
                </div>

                {/* Action: Proceed to Record */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setCurrentStep('diagnosis')}
                    className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                  >
                    ← Back to Diagnosis Graph
                  </button>

                  <button
                    type="button"
                    onClick={handleRecordResolution}
                    disabled={isRecording}
                    className="flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/30 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isRecording ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Recording to FalkorDB...</span>
                      </>
                    ) : (
                      <>
                        <Database className="w-4 h-4" />
                        <span>Record Resolution & Persist Memory</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#212b3e] text-center space-y-3 transition-colors">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Click &quot;Simulate Safe Recovery&quot; to test the non-breaking remediation proposal against the causal graph.
                </p>
                <button
                  type="button"
                  onClick={handleSimulateRecovery}
                  disabled={isSimulating}
                  className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold cursor-pointer shadow-sm transition-colors"
                >
                  Run Simulation Now
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 4: Memory Resolution & Provenance Recall */}
      {currentStep === 'memory' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-6 shadow-lg space-y-5 transition-colors">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800/40">
                  Step 4 · Graph Memory & Recall
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mt-1">
                  <Database className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  Institutional Memory Persistence in {providerName}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Persists resolved incident as connected Bug & Fix nodes with <code>RESOLVED_BY</code> relation for instant future recall.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleVerifyRecall}
                  disabled={isRecalling}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-[#182236] dark:hover:bg-[#202c46] dark:text-slate-200 dark:border-[#2b3a58] transition-all cursor-pointer disabled:opacity-50"
                >
                  {isRecalling ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Recalling...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span>Verify Graph Recall</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleAskCodebaseAndRecall}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold shadow-sm transition-colors text-xs cursor-pointer"
                >
                  <span>Ask Codebase & Test Memory</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Persistence Confirmation */}
            {recordedOutcome && (
              <div className="p-4 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/40 dark:text-emerald-300 text-xs space-y-2 transition-colors">
                <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Resolution Successfully Persisted to {providerName} Graph</span>
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  Created Bug node (<code>{recordedOutcome.bugId}</code>) and Fix node connected via <code>RESOLVED_BY</code> in repository <span className="font-mono text-emerald-700 dark:text-emerald-300 font-semibold">{targetRepo}</span>.
                </p>
              </div>
            )}

            {/* Recalled Fix Precedent Card */}
            {recalledData && (
              <div className="p-5 rounded-xl bg-white dark:bg-[#0e1320] border border-teal-300 dark:border-teal-800/50 shadow-md text-xs space-y-4 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-[#1b2537]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800/40 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-teal-600 dark:text-teal-400" /> Grounded Graph Recall
                    </span>
                    <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                      Scope: {recalledData.repoFullName || targetRepo}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                    Provenance: FIX_RESOLVES_BUG
                  </span>
                </div>

                {/* Provenance Distinction Banner */}
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#080c14] border border-slate-200 dark:border-[#1e293d] text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed transition-colors">
                  <strong className="text-slate-900 dark:text-white">Historical Precedent vs. Current Implementation:</strong>{' '}
                  {recalledData.recalledFix?.verificationNote ||
                    'This record is a historical fix precedent retrieved from FalkorDB graph memory. While this remediation pattern resolved a past incident, the current repository implementation has not yet been verified or executed in a live runtime.'}
                </div>

                {recalledData.recalledFix && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2.5">
                      <Bug className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                          {recalledData.recalledFix.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                          Bug ID: {recalledData.recalledFix.bugId}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1e293d] transition-colors">
                        <span className="text-slate-500 dark:text-slate-400 block">Target Remediated File:</span>
                        <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                          {recalledData.recalledFix.filePath || 'services/tokenBucket.js'}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1e293d] transition-colors">
                        <span className="text-slate-500 dark:text-slate-400 block">Historical Fix Commit (Precedent):</span>
                        <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                          {recalledData.recalledFix.commitSha ? recalledData.recalledFix.commitSha.slice(0, 7) : '7e1d4c2'}
                        </span>
                      </div>
                    </div>

                    {recalledData.recalledFix.introducedInCommit && (
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1e293d] text-[11px] transition-colors">
                        <span className="text-slate-500 dark:text-slate-400 block">Suspected Introducing Commit (Regression):</span>
                        <span className="font-mono font-semibold text-amber-700 dark:text-amber-300">
                          {recalledData.recalledFix.introducedInCommit.slice(0, 7)}
                        </span>
                      </div>
                    )}

                    <div className="p-3 rounded-lg bg-teal-50/60 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800/40 space-y-1.5 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-600 dark:text-slate-400 block text-[10px] font-mono uppercase font-semibold">
                          {recalledData.recalledFix.remediationCategory || 'Recorded Historical Remediation'}:
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/40">
                          Current Implementation Unverified
                        </span>
                      </div>
                      <p className="font-mono text-teal-800 dark:text-teal-300 font-semibold text-xs leading-relaxed">
                        {recalledData.recalledFix.fixSummary || recalledData.recalledFix.fixDescription}
                      </p>
                      <div className="pt-2 border-t border-teal-200 dark:border-teal-900/40 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        <span>Evidence: {recalledData.recalledFix.evidenceType || 'historical_fix_precedent'}</span>
                        <span className="text-amber-600 dark:text-amber-400/90">Runtime Verification: None (Historical Precedent Only)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {recallError && (
              <div className="p-3 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-800/40 dark:text-rose-300 text-xs">
                {recallError}
              </div>
            )}

            {recordError && (
              <div className="p-3 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-800/40 dark:text-rose-300 text-xs">
                {recordError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
