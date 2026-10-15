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
  ShieldAlert
} from 'lucide-react';
import InvestigationStepIndicator from '../InvestigationStepIndicator';
import CausalGraphCanvas from '../Graph/CausalGraphCanvas';

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

  // Selected node in causal graph canvas
  const [selectedGraphNode, setSelectedGraphNode] = useState(null);
  const [isEvidenceExpanded, setIsEvidenceExpanded] = useState(true);

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

      {/* STEP 1: Incident Intake & Baseline Contrast */}
      {currentStep === 'incident' && (
        <div className="space-y-6">
          <div className="bg-[#101624] border border-[#1f2a3f] rounded-xl p-5 shadow-lg">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-violet-950/60 text-violet-300 border border-violet-800/40">
                    Step 1 · Intake
                  </span>
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-800/40">
                    {providerName} Active
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-violet-400" />
                  Incident Scope & Anomaly Intake
                </h2>
                <p className="text-xs text-slate-400">
                  Input observed anomaly symptoms and recent deployment commits to initiate multi-hop causal graph traversal.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLoadScenario}
                  disabled={isSeeding || isInvestigating}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-800/50 transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isSeeding ? 'Seeding in FalkorDB...' : 'Seed Sample Incident'}</span>
                </button>
              </div>
            </div>

            {/* Target Scope Switcher */}
            <div className="mt-4 pt-3 border-t border-[#1b2537] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">Target Scope:</span>
                <div className="inline-flex rounded-md shadow-sm" role="group">
                  <button
                    type="button"
                    onClick={() => handleSelectScenarioMode('synthetic')}
                    className={`px-3 py-1 text-xs font-medium rounded-l-md border transition-colors cursor-pointer ${
                      scenarioMode === 'synthetic'
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-[#151c2d] text-slate-300 border-[#25324b] hover:bg-[#1a243a]'
                    }`}
                  >
                    Sample Incident (acme/payment-gateway)
                  </button>
                  {activeRepo && activeRepo !== 'acme/payment-gateway' && (
                    <button
                      type="button"
                      onClick={() => handleSelectScenarioMode('active')}
                      className={`px-3 py-1 text-xs font-medium rounded-r-md border transition-colors cursor-pointer ${
                        scenarioMode === 'active'
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-[#151c2d] text-slate-300 border-[#25324b] hover:bg-[#1a243a]'
                      }`}
                    >
                      Active Repository ({activeRepo})
                    </button>
                  )}
                </div>
              </div>

              <span className="text-xs font-mono text-slate-400">
                Active Graph: <code className="text-slate-200">{targetRepo}</code>
              </span>
            </div>

            {/* Form Fields */}
            <div className="mt-4 pt-4 border-t border-[#1b2537] grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Incident Title / Anomaly Summary
                  </label>
                  <input
                    type="text"
                    value={reportTitle}
                    onChange={(e) => setReportTitle(e.target.value)}
                    className="w-full text-xs font-mono px-3 py-2 rounded-lg bg-[#0b0f17] border border-[#232f44] text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Symptoms & Observable Failure Logs
                  </label>
                  <textarea
                    rows={2}
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                    className="w-full text-xs font-mono px-3 py-2 rounded-lg bg-[#0b0f17] border border-[#232f44] text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      API Entrypoint
                    </label>
                    <input
                      type="text"
                      value={entryPoint}
                      onChange={(e) => setEntryPoint(e.target.value)}
                      className="w-full text-xs font-mono px-3 py-2 rounded-lg bg-[#0b0f17] border border-[#232f44] text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Suspect Refactor Commit
                    </label>
                    <input
                      type="text"
                      value={suspectedCommit}
                      onChange={(e) => setSuspectedCommit(e.target.value)}
                      className="w-full text-xs font-mono px-3 py-2 rounded-lg bg-[#0b0f17] border border-[#232f44] text-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Surface Suspect (Decoy Candidate)
                  </label>
                  <input
                    type="text"
                    value={suspectedComponent}
                    onChange={(e) => setSuspectedComponent(e.target.value)}
                    className="w-full text-xs font-mono px-3 py-2 rounded-lg bg-[#0b0f17] border border-[#232f44] text-slate-100"
                  />
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="mt-5 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Target: <code className="font-mono text-slate-200">{targetRepo}</code>
              </span>

              <button
                type="button"
                onClick={handleRunInvestigation}
                disabled={isInvestigating}
                className="flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold rounded-lg bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-950/50 transition-all disabled:opacity-50 cursor-pointer"
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
              <div className="mt-3 p-3 rounded-lg bg-rose-950/30 border border-rose-800/40 text-xs text-rose-300">
                {investigationError}
              </div>
            )}
          </div>

          {/* Keyword Baseline vs Graph Traversal Comparison */}
          {investigation && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Naive Keyword Search Baseline */}
              <div className="bg-[#121622] border border-rose-900/50 rounded-xl p-5 flex flex-col justify-between shadow-md">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-rose-950/40 text-rose-300 border border-rose-800/50 flex items-center gap-1.5">
                      <XCircle className="w-3.5 h-3.5 text-rose-400" /> Naive Keyword Search Baseline
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">0 Call Hops</span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-100">
                    Trapped on Decoy: <code className="text-rose-400">{investigation.keywordBaseline.topSuspectFile}</code>
                  </h3>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    {investigation.keywordBaseline.suspectedRootCause}
                  </p>

                  <div className="p-3 rounded-lg bg-[#0b0f17] border border-[#212b3e] text-xs space-y-1.5">
                    <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                      Why Keyword Search Failed:
                    </div>
                    <p className="text-slate-400">
                      {investigation.keywordBaseline.limitation}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#1a2336] text-xs text-rose-400/80">
                  Result: Developers waste hours modifying rateLimiter.js without fixing the lock starvation.
                </div>
              </div>

              {/* Graph-Native Traversal */}
              <div className="bg-[#121622] border border-emerald-800/60 rounded-xl p-5 flex flex-col justify-between shadow-md">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-800/50 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Graph-Native Multi-Hop Traversal
                    </span>
                    <span className="text-[11px] font-mono text-emerald-400">
                      {callHopsCount} Call Hops
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-100">
                    True Root Cause: <code className="text-emerald-400">{investigation.diagnosis.rootCauseFile}</code>
                    <span className="ml-1.5 text-xs text-slate-400 font-mono">({investigation.diagnosis.rootCauseSymbol})</span>
                  </h3>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    Traced multi-hop call chain from entrypoint <code className="font-mono text-violet-300">{investigation.entryPoint}</code> to <code className="font-mono text-rose-300">{investigation.diagnosis.rootCauseSymbol}</code>. Correlated refactor commit <code className="font-mono text-amber-300">{investigation.suspectedCommit?.slice(0, 7)}</code> and verified prior fix record in FalkorDB!
                  </p>

                  <div className="p-3 rounded-lg bg-[#0b0f17] border border-emerald-900/30 text-xs space-y-1.5">
                    <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" />
                      Graph Discovery:
                    </div>
                    <ul className="text-slate-300 list-disc list-inside space-y-0.5">
                      {topCandidate?.reasons?.map((reason, idx) => (
                        <li key={idx}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#1a2336] flex items-center justify-between text-xs">
                  <span className="font-medium text-emerald-400">
                    Confidence: {investigation.diagnosis.confidence}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentStep('diagnosis')}
                    className="text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <span>View Causal Graph & Diagnosis</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Graph-First Diagnosis Workspace (~60% Causal Graph, ~40% Side Panel) */}
      {currentStep === 'diagnosis' && (
        <div className="space-y-6">
          {!investigation ? (
            <div className="p-8 rounded-xl bg-[#101624] border border-[#1f2a3f] text-center space-y-4">
              <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto" />
              <h3 className="text-base font-bold text-slate-100">
                No Active Investigation Diagnosis
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Please run the failure chain investigation or load the sample incident to generate the causal graph.
              </p>
              <button
                type="button"
                onClick={() => setCurrentStep('incident')}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold cursor-pointer"
              >
                Go to Step 1: Incident Intake
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Center Stage: Dominant Causal Graph Canvas (~60% width) */}
              <div className="lg:col-span-7 xl:col-span-8 space-y-4">
                <CausalGraphCanvas
                  investigation={investigation}
                  onSelectNode={setSelectedGraphNode}
                  selectedNodeId={selectedGraphNode?.id}
                />

                {/* Collapsible Evidence Panel Below Graph */}
                <div className="rounded-xl border border-[#1f2a3f] bg-[#0f1422] p-4 shadow-md">
                  <button
                    type="button"
                    onClick={() => setIsEvidenceExpanded(!isEvidenceExpanded)}
                    className="w-full flex items-center justify-between text-left focus:outline-none cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-violet-400" />
                      <h4 className="text-xs font-bold text-slate-200">
                        Connected Graph Evidence & Traversal Provenance ({evidenceChain.length} Nodes)
                      </h4>
                    </div>
                    {isEvidenceExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {isEvidenceExpanded && (
                    <div className="mt-3 space-y-2 pt-2 border-t border-[#1b2537]">
                      {evidenceChain.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-2.5 rounded-lg bg-[#0a0e17] border border-[#1d273a] text-xs"
                        >
                          <span className="font-mono font-bold w-5 h-5 rounded-full bg-violet-950/60 text-violet-300 border border-violet-800/40 flex items-center justify-center shrink-0 text-[10px]">
                            {item.step || idx + 1}
                          </span>

                          <div className="flex-1 space-y-0.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-slate-200">
                                {item.label}
                              </span>
                              <span className="font-mono text-[10px] px-2 py-0.2 rounded bg-[#162033] text-teal-300 border border-[#24334f]">
                                {item.provenance}
                              </span>
                            </div>

                            <p className="text-slate-400 text-[11px]">
                              {item.details}
                            </p>

                            <div className="flex flex-wrap items-center gap-2.5 text-[10px] font-mono text-slate-400 pt-0.5">
                              {item.filePath && <span>Path: {item.filePath}</span>}
                              {item.lineRange && <span>Range: {item.lineRange}</span>}
                              {item.commitSha && (
                                <span className={item.commitRole === 'historical_fix'
                                  ? 'px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 font-semibold'
                                  : 'px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40 font-semibold'
                                }>
                                  {item.commitRoleLabel || (item.commitRole === 'historical_fix' ? 'Historical Fix' : 'Suspected Change')}: {item.commitSha.slice(0, 7)}
                                </span>
                              )}
                              <span className="text-violet-400">Rel: {item.type}</span>
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
                <div className="rounded-xl border border-[#1f2a3f] bg-[#101624] p-5 shadow-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/40 font-bold">
                      Root Cause Isolated
                    </span>
                    <span className="text-xs font-mono text-emerald-400 font-semibold">
                      Confidence: {investigation.diagnosis.confidence}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                      <ShieldAlert className="w-5 h-5 text-rose-400" />
                      <span>{investigation.diagnosis.rootCauseSymbol}</span>
                    </h3>
                    <div className="font-mono text-xs text-rose-300 mt-0.5">
                      {investigation.diagnosis.rootCauseFile}
                    </div>
                  </div>

                  {/* Explicit Provenance: Suspected Change vs Historical Fix vs Current Status */}
                  <div className="p-3.5 rounded-lg bg-[#0b0f17] border border-[#212b3e] text-xs space-y-3">
                    {/* 1. Suspected Introducing Change */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                          <GitCommit className="w-3.5 h-3.5 text-amber-400" />
                          <span>Suspected Introducing Change:</span>
                        </span>
                        <span className="font-mono text-amber-300 font-semibold">
                          {investigation.diagnosis?.suspectedIntroducingCommit?.shortSha ||
                           investigation.connectedEvidence?.matchingCommit?.shortSha ||
                           investigation.suspectedCommit?.slice(0, 7) ||
                           'None'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 pl-5">
                        {investigation.diagnosis?.suspectedIntroducingCommit?.message ||
                         investigation.connectedEvidence?.matchingCommit?.message ||
                         'Refactor commit associated with regression'}
                      </div>
                    </div>

                    {/* 2. Historical Fix Precedent */}
                    <div className="space-y-1 pt-2 border-t border-[#1a2334]">
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Historical Fix Commit:</span>
                        </span>
                        <span className="font-mono text-emerald-300 font-semibold">
                          {investigation.diagnosis?.historicalFix?.commitShortSha ||
                           (investigation.connectedEvidence?.priorFixMatch?.commitSha ? investigation.connectedEvidence.priorFixMatch.commitSha.slice(0, 7) : 'None')}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 pl-5">
                        {investigation.diagnosis?.historicalFix?.summary ||
                         investigation.connectedEvidence?.priorFixMatch?.fixSummary ||
                         'Known institutional remediation'}
                      </div>
                    </div>

                    {/* 3. Current Implementation Status */}
                    <div className="pt-2 border-t border-[#1a2334]">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                        Current Implementation Status:
                      </span>
                      <div className="p-2 rounded bg-[#101827] border border-[#25324d] text-[11px] text-amber-300/90 leading-snug">
                        {investigation.diagnosis?.implementationStatus?.status ||
                         'Historical fix recorded; current implementation not yet verified.'}
                      </div>
                    </div>
                  </div>

                  {/* Structured Diagnosis */}
                  <div className="text-xs text-slate-300 leading-relaxed bg-[#0b0f17] p-3 rounded-lg border border-[#212b3e] max-h-40 overflow-y-auto">
                    <strong className="text-slate-100 block mb-1">Causal Synthesis:</strong>
                    {investigation.diagnosis.summary}
                  </div>

                  {/* Next Action: Advance to Recovery Simulation */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleSimulateRecovery}
                      disabled={isSimulating}
                      className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-violet-950/50 transition-all cursor-pointer disabled:opacity-50"
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

                {/* Selected Node Details Card (if user clicked a node on the canvas) */}
                {selectedGraphNode && (
                  <div className="rounded-xl border border-violet-800/40 bg-[#101424] p-4 text-xs space-y-2">
                    <div className="font-semibold text-violet-300 flex items-center gap-1.5">
                      <Info className="w-4 h-4 text-violet-400" />
                      Node Inspection: {selectedGraphNode.label}
                    </div>
                    <p className="text-slate-300 text-[11px]">
                      {selectedGraphNode.details}
                    </p>
                    <div className="font-mono text-[10px] text-slate-400">
                      File: {selectedGraphNode.filePath} {selectedGraphNode.lineRange ? `(${selectedGraphNode.lineRange})` : ''}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: Safe Recovery Simulation */}
      {currentStep === 'recovery' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[#1f2a3f] bg-[#101624] p-6 shadow-lg space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-violet-950/60 text-violet-300 border border-violet-800/40">
                  Step 3 · Recovery Simulation
                </span>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 mt-1">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  Blast-Radius Safe Patch Simulation
                </h3>
                <p className="text-xs text-slate-400">
                  Calculates side-effect blast radius and generates non-breaking patch simulation without modifying production code.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSimulateRecovery}
                  disabled={isSimulating}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-[#182236] hover:bg-[#202c46] text-slate-200 border border-[#2b3a58] transition-all cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                  <span>{isSimulating ? 'Re-simulating...' : 'Re-run Simulation'}</span>
                </button>
              </div>
            </div>

            {simulation ? (
              <div className="space-y-4">
                {/* Proposal Banner */}
                <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-xs text-emerald-300 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>Static Recovery Proposal:</strong> Replaces synchronous blocking mutex with non-blocking <code>tryAcquire</code> and circuit breaker timeout.</span>
                  </span>
                  <span className="font-mono text-[11px] text-emerald-400 font-bold px-2 py-0.5 rounded bg-emerald-900/50">
                    Risk: {simulation.riskLevel}
                  </span>
                </div>

                {/* Diff Viewer */}
                <div>
                  <span className="font-mono font-semibold text-xs text-slate-300 block mb-1">
                    Simulated Patch Diff (Target: <code>{investigation?.diagnosis?.rootCauseFile}</code>):
                  </span>
                  <pre className="p-4 rounded-xl bg-[#090d14] text-emerald-400 font-mono text-xs overflow-x-auto border border-[#1b2537] leading-relaxed">
                    {simulation.simulatedDiff}
                  </pre>
                </div>

                {/* Blast Radius & Verification */}
                <div className="p-3 rounded-lg bg-[#0b0f17] border border-[#212b3e] text-xs space-y-1">
                  <div className="text-slate-300 font-semibold">
                    Blast Radius Assessment:
                  </div>
                  <p className="text-slate-400">
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
                    className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    ← Back to Diagnosis Graph
                  </button>

                  <button
                    type="button"
                    onClick={handleRecordResolution}
                    disabled={isRecording}
                    className="flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/50 transition-all cursor-pointer disabled:opacity-50"
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
              <div className="p-6 rounded-lg bg-[#0b0f17] border border-[#212b3e] text-center space-y-3">
                <p className="text-xs text-slate-400">
                  Click &quot;Simulate Safe Recovery&quot; to test the non-breaking remediation proposal against the causal graph.
                </p>
                <button
                  type="button"
                  onClick={handleSimulateRecovery}
                  disabled={isSimulating}
                  className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold cursor-pointer"
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
          <div className="rounded-xl border border-[#1f2a3f] bg-[#101624] p-6 shadow-lg space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-violet-950/60 text-violet-300 border border-violet-800/40">
                  Step 4 · Graph Memory & Recall
                </span>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 mt-1">
                  <Database className="w-5 h-5 text-teal-400" />
                  Institutional Memory Persistence in {providerName}
                </h3>
                <p className="text-xs text-slate-400">
                  Persists resolved incident as connected Bug & Fix nodes with <code>RESOLVED_BY</code> relation for instant future recall.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleVerifyRecall}
                  disabled={isRecalling}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-[#182236] hover:bg-[#202c46] text-slate-200 border border-[#2b3a58] transition-all cursor-pointer disabled:opacity-50"
                >
                  {isRecalling ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Recalling...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 text-teal-400" />
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
              <div className="p-4 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-xs space-y-2">
                <div className="font-bold text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Resolution Successfully Persisted to {providerName} Graph</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Created Bug node (<code>{recordedOutcome.bugId}</code>) and Fix node connected via <code>RESOLVED_BY</code> in repository <span className="font-mono text-emerald-300 font-semibold">{targetRepo}</span>.
                </p>
              </div>
            )}

            {/* Recalled Fix Precedent Card */}
            {recalledData && (
              <div className="p-5 rounded-xl bg-[#0e1320] border border-teal-800/50 shadow-md text-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#1b2537]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-teal-950/60 text-teal-300 border border-teal-800/40 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-teal-400" /> Grounded Graph Recall
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      Scope: {recalledData.repoFullName || targetRepo}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Provenance: FIX_RESOLVES_BUG
                  </span>
                </div>

                {/* Provenance Distinction Banner */}
                <div className="p-3 rounded-lg bg-[#080c14] border border-[#1e293d] text-[11px] text-slate-300 leading-relaxed">
                  <strong className="text-white">Historical Precedent vs. Current Implementation:</strong>{' '}
                  {recalledData.recalledFix?.verificationNote ||
                    'This record is a historical fix precedent retrieved from FalkorDB graph memory. While this remediation pattern resolved a past incident, the current repository implementation has not yet been verified or executed in a live runtime.'}
                </div>

                {recalledData.recalledFix && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2.5">
                      <Bug className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-slate-100 text-sm">
                          {recalledData.recalledFix.title}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          Bug ID: {recalledData.recalledFix.bugId}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                      <div className="p-2.5 rounded-lg bg-[#0b0f17] border border-[#1e293d]">
                        <span className="text-slate-400 block">Target Remediated File:</span>
                        <span className="font-mono font-semibold text-emerald-400">
                          {recalledData.recalledFix.filePath || 'services/tokenBucket.js'}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#0b0f17] border border-[#1e293d]">
                        <span className="text-slate-400 block">Historical Fix Commit (Precedent):</span>
                        <span className="font-mono font-semibold text-emerald-400">
                          {recalledData.recalledFix.commitSha ? recalledData.recalledFix.commitSha.slice(0, 7) : '7e1d4c2'}
                        </span>
                      </div>
                    </div>

                    {recalledData.recalledFix.introducedInCommit && (
                      <div className="p-2.5 rounded-lg bg-[#0b0f17] border border-[#1e293d] text-[11px]">
                        <span className="text-slate-400 block">Suspected Introducing Commit (Regression):</span>
                        <span className="font-mono font-semibold text-amber-300">
                          {recalledData.recalledFix.introducedInCommit.slice(0, 7)}
                        </span>
                      </div>
                    )}

                    <div className="p-3 rounded-lg bg-teal-950/20 border border-teal-800/40 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400 block text-[10px] font-mono uppercase font-semibold">
                          {recalledData.recalledFix.remediationCategory || 'Recorded Historical Remediation'}:
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40">
                          Current Implementation Unverified
                        </span>
                      </div>
                      <p className="font-mono text-teal-300 font-semibold text-xs leading-relaxed">
                        {recalledData.recalledFix.fixSummary || recalledData.recalledFix.fixDescription}
                      </p>
                      <div className="pt-2 border-t border-teal-900/40 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 font-mono">
                        <span>Evidence: {recalledData.recalledFix.evidenceType || 'historical_fix_precedent'}</span>
                        <span className="text-amber-400/90">Runtime Verification: None (Historical Precedent Only)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {recallError && (
              <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/40 text-xs text-rose-300">
                {recallError}
              </div>
            )}

            {recordError && (
              <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/40 text-xs text-rose-300">
                {recordError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
