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
    <div className={`w-full bg-white dark:bg-[#101624] border border-slate-200 dark:border-[#1f2a3f] rounded-lg p-1.5 sm:p-2 shadow-2xs transition-colors ${className}`}>
      <div className="flex items-center justify-between gap-1 sm:gap-2 overflow-x-auto">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isActive = currentStep === step.id;
          const isCompleted = completedSteps.includes(step.id);

          return (
            <React.Fragment key={step.id}>
              <button
                type="button"
                onClick={() => onSelectStep && onSelectStep(step.id)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-all text-left shrink-0 cursor-pointer focus:outline-none ${
                  isActive
                    ? 'bg-violet-50 dark:bg-violet-950/60 text-violet-900 dark:text-violet-200 border border-violet-300 dark:border-violet-700/60 shadow-2xs'
                    : isCompleted
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/40 hover:bg-emerald-100/60'
                    : 'bg-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-[#161f30]'
                }`}
                title={`Jump to ${step.title}: ${step.subtitle}`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-mono font-semibold ${
                    isActive
                      ? 'bg-violet-600 text-white'
                      : isCompleted
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-500 dark:bg-[#1c2436] dark:text-slate-400'
                  }`}
                >
                  {isCompleted && !isActive ? (
                    <Check className="w-3 h-3 stroke-[2.5]" />
                  ) : (
                    <Icon className="w-3 h-3" />
                  )}
                </div>

                <div className="hidden sm:block">
                  <div
                    className={`text-xs font-semibold leading-tight ${
                      isActive
                        ? 'text-violet-900 dark:text-white font-bold'
                        : isCompleted
                        ? 'text-emerald-900 dark:text-emerald-300'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {step.title}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal leading-tight">
                    {step.subtitle}
                  </div>
                </div>
              </button>

              {idx < STEPS.length - 1 && (
                <div className="hidden md:block flex-1 max-w-6 h-px bg-slate-200 dark:bg-[#1f2a3f]" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
