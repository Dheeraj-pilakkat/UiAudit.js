/**
 * UIAudit — Public programmatic API
 *
 * This is what the VS Code extension (and any other programmatic consumer)
 * will import. The CLI (src/cli.ts) uses this same API under the hood.
 *
 * Usage:
 *   import { runAudit } from 'uiaudit';
 *   const report = runAudit('./src/components', { types: ['accessibility', 'performance'] });
 */

export { runAudit } from './auditor.js';
export { detectTechStack, type TechMatch, type DetectionResult } from './detector.js';
export { loadConfig, findConfigFile, shouldIgnoreFile, applyConfigToIssues } from './config.js';
export { isPageFile } from './utils/page.js';

export type {
  AuditReport,
  AuditResult,
  AuditOptions,
  AuditCategory,
  Issue,
  IssueImpact,
  IssueStatus,
  UiAuditConfig,
} from './types.js';