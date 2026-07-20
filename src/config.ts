import * as fs from 'fs';
import * as path from 'path';
import type { UiAuditConfig, Issue, IssueImpact } from './types.js';

const CONFIG_FILENAMES = [
  'uiaudit.config.json',
  '.uiauditrc',
  '.uiauditrc.json',
];

/**
 * Searches for a configuration file starting from startDir up to root.
 */
export function findConfigFile(startDir: string = process.cwd()): string | null {
  let currentDir = path.resolve(startDir);
  if (fs.existsSync(currentDir) && fs.statSync(currentDir).isFile()) {
    currentDir = path.dirname(currentDir);
  }

  while (true) {
    for (const filename of CONFIG_FILENAMES) {
      const fullPath = path.join(currentDir, filename);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return null;
}

/**
 * Loads a UiAuditConfig from a specified file path or automatically discovered location.
 */
export function loadConfig(configPath?: string, targetDir: string = process.cwd()): UiAuditConfig {
  const resolvedPath = configPath ? path.resolve(configPath) : findConfigFile(targetDir);

  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    return {};
  }

  try {
    const rawContent = fs.readFileSync(resolvedPath, 'utf-8');
    const parsed = JSON.parse(rawContent) as UiAuditConfig;
    return parsed;
  } catch (err) {
    console.warn(`[uiaudit] Warning: Failed to parse configuration file at "${resolvedPath}": ${(err as Error).message}`);
    return {};
  }
}

/**
 * Checks if a file path matches any ignore rule from config.
 */
export function shouldIgnoreFile(filePath: string, ignorePatterns: string[] = []): boolean {
  if (!ignorePatterns || ignorePatterns.length === 0) return false;

  const normalized = filePath.replace(/\\/g, '/');

  for (const pattern of ignorePatterns) {
    const cleanPattern = pattern.replace(/\\/g, '/');
    if (cleanPattern.includes('*')) {
      // Basic glob matching: turn glob into regex
      const regexStr = cleanPattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '.*')
        .replace(/(?<!\.)\*/g, '[^/]*');
      const regex = new RegExp(`^${regexStr}$|/${regexStr}$`);
      if (regex.test(normalized)) return true;
    } else {
      if (normalized.includes(cleanPattern)) return true;
    }
  }

  return false;
}

/**
 * Filters and updates issue severities based on custom rules in config.
 */
export function applyConfigToIssues(issues: Issue[], configRules?: Record<string, 'off' | IssueImpact>): Issue[] {
  if (!configRules || Object.keys(configRules).length === 0) return issues;

  const result: Issue[] = [];

  for (const issue of issues) {
    const ruleConfig = configRules[issue.id];

    if (ruleConfig === 'off') {
      continue; // Skip ignored rule
    }

    if (ruleConfig && ['critical', 'major', 'minor'].includes(ruleConfig)) {
      result.push({
        ...issue,
        impact: ruleConfig as IssueImpact,
        status: ruleConfig === 'critical' || ruleConfig === 'major' ? 'fail' : 'warning',
      });
    } else {
      result.push(issue);
    }
  }

  return result;
}
