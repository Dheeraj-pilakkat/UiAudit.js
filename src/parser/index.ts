import * as fs from 'fs';
import * as path from 'path';
import * as parser from '@babel/parser';
import type { File } from '@babel/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedFile {
  filePath: string;
  ast: File;
  source: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SUPPORTED_EXT = new Set(['.tsx', '.ts', '.jsx', '.js']);

// Directories we never descend into
const IGNORED_DIRS = new Set([
  'node_modules', '.next', 'dist', 'build', '.git',
  '.cache', 'coverage', 'out', '.turbo', 'storybook-static',
  '.vscode', '.github', '.idea', '.husky',
]);

/**
 * Checks if a file path is a configuration, environment (.env), declaration (.d.ts), test, or tooling file.
 */
export function isConfigFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const fileName = path.basename(normalized);
  const lowerName = fileName.toLowerCase();

  // Check declaration files
  if (lowerName.endsWith('.d.ts')) return true;

  // Check test files
  if (
    lowerName.endsWith('.test.ts') ||
    lowerName.endsWith('.test.tsx') ||
    lowerName.endsWith('.test.js') ||
    lowerName.endsWith('.test.jsx') ||
    lowerName.endsWith('.spec.ts') ||
    lowerName.endsWith('.spec.tsx') ||
    lowerName.endsWith('.spec.js') ||
    lowerName.endsWith('.spec.jsx')
  ) {
    return true;
  }

  // Check env files & hidden dot files
  if (lowerName.startsWith('.')) return true;

  // Check config filenames (e.g. config.ts, config.js, next.config.js, tailwind.config.js, uiaudit.config.json)
  if (
    lowerName === 'config.ts' ||
    lowerName === 'config.js' ||
    lowerName === 'config.json' ||
    lowerName.includes('.config.') ||
    lowerName.endsWith('.config.js') ||
    lowerName.endsWith('.config.ts') ||
    lowerName.endsWith('.config.mjs') ||
    lowerName.endsWith('.config.cjs') ||
    lowerName.endsWith('.config.json')
  ) {
    return true;
  }

  // Check common tooling / framework config filenames
  if (
    lowerName.startsWith('tsconfig') ||
    lowerName.startsWith('jsconfig') ||
    lowerName.startsWith('vite.config') ||
    lowerName.startsWith('next.config') ||
    lowerName.startsWith('tailwind.config') ||
    lowerName.startsWith('postcss.config') ||
    lowerName.startsWith('webpack.config') ||
    lowerName.startsWith('babel.config') ||
    lowerName.startsWith('rollup.config') ||
    lowerName.startsWith('vitest.config') ||
    lowerName.startsWith('jest.config') ||
    lowerName.startsWith('eslint.config') ||
    lowerName.startsWith('prettier.config') ||
    lowerName.startsWith('uiaudit.config')
  ) {
    return true;
  }

  // Check non-UI tool directories
  if (
    normalized.includes('/.vscode/') ||
    normalized.includes('/.github/') ||
    normalized.includes('/.idea/') ||
    normalized.includes('/.husky/') ||
    normalized.includes('/scripts/') ||
    normalized.includes('/tools/')
  ) {
    return true;
  }

  return false;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse a single file with Babel.
 * Returns null for unsupported extensions, config/env/.d.ts files, or parse errors.
 */
export function parseFile(filePath: string): ParsedFile | null {
  if (!SUPPORTED_EXT.has(path.extname(filePath))) return null;
  if (isConfigFile(filePath)) return null;

  try {
    const source = fs.readFileSync(filePath, 'utf-8');
    const ast = parser.parse(source, {
      sourceType: 'module',
      // Enable all syntax that appears in real React/Next.js projects
      plugins: [
        'jsx',
        'typescript',
        'decorators-legacy',
        'classProperties',
        'classStaticBlock',
        'optionalChaining',
        'nullishCoalescingOperator',
        'importAssertions',
      ],
    });
    return { filePath, ast, source };
  } catch {
    // Silently skip files that fail to parse.
    return null;
  }
}

/**
 * Recursively collect all supported source files under a target path.
 * Target can be either a single file or a directory.
 */
export function collectFiles(target: string): string[] {
  const absTarget = path.resolve(target);

  let stat: fs.Stats;
  try {
    stat = fs.statSync(absTarget);
  } catch {
    throw new Error(`Path not found: ${absTarget}`);
  }

  if (stat.isFile()) {
    return SUPPORTED_EXT.has(path.extname(absTarget)) && !isConfigFile(absTarget) ? [absTarget] : [];
  }

  if (stat.isDirectory()) {
    return walkDir(absTarget);
  }

  return [];
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function walkDir(dir: string): string[] {
  const results: string[] = [];

  for (const entry of fs.readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;

    const fullPath = path.join(dir, entry);

    try {
      const entryStat = fs.statSync(fullPath);
      if (entryStat.isDirectory()) {
        results.push(...walkDir(fullPath));
      } else if (SUPPORTED_EXT.has(path.extname(entry)) && !isConfigFile(entry)) {
        results.push(fullPath);
      }
    } catch {
      // Skip files we can't stat (permission issues, broken symlinks, etc.)
    }
  }

  return results;
}