import React from 'react';
import { 
  Sparkles, 
  Play, 
  FileCode, 
  Folder, 
  Server, 
  Layers, 
  CheckCircle2, 
  Info, 
  AlertTriangle, 
  Loader2, 
  RefreshCw, 
  BookOpen,
  ArrowRight,
  Database
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
  onNavigateToTab
}) {
  const { techStack, frameworks, architecture, structure, observations, metrics } = analysisData;
  const counts = memoryOverview?.counts || analysisData?.projectMemory?.counts || {};
  const memoryStatus = memoryOverview?.status || (analysisData?.projectMemory?.ingested ? 'connected' : 'not_configured');
  const isMemoryConnected = memoryStatus === 'connected';

  return (
    <div className="space-y-6">
      {/* Static Code Analysis vs. Persistent FalkorDB Graph Memory */}
      <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-[#1f2a3f]">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Database className="w-4 h-4 text-violet-600 dark:text-cyan-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Static Code Analysis & Persistent Graph Memory
              </h2>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
                isMemoryConnected
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                  : memoryStatus === 'not_configured'
                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
                    : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60'
              }`}>
                {isMemoryConnected
                  ? 'Graph Status: Connected'
                  : memoryStatus === 'not_configured'
                    ? 'Graph Status: Not Configured'
                    : 'Graph Status: Unavailable'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Static analysis inspects repository manifests and directory layout per scan; Graph Memory persists extracted symbols, bugs, fixes, and architectural decisions across sessions.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigateToTab('memory')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-violet-200 dark:border-violet-900/50 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-950/50 text-violet-700 dark:text-cyan-400 transition-colors shrink-0 shadow-2xs"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Open Graph Memory Workspace</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="pt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f]">
            <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 block">
              Scanned Files (Static)
            </span>
            <span className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
              {metrics?.totalFiles ?? 0}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f]">
            <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 block">
              Extracted Symbols
            </span>
            <span className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
              {isMemoryConnected ? (counts.symbols ?? 0) : '—'}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f]">
            <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 block">
              Stored Decisions
            </span>
            <span className="text-sm font-bold font-mono text-purple-600 dark:text-purple-400">
              {isMemoryConnected ? (counts.decisions ?? 0) : '—'}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f]">
            <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 block">
              Recorded Bugs
            </span>
            <span className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400">
              {isMemoryConnected ? (counts.bugs ?? 0) : '—'}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f]">
            <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 block">
              Verified Fixes
            </span>
            <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {isMemoryConnected ? (counts.fixes ?? 0) : '—'}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1f2a3f]">
            <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 block">
              Graph Relationships
            </span>
            <span className="text-sm font-bold font-mono text-violet-600 dark:text-cyan-400">
              {isMemoryConnected ? (counts.relationships ?? 0) : '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main 2-column Content Area */}
        <div className="lg:col-span-2 space-y-6">
        {/* 1. AI Architecture Summary Panel (Generated Automatically on Repo Analysis) */}
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
              {summaryMeta?.fallbackUsed && (
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60"
                  title={`Fallback model succeeded on attempt ${summaryMeta.attempts || 2}`}
                >
                  Failover ({summaryMeta.attempts || 2} attempts)
                </span>
              )}
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
                  Automatically synthesizing repository summary from verified manifests & graph evidence...
                </span>
              </div>
            ) : summaryError ? (
              <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/60 text-xs text-red-700 dark:text-red-400 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Automatic summary generation encountered an issue</p>
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

        {/* 2. Detected Entry Points */}
        <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#1f2a3f]">
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Execution Entry Points
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              {architecture.entryPoints?.length || 0} identified
            </span>
          </div>

          <div className="pt-3 divide-y divide-slate-100 dark:divide-[#151c2c]">
            {architecture.entryPoints && architecture.entryPoints.length > 0 ? (
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

        {/* 3. Classified Directory Structure */}
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
              <span>Inspect in Graph & File Explorer</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {structure.classifiedDirectories && structure.classifiedDirectories.length > 0 ? (
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

      {/* Right Sidebar: Tech Stack, Distribution & Observations */}
      <div className="space-y-6">
        {/* Languages Breakdown */}
        <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-5 shadow-xs">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 pb-3 border-b border-slate-200 dark:border-[#1f2a3f]">
            Languages
          </h3>

          {techStack.languages && techStack.languages.length > 0 ? (
            <div className="pt-3 space-y-3">
              {/* Progress bar */}
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

              {/* Language list */}
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
            {/* Backend */}
            {techStack.backend?.length > 0 && (
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

            {/* Frontend */}
            {techStack.frontend?.length > 0 && (
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

            {/* Frameworks */}
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

            {/* DevOps */}
            {techStack.devops?.length > 0 && (
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

            {(!techStack.backend?.length && !techStack.frontend?.length && !frameworks?.length && !techStack.devops?.length) && (
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
