/**
 * Ingestion Engine for GitHub Repositories
 * Uses single-shot Git Trees API to prevent rate-limit exhaustion,
 * and fetches manifest contents cleanly.
 */

export function parseGitHubUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Please provide a valid GitHub URL');
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

  return { owner, repo, branch, fullName: `${owner}/${repo}` };
}

export async function fetchGitHubRepoData({ owner, repo, branch }, githubToken = process.env.GITHUB_TOKEN) {
  const headers = {
    'User-Agent': 'TraceForge-Analyzer',
    'Accept': 'application/vnd.github.v3+json',
  };

  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`;
  }

  // 1. Fetch Repository Metadata
  const repoMetaUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const metaRes = await fetch(repoMetaUrl, { headers });

  if (!metaRes.ok) {
    if (metaRes.status === 404) {
      throw new Error(`Repository "${owner}/${repo}" was not found or is private.`);
    }
    if (metaRes.status === 403) {
      throw new Error('GitHub API rate limit exceeded. Please wait a moment or configure GITHUB_TOKEN.');
    }
    throw new Error(`GitHub API error (${metaRes.status}): ${metaRes.statusText}`);
  }

  const repoMeta = await metaRes.json();
  const targetBranch = branch || repoMeta.default_branch || 'main';

  // 2. Single-shot Git Trees API
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${targetBranch}?recursive=1`;
  const treeRes = await fetch(treeUrl, { headers });

  let rawTree = [];
  if (treeRes.ok) {
    const treeData = await treeRes.json();
    rawTree = treeData.tree || [];
  } else {
    // Fallback: If git tree fails (e.g. empty repo or branch sha issue), try repo root contents
    const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
    const contentsRes = await fetch(contentsUrl, { headers });
    if (contentsRes.ok) {
      const contentsData = await contentsRes.json();
      rawTree = contentsData.map(item => ({
        path: item.path,
        type: item.type === 'dir' ? 'tree' : 'blob',
        size: item.size || 0
      }));
    }
  }

  // Process files and directories
  const files = [];
  const directories = new Set();
  const extensions = {};

  for (const item of rawTree) {
    if (item.type === 'blob') {
      files.push({
        path: item.path,
        size: item.size || 0
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

  // 3. Manifest and documentation files to fetch raw content for
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

  // Fetch manifests in parallel from raw.githubusercontent.com (does not consume API rate limits)
  const fetchPromises = importantFilesToFetch
    .filter(targetFile => filePaths.some(p => p === targetFile || p.endsWith('/' + targetFile)))
    .slice(0, 8) // Limit manifest fetches to top 8 candidates to keep it snappy
    .map(async (targetFile) => {
      const actualPath = filePaths.find(p => p === targetFile) || filePaths.find(p => p.endsWith('/' + targetFile));
      if (!actualPath) return;

      try {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${targetBranch}/${actualPath}`;
        const rawRes = await fetch(rawUrl);
        if (rawRes.ok) {
          const content = await rawRes.text();
          manifests[actualPath] = content;
        }
      } catch {
        // Soft fail on individual manifest
      }
    });

  await Promise.allSettled(fetchPromises);

  return {
    repoInfo: {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      branch: targetBranch,
      description: repoMeta.description || 'No description provided.',
      stars: repoMeta.stargazers_count || 0,
      forks: repoMeta.forks_count || 0,
      openIssues: repoMeta.open_issues_count || 0,
      defaultBranch: repoMeta.default_branch,
      primaryLanguage: repoMeta.language || 'Unknown',
      license: repoMeta.license ? repoMeta.license.spdx_id || repoMeta.license.name : 'None',
      url: repoMeta.html_url
    },
    files,
    directories: Array.from(directories),
    extensions,
    manifests,
    totalFiles: files.length,
    totalDirectories: directories.size
  };
}
