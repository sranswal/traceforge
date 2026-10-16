import React from 'react';
import { AlertCircle, GitGraph, ShieldCheck, Database, Check } from 'lucide-react';

const STEPS = [
  {
    id: 'incident',
    title: '1. Incident',
    subtitle: 'Intake & Scope',
    icon: AlertCircle,
  },
  {
    id: 'diagnosis',
    title: '2. Diagnosis',
    subtitle: 'Causal Graph',
    icon: GitGraph,
  },
  {
    id: 'recovery',
    title: '3. Recovery',
    subtitle: 'Safe Simulation',
    icon: ShieldCheck,
  },
  {
    id: 'memory',
    title: '4. Memory',
    subtitle: 'Resolution & Recall',
    icon: Database,
  },
];

export default function InvestigationStepIndicator({
  currentStep = 'incident',
  onSelectStep,
  completedSteps = [],
  className = ''
}) {
  return (
    <div className={`w-full bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#1f2a3f] rounded-lg p-2.5 sm:p-3 shadow-sm dark:shadow-none transition-colors ${className}`}>
      <div className="flex items-center justify-between gap-2 overflow-x-auto">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isActive = currentStep === step.id;
          const isCompleted = completedSteps.includes(step.id);

          return (
            <React.Fragment key={step.id}>
              <button
                type="button"
                onClick={() => onSelectStep && onSelectStep(step.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md transition-all text-left shrink-0 cursor-pointer focus:outline-none ${
                  isActive
                    ? 'bg-violet-50 border border-violet-400/80 text-violet-900 shadow-sm dark:bg-violet-950/60 dark:border-violet-500/60 dark:text-white dark:shadow-violet-950/50'
                    : isCompleted
                    ? 'bg-emerald-50 border border-emerald-300/80 text-emerald-800 hover:bg-emerald-100/70 dark:bg-emerald-950/20 dark:border-emerald-800/40 dark:text-emerald-300 dark:hover:bg-emerald-950/40'
                    : 'bg-slate-100/70 border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:bg-[#161f30]/60 dark:border-[#232f46]/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-[#1a253a]'
                }`}
                title={`Jump to ${step.title}: ${step.subtitle}`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-mono font-semibold ${
                    isActive
                      ? 'bg-violet-600 text-white ring-2 ring-violet-400/40'
                      : isCompleted
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-700 dark:bg-[#222d42] dark:text-slate-300'
                  }`}
                >
                  {isCompleted && !isActive ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                </div>

                <div className="hidden sm:block">
                  <div
                    className={`text-xs font-semibold leading-tight ${
                      isActive
                        ? 'text-violet-800 dark:text-violet-200'
                        : isCompleted
                        ? 'text-emerald-800 dark:text-emerald-300'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {step.title}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal leading-tight">
                    {step.subtitle}
                  </div>
                </div>
              </button>

              {idx < STEPS.length - 1 && (
                <div className="hidden md:block flex-1 max-w-8 h-px bg-slate-200 dark:bg-[#26334d]" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
