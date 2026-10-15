/**
 * Entry Point Detector
 * Identifies primary execution points across various languages, frameworks, and tools.
 */

export function detectEntryPoints(scan) {
  const { files } = scan;
  const entries = [];

  const candidateRules = [
    // Web & Fullstack JS/TS
    { pattern: /(?:^|\/)src\/main\.(?:jsx?|tsx?)$/, type: 'Frontend Client Entry', language: 'JavaScript/TypeScript' },
    { pattern: /(?:^|\/)src\/App\.(?:jsx?|tsx?)$/, type: 'Root React Component', language: 'React' },
    { pattern: /(?:^|\/)(?:src\/)?(?:server|index)\.(?:js|ts|mjs)$/, type: 'Server / Module Entry', language: 'Node.js' },
    { pattern: /(?:^|\/)app\/(?:page|layout)\.(?:jsx?|tsx?)$/, type: 'Next.js App Route Entry', language: 'Next.js' },
    { pattern: /(?:^|\/)pages\/(?:index|_app)\.(?:jsx?|tsx?)$/, type: 'Next.js Pages Entry', language: 'Next.js' },
    
    // Go
    { pattern: /(?:^|\/)cmd\/(?:.+)\/main\.go$/, type: 'Go CLI / Service Entry', language: 'Go' },
    { pattern: /^main\.go$/, type: 'Go Root Main Entry', language: 'Go' },

    // Python
    { pattern: /(?:^|\/)(?:app|main|server|wsgi|asgi|run)\.py$/, type: 'Python Application Entry', language: 'Python' },
    { pattern: /(?:^|\/)manage\.py$/, type: 'Django Management Entry', language: 'Django' },

    // Rust
    { pattern: /(?:^|\/)src\/main\.rs$/, type: 'Rust Binary Entry', language: 'Rust' },
    { pattern: /(?:^|\/)src\/lib\.rs$/, type: 'Rust Library Entry', language: 'Rust' },

    // Java / Kotlin / C#
    { pattern: /(?:^|\/)(?:.*Application|Main)\.(?:java|kt)$/, type: 'JVM Application Entry', language: 'Java/Kotlin' },
    { pattern: /(?:^|\/)(?:Program|Startup)\.cs$/, type: '.NET Main Entry', language: 'C#' },

    // Infrastructure
    { pattern: /(?:^|\/)Dockerfile$/, type: 'Docker Container Build Definition', language: 'Docker' },
    { pattern: /(?:^|\/)docker-compose\.ya?ml$/, type: 'Multi-service Composition', language: 'Docker Compose' }
  ];

  for (const file of files) {
    for (const rule of candidateRules) {
      if (rule.pattern.test(file.path)) {
        entries.push({
          path: file.path,
          type: rule.type,
          language: rule.language,
          size: file.size
        });
        break;
      }
    }
  }

  // Deduplicate by path
  const uniqueEntries = [];
  const seen = new Set();
  for (const entry of entries) {
    if (!seen.has(entry.path)) {
      seen.add(entry.path);
      uniqueEntries.push(entry);
    }
  }

  return uniqueEntries.slice(0, 10);
}
