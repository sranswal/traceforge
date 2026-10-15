/**
 * Framework Detection Engine
 * Deeply inspects package manifests (package.json, requirements.txt, go.mod, Cargo.toml)
 * to accurately identify libraries, UI frameworks, server frameworks, and testing tools.
 */

export function detectFrameworks(scan) {
  const { manifests, files } = scan;
  const frameworks = [];
  const added = new Set();

  function add(name, category, confidence = 'High') {
    if (!added.has(name)) {
      added.add(name);
      frameworks.push({ name, category, confidence });
    }
  }

  // 1. Inspect package.json manifests
  for (const [path, content] of Object.entries(manifests)) {
    if (path.endsWith('package.json')) {
      try {
        const pkg = JSON.parse(content);
        const allDeps = {
          ...(pkg.dependencies || {}),
          ...(pkg.devDependencies || {}),
          ...(pkg.peerDependencies || {})
        };

        // Frontend frameworks
        if (allDeps['react']) add('React', 'Frontend');
        if (allDeps['next']) add('Next.js', 'Fullstack / Frontend');
        if (allDeps['vue']) add('Vue.js', 'Frontend');
        if (allDeps['nuxt']) add('Nuxt', 'Fullstack / Frontend');
        if (allDeps['svelte'] || allDeps['@sveltejs/kit']) add('Svelte', 'Frontend');
        if (allDeps['@angular/core']) add('Angular', 'Frontend');
        if (allDeps['vite']) add('Vite', 'Build Tool / Frontend');
        if (allDeps['astro']) add('Astro', 'Frontend / SSG');
        if (allDeps['@remix-run/react']) add('Remix', 'Fullstack');

        // Backend frameworks (Node)
        if (allDeps['express']) add('Express.js', 'Backend');
        if (allDeps['@nestjs/core']) add('NestJS', 'Backend');
        if (allDeps['fastify']) add('Fastify', 'Backend');
        if (allDeps['koa']) add('Koa', 'Backend');
        if (allDeps['hono']) add('Hono', 'Backend');

        // Database / ORMs
        if (allDeps['prisma'] || allDeps['@prisma/client']) add('Prisma', 'Database ORM');
        if (allDeps['mongoose']) add('Mongoose (MongoDB)', 'Database ORM');
        if (allDeps['typeorm']) add('TypeORM', 'Database ORM');
        if (allDeps['drizzle-orm']) add('Drizzle ORM', 'Database ORM');
        if (allDeps['sequelize']) add('Sequelize', 'Database ORM');
        if (allDeps['pg'] || allDeps['postgres']) add('PostgreSQL Client', 'Database');
        if (allDeps['mysql2'] || allDeps['mysql']) add('MySQL Client', 'Database');
        if (allDeps['redis'] || allDeps['ioredis']) add('Redis', 'Cache / Database');

        // Testing
        if (allDeps['jest']) add('Jest', 'Testing');
        if (allDeps['vitest']) add('Vitest', 'Testing');
        if (allDeps['cypress']) add('Cypress', 'E2E Testing');
        if (allDeps['playwright'] || allDeps['@playwright/test']) add('Playwright', 'E2E Testing');

        // UI Component Libraries
        if (allDeps['tailwindcss']) add('Tailwind CSS', 'Styling');
        if (allDeps['@mui/material']) add('Material UI', 'UI Library');
        if (allDeps['@chakra-ui/react']) add('Chakra UI', 'UI Library');
        if (allDeps['lucide-react']) add('Lucide Icons', 'UI Library');
      } catch {
        // Fallback to text matching if invalid JSON
        if (content.includes('"react"')) add('React', 'Frontend', 'Medium');
        if (content.includes('"next"')) add('Next.js', 'Fullstack', 'Medium');
        if (content.includes('"express"')) add('Express.js', 'Backend', 'Medium');
        if (content.includes('"vite"')) add('Vite', 'Frontend', 'Medium');
      }
    }

    // 2. Python requirements / pyproject.toml
    if (path.endsWith('requirements.txt') || path.endsWith('pyproject.toml') || path.endsWith('Pipfile')) {
      const lower = content.toLowerCase();
      if (lower.includes('fastapi')) add('FastAPI', 'Backend');
      if (lower.includes('django')) add('Django', 'Backend / Fullstack');
      if (lower.includes('flask')) add('Flask', 'Backend');
      if (lower.includes('sqlalchemy')) add('SQLAlchemy', 'Database ORM');
      if (lower.includes('celery')) add('Celery', 'Task Queue');
      if (lower.includes('pytest')) add('Pytest', 'Testing');
      if (lower.includes('torch') || lower.includes('pytorch')) add('PyTorch', 'Machine Learning');
      if (lower.includes('tensorflow')) add('TensorFlow', 'Machine Learning');
      if (lower.includes('pandas')) add('Pandas', 'Data Science');
      if (lower.includes('langchain') || lower.includes('llama-index')) add('AI Agent Framework', 'AI / LLM');
    }

    // 3. Go go.mod manifests
    if (path.endsWith('go.mod')) {
      if (content.includes('github.com/gin-gonic/gin')) add('Gin', 'Backend Web Framework');
      if (content.includes('github.com/gofiber/fiber')) add('Fiber', 'Backend Web Framework');
      if (content.includes('github.com/labstack/echo')) add('Echo', 'Backend Web Framework');
      if (content.includes('github.com/go-chi/chi')) add('Chi', 'Backend Router');
      if (content.includes('github.com/spf13/cobra')) add('Cobra', 'CLI Framework');
      if (content.includes('gorm.io/gorm')) add('GORM', 'Database ORM');
      if (content.includes('google.golang.org/grpc')) add('gRPC', 'RPC Framework');
    }

    // 4. Rust Cargo.toml manifests
    if (path.endsWith('Cargo.toml')) {
      const lower = content.toLowerCase();
      if (lower.includes('actix-web')) add('Actix Web', 'Backend');
      if (lower.includes('axum')) add('Axum', 'Backend Web Framework');
      if (lower.includes('tokio')) add('Tokio', 'Async Runtime');
      if (lower.includes('clap')) add('Clap', 'CLI Framework');
      if (lower.includes('diesel')) add('Diesel', 'Database ORM');
    }
  }

  // File pattern fallbacks for repositories where manifests weren't fetched
  const filePaths = files.map(f => f.path);
  if (filePaths.some(p => p.endsWith('.jsx') || p.endsWith('.tsx'))) {
    add('React (Inferred from JSX)', 'Frontend', 'Medium');
  }
  if (filePaths.some(p => p.endsWith('.vue'))) {
    add('Vue.js (Inferred from .vue)', 'Frontend', 'High');
  }
  if (filePaths.some(p => p.endsWith('.svelte'))) {
    add('Svelte (Inferred from .svelte)', 'Frontend', 'High');
  }

  return frameworks;
}
