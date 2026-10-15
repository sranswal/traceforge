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

function FormattedAnswer({ text }) {
  if (!text) return null;
  const lines = text.split('\n');

  return (
    <div className="space-y-2 text-xs sm:text-sm text-neutral-800 dark:text-[#c9d1d9] leading-relaxed font-sans">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-[#f0f6fc] pt-2 pb-0.5 border-b border-neutral-200 dark:border-[#21262d]">
              {trimmed.replace('### ', '')}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={idx} className="text-sm font-bold text-neutral-900 dark:text-[#f0f6fc] pt-3 pb-1 border-b border-neutral-200 dark:border-[#30363d]">
              {trimmed.replace('## ', '')}
            </h3>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const itemText = trimmed.substring(2);
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-neutral-400 dark:text-[#6e7681] font-bold mt-0.5">•</span>
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
        <code key={i} className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-800 dark:text-[#79c0ff] border border-neutral-200 dark:border-[#30363d] mx-0.5">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-neutral-900 dark:text-[#f0f6fc]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

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
      <div className="rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-neutral-500 dark:text-[#8b949e]" />
            <span className="text-xs font-semibold text-neutral-900 dark:text-[#f0f6fc]">
              Query Codebase & Project Memory ({activeRepoName})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-500 dark:text-[#8b949e]">
            {isGraphConnected ? (
              <button
                type="button"
                onClick={() => onNavigateToTab && onNavigateToTab('memory')}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-[#3fb950] border border-emerald-200 dark:border-emerald-900/50 font-mono hover:underline"
              >
                <Database className="w-3 h-3" />
                <span>{providerName} Graph Active ({symbolCount} symbols)</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-600 dark:text-[#8b949e] border border-neutral-200 dark:border-[#30363d] font-mono">
                <Database className="w-3 h-3" />
                <span>Static Context Mode ({providerName} {memoryOverview?.status || 'unavailable'})</span>
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-[#3fb950]" />
              <span>Strictly grounded in repository & graph</span>
            </div>
          </div>
        </div>

        {/* Scoped Incident Memory Context Scope Banner */}
        {isScopedToIncident && (
          <div className="p-3 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-start gap-2.5 min-w-0">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-[#79c0ff] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-indigo-950 dark:text-[#f0f6fc]">
                    Incident Memory Context Scope:
                  </span>
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-[#79c0ff] font-bold">
                    {targetRepo}
                  </span>
                  {investigationTarget?.entity?.title && (
                    <span className="text-[11px] text-indigo-700 dark:text-indigo-300">
                      (Target: {investigationTarget.entity.title})
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-600 dark:text-[#8b949e] mt-0.5">
                  Questions in this session query verified resolutions and bug/fix memory recorded in {providerName} for <span className="font-mono text-indigo-700 dark:text-[#79c0ff]">{targetRepo}</span>, strictly preserving repository isolation from <span className="font-mono text-neutral-500">{analysisData?.repository?.fullName || 'the active repository'}</span>.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onClearInvestigationTarget && (
                <button
                  type="button"
                  onClick={onClearInvestigationTarget}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-neutral-600 dark:text-[#8b949e] hover:text-neutral-900 dark:hover:text-[#f0f6fc] border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] transition-colors"
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
          <div className="p-3 rounded-lg bg-blue-50/70 dark:bg-blue-950/25 border border-blue-200 dark:border-blue-900/50 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-start gap-2.5 min-w-0">
              <Crosshair className="w-4 h-4 text-blue-600 dark:text-[#58a6ff] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-blue-900 dark:text-[#f0f6fc]">
                    Investigating Selected Graph Node:
                  </span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-[#79c0ff]">
                    {investigationTarget.entity.label}
                  </span>
                  <span className="font-mono font-semibold text-blue-700 dark:text-[#58a6ff] truncate">
                    {investigationTarget.entity.title}
                  </span>
                  {activeRepoName && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-100/70 dark:bg-blue-900/40 text-blue-800 dark:text-[#79c0ff]">
                      Repo: {activeRepoName}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-600 dark:text-[#8b949e] mt-0.5 truncate">
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
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-neutral-600 dark:text-[#8b949e] hover:text-neutral-900 dark:hover:text-[#f0f6fc] border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117]"
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
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc] placeholder-neutral-400 dark:placeholder-[#6e7681] focus:outline-none focus:border-blue-500 disabled:opacity-50 font-sans"
            />
          </div>

          <button
            type="submit"
            disabled={isAsking || !input.trim()}
            className="px-4 py-2 text-xs sm:text-sm font-medium rounded border border-neutral-900 dark:border-[#30363d] bg-neutral-900 dark:bg-[#21262d] hover:bg-neutral-800 dark:hover:bg-[#30363d] text-white dark:text-[#f0f6fc] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center gap-1.5"
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
            <span className="text-[11px] font-medium text-neutral-500 dark:text-[#8b949e] flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-blue-600 dark:text-[#58a6ff]" />
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
                  className="px-2.5 py-1 text-[11px] rounded bg-neutral-100 dark:bg-[#21262d] hover:bg-neutral-200 dark:hover:bg-[#30363d] text-neutral-700 dark:text-[#c9d1d9] border border-neutral-200 dark:border-[#30363d] transition-colors disabled:opacity-50 text-left flex items-center gap-1.5"
                >
                  <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-white dark:bg-[#0d1117] text-blue-600 dark:text-[#58a6ff] border border-neutral-200 dark:border-[#30363d] shrink-0">
                    {item.source}
                  </span>
                  <span>{item.text}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-neutral-400 dark:text-[#6e7681]">
              Insufficient repository or graph evidence to generate pre-populated suggestions — enter any custom technical question above.
            </p>
          )}
        </div>

        {/* Collapsible Project Memory Recorder (Bug, Fix & Technical Decision) */}
        <details className="pt-2 border-t border-neutral-100 dark:border-[#21262d] group">
          <summary className="cursor-pointer list-none flex items-center justify-between text-xs font-medium text-neutral-700 dark:text-[#c9d1d9] hover:text-blue-600 dark:hover:text-[#58a6ff] select-none py-1">
            <span className="flex items-center gap-1.5">
              <PlusCircle className="w-3.5 h-3.5 text-blue-600 dark:text-[#58a6ff]" />
              <span>Record Bug, Fix, or Technical Decision in {providerName} Project Memory</span>
            </span>
            <span className="text-[11px] font-mono text-neutral-400 dark:text-[#6e7681] group-open:hidden">
              Expand
            </span>
          </summary>

          <form onSubmit={handleRecordMemory} className="mt-3 pt-3 border-t border-neutral-100 dark:border-[#21262d] space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-[#8b949e] mb-1">
                  Bug Title *
                </label>
                <input
                  type="text"
                  required
                  value={bugTitle}
                  onChange={(e) => setBugTitle(e.target.value)}
                  placeholder="e.g. GitHub tree fallback fails on empty branch"
                  className="w-full px-2.5 py-1.5 rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-[#8b949e] mb-1">
                  Component / File Path
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={componentPath}
                    onChange={(e) => setComponentPath(e.target.value)}
                    placeholder="Component (e.g. server)"
                    className="w-1/2 px-2.5 py-1.5 rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc] font-mono text-[11px]"
                  />
                  <input
                    type="text"
                    value={filePath}
                    onChange={(e) => setFilePath(e.target.value)}
                    placeholder="File (e.g. server/analyzer/github.js)"
                    className="w-1/2 px-2.5 py-1.5 rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc] font-mono text-[11px]"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-neutral-600 dark:text-[#8b949e] mb-1">
                Bug Description & Symptoms *
              </label>
              <input
                type="text"
                required
                value={bugDescription}
                onChange={(e) => setBugDescription(e.target.value)}
                placeholder="Describe root cause, error message, or observed failure behavior..."
                className="w-full px-2.5 py-1.5 rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-[#8b949e] mb-1">
                  Fix Summary (Optional)
                </label>
                <input
                  type="text"
                  value={fixSummary}
                  onChange={(e) => setFixSummary(e.target.value)}
                  placeholder="How the bug was resolved..."
                  className="w-full px-2.5 py-1.5 rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-[#8b949e] mb-1">
                  Commit SHA (Optional)
                </label>
                <input
                  type="text"
                  value={commitSha}
                  onChange={(e) => setCommitSha(e.target.value)}
                  placeholder="e.g. a1b2c3d"
                  className="w-full px-2.5 py-1.5 rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc] font-mono text-[11px]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-[#8b949e] mb-1">
                  Related Technical Decision Title (Optional)
                </label>
                <input
                  type="text"
                  value={decisionTitle}
                  onChange={(e) => setDecisionTitle(e.target.value)}
                  placeholder="e.g. Use single-shot Git Trees API"
                  className="w-full px-2.5 py-1.5 rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-[#8b949e] mb-1">
                  Decision Rationale (Optional)
                </label>
                <input
                  type="text"
                  value={decisionRationale}
                  onChange={(e) => setDecisionRationale(e.target.value)}
                  placeholder="Why this architectural decision was chosen..."
                  className="w-full px-2.5 py-1.5 rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              {recordFeedback ? (
                <span className={`text-[11px] ${recordFeedback.type === 'success' ? 'text-emerald-600 dark:text-[#3fb950]' : 'text-red-600 dark:text-red-400'}`}>
                  {recordFeedback.message}
                </span>
              ) : <span />}

              <button
                type="submit"
                disabled={isRecording || !bugTitle.trim() || !bugDescription.trim()}
                className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
              >
                {isRecording ? `Saving to ${providerName}...` : 'Save to Project Memory'}
              </button>
            </div>
          </form>
        </details>
      </div>

      {/* Loading banner during graph retrieval + Gemini reasoning */}
      {isAsking && (
        <div className="p-4 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/20 flex items-center gap-3 text-xs text-blue-800 dark:text-[#79c0ff]">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <div>
            <p className="font-semibold">Retrieving {providerName} Project Memory & Reasoning with Google Gemini...</p>
            <p className="text-[11px] text-blue-600/80 dark:text-[#58a6ff]/80 mt-0.5">
              Querying related bugs, fixes, architectural decisions, component dependencies, and symbol ranges before synthesizing a grounded response.
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {qaError && (
        <div className="p-3.5 rounded bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Query Failed</p>
            <p className="mt-0.5">{qaError}</p>
          </div>
        </div>
      )}

      {/* Inquiry Thread / History */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-[#8b949e] px-1">
          <span>Investigation Thread</span>
          {qaHistory && qaHistory.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="text-neutral-400 dark:text-[#6e7681] hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1"
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
              className="rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] p-4 space-y-3"
            >
              {/* Question Header */}
              <div className="flex items-start justify-between gap-3 pb-2.5 border-b border-neutral-100 dark:border-[#21262d]">
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-600 dark:text-[#8b949e] flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3 h-3" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-neutral-900 dark:text-[#f0f6fc]">
                      {item.question}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-neutral-400 dark:text-[#6e7681] font-mono">
                    {item.timestamp}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(item.answer, idx)}
                    className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-[#c9d1d9]"
                    title="Copy response"
                  >
                    {copiedIndex === idx ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-[#3fb950]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Answer Content */}
              <div className="flex items-start gap-2.5 pt-1">
                <div className="w-5 h-5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-[#58a6ff] flex items-center justify-center shrink-0 mt-0.5 border border-blue-200 dark:border-blue-900/50">
                  <Bot className="w-3 h-3" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 dark:text-[#6e7681]">
                      Grounded Answer
                    </span>
                    {item.graphMemory?.used ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-[#3fb950] border border-emerald-200 dark:border-emerald-900/50">
                        + {providerName} Graph Evidence ({item.graphMemory.evidenceCount} records)
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-600 dark:text-[#8b949e] border border-neutral-200 dark:border-[#30363d]">
                        Static Repository Context Only
                      </span>
                    )}
                    {item.focusEntity?.title && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-[#58a6ff] border border-blue-200 dark:border-blue-900/50">
                        Target: {item.focusEntity.label} · {item.focusEntity.title}
                      </span>
                    )}
                    {(item.targetRepo || item.graphMemory?.repoFullName) && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-[#79c0ff] border border-indigo-200 dark:border-indigo-900/50">
                        Repo: {item.targetRepo || item.graphMemory?.repoFullName}
                      </span>
                    )}
                    {item.model && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-600 dark:text-[#8b949e] border border-neutral-200 dark:border-[#30363d]">
                        {item.model}
                      </span>
                    )}
                    {item.fallbackUsed && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
                        Failover ({item.attempts || 2} attempts)
                      </span>
                    )}
                  </div>
                  <FormattedAnswer text={item.answer} />

                  {/* Retrieved FalkorDB Graph Evidence Summary OR Fallback Notice */}
                  {item.graphMemory?.used ? (
                    <div className="pt-3 mt-3 border-t border-neutral-100 dark:border-[#21262d] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 dark:text-[#6e7681] block">
                          Retrieved {providerName} Project Memory Evidence
                        </span>
                        {onNavigateToTab && (
                          <button
                            type="button"
                            onClick={() => onNavigateToTab('memory')}
                            className="text-[11px] text-blue-600 dark:text-[#58a6ff] hover:underline inline-flex items-center gap-1"
                          >
                            <span>Inspect in Graph Explorer</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {item.graphMemory.bugsAndFixes?.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 block">
                            Historical Bugs & Fixes ({item.graphMemory.bugsAndFixes.length})
                          </span>
                          {item.graphMemory.bugsAndFixes.slice(0, 4).map((b) => (
                            <div key={b.bugId} className="text-[11px] p-2.5 rounded bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40 text-neutral-800 dark:text-[#c9d1d9] flex items-start gap-2">
                              <Bug className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                              <div className="space-y-1 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-semibold text-neutral-900 dark:text-[#f0f6fc]">{b.title}</span>
                                  <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-[#f2cc60] font-bold border border-amber-300 dark:border-amber-800/40">
                                    Historical Precedent
                                  </span>
                                </div>
                                {b.fixSummary && (
                                  <div className="text-[11px] text-emerald-700 dark:text-[#3fb950] font-mono font-medium">
                                    Fix: {b.fixSummary}
                                  </div>
                                )}
                                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-neutral-500 dark:text-[#8b949e]">
                                  {b.component && <span className="px-1.5 py-0.2 rounded bg-white/80 dark:bg-[#0d1117] border border-amber-200/60 dark:border-[#30363d]">Component: {b.component}</span>}
                                  {b.filePath && <span className="px-1.5 py-0.2 rounded bg-white/80 dark:bg-[#0d1117] border border-amber-200/60 dark:border-[#30363d]">File: {b.filePath}</span>}
                                  {b.commitSha && <span className="px-1.5 py-0.2 rounded bg-white/80 dark:bg-[#0d1117] border border-amber-200/60 dark:border-[#30363d]">Commit: {b.commitSha.slice(0, 10)}</span>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {item.graphMemory.decisions?.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400 block">
                            Technical Decisions ({item.graphMemory.decisions.length})
                          </span>
                          {item.graphMemory.decisions.slice(0, 4).map((d) => (
                            <div key={d.decisionId} className="text-[11px] p-2.5 rounded bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/70 dark:border-purple-900/40 text-neutral-800 dark:text-[#c9d1d9] flex items-start gap-2">
                              <BookOpen className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                              <div className="space-y-0.5">
                                <div>
                                  <span className="font-semibold">{d.title}</span>
                                  {d.rationale && <span className="text-neutral-600 dark:text-[#8b949e]"> — {d.rationale}</span>}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-neutral-500 dark:text-[#8b949e]">
                                  {d.component && <span className="px-1.5 py-0.2 rounded bg-white/80 dark:bg-[#0d1117] border border-purple-200/60 dark:border-[#30363d]">Component: {d.component}</span>}
                                  {d.filePath && <span className="px-1.5 py-0.2 rounded bg-white/80 dark:bg-[#0d1117] border border-purple-200/60 dark:border-[#30363d]">File: {d.filePath}</span>}
                                  {d.commitSha && <span className="px-1.5 py-0.2 rounded bg-white/80 dark:bg-[#0d1117] border border-purple-200/60 dark:border-[#30363d]">Commit: {d.commitSha.slice(0, 10)}</span>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {item.graphMemory.componentDependencies?.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-mono text-blue-600 dark:text-[#58a6ff] block">
                            Affected Component Dependencies ({item.graphMemory.componentDependencies.length})
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {item.graphMemory.componentDependencies.slice(0, 6).map((dep, depIdx) => (
                              <span
                                key={`${dep.sourceComponent}-${dep.targetComponent}-${depIdx}`}
                                className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded bg-blue-50/60 dark:bg-blue-950/20 text-blue-700 dark:text-[#79c0ff] border border-blue-200/60 dark:border-blue-900/40"
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
                          <span className="text-[10px] font-mono text-neutral-500 dark:text-[#8b949e] block">
                            Extracted Symbols ({item.graphMemory.symbols.length})
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {item.graphMemory.symbols.slice(0, 6).map((s) => (
                              <span
                                key={s.id}
                                className="font-mono text-[10px] px-2 py-0.5 rounded bg-neutral-100 dark:bg-[#0d1117] text-neutral-700 dark:text-[#8b949e] border border-neutral-200 dark:border-[#30363d]"
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
                              className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded bg-neutral-100 dark:bg-[#0d1117] text-neutral-600 dark:text-[#8b949e] border border-neutral-200 dark:border-[#30363d]"
                            >
                              <GitCommit className="w-3 h-3" />
                              <span>{c.shortSha}: {c.message?.slice(0, 45)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="pt-2.5 mt-2.5 border-t border-neutral-100 dark:border-[#21262d] flex items-center justify-between gap-2 text-[11px] text-neutral-500 dark:text-[#8b949e]">
                      <span>
                        No matching {providerName} graph memory records were returned for this query; response is grounded strictly in the static repository analysis.
                      </span>
                      {onNavigateToTab && (
                        <button
                          type="button"
                          onClick={() => onNavigateToTab('memory')}
                          className="text-blue-600 dark:text-[#58a6ff] hover:underline shrink-0"
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
                      <div className="pt-3 mt-3 border-t border-neutral-100 dark:border-[#21262d] space-y-1.5">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 dark:text-[#6e7681] block">
                          Relevant files
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {referencedFiles.map((file) => (
                            <span 
                              key={file} 
                              className="font-mono text-[11px] px-2 py-0.5 rounded bg-neutral-100 dark:bg-[#0d1117] text-neutral-800 dark:text-[#79c0ff] border border-neutral-200 dark:border-[#30363d]"
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
          <div className="py-12 text-center rounded-lg border border-dashed border-neutral-200 dark:border-[#30363d] bg-white/50 dark:bg-[#161b22]/30 p-6">
            <MessageSquare className="w-6 h-6 text-neutral-400 dark:text-[#6e7681] mx-auto mb-2" />
            <h4 className="text-xs font-semibold text-neutral-700 dark:text-[#c9d1d9]">
              No questions asked for this repository yet
            </h4>
            <p className="text-[11px] text-neutral-500 dark:text-[#8b949e] mt-1 max-w-sm mx-auto">
              Ask technical questions about the scanned codebase. Answers are restricted to verified manifests, entry files, directory artifacts, and {providerName} project memory.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
