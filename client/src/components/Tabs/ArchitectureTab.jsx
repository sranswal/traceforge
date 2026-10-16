import React from 'react';
import { 
  Compass, 
  ArrowRight, 
  Layers, 
  Play, 
  Cpu, 
  Database, 
  Folder, 
  FileCode,
  ShieldCheck,
  Check
} from 'lucide-react';

export default function ArchitectureTab({ analysisData }) {
  const { architecture, structure, techStack } = analysisData;
  const { entryPoints, components, pattern, description } = architecture;

  // Group classified directories into architectural tiers
  const tiers = [
    {
      title: '1. Ingestion & Entry Layer',
      icon: Play,
      description: 'Handles execution invocation, CLI flags, or incoming HTTP routes',
      items: entryPoints.map(e => ({ name: e.path, role: e.type, detail: e.language }))
    },
    {
      title: '2. Domain & Application Logic',
      icon: Cpu,
      description: 'Core processing routines, business rules, and analysis logic',
      items: (structure.classifiedDirectories || [])
        .filter(d => ['core', 'backend', 'domain'].includes(d.category))
        .map(d => ({ name: d.path, role: d.role, detail: d.description }))
    },
    {
      title: '3. Data, Output & Utilities',
      icon: Database,
      description: 'Output formatters, data schemas, migrations, or shared utilities',
      items: (structure.classifiedDirectories || [])
        .filter(d => ['data', 'frontend', 'tooling', 'config'].includes(d.category))
        .map(d => ({ name: d.path, role: d.role, detail: d.description }))
    }
  ];

  return (
    <div className="space-y-6">
      {/* Pattern Profile Banner */}
      <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-violet-600 dark:text-cyan-400" />
              <span className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Inferred Architectural Style
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {pattern}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed">
              {description}
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-md bg-slate-100 dark:bg-[#151c2c] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#1f2a3f] font-mono">
              Type: {analysisData.projectType}
            </span>
          </div>
        </div>
      </div>

      {/* Visual Execution Flow Pipeline */}
      <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-5 shadow-xs">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 pb-3 border-b border-slate-200 dark:border-[#1f2a3f]">
          Component Relationship & Data Flow
        </h3>

        <div className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4 relative">
          {tiers.map((tier, idx) => {
            const TierIcon = tier.icon;
            return (
              <div 
                key={tier.title} 
                className="rounded-lg border border-slate-200 dark:border-[#1f2a3f] bg-slate-50 dark:bg-[#0b0f17] p-3.5 space-y-3 flex flex-col justify-between shadow-2xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-[#151c2c]">
                    <div className="flex items-center gap-2">
                      <TierIcon className="w-3.5 h-3.5 text-violet-600 dark:text-cyan-400" />
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {tier.title}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                    {tier.description}
                  </p>

                  <div className="mt-3 space-y-1.5">
                    {tier.items && tier.items.length > 0 ? (
                      tier.items.map((item) => (
                        <div 
                          key={item.name}
                          className="p-2 rounded-md bg-white dark:bg-[#101624] border border-slate-200 dark:border-[#1f2a3f] text-xs space-y-0.5 shadow-2xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-medium text-slate-800 dark:text-slate-200 truncate text-[11px]">
                              {item.name}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#151c2c] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#1f2a3f]">
                              {item.detail || item.role}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 italic py-2">
                        No distinct components classified in this tier.
                      </p>
                    )}
                  </div>
                </div>

                {idx < 2 && (
                  <div className="hidden md:flex justify-end pt-2 text-slate-400 dark:text-slate-500">
                    <span className="text-[10px] font-mono flex items-center gap-1">
                      flows into <ArrowRight className="w-3 h-3 text-violet-500 dark:text-cyan-400" />
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Architectural Component Responsibilities Table */}
      <div className="rounded-xl border border-slate-200 dark:border-[#1f2a3f] bg-white dark:bg-[#101624] p-5 shadow-xs">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 pb-3 border-b border-slate-200 dark:border-[#1f2a3f]">
          Architectural Responsibilities
        </h3>

        <div className="pt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#151c2c] text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pr-4 font-semibold">Layer / Domain</th>
                <th className="py-2.5 pr-4 font-semibold">Identified Path</th>
                <th className="py-2.5 pr-4 font-semibold">Role</th>
                <th className="py-2.5 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#151c2c]">
              {(structure.classifiedDirectories || []).map((dir) => (
                <tr key={dir.path} className="hover:bg-slate-50 dark:hover:bg-[#151c2c]/50 transition-colors">
                  <td className="py-2.5 pr-4 font-mono font-medium text-slate-800 dark:text-slate-200">
                    {dir.name}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-violet-600 dark:text-cyan-400">
                    {dir.path}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#151c2c] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#1f2a3f] text-[11px]">
                      {dir.role}
                    </span>
                  </td>
                  <td className="py-2.5 text-slate-600 dark:text-slate-400">
                    {dir.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
