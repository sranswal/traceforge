/**
 * Observations & Repository Health Insights
 * Synthesizes engineering practices, tooling maturity, and structural indicators.
 */

export function generateObservations(scan, techStack, frameworks) {
  const { files, directories, extensions } = scan;
  const filePaths = files.map(f => f.path.toLowerCase());
  const observations = [];

  // 1. Containerization
  const hasDocker = filePaths.some(p => p.endsWith('dockerfile') || p.includes('/dockerfile'));
  const hasCompose = filePaths.some(p => p.endsWith('docker-compose.yml') || p.endsWith('docker-compose.yaml'));
  if (hasDocker || hasCompose) {
    observations.push({
      category: 'DevOps',
      title: 'Containerized Deployment Ready',
      detail: hasCompose ? 'Configured with multi-container Docker Compose setup.' : 'Standard Dockerfile build detected.',
      status: 'positive'
    });
  }

  // 2. CI/CD Workflows
  if (filePaths.some(p => p.includes('.github/workflows/'))) {
    observations.push({
      category: 'CI/CD',
      title: 'Automated GitHub Actions',
      detail: 'Continuous integration and/or automated deployment pipelines configured.',
      status: 'positive'
    });
  }

  // 3. Testing Suite
  const hasTests = (extensions['.test'] || 0) > 0 || 
    filePaths.some(p => p.includes('test') || p.includes('spec') || p.endsWith('_test.go'));
  if (hasTests) {
    observations.push({
      category: 'Quality',
      title: 'Automated Test Suite Present',
      detail: 'Dedicated test files and test runners detected in the codebase.',
      status: 'positive'
    });
  } else {
    observations.push({
      category: 'Quality',
      title: 'No Prominent Test Suite Found',
      detail: 'Standard test directories or test files were not immediately apparent.',
      status: 'neutral'
    });
  }

  // 4. Type Safety
  const hasTypeScript = (extensions['.ts'] || 0) + (extensions['.tsx'] || 0) > 0;
  const hasGoOrRust = (extensions['.go'] || 0) > 0 || (extensions['.rs'] || 0) > 0;
  if (hasTypeScript || hasGoOrRust) {
    observations.push({
      category: 'Architecture',
      title: 'Static Type Safety',
      detail: hasTypeScript ? 'Built using TypeScript for enhanced type safety.' : 'Built with strongly-typed compiled language (Go/Rust).',
      status: 'positive'
    });
  }

  // 5. Configuration & Secrets
  if (filePaths.some(p => p.endsWith('.env.example') || p.endsWith('.env.sample') || p.endsWith('.env.template'))) {
    observations.push({
      category: 'Security',
      title: 'Environment Variable Template Provided',
      detail: 'Found template configuration file (.env.example) for local environment onboarding.',
      status: 'positive'
    });
  }

  // 6. Monorepo Organization
  if (directories.some(d => d === 'packages' || d === 'services' || d === 'apps')) {
    observations.push({
      category: 'Architecture',
      title: 'Monorepo Workspace Structure',
      detail: 'Project organizes multiple domains or micro-apps into dedicated sub-packages.',
      status: 'info'
    });
  }

  // 7. Documentation
  const hasReadme = filePaths.some(p => p.endsWith('readme.md'));
  const hasLicense = filePaths.some(p => p.endsWith('license') || p.endsWith('license.md'));
  if (hasReadme && hasLicense) {
    observations.push({
      category: 'Documentation',
      title: 'Open Source Documentation Complete',
      detail: 'README and Open Source License clearly defined.',
      status: 'positive'
    });
  }

  return observations;
}
