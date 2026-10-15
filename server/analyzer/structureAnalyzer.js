/**
 * Project Structure Analyzer
 * Classifies directory roles and builds a navigable hierarchical tree representation.
 */

const DIRECTORY_ROLES = {
  // Core & App
  src: { role: 'Source Root', description: 'Primary source code directory', category: 'core' },
  app: { role: 'Application Core', description: 'Next.js App Router or application entry point', category: 'core' },
  lib: { role: 'Library / Core Modules', description: 'Reusable application modules and libraries', category: 'core' },
  internal: { role: 'Internal Packages', description: 'Private packages not exposed externally', category: 'core' },
  pkg: { role: 'Public Packages', description: 'Shared reusable packages', category: 'core' },

  // API & Server
  api: { role: 'API Endpoints', description: 'HTTP / REST / GraphQL route handlers', category: 'backend' },
  server: { role: 'Backend Server', description: 'Server initialization and backend logic', category: 'backend' },
  backend: { role: 'Backend Architecture', description: 'Backend service and controllers', category: 'backend' },
  controllers: { role: 'Controllers Layer', description: 'Request handling and business coordination', category: 'backend' },
  routes: { role: 'Routing Layer', description: 'URL route mapping and handlers', category: 'backend' },
  middleware: { role: 'Middleware Layer', description: 'Request authentication and validation pipeline', category: 'backend' },

  // UI & Frontend
  client: { role: 'Client Application', description: 'Frontend client workspace', category: 'frontend' },
  frontend: { role: 'Frontend Layer', description: 'Web UI application layer', category: 'frontend' },
  components: { role: 'UI Components', description: 'Reusable visual interface components', category: 'frontend' },
  pages: { role: 'Page Views', description: 'Route-level views and screen templates', category: 'frontend' },
  views: { role: 'View Templates', description: 'HTML/Template render views', category: 'frontend' },
  styles: { role: 'Styles & Themes', description: 'CSS / SASS stylesheets and theme tokens', category: 'frontend' },
  public: { role: 'Static Assets', description: 'Static images, fonts, and public files', category: 'frontend' },
  assets: { role: 'Media Assets', description: 'Icons, graphics, and static resources', category: 'frontend' },

  // Business Logic & Data
  services: { role: 'Service Layer', description: 'Core business domain logic and operations', category: 'domain' },
  domain: { role: 'Domain Entities', description: 'Domain models and business rules', category: 'domain' },
  models: { role: 'Data Models', description: 'Database schema models and types', category: 'data' },
  db: { role: 'Database Layer', description: 'Connection pool, queries, and seeds', category: 'data' },
  prisma: { role: 'Prisma Schema', description: 'Prisma ORM schema and migrations', category: 'data' },
  migrations: { role: 'Database Migrations', description: 'Schema version control and migrations', category: 'data' },

  // Testing & Quality
  test: { role: 'Test Suite', description: 'Automated test specifications', category: 'testing' },
  tests: { role: 'Test Suite', description: 'Automated test specifications', category: 'testing' },
  __tests__: { role: 'Unit Tests', description: 'Unit and integration test cases', category: 'testing' },
  e2e: { role: 'End-to-End Tests', description: 'Browser and integration test flows', category: 'testing' },

  // DevOps & Tooling
  config: { role: 'Configuration', description: 'Environment and application settings', category: 'config' },
  scripts: { role: 'Automation Scripts', description: 'Deployment and utility scripts', category: 'tooling' },
  tools: { role: 'Developer Tooling', description: 'Internal developer CLI and scripts', category: 'tooling' },
  bin: { role: 'Executables / Binaries', description: 'Compiled binaries or CLI entry points', category: 'tooling' },
  cmd: { role: 'CLI Commands', description: 'Application command-line binaries (Go pattern)', category: 'tooling' },
  docker: { role: 'Docker Config', description: 'Docker container configurations and Compose', category: 'devops' },
  '.github': { role: 'GitHub Workflows', description: 'CI/CD actions and issue templates', category: 'devops' },
  docs: { role: 'Documentation', description: 'Technical specifications and guides', category: 'docs' }
};

export function analyzeStructure(scan) {
  const { files, directories } = scan;

  // 1. Identify Directory Roles
  const classifiedDirs = [];
  const dirFileCounts = {};

  for (const file of files) {
    const parts = file.path.split('/');
    if (parts.length > 1) {
      const topDir = parts[0];
      dirFileCounts[topDir] = (dirFileCounts[topDir] || 0) + 1;
    }
  }

  for (const dirPath of directories) {
    const parts = dirPath.split('/');
    const dirName = parts[parts.length - 1].toLowerCase();

    if (DIRECTORY_ROLES[dirName]) {
      const info = DIRECTORY_ROLES[dirName];
      classifiedDirs.push({
        path: '/' + dirPath,
        name: dirName,
        role: info.role,
        description: info.description,
        category: info.category,
        depth: parts.length
      });
    }
  }

  // Deduplicate and prioritize top-level directories
  const topClassified = classifiedDirs
    .sort((a, b) => a.depth - b.depth)
    .slice(0, 14);

  // 2. Build Tree Structure (up to 3 levels deep for clean UI display)
  const treeRoot = { name: 'root', type: 'directory', children: {} };

  for (const file of files) {
    const parts = file.path.split('/');
    let current = treeRoot;

    // Only process up to 3 segments deep for the overview tree
    const maxDepth = Math.min(parts.length, 3);
    for (let i = 0; i < maxDepth; i++) {
      const part = parts[i];
      const isFile = (i === parts.length - 1);

      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          type: isFile ? 'file' : 'directory',
          size: isFile ? file.size : 0,
          fileCount: isFile ? 0 : 1,
          children: {}
        };
      } else {
        if (!isFile) {
          current.children[part].fileCount = (current.children[part].fileCount || 0) + 1;
        }
      }

      current = current.children[part];
    }
  }

  // Convert map to nested array for easy JSON rendering
  function formatNode(node) {
    const childrenArray = Object.values(node.children || {})
      .sort((a, b) => {
        // Directories first, then alphabetical
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map(formatNode);

    return {
      name: node.name,
      path: node.path,
      type: node.type,
      size: node.size,
      fileCount: node.fileCount,
      role: DIRECTORY_ROLES[node.name.toLowerCase()]?.role || null,
      children: childrenArray.length > 0 ? childrenArray : undefined
    };
  }

  const hierarchicalTree = Object.values(treeRoot.children).map(formatNode);

  return {
    classifiedDirectories: topClassified,
    tree: hierarchicalTree
  };
}
