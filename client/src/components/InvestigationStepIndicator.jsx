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
    <div className={`w-full bg-[#111622] border border-[#1f2a3f] rounded-lg p-2.5 sm:p-3 ${className}`}>
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
                    ? 'bg-violet-950/60 border border-violet-500/60 text-white shadow-sm shadow-violet-950/50'
                    : isCompleted
                    ? 'bg-emerald-950/20 border border-emerald-800/40 text-emerald-300 hover:bg-emerald-950/40'
                    : 'bg-[#161f30]/60 border border-[#232f46]/60 text-slate-400 hover:text-slate-200 hover:bg-[#1a253a]'
                }`}
                title={`Jump to ${step.title}: ${step.subtitle}`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-mono font-semibold ${
                    isActive
                      ? 'bg-violet-600 text-white ring-2 ring-violet-400/40'
                      : isCompleted
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#222d42] text-slate-300'
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
                        ? 'text-violet-200'
                        : isCompleted
                        ? 'text-emerald-300'
                        : 'text-slate-300'
                    }`}
                  >
                    {step.title}
                  </div>
                  <div className="text-[11px] text-slate-400 font-normal leading-tight">
                    {step.subtitle}
                  </div>
                </div>
              </button>

              {idx < STEPS.length - 1 && (
                <div className="hidden md:block flex-1 max-w-8 h-px bg-[#26334d]" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
