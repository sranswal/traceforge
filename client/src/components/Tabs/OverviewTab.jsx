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
    <div className="space-y-2 text-xs sm:text-sm text-neutral-700 dark:text-[#c9d1d9] leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-[#f0f6fc] pt-2 pb-0.5 border-b border-neutral-100 dark:border-[#21262d]">
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
      <div className="rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-neutral-200 dark:border-[#30363d]">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Database className="w-4 h-4 text-blue-600 dark:text-[#58a6ff]" />
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-[#f0f6fc]">
                Static Code Analysis & Persistent Graph Memory
              </h2>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                isMemoryConnected
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-[#3fb950] border-emerald-200 dark:border-emerald-900/50'
                  : memoryStatus === 'not_configured'
                    ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/50'
                    : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/50'
              }`}>
                {isMemoryConnected
                  ? 'Graph Status: Connected'
                  : memoryStatus === 'not_configured'
                    ? 'Graph Status: Not Configured'
                    : 'Graph Status: Unavailable'}
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-[#8b949e]">
              Static analysis inspects repository manifests and directory layout per scan; Graph Memory persists extracted symbols, bugs, fixes, and architectural decisions across sessions.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigateToTab('memory')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 text-blue-700 dark:text-[#58a6ff] transition-colors shrink-0"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Open Graph Memory Workspace</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="pt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          <div className="p-2.5 rounded bg-neutral-50 dark:bg-[#0d1117] border border-neutral-200 dark:border-[#30363d]">
            <span className="text-[10px] font-mono uppercase text-neutral-400 dark:text-[#6e7681] block">
              Scanned Files (Static)
            </span>
            <span className="text-sm font-bold font-mono text-neutral-900 dark:text-[#f0f6fc]">
              {metrics?.totalFiles ?? 0}
            </span>
          </div>
          <div className="p-2.5 rounded bg-neutral-50 dark:bg-[#0d1117] border border-neutral-200 dark:border-[#30363d]">
            <span className="text-[10px] font-mono uppercase text-neutral-400 dark:text-[#6e7681] block">
              Extracted Symbols
            </span>
            <span className="text-sm font-bold font-mono text-neutral-900 dark:text-[#f0f6fc]">
              {isMemoryConnected ? (counts.symbols ?? 0) : '—'}
            </span>
          </div>
          <div className="p-2.5 rounded bg-neutral-50 dark:bg-[#0d1117] border border-neutral-200 dark:border-[#30363d]">
            <span className="text-[10px] font-mono uppercase text-neutral-400 dark:text-[#6e7681] block">
              Stored Decisions
            </span>
            <span className="text-sm font-bold font-mono text-purple-600 dark:text-purple-400">
              {isMemoryConnected ? (counts.decisions ?? 0) : '—'}
            </span>
          </div>
          <div className="p-2.5 rounded bg-neutral-50 dark:bg-[#0d1117] border border-neutral-200 dark:border-[#30363d]">
            <span className="text-[10px] font-mono uppercase text-neutral-400 dark:text-[#6e7681] block">
              Recorded Bugs
            </span>
            <span className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400">
              {isMemoryConnected ? (counts.bugs ?? 0) : '—'}
            </span>
          </div>
          <div className="p-2.5 rounded bg-neutral-50 dark:bg-[#0d1117] border border-neutral-200 dark:border-[#30363d]">
            <span className="text-[10px] font-mono uppercase text-neutral-400 dark:text-[#6e7681] block">
              Verified Fixes
            </span>
            <span className="text-sm font-bold font-mono text-emerald-600 dark:text-[#3fb950]">
              {isMemoryConnected ? (counts.fixes ?? 0) : '—'}
            </span>
          </div>
          <div className="p-2.5 rounded bg-neutral-50 dark:bg-[#0d1117] border border-neutral-200 dark:border-[#30363d]">
            <span className="text-[10px] font-mono uppercase text-neutral-400 dark:text-[#6e7681] block">
              Graph Relationships
            </span>
            <span className="text-sm font-bold font-mono text-blue-600 dark:text-[#58a6ff]">
              {isMemoryConnected ? (counts.relationships ?? 0) : '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main 2-column Content Area */}
        <div className="lg:col-span-2 space-y-6">
        {/* 1. AI Architecture Summary Panel (Generated Automatically on Repo Analysis) */}
        <div className="rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-200 dark:border-[#30363d]">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600 dark:text-[#58a6ff]" />
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-[#f0f6fc]">
                AI Architectural Summary
              </h2>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-600 dark:text-[#8b949e] border border-neutral-200 dark:border-[#30363d]">
                {summaryMeta?.model || 'Gemini'}
              </span>
              {summaryMeta?.fallbackUsed && (
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50"
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#21262d] hover:bg-neutral-100 dark:hover:bg-[#30363d] text-neutral-800 dark:text-[#f0f6fc] disabled:opacity-50 transition-colors shrink-0"
            >
              {isGeneratingSummary ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
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
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-neutral-500 dark:text-[#8b949e]">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600 dark:text-[#58a6ff]" />
                <span className="text-xs font-medium">
                  Automatically synthesizing repository summary from verified manifests & graph evidence...
                </span>
              </div>
            ) : summaryError ? (
              <div className="p-3.5 rounded bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-400 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Automatic summary generation encountered an issue</p>
                  <p className="mt-0.5">{summaryError}</p>
                </div>
                <button
                  type="button"
                  onClick={onGenerateSummary}
                  className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-medium shrink-0"
                >
                  Retry Summary
                </button>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-neutral-500 dark:text-[#8b949e]">
                <p>Preparing repository architectural summary...</p>
              </div>
            )}
          </div>
        </div>

        {/* 2. Detected Entry Points */}
        <div className="rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] p-5">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-[#30363d]">
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4 text-emerald-600 dark:text-[#3fb950]" />
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-[#f0f6fc]">
                Execution Entry Points
              </h3>
            </div>
            <span className="text-[11px] font-mono text-neutral-500 dark:text-[#8b949e]">
              {architecture.entryPoints?.length || 0} identified
            </span>
          </div>

          <div className="pt-3 divide-y divide-neutral-100 dark:divide-[#21262d]">
            {architecture.entryPoints && architecture.entryPoints.length > 0 ? (
              architecture.entryPoints.map((entry) => (
                <div key={entry.path} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-mono text-neutral-800 dark:text-[#79c0ff]">
                    <FileCode className="w-3.5 h-3.5 text-neutral-400 dark:text-[#6e7681]" />
                    <span className="font-medium">{entry.path}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-600 dark:text-[#8b949e] border border-neutral-200 dark:border-[#30363d] text-[11px]">
                      {entry.type}
                    </span>
                    <span className="text-neutral-400 dark:text-[#6e7681] text-[11px] font-mono">
                      {entry.language}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-4 text-center text-xs text-neutral-400 dark:text-[#6e7681]">
                No standard root execution entry points identified.
              </p>
            )}
          </div>
        </div>

        {/* 3. Classified Directory Structure */}
        <div className="rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] p-5">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-[#30363d]">
            <div className="flex items-center gap-2">
              <Folder className="w-4 h-4 text-blue-500 dark:text-[#58a6ff]" />
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-[#f0f6fc]">
                Identified Directory Roles
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToTab('memory')}
              className="text-xs text-blue-600 dark:text-[#58a6ff] hover:underline flex items-center gap-1"
            >
              <span>Inspect in Graph & File Explorer</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {structure.classifiedDirectories && structure.classifiedDirectories.length > 0 ? (
              structure.classifiedDirectories.slice(0, 8).map((dir) => (
                <div key={dir.path} className="p-2.5 rounded bg-neutral-50 dark:bg-[#0d1117] border border-neutral-200 dark:border-[#30363d] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-neutral-800 dark:text-[#c9d1d9]">
                      {dir.path}
                    </span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-[#21262d] text-neutral-700 dark:text-[#8b949e]">
                      {dir.role}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-[#8b949e] line-clamp-1">
                    {dir.description}
                  </p>
                </div>
              ))
            ) : (
              <p className="py-4 text-center text-xs text-neutral-400 dark:text-[#6e7681] col-span-2">
                No conventional directory roles categorized.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right Sidebar: Tech Stack, Distribution & Observations */}
      <div className="space-y-6">
        {/* Languages Breakdown */}
        <div className="rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] p-5">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-[#f0f6fc] pb-3 border-b border-neutral-200 dark:border-[#30363d]">
            Languages
          </h3>

          {techStack.languages && techStack.languages.length > 0 ? (
            <div className="pt-3 space-y-3">
              {/* Progress bar */}
              <div className="w-full h-2 rounded-full overflow-hidden flex bg-neutral-100 dark:bg-[#21262d]">
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
                      <span className="font-medium text-neutral-800 dark:text-[#c9d1d9]">{l.name}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-neutral-500 dark:text-[#8b949e]">
                      <span>{l.percentage}%</span>
                      <span className="text-[11px] text-neutral-400 dark:text-[#6e7681]">({l.count} files)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-neutral-400">No language data</p>
          )}
        </div>

        {/* Tech Stack Modules */}
        <div className="rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] p-5">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-[#f0f6fc] pb-3 border-b border-neutral-200 dark:border-[#30363d]">
            Technologies & Frameworks
          </h3>

          <div className="pt-3 space-y-3">
            {/* Backend */}
            {techStack.backend?.length > 0 && (
              <div>
                <span className="text-[11px] font-semibold text-neutral-500 dark:text-[#8b949e] uppercase tracking-wider block mb-1.5">
                  Backend Runtime
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {techStack.backend.map(b => (
                    <span key={b.name} className="text-xs px-2 py-0.5 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-800 dark:text-[#c9d1d9] border border-neutral-200 dark:border-[#30363d]">
                      {b.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Frontend */}
            {techStack.frontend?.length > 0 && (
              <div>
                <span className="text-[11px] font-semibold text-neutral-500 dark:text-[#8b949e] uppercase tracking-wider block mb-1.5">
                  Frontend
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {techStack.frontend.map(f => (
                    <span key={f.name} className="text-xs px-2 py-0.5 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-800 dark:text-[#c9d1d9] border border-neutral-200 dark:border-[#30363d]">
                      {f.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Frameworks */}
            {frameworks && frameworks.length > 0 && (
              <div>
                <span className="text-[11px] font-semibold text-neutral-500 dark:text-[#8b949e] uppercase tracking-wider block mb-1.5">
                  Frameworks & Libraries
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {frameworks.map(f => (
                    <span key={f.name} className="text-xs px-2 py-0.5 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-800 dark:text-[#c9d1d9] border border-neutral-200 dark:border-[#30363d]">
                      {f.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* DevOps */}
            {techStack.devops?.length > 0 && (
              <div>
                <span className="text-[11px] font-semibold text-neutral-500 dark:text-[#8b949e] uppercase tracking-wider block mb-1.5">
                  DevOps & Containers
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {techStack.devops.map(d => (
                    <span key={d.name} className="text-xs px-2 py-0.5 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-800 dark:text-[#c9d1d9] border border-neutral-200 dark:border-[#30363d]">
                      {d.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(!techStack.backend?.length && !techStack.frontend?.length && !frameworks?.length && !techStack.devops?.length) && (
              <p className="text-xs text-neutral-400 italic">No external frameworks or servers detected.</p>
            )}
          </div>
        </div>

        {/* Engineering Observations */}
        <div className="rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] p-5">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-[#f0f6fc] pb-3 border-b border-neutral-200 dark:border-[#30363d]">
            Engineering Observations
          </h3>

          <div className="pt-3 space-y-2">
            {observations && observations.length > 0 ? (
              observations.map((obs, idx) => {
                const isPos = obs.status === 'positive';
                return (
                  <div key={idx} className="flex items-start gap-2 text-xs">
                    {isPos ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-[#3fb950] shrink-0 mt-0.5" />
                    ) : (
                      <Info className="w-3.5 h-3.5 text-neutral-400 dark:text-[#8b949e] shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="font-medium text-neutral-800 dark:text-[#c9d1d9]">{obs.title}</span>
                      <p className="text-[11px] text-neutral-500 dark:text-[#8b949e]">{obs.detail}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-neutral-400">No specific observations noted.</p>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
