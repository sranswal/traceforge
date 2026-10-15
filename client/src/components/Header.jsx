import React from 'react';
import { Sun, Moon, Search, Terminal, Database, Activity, ShieldAlert } from 'lucide-react';

export default function Header({
  theme,
  onToggleTheme,
  onNewSearch,
  currentRepo,
  graphHealth,
  isLoading
}) {
  const isSample = currentRepo === 'acme/payment-gateway';
  const isGraphConnected = graphHealth?.connected ?? true;

  return (
    <header className="border-b border-[#1f2a3f] bg-[#0c111a] sticky top-0 z-50 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Brand: TraceForge */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onNewSearch}
            className="flex items-center gap-2.5 hover:opacity-90 transition-opacity focus:outline-none cursor-pointer"
            title="TraceForge Home"
          >
            <img
              src="/icon.png"
              alt="TraceForge"
              className="h-7 sm:h-8 w-auto object-contain shrink-0"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/icon.png';
              }}
            />
            <span className="font-bold text-sm sm:text-base tracking-tight text-slate-100">
              TraceForge
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-violet-950/60 text-violet-300 border border-violet-800/40">
              <Activity className="w-2.5 h-2.5 text-violet-400" />
              Incident Command
            </span>
          </button>
        </div>

        {/* Middle: Active Repository Scope & FalkorDB Readiness */}
        {currentRepo ? (
          <div className="hidden md:flex items-center gap-2.5 text-xs">
            {/* Repository Scope Pill */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#131a29] border border-[#23314b] text-slate-300">
              <Terminal className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono font-medium truncate max-w-[200px]">
                {currentRepo}
              </span>
              {isSample ? (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40">
                  Sample
                </span>
              ) : (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-teal-950/60 text-teal-300 border border-teal-800/40">
                  Indexed
                </span>
              )}
            </div>

            {/* FalkorDB Graph Readiness Indicator */}
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] font-mono ${isGraphConnected
                  ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                  : 'bg-amber-950/30 border-amber-800/40 text-amber-300'
                }`}
              title={isGraphConnected ? 'FalkorDB Graph Live & Indexed' : 'FalkorDB Health Checking'}
            >
              <span
                className={`w-2 h-2 rounded-full ${isGraphConnected ? 'bg-emerald-400 shadow-[0_0_6px_#10b981]' : 'bg-amber-400'
                  }`}
              />
              <span>FalkorDB Ready</span>
            </div>

            <button
              type="button"
              onClick={onNewSearch}
              className="text-[11px] text-violet-400 hover:text-violet-300 hover:underline cursor-pointer ml-0.5"
            >
              switch
            </button>
          </div>
        ) : (
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-violet-400" />
            <span className="font-mono text-slate-300">Awaiting Repository Connection</span>
          </div>
        )}

        {/* Right Controls: Connect/New Repo, Theme Toggle, GitHub */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {currentRepo && (
            <button
              type="button"
              onClick={onNewSearch}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-[#27354d] bg-[#141b29] hover:bg-[#1a2438] text-slate-200 transition-colors cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Connect Repo</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleTheme}
            className="p-1.5 rounded border border-[#27354d] hover:bg-[#182133] text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5" />
            ) : (
              <Moon className="w-3.5 h-3.5" />
            )}
          </button>

          <a
            href="https://github.com/sranswal/traceforge"
            target="_blank"
            rel="noreferrer"
            className="p-1.5 rounded border border-[#27354d] hover:bg-[#182133] text-slate-400 hover:text-slate-100 transition-colors"
            title="GitHub Repository"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}

