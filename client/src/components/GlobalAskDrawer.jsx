import React, { useState } from 'react';
import {
  MessageSquare,
  X,
  Send,
  Loader2,
  Trash2,
  Sparkles,
  Database,
  ArrowRight,
  Layers,
  ChevronDown,
  Info
} from 'lucide-react';
import MarkdownMessageRenderer from './Common/MarkdownMessageRenderer';

export default function GlobalAskDrawer({
  isOpen,
  onClose,
  currentRepo,
  currentBranch,
  currentProvider = 'GitHub',
  activeContext,
  qaHistory = [],
  isAsking = false,
  qaError = null,
  onAskQuestion,
  onClearHistory
}) {
  const [query, setQuery] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!query.trim() || isAsking) return;
    onAskQuestion(query.trim(), activeContext?.entity || null);
    setQuery('');
  };

  const contextLabel = activeContext?.title
    ? `${activeContext.type ? activeContext.type.toUpperCase() + ': ' : ''}${activeContext.title}`
    : currentRepo
      ? `Repository: ${currentRepo} (${currentBranch || 'main'})`
      : 'No repository loaded';

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[480px] z-50 bg-white dark:bg-[#0c111a] border-l border-slate-200 dark:border-[#1f2a3f] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-[#1f2a3f] flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-[#101624]/80">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-violet-600 text-white shadow-xs">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Ask TraceForge</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-cyan-300 border border-violet-200 dark:border-violet-900/60">
                Global Context
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Context-aware Q&A grounded in source AST and FalkorDB graph memory
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {qaHistory.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-[#18233a] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title="Clear Q&A History"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-[#18233a] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            title="Close Drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active Context Banner */}
      <div className="px-4 py-2 border-b border-slate-100 dark:border-[#1a2336] bg-violet-50/40 dark:bg-violet-950/20 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] uppercase font-mono font-semibold text-violet-700 dark:text-cyan-400 shrink-0">
            Active Context:
          </span>
          <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200 truncate" title={contextLabel}>
            {contextLabel}
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-400 shrink-0">
          {currentProvider}
        </span>
      </div>

      {/* Q&A Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {qaHistory.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center text-slate-400 dark:text-slate-500 space-y-3 px-6">
            <Sparkles className="w-8 h-8 text-violet-400" />
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Ask anything about the current repository, graph node, PR, or investigation.
            </p>
            <div className="text-[11px] space-y-1.5 text-left w-full pt-2">
              <span className="font-mono uppercase text-[10px] text-slate-400 block">Suggested queries:</span>
              <button
                type="button"
                onClick={() => setQuery(`What are the key execution entry points and dependencies in this codebase?`)}
                className="w-full text-left p-2 rounded-lg bg-slate-50 dark:bg-[#111726] border border-slate-200 dark:border-[#1f2a3f] hover:border-violet-400 text-slate-700 dark:text-slate-300 transition-colors"
              >
                "What are the key execution entry points and dependencies in this codebase?"
              </button>
              <button
                type="button"
                onClick={() => setQuery(`Are there any recorded historical bugs or architectural decisions touching this service?`)}
                className="w-full text-left p-2 rounded-lg bg-slate-50 dark:bg-[#111726] border border-slate-200 dark:border-[#1f2a3f] hover:border-violet-400 text-slate-700 dark:text-slate-300 transition-colors"
              >
                "Are there any recorded historical bugs or architectural decisions touching this service?"
              </button>
            </div>
          </div>
        ) : (
          qaHistory.map((item, idx) => (
            <div key={idx} className="space-y-2.5 text-xs">
              {/* Question */}
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-violet-600 text-white p-3 shadow-xs">
                  <p className="font-medium">{item.question}</p>
                  {item.focusEntity && (
                    <span className="text-[10px] font-mono opacity-80 block mt-1">
                      focus: {item.focusEntity.title || item.focusEntity.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Answer */}
              <div className="flex justify-start">
                <div className="max-w-[95%] rounded-2xl rounded-tl-sm bg-slate-100 dark:bg-[#111726] border border-slate-200 dark:border-[#1f2a3f] p-3.5 space-y-2 text-slate-800 dark:text-slate-200 shadow-xs">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 border-b border-slate-200 dark:border-[#1f2a3f] pb-1.5">
                    <span className="flex items-center gap-1 text-violet-600 dark:text-cyan-400">
                      <Sparkles className="w-3 h-3" />
                      <span>{item.model || 'Gemini'}</span>
                    </span>
                    <span>{item.timestamp || 'Just now'}</span>
                  </div>

                  <MarkdownMessageRenderer content={item.answer} />

                  {item.graphMemory && (
                    <div className="pt-2 border-t border-slate-200 dark:border-[#1f2a3f] text-[11px] space-y-1">
                      <span className="font-mono text-[10px] font-semibold text-teal-600 dark:text-teal-400 uppercase flex items-center gap-1">
                        <Database className="w-3 h-3" />
                        <span>FalkorDB Evidence Grounding</span>
                      </span>
                      <p className="text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                        Cited {item.graphMemory.entitiesCount || 'verified'} entities and relationships from graph memory.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}

        {isAsking && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-slate-100 dark:bg-[#111726] border border-slate-200 dark:border-[#1f2a3f] p-3 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-violet-600 dark:text-cyan-400" />
              <span>Querying FalkorDB graph memory & synthesizing response...</span>
            </div>
          </div>
        )}

        {qaError && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/60 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Unable to complete query</p>
              <p className="mt-0.5">{qaError}</p>
            </div>
          </div>
        )}
      </div>

      {/* Input Box */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624]">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={activeContext?.title ? `Ask about ${activeContext.title}...` : `Ask about ${currentRepo || 'codebase'}...`}
            disabled={isAsking}
            className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-[#222e44] bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500 shadow-2xs"
          />
          <button
            type="submit"
            disabled={!query.trim() || isAsking}
            className="p-2 rounded-lg bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white disabled:opacity-40 transition-colors shadow-xs cursor-pointer"
            title="Send query"
          >
            {isAsking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}
