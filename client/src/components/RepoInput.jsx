import React, { useState } from 'react';
import {
  Search,
  Loader2,
  AlertCircle,
  CornerDownLeft,
  ShieldAlert,
  Database,
  GitBranch,
  ArrowRight,
  Flame,
  CheckCircle2,
  Sparkles
} from 'lucide-react';

const PRESET_REPOSITORIES = [
  { label: 'spf13/cobra', tag: 'Go CLI · Primary Demo', primary: true },
  { label: 'expressjs/express', tag: 'Node.js API' },
  { label: 'fastapi/fastapi', tag: 'Python Framework' },
  { label: 'vitejs/vite', tag: 'Frontend Tooling' }
];

export default function RepoInput({ onAnalyze, onExploreSample, isLoading, error }) {
  const [url, setUrl] = useState('https://github.com/spf13/cobra');
  const [isLaunchingSample, setIsLaunchingSample] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url.trim() && !isLoading) {
      onAnalyze(url.trim());
    }
  };

  const handleSelectPreset = (repoName) => {
    const fullUrl = `https://github.com/${repoName}`;
    setUrl(fullUrl);
    onAnalyze(fullUrl);
  };

  const handleLaunchSample = async () => {
    if (isLoading || isLaunchingSample) return;
    setIsLaunchingSample(true);
    try {
      if (onExploreSample) {
        await onExploreSample();
      }
    } finally {
      setIsLaunchingSample(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 sm:py-12 px-4 space-y-8 animate-in fade-in duration-300">
      {/* Brand & Mission Header */}
      <div className="text-center space-y-3">
        <div className="flex justify-center pb-1">
          <img
            src="/icon.png"
            alt="TraceForge"
            className="w-24 sm:w-28 h-auto object-contain"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = '/icon.png';
            }}
          />
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-100 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800/40 text-violet-700 dark:text-violet-300 text-xs font-mono">
          <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
          <span>Graph-Native Incident Investigation Engine</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
          TraceForge
        </h1>

        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Trace code paths, refactor commits, and historical failure memories in FalkorDB to isolate the root cause of production regressions.
        </p>
      </div>

      {/* Two-Column Gateway: Connect Custom Repo vs Explore Sample Incident */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column (7 cols): Connect Repository */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-6 flex flex-col justify-between shadow-md dark:shadow-xl transition-colors">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Connect Repository
                </h2>
              </div>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                GitHub / Git URL
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Index AST symbols, call hierarchies, and commit history into FalkorDB to enable graph-grounded incident analysis.
            </p>

            {/* Recommended Hackathon Demo Banner */}
            <div className="p-3.5 rounded-lg bg-violet-50/80 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] font-bold text-violet-800 dark:text-violet-300 uppercase tracking-wide">
                    Primary Hackathon Demo Repository
                  </span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  <strong className="text-slate-900 dark:text-slate-100">spf13/cobra</strong> — Real public GitHub Go repository with live issues, PRs, AST symbols, and FalkorDB graph memory.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleSelectPreset('spf13/cobra')}
                disabled={isLoading || isLaunchingSample}
                className="px-3.5 py-1.5 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shrink-0 transition-colors shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <span>Analyze Cobra (Demo)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Input Box */}
            <div className="rounded-lg border border-slate-300 dark:border-[#26354f] bg-slate-50 dark:bg-[#0c101a] p-1.5 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500 transition-all">
              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <div className="pl-2 text-slate-400 dark:text-slate-500">
                  <Search className="w-4 h-4" />
                </div>

                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste GitHub / GitLab / Bitbucket URL (e.g. https://github.com/spf13/cobra)"
                  disabled={isLoading || isLaunchingSample}
                  className="flex-1 bg-transparent px-2 py-1.5 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none disabled:opacity-50 font-mono"
                />

                <button
                  type="submit"
                  disabled={isLoading || isLaunchingSample || !url.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 cursor-pointer"
                >
                  {isLoading && !isLaunchingSample ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Indexing...</span>
                    </>
                  ) : (
                    <>
                      <span>Connect</span>
                      <CornerDownLeft className="w-3 h-3 text-violet-200" />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500 dark:text-rose-400" />
                <div>
                  <span className="font-semibold">Connection Failed: </span>
                  <span>{error}</span>
                </div>
              </div>
            )}

            {/* Quick Reference Presets */}
            <div className="space-y-2 pt-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Reference Repositories:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {PRESET_REPOSITORIES.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleSelectPreset(preset.label)}
                    disabled={isLoading || isLaunchingSample}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs transition-colors disabled:opacity-50 cursor-pointer ${
                      preset.primary
                        ? 'border-violet-300 dark:border-violet-700 bg-violet-50 hover:bg-violet-100/80 dark:bg-violet-950/40 dark:hover:bg-violet-900/50 text-violet-900 dark:text-violet-200 font-semibold'
                        : 'border-slate-200 dark:border-[#23314b] bg-slate-100 hover:bg-slate-200/80 dark:bg-[#141c2e] dark:hover:bg-[#1a253c] text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <span className="font-mono text-[11px]">
                      {preset.label}
                    </span>
                    <span className="text-[10px] px-1 py-0.2 rounded bg-white dark:bg-[#0d1320] border border-slate-200 dark:border-[#1e2a40] text-slate-500 dark:text-slate-400">
                      {preset.tag}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200 dark:border-[#1c263b] mt-6 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>FalkorDB Ingestion Engine Active</span>
            </span>
            <span className="font-mono text-[11px] text-slate-400">v1.0.0</span>
          </div>
        </div>

        {/* Right Column (5 cols): Featured Sample Incident */}
        <div className="lg:col-span-5 rounded-xl border border-violet-200 dark:border-violet-800/50 bg-gradient-to-b from-violet-50/70 via-white to-slate-50 dark:from-[#151329] dark:via-[#101424] dark:to-[#0d111d] p-6 flex flex-col justify-between shadow-md dark:shadow-xl relative overflow-hidden transition-colors">
          {/* Subtle Accent Glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-violet-600/10 rounded-full blur-2xl pointer-events-none" />

          <div className="space-y-4 relative z-10">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/40 text-[11px] font-mono font-medium">
                <Flame className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                Controlled Graph Ablation Demo
              </span>
              <span className="text-[11px] font-mono text-violet-700 dark:text-violet-300 font-semibold">
                Synthetic Fixture
              </span>
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <span>Explore Synthetic Incident</span>
              </h2>
              <div className="font-mono text-xs text-violet-700 dark:text-violet-300 mt-0.5">
                acme/payment-gateway
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Controlled benchmark fixture designed for demonstrating graph reasoning vs lexical keyword baseline ablation:
            </p>

            <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                <span><strong className="text-slate-900 dark:text-slate-100">Entrypoint:</strong> <code>handlePaymentRequest</code> in <code>pay.js</code></span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <span><strong className="text-slate-900 dark:text-slate-100">Decoy Trap:</strong> <code>checkRateLimit</code> (keyword decoy)</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
                <span><strong className="text-slate-900 dark:text-slate-100">Suspected Target:</strong> <code>acquireTokenLock</code> in <code>tokenBucket.js</code></span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span><strong className="text-slate-900 dark:text-slate-100">FalkorDB Memory:</strong> Historical lock starvation bug & fix recall</span>
              </li>
            </ul>
          </div>

          <div className="pt-6 relative z-10">
            <button
              type="button"
              onClick={handleLaunchSample}
              disabled={isLoading || isLaunchingSample}
              className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-violet-950/20 dark:shadow-violet-950/50 transition-all cursor-pointer disabled:opacity-50"
            >
              {isLaunchingSample ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Seeding Scenario in FalkorDB...</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4 text-violet-200" />
                  <span>Launch Synthetic Ablation Fixture</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 mt-2">
              Controlled ablation benchmark · No GitHub token required
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

