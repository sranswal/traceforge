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
      <div className="rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-blue-600 dark:text-[#58a6ff]" />
              <span className="text-xs font-mono uppercase tracking-wider text-neutral-500 dark:text-[#8b949e]">
                Inferred Architectural Style
              </span>
            </div>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-[#f0f6fc]">
              {pattern}
            </h2>
            <p className="text-xs sm:text-sm text-neutral-600 dark:text-[#8b949e] max-w-3xl leading-relaxed">
              {description}
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-700 dark:text-[#c9d1d9] border border-neutral-200 dark:border-[#30363d] font-mono">
              Type: {analysisData.projectType}
            </span>
          </div>
        </div>
      </div>

      {/* Visual Execution Flow Pipeline */}
      <div className="rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] p-5">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-[#f0f6fc] pb-3 border-b border-neutral-200 dark:border-[#30363d]">
          Component Relationship & Data Flow
        </h3>

        <div className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4 relative">
          {tiers.map((tier, idx) => {
            const TierIcon = tier.icon;
            return (
              <div 
                key={tier.title} 
                className="rounded border border-neutral-200 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] p-3.5 space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-neutral-200 dark:border-[#21262d]">
                    <div className="flex items-center gap-2">
                      <TierIcon className="w-3.5 h-3.5 text-blue-600 dark:text-[#58a6ff]" />
                      <span className="text-xs font-semibold text-neutral-900 dark:text-[#f0f6fc]">
                        {tier.title}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-[#8b949e] mt-1.5 leading-relaxed">
                    {tier.description}
                  </p>

                  <div className="mt-3 space-y-1.5">
                    {tier.items && tier.items.length > 0 ? (
                      tier.items.map((item) => (
                        <div 
                          key={item.name}
                          className="p-2 rounded bg-white dark:bg-[#161b22] border border-neutral-200 dark:border-[#30363d] text-xs space-y-0.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-medium text-neutral-800 dark:text-[#79c0ff] truncate text-[11px]">
                              {item.name}
                            </span>
                            <span className="text-[10px] px-1 py-0.2 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-600 dark:text-[#8b949e]">
                              {item.detail || item.role}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-neutral-400 dark:text-[#6e7681] italic py-2">
                        No distinct components classified in this tier.
                      </p>
                    )}
                  </div>
                </div>

                {idx < 2 && (
                  <div className="hidden md:flex justify-end pt-2 text-neutral-400 dark:text-[#6e7681]">
                    <span className="text-[10px] font-mono flex items-center gap-1">
                      flows into <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Architectural Component Responsibilities Table */}
      <div className="rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] p-5">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-[#f0f6fc] pb-3 border-b border-neutral-200 dark:border-[#30363d]">
          Architectural Responsibilities
        </h3>

        <div className="pt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-[#21262d] text-neutral-500 dark:text-[#8b949e]">
                <th className="py-2.5 pr-4 font-semibold">Layer / Domain</th>
                <th className="py-2.5 pr-4 font-semibold">Identified Path</th>
                <th className="py-2.5 pr-4 font-semibold">Role</th>
                <th className="py-2.5 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-[#21262d]">
              {(structure.classifiedDirectories || []).map((dir) => (
                <tr key={dir.path} className="hover:bg-neutral-50 dark:hover:bg-[#21262d]/50 transition-colors">
                  <td className="py-2.5 pr-4 font-mono font-medium text-neutral-800 dark:text-[#c9d1d9]">
                    {dir.name}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-blue-600 dark:text-[#79c0ff]">
                    {dir.path}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-700 dark:text-[#8b949e] border border-neutral-200 dark:border-[#30363d] text-[11px]">
                      {dir.role}
                    </span>
                  </td>
                  <td className="py-2.5 text-neutral-600 dark:text-[#8b949e]">
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
