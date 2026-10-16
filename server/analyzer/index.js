import { parseGitHubUrl, fetchGitHubRepoData } from './github.js';
import { resolveProvider } from '../providers/registry.js';
import { detectTechnologies } from './techDetector.js';
import { detectFrameworks } from './frameworkDetector.js';
import { analyzeStructure } from './structureAnalyzer.js';
import { detectEntryPoints } from './entryPointDetector.js';
import { mapArchitecture } from './architectureMapper.js';
import { generateObservations } from './observations.js';
import { ingestRepositoryToGraph } from '../memory/graphProvider.js';

export async function analyzeRepository(repoUrl, options = {}) {
  const startTime = Date.now();

  // 1. Ingestion Phase via Provider Adapter
  const providerAdapter = options.providerAdapter || resolveProvider(repoUrl);
  let parsed;
  try {
    parsed = providerAdapter.parseUrl(repoUrl);
  } catch (err) {
    parsed = parseGitHubUrl(repoUrl);
  }

  let scan;
  if (typeof providerAdapter.fetchFullScan === 'function') {
    scan = await providerAdapter.fetchFullScan(parsed, options);
  } else {
    scan = await fetchGitHubRepoData(parsed, options.token);
  }

  // 2. Static & Heuristic Analysis Phase
  const techStack = detectTechnologies(scan);
  const frameworks = detectFrameworks(scan);
  const structure = analyzeStructure(scan);
  const entryPoints = detectEntryPoints(scan);
  const architecture = mapArchitecture(scan, techStack, frameworks, structure, entryPoints);
  const observations = generateObservations(scan, techStack, frameworks);

  const durationMs = Date.now() - startTime;

  const analysisResult = {
    repository: {
      ...scan.repoInfo,
      provider: scan.providerData?.provider || providerAdapter.name || 'github'
    },
    providerData: scan.providerData || {
      provider: providerAdapter.name || 'github',
      branches: { status: 'empty', data: [], error: null },
      commits: { status: 'empty', data: [], error: null },
      issues: { status: 'empty', data: [], error: null },
      pullRequests: { status: 'empty', data: [], error: null }
    },
    metrics: {
      totalFiles: scan.totalFiles,
      totalDirectories: scan.totalDirectories,
      topExtensions: Object.entries(scan.extensions)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([ext, count]) => ({ ext, count })),
      analysisTimeMs: durationMs
    },
    techStack,
    frameworks,
    projectType: architecture.projectType,
    architecture: {
      pattern: architecture.architecturePattern,
      description: architecture.description,
      components: architecture.components,
      entryPoints
    },
    structure: {
      classifiedDirectories: structure.classifiedDirectories,
      tree: structure.tree
    },
    observations,
    // Context prepared for subsequent AI stage (README snippet, manifests & file list)
    aiContextReady: {
      hasReadme: Boolean(scan.manifests['README.md'] || scan.manifests['readme.md']),
      manifestFiles: Object.keys(scan.manifests),
      filePaths: scan.files.map(f => f.path),
      sampleReadmeExcerpt: (scan.manifests['README.md'] || scan.manifests['readme.md'] || '').slice(0, 1500)
    }
  };

  // 3. Project Memory Graph Ingestion Phase (graceful & non-blocking on unconfigured graph provider or graph failure)
  if (!options.skipGraphIngestion) {
    try {
      analysisResult.projectMemory = await ingestRepositoryToGraph(analysisResult, {
        rawFiles: scan.files,
        token: options.token,
        env: options.env,
        fetchImpl: options.fetchImpl,
        sourceContents: options.sourceContents,
        commits: options.commits || scan.providerData?.commits?.data || []
      });
    } catch (ingestErr) {
      analysisResult.projectMemory = {
        ingested: false,
        status: 'error',
        error: ingestErr?.message || 'Graph ingestion failed'
      };
    }
  } else {
    analysisResult.projectMemory = {
      ingested: false,
      status: 'skipped',
      reason: 'Graph ingestion skipped by caller option.'
    };
  }

  const isIngested = Boolean(analysisResult.projectMemory?.ingested);
  analysisResult.indexing = {
    status: isIngested ? 'indexed' : analysisResult.projectMemory?.status === 'error' ? 'error' : 'unindexed',
    lastSync: new Date().toISOString(),
    coverage: {
      totalFiles: scan.totalFiles,
      indexedFiles: analysisResult.projectMemory?.counts?.files ?? (isIngested ? scan.totalFiles : 0),
      indexedSymbols: analysisResult.projectMemory?.counts?.symbols ?? 0,
      indexedDecisions: analysisResult.projectMemory?.counts?.decisions ?? 0,
      indexedBugs: analysisResult.projectMemory?.counts?.bugs ?? 0,
      indexedFixes: analysisResult.projectMemory?.counts?.fixes ?? 0,
    },
    error: analysisResult.projectMemory?.error || null
  };

  return analysisResult;
}
