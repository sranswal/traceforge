import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  MessageSquare, 
  Send, 
  Loader2, 
  Bot, 
  User, 
  AlertCircle, 
  Trash2, 
  Terminal,
  ShieldCheck,
  Copy,
  Check,
  Database,
  Bug,
  GitCommit,
  PlusCircle,
  BookOpen,
  Layers,
  ArrowRight,
  Crosshair,
  X,
  Sparkles
} from 'lucide-react';
import { generateContextualSuggestions } from '../../utils/analysisPayload';
import MarkdownMessageRenderer from '../Common/MarkdownMessageRenderer';


function extractReferencedFiles(text, allFiles = []) {
  if (!text || !allFiles || allFiles.length === 0) return [];
  const found = new Set();
  for (const f of allFiles) {
    if (text.includes(f)) {
      found.add(f);
    }
  }
  const backticked = text.match(/`([^`]+)`/g) || [];
  for (const b of backticked) {
    const raw = b.replace(/`/g, '').trim();
    if (allFiles.includes(raw)) {
      found.add(raw);
    }
  }
  return Array.from(found).slice(0, 10);
}

export default function AskCodebaseTab({ 
  analysisData, 
  memoryOverview,
  qaHistory, 
  onAskQuestion, 
  isAsking, 
  qaError, 
  onClearHistory,
  onRefreshMemory,
  onNavigateToTab,
  investigationTarget,
  onClearInvestigationTarget
}) {
  const [input, setInput] = useState('');
  const [copiedIndex, setCopiedIndex] = useState(null);
  const inputRef = useRef(null);

  // Pre-fill editable question when a graph entity is sent for investigation
  useEffect(() => {
    if (investigationTarget?.prompt) {
      setInput(investigationTarget.prompt);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  }, [investigationTarget]);

  // Project Memory Recording State
  const [bugTitle, setBugTitle] = useState('');
  const [bugDescription, setBugDescription] = useState('');
  const [componentPath, setComponentPath] = useState('');
  const [filePath, setFilePath] = useState('');
  const [fixSummary, setFixSummary] = useState('');
  const [commitSha, setCommitSha] = useState('');
  const [decisionTitle, setDecisionTitle] = useState('');
  const [decisionRationale, setDecisionRationale] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordFeedback, setRecordFeedback] = useState(null);

  const memoryStatus = analysisData?.projectMemory;
  const isGraphConnected = memoryOverview?.status === 'connected' || Boolean(memoryStatus?.ingested);
  const symbolCount = memoryOverview?.counts?.symbols ?? memoryStatus?.counts?.symbols ?? 0;
  const rawProvider = memoryOverview?.provider || analysisData?.projectMemory?.provider;
  const providerName = 'FalkorDB';

  const entityRepo =
    investigationTarget?.entity?.repoFullName ||
    (typeof investigationTarget?.entity?.id === 'string' &&
      investigationTarget.entity.id.includes('::') &&
      investigationTarget.entity.id.split('::')[0].includes('/')
      ? investigationTarget.entity.id.split('::')[0]
      : null) ||
    (investigationTarget?.entity?.label === 'Repository' &&
      investigationTarget.entity.title?.includes('/')
      ? investigationTarget.entity.title
      : null);

  const targetRepo = investigationTarget?.targetRepo || entityRepo || null;
  const isScopedToIncident = Boolean(targetRepo && targetRepo !== analysisData?.repository?.fullName);
  const activeRepoName = targetRepo || analysisData?.repository?.fullName || 'Repository';

  // Dynamic, repository-scoped suggestions derived strictly from current repo + graph memory
  const contextualSuggestions = useMemo(
    () => generateContextualSuggestions(
      investigationTarget?.targetAnalysis || analysisData,
      memoryOverview,
      6
    ),
    [analysisData, memoryOverview, investigationTarget]
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isAsking) {
      onAskQuestion(
        input.trim(),
        investigationTarget?.entity || null,
        investigationTarget?.targetAnalysis || null,
        targetRepo
      );
      setInput('');
    }
  };

  const handleSelectPrompt = (promptText) => {
    if (isAsking) return;
    onAskQuestion(
      promptText,
      investigationTarget?.entity || null,
      investigationTarget?.targetAnalysis || null,
      targetRepo
    );
  };

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleRecordMemory = async (e) => {
    e.preventDefault();
    if (!analysisData?.repository?.fullName || !bugTitle.trim() || !bugDescription.trim()) return;

    setIsRecording(true);
    setRecordFeedback(null);

    try {
      const res = await fetch('/api/memory/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'bug_fix',
          repoFullName: analysisData.repository.fullName,
          bugTitle: bugTitle.trim(),
          bugDescription: bugDescription.trim(),
          componentPath: componentPath.trim() || undefined,
          filePath: filePath.trim() || undefined,
          fixSummary: fixSummary.trim() || undefined,
          commitSha: commitSha.trim() || undefined,
          decisionTitle: decisionTitle.trim() || undefined,
          decisionRationale: decisionRationale.trim() || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to record project memory in ${providerName}.`);
      }

      setRecordFeedback({
        type: 'success',
        message: `Recorded in ${providerName} Project Memory (Bug ID: ${data.bugId})`
      });
      setBugTitle('');
      setBugDescription('');
      setComponentPath('');
      setFilePath('');
      setFixSummary('');
      setCommitSha('');
      setDecisionTitle('');
      setDecisionRationale('');
      if (onRefreshMemory) {
        onRefreshMemory();
      }
    } catch (err) {
      setRecordFeedback({
        type: 'error',
        message: err.message
      });
    } finally {
      setIsRecording(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & Query Bar */}
      <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-4 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-violet-600 dark:text-cyan-400" />
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Query Codebase & Project Memory ({activeRepoName})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
            {isGraphConnected ? (
              <button
                type="button"
                onClick={() => onNavigateToTab && onNavigateToTab('memory')}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 font-mono hover:underline"
              >
                <Database className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>{providerName} Graph Active ({symbolCount} symbols)</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-[#151c2c] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#1f2a3f] font-mono">
                <Database className="w-3 h-3 text-slate-400" />
                <span>Static Context Mode ({providerName} {memoryOverview?.status || 'unavailable'})</span>
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Strictly grounded in repository & graph</span>
            </div>
          </div>
        </div>

        {/* Scoped Incident Memory Context Scope Banner */}
        {isScopedToIncident && (
          <div className="p-3 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-start gap-2.5 min-w-0">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-cyan-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-indigo-950 dark:text-slate-100">
                    Incident Memory Context Scope:
                  </span>
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-cyan-400 font-bold">
                    {targetRepo}
                  </span>
                  {investigationTarget?.entity?.title && (
                    <span className="text-[11px] text-indigo-700 dark:text-indigo-300">
                      (Target: {investigationTarget.entity.title})
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                  Questions in this session query verified resolutions and bug/fix memory recorded in {providerName} for <span className="font-mono text-indigo-700 dark:text-cyan-400">{targetRepo}</span>, strictly preserving repository isolation from <span className="font-mono text-slate-500">{analysisData?.repository?.fullName || 'the active repository'}</span>.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onClearInvestigationTarget && (
                <button
                  type="button"
                  onClick={onClearInvestigationTarget}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#0b0f17] transition-colors"
                >
                  <X className="w-3 h-3" />
                  <span>Return to {analysisData?.repository?.fullName || 'Active Repo'}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Selected-Node Investigation Banner */}
        {investigationTarget?.entity && (
          <div className="p-3 rounded-lg bg-violet-50/70 dark:bg-violet-950/25 border border-violet-200 dark:border-violet-900/50 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-start gap-2.5 min-w-0">
              <Crosshair className="w-4 h-4 text-violet-600 dark:text-cyan-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    Investigating Selected Graph Node:
                  </span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/50 text-violet-800 dark:text-cyan-400 font-semibold">
                    {investigationTarget.entity.label}
                  </span>
                  <span className="font-mono font-semibold text-violet-700 dark:text-cyan-400 truncate">
                    {investigationTarget.entity.title}
                  </span>
                  {activeRepoName && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-violet-100/70 dark:bg-violet-900/40 text-violet-800 dark:text-cyan-400">
                      Repo: {activeRepoName}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                  {investigationTarget.entity.provenance && `Provenance: ${investigationTarget.entity.provenance}`}
                  {investigationTarget.entity.details ? ` · ${investigationTarget.entity.details}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onClearInvestigationTarget && (
                <button
                  type="button"
                  onClick={onClearInvestigationTarget}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#0b0f17]"
                >
                  <X className="w-3 h-3" />
                  <span>Clear Target</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask about ${activeRepoName}'s files, symbols, dependencies, or ${providerName} project memory...`}
              disabled={isAsking}
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-[#222e44] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500 disabled:opacity-50 font-sans shadow-2xs"
            />
          </div>

          <button
            type="submit"
            disabled={isAsking || !input.trim()}
            className="px-4 py-2 text-xs sm:text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center gap-1.5 shadow-xs"
          >
            {isAsking ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Searching...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Ask</span>
              </>
            )}
          </button>
        </form>

        {/* Contextual Repository-Aware Prompt Suggestions */}
        <div className="pt-1 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-violet-600 dark:text-cyan-400" />
              <span>Contextual suggestions for {analysisData?.repository?.fullName || 'this repository'}:</span>
            </span>
          </div>
          {contextualSuggestions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {contextualSuggestions.map((item) => (
                <button
                  key={item.text}
                  type="button"
                  onClick={() => handleSelectPrompt(item.text)}
                  disabled={isAsking}
                  className="px-2.5 py-1 text-[11px] rounded-lg bg-slate-100 dark:bg-[#151c2c] hover:bg-slate-200 dark:hover:bg-[#1f2a3f] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#1f2a3f] transition-colors disabled:opacity-50 text-left flex items-center gap-1.5"
                >
                  <span className="text-[9px] font-mono uppercase px-1 py-0.5 rounded bg-white dark:bg-[#0b0f17] text-violet-600 dark:text-cyan-400 border border-slate-200 dark:border-[#1f2a3f] shrink-0 font-semibold">
                    {item.source}
                  </span>
                  <span>{item.text}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Insufficient repository or graph evidence to generate pre-populated suggestions — enter any custom technical question above.
            </p>
          )}
        </div>

        {/* Collapsible Project Memory Recorder (Bug, Fix & Technical Decision) */}
        <details className="pt-2 border-t border-slate-100 dark:border-[#1f2a3f] group">
          <summary className="cursor-pointer list-none flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-violet-600 dark:hover:text-cyan-400 select-none py-1">
            <span className="flex items-center gap-1.5">
              <PlusCircle className="w-3.5 h-3.5 text-violet-600 dark:text-cyan-400" />
              <span>Record Bug, Fix, or Technical Decision in {providerName} Project Memory</span>
            </span>
            <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 group-open:hidden">
              Expand
            </span>
          </summary>

          <form onSubmit={handleRecordMemory} className="mt-3 pt-3 border-t border-slate-100 dark:border-[#1f2a3f] space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Bug Title *
                </label>
                <input
                  type="text"
                  required
                  value={bugTitle}
                  onChange={(e) => setBugTitle(e.target.value)}
                  placeholder="e.g. GitHub tree fallback fails on empty branch"
                  className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-[#1f2a3f] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Component / File Path
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={componentPath}
                    onChange={(e) => setComponentPath(e.target.value)}
                    placeholder="Component (e.g. server)"
                    className="w-1/2 px-2.5 py-1.5 rounded border border-slate-200 dark:border-[#1f2a3f] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                  <input
                    type="text"
                    value={filePath}
                    onChange={(e) => setFilePath(e.target.value)}
                    placeholder="File (e.g. server/analyzer/github.js)"
                    className="w-1/2 px-2.5 py-1.5 rounded border border-slate-200 dark:border-[#1f2a3f] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Bug Description & Symptoms *
              </label>
              <input
                type="text"
                required
                value={bugDescription}
                onChange={(e) => setBugDescription(e.target.value)}
                placeholder="Describe root cause, error message, or observed failure behavior..."
                className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-[#1f2a3f] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Fix Summary (Optional)
                </label>
                <input
                  type="text"
                  value={fixSummary}
                  onChange={(e) => setFixSummary(e.target.value)}
                  placeholder="How the bug was resolved..."
                  className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-[#1f2a3f] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Commit SHA (Optional)
                </label>
                <input
                  type="text"
                  value={commitSha}
                  onChange={(e) => setCommitSha(e.target.value)}
                  placeholder="e.g. a1b2c3d"
                  className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-[#1f2a3f] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Related Technical Decision Title (Optional)
                </label>
                <input
                  type="text"
                  value={decisionTitle}
                  onChange={(e) => setDecisionTitle(e.target.value)}
                  placeholder="e.g. Use single-shot Git Trees API"
                  className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-[#1f2a3f] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Decision Rationale (Optional)
                </label>
                <input
                  type="text"
                  value={decisionRationale}
                  onChange={(e) => setDecisionRationale(e.target.value)}
                  placeholder="Why this architectural decision was chosen..."
                  className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-[#1f2a3f] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              {recordFeedback ? (
                <span className={`text-[11px] ${recordFeedback.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {recordFeedback.message}
                </span>
              ) : <span />}

              <button
                type="submit"
                disabled={isRecording || !bugTitle.trim() || !bugDescription.trim()}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 transition-colors shadow-sm"
              >
                {isRecording ? `Saving to ${providerName}...` : 'Save to Project Memory'}
              </button>
            </div>
          </form>
        </details>
      </div>

      {/* Loading banner during graph retrieval + Gemini reasoning */}
      {isAsking && (
        <div className="p-4 rounded-lg border border-violet-200 dark:border-violet-900/50 bg-violet-50/60 dark:bg-violet-950/20 flex items-center gap-3 text-xs text-violet-800 dark:text-violet-300">
          <Loader2 className="w-4 h-4 animate-spin shrink-0 text-violet-600 dark:text-cyan-400" />
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">Retrieving {providerName} Project Memory & Reasoning with Google Gemini...</p>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
              Querying related bugs, fixes, architectural decisions, component dependencies, and symbol ranges before synthesizing a grounded response.
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {qaError && (
        <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Query Failed</p>
            <p className="mt-0.5">{qaError}</p>
          </div>
        </div>
      )}

      {/* Inquiry Thread / History */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
          <span>Investigation Thread</span>
          {qaHistory && qaHistory.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear thread</span>
            </button>
          )}
        </div>

        {qaHistory && qaHistory.length > 0 ? (
          qaHistory.map((item, idx) => (
            <div 
              key={idx}
              className="rounded-lg border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-4 space-y-3"
            >
              {/* Question Header */}
              <div className="flex items-start justify-between gap-3 pb-2.5 border-b border-slate-100 dark:border-[#1f2a3f]">
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded bg-slate-100 dark:bg-[#151c2c] text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3 h-3" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {item.question}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                    {item.timestamp}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(item.answer, idx)}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    title="Copy response"
                  >
                    {copiedIndex === idx ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Answer Content */}
              <div className="flex items-start gap-2.5 pt-1">
                <div className="w-5 h-5 rounded bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-cyan-400 flex items-center justify-center shrink-0 mt-0.5 border border-violet-200 dark:border-violet-900/50">
                  <Bot className="w-3 h-3" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Grounded Answer
                    </span>
                    {item.graphMemory?.used ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">
                        + {providerName} Graph Evidence ({item.graphMemory.evidenceCount} records)
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-[#151c2c] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#1f2a3f]">
                        Static Repository Context Only
                      </span>
                    )}
                    {item.focusEntity?.title && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-cyan-300 border border-violet-200 dark:border-violet-900/50">
                        Target: {item.focusEntity.label} · {item.focusEntity.title}
                      </span>
                    )}
                    {(item.targetRepo || item.graphMemory?.repoFullName) && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/50">
                        Repo: {item.targetRepo || item.graphMemory?.repoFullName}
                      </span>
                    )}
                    {item.model && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-[#151c2c] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#1f2a3f]">
                        {item.model}
                      </span>
                    )}
                    {item.fallbackUsed && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
                        Failover ({item.attempts || 2} attempts)
                      </span>
                    )}
                  </div>
                  <MarkdownMessageRenderer content={item.answer} />

                  {/* Retrieved FalkorDB Graph Evidence Summary OR Fallback Notice */}
                  {item.graphMemory?.used ? (
                    <div className="pt-3 mt-3 border-t border-slate-100 dark:border-[#1f2a3f] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                          Retrieved {providerName} Project Memory Evidence
                        </span>
                        {onNavigateToTab && (
                          <button
                            type="button"
                            onClick={() => onNavigateToTab('memory')}
                            className="text-[11px] text-violet-600 dark:text-cyan-400 hover:underline inline-flex items-center gap-1 font-medium"
                          >
                            <span>Inspect in Graph Explorer</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {item.graphMemory.bugsAndFixes?.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 block font-semibold">
                            Historical Bugs & Fixes ({item.graphMemory.bugsAndFixes.length})
                          </span>
                          {item.graphMemory.bugsAndFixes.slice(0, 4).map((b) => (
                            <div key={b.bugId} className="text-[11px] p-2.5 rounded bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40 text-slate-800 dark:text-slate-200 flex items-start gap-2">
                              <Bug className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                              <div className="space-y-1 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-semibold text-slate-900 dark:text-slate-100">{b.title}</span>
                                  <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-800/40">
                                    Historical Precedent
                                  </span>
                                </div>
                                {b.fixSummary && (
                                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono font-medium">
                                    Fix: {b.fixSummary}
                                  </div>
                                )}
                                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                  {b.component && <span className="px-1.5 py-0.2 rounded bg-white/80 dark:bg-[#0b0f17] border border-amber-200/60 dark:border-[#1f2a3f]">Component: {b.component}</span>}
                                  {b.filePath && <span className="px-1.5 py-0.2 rounded bg-white/80 dark:bg-[#0b0f17] border border-amber-200/60 dark:border-[#1f2a3f]">File: {b.filePath}</span>}
                                  {b.commitSha && <span className="px-1.5 py-0.2 rounded bg-white/80 dark:bg-[#0b0f17] border border-amber-200/60 dark:border-[#1f2a3f]">Commit: {b.commitSha.slice(0, 10)}</span>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {item.graphMemory.decisions?.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-mono text-violet-600 dark:text-violet-400 block font-semibold">
                            Technical Decisions ({item.graphMemory.decisions.length})
                          </span>
                          {item.graphMemory.decisions.slice(0, 4).map((d) => (
                            <div key={d.decisionId} className="text-[11px] p-2.5 rounded bg-violet-50/60 dark:bg-violet-950/20 border border-violet-200/70 dark:border-violet-900/40 text-slate-800 dark:text-slate-200 flex items-start gap-2">
                              <BookOpen className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
                              <div className="space-y-0.5">
                                <div>
                                  <span className="font-semibold text-slate-900 dark:text-slate-100">{d.title}</span>
                                  {d.rationale && <span className="text-slate-600 dark:text-slate-400"> — {d.rationale}</span>}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                  {d.component && <span className="px-1.5 py-0.2 rounded bg-white/80 dark:bg-[#0b0f17] border border-violet-200/60 dark:border-[#1f2a3f]">Component: {d.component}</span>}
                                  {d.filePath && <span className="px-1.5 py-0.2 rounded bg-white/80 dark:bg-[#0b0f17] border border-violet-200/60 dark:border-[#1f2a3f]">File: {d.filePath}</span>}
                                  {d.commitSha && <span className="px-1.5 py-0.2 rounded bg-white/80 dark:bg-[#0b0f17] border border-violet-200/60 dark:border-[#1f2a3f]">Commit: {d.commitSha.slice(0, 10)}</span>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {item.graphMemory.componentDependencies?.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-mono text-blue-600 dark:text-cyan-400 block font-semibold">
                            Affected Component Dependencies ({item.graphMemory.componentDependencies.length})
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {item.graphMemory.componentDependencies.slice(0, 6).map((dep, depIdx) => (
                              <span
                                key={`${dep.sourceComponent}-${dep.targetComponent}-${depIdx}`}
                                className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded bg-blue-50/60 dark:bg-cyan-950/20 text-blue-700 dark:text-cyan-300 border border-blue-200/60 dark:border-cyan-900/40"
                              >
                                <Layers className="w-3 h-3" />
                                <span>{dep.sourceComponent} → {dep.targetComponent} ({dep.weight || 1}x)</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {item.graphMemory.symbols?.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 block">
                            Extracted Symbols ({item.graphMemory.symbols.length})
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {item.graphMemory.symbols.slice(0, 6).map((s) => (
                              <span
                                key={s.id}
                                className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-[#0b0f17] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#1f2a3f]"
                              >
                                {s.name} ({s.filePath}:L{s.startLine}-{s.endLine})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {item.graphMemory.recentCommits?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {item.graphMemory.recentCommits.slice(0, 3).map((c) => (
                            <span
                              key={c.sha}
                              className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-[#0b0f17] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#1f2a3f]"
                            >
                              <GitCommit className="w-3 h-3" />
                              <span>{c.shortSha}: {c.message?.slice(0, 45)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="pt-2.5 mt-2.5 border-t border-slate-100 dark:border-[#1f2a3f] flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        No matching {providerName} graph memory records were returned for this query; response is grounded strictly in the static repository analysis.
                      </span>
                      {onNavigateToTab && (
                        <button
                          type="button"
                          onClick={() => onNavigateToTab('memory')}
                          className="text-violet-600 dark:text-cyan-400 hover:underline shrink-0 font-medium"
                        >
                          Record Project Memory →
                        </button>
                      )}
                    </div>
                  )}

                  {(() => {
                    const referencedFiles = extractReferencedFiles(item.answer, analysisData?.aiContextReady?.filePaths);
                    if (!referencedFiles || referencedFiles.length === 0) return null;

                    return (
                      <div className="pt-3 mt-3 border-t border-slate-100 dark:border-[#1f2a3f] space-y-1.5">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                          Relevant files
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {referencedFiles.map((file) => (
                            <span 
                              key={file} 
                              className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-[#0b0f17] text-slate-800 dark:text-cyan-300 border border-slate-200 dark:border-[#1f2a3f]"
                            >
                              {file}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="py-12 text-center rounded-lg border border-dashed border-slate-200 dark:border-[#1f2a3f] bg-white/50 dark:bg-[#101624]/30 p-6">
            <MessageSquare className="w-6 h-6 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              No questions asked for this repository yet
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Ask technical questions about the scanned codebase. Answers are restricted to verified manifests, entry files, directory artifacts, and {providerName} project memory.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
