/**
 * GitLab Repository Provider Adapter
 * Implements standard provider operations for GitLab.com and self-hosted instances
 * using the GitLab v4 REST API, with token sanitization and actionable error classification.
 */

import { BaseProviderAdapter } from './base.js';

export class GitLabProviderAdapter extends BaseProviderAdapter {
  constructor(baseUrl = 'https://gitlab.com') {
    super('gitlab');
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Sanitizes error message to guarantee no authentication tokens are leaked.
   */
  _sanitizeError(message, token) {
    if (!message) return 'Unknown GitLab provider error';
    let safe = String(message);
    if (token) {
      safe = safe.replaceAll(token, '[REDACTED_GITLAB_TOKEN]');
    }
    const tokenRegex = /(?:glpat-[0-9a-zA-Z_-]{20,}|feed_token=[0-9a-zA-Z_-]+)/g;
    safe = safe.replace(tokenRegex, '[REDACTED_GITLAB_TOKEN]');
    return safe;
  }

  /**
   * Builds headers with optional GitLab token.
   */
  _getHeaders(token) {
    const activeToken = token || process.env.GITLAB_TOKEN;
    const headers = {
      'User-Agent': 'TraceForge-Repository-Intelligence',
      'Accept': 'application/json'
    };
    if (activeToken) {
      headers['PRIVATE-TOKEN'] = activeToken;
    }
    return { headers, activeToken };
  }

  /**
   * Encodes a repository path (owner/repo or group/subgroup/repo) for GitLab v4 API.
   */
  _encodeProjectPath(owner, repo) {
    const full = repo ? `${owner}/${repo}` : String(owner || '');
    return encodeURIComponent(full.replace(/^\/+|\/+$/g, ''));
  }

  /**
   * Performs fetch against GitLab API with structured error classification and returns response metadata.
   */
  async _fetchApiWithMeta(endpoint, { token, rawResponse = false } = {}) {
    const { headers, activeToken } = this._getHeaders(token);
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}/api/v4${endpoint}`;

    try {
      const res = await fetch(url, { headers });

      if (!res.ok) {
        let errBody = null;
        try {
          errBody = await res.json();
        } catch {
          // ignore
        }

        const rawMsg = errBody?.message || errBody?.error || res.statusText || 'GitLab API error';
        const sanitized = this._sanitizeError(typeof rawMsg === 'object' ? JSON.stringify(rawMsg) : rawMsg, activeToken);

        if (res.status === 401) {
          const err = new Error(
            `GitLab authentication failed: ${sanitized}. Configure GITLAB_TOKEN in server .env (e.g. Personal Access Token with read_api and read_repository scopes).`
          );
          err.code = 'UNAUTHORIZED';
          err.status = 401;
          throw err;
        }

        if (res.status === 403) {
          const err = new Error(
            `GitLab access forbidden: ${sanitized}. The provided token lacks permissions for this repository.`
          );
          err.code = 'FORBIDDEN';
          err.status = 403;
          throw err;
        }

        if (res.status === 404) {
          const err = new Error(
            `GitLab repository or resource not found or private. For private repositories, configure GITLAB_TOKEN in server .env.`
          );
          err.code = 'NOT_FOUND_OR_PRIVATE';
          err.status = 404;
          throw err;
        }

        if (res.status === 429) {
          const err = new Error(`GitLab rate limit exceeded. Configure GITLAB_TOKEN with higher limits.`);
          err.code = 'RATE_LIMITED';
          err.status = 429;
          throw err;
        }

        const err = new Error(`GitLab API error (${res.status}): ${sanitized}`);
        err.code = 'GITLAB_API_ERROR';
        err.status = res.status;
        throw err;
      }

      if (rawResponse) {
        return { data: await res.text(), headers: {} };
      }

      const data = await res.json();
      const getHeader = (h) => (res.headers?.get ? res.headers.get(h) : res.headers ? res.headers[h] : null);
      const nextPageHeader = getHeader('x-next-page');
      const totalPagesHeader = getHeader('x-total-pages');
      const totalHeader = getHeader('x-total');
      const linkHeader = getHeader('link');

      return {
        data,
        headers: {
          nextPage: nextPageHeader && String(nextPageHeader).trim() ? Number(nextPageHeader) : null,
          totalPages: totalPagesHeader && String(totalPagesHeader).trim() ? Number(totalPagesHeader) : null,
          total: totalHeader && String(totalHeader).trim() ? Number(totalHeader) : null,
          link: linkHeader || null
        }
      };
    } catch (err) {
      if (err.code) throw err;
      const safeErr = new Error(this._sanitizeError(err.message, activeToken));
      safeErr.code = 'NETWORK_ERROR';
      throw safeErr;
    }
  }

  /**
   * Performs fetch against GitLab API with structured error classification.
   */
  async _fetchApi(endpoint, options = {}) {
    const res = await this._fetchApiWithMeta(endpoint, options);
    return res.data;
  }

  parseUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('Please provide a valid GitLab repository URL.');
    }

    const cleanUrl = url.trim().replace(/\/+$/, '');
    const match = cleanUrl.match(/gitlab\.com\/([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*)\/([a-zA-Z0-9_.-]+)(?:\/-\/tree\/([a-zA-Z0-9_.-]+))?/);
    if (!match) {
      // Fallback for simple owner/repo string
      const parts = cleanUrl.split('/');
      if (parts.length >= 2) {
        const repo = parts[parts.length - 1].replace(/\.git$/, '');
        const owner = parts.slice(0, parts.length - 1).join('/');
        return {
          provider: 'gitlab',
          owner,
          repo,
          branch: null,
          fullName: `${owner}/${repo}`
        };
      }
      throw new Error('Invalid GitLab repository URL format. Example: https://gitlab.com/gitlab-org/gitlab-runner');
    }

    const owner = match[1];
    let repo = match[2];
    if (repo.endsWith('.git')) {
      repo = repo.slice(0, -4);
    }
    const branch = match[3] || null;

    return {
      provider: 'gitlab',
      owner,
      repo,
      branch,
      fullName: `${owner}/${repo}`
    };
  }

  async getRepoMetadata({ owner, repo, branch }, options = {}) {
    const projectPath = this._encodeProjectPath(owner, repo);
    const data = await this._fetchApi(`/projects/${projectPath}`, options);

    const defaultBranch = data.default_branch || 'main';
    const targetBranch = branch || defaultBranch;

    return {
      provider: 'gitlab',
      owner,
      repo,
      fullName: data.path_with_namespace || `${owner}/${repo}`,
      branch: targetBranch,
      defaultBranch,
      url: data.web_url || `https://gitlab.com/${owner}/${repo}`,
      description: data.description || 'No description provided.',
      stars: data.star_count || 0,
      forks: data.forks_count || 0,
      openIssuesCount: data.open_issues_count || 0,
      isPrivate: data.visibility === 'private',
      primaryLanguage: 'Unknown',
      license: 'None',
      createdAt: data.created_at,
      updatedAt: data.last_activity_at || data.updated_at
    };
  }

  async getBranches({ owner, repo }, options = {}) {
    const projectPath = this._encodeProjectPath(owner, repo);
    const branches = await this._fetchApi(`/projects/${projectPath}/repository/branches?per_page=30`, options);
    if (!Array.isArray(branches)) return [];

    return branches.map(b => ({
      name: b.name,
      commitSha: b.commit?.id || null,
      protected: Boolean(b.protected)
    }));
  }

  async getCommits({ owner, repo, branch, perPage = 5, page = 1 }, options = {}) {
    const projectPath = this._encodeProjectPath(owner, repo);
    const query = new URLSearchParams({
      per_page: String(Math.min(perPage, 50)),
      page: String(page)
    });
    if (branch) {
      query.set('ref_name', branch);
    }

    const commits = await this._fetchApi(`/projects/${projectPath}/repository/commits?${query.toString()}`, options);
    if (!Array.isArray(commits)) return [];

    return commits.map(c => ({
      sha: c.id,
      shortSha: c.short_id || c.id?.slice(0, 7) || '',
      message: c.message || c.title || 'No commit message',
      author: c.author_name || 'Unknown',
      date: c.created_at || c.committed_date || null,
      url: c.web_url || `https://gitlab.com/${owner}/${repo}/-/commit/${c.id}`,
      repoFullName: `${owner}/${repo}`
    }));
  }

  async getIssues({ owner, repo, state = 'opened', perPage = 5, page = 1 }, options = {}) {
    const projectPath = this._encodeProjectPath(owner, repo);
    const gitlabState = state === 'open' ? 'opened' : state;
    const query = new URLSearchParams({
      state: gitlabState,
      per_page: String(perPage),
      page: String(page),
      order_by: 'updated_at',
      sort: 'desc'
    });

    const issues = await this._fetchApi(`/projects/${projectPath}/issues?${query.toString()}`, options);
    if (!Array.isArray(issues)) return [];

    return issues.map(issue => ({
      id: issue.id,
      number: issue.iid,
      title: issue.title,
      body: issue.description || '',
      state: issue.state === 'opened' ? 'open' : issue.state,
      author: issue.author?.username || 'anonymous',
      authorAvatar: issue.author?.avatar_url || null,
      commentsCount: issue.user_notes_count || 0,
      labels: Array.isArray(issue.labels) ? issue.labels : [],
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      url: issue.web_url,
      repoFullName: `${owner}/${repo}`
    }));
  }

  async getPullRequests({ owner, repo, state = 'opened', perPage = 5, page = 1 }, options = {}) {
    const projectPath = this._encodeProjectPath(owner, repo);
    const gitlabState = state === 'open' ? 'opened' : state;
    const query = new URLSearchParams({
      state: gitlabState,
      per_page: String(perPage),
      page: String(page),
      order_by: 'updated_at',
      sort: 'desc'
    });

    const mrs = await this._fetchApi(`/projects/${projectPath}/merge_requests?${query.toString()}`, options);
    if (!Array.isArray(mrs)) return [];

    return mrs.map(mr => ({
      id: mr.id,
      number: mr.iid,
      title: mr.title,
      body: mr.description || '',
      state: mr.state === 'opened' ? 'open' : mr.state,
      author: mr.author?.username || 'anonymous',
      authorAvatar: mr.author?.avatar_url || null,
      head: mr.source_branch || 'feature',
      base: mr.target_branch || 'main',
      createdAt: mr.created_at,
      updatedAt: mr.updated_at,
      url: mr.web_url,
      repoFullName: `${owner}/${repo}`
    }));
  }

  async getPullRequestDiff({ owner, repo, pullNumber }, options = {}) {
    const projectPath = this._encodeProjectPath(owner, repo);
    const mr = await this._fetchApi(`/projects/${projectPath}/merge_requests/${pullNumber}`, options);
    const changesData = await this._fetchApi(`/projects/${projectPath}/merge_requests/${pullNumber}/changes`, options);

    const changes = changesData.changes || [];
    const changedFiles = changes.map(c => c.new_path || c.old_path);

    const rawDiff = changes.map(c => `diff --git a/${c.old_path} b/${c.new_path}\n${c.diff}`).join('\n\n');

    return {
      pullNumber: Number(pullNumber),
      title: mr.title,
      baseBranch: mr.target_branch,
      headBranch: mr.source_branch,
      changedFiles,
      rawDiff
    };
  }

  async getFileContent({ owner, repo, path, ref }, options = {}) {
    const projectPath = this._encodeProjectPath(owner, repo);
    const encodedFilePath = encodeURIComponent(path);
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    return await this._fetchApi(`/projects/${projectPath}/repository/files/${encodedFilePath}/raw${query}`, {
      ...options,
      rawResponse: true
    });
  }

  async getTree({ owner, repo, ref, recursive = true }, options = {}) {
    const projectPath = this._encodeProjectPath(owner, repo);
    const perPage = Math.min(Math.max(Number(options.perPage) || 100, 1), 100);
    const maxPages = Math.min(Math.max(Number(options.maxPages) || 10, 1), 50);
    const maxItems = Math.min(Math.max(Number(options.maxItems) || 1500, 1), 5000);

    const allItems = [];
    let currentPage = Number(options.page) || 1;
    let hasMore = true;

    while (hasMore && currentPage <= maxPages && allItems.length < maxItems) {
      const query = new URLSearchParams({
        per_page: String(perPage),
        page: String(currentPage),
        recursive: recursive ? 'true' : 'false'
      });
      if (ref) query.set('ref', ref);

      const { data, headers } = await this._fetchApiWithMeta(
        `/projects/${projectPath}/repository/tree?${query.toString()}`,
        options
      );

      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      allItems.push(...data);

      // Check pagination headers: x-next-page or Link header
      let nextPageNum = null;
      if (headers?.nextPage) {
        nextPageNum = headers.nextPage;
      } else if (headers?.link) {
        const match = headers.link.match(/[?&]page=(\d+)[^>]*>;\s*rel="next"/);
        if (match) {
          nextPageNum = Number(match[1]);
        }
      }

      if (nextPageNum && nextPageNum > currentPage) {
        currentPage = nextPageNum;
      } else if (data.length === perPage && (!headers?.totalPages || currentPage < headers.totalPages)) {
        currentPage += 1;
      } else {
        hasMore = false;
      }
    }

    const mappedTree = allItems.map(item => ({
      path: item.path,
      type: item.type === 'tree' ? 'tree' : 'blob',
      id: item.id || null,
      sha: item.id || null,
      name: item.name || item.path.split('/').pop(),
      mode: item.mode || (item.type === 'tree' ? '040000' : '100644')
    }));

    return {
      sha: ref || null,
      tree: mappedTree,
      truncated: hasMore && allItems.length >= maxItems,
      totalCount: mappedTree.length
    };
  }

  async fetchFullScan({ owner, repo, branch }, options = {}) {
    const repoMeta = await this.getRepoMetadata({ owner, repo, branch }, options);
    const targetBranch = branch || repoMeta.defaultBranch || 'main';

    let treeItems = [];
    try {
      const treeRes = await this.getTree({ owner, repo, ref: targetBranch, recursive: true }, options);
      treeItems = treeRes.tree || [];
    } catch (err) {
      if (
        err.code === 'RATE_LIMITED' ||
        err.code === 'UNAUTHORIZED' ||
        err.code === 'FORBIDDEN' ||
        err.code === 'NOT_FOUND_OR_PRIVATE'
      ) {
        throw err;
      }
      treeItems = [];
    }

    const files = [];
    const directories = new Set();
    const extensions = {};

    for (const item of treeItems) {
      if (item.type === 'blob') {
        files.push({
          path: item.path,
          size: item.size || 0,
          id: item.id || null,
          sha: item.sha || null
        });
        const parts = item.path.split('/');
        const filename = parts[parts.length - 1];
        const dotIdx = filename.lastIndexOf('.');
        if (dotIdx > 0) {
          const ext = filename.substring(dotIdx).toLowerCase();
          extensions[ext] = (extensions[ext] || 0) + 1;
        }
      } else if (item.type === 'tree') {
        directories.add(item.path);
      }
    }

    // Fetch important manifests (like package.json, CMakeLists.txt, README.md, etc.)
    const importantFilesToFetch = [
      'package.json',
      'CMakeLists.txt',
      'Cargo.toml',
      'go.mod',
      'requirements.txt',
      'pyproject.toml',
      'pom.xml',
      'build.gradle',
      'Dockerfile',
      'docker-compose.yml',
      'docker-compose.yaml',
      'README.md',
      'readme.md',
      '.env.example'
    ];

    const manifests = {};
    const filePaths = files.map(f => f.path);

    const fetchPromises = importantFilesToFetch
      .filter(targetFile => filePaths.some(p => p === targetFile || p.endsWith('/' + targetFile)))
      .slice(0, 8)
      .map(async (targetFile) => {
        const actualPath = filePaths.find(p => p === targetFile) || filePaths.find(p => p.endsWith('/' + targetFile));
        if (!actualPath) return;
        try {
          const content = await this.getFileContent({ owner, repo, path: actualPath, ref: targetBranch }, options);
          manifests[actualPath] = content;
        } catch {
          // Soft fail on individual manifest
        }
      });

    const [branchesRes, commitsRes, issuesRes, pullsRes] = await Promise.allSettled([
      this.getBranches({ owner, repo }, options),
      this.getCommits({ owner, repo, branch: targetBranch, perPage: 5 }, options),
      this.getIssues({ owner, repo, state: 'opened', perPage: 5 }, options),
      this.getPullRequests({ owner, repo, state: 'opened', perPage: 5 }, options)
    ]);

    await Promise.allSettled(fetchPromises);

    const branches = branchesRes.status === 'fulfilled' ? branchesRes.value : [];
    const commits = commitsRes.status === 'fulfilled' ? commitsRes.value : [];
    const issues = issuesRes.status === 'fulfilled' ? issuesRes.value : [];
    const pullRequests = pullsRes.status === 'fulfilled' ? pullsRes.value : [];

    return {
      repoInfo: repoMeta,
      files,
      directories: Array.from(directories),
      extensions,
      manifests,
      totalFiles: files.length,
      totalDirectories: directories.size,
      providerData: {
        provider: 'gitlab',
        branches: {
          status: branchesRes.status === 'rejected' ? 'error' : branches.length === 0 ? 'empty' : 'loaded',
          data: branches,
          error: branchesRes.status === 'rejected' ? branchesRes.reason?.message : null
        },
        commits: {
          status: commitsRes.status === 'rejected' ? 'error' : commits.length === 0 ? 'empty' : 'loaded',
          data: commits,
          error: commitsRes.status === 'rejected' ? commitsRes.reason?.message : null
        },
        issues: {
          status: issuesRes.status === 'rejected' ? 'error' : issues.length === 0 ? 'empty' : 'loaded',
          data: issues,
          error: issuesRes.status === 'rejected' ? issuesRes.reason?.message : null
        },
        pullRequests: {
          status: pullsRes.status === 'rejected' ? 'error' : pullRequests.length === 0 ? 'empty' : 'loaded',
          data: pullRequests,
          error: pullsRes.status === 'rejected' ? pullsRes.reason?.message : null
        }
      }
    };
  }
}

export const gitlabAdapter = new GitLabProviderAdapter();
