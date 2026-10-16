/**
 * FalkorDB-Backed Project Memory Retrieval & Recording Service (FailureChain Phase 3)
 * - Uses ONLY fixed, parameterized Cypher query templates with bounded traversals and explicit LIMITs.
 * - Never executes model-generated Cypher.
 * - Supports recording Bugs, Fixes, Commits, and Technical Decisions, and retrieving contextual
 *   graph evidence for developer debugging questions.
 * - Preserves deterministic repository-scoped stable IDs and evidence provenance.
 */

import { runQuery, validateFalkorDBConfig, sanitizeErrorMessage } from '../db/falkordb.js';
import { ensureFalkorDBSchema } from './falkordbSchema.js';
import { GraphIds, normalizePath } from './schema.js';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'what', 'where', 'when',
  'why', 'how', 'does', 'are', 'was', 'were', 'have', 'has', 'had', 'can',
  'could', 'would', 'should', 'into', 'about', 'there', 'their', 'they', 'any',
  'all', 'not', 'but', 'use', 'used', 'using'
]);

/**
 * Extracts bounded, normalized search keywords from a natural language question.
 */
export function extractSearchKeywords(question = '', maxKeywords = 12) {
  if (!question || typeof question !== 'string') {
    return [];
  }
  const cleaned = question
    .toLowerCase()
    .replace(/[^a-z0-9_./-]+/g, ' ')
    .trim();

  if (!cleaned) return [];

  const tokens = cleaned.split(/\s+/);
  const unique = [];
  const seen = new Set();

  for (const token of tokens) {
    const trimmed = token.replace(/^[./-]+|[./-]+$/g, '');
    if (trimmed.length < 3 || STOP_WORDS.has(trimmed)) continue;
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      unique.push(trimmed);
    }
    if (unique.length >= maxKeywords) break;
  }

  return unique;
}

/**
 * Builds an interactive graph explorer subgraph from repository memory data.
 */
export function buildInteractiveGraphSubgraph(repoFullName, {
  bugsAndFixes = [],
  decisions = [],
  componentDependencies = [],
  symbols = [],
  recentCommits = [],
  componentsList = [],
  branches = [],
  pullRequests = [],
  issues = [],
  sliceTarget = null
} = {}) {
  const nodesMap = new Map();
  const edges = [];
  const seenEdges = new Set();

  function addNode(node) {
    if (!node?.id) return;
    if (!nodesMap.has(node.id)) {
      nodesMap.set(node.id, {
        ...node,
        type: node.type || node.label
      });
    }
  }

  function addEdge(source, target, type, details = {}) {
    if (!source || !target || source === target) return;
    const key = `${source}--${type}-->${target}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    edges.push({
      id: key,
      source,
      target,
      type,
      details
    });
  }

  const repoId = GraphIds.repository(repoFullName);
  addNode({
    id: repoId,
    label: 'Repository',
    title: repoFullName,
    subtitle: 'GitHub Repository Root',
    provenance: 'Repository Scan',
    details: {
      fullName: repoFullName,
      entityType: 'Repository'
    }
  });

  // 1. Components & Component Dependencies: Repository -> Component -> Dependency
  for (const comp of componentsList) {
    const compPath = comp.componentPath || comp.path || 'root';
    const compId = GraphIds.component(repoFullName, compPath);
    addNode({
      id: compId,
      label: 'Component',
      title: compPath,
      subtitle: comp.componentRole || comp.role || 'Architectural Component',
      provenance: 'Static Source Analysis',
      details: {
        path: compPath,
        role: comp.componentRole || comp.role || 'Module',
        repoFullName
      }
    });
    addEdge(repoId, compId, 'REPOSITORY_HAS_COMPONENT', {
      provenance: 'Directory Role Classification'
    });
  }

  for (const dep of componentDependencies) {
    const srcId = GraphIds.component(repoFullName, dep.sourceComponent);
    const tgtId = GraphIds.component(repoFullName, dep.targetComponent);
    addNode({
      id: srcId,
      label: 'Component',
      title: dep.sourceComponent,
      subtitle: 'Component',
      provenance: 'Static Source Analysis',
      details: { path: dep.sourceComponent }
    });
    addNode({
      id: tgtId,
      label: 'Component',
      title: dep.targetComponent,
      subtitle: 'Component',
      provenance: 'Static Source Analysis',
      details: { path: dep.targetComponent }
    });
    addEdge(repoId, srcId, 'REPOSITORY_HAS_COMPONENT', { provenance: 'Static Source Analysis' });
    addEdge(repoId, tgtId, 'REPOSITORY_HAS_COMPONENT', { provenance: 'Static Source Analysis' });
    addEdge(srcId, tgtId, 'COMPONENT_DEPENDS_ON_COMPONENT', {
      evidenceFile: dep.evidenceFile,
      importedFile: dep.importedFile,
      provenance: `Import statement in ${dep.evidenceFile || 'source'}`
    });
  }

  // 2. Technical Decisions: Decision -> Related Component
  for (const d of decisions) {
    const decId = d.id || GraphIds.decision(repoFullName, d.title);
    const compPath = d.componentPath || 'root';
    const compId = GraphIds.component(repoFullName, compPath);

    addNode({
      id: compId,
      label: 'Component',
      title: compPath,
      subtitle: d.componentRole || 'Component',
      provenance: 'Static Source Analysis',
      details: { path: compPath }
    });
    addEdge(repoId, compId, 'REPOSITORY_HAS_COMPONENT', { provenance: 'Static Source Analysis' });

    addNode({
      id: decId,
      label: 'TechnicalDecision',
      title: d.title,
      subtitle: `Decision (${d.status || 'accepted'})`,
      provenance: 'Explicitly Recorded Decision',
      details: {
        title: d.title,
        rationale: d.rationale,
        status: d.status || 'accepted',
        affectedComponent: compPath
      }
    });
    addEdge(decId, compId, 'DECISION_AFFECTS_COMPONENT', {
      rationale: d.rationale,
      provenance: 'Explicitly Recorded Decision'
    });
  }

  // 3. Bugs & Fixes: Bug -> Affected Component & Fix -> Bug (-> Commit)
  for (const b of bugsAndFixes) {
    const bugId = b.bugId || GraphIds.bug(repoFullName, b.title);
    const compPath = b.componentPath || 'root';
    const compId = GraphIds.component(repoFullName, compPath);

    addNode({
      id: compId,
      label: 'Component',
      title: compPath,
      subtitle: 'Component',
      provenance: 'Static Source Analysis',
      details: { path: compPath }
    });
    addEdge(repoId, compId, 'REPOSITORY_HAS_COMPONENT', { provenance: 'Static Source Analysis' });

    addNode({
      id: bugId,
      label: 'Bug',
      title: b.title,
      subtitle: `Bug (${b.severity || 'medium'} · ${b.status || 'open'})`,
      provenance: 'Explicitly Recorded Bug',
      details: {
        title: b.title,
        description: b.description,
        severity: b.severity || 'medium',
        status: b.status || 'open',
        symptoms: b.symptoms || 'None specified',
        filePath: b.filePath || 'N/A',
        componentPath: compPath
      }
    });
    addEdge(bugId, compId, 'BUG_AFFECTS_COMPONENT', {
      filePath: b.filePath || null,
      provenance: 'Explicitly Recorded Bug'
    });

    if (b.filePath) {
      const bugFileId = GraphIds.file(repoFullName, b.filePath);
      addNode({
        id: bugFileId,
        label: 'File',
        title: b.filePath,
        subtitle: 'Source File',
        provenance: 'Repository Scan',
        details: {
          path: b.filePath,
          component: compPath
        }
      });
      addEdge(compId, bugFileId, 'COMPONENT_CONTAINS_FILE', { provenance: 'Directory Structure' });
      addEdge(bugId, bugFileId, 'BUG_AFFECTS_FILE', { provenance: 'Explicitly Recorded Bug' });
    }

    if (b.fixSummary || b.fixId) {
      const fixId = b.fixId || GraphIds.fix(repoFullName, b.fixSummary);
      addNode({
        id: fixId,
        label: 'Fix',
        title: b.fixSummary || 'Recorded Fix',
        subtitle: b.commitSha ? `Fix (Commit ${b.commitSha.slice(0, 7)})` : 'Recorded Fix',
        provenance: 'Explicitly Recorded Fix',
        details: {
          summary: b.fixSummary,
          description: b.fixDescription || b.fixSummary,
          relatedBug: b.title,
          filePath: b.filePath || 'N/A',
          commitSha: b.commitSha || 'N/A'
        }
      });
      addEdge(fixId, bugId, 'FIX_RESOLVES_BUG', {
        commitSha: b.commitSha || null,
        provenance: 'Explicitly Recorded Fix'
      });

      if (b.commitSha) {
        const commitId = GraphIds.commit(repoFullName, b.commitSha);
        addNode({
          id: commitId,
          label: 'Commit',
          title: b.commitSha.slice(0, 7),
          subtitle: b.commitMessage || 'Commit',
          provenance: 'Git Commit Metadata',
          details: {
            sha: b.commitSha,
            message: b.commitMessage || b.fixSummary
          }
        });
        addEdge(fixId, commitId, 'FIX_APPLIED_IN_COMMIT', {
          provenance: 'Explicitly Recorded Fix'
        });
      }
    }
  }

  // 4. Top Source Symbols, Files, Calls, and Tests
  const symbolIdByName = new Map();
  const boundedSymbols = symbols.slice(0, 14);

  for (const s of boundedSymbols) {
    const fileId = GraphIds.file(repoFullName, s.filePath);
    const topSeg = (s.filePath || '').includes('/') ? s.filePath.split('/')[0] : 'root';
    const owningCompId = GraphIds.component(repoFullName, topSeg);

    addNode({
      id: fileId,
      label: 'File',
      title: s.filePath,
      subtitle: 'Source File',
      provenance: 'Repository Scan',
      details: {
        path: s.filePath,
        component: topSeg,
        parserPrecision: s.parserPrecision
      }
    });

    if (nodesMap.has(owningCompId)) {
      addEdge(owningCompId, fileId, 'COMPONENT_CONTAINS_FILE', { provenance: 'Directory Structure' });
    } else {
      addEdge(repoId, fileId, 'REPOSITORY_CONTAINS_FILE', { provenance: 'GitHub Git Trees API' });
    }

    addNode({
      id: s.id,
      label: s.kind || 'Symbol',
      title: `${s.name}()`,
      subtitle: `${s.kind} (${s.filePath}:L${s.startLine}-${s.endLine})`,
      provenance: 'Static AST / Lexical Parser',
      details: {
        name: s.name,
        kind: s.kind,
        filePath: s.filePath,
        lines: `L${s.startLine}-L${s.endLine}`,
        startLine: s.startLine,
        endLine: s.endLine,
        parserPrecision: s.parserPrecision,
        calls: (s.callsSymbols || []).join(', ') || 'None',
        calledBy: (s.calledBySymbols || []).join(', ') || 'None',
        coveredByTests: (s.coveredByTests || []).join(', ') || 'None',
        changedInCommits: (s.changedInCommits || []).join(', ') || 'None'
      }
    });
    symbolIdByName.set(s.name, s.id);

    addEdge(fileId, s.id, 'FILE_DEFINES_SYMBOL', {
      lines: `L${s.startLine}-L${s.endLine}`,
      provenance: 'Static AST / Lexical Parser'
    });

    if (Array.isArray(s.coveredByTests) && s.coveredByTests.length > 0) {
      for (const testName of s.coveredByTests.slice(0, 2)) {
        const testId = GraphIds.test(repoFullName, s.filePath, testName);
        addNode({
          id: testId,
          label: 'Test',
          title: testName,
          subtitle: `Test covering ${s.name}()`,
          provenance: 'Static Test Extraction',
          details: {
            testName,
            coversSymbol: s.name,
            filePath: s.filePath
          }
        });
        addEdge(testId, s.id, 'TEST_COVERS_SYMBOL', {
          provenance: 'Static Test Extraction'
        });
      }
    }
  }

  for (const s of boundedSymbols) {
    if (Array.isArray(s.callsSymbols)) {
      for (const calleeName of s.callsSymbols) {
        const calleeId = symbolIdByName.get(calleeName);
        if (calleeId && calleeId !== s.id) {
          addEdge(s.id, calleeId, 'SYMBOL_CALLS_SYMBOL', {
            caller: s.name,
            callee: calleeName,
            filePath: s.filePath,
            provenance: 'Static Call Graph Extraction'
          });
        }
      }
    }
  }

  // 5. Recent Commits & Changed Files
  for (const c of (recentCommits || []).slice(0, 5)) {
    if (!c?.sha) continue;
    const commitId = GraphIds.commit(repoFullName, c.sha);
    addNode({
      id: commitId,
      label: 'Commit',
      title: c.shortSha || c.sha.slice(0, 7),
      subtitle: c.message || 'Repository Commit',
      provenance: 'Git Commit Metadata',
      details: {
        sha: c.sha,
        shortSha: c.shortSha || c.sha.slice(0, 7),
        message: c.message,
        author: c.author,
        date: c.date,
        changedFiles: (c.changedFiles || []).join(', ') || 'N/A'
      }
    });
    addEdge(repoId, commitId, 'REPOSITORY_HAS_COMMIT', { provenance: 'Git Commit Metadata' });

    for (const changedPath of (c.changedFiles || []).slice(0, 3)) {
      const fId = GraphIds.file(repoFullName, changedPath);
      if (nodesMap.has(fId)) {
        addEdge(commitId, fId, 'COMMIT_CHANGED_FILE', {
          commitSha: c.shortSha || c.sha.slice(0, 7),
          filePath: changedPath,
          provenance: 'Git Commit Diff'
        });
      }
    }
  }

  // 6. Provider Branches
  for (const b of (branches || []).slice(0, 6)) {
    if (!b?.name) continue;
    const branchId = GraphIds.branch(repoFullName, b.name);
    addNode({
      id: branchId,
      label: 'Branch',
      title: b.name,
      subtitle: b.isDefault ? 'Default Branch' : 'Branch',
      provenance: 'Git Repository Provider',
      details: {
        name: b.name,
        commitSha: b.commitSha,
        isDefault: Boolean(b.isDefault),
        protected: Boolean(b.protected)
      }
    });
    addEdge(repoId, branchId, 'REPOSITORY_HAS_BRANCH', { provenance: 'Git Provider Metadata' });

    if (b.commitSha) {
      const headCommitId = GraphIds.commit(repoFullName, b.commitSha);
      if (nodesMap.has(headCommitId)) {
        addEdge(branchId, headCommitId, 'BRANCH_HEAD_COMMIT', { provenance: 'Git Provider Metadata' });
      }
    }
  }

  // 7. Provider Pull Requests
  for (const pr of (pullRequests || []).slice(0, 5)) {
    if (!pr?.number) continue;
    const prId = GraphIds.pullRequest(repoFullName, pr.number);
    addNode({
      id: prId,
      label: 'PullRequest',
      title: `PR #${pr.number}: ${pr.title}`,
      subtitle: `${pr.head || 'branch'} → ${pr.base || 'main'} (${pr.state || 'open'})`,
      provenance: 'Git Repository Provider',
      details: {
        number: pr.number,
        title: pr.title,
        author: pr.author,
        head: pr.head,
        base: pr.base,
        state: pr.state
      }
    });
    addEdge(repoId, prId, 'REPOSITORY_HAS_PR', { provenance: 'Git Provider Metadata' });
  }

  // 8. Provider Issues
  for (const iss of (issues || []).slice(0, 5)) {
    if (!iss?.number) continue;
    const issueId = GraphIds.issue(repoFullName, iss.number);
    addNode({
      id: issueId,
      label: 'Issue',
      title: `Issue #${iss.number}: ${iss.title}`,
      subtitle: `Issue #${iss.number} (${iss.state || 'open'})`,
      provenance: 'Git Repository Provider',
      details: {
        number: iss.number,
        title: iss.title,
        author: iss.author,
        state: iss.state,
        labels: (iss.labels || []).join(', ')
      }
    });
    addEdge(repoId, issueId, 'REPOSITORY_HAS_ISSUE', { provenance: 'Git Provider Metadata' });
  }

  // Revision slicing: if sliceTarget is provided, isolate the revision subgraph
  if (sliceTarget?.type && sliceTarget?.id) {
    const targetKey = String(sliceTarget.id).toLowerCase();
    const matchedNode = Array.from(nodesMap.values()).find(n => 
      n.id.toLowerCase().includes(targetKey) || 
      n.title.toLowerCase().includes(targetKey) ||
      (n.details?.sha && n.details.sha.toLowerCase().startsWith(targetKey)) ||
      (n.details?.number && String(n.details.number) === targetKey)
    );

    if (matchedNode) {
      const sliceNodeIds = new Set([repoId, matchedNode.id]);
      for (const e of edges) {
        if (e.source === matchedNode.id) sliceNodeIds.add(e.target);
        if (e.target === matchedNode.id) sliceNodeIds.add(e.source);
      }
      for (const e of edges) {
        if (sliceNodeIds.has(e.source) && (e.type === 'FILE_DEFINES_SYMBOL' || e.type === 'TEST_COVERS_SYMBOL')) {
          sliceNodeIds.add(e.target);
        }
      }

      const slicedNodes = Array.from(nodesMap.values()).filter(n => sliceNodeIds.has(n.id));
      const slicedEdges = edges.filter(e => sliceNodeIds.has(e.source) && sliceNodeIds.has(e.target));
      return {
        nodes: slicedNodes,
        edges: slicedEdges,
        slicedTarget: matchedNode.id
      };
    }
  }

  return {
    nodes: Array.from(nodesMap.values()),
    edges
  };
}

/**
 * Fixed, parameterized Cypher query templates for FalkorDB.
 * All traversals are bounded to 1 hop and capped with explicit LIMIT parameters.
 * Subqueries follow openCypher standard (CALL { WITH r, b WITH r, b WHERE ... }).
 */
export const FALKORDB_CYPHER_TEMPLATES = Object.freeze({
  UPSERT_BUG_AND_FIX: `
    MERGE (r:Repository { id: $repoId })
    ON CREATE SET r.fullName = $repoFullName, r.updatedAt = $now
    MERGE (b:Bug { id: $bug.id })
    SET b.repoFullName = $repoFullName,
        b.title = $bug.title,
        b.description = $bug.description,
        b.severity = $bug.severity,
        b.status = $bug.status,
        b.symptoms = $bug.symptoms,
        b.filePath = $bug.filePath,
        b.componentPath = $bug.componentPath,
        b.introducedInCommit = $bug.introducedInCommit,
        b.isResolution = $bug.isResolution,
        b.incidentId = $bug.incidentId,
        b.updatedAt = $now,
        b.createdAt = coalesce(b.createdAt, $bug.createdAt)
    WITH r, b
    CALL {
      WITH r, b
      WITH r, b
      WHERE $component.id IS NOT NULL
      MERGE (c:Component { id: $component.id })
      ON CREATE SET c.repoFullName = $repoFullName,
                    c.path = $component.path,
                    c.name = $component.name,
                    c.role = coalesce($component.role, 'Module')
      MERGE (r)-[:REPOSITORY_HAS_COMPONENT]->(c)
      MERGE (b)-[:BUG_AFFECTS_COMPONENT]->(c)
      RETURN count(c) AS compLinked
    }
    CALL {
      WITH r, b
      WITH r, b
      WHERE $file.id IS NOT NULL
      MERGE (f:File { id: $file.id })
      ON CREATE SET f.repoFullName = $repoFullName,
                    f.path = $file.path,
                    f.name = $file.name,
                    f.parserPrecision = 'file-level-only'
      MERGE (r)-[:REPOSITORY_CONTAINS_FILE]->(f)
      MERGE (b)-[:BUG_AFFECTS_FILE]->(f)
      RETURN count(f) AS fileLinked
    }
    CALL {
      WITH b
      WITH b
      WHERE $fix.id IS NOT NULL
      MERGE (fx:Fix { id: $fix.id })
      SET fx.repoFullName = $repoFullName,
          fx.summary = $fix.summary,
          fx.description = $fix.description,
          fx.filePath = $fix.filePath,
          fx.commitSha = $fix.commitSha,
          fx.updatedAt = $now,
          fx.createdAt = coalesce(fx.createdAt, $fix.createdAt)
      MERGE (fx)-[:FIX_RESOLVES_BUG]->(b)
      WITH fx
      WHERE $commit.id IS NOT NULL
      MERGE (cm:Commit { id: $commit.id })
      ON CREATE SET cm.repoFullName = $repoFullName,
                    cm.sha = $commit.sha,
                    cm.shortSha = $commit.shortSha,
                    cm.role = coalesce($commit.role, 'historical_fix'),
                    cm.message = coalesce($commit.message, $fix.summary),
                    cm.date = $commit.date
      MERGE (fx)-[:FIX_APPLIED_IN_COMMIT]->(cm)
      RETURN count(fx) AS fixLinked
    }
    RETURN b.id AS bugId
  `,

  UPSERT_TECHNICAL_DECISION: `
    MERGE (r:Repository { id: $repoId })
    ON CREATE SET r.fullName = $repoFullName, r.updatedAt = $now
    MERGE (d:TechnicalDecision { id: $decision.id })
    SET d.repoFullName = $repoFullName,
        d.title = $decision.title,
        d.rationale = $decision.rationale,
        d.status = $decision.status,
        d.componentPath = $decision.componentPath,
        d.updatedAt = $now,
        d.createdAt = coalesce(d.createdAt, $decision.createdAt)
    WITH r, d
    CALL {
      WITH r, d
      WITH r, d
      WHERE $component.id IS NOT NULL
      MERGE (c:Component { id: $component.id })
      ON CREATE SET c.repoFullName = $repoFullName,
                    c.path = $component.path,
                    c.name = $component.name,
                    c.role = 'Module'
      MERGE (r)-[:REPOSITORY_HAS_COMPONENT]->(c)
      MERGE (d)-[:DECISION_AFFECTS_COMPONENT]->(c)
      RETURN count(c) AS compLinked
    }
    RETURN d.id AS decisionId
  `,

  RETRIEVE_BUGS_AND_FIXES: `
    MATCH (b:Bug { repoFullName: $repoFullName })
    OPTIONAL MATCH (b)-[:BUG_AFFECTS_COMPONENT]->(c:Component)
    OPTIONAL MATCH (b)-[:BUG_AFFECTS_FILE]->(f:File)
    OPTIONAL MATCH (fx:Fix)-[:FIX_RESOLVES_BUG]->(b)
    OPTIONAL MATCH (fx)-[:FIX_APPLIED_IN_COMMIT]->(cm:Commit)
    WITH b, c, f, fx, cm,
         size([kw IN $keywords WHERE
           toLower(coalesce(b.title, '')) CONTAINS kw OR
           toLower(coalesce(b.description, '')) CONTAINS kw OR
           toLower(coalesce(b.symptoms, '')) CONTAINS kw OR
           toLower(coalesce(b.filePath, '')) CONTAINS kw OR
           toLower(coalesce(c.path, '')) CONTAINS kw OR
           toLower(coalesce(fx.summary, '')) CONTAINS kw OR
           toLower(coalesce(fx.description, '')) CONTAINS kw
         ]) AS relevanceScore
    RETURN b.id AS bugId,
           b.title AS title,
           b.description AS description,
           b.severity AS severity,
           b.status AS status,
           b.symptoms AS symptoms,
           coalesce(f.path, b.filePath) AS filePath,
           coalesce(c.path, b.componentPath) AS componentPath,
           fx.id AS fixId,
           fx.summary AS fixSummary,
           fx.description AS fixDescription,
           coalesce(cm.sha, fx.commitSha) AS commitSha,
           cm.shortSha AS commitShortSha,
           cm.role AS commitRole,
           cm.message AS commitMessage,
           b.introducedInCommit AS introducedInCommit,
           b.isResolution AS isResolution,
           b.incidentId AS incidentId,
           relevanceScore
    ORDER BY relevanceScore DESC, b.createdAt DESC
    LIMIT $limit
  `,

  RETRIEVE_DECISIONS_AND_DEPENDENCIES: `
    MATCH (r:Repository { id: $repoId })-[:REPOSITORY_HAS_COMPONENT]->(c:Component)
    OPTIONAL MATCH (d:TechnicalDecision)-[:DECISION_AFFECTS_COMPONENT]->(c)
    OPTIONAL MATCH (c)-[dep:COMPONENT_DEPENDS_ON_COMPONENT]->(target:Component)
    RETURN c.path AS componentPath,
           c.role AS componentRole,
           collect(DISTINCT CASE WHEN d IS NOT NULL THEN {
             id: d.id,
             title: d.title,
             rationale: d.rationale,
             status: d.status
           } END) AS decisions,
           collect(DISTINCT CASE WHEN target IS NOT NULL THEN {
             targetComponent: target.path,
             evidenceFile: dep.evidenceFile,
             importedFile: dep.importedFile
           } END) AS dependencies
    LIMIT $limit
  `,

  RETRIEVE_SYMBOLS_AND_CALLS: `
    MATCH (s:Symbol { repoFullName: $repoFullName })
    WITH s,
         size([kw IN $keywords WHERE
           toLower(s.name) CONTAINS kw OR
           toLower(s.filePath) CONTAINS kw
         ]) AS score
    OPTIONAL MATCH (s)-[:SYMBOL_CALLS_SYMBOL]->(callee:Symbol)
    OPTIONAL MATCH (caller:Symbol)-[:SYMBOL_CALLS_SYMBOL]->(s)
    OPTIONAL MATCH (t:Test)-[:TEST_COVERS_SYMBOL]->(s)
    OPTIONAL MATCH (cm:Commit)-[:COMMIT_CHANGED_SYMBOL]->(s)
    RETURN s.id AS id,
           s.name AS name,
           s.kind AS kind,
           s.filePath AS filePath,
           s.startLine AS startLine,
           s.endLine AS endLine,
           s.parserPrecision AS parserPrecision,
           collect(DISTINCT callee.name)[0..6] AS callsSymbols,
           collect(DISTINCT caller.name)[0..6] AS calledBySymbols,
           collect(DISTINCT t.name)[0..5] AS coveredByTests,
           collect(DISTINCT cm.shortSha)[0..5] AS changedInCommits,
           score
    ORDER BY score DESC, s.filePath ASC, s.startLine ASC
    LIMIT $limit
  `,

  RETRIEVE_RECENT_COMMITS: `
    MATCH (cm:Commit { repoFullName: $repoFullName })
    OPTIONAL MATCH (cm)-[:COMMIT_CHANGED_FILE]->(f:File)
    RETURN cm.sha AS sha,
           cm.shortSha AS shortSha,
           cm.message AS message,
           cm.author AS author,
           cm.date AS date,
           collect(DISTINCT f.path)[0..10] AS changedFiles
    ORDER BY cm.date DESC
    LIMIT $limit
  `,

  RETRIEVE_REPO_COUNTS: `
    MATCH (r:Repository { id: $repoId })
    OPTIONAL MATCH (f:File { repoFullName: $repoFullName })
    WITH r, count(DISTINCT f) AS filesCount
    OPTIONAL MATCH (c:Component { repoFullName: $repoFullName })
    WITH r, filesCount, count(DISTINCT c) AS componentsCount
    OPTIONAL MATCH (s:Symbol { repoFullName: $repoFullName })
    WITH r, filesCount, componentsCount, count(DISTINCT s) AS symbolsCount
    OPTIONAL MATCH (d:TechnicalDecision { repoFullName: $repoFullName })
    WITH r, filesCount, componentsCount, symbolsCount, count(DISTINCT d) AS decisionsCount
    OPTIONAL MATCH (b:Bug { repoFullName: $repoFullName })
    WITH r, filesCount, componentsCount, symbolsCount, decisionsCount, count(DISTINCT b) AS bugsCount
    OPTIONAL MATCH (fx:Fix { repoFullName: $repoFullName })
    WITH r, filesCount, componentsCount, symbolsCount, decisionsCount, bugsCount, count(DISTINCT fx) AS fixesCount
    OPTIONAL MATCH (cm:Commit { repoFullName: $repoFullName })
    WITH r, filesCount, componentsCount, symbolsCount, decisionsCount, bugsCount, fixesCount, count(DISTINCT cm) AS commitsCount
    OPTIONAL MATCH (n { repoFullName: $repoFullName })-[rel]->()
    RETURN filesCount,
           componentsCount,
           symbolsCount,
           decisionsCount,
           bugsCount,
           fixesCount,
           commitsCount,
           count(DISTINCT rel) + filesCount + componentsCount AS relationshipsCount
  `
});

/**
 * Records a Bug, optional Fix, optional Commit, and optional TechnicalDecision into FalkorDB.
 */
export async function recordFalkorDBMemoryEntry(input = {}, options = {}) {
  if (!input || typeof input !== 'object') {
    throw new Error('Memory entry payload must be a valid object.');
  }

  const repoFullName = normalizePath(input.repoFullName || '').toLowerCase();
  if (!repoFullName || !repoFullName.includes('/')) {
    throw new Error('A valid repository fullName (e.g., "owner/repo") is required.');
  }

  const entryType = input.type || 'bug_fix';
  const repoId = GraphIds.repository(repoFullName);
  const nowIso = options.timestamp || new Date().toISOString();

  // Case A: Standalone Technical Decision
  if (entryType === 'decision') {
    const title = String(input.title || input.decisionTitle || '').trim();
    const rationale = String(input.rationale || input.decisionRationale || '').trim();
    if (!title || !rationale) {
      throw new Error('Both decision title and rationale are required.');
    }

    await ensureFalkorDBSchema(options);

    const compPath = normalizePath(input.componentPath || 'root') || 'root';
    const decisionId = GraphIds.decision(repoFullName, input.id || title);
    const component = {
      id: GraphIds.component(repoFullName, compPath),
      path: compPath,
      name: compPath.split('/').pop() || 'root'
    };

    await runQuery(
      FALKORDB_CYPHER_TEMPLATES.UPSERT_TECHNICAL_DECISION,
      {
        repoId,
        repoFullName,
        now: nowIso,
        decision: {
          id: decisionId,
          title: title.slice(0, 200),
          rationale: rationale.slice(0, 2000),
          status: String(input.status || 'accepted').slice(0, 40),
          componentPath: compPath,
          createdAt: nowIso
        },
        component
      },
      options
    );

    return {
      recorded: true,
      type: 'decision',
      repoFullName,
      decisionId,
      componentPath: compPath
    };
  }

  // Case B: Bug + Fix + Component/File/Commit (+ optional Decision)
  const bugTitle = String(input.bugTitle || input.title || '').trim();
  const bugDescription = String(input.bugDescription || input.description || '').trim();

  if (!bugTitle || !bugDescription) {
    throw new Error('Both bugTitle and bugDescription are required to record a bug.');
  }

  await ensureFalkorDBSchema(options);

  const bugId = GraphIds.bug(repoFullName, input.bugId || bugTitle);
  const filePath = input.filePath ? normalizePath(input.filePath) : null;
  const rawCompPath = input.componentPath
    ? normalizePath(input.componentPath)
    : filePath && filePath.includes('/')
      ? filePath.split('/')[0]
      : 'root';

  const component = {
    id: GraphIds.component(repoFullName, rawCompPath),
    path: rawCompPath,
    name: rawCompPath.split('/').pop() || 'root',
    role: input.componentRole || 'Module'
  };

  const file = filePath
    ? {
        id: GraphIds.file(repoFullName, filePath),
        path: filePath,
        name: filePath.split('/').pop()
      }
    : { id: null, path: null, name: null };

  const fixSummary = String(input.fixSummary || '').trim();
  const fixDescription = String(input.fixDescription || '').trim();
  const hasFix = Boolean(fixSummary || fixDescription);
  const fixId = hasFix ? GraphIds.fix(repoFullName, input.fixId || fixSummary || `${bugTitle}-fix`) : null;

  const commitSha = input.commitSha ? String(input.commitSha).trim() : null;
  const commit = commitSha
    ? {
        id: GraphIds.commit(repoFullName, commitSha),
        sha: commitSha,
        shortSha: commitSha.slice(0, 7),
        role: input.commitRole || 'historical_fix',
        message: input.commitMessage || fixSummary || `Fix for ${bugTitle}`,
        date: nowIso
      }
    : { id: null, sha: null, shortSha: null, role: null, message: null, date: null };

  await runQuery(
    FALKORDB_CYPHER_TEMPLATES.UPSERT_BUG_AND_FIX,
    {
      repoId,
      repoFullName,
      now: nowIso,
      bug: {
        id: bugId,
        title: bugTitle.slice(0, 200),
        description: bugDescription.slice(0, 2000),
        severity: String(input.severity || 'medium').toLowerCase(),
        status: hasFix ? 'resolved' : String(input.status || 'open').toLowerCase(),
        symptoms: String(input.symptoms || '').slice(0, 1000),
        filePath,
        componentPath: rawCompPath,
        introducedInCommit: input.introducedInCommit ? String(input.introducedInCommit).trim() : null,
        isResolution: Boolean(input.isResolution),
        incidentId: input.incidentId ? String(input.incidentId).trim() : null,
        createdAt: nowIso
      },
      component,
      file,
      fix: {
        id: fixId,
        summary: (fixSummary || fixDescription).slice(0, 300),
        description: (fixDescription || fixSummary).slice(0, 2000),
        filePath,
        commitSha,
        createdAt: nowIso
      },
      commit
    },
    options
  );

  let decisionId = null;
  if (input.decisionTitle && input.decisionRationale) {
    decisionId = GraphIds.decision(repoFullName, input.decisionTitle);
    await runQuery(
      FALKORDB_CYPHER_TEMPLATES.UPSERT_TECHNICAL_DECISION,
      {
        repoId,
        repoFullName,
        now: nowIso,
        decision: {
          id: decisionId,
          title: String(input.decisionTitle).trim().slice(0, 200),
          rationale: String(input.decisionRationale).trim().slice(0, 2000),
          status: 'accepted',
          componentPath: rawCompPath,
          createdAt: nowIso
        },
        component
      },
      options
    );
  }

  return {
    recorded: true,
    type: 'bug_fix',
    repoFullName,
    bugId,
    fixId,
    commitId: commit.id,
    decisionId,
    componentPath: rawCompPath,
    filePath
  };
}

/**
 * Retrieves structured graph context (bugs, fixes, decisions, component dependencies,
 * source symbols with line numbers, and recent commits) for a repository and question from FalkorDB.
 */
export async function retrieveFalkorDBGraphContextForQuestion(repoFullNameInput, question = '', options = {}) {
  const repoFullName = normalizePath(repoFullNameInput || '').toLowerCase();
  if (!repoFullName) {
    return {
      available: false,
      status: 'invalid_input',
      reason: 'Repository fullName is required for graph retrieval.'
    };
  }

  const env = options.env || process.env;
  const validation = validateFalkorDBConfig(env);
  if (!validation.valid && !options.forceWithMock) {
    return {
      available: false,
      status: validation.partiallyConfigured ? 'invalid_config' : 'unconfigured',
      reason: 'FalkorDB is not configured; using static repository context only.'
    };
  }

  const keywords = extractSearchKeywords(question, 12);
  const repoId = GraphIds.repository(repoFullName);
  const maxBugs = Math.min(Math.max(Number(options.maxBugs) || 8, 1), 20);
  const maxComponents = Math.min(Math.max(Number(options.maxComponents) || 12, 1), 25);
  const maxSymbols = Math.min(Math.max(Number(options.maxSymbols) || 15, 1), 30);
  const maxCommits = Math.min(Math.max(Number(options.maxCommits) || 5, 1), 15);

  const queryOpts = {
    env,
    graph: options.graph,
    accessMode: 'READ'
  };

  try {
    const [bugsRes, decisionsRes, symbolsRes, commitsRes] = await Promise.all([
      runQuery(
        FALKORDB_CYPHER_TEMPLATES.RETRIEVE_BUGS_AND_FIXES,
        { repoFullName, keywords, limit: maxBugs },
        queryOpts
      ),
      runQuery(
        FALKORDB_CYPHER_TEMPLATES.RETRIEVE_DECISIONS_AND_DEPENDENCIES,
        { repoId, limit: maxComponents },
        queryOpts
      ),
      runQuery(
        FALKORDB_CYPHER_TEMPLATES.RETRIEVE_SYMBOLS_AND_CALLS,
        { repoFullName, keywords, limit: maxSymbols },
        queryOpts
      ),
      runQuery(
        FALKORDB_CYPHER_TEMPLATES.RETRIEVE_RECENT_COMMITS,
        { repoFullName, limit: maxCommits },
        queryOpts
      )
    ]);

    const bugsAndFixes = (bugsRes.records || []).map(r => ({
      bugId: r.bugId,
      title: r.title,
      description: r.description,
      severity: r.severity,
      status: r.status,
      symptoms: r.symptoms,
      filePath: r.filePath,
      componentPath: r.componentPath,
      fixId: r.fixId,
      fixSummary: r.fixSummary,
      fixDescription: r.fixDescription,
      commitSha: r.commitSha,
      commitShortSha: r.commitShortSha || (r.commitSha ? r.commitSha.slice(0, 7) : null),
      commitRole: r.commitRole || (r.commitSha ? 'historical_fix' : null),
      commitMessage: r.commitMessage,
      introducedInCommit: r.introducedInCommit || null,
      isResolution: Boolean(r.isResolution),
      incidentId: r.incidentId || null,
      relevanceScore: Number(r.relevanceScore || 0)
    }));

    const decisions = [];
    const componentDependencies = [];
    for (const row of decisionsRes.records || []) {
      for (const d of (row.decisions || []).filter(Boolean)) {
        decisions.push({
          ...d,
          componentPath: row.componentPath,
          componentRole: row.componentRole
        });
      }
      for (const dep of (row.dependencies || []).filter(Boolean)) {
        componentDependencies.push({
          sourceComponent: row.componentPath,
          targetComponent: dep.targetComponent,
          evidenceFile: dep.evidenceFile,
          importedFile: dep.importedFile
        });
      }
    }

    const symbols = (symbolsRes.records || []).map(s => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      filePath: s.filePath,
      startLine: Number(s.startLine || 1),
      endLine: Number(s.endLine || 1),
      parserPrecision: s.parserPrecision,
      callsSymbols: (s.callsSymbols || []).filter(Boolean),
      calledBySymbols: (s.calledBySymbols || []).filter(Boolean),
      coveredByTests: (s.coveredByTests || []).filter(Boolean),
      changedInCommits: (s.changedInCommits || []).filter(Boolean),
      relevanceScore: Number(s.score || 0)
    }));

    const recentCommits = (commitsRes.records || []).map(c => ({
      sha: c.sha,
      shortSha: c.shortSha,
      message: c.message,
      author: c.author,
      date: c.date,
      changedFiles: (c.changedFiles || []).filter(Boolean)
    }));

    const hasEvidence =
      bugsAndFixes.length > 0 ||
      decisions.length > 0 ||
      componentDependencies.length > 0 ||
      symbols.length > 0 ||
      recentCommits.length > 0;

    return {
      available: true,
      status: 'ok',
      repoFullName,
      keywords,
      hasEvidence,
      bugsAndFixes,
      decisions,
      componentDependencies,
      symbols,
      recentCommits
    };
  } catch (err) {
    const safeMsg = sanitizeErrorMessage(err.message, env.FALKORDB_PASSWORD);
    return {
      available: false,
      status: 'error',
      repoFullName,
      error: safeMsg,
      bugsAndFixes: [],
      decisions: [],
      componentDependencies: [],
      symbols: [],
      recentCommits: []
    };
  }
}

/**
 * Formats retrieved FalkorDB graph context into a structured Markdown section for Gemini prompt grounding.
 */
export function formatFalkorDBGraphEvidenceMarkdown(graphContext) {
  if (!graphContext || !graphContext.available || !graphContext.hasEvidence) {
    return `## FalkorDB Project Memory Graph
- No prior bugs, fixes, decisions, or symbol graph records were found in FalkorDB for this repository.`;
  }

  const sections = ['## FalkorDB Project Memory Graph Evidence (Confirmed Graph Facts)'];

  if (graphContext.bugsAndFixes?.length > 0) {
    const lines = graphContext.bugsAndFixes.map(b => {
      const loc = [
        b.componentPath ? `Component: \`${b.componentPath}\`` : null,
        b.filePath ? `File: \`${b.filePath}\`` : null,
        b.commitSha ? `Commit: \`${b.commitSha}\`` : null
      ].filter(Boolean).join(' | ');
      const fixLine = b.fixSummary
        ? `\n  - **Recorded Fix**: ${b.fixSummary}${b.fixDescription && b.fixDescription !== b.fixSummary ? ` — ${b.fixDescription}` : ''}`
        : '\n  - **Recorded Fix**: None recorded yet (status: open)';
      return `- **Bug [${b.severity?.toUpperCase() || 'MEDIUM'} / ${b.status || 'open'}]**: ${b.title} (${loc || 'Repository-wide'})\n  - **Details**: ${b.description}${b.symptoms ? ` | Symptoms: ${b.symptoms}` : ''}${fixLine}`;
    });
    sections.push(`### Recorded Past Bugs & Fixes\n${lines.join('\n')}`);
  }

  if (graphContext.decisions?.length > 0) {
    const lines = graphContext.decisions.map(
      d => `- **${d.title}** (Component: \`${d.componentPath}\`, Status: ${d.status || 'accepted'}): ${d.rationale}`
    );
    sections.push(`### Recorded Technical Decisions\n${lines.join('\n')}`);
  }

  if (graphContext.componentDependencies?.length > 0) {
    const lines = graphContext.componentDependencies.map(
      dep => `- Component \`${dep.sourceComponent}\` depends on \`${dep.targetComponent}\` (verified import in \`${dep.evidenceFile}\` -> \`${dep.importedFile}\`)`
    );
    sections.push(`### Verified Component Dependencies (from Import Graph)\n${lines.join('\n')}`);
  }

  if (graphContext.symbols?.length > 0) {
    const lines = graphContext.symbols.map(s => {
      const calls = s.callsSymbols?.length ? ` | Calls: ${s.callsSymbols.map(c => `\`${c}\``).join(', ')}` : '';
      const calledBy = s.calledBySymbols?.length ? ` | Called by: ${s.calledBySymbols.map(c => `\`${c}\``).join(', ')}` : '';
      const tests = s.coveredByTests?.length ? ` | Covered by tests: ${s.coveredByTests.map(t => `"${t}"`).join(', ')}` : '';
      const commits = s.changedInCommits?.length ? ` | Changed in commits: ${s.changedInCommits.map(c => `\`${c}\``).join(', ')}` : '';
      return `- \`${s.name}\` (${s.kind} in \`${s.filePath}:L${s.startLine}-L${s.endLine}\`)${calls}${calledBy}${tests}${commits}`;
    });
    sections.push(`### Verified Source Symbols & Call Graph (JS/TS Parser)\n${lines.join('\n')}`);
  }

  if (graphContext.recentCommits?.length > 0) {
    const lines = graphContext.recentCommits.map(c => {
      const files = c.changedFiles?.length ? ` — Changed files: ${c.changedFiles.map(f => `\`${f}\``).join(', ')}` : '';
      return `- Commit \`${c.shortSha || c.sha}\` (${c.author}, ${c.date}): "${c.message}"${files}`;
    });
    sections.push(`### Recent Repository Commits\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * Retrieves full Project Memory overview, counts, stored records, and interactive graph subgraph
 * for a repository from FalkorDB.
 */
export async function getFalkorDBRepositoryMemoryOverview(repoFullNameInput, options = {}) {
  const repoFullName = normalizePath(repoFullNameInput || '').toLowerCase();
  if (!repoFullName || !repoFullName.includes('/')) {
    throw new Error('A valid repository fullName (e.g., "owner/repo") is required.');
  }

  const env = options.env || process.env;
  const validation = validateFalkorDBConfig(env);
  if (!validation.valid && !options.forceWithMock) {
    return {
      available: false,
      connected: false,
      configured: validation.configured,
      status: validation.partiallyConfigured ? 'invalid_config' : 'unconfigured',
      repoFullName,
      message: 'FalkorDB is not configured. Set FALKORDB_HOST in .env to enable persistent Project Memory.',
      counts: {
        files: 0,
        components: 0,
        symbols: 0,
        decisions: 0,
        bugs: 0,
        fixes: 0,
        commits: 0,
        relationships: 0
      },
      bugsAndFixes: [],
      decisions: [],
      componentDependencies: [],
      symbols: [],
      recentCommits: [],
      graph: { nodes: [], edges: [] }
    };
  }

  const repoId = GraphIds.repository(repoFullName);
  const queryOpts = {
    env,
    graph: options.graph,
    accessMode: 'READ'
  };

  try {
    const [countsRes, contextRes, compRowsRes] = await Promise.all([
      runQuery(
        FALKORDB_CYPHER_TEMPLATES.RETRIEVE_REPO_COUNTS,
        { repoId, repoFullName },
        queryOpts
      ),
      retrieveFalkorDBGraphContextForQuestion(repoFullName, options.query || '', {
        ...options,
        maxBugs: 20,
        maxComponents: 25,
        maxSymbols: 25,
        maxCommits: 10
      }),
      runQuery(
        FALKORDB_CYPHER_TEMPLATES.RETRIEVE_DECISIONS_AND_DEPENDENCIES,
        { repoId, limit: 25 },
        queryOpts
      )
    ]);

    const countRow = countsRes.records?.[0] || {};
    const counts = {
      files: Number(countRow.filesCount || 0),
      components: Number(countRow.componentsCount || 0),
      symbols: Number(countRow.symbolsCount || 0),
      decisions: Number(countRow.decisionsCount || (contextRes.decisions?.length || 0)),
      bugs: Number(countRow.bugsCount || (contextRes.bugsAndFixes?.length || 0)),
      fixes: Number(countRow.fixesCount || (contextRes.bugsAndFixes?.filter(b => b.fixSummary)?.length || 0)),
      commits: Number(countRow.commitsCount || (contextRes.recentCommits?.length || 0)),
      relationships: Number(countRow.relationshipsCount || 0)
    };

    const componentsList = (compRowsRes.records || []).map(r => ({
      componentPath: r.componentPath,
      componentRole: r.componentRole
    }));

    const bugsWithProvenance = (contextRes.bugsAndFixes || []).map(b => ({
      ...b,
      provenance: 'Explicitly Recorded Bug & Fix'
    }));

    const decisionsWithProvenance = (contextRes.decisions || []).map(d => ({
      ...d,
      provenance: 'Explicitly Recorded Decision'
    }));

    const depsWithProvenance = (contextRes.componentDependencies || []).map(dep => ({
      ...dep,
      provenance: 'Static Source Analysis (Import Graph)'
    }));

    const symbolsWithProvenance = (contextRes.symbols || []).map(s => ({
      ...s,
      provenance: 'Static Source Analysis (JS/TS Parser)'
    }));

    const graph = buildInteractiveGraphSubgraph(repoFullName, {
      bugsAndFixes: bugsWithProvenance,
      decisions: decisionsWithProvenance,
      componentDependencies: depsWithProvenance,
      symbols: symbolsWithProvenance,
      recentCommits: contextRes.recentCommits || [],
      componentsList,
      branches: options.branches || [],
      pullRequests: options.pullRequests || [],
      issues: options.issues || [],
      sliceTarget: options.sliceTarget || null
    });

    return {
      available: true,
      connected: true,
      configured: true,
      status: 'connected',
      repoFullName,
      counts,
      bugsAndFixes: bugsWithProvenance,
      decisions: decisionsWithProvenance,
      componentDependencies: depsWithProvenance,
      symbols: symbolsWithProvenance,
      recentCommits: contextRes.recentCommits || [],
      graph
    };
  } catch (err) {
    const safeMsg = sanitizeErrorMessage(err.message, env.FALKORDB_PASSWORD);
    return {
      available: false,
      connected: false,
      configured: true,
      status: 'error',
      repoFullName,
      error: safeMsg,
      counts: {
        files: 0,
        components: 0,
        symbols: 0,
        decisions: 0,
        bugs: 0,
        fixes: 0,
        commits: 0,
        relationships: 0
      },
      bugsAndFixes: [],
      decisions: [],
      componentDependencies: [],
      symbols: [],
      recentCommits: [],
      graph: { nodes: [], edges: [] }
    };
  }
}

