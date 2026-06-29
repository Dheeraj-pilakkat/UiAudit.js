import { collectFiles, parseFile, type ParsedFile } from './parser/index.js';
import { auditPerformance }   from './auditors/performance.js';
import { auditSEO }           from './auditors/seo.js';
import { auditAccessibility } from './auditors/accessibility.js';
import type {
  AuditCategory,
  AuditOptions,
  AuditReport,
  AuditResult,
  Issue,
  IssueImpact,
} from './types.js';

// ─── Scoring constants ────────────────────────────────────────────────────────
// Score starts at 100 and deducts per issue based on impact.
// These numbers are intentionally asymmetric: a single critical issue should
// fail a CI gate. Tweak here when adding more checks.

const SCORE_DEDUCTIONS: Record<IssueImpact, number> = {
  critical: 20,
  major:    10,
  minor:     5,
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * The single entry point for the entire audit engine.
 * Called by both the CLI (src/cli.ts) and the future VS Code extension (src/index.ts).
 *
 * @param target  A file path or directory path to audit.
 * @param options Which categories to run and any other options.
 * @returns       A complete AuditReport with scores, issues, and fix suggestions.
 */
export function runAudit(target: string, options: AuditOptions): AuditReport {
  // ── Step 1: Collect and parse files ──────────────────────────────────────
  const filePaths = collectFiles(target);

  if (filePaths.length === 0) {
    throw new Error(
      `No supported files found at "${target}".\n` +
      `UIAudit supports: .tsx, .ts, .jsx, .js\n` +
      `Make sure the path exists and is not inside node_modules.`
    );
  }

  const parsedFiles: ParsedFile[] = filePaths
    .map(parseFile)
    .filter((f): f is ParsedFile => f !== null);

  // ── Step 2: Run each requested auditor ───────────────────────────────────
  const RUNNERS: Record<AuditCategory, (files: ParsedFile[]) => Issue[]> = {
    performance:   auditPerformance,
    seo:           auditSEO,
    accessibility: auditAccessibility,
  };

  const results: Partial<Record<AuditCategory, AuditResult>> = {};

  for (const category of options.types) {
    const issues = RUNNERS[category](parsedFiles);
    results[category] = buildResult(category, issues);
  }

  // ── Step 3: Compute overall score ────────────────────────────────────────
  const categoryScores = Object.values(results).map((r) => r.score);
  const overallScore =
    categoryScores.length === 0
      ? 100
      : Math.round(
          categoryScores.reduce((sum, s) => sum + s, 0) / categoryScores.length
        );

  return {
    target,
    timestamp: new Date().toISOString(),
    overallScore,
    totalFiles: parsedFiles.length,
    results,
  };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function buildResult(category: AuditCategory, issues: Issue[]): AuditResult {
  const counts = {
    critical: issues.filter((i) => i.impact === 'critical').length,
    major:    issues.filter((i) => i.impact === 'major').length,
    minor:    issues.filter((i) => i.impact === 'minor').length,
    total:    issues.length,
  };

  const deduction = issues.reduce(
    (sum, issue) => sum + SCORE_DEDUCTIONS[issue.impact],
    0
  );
  const score = Math.max(0, Math.min(100, 100 - deduction));

  return { category, score, issues, counts };
}