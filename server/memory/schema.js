/**
 * Project Memory Graph Schema
 * Defines node labels, relationship types, and deterministic repository-scoped identifiers.
 */

export const NODE_LABELS = Object.freeze({
  REPOSITORY: 'Repository',
  FILE: 'File',
  COMPONENT: 'Component',
  SYMBOL: 'Symbol',
  FUNCTION: 'Function',
  CLASS: 'Class',
  COMMIT: 'Commit',
  BUG: 'Bug',
  FIX: 'Fix',
  TECHNICAL_DECISION: 'TechnicalDecision',
  TEST: 'Test',
  BRANCH: 'Branch',
  PULL_REQUEST: 'PullRequest',
  ISSUE: 'Issue'
});

export const REL_TYPES = Object.freeze({
  REPOSITORY_CONTAINS_FILE: 'REPOSITORY_CONTAINS_FILE',
  REPOSITORY_HAS_COMPONENT: 'REPOSITORY_HAS_COMPONENT',
  COMPONENT_CONTAINS_FILE: 'COMPONENT_CONTAINS_FILE',
  FILE_DEFINES_SYMBOL: 'FILE_DEFINES_SYMBOL',
  SYMBOL_CALLS_SYMBOL: 'SYMBOL_CALLS_SYMBOL',
  COMPONENT_DEPENDS_ON_COMPONENT: 'COMPONENT_DEPENDS_ON_COMPONENT',
  COMMIT_CHANGED_FILE: 'COMMIT_CHANGED_FILE',
  COMMIT_CHANGED_SYMBOL: 'COMMIT_CHANGED_SYMBOL',
  BUG_AFFECTS_COMPONENT: 'BUG_AFFECTS_COMPONENT',
  BUG_AFFECTS_FILE: 'BUG_AFFECTS_FILE',
  FIX_RESOLVES_BUG: 'FIX_RESOLVES_BUG',
  FIX_APPLIED_IN_COMMIT: 'FIX_APPLIED_IN_COMMIT',
  DECISION_AFFECTS_COMPONENT: 'DECISION_AFFECTS_COMPONENT',
  TEST_COVERS_SYMBOL: 'TEST_COVERS_SYMBOL',
  REPOSITORY_HAS_BRANCH: 'REPOSITORY_HAS_BRANCH',
  BRANCH_HEAD_COMMIT: 'BRANCH_HEAD_COMMIT',
  REPOSITORY_HAS_PR: 'REPOSITORY_HAS_PR',
  REPOSITORY_HAS_ISSUE: 'REPOSITORY_HAS_ISSUE',
  PR_AFFECTS_FILE: 'PR_AFFECTS_FILE',
  ISSUE_AFFECTS_FILE: 'ISSUE_AFFECTS_FILE'
});

/**
 * Normalizes a repository full name (owner/repo) or path segment for stable IDs.
 */
export function normalizePath(p = '') {
  return String(p)
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

export function slugify(text = '') {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

/**
 * Generates deterministic, repository-scoped identifiers for all graph entities.
 */
export const GraphIds = {
  repository(repoFullName) {
    return normalizePath(repoFullName).toLowerCase();
  },
  component(repoFullName, componentPath) {
    const repoKey = normalizePath(repoFullName).toLowerCase();
    const normComp = normalizePath(componentPath) || 'root';
    return `${repoKey}::component::${normComp}`;
  },
  file(repoFullName, filePath) {
    const repoKey = normalizePath(repoFullName).toLowerCase();
    const normFile = normalizePath(filePath);
    return `${repoKey}::file::${normFile}`;
  },
  symbol(repoFullName, filePath, kind, symbolName) {
    const repoKey = normalizePath(repoFullName).toLowerCase();
    const normFile = normalizePath(filePath);
    const normKind = String(kind || 'symbol').toLowerCase();
    return `${repoKey}::symbol::${normFile}::${normKind}::${String(symbolName).trim()}`;
  },
  test(repoFullName, filePath, testName) {
    const repoKey = normalizePath(repoFullName).toLowerCase();
    const normFile = normalizePath(filePath);
    return `${repoKey}::test::${normFile}::${slugify(testName)}`;
  },
  commit(repoFullName, sha) {
    const repoKey = normalizePath(repoFullName).toLowerCase();
    const cleanSha = String(sha || '').trim().toLowerCase();
    return `${repoKey}::commit::${cleanSha}`;
  },
  bug(repoFullName, keyOrTitle) {
    const repoKey = normalizePath(repoFullName).toLowerCase();
    return `${repoKey}::bug::${slugify(keyOrTitle)}`;
  },
  fix(repoFullName, keyOrSummary) {
    const repoKey = normalizePath(repoFullName).toLowerCase();
    return `${repoKey}::fix::${slugify(keyOrSummary)}`;
  },
  decision(repoFullName, keyOrTitle) {
    const repoKey = normalizePath(repoFullName).toLowerCase();
    return `${repoKey}::decision::${slugify(keyOrTitle)}`;
  },
  branch(repoFullName, name) {
    const repoKey = normalizePath(repoFullName).toLowerCase();
    return `${repoKey}::branch::${slugify(name)}`;
  },
  pullRequest(repoFullName, number) {
    const repoKey = normalizePath(repoFullName).toLowerCase();
    return `${repoKey}::pr::${number}`;
  },
  issue(repoFullName, number) {
    const repoKey = normalizePath(repoFullName).toLowerCase();
    return `${repoKey}::issue::${number}`;
  }
};

