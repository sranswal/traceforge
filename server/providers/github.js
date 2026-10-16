/**
 * GitHub Repository Provider Adapter
 * Implements standard provider operations with server-side authentication,
 * pagination, rate-limit awareness, and honest error classification.
 */

import { BaseProviderAdapter } from './base.js';

export class GitHubProviderAdapter extends BaseProviderAdapter {
  constructor() {
    super('github');
  }

  /**
   * Sanitizes error message to guarantee no auth tokens are ever leaked.
   */
  _sanitizeError(message, token) {
    if (!message) return 'Unknown GitHub provider error';
    let safe = String(message);
    if (token) {
      safe = safe.replaceAll(token, '[REDACTED_GITHUB_TOKEN]');
    }
    const tokenRegex = /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}/g;
    safe = safe.replace(tokenRegex, '[REDACTED_GITHUB_TOKEN]');
    return safe;
  }

  /**
   * Builds headers with optional server-side token.
   */
  _getHeaders(token, customAccept = 'application/vnd.github.v3+json') {
    const activeToken = token || process.env.GITHUB_TOKEN;
    const headers = {
      'User-Agent': 'TraceForge-Repository-Intelligence',
      'Accept': customAccept
    };
    if (activeToken) {
      headers['Authorization'] = `token ${activeToken}`;
    }
    return { headers, activeToken };
  }

  /**
   * Performs fetch with structured error classification.
   */
  async _fetchApi(url, { token, accept, rawResponse = false } = {}) {
    const { headers, activeToken } = this._getHeaders(token, accept);
    try {
      const res = await fetch(url, { headers });

      if (!res.ok) {
        const resetHeader = res.headers.get('x-ratelimit-reset');
        const remaining = res.headers.get('x-ratelimit-remaining');

        let errBody = null;
        try {
          errBody = await res.json();
        } catch {
          // ignore
        }

        const rawMsg = errBody?.message || res.statusText || 'GitHub API error';
        const sanitized = this._sanitizeError(rawMsg, activeToken);

        if (res.status === 401) {
          const err = new Error(`GitHub authentication failed: ${sanitized}`);
          err.code = 'UNAUTHORIZED';
          err.status = 401;
          throw err;
        }

        if (res.status === 403 || res.status === 429) {
          const resetTime = resetHeader ? new Date(parseInt(resetHeader, 10) * 1000).toLocaleTimeString() : 'shortly';
          const err = new Error(`GitHub API rate limit exceeded (resets at ${resetTime}). Configure GITHUB_TOKEN on server.`);
          err.code = 'RATE_LIMITED';
          err.status = 429;
          err.resetTime = resetTime;
          err.remaining = remaining;
          throw err;
        }

        if (res.status === 404) {
          const err = new Error(`GitHub resource not found or private repository.`);
          err.code = 'NOT_FOUND_OR_PRIVATE';
          err.status = 404;
          throw err;
        }

        const err = new Error(`GitHub API error (${res.status}): ${sanitized}`);
        err.code = 'GITHUB_API_ERROR';
        err.status = res.status;
        throw err;
      }

      if (rawResponse) {
        return await res.text();
      }
      return await res.json();
    } catch (err) {
      if (err.code) throw err;
      const safeErr = new Error(this._sanitizeError(err.message, activeToken));
      safeErr.code = 'NETWORK_ERROR';
      throw safeErr;
    }
  }

  parseUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('Please provide a valid GitHub repository URL.');
    }

    const cleanUrl = url.trim().replace(/\/+$/, '');
    const match = cleanUrl.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/tree\/([a-zA-Z0-9_.-]+))?/);
    if (!match) {
      throw new Error('Invalid GitHub repository URL format. Example: https://github.com/facebook/react');
    }

    const owner = match[1];
    let repo = match[2];
    if (repo.endsWith('.git')) {
      repo = repo.slice(0, -4);
    }
    const branch = match[3] || null;

    return {
      provider: 'github',
      owner,
      repo,
      branch,
      fullName: `${owner}/${repo}`
    };
  }

  async getRepoMetadata({ owner, repo, branch }, options = {}) {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    const data = await this._fetchApi(url, { token: options.token });

    const targetBranch = branch || data.default_branch || 'main';

    return {
      provider: 'github',
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      branch: targetBranch,
      defaultBranch: data.default_branch || 'main',
      url: data.html_url || `https://github.com/${owner}/${repo}`,
      description: data.description || 'No description provided.',
      stars: data.stargazers_count || 0,
      forks: data.forks_count || 0,
      openIssuesCount: data.open_issues_count || 0,
      isPrivate: Boolean(data.private),
      primaryLanguage: data.language || 'Unknown',
      license: data.license ? data.license.spdx_id || data.license.name : 'None',
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      pushedAt: data.pushed_at
    };
  }

  async getBranches({ owner, repo }, options = {}) {
    const url = `https://api.github.com/repos/${owner}/${repo}/branches?per_page=30`;
    try {
      const branches = await this._fetchApi(url, { token: options.token });
      if (!Array.isArray(branches)) return [];
      return branches.map(b => ({
        name: b.name,
        commitSha: b.commit?.sha || null,
        protected: Boolean(b.protected)
      }));
    } catch (err) {
      throw err;
    }
  }

  async getCommits({ owner, repo, branch, perPage = 10, page = 1 }, options = {}) {
    const query = new URLSearchParams({
      per_page: String(Math.min(perPage, 50)),
      page: String(page)
    });
    if (branch) {
      query.set('sha', branch);
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/commits?${query.toString()}`;
    try {
      const commits = await this._fetchApi(url, { token: options.token });
      if (!Array.isArray(commits)) return [];

      return commits.map(c => ({
        sha: c.sha,
        shortSha: c.sha?.slice(0, 7) || '',
        message: c.commit?.message || 'No commit message',
        author: c.commit?.author?.name || c.author?.login || 'Unknown',
        date: c.commit?.author?.date || c.commit?.committer?.date || null,
        url: c.html_url || `https://github.com/${owner}/${repo}/commit/${c.sha}`,
        repoFullName: `${owner}/${repo}`
      }));
    } catch (err) {
      throw err;
    }
  }

  async getIssues({ owner, repo, state = 'open', perPage = 5, page = 1 }, options = {}) {
    const targetOffset = (page - 1) * perPage;
    const targetTotal = targetOffset + perPage;
    const accumulatedPureIssues = [];
    let currentApiPage = 1;
    const maxApiPages = 5; // Safety bound

    try {
      while (accumulatedPureIssues.length < targetTotal && currentApiPage <= maxApiPages) {
        const query = new URLSearchParams({
          state,
          per_page: '100',
          page: String(currentApiPage),
          sort: 'updated',
          direction: 'desc'
        });

        const url = `https://api.github.com/repos/${owner}/${repo}/issues?${query.toString()}`;
        const rawItems = await this._fetchApi(url, { token: options.token });
        if (!Array.isArray(rawItems) || rawItems.length === 0) break;

        // GitHub includes Pull Requests in the issues endpoint; filter pure issues only
        for (const item of rawItems) {
          if (!item.pull_request) {
            accumulatedPureIssues.push(item);
          }
        }

        // If GitHub returned fewer than 100 items, there are no further pages
        if (rawItems.length < 100) break;

        currentApiPage += 1;
      }

      const sliced = accumulatedPureIssues.slice(targetOffset, targetOffset + perPage);

      return sliced.map(issue => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        state: issue.state,
        author: issue.user?.login || 'anonymous',
        authorAvatar: issue.user?.avatar_url || null,
        commentsCount: issue.comments || 0,
        labels: Array.isArray(issue.labels) ? issue.labels.map(l => (typeof l === 'string' ? l : l.name)) : [],
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        url: issue.html_url,
        repoFullName: `${owner}/${repo}`
      }));
    } catch (err) {
      throw err;
    }
  }

  async getPullRequests({ owner, repo, state = 'open', perPage = 5, page = 1 }, options = {}) {
    const query = new URLSearchParams({
      state,
      per_page: String(Math.min(perPage, 50)),
      page: String(page),
      sort: 'updated',
      direction: 'desc'
    });

    const url = `https://api.github.com/repos/${owner}/${repo}/pulls?${query.toString()}`;
    try {
      const rawPulls = await this._fetchApi(url, { token: options.token });
      if (!Array.isArray(rawPulls)) return [];

      return rawPulls.map(pr => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        body: pr.body || '',
        state: pr.state,
        author: pr.user?.login || 'anonymous',
        authorAvatar: pr.user?.avatar_url || null,
        base: pr.base?.ref || 'main',
        head: pr.head?.ref || 'feature',
        baseSha: pr.base?.sha || null,
        headSha: pr.head?.sha || null,
        draft: Boolean(pr.draft),
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        url: pr.html_url,
        repoFullName: `${owner}/${repo}`
      }));
    } catch (err) {
      throw err;
    }
  }

  async getPullRequestDiff({ owner, repo, pullNumber }, options = {}) {
    const filesUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/files`;
    const diffUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`;

    const [filesResult, rawDiff] = await Promise.allSettled([
      this._fetchApi(filesUrl, { token: options.token }),
      this._fetchApi(diffUrl, { token: options.token, accept: 'application/vnd.github.v3.diff', rawResponse: true })
    ]);

    const changedFiles = filesResult.status === 'fulfilled' && Array.isArray(filesResult.value)
      ? filesResult.value.map(f => ({
          filename: f.filename,
          status: f.status, // 'modified' | 'added' | 'removed'
          additions: f.additions || 0,
          deletions: f.deletions || 0,
          changes: f.changes || 0,
          patch: f.patch || null
        }))
      : [];

    return {
      pullNumber: Number(pullNumber),
      rawDiff: rawDiff.status === 'fulfilled' ? rawDiff.value : '',
      changedFiles,
      totalFilesChanged: changedFiles.length
    };
  }

  async getFileContent({ owner, repo, path, ref }, options = {}) {
    const targetRef = ref || 'main';
    // 1. Try raw.githubusercontent.com first (zero API rate-limit cost)
    try {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${targetRef}/${path}`;
      const res = await fetch(rawUrl);
      if (res.ok) {
        return await res.text();
      }
    } catch {
      // Fall through to API
    }

    // 2. Fall back to GitHub contents API
    const contentUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${targetRef}`;
    const data = await this._fetchApi(contentUrl, { token: options.token });
    if (data && data.content && data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf8');
    }
    throw new Error(`Unable to read content for ${path}`);
  }

  async getTree({ owner, repo, ref, recursive = true }, options = {}) {
    const targetRef = ref || 'main';
    const recParam = recursive ? '?recursive=1' : '';
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${targetRef}${recParam}`;
    return await this._fetchApi(url, { token: options.token });
  }

  /**
   * High-performance full repository scan combining metadata, git trees, manifests,
   * branches, recent commits, open issues, and PRs.
   */
  async fetchFullScan({ owner, repo, branch }, options = {}) {
    // 1. Metadata
    const repoMeta = await this.getRepoMetadata({ owner, repo, branch }, options);
    const targetBranch = branch || repoMeta.defaultBranch || 'main';

    // 2. Git Tree
    let rawTree = [];
    try {
      const treeData = await this.getTree({ owner, repo, ref: targetBranch, recursive: true }, options);
      rawTree = treeData.tree || [];
    } catch {
      // Fallback: root contents
      try {
        const rootContents = await this._fetchApi(`https://api.github.com/repos/${owner}/${repo}/contents`, { token: options.token });
        if (Array.isArray(rootContents)) {
          rawTree = rootContents.map(item => ({
            path: item.path,
            type: item.type === 'dir' ? 'tree' : 'blob',
            size: item.size || 0
          }));
        }
      } catch {
        rawTree = [];
      }
    }

    const files = [];
    const directories = new Set();
    const extensions = {};

    for (const item of rawTree) {
      if (item.type === 'blob') {
        files.push({ path: item.path, size: item.size || 0 });
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

    // 3. Manifests (parallel raw fetch)
    const importantFilesToFetch = [
      'package.json',
      'go.mod',
      'Cargo.toml',
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

    // 4. Fetch branches, commits, issues, and PRs concurrently
    const [branchesRes, commitsRes, issuesRes, pullsRes] = await Promise.allSettled([
      this.getBranches({ owner, repo }, options),
      this.getCommits({ owner, repo, branch: targetBranch, perPage: 8 }, options),
      this.getIssues({ owner, repo, state: 'open', perPage: 5 }, options),
      this.getPullRequests({ owner, repo, state: 'open', perPage: 5 }, options)
    ]);

    await Promise.allSettled(fetchPromises);

    const branches = branchesRes.status === 'fulfilled' ? branchesRes.value : [];
    const commits = commitsRes.status === 'fulfilled' ? commitsRes.value : [];
    const issues = issuesRes.status === 'fulfilled' ? issuesRes.value : [];
    const pullRequests = pullsRes.status === 'fulfilled' ? pullsRes.value : [];

    const branchesError = branchesRes.status === 'rejected' ? branchesRes.reason?.message : null;
    const commitsError = commitsRes.status === 'rejected' ? commitsRes.reason?.message : null;
    const issuesError = issuesRes.status === 'rejected' ? issuesRes.reason?.message : null;
    const pullsError = pullsRes.status === 'rejected' ? pullsRes.reason?.message : null;

    return {
      repoInfo: repoMeta,
      files,
      directories: Array.from(directories),
      extensions,
      manifests,
      totalFiles: files.length,
      totalDirectories: directories.size,
      providerData: {
        provider: 'github',
        branches: {
          status: branchesError ? 'error' : branches.length === 0 ? 'empty' : 'loaded',
          data: branches,
          error: branchesError
        },
        commits: {
          status: commitsError ? 'error' : commits.length === 0 ? 'empty' : 'loaded',
          data: commits,
          error: commitsError
        },
        issues: {
          status: issuesError ? 'error' : issues.length === 0 ? 'empty' : 'loaded',
          data: issues,
          error: issuesError
        },
        pullRequests: {
          status: pullsError ? 'error' : pullRequests.length === 0 ? 'empty' : 'loaded',
          data: pullRequests,
          error: pullsError
        }
      }
    };
  }
}

export const githubAdapter = new GitHubProviderAdapter();
