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
]);

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse a single file with Babel.
 * Returns null for unsupported extensions or parse errors (we never crash on
 * a single bad file — we just skip it and continue).
 */
export function parseFile(filePath: string): ParsedFile | null {
  if (!SUPPORTED_EXT.has(path.extname(filePath))) return null;

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
    // This happens with binary files, unusual encodings, or unsupported syntax.
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
    return SUPPORTED_EXT.has(path.extname(absTarget)) ? [absTarget] : [];
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
      } else if (SUPPORTED_EXT.has(path.extname(entry))) {
        results.push(fullPath);
      }
    } catch {
      // Skip files we can't stat (permission issues, broken symlinks, etc.)
    }
  }

  return results;
}