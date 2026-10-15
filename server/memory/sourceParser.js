/**
 * Source Code Symbol, Import, Call & Test Parser (Phase 4)
 * Primary supported language family: JavaScript / TypeScript (.js, .jsx, .mjs, .cjs, .ts, .tsx)
 *
 * Extracts:
 * - Functions, Methods, and Classes with 1-indexed [startLine, endLine] ranges
 * - Relative module imports (ES Module import / CommonJS require)
 * - Intra-file and imported symbol call references
 * - Automated test cases (test / it / describe blocks) and covered symbols
 *
 * Security & Grounding:
 * - Never stores raw source code or secret values in node properties.
 * - Explicitly marks parserPrecision ('lexical-brace-js-ts' vs 'file-level-only').
 */

import path from 'path';

export const SUPPORTED_JS_TS_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx'
]);

const JS_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'catch', 'finally',
  'try', 'return', 'throw', 'new', 'typeof', 'instanceof', 'delete', 'void',
  'yield', 'await', 'import', 'export', 'from', 'default', 'class', 'extends',
  'super', 'function', 'const', 'let', 'var', 'constructor', 'get', 'set',
  'async', 'static', 'Hydrate', 'require', 'console', 'Math', 'JSON', 'Object',
  'Array', 'Promise', 'String', 'Number', 'Boolean', 'Error', 'RegExp', 'Date',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'parseInt', 'parseFloat',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'fetch',
  'describe', 'it', 'test', 'before', 'after', 'beforeEach', 'afterEach', 'expect', 'assert'
]);

export function isSupportedSourceFile(filePath = '') {
  const lower = String(filePath).toLowerCase();
  // Never parse secret/env files or minified bundles
  if (
    lower.includes('.env') ||
    lower.endsWith('.min.js') ||
    lower.includes('node_modules/') ||
    lower.includes('dist/') ||
    lower.includes('build/')
  ) {
    return false;
  }
  const dotIdx = lower.lastIndexOf('.');
  if (dotIdx < 0) return false;
  const ext = lower.slice(dotIdx);
  return SUPPORTED_JS_TS_EXTENSIONS.has(ext);
}

export function isTestFile(filePath = '') {
  const lower = String(filePath).toLowerCase();
  return (
    lower.includes('/test/') ||
    lower.includes('/tests/') ||
    lower.includes('/__tests__/') ||
    lower.startsWith('test/') ||
    lower.startsWith('tests/') ||
    lower.startsWith('__tests__/') ||
    /\.(test|spec)\.(js|jsx|mjs|cjs|ts|tsx)$/.test(lower)
  );
}

/**
 * Replaces comments and string literals with spaces while preserving all newlines
 * so line numbers and brace positions remain 100% accurate.
 */
export function maskCommentsAndStrings(source = '') {
  const chars = Array.from(source);
  const len = chars.length;
  let i = 0;

  while (i < len) {
    const ch = chars[i];
    const next = chars[i + 1];

    // Line comment
    if (ch === '/' && next === '/') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 2;
      while (i < len && chars[i] !== '\n') {
        chars[i] = ' ';
        i++;
      }
      continue;
    }

    // Block comment
    if (ch === '/' && next === '*') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 2;
      while (i < len && !(chars[i] === '*' && chars[i + 1] === '/')) {
        if (chars[i] !== '\n') chars[i] = ' ';
        i++;
      }
      if (i < len) {
        chars[i] = ' ';
        if (i + 1 < len) chars[i + 1] = ' ';
        i += 2;
      }
      continue;
    }

    // String literals: ', ", `
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      chars[i] = ' ';
      i++;
      while (i < len && chars[i] !== quote) {
        if (chars[i] === '\\' && i + 1 < len) {
          if (chars[i] !== '\n') chars[i] = ' ';
          i++;
          if (chars[i] !== '\n') chars[i] = ' ';
          i++;
          continue;
        }
        if (chars[i] !== '\n') chars[i] = ' ';
        i++;
      }
      if (i < len) {
        chars[i] = ' ';
        i++;
      }
      continue;
    }

    i++;
  }

  return chars.join('');
}

/**
 * Finds the 1-indexed closing line of a block starting at or after `startLineIdx` (0-indexed).
 */
function findBlockEndLine(maskedLines, startLineIdx) {
  let depth = 0;
  let foundOpenBrace = false;

  for (let lineIdx = startLineIdx; lineIdx < maskedLines.length; lineIdx++) {
    const line = maskedLines[lineIdx];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '{') {
        depth++;
        foundOpenBrace = true;
      } else if (ch === '}') {
        depth--;
        if (foundOpenBrace && depth <= 0) {
          return lineIdx + 1;
        }
      }
    }
    // If an arrow function doesn't open a brace within 2 lines, cap at startLine + 1
    if (!foundOpenBrace && lineIdx >= startLineIdx + 2) {
      return startLineIdx + 1;
    }
  }

  return maskedLines.length;
}

/**
 * Resolves a relative import specifier (e.g. './analyzer/index.js' or '../db/falkordb')
 * against the known repository file paths.
 */
export function resolveImportPath(importerFilePath, importSpecifier, allFilePathsSet) {
  if (!importSpecifier || !importSpecifier.startsWith('.')) {
    return null;
  }

  const importerDir = path.posix.dirname(importerFilePath);
  const rawJoined = path.posix.normalize(path.posix.join(importerDir, importSpecifier));
  const candidateBase = rawJoined.replace(/^\/+/, '');

  const candidates = [
    candidateBase,
    `${candidateBase}.js`,
    `${candidateBase}.jsx`,
    `${candidateBase}.ts`,
    `${candidateBase}.tsx`,
    `${candidateBase}.mjs`,
    `${candidateBase}/index.js`,
    `${candidateBase}/index.jsx`,
    `${candidateBase}/index.ts`,
    `${candidateBase}/index.tsx`
  ];

  for (const candidate of candidates) {
    if (allFilePathsSet.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Parses a JavaScript/TypeScript source string into structured symbols, imports, calls, and tests.
 */
export function parseSourceFile(sourceCode, filePath, allFilePaths = []) {
  if (!sourceCode || typeof sourceCode !== 'string' || !isSupportedSourceFile(filePath)) {
    return {
      filePath,
      supported: false,
      parserPrecision: 'file-level-only',
      symbols: [],
      imports: [],
      tests: []
    };
  }

  const allFilePathsSet = allFilePaths instanceof Set ? allFilePaths : new Set(allFilePaths);
  const rawLines = sourceCode.split(/\r?\n/);
  const maskedSource = maskCommentsAndStrings(sourceCode);
  const maskedLines = maskedSource.split(/\r?\n/);

  // 1. Extract Imports (ES Module & CommonJS)
  const imports = [];
  const seenImports = new Set();

  const importRegexes = [
    /\bimport\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:[\s\S]*?\s+from\s+)['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ];

  for (const regex of importRegexes) {
    let match;
    while ((match = regex.exec(sourceCode)) !== null) {
      const specifier = match[1].trim();
      const resolvedPath = resolveImportPath(filePath, specifier, allFilePathsSet);
      const key = `${specifier}|${resolvedPath || ''}`;
      if (!seenImports.has(key)) {
        seenImports.add(key);
        imports.push({
          specifier,
          resolvedPath,
          isRelative: specifier.startsWith('.')
        });
      }
    }
  }

  // 2. Extract Functions, Classes, and Class Methods
  const symbols = [];
  const seenSymbolKeys = new Set();

  function addSymbol({ name, kind, startLine, endLine, exported, parentClass = null }) {
    if (!name || JS_KEYWORDS.has(name)) return;
    const key = `${kind}:${name}:${startLine}`;
    if (seenSymbolKeys.has(key)) return;
    seenSymbolKeys.add(key);

    // Extract candidate function calls inside this symbol's body
    const bodyText = maskedLines.slice(startLine - 1, endLine).join('\n');
    const callMatches = bodyText.matchAll(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g);
    const rawCalls = new Set();
    for (const m of callMatches) {
      const callee = m[1];
      if (callee && callee !== name && !JS_KEYWORDS.has(callee)) {
        rawCalls.add(callee);
      }
    }

    symbols.push({
      name,
      kind, // 'Function' or 'Class'
      startLine,
      endLine: Math.max(startLine, endLine),
      exported: Boolean(exported),
      parentClass,
      parserPrecision: 'lexical-brace-js-ts',
      rawCalls: Array.from(rawCalls)
    });
  }

  const classRanges = [];

  for (let i = 0; i < maskedLines.length; i++) {
    const line = maskedLines[i];
    const startLine = i + 1;

    // Class declaration: [export] [default] class ClassName
    const classMatch = line.match(/^\s*(export\s+(?:default\s+)?)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (classMatch) {
      const endLine = findBlockEndLine(maskedLines, i);
      const className = classMatch[2];
      classRanges.push({ name: className, startLine, endLine });
      addSymbol({
        name: className,
        kind: 'Class',
        startLine,
        endLine,
        exported: Boolean(classMatch[1])
      });
      continue;
    }

    // Standard function declaration: [export] [default] [async] function funcName(
    const fnMatch = line.match(/^\s*(export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/);
    if (fnMatch) {
      const endLine = findBlockEndLine(maskedLines, i);
      addSymbol({
        name: fnMatch[2],
        kind: 'Function',
        startLine,
        endLine,
        exported: Boolean(fnMatch[1])
      });
      continue;
    }

    // Arrow or function expression assigned to const/let/var: [export] const funcName = [async] (...) =>
    const arrowMatch = line.match(
      /^\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/
    );
    if (arrowMatch) {
      const endLine = findBlockEndLine(maskedLines, i);
      addSymbol({
        name: arrowMatch[2],
        kind: 'Function',
        startLine,
        endLine,
        exported: Boolean(arrowMatch[1])
      });
      continue;
    }

    // Class method inside a known class range: [async] methodName(...) {
    const enclosingClass = classRanges.find(c => startLine > c.startLine && startLine < c.endLine);
    if (enclosingClass) {
      const methodMatch = line.match(/^\s*(?:async\s+|static\s+|get\s+|set\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^;]*\)\s*\{/);
      if (methodMatch) {
        const methodName = methodMatch[1];
        if (!JS_KEYWORDS.has(methodName)) {
          const endLine = findBlockEndLine(maskedLines, i);
          addSymbol({
            name: methodName,
            kind: 'Function',
            startLine,
            endLine,
            exported: true,
            parentClass: enclosingClass.name
          });
        }
      }
    }
  }

  // 3. Extract Test definitions if this is a test file
  const tests = [];
  if (isTestFile(filePath)) {
    for (let i = 0; i < rawLines.length; i++) {
      const rawLine = rawLines[i];
      const testMatch = rawLine.match(/^\s*(?:it|test|describe)\s*\(\s*(['"`])(.+?)\1/);
      if (testMatch) {
        const testName = testMatch[2].trim();
        const startLine = i + 1;
        const endLine = findBlockEndLine(maskedLines, i);
        const bodyText = maskedLines.slice(startLine - 1, endLine).join('\n');
        const referencedIdentifiers = new Set();
        for (const m of bodyText.matchAll(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g)) {
          if (!JS_KEYWORDS.has(m[1])) {
            referencedIdentifiers.add(m[1]);
          }
        }
        tests.push({
          name: testName,
          startLine,
          endLine,
          referencedSymbols: Array.from(referencedIdentifiers)
        });
      }
    }
  }

  return {
    filePath,
    supported: true,
    parserPrecision: 'lexical-brace-js-ts',
    symbols,
    imports,
    tests
  };
}
