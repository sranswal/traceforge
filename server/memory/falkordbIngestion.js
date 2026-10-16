/**
 * FalkorDB Graph Ingestion Service (FailureChain Phase 2)
 * - Ingests repository analysis into FalkorDB as canonical graph store.
 * - Extracts symbols (Functions/Classes), call edges, component dependencies, tests, and commits.
 * - Writes idempotently to FalkorDB using parameterized MERGE queries.
 * - Preserves deterministic repository-scoped stable IDs and evidence provenance.
 */

import { runQuery, validateFalkorDBConfig, sanitizeErrorMessage } from '../db/falkordb.js';
import { ensureFalkorDBSchema } from './falkordbSchema.js';
import { GraphIds, normalizePath } from './schema.js';
import {
  isSupportedSourceFile,
  isTestFile,
  parseSourceFile
} from './sourceParser.js';

const MAX_GRAPH_FILES = 400;
const MAX_SOURCE_FILES_TO_PARSE = 18;
const MAX_SOURCE_FILE_BYTES = 65536; // 64 KB
const MAX_COMMITS_TO_FETCH = 3;

/**
 * Parses unified diff hunk headers (e.g., @@ -10,5 +12,8 @@) to extract changed line ranges.
 */
export function parseDiffChangedLines(patch = '') {
  if (!patch || typeof patch !== 'string') return [];
  const ranges = [];
  const hunkRegex = /@@\s*-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s*@@/g;
  let match;
  while ((match = hunkRegex.exec(patch)) !== null) {
    const start = parseInt(match[1], 10);
    const count = match[2] !== undefined ? parseInt(match[2], 10) : 1;
    if (!Number.isNaN(start) && count > 0) {
      ranges.push({
        startLine: start,
        endLine: start + Math.max(0, count - 1)
      });
    }
  }
  return ranges;
}

/**
 * Selects up to `MAX_SOURCE_FILES_TO_PARSE` candidate source files for symbol extraction.
 */
export function selectCandidateSourceFiles(analysis, rawFiles = []) {
  const entryPaths = new Set(
    (analysis?.architecture?.entryPoints || []).map(e => normalizePath(e.path))
  );

  const fileSizeMap = new Map();
  for (const f of rawFiles) {
    fileSizeMap.set(normalizePath(f.path), f.size || 0);
  }

  const allPaths = (analysis?.aiContextReady?.filePaths || rawFiles.map(f => f.path)).map(normalizePath);

  const supported = allPaths.filter(p => {
    if (!isSupportedSourceFile(p)) return false;
    const size = fileSizeMap.get(p) || 0;
    return size <= MAX_SOURCE_FILE_BYTES;
  });

  // Prioritize entry points, server/backend/core files, and test files
  supported.sort((a, b) => {
    const score = (p) => {
      let s = 0;
      if (entryPaths.has(p)) s += 100;
      if (p.startsWith('server/') || p.startsWith('src/') || p.startsWith('lib/')) s += 40;
      if (p.startsWith('client/src/')) s += 25;
      if (isTestFile(p)) s += 30;
      s -= p.split('/').length * 2;
      return s;
    };
    return score(b) - score(a);
  });

  return supported.slice(0, MAX_SOURCE_FILES_TO_PARSE);
}

/**
 * Fetches raw file contents from raw.githubusercontent.com with soft failure handling.
 */
export async function fetchSourceFilesContent({ owner, repo, branch, filePaths, fetchImpl = fetch }) {
  const contents = {};
  if (!owner || !repo || !branch || !Array.isArray(filePaths) || filePaths.length === 0) {
    return contents;
  }

  const tasks = filePaths.slice(0, MAX_SOURCE_FILES_TO_PARSE).map(async (filePath) => {
    try {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
      const res = await fetchImpl(rawUrl);
      if (res && res.ok) {
        const text = await res.text();
        if (text && text.length <= MAX_SOURCE_FILE_BYTES) {
          contents[filePath] = text;
        }
      }
    } catch {
      // Soft fail on individual file fetch
    }
  });

  await Promise.allSettled(tasks);
  return contents;
}

/**
 * Fetches recent commit metadata and changed files from GitHub API with graceful fallback on rate limits.
 */
export async function fetchRecentCommits({
  owner,
  repo,
  branch,
  githubToken = process.env.GITHUB_TOKEN,
  fetchImpl = fetch
}) {
  if (!owner || !repo) return [];

  const headers = {
    'User-Agent': 'TraceForge-Analyzer',
    'Accept': 'application/vnd.github.v3+json'
  };
  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`;
  }

  try {
    const listUrl = `https://api.github.com/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch || 'main')}&per_page=${MAX_COMMITS_TO_FETCH}`;
    const listRes = await fetchImpl(listUrl, { headers });
    if (!listRes || !listRes.ok) {
      return [];
    }

    const commitList = await listRes.json();
    if (!Array.isArray(commitList)) return [];

    const detailedCommits = [];
    for (const item of commitList.slice(0, MAX_COMMITS_TO_FETCH)) {
      if (!item?.sha) continue;
      let filesChanged = [];

      try {
        const detailUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${item.sha}`;
        const detailRes = await fetchImpl(detailUrl, { headers });
        if (detailRes && detailRes.ok) {
          const detailData = await detailRes.json();
          if (Array.isArray(detailData.files)) {
            filesChanged = detailData.files.slice(0, 30).map(f => ({
              path: normalizePath(f.filename),
              status: f.status || 'modified',
              additions: f.additions || 0,
              deletions: f.deletions || 0,
              changedRanges: parseDiffChangedLines(f.patch || '')
            }));
          }
        }
      } catch {
        // Ignore individual commit detail failure
      }

      detailedCommits.push({
        sha: item.sha,
        shortSha: item.sha.slice(0, 7),
        message: (item.commit?.message || '').split('\n')[0].slice(0, 300),
        author: item.commit?.author?.name || item.author?.login || 'Unknown',
        date: item.commit?.author?.date || new Date().toISOString(),
        url: item.html_url || `https://github.com/${owner}/${repo}/commit/${item.sha}`,
        files: filesChanged
      });
    }

    return detailedCommits;
  } catch {
    return [];
  }
}

/**
 * Maps a file path to its owning Component path based on classifiedDirectories or top-level folder.
 */
export function resolveComponentForFile(filePath, componentsMap) {
  const norm = normalizePath(filePath);
  const parts = norm.split('/');

  // Try matching longest classified directory prefix first
  let bestMatch = null;
  for (const compPath of componentsMap.keys()) {
    if (compPath === 'root') continue;
    if (norm === compPath || norm.startsWith(`${compPath}/`)) {
      if (!bestMatch || compPath.length > bestMatch.length) {
        bestMatch = compPath;
      }
    }
  }

  if (bestMatch) return bestMatch;
  if (parts.length > 1 && componentsMap.has(parts[0])) {
    return parts[0];
  }
  return 'root';
}

/**
 * Builds the structured graph entities and relationships from an analysis object,
 * optional source file contents map, and optional commit list.
 * Pure function suitable for both live ingestion and deterministic unit tests.
 */
export function buildProjectMemoryGraphPayload(analysis, {
  rawFiles = [],
  sourceContents = {},
  commits = []
} = {}) {
  const repo = analysis?.repository || {};
  const repoFullName = normalizePath(repo.fullName || `${repo.owner || 'unknown'}/${repo.repo || 'repo'}`).toLowerCase();
  const repoId = GraphIds.repository(repoFullName);

  // 1. Components from classifiedDirectories + root fallback
  const componentsMap = new Map();
  componentsMap.set('root', {
    id: GraphIds.component(repoFullName, 'root'),
    repoFullName,
    path: 'root',
    name: 'root',
    role: 'Repository Root',
    category: 'core',
    description: 'Root-level configuration and entry files'
  });

  for (const dir of analysis?.structure?.classifiedDirectories || []) {
    const cleanPath = normalizePath(dir.path);
    if (!cleanPath) continue;
    componentsMap.set(cleanPath, {
      id: GraphIds.component(repoFullName, cleanPath),
      repoFullName,
      path: cleanPath,
      name: dir.name || cleanPath.split('/').pop(),
      role: dir.role || 'Module',
      category: dir.category || 'core',
      description: dir.description || ''
    });
  }

  // Also ensure top-level directories with files have a Component node if not already present
  const allFilePathsRaw = (
    rawFiles.length > 0
      ? rawFiles.map(f => ({ path: normalizePath(f.path), size: f.size || 0 }))
      : (analysis?.aiContextReady?.filePaths || []).map(p => ({ path: normalizePath(p), size: 0 }))
  ).filter(f => Boolean(f.path));

  for (const f of allFilePathsRaw.slice(0, MAX_GRAPH_FILES)) {
    const parts = f.path.split('/');
    if (parts.length > 1) {
      const topDir = parts[0];
      if (!componentsMap.has(topDir)) {
        componentsMap.set(topDir, {
          id: GraphIds.component(repoFullName, topDir),
          repoFullName,
          path: topDir,
          name: topDir,
          role: 'Top-Level Module',
          category: 'module',
          description: `Files under /${topDir}`
        });
      }
    }
  }

  // 2. Files (bounded to MAX_GRAPH_FILES, prioritizing entry points and parsed files)
  const entryPointPaths = new Set(
    (analysis?.architecture?.entryPoints || []).map(e => normalizePath(e.path))
  );
  const parsedPathsSet = new Set(Object.keys(sourceContents).map(normalizePath));

  const sortedFiles = [...allFilePathsRaw].sort((a, b) => {
    const aPri = (entryPointPaths.has(a.path) ? 20 : 0) + (parsedPathsSet.has(a.path) ? 10 : 0);
    const bPri = (entryPointPaths.has(b.path) ? 20 : 0) + (parsedPathsSet.has(b.path) ? 10 : 0);
    return bPri - aPri;
  }).slice(0, MAX_GRAPH_FILES);

  const allFilePathsSet = new Set(allFilePathsRaw.map(f => f.path));
  const fileNodes = [];
  const fileComponentEdges = [];
  const fileToComponentMap = new Map();

  for (const f of sortedFiles) {
    const fileId = GraphIds.file(repoFullName, f.path);
    const parts = f.path.split('/');
    const fileName = parts[parts.length - 1];
    const dotIdx = fileName.lastIndexOf('.');
    const ext = dotIdx > 0 ? fileName.slice(dotIdx).toLowerCase() : '';
    const hasSource = Boolean(sourceContents[f.path]);
    const supportedForAst = hasSource && isSupportedSourceFile(f.path);

    const compPath = resolveComponentForFile(f.path, componentsMap);
    const compId = GraphIds.component(repoFullName, compPath);
    fileToComponentMap.set(f.path, compId);

    fileNodes.push({
      id: fileId,
      repoFullName,
      path: f.path,
      name: fileName,
      extension: ext,
      size: f.size || 0,
      isEntryPoint: entryPointPaths.has(f.path),
      isTest: isTestFile(f.path),
      parserPrecision: supportedForAst ? 'lexical-brace-js-ts' : 'file-level-only'
    });

    fileComponentEdges.push({
      componentId: compId,
      fileId
    });
  }

  // 3. Parse Source Files -> Symbols, Imports, Calls, Tests
  const symbolNodes = [];
  const fileSymbolEdges = [];
  const testNodes = [];
  const symbolCallEdges = [];
  const componentDepEdgesMap = new Map();
  const testCoversSymbolEdges = [];

  const symbolsByFile = new Map();
  const parsedFileResults = [];

  for (const [rawPath, content] of Object.entries(sourceContents)) {
    const filePath = normalizePath(rawPath);
    if (!content || !allFilePathsSet.has(filePath)) continue;

    const parsed = parseSourceFile(content, filePath, allFilePathsSet);
    if (!parsed.supported) continue;

    parsedFileResults.push(parsed);
    const fileId = GraphIds.file(repoFullName, filePath);
    const fileSymbols = [];

    for (const sym of parsed.symbols) {
      const symbolId = GraphIds.symbol(repoFullName, filePath, sym.kind, sym.name);
      const symRecord = {
        id: symbolId,
        repoFullName,
        filePath,
        name: sym.name,
        kind: sym.kind,
        startLine: sym.startLine,
        endLine: sym.endLine,
        exported: sym.exported,
        parentClass: sym.parentClass || null,
        parserPrecision: sym.parserPrecision,
        rawCalls: sym.rawCalls || []
      };
      symbolNodes.push(symRecord);
      fileSymbols.push(symRecord);
      fileSymbolEdges.push({
        fileId,
        symbolId
      });
    }

    symbolsByFile.set(filePath, fileSymbols);
  }

  // Resolve SYMBOL_CALLS_SYMBOL, COMPONENT_DEPENDS_ON_COMPONENT, and TEST_COVERS_SYMBOL
  const seenSymbolCalls = new Set();
  const seenTestCovers = new Set();

  for (const parsed of parsedFileResults) {
    const callerFilePath = parsed.filePath;
    const callerCompId = fileToComponentMap.get(callerFilePath);
    const localSymbols = symbolsByFile.get(callerFilePath) || [];

    const accessibleSymbolsByName = new Map();
    for (const s of localSymbols) {
      accessibleSymbolsByName.set(s.name, s);
    }

    for (const imp of parsed.imports) {
      if (imp.resolvedPath) {
        const targetCompId = fileToComponentMap.get(imp.resolvedPath);
        if (callerCompId && targetCompId && callerCompId !== targetCompId) {
          const depKey = `${callerCompId}->${targetCompId}`;
          if (!componentDepEdgesMap.has(depKey)) {
            componentDepEdgesMap.set(depKey, {
              sourceComponentId: callerCompId,
              targetComponentId: targetCompId,
              evidenceFile: callerFilePath,
              importedFile: imp.resolvedPath
            });
          }
        }

        const importedSyms = symbolsByFile.get(imp.resolvedPath) || [];
        for (const s of importedSyms) {
          if (s.exported || !accessibleSymbolsByName.has(s.name)) {
            accessibleSymbolsByName.set(s.name, s);
          }
        }
      }
    }

    // Build verified SYMBOL_CALLS_SYMBOL edges
    for (const callerSym of localSymbols) {
      for (const calleeName of callerSym.rawCalls) {
        const targetSym = accessibleSymbolsByName.get(calleeName);
        if (targetSym && targetSym.id !== callerSym.id) {
          const callKey = `${callerSym.id}->${targetSym.id}`;
          if (!seenSymbolCalls.has(callKey)) {
            seenSymbolCalls.add(callKey);
            symbolCallEdges.push({
              callerId: callerSym.id,
              calleeId: targetSym.id,
              callerFile: callerFilePath,
              calleeFile: targetSym.filePath
            });
          }
        }
      }
    }

    // Build Test nodes and TEST_COVERS_SYMBOL edges
    for (const t of parsed.tests) {
      const testId = GraphIds.test(repoFullName, callerFilePath, t.name);
      testNodes.push({
        id: testId,
        repoFullName,
        filePath: callerFilePath,
        name: t.name,
        startLine: t.startLine,
        endLine: t.endLine
      });

      for (const refName of t.referencedSymbols) {
        const coveredSym = accessibleSymbolsByName.get(refName);
        if (coveredSym) {
          const coverKey = `${testId}->${coveredSym.id}`;
          if (!seenTestCovers.has(coverKey)) {
            seenTestCovers.add(coverKey);
            testCoversSymbolEdges.push({
              testId,
              symbolId: coveredSym.id
            });
          }
        }
      }
    }
  }

  // 4. Process Commits -> COMMIT_CHANGED_FILE and COMMIT_CHANGED_SYMBOL
  const commitNodes = [];
  const commitFileEdges = [];
  const commitSymbolEdges = [];
  const seenCommitSymbol = new Set();

  for (const c of commits) {
    if (!c?.sha) continue;
    const commitId = GraphIds.commit(repoFullName, c.sha);
    commitNodes.push({
      id: commitId,
      repoFullName,
      sha: c.sha,
      shortSha: c.shortSha || c.sha.slice(0, 7),
      role: c.role || null,
      message: c.message || '',
      author: c.author || 'Unknown',
      date: c.date || '',
      url: c.url || ''
    });

    for (const cf of c.files || []) {
      const normPath = normalizePath(cf.path);
      if (!allFilePathsSet.has(normPath)) continue;
      const fileId = GraphIds.file(repoFullName, normPath);
      commitFileEdges.push({
        commitId,
        fileId,
        status: cf.status || 'modified',
        additions: cf.additions || 0,
        deletions: cf.deletions || 0
      });

      const fileSyms = symbolsByFile.get(normPath) || [];
      const ranges = cf.changedRanges || [];
      for (const sym of fileSyms) {
        const overlaps = ranges.some(
          r => r.startLine <= sym.endLine && r.endLine >= sym.startLine
        );
        if (overlaps) {
          const csKey = `${commitId}->${sym.id}`;
          if (!seenCommitSymbol.has(csKey)) {
            seenCommitSymbol.add(csKey);
            commitSymbolEdges.push({
              commitId,
              symbolId: sym.id
            });
          }
        }
      }
    }
  }

  return {
    repositoryNode: {
      id: repoId,
      fullName: repoFullName,
      owner: repo.owner || repoFullName.split('/')[0] || 'unknown',
      name: repo.repo || repoFullName.split('/')[1] || 'repo',
      branch: repo.branch || 'main',
      primaryLanguage: repo.primaryLanguage || 'Unknown',
      description: repo.description || '',
      url: repo.url || (repo.provider === 'gitlab' ? `https://gitlab.com/${repoFullName}` : repo.provider === 'bitbucket' ? `https://bitbucket.org/${repoFullName}` : `https://github.com/${repoFullName}`),
      provider: repo.provider || (repoFullName.includes('gitlab') ? 'gitlab' : repoFullName.includes('bitbucket') ? 'bitbucket' : 'github'),
      projectType: analysis?.projectType || 'Software Repository',
      architecturePattern: analysis?.architecture?.pattern || 'Layered Architecture'
    },
    components: Array.from(componentsMap.values()),
    files: fileNodes,
    fileComponentEdges,
    symbols: symbolNodes.map(({ rawCalls, ...rest }) => rest),
    fileSymbolEdges,
    symbolCallEdges,
    componentDependencies: Array.from(componentDepEdgesMap.values()),
    tests: testNodes,
    testCoversSymbolEdges,
    commits: commitNodes,
    commitFileEdges,
    commitSymbolEdges
  };
}

/**
 * Persists a built project memory payload idempotently into FalkorDB using MERGE.
 */
export async function persistFalkorDBMemoryPayload(payload, options = {}) {
  await ensureFalkorDBSchema(options);

  const {
    repositoryNode,
    components = [],
    files = [],
    fileComponentEdges = [],
    symbols = [],
    fileSymbolEdges = [],
    symbolCallEdges = [],
    componentDependencies = [],
    tests = [],
    testCoversSymbolEdges = [],
    commits = [],
    commitFileEdges = [],
    commitSymbolEdges = []
  } = payload;

  const isoTimestamp = options.timestamp || new Date().toISOString();

  // 1. Merge Repository
  await runQuery(
    `MERGE (r:Repository { id: $repo.id })
     SET r.fullName = $repo.fullName,
         r.owner = $repo.owner,
         r.name = $repo.name,
         r.branch = $repo.branch,
         r.primaryLanguage = $repo.primaryLanguage,
         r.description = $repo.description,
         r.url = $repo.url,
         r.projectType = $repo.projectType,
         r.architecturePattern = $repo.architecturePattern,
         r.provider = $repo.provider,
         r.updatedAt = $updatedAt`,
    { repo: repositoryNode, updatedAt: isoTimestamp },
    options
  );

  // 2. Merge Components & link to Repository
  if (components.length > 0) {
    await runQuery(
      `MATCH (r:Repository { id: $repoId })
       UNWIND $components AS comp
       MERGE (c:Component { id: comp.id })
       SET c.repoFullName = comp.repoFullName,
           c.path = comp.path,
           c.name = comp.name,
           c.role = comp.role,
           c.category = comp.category,
           c.description = comp.description,
           c.updatedAt = $updatedAt
       MERGE (r)-[:REPOSITORY_HAS_COMPONENT]->(c)`,
      { repoId: repositoryNode.id, components, updatedAt: isoTimestamp },
      options
    );
  }

  // 3. Merge Files & link to Repository + Component
  if (files.length > 0) {
    await runQuery(
      `MATCH (r:Repository { id: $repoId })
       UNWIND $files AS file
       MERGE (f:File { id: file.id })
       SET f.repoFullName = file.repoFullName,
           f.path = file.path,
           f.name = file.name,
           f.extension = file.extension,
           f.size = file.size,
           f.isEntryPoint = file.isEntryPoint,
           f.isTest = file.isTest,
           f.parserPrecision = file.parserPrecision,
           f.updatedAt = $updatedAt
       MERGE (r)-[:REPOSITORY_CONTAINS_FILE]->(f)`,
      { repoId: repositoryNode.id, files, updatedAt: isoTimestamp },
      options
    );
  }

  if (fileComponentEdges.length > 0) {
    await runQuery(
      `UNWIND $edges AS edge
       MATCH (c:Component { id: edge.componentId })
       MATCH (f:File { id: edge.fileId })
       MERGE (c)-[:COMPONENT_CONTAINS_FILE]->(f)`,
      { edges: fileComponentEdges },
      options
    );
  }

  // 4. Merge Symbols (Functions & Classes) & link to File
  const functionSymbols = symbols.filter(s => s.kind === 'Function');
  const classSymbols = symbols.filter(s => s.kind === 'Class');

  if (functionSymbols.length > 0) {
    await runQuery(
      `UNWIND $symbols AS sym
       MERGE (s:Symbol { id: sym.id })
       SET s:Function,
           s.repoFullName = sym.repoFullName,
           s.filePath = sym.filePath,
           s.name = sym.name,
           s.kind = sym.kind,
           s.startLine = sym.startLine,
           s.endLine = sym.endLine,
           s.exported = sym.exported,
           s.parentClass = sym.parentClass,
           s.parserPrecision = sym.parserPrecision,
           s.updatedAt = $updatedAt`,
      { symbols: functionSymbols, updatedAt: isoTimestamp },
      options
    );
  }

  if (classSymbols.length > 0) {
    await runQuery(
      `UNWIND $symbols AS sym
       MERGE (s:Symbol { id: sym.id })
       SET s:Class,
           s.repoFullName = sym.repoFullName,
           s.filePath = sym.filePath,
           s.name = sym.name,
           s.kind = sym.kind,
           s.startLine = sym.startLine,
           s.endLine = sym.endLine,
           s.exported = sym.exported,
           s.parserPrecision = sym.parserPrecision,
           s.updatedAt = $updatedAt`,
      { symbols: classSymbols, updatedAt: isoTimestamp },
      options
    );
  }

  if (fileSymbolEdges.length > 0) {
    await runQuery(
      `UNWIND $edges AS edge
       MATCH (f:File { id: edge.fileId })
       MATCH (s:Symbol { id: edge.symbolId })
       MERGE (f)-[:FILE_DEFINES_SYMBOL]->(s)`,
      { edges: fileSymbolEdges },
      options
    );
  }

  // 5. Merge SYMBOL_CALLS_SYMBOL relationships
  if (symbolCallEdges.length > 0) {
    await runQuery(
      `UNWIND $edges AS edge
       MATCH (caller:Symbol { id: edge.callerId })
       MATCH (callee:Symbol { id: edge.calleeId })
       MERGE (caller)-[r:SYMBOL_CALLS_SYMBOL]->(callee)
       SET r.callerFile = edge.callerFile,
           r.calleeFile = edge.calleeFile`,
      { edges: symbolCallEdges },
      options
    );
  }

  // 6. Merge COMPONENT_DEPENDS_ON_COMPONENT relationships
  if (componentDependencies.length > 0) {
    await runQuery(
      `UNWIND $deps AS dep
       MATCH (src:Component { id: dep.sourceComponentId })
       MATCH (tgt:Component { id: dep.targetComponentId })
       MERGE (src)-[r:COMPONENT_DEPENDS_ON_COMPONENT]->(tgt)
       SET r.evidenceFile = dep.evidenceFile,
           r.importedFile = dep.importedFile`,
      { deps: componentDependencies },
      options
    );
  }

  // 7. Merge Test nodes & TEST_COVERS_SYMBOL relationships
  if (tests.length > 0) {
    await runQuery(
      `UNWIND $tests AS t
       MERGE (testNode:Test { id: t.id })
       SET testNode.repoFullName = t.repoFullName,
           testNode.filePath = t.filePath,
           testNode.name = t.name,
           testNode.startLine = t.startLine,
           testNode.endLine = t.endLine,
           testNode.updatedAt = $updatedAt`,
      { tests, updatedAt: isoTimestamp },
      options
    );
  }

  if (testCoversSymbolEdges.length > 0) {
    await runQuery(
      `UNWIND $edges AS edge
       MATCH (t:Test { id: edge.testId })
       MATCH (s:Symbol { id: edge.symbolId })
       MERGE (t)-[:TEST_COVERS_SYMBOL]->(s)`,
      { edges: testCoversSymbolEdges },
      options
    );
  }

  // 8. Merge Commits, COMMIT_CHANGED_FILE, and COMMIT_CHANGED_SYMBOL
  if (commits.length > 0) {
    await runQuery(
      `UNWIND $commits AS cm
       MERGE (c:Commit { id: cm.id })
       SET c.repoFullName = cm.repoFullName,
           c.sha = cm.sha,
           c.shortSha = cm.shortSha,
           c.role = cm.role,
           c.message = cm.message,
           c.author = cm.author,
           c.date = cm.date,
           c.url = cm.url,
           c.updatedAt = $updatedAt`,
      { commits, updatedAt: isoTimestamp },
      options
    );
  }

  if (commitFileEdges.length > 0) {
    await runQuery(
      `UNWIND $edges AS edge
       MATCH (c:Commit { id: edge.commitId })
       MATCH (f:File { id: edge.fileId })
       MERGE (c)-[r:COMMIT_CHANGED_FILE]->(f)
       SET r.status = edge.status,
           r.additions = edge.additions,
           r.deletions = edge.deletions`,
      { edges: commitFileEdges },
      options
    );
  }

  if (commitSymbolEdges.length > 0) {
    await runQuery(
      `UNWIND $edges AS edge
       MATCH (c:Commit { id: edge.commitId })
       MATCH (s:Symbol { id: edge.symbolId })
       MERGE (c)-[:COMMIT_CHANGED_SYMBOL]->(s)`,
      { edges: commitSymbolEdges },
      options
    );
  }

  return {
    ingested: true,
    status: 'ingested',
    repositoryId: repositoryNode.id,
    counts: {
      components: components.length,
      files: files.length,
      symbols: symbols.length,
      symbolCalls: symbolCallEdges.length,
      componentDependencies: componentDependencies.length,
      tests: tests.length,
      testCoverageLinks: testCoversSymbolEdges.length,
      commits: commits.length,
      commitFileLinks: commitFileEdges.length,
      commitSymbolLinks: commitSymbolEdges.length
    }
  };
}

/**
 * High-level orchestrator that enriches an existing TraceForge analysis with bounded source
 * and commit metadata and ingests it into FalkorDB safely.
 * Never throws when FalkorDB is unconfigured or unavailable (returns graceful status).
 */
export async function ingestFalkorDBRepositoryAnalysis(analysis, options = {}) {
  const env = options.env || process.env;
  const validation = validateFalkorDBConfig(env);

  if (!validation.valid && !options.forceWithMock) {
    return {
      ingested: false,
      status: validation.partiallyConfigured ? 'invalid_config' : 'unconfigured',
      reason: validation.errors[0] || 'FalkorDB is not configured; skipping graph ingestion.'
    };
  }

  try {
    const repo = analysis?.repository || {};
    const owner = repo.owner || (repo.fullName ? repo.fullName.split('/')[0] : '');
    const repoName = repo.repo || (repo.fullName ? repo.fullName.split('/')[1] : '');
    const branch = repo.branch || 'main';

    let sourceContents = options.sourceContents;
    if (!sourceContents) {
      const candidateFiles = selectCandidateSourceFiles(analysis, options.rawFiles || []);
      sourceContents = await fetchSourceFilesContent({
        owner,
        repo: repoName,
        branch,
        filePaths: candidateFiles,
        fetchImpl: options.fetchImpl
      });
    }

    let commits = options.commits;
    if (!commits) {
      commits = await fetchRecentCommits({
        owner,
        repo: repoName,
        branch,
        githubToken: options.token || env.GITHUB_TOKEN,
        fetchImpl: options.fetchImpl
      });
    }

    const payload = buildProjectMemoryGraphPayload(analysis, {
      rawFiles: options.rawFiles || [],
      sourceContents,
      commits
    });

    return await persistFalkorDBMemoryPayload(payload, { env, graph: options.graph });
  } catch (err) {
    const safeMsg = sanitizeErrorMessage(err.message, env.FALKORDB_PASSWORD);
    console.warn('[TraceForge] FalkorDB graph ingestion skipped/degraded:', safeMsg);
    return {
      ingested: false,
      status: 'error',
      error: safeMsg
    };
  }
}

