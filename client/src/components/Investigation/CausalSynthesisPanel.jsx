import React, { useState } from 'react';
import {
  Layers,
  AlertTriangle,
  GitCommit,
  History,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Info,
  CheckCircle2,
  FileCode,
  Compass
} from 'lucide-react';
import { adaptCausalSynthesis } from '../../utils/evidenceAdapter';

export default function CausalSynthesisPanel({ investigation }) {
  const [isRelationshipsExpanded, setIsRelationshipsExpanded] = useState(false);
  const data = adaptCausalSynthesis(investigation);

  if (!data.isValid) {
    return (
      <div className="p-4 rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-slate-50 dark:bg-[#0c101a] text-xs text-slate-500 dark:text-slate-400">
        No causal synthesis evidence available for this investigation.
      </div>
    );
  }

  const {
    observedExecutionPath,
    suspectedFailurePoint,
    supportingGraphRelationships,
    suspectedIntroducingCommit,
    historicalPrecedent,
    limitationsAndVerification
  } = data;

  const isHighConfidence = suspectedFailurePoint.confidence === 'HIGH';
  const isMediumConfidence = suspectedFailurePoint.confidence === 'MEDIUM';

  return (
    <div className="space-y-4 text-xs">
      {/* 1. Suspected Failure Point */}
      <div className={`p-4 rounded-xl border transition-colors ${
        suspectedFailurePoint.isSufficient
          ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
          : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-rose-200/60 dark:border-rose-900/40">
          <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
            <AlertTriangle className={`w-4 h-4 ${suspectedFailurePoint.isSufficient ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`} />
            <span>Suspected Failure Point</span>
          </div>
          <span className={`font-mono text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
            isHighConfidence
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/40'
              : isMediumConfidence
                ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/40'
                : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
          }`}>
            Confidence: {suspectedFailurePoint.confidence}
          </span>
        </div>

        <div className="pt-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <code className="px-2 py-0.5 rounded bg-white dark:bg-[#121826] border border-rose-200 dark:border-rose-900/60 font-mono font-bold text-rose-700 dark:text-rose-300 text-xs">
              {suspectedFailurePoint.symbolName}
            </code>
            <span className="text-slate-500 dark:text-slate-400 text-[11px] font-mono">
              in {suspectedFailurePoint.filePath}
            </span>
          </div>

          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
            {suspectedFailurePoint.confidenceExplanation}
          </p>

          {suspectedFailurePoint.reasons.length > 0 && (
            <div className="pt-1 space-y-1">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-slate-400 block font-semibold">
                Forensic Evidence:
              </span>
              <ul className="space-y-1">
                {suspectedFailurePoint.reasons.map((reason, idx) => (
                  <li key={idx} className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-slate-300">
                    <span className="text-rose-500 dark:text-rose-400 mt-0.5">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* 2. Observed Execution Path */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] space-y-3 transition-colors shadow-2xs">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-[#1b2537]">
          <Layers className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
            Observed Execution Path
          </h4>
          <span className="ml-auto font-mono text-[10px] text-slate-500 dark:text-slate-400">
            {observedExecutionPath.length} Verified {observedExecutionPath.length === 1 ? 'Step' : 'Steps'}
          </span>
        </div>

        <div className="space-y-2">
          {observedExecutionPath.map((step, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200/80 dark:border-[#1b2537] text-xs transition-colors"
            >
              <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/40 flex items-center justify-center font-mono font-bold text-[10px] shrink-0">
                {step.stepNumber}
              </span>

              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-200">
                      {step.symbolName || step.filePath}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800/40">
                      {step.relationshipLabel}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-teal-700 dark:text-teal-300 px-1.5 py-0.2 rounded bg-teal-50 dark:bg-[#121c2c] border border-teal-200 dark:border-[#1c2c44]">
                    {step.provenance}
                  </span>
                </div>

                <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                  {step.filePath} {step.lineRange ? `(${step.lineRange})` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Suspected Introducing Commit & Historical Precedent (2-Column Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Suspected Introducing Commit */}
        {suspectedIntroducingCommit && (
          <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 space-y-2 transition-colors">
            <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-amber-200/60 dark:border-amber-900/40">
              <div className="flex items-center gap-1.5 text-amber-900 dark:text-amber-200 font-semibold text-xs">
                <GitCommit className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Suspected Introducing Commit</span>
              </div>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60 font-bold">
                {suspectedIntroducingCommit.shortSha}
              </span>
            </div>
            <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed font-sans">
              "{suspectedIntroducingCommit.message}"
            </p>
            <div className="text-[10px] text-amber-800/90 dark:text-amber-400/90 font-mono">
              Modified: {suspectedIntroducingCommit.affectedFile || 'call path dependency'}
            </div>
          </div>
        )}

        {/* Historical Precedent */}
        {historicalPrecedent ? (
          <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 space-y-2 transition-colors">
            <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-emerald-200/60 dark:border-emerald-900/40">
              <div className="flex items-center gap-1.5 text-emerald-900 dark:text-emerald-200 font-semibold text-xs">
                <History className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Historical Precedent</span>
              </div>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60 font-bold">
                {historicalPrecedent.commitShortSha}
              </span>
            </div>
            <div className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
              <strong className="text-slate-900 dark:text-slate-100">{historicalPrecedent.title}: </strong>
              <span>{historicalPrecedent.fixSummary}</span>
            </div>
            <div className="text-[10px] text-emerald-800/90 dark:text-emerald-400/90 font-mono">
              Source: {historicalPrecedent.source}
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-slate-50 dark:bg-[#0c101a] space-y-1 text-slate-500 dark:text-slate-400">
            <div className="font-semibold text-xs flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              <span>Historical Precedent</span>
            </div>
            <p className="text-[11px]">No prior bug resolution recorded in institutional memory for this call path.</p>
          </div>
        )}
      </div>

      {/* 4. Supporting Graph Relationships (Expandable Drawer) */}
      <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] overflow-hidden transition-colors shadow-2xs">
        <button
          type="button"
          onClick={() => setIsRelationshipsExpanded(!isRelationshipsExpanded)}
          className="w-full p-3 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-[#151c2c] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
              Supporting Graph Relationships ({supportingGraphRelationships.length})
            </h4>
          </div>
          {isRelationshipsExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500" />
          )}
        </button>

        {isRelationshipsExpanded && (
          <div className="p-3 border-t border-slate-200 dark:border-[#1b2537] space-y-2 bg-slate-50/50 dark:bg-[#0a0e17]">
            {supportingGraphRelationships.map((rel) => (
              <div
                key={rel.id}
                className="p-2.5 rounded-lg border border-slate-200 dark:border-[#1d273a] bg-white dark:bg-[#101624] text-xs space-y-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-2 font-mono">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {rel.symbolName || rel.label}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800/40">
                      {rel.relationshipLabel}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-teal-700 dark:text-teal-300">
                    {rel.provenance}
                  </span>
                </div>

                {rel.details && (
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    {rel.details}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-slate-400 pt-0.5">
                  {rel.filePath && <span>Path: {rel.filePath}</span>}
                  {rel.lineRange && <span>Range: {rel.lineRange}</span>}
                  {rel.commitSha && <span>Commit: {rel.commitSha.slice(0, 7)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Limitations & Verification Status */}
      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-slate-50 dark:bg-[#0b0f17] text-slate-600 dark:text-slate-400 space-y-1.5 transition-colors">
        <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-semibold text-xs">
          <Info className="w-3.5 h-3.5 text-violet-500" />
          <span>Verification Status & Investigation Boundary</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          <strong className="text-slate-900 dark:text-slate-100">{limitationsAndVerification.status} </strong>
          {limitationsAndVerification.details}
        </p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 pt-0.5 border-t border-slate-200 dark:border-[#1b2537]">
          {limitationsAndVerification.boundary} {limitationsAndVerification.untestedSimulationNote}
        </p>
      </div>
    </div>
  );
}
