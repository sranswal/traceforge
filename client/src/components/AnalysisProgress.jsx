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
    <div className="max-w-xl mx-auto my-12 p-5 rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-[#30363d]">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-[#58a6ff]" />
          <h3 className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-[#f0f6fc]">
            Analyzing Repository...
          </h3>
        </div>
        <span className="text-[11px] font-mono text-neutral-500 dark:text-[#8b949e]">
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
                  ? 'text-neutral-900 dark:text-[#f0f6fc] font-medium'
                  : isDone
                  ? 'text-neutral-500 dark:text-[#8b949e]'
                  : 'text-neutral-300 dark:text-[#484f58]'
              }`}
            >
              <div className="w-4 h-4 flex items-center justify-center shrink-0">
                {isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-[#3fb950]" />
                ) : isCurrent ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-[#58a6ff]" />
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-[#30363d]" />
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
