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
  { label: 'spf13/cobra', tag: 'Go CLI' },
  { label: 'expressjs/express', tag: 'Node.js API' },
  { label: 'fastapi/fastapi', tag: 'Python Framework' },
  { label: 'vitejs/vite', tag: 'Frontend Tooling' }
];

export default function RepoInput({ onAnalyze, onExploreSample, isLoading, error }) {
  const [url, setUrl] = useState('');
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

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-950/50 border border-violet-800/40 text-violet-300 text-xs font-mono">
          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
          <span>Graph-Native Incident Investigation Engine</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-100">
          TraceForge
        </h1>

        <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Trace code paths, refactor commits, and historical failure memories in FalkorDB to isolate the root cause of production regressions.
        </p>
      </div>

      {/* Two-Column Gateway: Connect Custom Repo vs Explore Sample Incident */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column (7 cols): Connect Repository */}
        <div className="lg:col-span-7 rounded-xl border border-[#1f2a3f] bg-[#101624] p-6 flex flex-col justify-between shadow-xl">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-violet-400" />
                <h2 className="text-base font-semibold text-slate-100">
                  Connect Repository
                </h2>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                GitHub / Git URL
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Index AST symbols, call hierarchies, and commit history into FalkorDB to enable graph-grounded incident analysis.
            </p>

            {/* Input Box */}
            <div className="rounded-lg border border-[#26354f] bg-[#0c101a] p-1.5 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500 transition-all">
              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <div className="pl-2 text-slate-400">
                  <Search className="w-4 h-4" />
                </div>

                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste GitHub URL (e.g. https://github.com/spf13/cobra)"
                  disabled={isLoading || isLaunchingSample}
                  className="flex-1 bg-transparent px-2 py-1.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50 font-mono"
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
              <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/40 text-xs text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <div>
                  <span className="font-semibold">Connection Failed: </span>
                  <span>{error}</span>
                </div>
              </div>
            )}

            {/* Quick Reference Presets */}
            <div className="space-y-2 pt-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block">
                Reference Repositories:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {PRESET_REPOSITORIES.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleSelectPreset(preset.label)}
                    disabled={isLoading || isLaunchingSample}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#23314b] bg-[#141c2e] hover:bg-[#1a253c] text-xs transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <span className="font-mono text-slate-200 font-medium text-[11px]">
                      {preset.label}
                    </span>
                    <span className="text-[10px] text-slate-400 px-1 py-0.2 rounded bg-[#0d1320] border border-[#1e2a40]">
                      {preset.tag}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-[#1c263b] mt-6 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>FalkorDB Ingestion Engine Active</span>
            </span>
            <span className="font-mono text-[11px] text-slate-400">v1.0.0</span>
          </div>
        </div>

        {/* Right Column (5 cols): Featured Sample Incident */}
        <div className="lg:col-span-5 rounded-xl border border-violet-800/50 bg-gradient-to-b from-[#151329] via-[#101424] to-[#0d111d] p-6 flex flex-col justify-between shadow-xl relative overflow-hidden">
          {/* Subtle Accent Glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-violet-600/10 rounded-full blur-2xl pointer-events-none" />

          <div className="space-y-4 relative z-10">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-950/60 text-amber-300 border border-amber-800/40 text-[11px] font-mono font-medium">
                <Flame className="w-3 h-3 text-amber-400" />
                Live Demo Fixture
              </span>
              <span className="text-[11px] font-mono text-violet-300 font-semibold">
                One-Click Launch
              </span>
            </div>

            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Explore Sample Incident</span>
              </h2>
              <div className="font-mono text-xs text-violet-300 mt-0.5">
                acme/payment-gateway
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Evaluate TraceForge immediately on the canonical high-concurrency regression:
            </p>

            <ul className="space-y-2 text-xs text-slate-300">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
                <span><strong className="text-slate-100">Entrypoint:</strong> <code>handlePaymentRequest</code> in <code>pay.js</code></span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span><strong className="text-slate-100">Decoy Trap:</strong> <code>checkRateLimit</code> (keyword decoy)</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                <span><strong className="text-slate-100">Root Cause:</strong> <code>acquireTokenLock</code> in <code>tokenBucket.js</code></span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong className="text-slate-100">FalkorDB Memory:</strong> Historical lock starvation bug & fix recall</span>
              </li>
            </ul>
          </div>

          <div className="pt-6 relative z-10">
            <button
              type="button"
              onClick={handleLaunchSample}
              disabled={isLoading || isLaunchingSample}
              className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-violet-950/50 transition-all cursor-pointer disabled:opacity-50"
            >
              {isLaunchingSample ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Seeding Scenario in FalkorDB...</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4 text-violet-200" />
                  <span>Launch Sample Investigation</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            <p className="text-[11px] text-center text-slate-400 mt-2">
              Instant evaluation · No GitHub token required
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

