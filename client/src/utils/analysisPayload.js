/**
 * Utilities for compacting repository analysis payloads before sending to AI endpoints
 * and generating repository-specific investigation suggestions grounded in real evidence.
 */

const MAX_COMPACT_FILE_PATHS = 120;
const MAX_README_EXCERPT_CHARS = 1500;
const MAX_CLASSIFIED_DIRS = 14;
const MAX_ENTRY_POINTS = 15;
const MAX_FRAMEWORKS = 25;
const MAX_OBSERVATIONS = 15;

/**
 * Strips bulky UI-only structures (such as `structure.tree` and full raw file lists)
 * that previously caused `PayloadTooLargeError` on `POST /api/ai/summary` and `POST /api/ai/ask`,
 * while preserving 100% of the fields used by `AIProvider.buildCompactContext`.
 */
export function buildCompactAnalysisPayload(analysisData) {
  if (!analysisData || typeof analysisData !== 'object') {
    return null;
  }

  const {
    repository,
    metrics,
    techStack,
    frameworks,
    projectType,
    architecture,
    structure,
    observations,
    aiContextReady
  } = analysisData;

  const allFilePaths = Array.isArray(aiContextReady?.filePaths)
    ? aiContextReady.filePaths
    : [];

  return {
    repository: repository
      ? {
          owner: repository.owner,
          repo: repository.repo,
          fullName: repository.fullName,
          branch: repository.branch,
          description: repository.description,
          primaryLanguage: repository.primaryLanguage,
          license: repository.license,
          stars: repository.stars,
          forks: repository.forks,
          url: repository.url
        }
      : {},
    metrics: metrics
      ? {
          totalFiles: metrics.totalFiles ?? allFilePaths.length,
          totalDirectories: metrics.totalDirectories ?? 0,
          topExtensions: Array.isArray(metrics.topExtensions)
            ? metrics.topExtensions.slice(0, 10)
            : [],
          analysisTimeMs: metrics.analysisTimeMs
        }
      : { totalFiles: allFilePaths.length, totalDirectories: 0 },
    techStack: techStack
      ? {
          languages: Array.isArray(techStack.languages) ? techStack.languages.slice(0, 10) : [],
          backend: Array.isArray(techStack.backend) ? techStack.backend.slice(0, 10) : [],
          frontend: Array.isArray(techStack.frontend) ? techStack.frontend.slice(0, 10) : [],
          devops: Array.isArray(techStack.devops) ? techStack.devops.slice(0, 10) : [],
          database: Array.isArray(techStack.database) ? techStack.database.slice(0, 10) : [],
          config: Array.isArray(techStack.config) ? techStack.config.slice(0, 10) : []
        }
      : {},
    frameworks: Array.isArray(frameworks) ? frameworks.slice(0, MAX_FRAMEWORKS) : [],
    projectType: projectType || 'Software Repository',
    architecture: architecture
      ? {
          pattern: architecture.pattern,
          description: architecture.description,
          components: Array.isArray(architecture.components)
            ? architecture.components.slice(0, 15)
            : [],
          entryPoints: Array.isArray(architecture.entryPoints)
            ? architecture.entryPoints.slice(0, MAX_ENTRY_POINTS)
            : []
        }
      : {},
    structure: {
      classifiedDirectories: Array.isArray(structure?.classifiedDirectories)
        ? structure.classifiedDirectories.slice(0, MAX_CLASSIFIED_DIRS)
        : []
      // Note: `structure.tree` is intentionally omitted from AI requests to prevent PayloadTooLargeError
    },
    observations: Array.isArray(observations) ? observations.slice(0, MAX_OBSERVATIONS) : [],
    aiContextReady: {
      hasReadme: Boolean(aiContextReady?.hasReadme),
      manifestFiles: Array.isArray(aiContextReady?.manifestFiles)
        ? aiContextReady.manifestFiles.slice(0, 30)
        : [],
      filePaths: allFilePaths.slice(0, MAX_COMPACT_FILE_PATHS),
      totalFilePathsCount: allFilePaths.length,
      sampleReadmeExcerpt: String(aiContextReady?.sampleReadmeExcerpt || '').slice(
        0,
        MAX_README_EXCERPT_CHARS
      )
    }
  };
}

/**
 * Generates repository-specific investigation questions derived strictly from the
 * current repository's static analysis and matching FalkorDB Project Memory records.
 *
 * Never uses memories from another repository and never returns generic boilerplate
 * when repository evidence is absent.
 */
export function generateContextualSuggestions(analysisData, memoryOverview = null, maxSuggestions = 5) {
  if (!analysisData || !analysisData.repository?.fullName) {
    return [];
  }

  const repoFullName = String(analysisData.repository.fullName).trim().toLowerCase();
  const memoryRepo = String(
    memoryOverview?.repoFullName || memoryOverview?.repository || ''
  )
    .trim()
    .toLowerCase();

  // Strictly enforce repository scoping for FalkorDB memories
  const validMemory =
    memoryOverview &&
    memoryOverview.available !== false &&
    memoryRepo === repoFullName
      ? memoryOverview
      : null;

  const suggestions = [];
  const seenNormalized = new Set();

  function addSuggestion(item) {
    const qText = item?.question || item?.text;
    if (!qText || suggestions.length >= maxSuggestions) return;
    const norm = qText.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seenNormalized.has(norm)) return;
    seenNormalized.add(norm);
    suggestions.push({
      ...item,
      question: qText,
      text: qText
    });
  }

  // 1. Stored Bug & Fix in Graph Memory for this repository
  const providerLabel = 'FalkorDB';
  const bugs = validMemory?.bugsAndFixes || [];
  if (bugs.length > 0) {
    const topBug = bugs[0];
    const targetLoc = topBug.filePath || topBug.componentPath || topBug.component || 'this component';
    addSuggestion({
      question: `Could a current failure in \`${targetLoc}\` be related to the recorded bug "${topBug.title}"? What should I investigate?`,
      category: 'bug_history',
      source: `${providerLabel} Bug Record (${targetLoc})`
    });
  }

  // 2. Stored Technical Decision in Graph Memory for this repository
  const decisions = validMemory?.decisions || [];
  if (decisions.length > 0) {
    const topDecision = decisions[0];
    const comp = topDecision.componentPath || topDecision.component || 'the architecture';
    addSuggestion({
      question: `How does the technical decision "${topDecision.title}" affect changes or debugging in \`${comp}\`?`,
      category: 'decision',
      source: `${providerLabel} Decision (${comp})`
    });
  }

  // 3. Verified Component Dependency in FalkorDB import graph
  const deps = validMemory?.componentDependencies || [];
  if (deps.length > 0) {
    const topDep = deps[0];
    const via = topDep.evidenceFile ? ` (via \`${topDep.evidenceFile}\`)` : '';
    addSuggestion({
      question: `What is the downstream impact on \`${topDep.sourceComponent}\`${via} if we modify \`${topDep.targetComponent}\`?`,
      category: 'dependency',
      source: `Import Graph (${topDep.sourceComponent} → ${topDep.targetComponent})`
    });
  }

  // 4. Extracted Source Symbols (Functions / Classes) or Authentication-specific evidence
  const symbols = validMemory?.symbols || [];
  const filePaths = analysisData.aiContextReady?.filePaths || [];

  const authFile = filePaths.find(f => /(^|\/)(auth|jwt|token|session|login|oauth)/i.test(f));
  const authSymbol = symbols.find(s => /(auth|token|jwt|session|verify|login)/i.test(s.name || ''));

  if (authSymbol) {
    addSuggestion({
      question: `How does \`${authSymbol.name}\` in \`${authSymbol.filePath}\` (L${authSymbol.startLine}-L${authSymbol.endLine}) validate requests and interact with its callers?`,
      category: 'auth_symbol',
      source: `Symbol ${authSymbol.name} (${authSymbol.filePath})`
    });
  } else if (authFile) {
    addSuggestion({
      question: `How is authentication or token handling structured in \`${authFile}\` and its dependent modules?`,
      category: 'auth_file',
      source: `File ${authFile}`
    });
  } else if (symbols.length > 0) {
    const topSym = symbols[0];
    addSuggestion({
      question: `How does the ${topSym.kind?.toLowerCase() || 'symbol'} \`${topSym.name}\` in \`${topSym.filePath}\` (L${topSym.startLine}-L${topSym.endLine}) interact with its dependencies?`,
      category: 'symbol',
      source: `Symbol ${topSym.name} (${topSym.filePath})`
    });
  }

  // 5. Execution Entry Points from static analysis
  const entryPoints = analysisData.architecture?.entryPoints || [];
  if (entryPoints.length > 0) {
    const ep = entryPoints[0];
    addSuggestion({
      question: `How does entry point \`${ep.path}\` initialize the ${analysisData.projectType || 'application'} and wire up its primary components?`,
      category: 'entry_point',
      source: `Entry Point (${ep.path})`
    });
  }

  // 6. Test Files / Coverage evidence
  const testFile = filePaths.find(f => /(^|\/)(test|tests|__tests__|spec)\b|\.(test|spec)\.[jt]sx?$/i.test(f));
  const testedSymbol = symbols.find(s => Array.isArray(s.coveredByTests) && s.coveredByTests.length > 0);
  if (testedSymbol) {
    addSuggestion({
      question: `Which behaviors of \`${testedSymbol.name}\` (\`${testedSymbol.filePath}\`) are covered by "${testedSymbol.coveredByTests[0]}", and what edge cases remain untested?`,
      category: 'test_coverage',
      source: `Test Coverage (${testedSymbol.filePath})`
    });
  } else if (testFile) {
    addSuggestion({
      question: `What core behaviors does \`${testFile}\` verify, and which modules in \`${analysisData.repository.fullName}\` lack test coverage?`,
      category: 'test_file',
      source: `Test Suite (${testFile})`
    });
  }

  // 7. Classified Architectural Directories & Frameworks
  const classifiedDirs = analysisData.structure?.classifiedDirectories || [];
  const frameworks = analysisData.frameworks || [];
  if (classifiedDirs.length >= 2) {
    const d1 = classifiedDirs[0];
    const d2 = classifiedDirs[1];
    addSuggestion({
      question: `How do \`${d1.path}\` (${d1.role}) and \`${d2.path}\` (${d2.role}) divide responsibilities in \`${analysisData.repository.fullName}\`?`,
      category: 'architecture',
      source: `Directories (${d1.path}, ${d2.path})`
    });
  } else if (frameworks.length > 0 && filePaths.length > 0) {
    const fw = frameworks[0];
    addSuggestion({
      question: `How is ${fw.name} configured and used across \`${filePaths[0]}\` in \`${analysisData.repository.fullName}\`?`,
      category: 'framework',
      source: `Framework (${fw.name})`
    });
  }

  return suggestions.slice(0, maxSuggestions);
}

/**
 * Builds a grounded investigation prompt when a user selects a specific node or edge
 * in the FalkorDB Graph Explorer and clicks "Investigate in Ask Codebase".
 */
export function buildEntityInvestigationPrompt(entity, repoFullName) {
  if (!entity) return '';
  const label = entity.label || entity.type || 'Entity';
  const title = entity.title || entity.id || '';
  const detailsObj =
    entity.details && typeof entity.details === 'object' ? entity.details : {};
  const propsObj =
    entity.properties && typeof entity.properties === 'object' ? entity.properties : {};
  const details = { ...propsObj, ...detailsObj };
  const provenance = entity.provenance || details.filePath || details.path || details.componentPath || '';

  switch (label) {
    case 'Bug':
      return `Could a current issue in ${details.filePath || details.componentPath || provenance || repoFullName} be related to the recorded bug "${title}"${details.fixSummary ? ` and its fix` : ''}? What should I investigate next?`;
    case 'Fix':
      return `What exact failure did the fix "${title}"${details.commitSha && details.commitSha !== 'N/A' ? ` (commit ${details.commitSha})` : ''} resolve in ${details.filePath || provenance || repoFullName}, and could a regression occur in callers?`;
    case 'TechnicalDecision':
      return `How does the architectural decision "${title}" affect implementation details and debugging in \`${details.affectedComponent || details.component || provenance || repoFullName}\`?`;
    case 'Function':
    case 'Class':
    case 'Symbol':
      return `How does \`${details.name || title}\` in \`${details.filePath || provenance || 'source'}\` (${details.lines || provenance || 'extracted range'}) work, what calls it, and what failure modes should I check?`;
    case 'File':
      return `What is the role of \`${details.path || provenance || title}\` in \`${repoFullName}\`, which symbols or components depend on it, and what should I inspect when debugging it?`;
    case 'Component':
      return `How does the \`${details.path || provenance || title}\` component (${details.role || 'module'}) interact with its upstream and downstream dependencies in \`${repoFullName}\`?`;
    case 'Commit':
      return `What files and symbols were impacted by commit \`${details.sha || provenance || title}\` ("${details.message || ''}"), and could it introduce side effects?`;
    case 'Test':
      return `What symbols and edge cases are covered by test "${title}" in \`${details.filePath || provenance || repoFullName}\`?`;
    default:
      return `What are the main architectural dependencies, risk areas, and recorded project memories in \`${repoFullName}\`?`;
  }
}
