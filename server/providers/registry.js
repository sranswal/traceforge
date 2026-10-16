/**
 * Repository Provider Registry
 * Resolves repository adapters by URL or provider name.
 */

import { githubAdapter } from './github.js';
import { gitlabAdapter } from './gitlab.js';
import { bitbucketAdapter } from './bitbucket.js';
import { mockAdapter, MOCK_REPOSITORIES } from './mock.js';

export function resolveProvider(urlOrName) {
  if (!urlOrName || typeof urlOrName !== 'string') {
    return githubAdapter;
  }

  const target = urlOrName.trim().toLowerCase();

  if (target === 'mock' || target.startsWith('mock:')) {
    return mockAdapter;
  }

  // Check if target is a known mock repo key (useful in tests)
  if (MOCK_REPOSITORIES[target]) {
    return mockAdapter;
  }

  if (target.includes('gitlab.com') || target === 'gitlab') {
    return gitlabAdapter;
  }

  if (target.includes('bitbucket.org') || target === 'bitbucket') {
    return bitbucketAdapter;
  }

  if (target.includes('github.com') || target === 'github') {
    return githubAdapter;
  }

  // Default to github adapter for standard owner/repo or github URLs
  return githubAdapter;
}

export function parseRepositoryUrl(url) {
  const adapter = resolveProvider(url);
  return adapter.parseUrl(url);
}

export function getProviderStatus(providerName = 'github') {
  const name = providerName.toLowerCase();
  if (name === 'gitlab') {
    const hasCredentials = Boolean(process.env.GITLAB_TOKEN);
    return {
      name: 'gitlab',
      label: 'GitLab',
      status: hasCredentials ? 'ready' : 'credentials_required',
      hasCredentials,
      setupGuide: 'Configure GITLAB_TOKEN in server .env (Personal Access Token with read_api and read_repository scopes).'
    };
  }
  if (name === 'bitbucket') {
    const hasCredentials = Boolean(
      process.env.BITBUCKET_TOKEN || (process.env.BITBUCKET_USERNAME && process.env.BITBUCKET_APP_PASSWORD)
    );
    return {
      name: 'bitbucket',
      label: 'Bitbucket',
      status: hasCredentials ? 'ready' : 'credentials_required',
      hasCredentials,
      setupGuide: 'Configure BITBUCKET_TOKEN or BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD in server .env.'
    };
  }
  if (name === 'mock') {
    return {
      name: 'mock',
      label: 'Mock Fixtures',
      status: 'ready',
      hasCredentials: true
    };
  }
  // GitHub
  const hasCredentials = Boolean(process.env.GITHUB_TOKEN);
  return {
    name: 'github',
    label: 'GitHub',
    status: 'production',
    hasCredentials,
    setupGuide: hasCredentials ? null : 'Optional: Set GITHUB_TOKEN in server .env to increase API rate limits.'
  };
}

export { githubAdapter, gitlabAdapter, bitbucketAdapter, mockAdapter };
