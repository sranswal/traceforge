/**
 * Technology Detection Engine
 * Builds on the TraceForge analyzer foundation with deeper manifest analysis
 * and language distribution calculations.
 */

export function detectTechnologies(scan) {
  const { files, extensions, manifests } = scan;
  const filePaths = files.map(f => f.path.toLowerCase());
  
  const techStack = {
    languages: [],
    backend: [],
    frontend: [],
    devops: [],
    database: [],
    config: []
  };

  // 1. Language Detection from Extensions
  const langMap = {
    '.js': 'JavaScript',
    '.jsx': 'JavaScript (React)',
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript (React)',
    '.go': 'Go',
    '.py': 'Python',
    '.rs': 'Rust',
    '.java': 'Java',
    '.kt': 'Kotlin',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.cs': 'C#',
    '.cpp': 'C++',
    '.c': 'C',
    '.swift': 'Swift',
    '.dart': 'Dart',
    '.scala': 'Scala',
    '.html': 'HTML',
    '.css': 'CSS',
    '.scss': 'SCSS',
    '.vue': 'Vue',
    '.svelte': 'Svelte',
    '.sh': 'Shell',
    '.sql': 'SQL'
  };

  const detectedLangs = new Set();
  let totalCodeFiles = 0;
  const langCounts = {};

  for (const [ext, count] of Object.entries(extensions)) {
    if (langMap[ext]) {
      const name = langMap[ext];
      detectedLangs.add(name);
      langCounts[name] = (langCounts[name] || 0) + count;
      totalCodeFiles += count;
    }
  }

  // Calculate top languages by file count
  techStack.languages = Object.entries(langCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      percentage: totalCodeFiles > 0 ? Math.round((count / totalCodeFiles) * 100) : 0
    }));

  // 2. Backend Tech Detection
  if (filePaths.some(p => p.endsWith('go.mod'))) {
    techStack.backend.push({ name: 'Go', reason: 'Detected go.mod file' });
  }
  if (filePaths.some(p => p.endsWith('requirements.txt') || p.endsWith('pyproject.toml') || p.endsWith('pipfile'))) {
    techStack.backend.push({ name: 'Python', reason: 'Detected Python dependency manifest' });
  }
  if (filePaths.some(p => p.endsWith('cargo.toml'))) {
    techStack.backend.push({ name: 'Rust', reason: 'Detected Cargo.toml manifest' });
  }
  if (filePaths.some(p => p.endsWith('pom.xml') || p.endsWith('build.gradle') || p.endsWith('build.gradle.kts'))) {
    techStack.backend.push({ name: 'Java / JVM', reason: 'Detected Maven/Gradle build configuration' });
  }
  if (filePaths.some(p => p.endsWith('gemfile'))) {
    techStack.backend.push({ name: 'Ruby', reason: 'Detected Gemfile manifest' });
  }
  if (filePaths.some(p => p.endsWith('composer.json'))) {
    techStack.backend.push({ name: 'PHP', reason: 'Detected composer.json' });
  }
  if (filePaths.some(p => p.endsWith('package.json'))) {
    techStack.backend.push({ name: 'Node.js', reason: 'Detected package.json' });
  }

  // 3. DevOps & Containerization Detection
  if (filePaths.some(p => p.endsWith('dockerfile') || p.includes('/dockerfile'))) {
    techStack.devops.push({ name: 'Docker', reason: 'Containerized Dockerfile present' });
  }
  if (filePaths.some(p => p.endsWith('docker-compose.yml') || p.endsWith('docker-compose.yaml'))) {
    techStack.devops.push({ name: 'Docker Compose', reason: 'Multi-container orchestration setup' });
  }
  if (filePaths.some(p => p.includes('.github/workflows/'))) {
    techStack.devops.push({ name: 'GitHub Actions', reason: 'Automated CI/CD workflows configured' });
  }
  if (filePaths.some(p => p.endsWith('.gitlab-ci.yml'))) {
    techStack.devops.push({ name: 'GitLab CI', reason: 'GitLab pipeline detected' });
  }
  if (filePaths.some(p => p.endsWith('.terraform') || p.endsWith('.tf'))) {
    techStack.devops.push({ name: 'Terraform', reason: 'Infrastructure as Code detected' });
  }
  if (filePaths.some(p => p.endsWith('k8s.yaml') || p.includes('/k8s/') || p.includes('/kubernetes/'))) {
    techStack.devops.push({ name: 'Kubernetes', reason: 'K8s deployment manifests detected' });
  }

  // 4. Database & ORM Hints
  if (filePaths.some(p => p.includes('prisma/schema.prisma') || p.endsWith('schema.prisma'))) {
    techStack.database.push({ name: 'Prisma ORM', reason: 'Prisma schema detected' });
  }
  if (filePaths.some(p => p.includes('migrations/') || p.includes('migrate/'))) {
    techStack.database.push({ name: 'Database Migrations', reason: 'Schema migrations directory detected' });
  }
  if (filePaths.some(p => p.endsWith('.sql') || p.endsWith('.sqlite') || p.endsWith('.db'))) {
    techStack.database.push({ name: 'SQL / Relational DB', reason: 'SQL files / embedded database present' });
  }

  // 5. Configuration & Environment
  if (filePaths.some(p => p.includes('.env') || p.endsWith('.env.example'))) {
    techStack.config.push({ name: 'Environment Variables (.env)', reason: 'Configuration management via .env' });
  }
  if (filePaths.some(p => p.includes('tsconfig.json'))) {
    techStack.config.push({ name: 'TypeScript Config', reason: 'tsconfig.json present' });
  }
  if (filePaths.some(p => p.includes('tailwind.config') || p.includes('@tailwindcss'))) {
    techStack.frontend.push({ name: 'Tailwind CSS', reason: 'Tailwind styling detected' });
  }

  return techStack;
}
