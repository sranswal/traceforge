/**
 * Bitbucket Repository Provider Adapter
 * Implements standard provider operations for Bitbucket Cloud using the 2.0 REST API,
 * with credential sanitization, pagination, and actionable error classification.
 */

import { BaseProviderAdapter } from './base.js';

export class BitbucketProviderAdapter extends BaseProviderAdapter {
  constructor(baseUrl = 'https://api.bitbucket.org/2.0') {
    super('bitbucket');
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Sanitizes error message to guarantee no authentication secrets are leaked.
   */
  _sanitizeError(message, secret) {
    if (!message) return 'Unknown Bitbucket provider error';
    let safe = String(message);
    if (secret) {
      safe = safe.replaceAll(secret, '[REDACTED_BITBUCKET_SECRET]');
    }
    return safe;
  }

  /**
   * Builds headers with optional Bitbucket Bearer token or Basic Auth app password.
   */
  _getHeaders(token) {
    const activeToken = token || process.env.BITBUCKET_TOKEN;
    const username = process.env.BITBUCKET_USERNAME;
    const appPassword = process.env.BITBUCKET_APP_PASSWORD;

    const headers = {
      'User-Agent': 'TraceForge-Repository-Intelligence',
      'Accept': 'application/json'
    };

    let activeSecret = null;
    if (activeToken) {
      headers['Authorization'] = `Bearer ${activeToken}`;
      activeSecret = activeToken;
    } else if (username && appPassword) {
      const basic = Buffer.from(`${username}:${appPassword}`).toString('base64');
      headers['Authorization'] = `Basic ${basic}`;
      activeSecret = appPassword;
    }

    return { headers, activeSecret };
  }

  /**
   * Performs fetch against Bitbucket 2.0 API with structured error classification.
   */
  async _fetchApi(endpoint, { token, rawResponse = false } = {}) {
    const { headers, activeSecret } = this._getHeaders(token);
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

    try {
      const res = await fetch(url, { headers });

      if (!res.ok) {
        let errBody = null;
        try {
          errBody = await res.json();
        } catch {
          // ignore
        }

        const rawMsg = errBody?.error?.message || errBody?.message || res.statusText || 'Bitbucket API error';
        const sanitized = this._sanitizeError(rawMsg, activeSecret);

        if (res.status === 401) {
          const err = new Error(
            `Bitbucket authentication failed: ${sanitized}. Configure BITBUCKET_TOKEN (or BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD) in server .env.`
          );
          err.code = 'UNAUTHORIZED';
          err.status = 401;
          throw err;
        }

        if (res.status === 403) {
          const err = new Error(
            `Bitbucket access forbidden: ${sanitized}. Verify repository permissions or configure BITBUCKET_TOKEN in server .env.`
          );
          err.code = 'FORBIDDEN';
          err.status = 403;
          throw err;
        }

        if (res.status === 404) {
          const err = new Error(
            `Bitbucket repository or resource not found or private. For private repositories, configure BITBUCKET_TOKEN in server .env.`
          );
          err.code = 'NOT_FOUND_OR_PRIVATE';
          err.status = 404;
          throw err;
        }

        if (res.status === 429) {
          const err = new Error(`Bitbucket API rate limit exceeded. Configure authentication credentials to raise limits.`);
          err.code = 'RATE_LIMITED';
          err.status = 429;
          throw err;
        }

        const err = new Error(`Bitbucket API error (${res.status}): ${sanitized}`);
        err.code = 'BITBUCKET_API_ERROR';
        err.status = res.status;
        throw err;
      }

      if (rawResponse) {
        return await res.text();
      }
      return await res.json();
    } catch (err) {
      if (err.code) throw err;
      const safeErr = new Error(this._sanitizeError(err.message, activeSecret));
      safeErr.code = 'NETWORK_ERROR';
      throw safeErr;
    }
  }

  parseUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('Please provide a valid Bitbucket repository URL.');
    }

    const cleanUrl = url.trim().replace(/\/+$/, '');
    const match = cleanUrl.match(/bitbucket\.org\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/src\/([a-zA-Z0-9_.-]+))?/);
    if (!match) {
      // Fallback for simple workspace/repo string
      const parts = cleanUrl.split('/');
      if (parts.length === 2) {
        const repo = parts[1].replace(/\.git$/, '');
        return {
          provider: 'bitbucket',
          owner: parts[0],
          repo,
          branch: null,
          fullName: `${parts[0]}/${repo}`
        };
      }
      throw new Error('Invalid Bitbucket repository URL format. Example: https://bitbucket.org/workspace/repository');
    }

    const owner = match[1];
    let repo = match[2];
    if (repo.endsWith('.git')) {
      repo = repo.slice(0, -4);
    }
    const branch = match[3] || null;

    return {
      provider: 'bitbucket',
      owner,
      repo,
      branch,
      fullName: `${owner}/${repo}`
    };
  }

  async getRepoMetadata({ owner, repo, branch }, options = {}) {
    const data = await this._fetchApi(`/repositories/${owner}/${repo}`, options);

    const defaultBranch = data.mainbranch?.name || 'main';
    const targetBranch = branch || defaultBranch;

    return {
      provider: 'bitbucket',
      owner,
      repo,
      fullName: data.full_name || `${owner}/${repo}`,
      branch: targetBranch,
      defaultBranch,
      url: data.links?.html?.href || `https://bitbucket.org/${owner}/${repo}`,
      description: data.description || 'No description provided.',
      stars: 0,
      forks: 0,
      openIssuesCount: 0,
      isPrivate: Boolean(data.is_private),
      primaryLanguage: data.language || 'Unknown',
      license: 'None',
      createdAt: data.created_on,
      updatedAt: data.updated_on
    };
  }

  async getBranches({ owner, repo }, options = {}) {
    const data = await this._fetchApi(`/repositories/${owner}/${repo}/refs/branches?pagelen=30`, options);
    const values = data.values || [];

    return values.map(b => ({
      name: b.name,
      commitSha: b.target?.hash || null,
      protected: false
    }));
  }

  async getCommits({ owner, repo, branch, perPage = 5, page = 1 }, options = {}) {
    const query = new URLSearchParams({
      pagelen: String(Math.min(perPage, 50)),
      page: String(page)
    });
    const branchSegment = branch ? `/${encodeURIComponent(branch)}` : '';

    const data = await this._fetchApi(`/repositories/${owner}/${repo}/commits${branchSegment}?${query.toString()}`, options);
    const values = data.values || [];

    return values.map(c => ({
      sha: c.hash,
      shortSha: c.hash ? c.hash.slice(0, 7) : '',
      message: c.message || 'No commit message',
      author: c.author?.user?.display_name || c.author?.raw || 'Unknown',
      date: c.date || null,
      url: c.links?.html?.href || `https://bitbucket.org/${owner}/${repo}/commits/${c.hash}`,
      repoFullName: `${owner}/${repo}`
    }));
  }

  async getIssues({ owner, repo, state = 'open', perPage = 5, page = 1 }, options = {}) {
    const query = new URLSearchParams({
      pagelen: String(perPage),
      page: String(page),
      sort: '-updated_on'
    });
    if (state && state !== 'all') {
      query.set('q', `state="${state}"`);
    }

    try {
      const data = await this._fetchApi(`/repositories/${owner}/${repo}/issues?${query.toString()}`, options);
      const values = data.values || [];

      return values.map(issue => ({
        id: issue.id,
        number: issue.id,
        title: issue.title,
        body: issue.content?.raw || '',
        state: issue.state === 'open' || issue.state === 'new' ? 'open' : issue.state,
        author: issue.reporter?.display_name || 'anonymous',
        authorAvatar: issue.reporter?.links?.avatar?.href || null,
        commentsCount: issue.comments_count || 0,
        labels: [],
        createdAt: issue.created_on,
        updatedAt: issue.updated_on,
        url: issue.links?.html?.href || `https://bitbucket.org/${owner}/${repo}/issues/${issue.id}`,
        repoFullName: `${owner}/${repo}`
      }));
    } catch (err) {
      // Bitbucket issue tracker is optional per repository. If disabled (404), return empty array honestly
      if (err.status === 404 && err.message.includes('issues')) {
        return [];
      }
      throw err;
    }
  }

  async getPullRequests({ owner, repo, state = 'OPEN', perPage = 5, page = 1 }, options = {}) {
    const query = new URLSearchParams({
      pagelen: String(perPage),
      page: String(page),
      state: state.toUpperCase(),
      sort: '-updated_on'
    });

    const data = await this._fetchApi(`/repositories/${owner}/${repo}/pullrequests?${query.toString()}`, options);
    const values = data.values || [];

    return values.map(pr => ({
      id: pr.id,
      number: pr.id,
      title: pr.title,
      body: pr.description || '',
      state: pr.state === 'OPEN' ? 'open' : pr.state.toLowerCase(),
      author: pr.author?.display_name || 'anonymous',
      authorAvatar: pr.author?.links?.avatar?.href || null,
      head: pr.source?.branch?.name || 'feature',
      base: pr.destination?.branch?.name || 'main',
      createdAt: pr.created_on,
      updatedAt: pr.updated_on,
      url: pr.links?.html?.href || `https://bitbucket.org/${owner}/${repo}/pull-requests/${pr.id}`,
      repoFullName: `${owner}/${repo}`
    }));
  }

  async getPullRequestDiff({ owner, repo, pullNumber }, options = {}) {
    const rawDiff = await this._fetchApi(`/repositories/${owner}/${repo}/pullrequests/${pullNumber}/diff`, {
      ...options,
      rawResponse: true
    });

    const fileMatches = rawDiff.match(/diff --git a\/(.*?) b\/(.*?)(?:\n|$)/g) || [];
    const changedFiles = fileMatches.map(m => {
      const match = m.match(/diff --git a\/(.*?) b\/(.*)/);
      return match ? match[2].trim() : '';
    }).filter(Boolean);

    return {
      pullNumber: Number(pullNumber),
      title: `Bitbucket PR #${pullNumber}`,
      changedFiles,
      rawDiff
    };
  }

  async getFileContent({ owner, repo, path, ref }, options = {}) {
    const targetRef = ref || 'HEAD';
    return await this._fetchApi(`/repositories/${owner}/${repo}/src/${encodeURIComponent(targetRef)}/${path}`, {
      ...options,
      rawResponse: true
    });
  }

  async getTree({ owner, repo, ref, recursive = true }, options = {}) {
    const targetRef = ref || 'HEAD';
    const data = await this._fetchApi(`/repositories/${owner}/${repo}/src/${encodeURIComponent(targetRef)}/?pagelen=100`, options);
    const values = data.values || [];

    return {
      tree: values.map(item => ({
        path: item.path,
        type: item.type === 'commit_directory' ? 'tree' : 'blob'
      }))
    };
  }

  async fetchFullScan({ owner, repo, branch }, options = {}) {
    const repoMeta = await this.getRepoMetadata({ owner, repo, branch }, options);
    const targetBranch = branch || repoMeta.defaultBranch || 'main';

    let treeItems = [];
    try {
      const treeRes = await this.getTree({ owner, repo, ref: targetBranch, recursive: true }, options);
      treeItems = treeRes.tree || [];
    } catch {
      treeItems = [];
    }

    const files = [];
    const directories = new Set();
    const extensions = {};

    for (const item of treeItems) {
      if (item.type === 'blob') {
        files.push({ path: item.path, size: 0 });
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

    const [branchesRes, commitsRes, issuesRes, pullsRes] = await Promise.allSettled([
      this.getBranches({ owner, repo }, options),
      this.getCommits({ owner, repo, branch: targetBranch, perPage: 5 }, options),
      this.getIssues({ owner, repo, state: 'open', perPage: 5 }, options),
      this.getPullRequests({ owner, repo, state: 'OPEN', perPage: 5 }, options)
    ]);

    const branches = branchesRes.status === 'fulfilled' ? branchesRes.value : [];
    const commits = commitsRes.status === 'fulfilled' ? commitsRes.value : [];
    const issues = issuesRes.status === 'fulfilled' ? issuesRes.value : [];
    const pullRequests = pullsRes.status === 'fulfilled' ? pullsRes.value : [];

    return {
      repoInfo: repoMeta,
      files,
      directories: Array.from(directories),
      extensions,
      manifests: {},
      totalFiles: files.length,
      totalDirectories: directories.size,
      providerData: {
        provider: 'bitbucket',
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

export const bitbucketAdapter = new BitbucketProviderAdapter();
