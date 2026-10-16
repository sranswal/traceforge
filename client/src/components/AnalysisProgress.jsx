import React, { useEffect, useState } from 'react';
import { GitBranch, Cpu, FolderTree, Compass, CheckCircle2, Loader2 } from 'lucide-react';

const STEPS = [
  { label: 'Fetching repository tree & manifests from GitHub' },
  { label: 'Analyzing technology stack and language distribution' },
  { label: 'Classifying directory roles and structural hierarchy' },
  { label: 'Mapping execution entry points and architecture pattern' }
];

export default function AnalysisProgress() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setActiveStep(1), 500);
    const t2 = setTimeout(() => setActiveStep(2), 1200);
    const t3 = setTimeout(() => setActiveStep(3), 2000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return (
    <div className="max-w-xl mx-auto my-12 p-5 rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] space-y-4 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#1f2a3f]">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-violet-600 dark:text-cyan-400" />
          <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100">
            Analyzing Repository Architecture & Graph...
          </h3>
        </div>
        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
          Step {Math.min(activeStep + 1, 4)} of 4
        </span>
      </div>

      <div className="space-y-2.5">
        {STEPS.map((step, idx) => {
          const isDone = idx < activeStep;
          const isCurrent = idx === activeStep;

          return (
            <div
              key={step.label}
              className={`flex items-center gap-2.5 text-xs transition-colors ${
                isCurrent
                  ? 'text-slate-900 dark:text-slate-100 font-medium'
                  : isDone
                  ? 'text-slate-500 dark:text-slate-400'
                  : 'text-slate-300 dark:text-slate-600'
              }`}
            >
              <div className="w-4 h-4 flex items-center justify-center shrink-0">
                {isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : isCurrent ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-600 dark:text-cyan-400" />
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                )}
              </div>
              <span className="truncate">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
