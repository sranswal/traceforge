/**
 * Base Repository Provider Adapter Interface
 * Defines common operations for repository metadata, branches, commits,
 * files, diffs, pull requests, issues, and pagination.
 */

export class BaseProviderAdapter {
  constructor(name = 'base') {
    this.name = name;
  }

  /**
   * Parses repository URL into structured components.
   * @param {string} url
   * @returns {{ provider: string, owner: string, repo: string, branch: string|null, fullName: string }}
   */
  parseUrl(url) {
    throw new Error(`parseUrl not implemented on ${this.name} provider adapter`);
  }

  /**
   * Fetches repository metadata.
   * @param {{ owner: string, repo: string, branch?: string }} params
   * @param {object} [options]
   */
  async getRepoMetadata({ owner, repo, branch }, options = {}) {
    throw new Error(`getRepoMetadata not implemented on ${this.name} provider adapter`);
  }

  /**
   * Fetches branches for repository.
   * @param {{ owner: string, repo: string }} params
   * @param {object} [options]
   */
  async getBranches({ owner, repo }, options = {}) {
    throw new Error(`getBranches not implemented on ${this.name} provider adapter`);
  }

  /**
   * Fetches recent commits with pagination.
   * @param {{ owner: string, repo: string, branch?: string, perPage?: number, page?: number }} params
   * @param {object} [options]
   */
  async getCommits({ owner, repo, branch, perPage = 10, page = 1 }, options = {}) {
    throw new Error(`getCommits not implemented on ${this.name} provider adapter`);
  }

  /**
   * Fetches issues with pagination and state filtering.
   * @param {{ owner: string, repo: string, state?: 'open'|'closed'|'all', perPage?: number, page?: number }} params
   * @param {object} [options]
   */
  async getIssues({ owner, repo, state = 'open', perPage = 10, page = 1 }, options = {}) {
    throw new Error(`getIssues not implemented on ${this.name} provider adapter`);
  }

  /**
   * Fetches pull requests with pagination and state filtering.
   * @param {{ owner: string, repo: string, state?: 'open'|'closed'|'all', perPage?: number, page?: number }} params
   * @param {object} [options]
   */
  async getPullRequests({ owner, repo, state = 'open', perPage = 10, page = 1 }, options = {}) {
    throw new Error(`getPullRequests not implemented on ${this.name} provider adapter`);
  }

  /**
   * Fetches details and diff for a pull request.
   * @param {{ owner: string, repo: string, pullNumber: number|string }} params
   * @param {object} [options]
   */
  async getPullRequestDiff({ owner, repo, pullNumber }, options = {}) {
    throw new Error(`getPullRequestDiff not implemented on ${this.name} provider adapter`);
  }

  /**
   * Fetches raw content for a single file.
   * @param {{ owner: string, repo: string, path: string, ref?: string }} params
   * @param {object} [options]
   */
  async getFileContent({ owner, repo, path, ref }, options = {}) {
    throw new Error(`getFileContent not implemented on ${this.name} provider adapter`);
  }

  /**
   * Fetches recursive or non-recursive tree.
   * @param {{ owner: string, repo: string, ref?: string, recursive?: boolean }} params
   * @param {object} [options]
   */
  async getTree({ owner, repo, ref, recursive = true }, options = {}) {
    throw new Error(`getTree not implemented on ${this.name} provider adapter`);
  }
}
