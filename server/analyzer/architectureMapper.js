/**
 * Architecture Mapper
 * Infers architecture pattern, system topology, component interactions, and project type.
 */

export function mapArchitecture(scan, techStack, frameworks, structure, entryPoints) {
  const { files, directories } = scan;
  const filePaths = files.map(f => f.path.toLowerCase());
  const dirNames = directories.map(d => d.toLowerCase());

  const hasFrontend = techStack.frontend.length > 0 || 
    dirNames.some(d => d === 'frontend' || d === 'client' || d === 'ui' || d === 'components');

  const hasBackend = techStack.backend.length > 0 || 
    dirNames.some(d => d === 'backend' || d === 'server' || d === 'api' || d === 'controllers');

  const isMonorepo = dirNames.some(d => d === 'packages' || d === 'services' || d === 'apps') ||
    filePaths.some(p => p.includes('pnpm-workspace.yaml') || p.includes('lerna.json'));

  const hasCLI = frameworks.some(f => f.name === 'Cobra' || f.name === 'Clap' || f.name === 'Commander') ||
    dirNames.some(d => d === 'cmd' || d === 'bin' || d === 'cli');

  // 1. Determine Project Classification
  let projectType = 'Generic Software Project';
  let pattern = 'Layered Architecture';
  let description = '';

  if (isMonorepo) {
    projectType = 'Monorepo Workspace';
    pattern = 'Modular Multi-Package Architecture';
    description = 'Contains multiple interconnected packages, applications, or microservices managed in a single repository.';
  } else if (hasFrontend && hasBackend) {
    projectType = 'Fullstack Web Application';
    pattern = 'Client-Server / Fullstack Architecture';
    description = 'Integrates a dedicated frontend user interface with a backend server and API layer.';
  } else if (hasFrontend && !hasBackend) {
    projectType = 'Frontend Web Application';
    pattern = 'Component-Driven Single Page Application (SPA)';
    description = 'Client-rendered or static web application focused on user interface and browser state management.';
  } else if (hasCLI) {
    projectType = 'Command-Line Tool (CLI)';
    pattern = 'Command Dispatcher Architecture';
    description = 'Executes terminal commands and parses developer arguments with modular command handlers.';
  } else if (hasBackend) {
    projectType = 'Backend API Service';
    pattern = 'Service-Oriented REST / RPC Architecture';
    description = 'Server-side application exposing endpoints, orchestrating business logic, and persisting data.';
  } else if (filePaths.some(p => p.endsWith('.md') || p.endsWith('.mdx')) && files.length < 15) {
    projectType = 'Documentation / Specification';
    pattern = 'Documentation Repository';
    description = 'Structured technical documents, specifications, or reference guides.';
  } else {
    projectType = 'Library / SDK';
    pattern = 'Modular Library Pattern';
    description = 'Reusable utility functions, algorithms, or client SDK exported for external consumption.';
  }

  // 2. Identify Core Architectural Components
  const components = [];

  if (structure.classifiedDirectories.some(d => d.category === 'backend')) {
    components.push({
      name: 'API & Routing Layer',
      role: 'Exposes HTTP/gRPC endpoints and handles request routing, authorization, and parameters.'
    });
  }

  if (structure.classifiedDirectories.some(d => d.category === 'domain')) {
    components.push({
      name: 'Domain & Service Layer',
      role: 'Implements business logic, domain rules, and third-party integrations.'
    });
  }

  if (structure.classifiedDirectories.some(d => d.category === 'data')) {
    components.push({
      name: 'Data & Persistence Layer',
      role: 'Manages database schemas, ORM models, migrations, and query execution.'
    });
  }

  if (structure.classifiedDirectories.some(d => d.category === 'frontend')) {
    components.push({
      name: 'User Interface Layer',
      role: 'Renders reactive UI views, component states, and coordinates user interactions.'
    });
  }

  if (structure.classifiedDirectories.some(d => d.category === 'devops')) {
    components.push({
      name: 'Infrastructure & CI/CD',
      role: 'Automates testing, container builds, and deployment workflows.'
    });
  }

  return {
    projectType,
    architecturePattern: pattern,
    description,
    components,
    isMonorepo,
    hasContainerization: techStack.devops.some(d => d.name === 'Docker' || d.name === 'Docker Compose')
  };
}
