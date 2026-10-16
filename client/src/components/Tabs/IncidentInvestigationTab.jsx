import React, { useState, useEffect, useRef } from 'react';
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
  Split,
  GitPullRequest,
  Code2,
  ExternalLink,
  FileText,
  GitMerge,
  AlertCircle,
  Shield,
  Clock,
  CornerDownRight,
  Eye
} from 'lucide-react';
import InvestigationStepIndicator from '../InvestigationStepIndicator';
import CausalGraphCanvas from '../Graph/CausalGraphCanvas';
import CausalSynthesisPanel from '../Investigation/CausalSynthesisPanel';
import { formatRelationshipType } from '../../utils/evidenceAdapter';

export default function IncidentInvestigationTab({
  analysisData,
  memoryOverview,
  graphHealth,
  investigationLaunchTarget,
  onClearLaunchTarget,
  onUpdateContext,
  onNavigateToTab,
  onAskInCodebase,
  onRefreshMemory
}) {
  const activeRepo = analysisData?.repository?.fullName || null;
  const isRealRepo = Boolean(activeRepo && activeRepo !== 'acme/payment-gateway');
  const providerName = 'FalkorDB';

  // Target-aware investigation type: 'bug' | 'issue' | 'pr'
  const [investigationType, setInvestigationType] = useState('bug');

  // PR Review intake state
  const [selectedPrNumber, setSelectedPrNumber] = useState('');
  const [prTitle, setPrTitle] = useState('');
  const [prBaseBranch, setPrBaseBranch] = useState('main');
  const [prHeadBranch, setPrHeadBranch] = useState('');
  const [prDiff, setPrDiff] = useState('');
  const [prChangedFiles, setPrChangedFiles] = useState([]);

  // Issue Diagnosis intake state
  const [selectedIssueNumber, setSelectedIssueNumber] = useState('');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDescription, setIssueDescription] = useState('');

  // Available PRs & Issues from providerData or dynamic fetch
  const [availablePrs, setAvailablePrs] = useState(() => analysisData?.providerData?.pullRequests?.data || []);
  const [availableIssues, setAvailableIssues] = useState(() => analysisData?.providerData?.issues?.data || []);
  const [isLoadingPrs, setIsLoadingPrs] = useState(false);
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);

  // Sync available items when analysisData changes
  useEffect(() => {
    if (analysisData?.providerData?.pullRequests?.data) {
      setAvailablePrs(analysisData.providerData.pullRequests.data);
    }
    if (analysisData?.providerData?.issues?.data) {
      setAvailableIssues(analysisData.providerData.issues.data);
    }
  }, [analysisData]);

  const fetchPullRequestsForRepo = async (repoName) => {
    if (!repoName) return;
    setIsLoadingPrs(true);
    try {
      const res = await fetch(`/api/repository/pulls?repo=${encodeURIComponent(repoName)}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.pullRequests)) {
        setAvailablePrs(data.pullRequests);
      }
    } catch {
      // Soft fail
    } finally {
      setIsLoadingPrs(false);
    }
  };

  const fetchIssuesForRepo = async (repoName) => {
    if (!repoName) return;
    setIsLoadingIssues(true);
    try {
      const res = await fetch(`/api/repository/issues?repo=${encodeURIComponent(repoName)}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.issues)) {
        setAvailableIssues(data.issues);
      }
    } catch {
      // Soft fail
    } finally {
      setIsLoadingIssues(false);
    }
  };

  const handleSelectPr = async (prNumber) => {
    setSelectedPrNumber(prNumber);
    const selected = availablePrs.find(p => String(p.number || p.id) === String(prNumber));
    if (selected) {
      setPrTitle(selected.title || '');
      setPrBaseBranch(selected.base?.ref || selected.base || 'main');
      setPrHeadBranch(selected.head?.ref || selected.head || '');
      if (selected.rawDiff || selected.diff) {
        setPrDiff(selected.rawDiff || selected.diff);
      }
      if (Array.isArray(selected.changedFiles) && selected.changedFiles.length > 0) {
        setPrChangedFiles(selected.changedFiles);
      }
    }

    if (targetRepo && prNumber) {
      setIsLoadingDiff(true);
      try {
        const res = await fetch(`/api/repository/pr-diff?repo=${encodeURIComponent(targetRepo)}&pullNumber=${encodeURIComponent(prNumber)}`);
        const data = await res.json();
        if (res.ok && data) {
          if (data.rawDiff) setPrDiff(data.rawDiff);
          if (Array.isArray(data.changedFiles) && data.changedFiles.length > 0) {
            setPrChangedFiles(data.changedFiles);
          }
        }
      } catch {
        // Soft fail
      } finally {
        setIsLoadingDiff(false);
      }
    }
  };

  const handleSelectIssue = (issueNumber) => {
    setSelectedIssueNumber(issueNumber);
    const selected = availableIssues.find(i => String(i.number || i.id) === String(issueNumber));
    if (selected) {
      setIssueTitle(selected.title || '');
      setIssueDescription(selected.body || selected.description || '');
    }
  };

  const handleSwitchInvestigationType = (type) => {
    setInvestigationType(type);
    if (type === 'pr' && availablePrs.length === 0 && targetRepo) {
      fetchPullRequestsForRepo(targetRepo);
    } else if (type === 'issue' && availableIssues.length === 0 && targetRepo) {
      fetchIssuesForRepo(targetRepo);
    }
  };

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
  const isDemoActive = Boolean(activeRepo === 'acme/payment-gateway');
  const [scenarioMode, setScenarioMode] = useState(() => (isDemoActive ? 'synthetic' : 'active'));
  const [targetRepo, setTargetRepo] = useState(() => (activeRepo || ''));
  const [fixtureAnalysis, setFixtureAnalysis] = useState(null);

  // Incident intake form state
  const [reportTitle, setReportTitle] = useState(() =>
    isDemoActive
      ? 'Payment Gateway 504 Gateway Timeout Cascade'
      : (activeRepo ? `Incident Investigation: ${activeRepo}` : '')
  );
  const [symptoms, setSymptoms] = useState(() =>
    isDemoActive
      ? 'Clients receiving HTTP 504 Gateway Timeout on /api/pay immediately following deployment of commit 8f2a1b9 ("Refactor rate limit cache in services/rateLimiter.js").'
      : ''
  );
  const [entryPoint, setEntryPoint] = useState(() =>
    isDemoActive
      ? 'server/routes/pay.js'
      : (analysisData?.architecture?.entryPoints?.[0]?.path || '')
  );
  const [suspectedCommit, setSuspectedCommit] = useState(() => (isDemoActive ? '8f2a1b9' : ''));
  const [suspectedComponent, setSuspectedComponent] = useState(() => (isDemoActive ? 'services/rateLimiter.js' : ''));

  // Repository Isolation Watcher: Reset investigation state when repository changes
  const lastActiveRepoRef = useRef(activeRepo);
  useEffect(() => {
    if (activeRepo !== lastActiveRepoRef.current) {
      lastActiveRepoRef.current = activeRepo;
      // Complete reset to avoid leaking prior findings across repositories
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
      setSelectedPrNumber('');
      setPrTitle('');
      setPrBaseBranch('main');
      setPrHeadBranch('');
      setPrDiff('');
      setPrChangedFiles([]);
      setSelectedIssueNumber('');
      setIssueTitle('');
      setIssueDescription('');

      if (activeRepo === 'acme/payment-gateway') {
        setScenarioMode('synthetic');
        setTargetRepo('acme/payment-gateway');
        setReportTitle('Payment Gateway 504 Gateway Timeout Cascade');
        setSymptoms(
          'Clients receiving HTTP 504 Gateway Timeout on /api/pay immediately following deployment of commit 8f2a1b9 ("Refactor rate limit cache in services/rateLimiter.js").'
        );
        setEntryPoint('server/routes/pay.js');
        setSuspectedCommit('8f2a1b9');
        setSuspectedComponent('services/rateLimiter.js');
      } else if (activeRepo) {
        setScenarioMode('active');
        setTargetRepo(activeRepo);
        setReportTitle(`Incident Investigation: ${activeRepo}`);
        setSymptoms('');
        setEntryPoint(analysisData?.architecture?.entryPoints?.[0]?.path || '');
        setSuspectedCommit('');
        setSuspectedComponent('');
      } else {
        setScenarioMode('active');
        setTargetRepo('');
        setReportTitle('');
        setSymptoms('');
        setEntryPoint('');
        setSuspectedCommit('');
        setSuspectedComponent('');
      }
    }
  }, [activeRepo, analysisData]);

  // Handle incoming investigation launch target from Overview or Header
  useEffect(() => {
    if (investigationLaunchTarget) {
      const { targetType, item } = investigationLaunchTarget;
      setCurrentStep('incident');
      if (targetType === 'pr') {
        setInvestigationType('pr');
        if (item) {
          const prNumber = item.number || item.id || '';
          setSelectedPrNumber(prNumber);
          setPrTitle(item.title || '');
          setPrBaseBranch(item.base?.ref || item.base || 'main');
          setPrHeadBranch(item.head?.ref || item.head || '');
          if (item.rawDiff || item.diff) {
            setPrDiff(item.rawDiff || item.diff);
          }
          if (Array.isArray(item.changedFiles) && item.changedFiles.length > 0) {
            setPrChangedFiles(item.changedFiles);
          }
          const repo = item.repoFullName || targetRepo || activeRepo;
          if ((!item.rawDiff && !item.diff) && repo && prNumber) {
            setIsLoadingDiff(true);
            fetch(`/api/repository/pr-diff?repo=${encodeURIComponent(repo)}&pullNumber=${encodeURIComponent(prNumber)}`)
              .then(res => res.json())
              .then(data => {
                if (data?.rawDiff) setPrDiff(data.rawDiff);
                if (Array.isArray(data?.changedFiles) && data.changedFiles.length > 0) {
                  setPrChangedFiles(data.changedFiles);
                }
              })
              .catch(() => {})
              .finally(() => setIsLoadingDiff(false));
          }
        }
      } else if (targetType === 'issue') {
        setInvestigationType('issue');
        if (item) {
          if (item.repoFullName) {
            setTargetRepo(item.repoFullName);
          }
          setSelectedIssueNumber(item.number || item.id || '');
          setIssueTitle(item.title || '');
          setIssueDescription(item.body || item.description || '');
        }
      } else if (targetType === 'bug') {
        setInvestigationType('bug');
        if (item) {
          if (item.repoFullName) {
            setTargetRepo(item.repoFullName);
          }
          setReportTitle(item.title || '');
          setSymptoms(item.body || item.description || '');
        }
      }
      if (onClearLaunchTarget) onClearLaunchTarget();
    }
  }, [investigationLaunchTarget, onClearLaunchTarget, targetRepo, activeRepo]);

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
      setTargetRepo(activeRepo || '');
      setReportTitle(activeRepo ? `Incident Investigation: ${activeRepo}` : '');
      setSymptoms('');
      setEntryPoint(analysisData?.architecture?.entryPoints?.[0]?.path || '');
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

  // Run target-aware investigation (bug, issue, or pr review)
  const handleRunInvestigation = async () => {
    setIsInvestigating(true);
    setInvestigationError(null);
    setSimulation(null);
    setSimulationError(null);
    setRecordedOutcome(null);
    setRecordError(null);

    try {
      let reportPayload;
      if (investigationType === 'pr') {
        reportPayload = {
          targetType: 'pr',
          repoFullName: targetRepo,
          prNumber: selectedPrNumber,
          title: prTitle || `PR Review #${selectedPrNumber || ''}`,
          baseBranch: prBaseBranch,
          headBranch: prHeadBranch,
          diff: prDiff,
          changedFiles: prChangedFiles,
          provider: analysisData?.repository?.provider || 'github'
        };
      } else if (investigationType === 'issue') {
        reportPayload = {
          targetType: 'issue',
          repoFullName: targetRepo,
          issueNumber: selectedIssueNumber,
          title: issueTitle || `Issue #${selectedIssueNumber || ''}`,
          description: issueDescription,
          provider: analysisData?.repository?.provider || 'github'
        };
      } else {
        reportPayload = {
          targetType: 'bug',
          repoFullName: targetRepo,
          title: reportTitle,
          symptoms,
          entryPoint,
          suspectedCommit,
          suspectedComponent,
          provider: analysisData?.repository?.provider || 'github'
        };
      }

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
          analysis: effectiveAnalysis,
          scenarioMode,
          isDemo: scenarioMode === 'synthetic'
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Investigation failed.');
      }

      setInvestigation(data);
      if (onUpdateContext) {
        onUpdateContext({
          type: investigationType,
          title: data.title || targetRepo,
          entity: data
        });
      }
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

      const candidateEdge =
        investigation?.connectedEvidence?.callers?.[0] ||
        investigation?.connectedEvidence?.evidenceChain?.find(e => e.type === 'SYMBOL_CALLS_SYMBOL');
      const caller = candidateEdge?.caller || candidateEdge?.callerSymbol || (scenarioMode === 'synthetic' ? 'verifyToken' : null);
      const callee = candidateEdge?.callee || candidateEdge?.calleeSymbol || (scenarioMode === 'synthetic' ? 'acquireTokenLock' : null);

      const res = await fetch('/api/incident/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report: reportPayload,
          analysis: effectiveAnalysis,
          scenarioMode,
          isDemo: scenarioMode === 'synthetic',
          experiment: {
            ablateCausalEdge: true,
            caller,
            callee
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
                      {investigationType === 'pr' ? (
                        <>
                          <GitPullRequest className="w-4.5 h-4.5 text-violet-600 dark:text-violet-400" />
                          Pull Request Review & Regression Audit
                        </>
                      ) : investigationType === 'issue' ? (
                        <>
                          <FileText className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" />
                          Issue Triage & Historical Correlation
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="w-4.5 h-4.5 text-violet-600 dark:text-violet-400" />
                          Incident Scope & Anomaly Intake
                        </>
                      )}
                    </h2>
                  </div>

                  {investigationType === 'bug' && (
                    <button
                      type="button"
                      onClick={handleLoadScenario}
                      disabled={isSeeding || isInvestigating}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 dark:text-amber-300 dark:border-amber-800/50 transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                      <span>{isSeeding ? 'Seeding in FalkorDB...' : 'Seed Sample Incident'}</span>
                    </button>
                  )}
                </div>

                {/* Target-Aware Mode Switcher */}
                <div className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-200 dark:border-[#1b2537]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Mode:</span>
                    <div className="inline-flex rounded-md shadow-xs" role="group">
                      <button
                        type="button"
                        onClick={() => handleSwitchInvestigationType('bug')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-l-md border transition-colors cursor-pointer ${
                          investigationType === 'bug'
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 dark:bg-[#151c2d] dark:text-slate-300 dark:border-[#25324b] dark:hover:bg-[#1a243a]'
                        }`}
                      >
                        <Bug className="w-3.5 h-3.5" />
                        <span>Bug / Anomaly</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSwitchInvestigationType('issue')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-t border-b border-r transition-colors cursor-pointer ${
                          investigationType === 'issue'
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 dark:bg-[#151c2d] dark:text-slate-300 dark:border-[#25324b] dark:hover:bg-[#1a243a]'
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Issue Diagnosis</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSwitchInvestigationType('pr')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-r-md border-t border-b border-r transition-colors cursor-pointer ${
                          investigationType === 'pr'
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 dark:bg-[#151c2d] dark:text-slate-300 dark:border-[#25324b] dark:hover:bg-[#1a243a]'
                        }`}
                      >
                        <GitPullRequest className="w-3.5 h-3.5" />
                        <span>PR Review</span>
                      </button>
                    </div>
                  </div>

                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    Active Graph: <code className="text-slate-800 dark:text-slate-200 font-semibold">{targetRepo}</code>
                  </span>
                </div>

                {/* Form Fields: Differentiated by Investigation Mode */}
                <div className="pt-3 space-y-3.5">
                  {/* MODE 1: PULL REQUEST REVIEW */}
                  {investigationType === 'pr' && (
                    <div className="space-y-3">
                      {/* PR Selector Dropdown */}
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#232f44] space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <GitPullRequest className="w-3.5 h-3.5 text-violet-500" />
                            <span>Select Pull Request from Repository</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => fetchPullRequestsForRepo(targetRepo)}
                            disabled={isLoadingPrs}
                            className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <RotateCcw className={`w-3 h-3 ${isLoadingPrs ? 'animate-spin' : ''}`} />
                            <span>Refresh PRs</span>
                          </button>
                        </div>
                        <select
                          value={selectedPrNumber}
                          onChange={(e) => handleSelectPr(e.target.value)}
                          className="w-full text-xs font-mono px-3 py-2 rounded-md bg-white dark:bg-[#101624] border border-slate-300 dark:border-[#25324b] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
                        >
                          <option value="">-- Choose an open PR or enter manually below --</option>
                          {availablePrs.map((pr) => (
                            <option key={pr.number || pr.id} value={pr.number || pr.id}>
                              #{pr.number || pr.id}: {pr.title} ({pr.head?.ref || pr.head || 'branch'} ➔ {pr.base?.ref || pr.base || 'main'})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                        <div className="sm:col-span-3">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            PR Number
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 42"
                            value={selectedPrNumber}
                            onChange={(e) => setSelectedPrNumber(e.target.value)}
                            className="w-full text-xs font-mono px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-[#232f44] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
                          />
                        </div>
                        <div className="sm:col-span-9">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            PR Title / Objective
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Enforce bounded mutex and circuit breaker in auth token bucket"
                            value={prTitle}
                            onChange={(e) => setPrTitle(e.target.value)}
                            className="w-full text-xs font-mono px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-[#232f44] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Base Branch
                          </label>
                          <input
                            type="text"
                            placeholder="main"
                            value={prBaseBranch}
                            onChange={(e) => setPrBaseBranch(e.target.value)}
                            className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-[#232f44] text-slate-900 dark:text-slate-100 transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Head Branch / Feature Branch
                          </label>
                          <input
                            type="text"
                            placeholder="feature/token-bucket-patch"
                            value={prHeadBranch}
                            onChange={(e) => setPrHeadBranch(e.target.value)}
                            className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-[#232f44] text-slate-900 dark:text-slate-100 transition-colors"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <Code2 className="w-3.5 h-3.5 text-violet-500" />
                            <span>Git Unified Diff (rawDiff)</span>
                          </label>
                          {isLoadingDiff && (
                            <span className="text-[11px] font-mono text-violet-500 flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Fetching PR diff...
                            </span>
                          )}
                        </div>
                        <textarea
                          rows={4}
                          placeholder={`diff --git a/services/tokenBucket.js b/services/tokenBucket.js\n--- a/services/tokenBucket.js\n+++ b/services/tokenBucket.js\n@@ -10,6 +10,12 @@\n+  const acquired = await this.tryAcquire(250);\n+  if (!acquired) throw new Error('Lock timeout');`}
                          value={prDiff}
                          onChange={(e) => setPrDiff(e.target.value)}
                          className="w-full text-xs font-mono p-3 rounded-lg bg-slate-900 text-emerald-400 border border-slate-800 dark:bg-[#090d14] dark:border-[#1b2537] focus:outline-none focus:ring-1 focus:ring-violet-500 leading-relaxed"
                        />
                      </div>

                      {prChangedFiles.length > 0 && (
                        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f] text-xs">
                          <span className="text-slate-500 dark:text-slate-400 font-semibold block mb-1">
                            Detected Touched Files ({prChangedFiles.length}):
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {prChangedFiles.map((cf, idx) => (
                              <span
                                key={idx}
                                className="font-mono text-[11px] px-2 py-0.5 rounded bg-white dark:bg-[#131b2c] border border-slate-200 dark:border-[#24334e] text-slate-800 dark:text-slate-200"
                              >
                                {cf.filename || cf.path} (+{cf.additions || 0} / -{cf.deletions || 0})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* MODE 2: ISSUE DIAGNOSIS */}
                  {investigationType === 'issue' && (
                    <div className="space-y-3">
                      {/* Issue Selector Dropdown */}
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#232f44] space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-amber-500" />
                            <span>Select Issue from Repository</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => fetchIssuesForRepo(targetRepo)}
                            disabled={isLoadingIssues}
                            className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <RotateCcw className={`w-3 h-3 ${isLoadingIssues ? 'animate-spin' : ''}`} />
                            <span>Refresh Issues</span>
                          </button>
                        </div>
                        <select
                          value={selectedIssueNumber}
                          onChange={(e) => handleSelectIssue(e.target.value)}
                          className="w-full text-xs font-mono px-3 py-2 rounded-md bg-white dark:bg-[#101624] border border-slate-300 dark:border-[#25324b] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
                        >
                          <option value="">-- Choose an open issue or enter manually below --</option>
                          {availableIssues.map((issue) => (
                            <option key={issue.number || issue.id} value={issue.number || issue.id}>
                              #{issue.number || issue.id}: {issue.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                        <div className="sm:col-span-3">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Issue Number
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 104"
                            value={selectedIssueNumber}
                            onChange={(e) => setSelectedIssueNumber(e.target.value)}
                            className="w-full text-xs font-mono px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-[#232f44] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
                          />
                        </div>
                        <div className="sm:col-span-9">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Issue Title
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Intermittent HTTP 504 Gateway Timeout during auth spikes"
                            value={issueTitle}
                            onChange={(e) => setIssueTitle(e.target.value)}
                            className="w-full text-xs font-mono px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-[#232f44] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Issue Description / Symptoms & Stack Traces
                        </label>
                        <textarea
                          rows={4}
                          placeholder="Describe reported symptoms, error traces, or affected endpoints..."
                          value={issueDescription}
                          onChange={(e) => setIssueDescription(e.target.value)}
                          className="w-full text-xs font-mono px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-[#232f44] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
                        />
                      </div>
                    </div>
                  )}

                  {/* MODE 3: BUG / ANOMALY INVESTIGATION */}
                  {investigationType === 'bug' && (
                    <div className="space-y-3.5">
                      {(!symptoms && !suspectedCommit && scenarioMode !== 'synthetic') && (
                        <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f] text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2.5">
                          <Info className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">No investigation target selected</span>
                            <p className="mt-0.5">
                              Select an <strong>Open Issue</strong> or <strong>Open PR</strong> from the Repository Overview, or enter observed symptoms and entrypoints below to investigate this repository.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2.5">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Incident Title / Anomaly Summary
                          </label>
                          <input
                            type="text"
                            placeholder={scenarioMode === 'synthetic' ? 'Payment Gateway 504 Gateway Timeout Cascade' : 'e.g. Memory leak during high concurrency'}
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
                            placeholder={scenarioMode === 'synthetic' ? 'Clients receiving HTTP 504 Gateway Timeout...' : 'Describe observed error logs, status codes, or stack traces...'}
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
                            placeholder={scenarioMode === 'synthetic' ? 'server/routes/pay.js' : 'e.g. server/index.js'}
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
                            placeholder="e.g. commit SHA (optional)"
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
                            placeholder="e.g. component path (optional)"
                            value={suspectedComponent}
                            onChange={(e) => setSuspectedComponent(e.target.value)}
                            className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-[#232f44] text-slate-900 dark:text-slate-100 transition-colors"
                          />
                        </div>
                      </div>
                    </div>
                  )}
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
                        <span>
                          {investigationType === 'pr'
                            ? 'Analyzing PR Diff & Call Graph...'
                            : investigationType === 'issue'
                              ? 'Correlating Issue with AST Graph...'
                              : 'Traversing FalkorDB Graph...'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>
                          {investigationType === 'pr'
                            ? 'Review Pull Request'
                            : investigationType === 'issue'
                              ? 'Diagnose Issue'
                              : 'Investigate Failure Chain'}
                        </span>
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
                        Trapped on Decoy: <code className="text-rose-600 dark:text-rose-400">{investigation.keywordBaseline?.topSuspectFile || 'Decoy'}</code>
                      </h3>

                      <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
                        {investigation.keywordBaseline?.suspectedRootCause || 'Surface keyword match tricks naive search into blaming refactor commit.'}
                      </p>

                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#212b3e] text-[11px] space-y-1 transition-colors">
                        <div className="font-semibold text-slate-800 dark:text-slate-300 flex items-center gap-1">
                          <HelpCircle className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                          <span>Why Keyword Search Failed:</span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-400">
                          {investigation.keywordBaseline?.limitation || 'Failed to traverse call edges or notice downstream blocking calls invoked by the entrypoint.'}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-[#1a2336] text-[11px] text-rose-600 dark:text-rose-400/80">
                      Result: Keyword search leads to blind guesswork without graph topology.
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
                        Leading Root-Cause Hypothesis: <code className="text-emerald-600 dark:text-emerald-400">{investigation.diagnosis?.rootCauseFile}</code>
                        <span className="ml-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">({investigation.diagnosis?.rootCauseSymbol})</span>
                      </h3>

                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-[11px]">
                        {investigation.targetType === 'pr'
                          ? `Traced PR changes across ${investigation.changedFiles?.length || 0} file(s), identified ${investigation.affectedSymbols?.length || 0} modified symbols, and verified ${investigation.potentialRegressionCallers?.length || 0} upstream caller(s).`
                          : investigation.targetType === 'issue'
                            ? `Correlated issue description with ${investigation.connectedEvidence?.connectedFiles?.length || 0} repository file(s) and queried FalkorDB memory.`
                            : `Traced multi-hop call chain from entrypoint to ${investigation.diagnosis?.rootCauseSymbol} with FalkorDB institutional memory verification.`}
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
                        Confidence: {investigation.diagnosis?.confidence}
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
              {/* Context Card 1: Mode-Specific Pre-Flight Topology & Scope */}
              <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-4 shadow-md space-y-3 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {investigationType === 'pr'
                        ? 'PR Review Impact & Graph Scope'
                        : investigationType === 'issue'
                          ? 'Issue Triage Pre-Flight Scope'
                          : 'Pre-Flight Forensic Hypotheses & Topology'}
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 dark:bg-[#162035] dark:text-slate-400 dark:border-[#24334e]">
                    {investigationType === 'pr' ? 'Diff + Callers' : investigationType === 'issue' ? 'Text + AST' : 'AST vs Lexical'}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  {investigationType === 'pr' ? (
                    <>
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-slate-800 space-y-1.5 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            1. Unified Diff AST Intersection
                          </span>
                          <span className="text-[10px] font-mono text-violet-600 dark:text-violet-400 font-semibold">
                            Static AST
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                          Parses git diff hunks and intersects modified line ranges directly with declarations in the FalkorDB symbol graph.
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-violet-50/50 dark:bg-[#0f1728] border border-violet-200 dark:border-violet-900/50 space-y-1.5 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-300">
                            2. Upstream Regression Callers
                          </span>
                          <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                            Multi-Hop Call Sites
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                          Traces which external components invoke modified functions to evaluate regression blast radius and parameter drift.
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-amber-50/50 dark:bg-[#15120a] border border-amber-200 dark:border-amber-900/50 space-y-1.5 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                            3. Missing Test Coverage Audit
                          </span>
                          <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 font-semibold">
                            Coverage Grounding
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                          Audits whether touched symbols have dedicated test suites in graph memory, flagging untested code before merge.
                        </p>
                      </div>
                    </>
                  ) : investigationType === 'issue' ? (
                    <>
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-slate-800 space-y-1.5 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            1. Issue Token & AST Matching
                          </span>
                          <span className="text-[10px] font-mono text-violet-600 dark:text-violet-400 font-semibold">
                            Entity Linking
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                          Extracts symbols, file names, and stack frames from the reported issue to anchor the investigation on concrete code vertices.
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-emerald-50/50 dark:bg-[#0a161c] border border-emerald-200 dark:border-emerald-900/50 space-y-1.5 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                            2. Historical Fix Precedents
                          </span>
                          <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                            FalkorDB Memory
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                          Queries FalkorDB institutional memory for past resolved defects with similar symptoms to surface proven remediations.
                        </p>
                      </div>
                    </>
                  ) : scenarioMode === 'synthetic' ? (
                    <>
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
                    </>
                  ) : (
                    <>
                      {/* Real Repository Static Traversal Hypothesis */}
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-slate-800 space-y-1.5 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            AST Call Hierarchy
                          </span>
                          <span className="text-[10px] font-mono text-violet-600 dark:text-violet-400 font-semibold">
                            Static AST
                          </span>
                        </div>
                        <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {entryPoint || analysisData?.architecture?.entryPoints?.[0]?.path || 'Repository Entrypoints'}
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                          Multi-hop traversal follows call edges from the execution entrypoint through dependent services and symbols in the active repository.
                        </p>
                      </div>

                      {/* Institutional Memory Correlation */}
                      <div className="p-3 rounded-lg bg-violet-50/50 dark:bg-[#0f1728] border border-violet-200 dark:border-violet-900/50 space-y-1.5 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-300">
                            FalkorDB Memory Grounding
                          </span>
                          <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                            Graph Grounded
                          </span>
                        </div>
                        <div className="font-mono text-xs font-bold text-violet-700 dark:text-violet-300">
                          Verified Commits & Precedents
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                          Candidate root causes are ranked strictly against git revision history and past verified resolutions in institutional graph memory.
                        </p>
                      </div>
                    </>
                  )}
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
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Institutional Scope:</span>
                      <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">{targetRepo}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Memory Provider:</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{providerName} Graph</span>
                    </div>
                    <p className="text-[10.5px] text-slate-500 dark:text-slate-400 italic pt-1 border-t border-slate-200 dark:border-[#1a2336]">
                      {investigationType === 'pr'
                        ? 'Grounds review in static AST and caller relationships. Dynamic tests require runtime runner.'
                        : investigationType === 'issue'
                          ? 'Correlates issue text with AST symbols and historical bug fix records.'
                          : scenarioMode === 'synthetic'
                            ? 'Remediation pattern: Non-blocking tryAcquire with circuit breaker timeout.'
                            : 'Institutional memory records past verified fixes for recurring defects in this repository.'}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-teal-50/50 dark:bg-[#0a1622] border border-teal-200 dark:border-teal-900/40 text-[11px] text-slate-700 dark:text-slate-300 leading-snug">
                    <strong className="text-teal-800 dark:text-teal-300 block mb-0.5">Truth Boundary Standard:</strong>
                    Directly observed AST and Git diff facts are strictly distinguished from inferred hypotheses. Dynamic test execution is never fabricated.
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
              {/* TARGET-AWARE DIAGNOSIS VIEW DISPATCHER */}
              {investigation.targetType === 'pr' ? (
                /* PR REVIEW DIAGNOSIS WORKSPACE */
                <div className="space-y-5">
                  {/* PR Review Overview Header */}
                  <div className="p-4 rounded-xl bg-white dark:bg-[#101624] border border-slate-200 dark:border-[#1f2a3f] shadow-md transition-colors space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/40 flex items-center gap-1.5">
                            <GitPullRequest className="w-3.5 h-3.5" /> PR Review #{investigation.prNumber || ''}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {investigation.baseBranch} ➔ {investigation.headBranch}
                          </span>
                          <span className={`font-mono text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                            investigation.diagnosis?.confidence === 'HIGH'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/40'
                              : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/40'
                          }`}>
                            Confidence: {investigation.diagnosis?.confidence || 'MEDIUM'}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                          {investigation.title}
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() => setCurrentStep('incident')}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-[#182236] dark:hover:bg-[#202c46] dark:text-slate-200 dark:border-[#2b3a58] text-xs font-semibold cursor-pointer transition-colors shrink-0"
                      >
                        Edit PR Scope
                      </button>
                    </div>

                    {/* Metric Pills */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-[#1a2336] text-xs">
                      <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-[#141b2c] text-slate-700 dark:text-slate-300 font-mono">
                        Changed Files: <strong>{investigation.changedFiles?.length || 0}</strong>
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-[#141b2c] text-slate-700 dark:text-slate-300 font-mono">
                        Modified AST Symbols: <strong>{investigation.affectedSymbols?.length || 0}</strong>
                      </span>
                      <span className={`px-2.5 py-1 rounded-md font-mono ${
                        (investigation.potentialRegressionCallers?.length || 0) > 0
                          ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40 font-semibold'
                          : 'bg-slate-100 dark:bg-[#141b2c] text-slate-700 dark:text-slate-300'
                      }`}>
                        Potential Regression Callers: <strong>{investigation.potentialRegressionCallers?.length || 0}</strong>
                      </span>
                      <span className={`px-2.5 py-1 rounded-md font-mono ${
                        (investigation.missingTestCoverage?.length || 0) > 0
                          ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40 font-semibold'
                          : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40'
                      }`}>
                        Untested Modified Symbols: <strong>{investigation.missingTestCoverage?.length || 0}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Left Column (8 cols): Grounded PR Evidence & Findings */}
                    <div className="lg:col-span-7 xl:col-span-8 space-y-5">
                      {/* 1. Strict Truth Boundaries Card */}
                      <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#0f1422] p-5 shadow-lg space-y-4 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                              Directly Grounded PR Review Findings
                            </h4>
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800/40 font-semibold">
                            Strict Truth Boundaries
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                          {/* Observed Facts */}
                          <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-[#0a1614] border border-emerald-200 dark:border-emerald-900/50 space-y-2">
                            <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 text-xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span>Directly Observed Facts</span>
                            </div>
                            <ul className="text-slate-700 dark:text-slate-300 space-y-1.5 text-[11px] list-disc list-inside">
                              {(investigation.diagnosis?.observedFacts || []).map((fact, idx) => (
                                <li key={idx} className="leading-snug">
                                  {fact.replace(/^[-\s*]+/, '')}
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Inferred Hypotheses & Regression Risks */}
                          <div className="p-3.5 rounded-xl bg-amber-50/50 dark:bg-[#17140a] border border-amber-200 dark:border-amber-900/50 space-y-2">
                            <div className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 text-xs">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                              <span>Inferred Regression Risks</span>
                            </div>
                            <ul className="text-slate-700 dark:text-slate-300 space-y-1.5 text-[11px] list-disc list-inside">
                              {(investigation.diagnosis?.inferredHypotheses || []).map((hyp, idx) => (
                                <li key={idx} className="leading-snug">
                                  {hyp.replace(/^[-\s*]+/, '')}
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Explicit Uncertainty & Unverified Claims */}
                          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#212b3e] space-y-2">
                            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                              <HelpCircle className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                              <span>Explicit Uncertainties</span>
                            </div>
                            <ul className="text-slate-600 dark:text-slate-400 space-y-1.5 text-[11px] list-disc list-inside">
                              {(investigation.diagnosis?.unverifiedClaims || []).map((unc, idx) => (
                                <li key={idx} className="leading-snug">
                                  {unc.replace(/^[-\s*]+/, '')}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>

                      {/* 2. Potential Regression Callers & Missing Test Alerts */}
                      {investigation.missingTestCoverage?.length > 0 && (
                        <div className="p-4 rounded-xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 shadow-md space-y-2.5 text-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-bold">
                              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                              <span>Missing Test Coverage Alert ({investigation.missingTestCoverage.length} Modified Symbols Untested)</span>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200 font-semibold">
                              High Risk
                            </span>
                          </div>
                          <div className="space-y-2">
                            {investigation.missingTestCoverage.map((mt, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-lg bg-white dark:bg-[#0f1422] border border-rose-200 dark:border-rose-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                              >
                                <div>
                                  <div className="font-mono font-bold text-slate-900 dark:text-slate-100 text-xs">
                                    {mt.symbolName} <span className="font-normal text-slate-500">in {mt.filePath}</span>
                                  </div>
                                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                                    {mt.reason}
                                  </p>
                                </div>
                                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 shrink-0">
                                  0 Test Links in Graph
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Potential Regression Callers List */}
                      {investigation.potentialRegressionCallers?.length > 0 && (
                        <div className="p-4 rounded-xl bg-white dark:bg-[#0f1422] border border-amber-200 dark:border-amber-900/50 shadow-md space-y-3 text-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold">
                              <Layers className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                              <span>Potential Regression Callers ({investigation.potentialRegressionCallers.length} Discovered Upstream)</span>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-semibold">
                              Graph-Discovered Risk
                            </span>
                          </div>
                          <div className="space-y-2">
                            {investigation.potentialRegressionCallers.map((pr, idx) => (
                              <div
                                key={idx}
                                className="p-3 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f] space-y-1"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-1 font-mono text-xs">
                                  <span className="font-bold text-violet-700 dark:text-violet-300">
                                    {pr.callerSymbol} <span className="font-normal text-slate-500">({pr.callerFile})</span>
                                  </span>
                                  <span className="text-slate-400">➔ calls modified ➔</span>
                                  <span className="font-bold text-rose-600 dark:text-rose-400">
                                    {pr.calleeSymbol} <span className="font-normal text-slate-500">({pr.calleeFile})</span>
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                                  {pr.reason}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 3. Changed Files & Diff Preview */}
                      <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#0f1422] p-5 shadow-lg space-y-3 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileCode className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                              Modified Files & Unified Git Diff
                            </h4>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                            {investigation.changedFiles?.length || 0} File(s)
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2 pb-2">
                          {(investigation.changedFiles || []).map((cf, idx) => (
                            <span
                              key={idx}
                              className="font-mono text-[11px] px-2.5 py-1 rounded-md bg-slate-100 dark:bg-[#141b2c] border border-slate-200 dark:border-[#25324b] text-slate-800 dark:text-slate-200"
                            >
                              {cf.filename || cf.path} (+{cf.additions || 0} / -{cf.deletions || 0})
                            </span>
                          ))}
                        </div>

                        {investigation.rawDiff ? (
                          <pre className="p-4 rounded-xl bg-slate-900 text-emerald-400 font-mono text-xs overflow-x-auto border border-slate-800 dark:bg-[#090d14] dark:border-[#1b2537] leading-relaxed max-h-72">
                            {investigation.rawDiff}
                          </pre>
                        ) : (
                          <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f] text-slate-500 text-center text-xs">
                            No raw unified diff text captured for this review.
                          </div>
                        )}
                      </div>

                      {/* 4. Causal Graph Canvas */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          PR Topology & Call Graph
                        </h4>
                        <CausalGraphCanvas
                          investigation={investigation}
                          onSelectNode={setSelectedGraphNode}
                          selectedNodeId={selectedGraphNode?.id}
                          onSelectEdge={setSelectedGraphEdge}
                          selectedEdgeId={selectedGraphEdge?.id}
                        />
                      </div>
                    </div>

                    {/* Right Column (4 cols): Forensic Side Panel */}
                    <div className="lg:col-span-5 xl:col-span-4 space-y-4">
                      {/* Entity Inspector */}
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
                      <CausalSynthesisPanel investigation={investigation} />

                      {/* Action Card */}
                      <div className="p-4 rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] shadow-xs space-y-2.5">
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
                              <span>Simulate Recovery / Test Spec</span>
                              <ArrowRight className="w-4 h-4" />
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={handleAskCodebaseAndRecall}
                          className="w-full py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-[#151c2d] dark:hover:bg-[#1e273f] dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                        >
                          <Search className="w-3.5 h-3.5 text-violet-500" />
                          <span>Ask Codebase About This PR</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : investigation.targetType === 'issue' ? (
                /* ISSUE DIAGNOSIS WORKSPACE */
                <div className="space-y-5">
                  {/* Issue Diagnosis Overview Header */}
                  <div className="p-4 rounded-xl bg-white dark:bg-[#101624] border border-slate-200 dark:border-[#1f2a3f] shadow-md transition-colors space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/40 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" /> Issue Diagnosis #{investigation.issueNumber || ''}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            Provider: {investigation.provider || 'github'}
                          </span>
                          <span className={`font-mono text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                            investigation.diagnosis?.confidence === 'HIGH'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/40'
                              : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/40'
                          }`}>
                            Confidence: {investigation.diagnosis?.confidence || 'MEDIUM'}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                          {investigation.title}
                        </h3>
                        {investigation.description && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pt-1">
                            {investigation.description}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setCurrentStep('incident')}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-[#182236] dark:hover:bg-[#202c46] dark:text-slate-200 dark:border-[#2b3a58] text-xs font-semibold cursor-pointer transition-colors shrink-0"
                      >
                        Edit Issue Scope
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Left Column (8 cols): Grounded Issue Findings */}
                    <div className="lg:col-span-7 xl:col-span-8 space-y-5">
                      {/* Truth Boundaries Card */}
                      <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#0f1422] p-5 shadow-lg space-y-4 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                              Directly Grounded Issue Diagnosis Findings
                            </h4>
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/40 font-semibold">
                            Strict Truth Boundaries
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                          {/* Observed Facts */}
                          <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-[#0a1614] border border-emerald-200 dark:border-emerald-900/50 space-y-2">
                            <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 text-xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span>Directly Observed Facts</span>
                            </div>
                            <ul className="text-slate-700 dark:text-slate-300 space-y-1.5 text-[11px] list-disc list-inside">
                              {(investigation.diagnosis?.observedFacts || []).map((fact, idx) => (
                                <li key={idx} className="leading-snug">
                                  {fact.replace(/^[-\s*]+/, '')}
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Inferred Hypotheses */}
                          <div className="p-3.5 rounded-xl bg-amber-50/50 dark:bg-[#17140a] border border-amber-200 dark:border-amber-900/50 space-y-2">
                            <div className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 text-xs">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                              <span>Inferred Hypotheses</span>
                            </div>
                            <ul className="text-slate-700 dark:text-slate-300 space-y-1.5 text-[11px] list-disc list-inside">
                              {(investigation.diagnosis?.inferredHypotheses || []).map((hyp, idx) => (
                                <li key={idx} className="leading-snug">
                                  {hyp.replace(/^[-\s*]+/, '')}
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Explicit Uncertainties */}
                          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#212b3e] space-y-2">
                            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                              <HelpCircle className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                              <span>Explicit Uncertainties</span>
                            </div>
                            <ul className="text-slate-600 dark:text-slate-400 space-y-1.5 text-[11px] list-disc list-inside">
                              {(investigation.diagnosis?.unverifiedClaims || []).map((unc, idx) => (
                                <li key={idx} className="leading-snug">
                                  {unc.replace(/^[-\s*]+/, '')}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>

                      {/* Historical Bug Precedent from FalkorDB */}
                      {investigation.historicalFix && (
                        <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 shadow-md space-y-2.5 text-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold">
                              <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                              <span>Historical Remediation Precedent Recall in FalkorDB</span>
                            </div>
                            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 font-semibold">
                              Prior Fix Precedent
                            </span>
                          </div>
                          <div className="p-3 rounded-lg bg-white dark:bg-[#0f1422] border border-emerald-200 dark:border-emerald-900/40 space-y-1.5">
                            <div className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                              {investigation.historicalFix.title}
                            </div>
                            <p className="text-[11px] text-slate-700 dark:text-slate-300">
                              {investigation.historicalFix.summary}
                            </p>
                            <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                              Target Remediated File: <code className="text-emerald-600 dark:text-emerald-400 font-semibold">{investigation.historicalFix.filePath}</code>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Correlated Repository Files & Symbols */}
                      <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#0f1422] p-5 shadow-lg space-y-3 transition-colors text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Code2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                              Correlated Repository Components
                            </h4>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                            AST Matching
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f] space-y-1">
                            <span className="text-slate-500 dark:text-slate-400 font-semibold block text-[11px]">
                              Correlated Files:
                            </span>
                            <div className="space-y-1">
                              {(investigation.connectedEvidence?.connectedFiles || [investigation.diagnosis?.rootCauseFile]).map((file, idx) => (
                                <div key={idx} className="font-mono text-[11px] text-slate-800 dark:text-slate-200">
                                  {file}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f] space-y-1">
                            <span className="text-slate-500 dark:text-slate-400 font-semibold block text-[11px]">
                              Correlated AST Symbols:
                            </span>
                            <div className="space-y-1">
                              {(investigation.connectedEvidence?.reachableSymbols || []).slice(0, 5).map((sym, idx) => (
                                <div key={idx} className="font-mono text-[11px] text-violet-700 dark:text-violet-300">
                                  {sym.name || sym.symbolName} <span className="text-slate-500">({sym.filePath})</span>
                                </div>
                              ))}
                              {(!investigation.connectedEvidence?.reachableSymbols || investigation.connectedEvidence.reachableSymbols.length === 0) && (
                                <span className="text-slate-400 italic text-[11px]">No specific AST symbol isolated from text</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Causal Graph Canvas */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Correlated Issue Graph Topology
                        </h4>
                        <CausalGraphCanvas
                          investigation={investigation}
                          onSelectNode={setSelectedGraphNode}
                          selectedNodeId={selectedGraphNode?.id}
                          onSelectEdge={setSelectedGraphEdge}
                          selectedEdgeId={selectedGraphEdge?.id}
                        />
                      </div>
                    </div>

                    {/* Right Column (4 cols): Forensic Side Panel */}
                    <div className="lg:col-span-5 xl:col-span-4 space-y-4">
                      {/* Entity Inspector */}
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
                      <CausalSynthesisPanel investigation={investigation} />

                      {/* Action Card */}
                      <div className="p-4 rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] shadow-xs space-y-2.5">
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

                        <button
                          type="button"
                          onClick={handleAskCodebaseAndRecall}
                          className="w-full py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-[#151c2d] dark:hover:bg-[#1e273f] dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                        >
                          <Search className="w-3.5 h-3.5 text-amber-500" />
                          <span>Ask Codebase About This Issue</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* BUG / INCIDENT CAUSAL WORKSPACE (Default) */
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
                            Hypothesis: <code className="text-emerald-400">acquireTokenLock</code> in <span className="text-slate-300">services/tokenBucket.js</span>
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
                            Hypothesis: <code className="text-rose-400">unknown</code> (Target Unreachable)
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
                          {/* Candidate A: Decoy or Keyword Baseline Match */}
                          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0a0e17] border border-slate-200 dark:border-slate-800/80 space-y-2.5 transition-colors">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                                {scenarioMode === 'synthetic' ? 'Candidate A · Decoy Trap' : 'Candidate A · Lexical Keyword Baseline'}
                              </span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/50 font-bold">
                                REJECTED / DEPRIORITIZED
                              </span>
                            </div>

                            <div>
                              <div className="font-bold text-slate-900 dark:text-slate-200">
                                {scenarioMode === 'synthetic'
                                  ? 'checkRateLimit'
                                  : (investigation.keywordBaseline?.topSuspectFile?.split('/').pop() || 'Keyword Match')}
                              </div>
                              <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                {scenarioMode === 'synthetic'
                                  ? 'services/rateLimiter.js'
                                  : (investigation.keywordBaseline?.topSuspectFile || 'Superficial keyword match')}
                              </div>
                            </div>

                            <div className="space-y-1.5 text-[11px]">
                              <div>
                                <span className="text-slate-500 dark:text-slate-400 font-semibold">Supporting Clues: </span>
                                <span className="text-slate-700 dark:text-slate-300">
                                  {scenarioMode === 'synthetic'
                                    ? 'Surface keyword match ("rate limit", "504", "timeout") in symptoms.'
                                    : (investigation.keywordBaseline?.suspectedRootCause || 'Lexical keyword overlap with symptom description.')}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 dark:text-slate-400 font-semibold">Contradictory Graph Proof: </span>
                                <span className="text-rose-600 dark:text-rose-300/90 font-medium">
                                  {scenarioMode === 'synthetic'
                                    ? '0 call hops from /api/pay. Static AST traversal confirms it is never invoked in the failure path.'
                                    : (investigation.keywordBaseline?.limitation || 'No direct causal call path found from API entrypoint in static AST graph.')}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Candidate B: Leading Root-Cause Hypothesis */}
                          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0a0e17] border border-rose-200 dark:border-rose-900/60 space-y-2.5 transition-colors">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800/60">
                                Candidate B · Leading Root-Cause Hypothesis
                              </span>
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                                investigation?.diagnosis?.confidence === 'INSUFFICIENT_EVIDENCE'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/50'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/50'
                              }`}>
                                {investigation?.experiment?.active
                                  ? 'ABLATED'
                                  : (investigation?.diagnosis?.confidence === 'INSUFFICIENT_EVIDENCE' ? 'INSUFFICIENT EVIDENCE' : 'GRAPH-SUPPORTED')}
                              </span>
                            </div>

                            <div>
                              <div className="font-bold text-slate-900 dark:text-slate-200">
                                {scenarioMode === 'synthetic'
                                  ? 'acquireTokenLock'
                                  : (investigation.diagnosis?.rootCauseSymbol || topCandidate?.symbolName || 'Reachable AST Component')}
                              </div>
                              <div className="font-mono text-[11px] text-rose-600 dark:text-rose-300">
                                {scenarioMode === 'synthetic'
                                  ? 'services/tokenBucket.js'
                                  : (investigation.diagnosis?.rootCauseFile || topCandidate?.filePath || 'unknown')}
                              </div>
                            </div>

                            <div className="space-y-1.5 text-[11px]">
                              <div>
                                <span className="text-slate-500 dark:text-slate-400 font-semibold">Verified Graph Evidence: </span>
                                <span className="text-slate-700 dark:text-slate-300">
                                  {scenarioMode === 'synthetic'
                                    ? 'Direct 2-hop call path from /api/pay via verifyToken (services/auth.js).'
                                    : (topCandidate?.reasons?.join(', ') || 'Static AST traversal verified from repository entrypoint.')}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 dark:text-slate-400 font-semibold">Suspected Introducing Commit: </span>
                                <span className="text-amber-600 dark:text-amber-300 font-mono font-medium">
                                  {scenarioMode === 'synthetic'
                                    ? '8f2a1b9 (dev-charlie)'
                                    : (investigation.diagnosis?.suspectedIntroducingCommit?.shortSha
                                        ? `${investigation.diagnosis.suspectedIntroducingCommit.shortSha} - ${investigation.diagnosis.suspectedIntroducingCommit.message}`
                                        : 'No commit correlated')}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 dark:text-slate-400 font-semibold">Historical Remediation: </span>
                                <span className="text-emerald-600 dark:text-emerald-300 font-mono font-medium">
                                  {scenarioMode === 'synthetic'
                                    ? '7e1d4c2 (dev-alice)'
                                    : (investigation.diagnosis?.historicalFix?.summary || 'No historical fix recorded in graph memory')}
                                </span>
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

                    {/* Side Panel: Forensic Evidence & Action Card (~40% width) */}
                    <div className="lg:col-span-5 xl:col-span-4 space-y-4">
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
                      <CausalSynthesisPanel investigation={investigation} />

                      {/* Next Action: Advance to Recovery Simulation */}
                      <div className="p-4 rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] shadow-xs">
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
              )}
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
