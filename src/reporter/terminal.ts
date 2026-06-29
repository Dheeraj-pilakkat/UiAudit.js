import chalk from 'chalk';
import type { AuditReport, AuditResult, Issue, IssueImpact } from '../types.js';

// ─── Impact colour map ────────────────────────────────────────────────────────

const IMPACT_BADGE: Record<IssueImpact, string> = {
  critical: chalk.bgRed.white.bold(' CRITICAL '),
  major:    chalk.bgYellow.black.bold('  MAJOR   '),
  minor:    chalk.bgGray.white(     '  MINOR   '),
};

// ─── Public API ───────────────────────────────────────────────────────────────

export function renderTerminal(report: AuditReport): void {
  console.log('');
  printHeader(report);
  printScoreSummary(report);

  const { results } = report;
  if (results.performance)   printCategorySection(results.performance);
  if (results.seo)           printCategorySection(results.seo);
  if (results.accessibility) printCategorySection(results.accessibility);

  printCriticalSummary(report);
  printFooter(report);
}

// ─── Header ──────────────────────────────────────────────────────────────────

function printHeader(report: AuditReport): void {
  const W = 66;
  const rule = '─'.repeat(W);

  const centre = (text: string) => {
    const pad = Math.max(0, Math.floor((W - text.length) / 2));
    return ' '.repeat(pad) + text + ' '.repeat(Math.max(0, W - pad - text.length));
  };

  console.log(chalk.cyan(`┌${rule}┐`));
  console.log(chalk.cyan('│') + chalk.bold(centre('🔍  UIAudit')) + chalk.cyan('│'));
  console.log(chalk.cyan('│') + chalk.cyan(centre(truncate(report.target, W - 2))) + chalk.cyan('│'));
  console.log(chalk.cyan('│') + chalk.dim(centre(new Date(report.timestamp).toLocaleString())) + chalk.cyan('│'));
  console.log(chalk.cyan(`└${rule}┘`));
  console.log('');
}

// ─── Score summary table ──────────────────────────────────────────────────────

function printScoreSummary(report: AuditReport): void {
  const { overallScore, totalFiles, results } = report;

  console.log(
    `${chalk.bold('Overall Score:')}  ${colorScore(overallScore)(`${overallScore}/100`)}  ${scoreLabel(overallScore)}` +
    chalk.dim(`   (${totalFiles} file${totalFiles !== 1 ? 's' : ''} scanned)\n`)
  );

  const rows: [string, AuditResult | undefined][] = [
    ['Performance',   results.performance],
    ['SEO',           results.seo],
    ['Accessibility', results.accessibility],
  ];

  for (const [label, result] of rows) {
    if (!result) continue;
    const { score, counts } = result;

    const bar      = scoreBar(score);
    const scoreStr = colorScore(score)(`${score}/100`.padEnd(8));
    const summary  =
      counts.total === 0
        ? chalk.green('No issues ✓')
        : [
            counts.critical ? chalk.red.bold(`${counts.critical} critical`) : '',
            counts.major    ? chalk.yellow(`${counts.major} major`)         : '',
            counts.minor    ? chalk.gray(`${counts.minor} minor`)           : '',
          ]
            .filter(Boolean)
            .join(chalk.dim('  '));

    console.log(`  ${chalk.bold(label.padEnd(15))} ${scoreStr} ${bar}  ${summary}`);
  }

  console.log('');
}

// ─── Category section ─────────────────────────────────────────────────────────

function printCategorySection(result: AuditResult): void {
  const CATEGORY_COLORS: Record<string, chalk.ChalkFunction> = {
    performance:   chalk.blue.bold,
    seo:           chalk.green.bold,
    accessibility: chalk.magenta.bold,
  };

  const color = CATEGORY_COLORS[result.category] ?? chalk.bold;
  const title = result.category.toUpperCase();

  console.log(color('═'.repeat(62)));
  console.log(
    color(`  ${title}`) +
    color('  ·  ') +
    colorScore(result.score)(`${result.score}/100`)
  );
  console.log(color('═'.repeat(62)));
  console.log('');

  if (result.issues.length === 0) {
    console.log(`  ${chalk.green('✅')}  No issues found.\n`);
    return;
  }

  // Print issues grouped by impact level (critical → major → minor)
  const groups: IssueImpact[] = ['critical', 'major', 'minor'];
  for (const impact of groups) {
    const group = result.issues.filter((i) => i.impact === impact);
    if (group.length === 0) continue;

    for (const issue of group) {
      printIssue(issue);
    }
  }

  console.log('');
}

// ─── Single issue block ───────────────────────────────────────────────────────

function printIssue(issue: Issue): void {
  const statusIcon = issue.status === 'fail' ? '❌' : '⚠️ ';
  const badge      = IMPACT_BADGE[issue.impact];

  // Location string (file:line)
  const location = issue.file && issue.line
    ? chalk.dim(`  ${shortPath(issue.file)}:${issue.line}`)
    : '';

  console.log(`  ${statusIcon}  ${badge}  ${chalk.bold(issue.title)}${location}`);
  console.log(`       ${chalk.dim(issue.description)}`);
  console.log('');

  // Code snippet (what's wrong)
  if (issue.codeSnippet) {
    console.log(`       ${chalk.red.dim('✗')}  ${chalk.red.dim(issue.codeSnippet)}`);
  }

  // Fix snippet (what to write instead)
  if (issue.fixSnippet) {
    console.log(`       ${chalk.green.dim('✓')}  ${chalk.green(issue.fixSnippet)}`);
  }

  // Multi-line suggestion
  console.log('');
  const suggestionLines = issue.suggestion.split('\n');
  console.log(`       ${chalk.cyan('💡 Fix:')} ${suggestionLines[0]}`);
  for (const line of suggestionLines.slice(1)) {
    console.log(`              ${chalk.dim(line)}`);
  }

  console.log('');
  console.log('       ' + chalk.dim('─'.repeat(54)));
  console.log('');
}

// ─── Critical summary (always shown at the end if any critical exist) ─────────

function printCriticalSummary(report: AuditReport): void {
  const criticals: Issue[] = [];

  for (const result of Object.values(report.results)) {
    if (!result) continue;
    criticals.push(...result.issues.filter((i) => i.impact === 'critical'));
  }

  if (criticals.length === 0) return;

  console.log(chalk.red.bold(`┌─ 🚨 Fix These First (${criticals.length} critical issue${criticals.length !== 1 ? 's' : ''}) ${'─'.repeat(25)}┐`));
  console.log('');

  criticals.slice(0, 6).forEach((issue, idx) => {
    const cat = issue.category.padEnd(13);
    console.log(
      `  ${chalk.red.bold(String(idx + 1) + '.')}  ` +
      chalk.dim(`[${cat}]`) + '  ' +
      chalk.bold(issue.title)
    );
    if (issue.file) {
      console.log(`        ${chalk.dim(shortPath(issue.file))}${issue.line ? chalk.dim(`:${issue.line}`) : ''}`);
    }
    console.log('');
  });

  console.log(chalk.red.bold('└' + '─'.repeat(58) + '┘'));
  console.log('');
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function printFooter(report: AuditReport): void {
  const totalIssues = Object.values(report.results)
    .filter(Boolean)
    .reduce((sum, r) => sum + r!.counts.total, 0);

  if (totalIssues === 0) {
    console.log(chalk.green.bold('  ✅  All checks passed. Your code looks good!\n'));
  } else {
    console.log(
      chalk.dim(
        `  Found ${totalIssues} issue${totalIssues !== 1 ? 's' : ''} across ` +
        `${report.totalFiles} file${report.totalFiles !== 1 ? 's' : ''}. ` +
        `Run with --output json to export the full report.\n`
      )
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreBar(score: number): string {
  const filled = Math.round(score / 10);
  const empty  = 10 - filled;
  const color  = score >= 90 ? chalk.green : score >= 70 ? chalk.yellow : chalk.red;
  return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
}

function colorScore(score: number): chalk.ChalkFunction {
  if (score >= 90) return chalk.green.bold;
  if (score >= 70) return chalk.yellow.bold;
  if (score >= 50) return chalk.yellow;
  return chalk.red.bold;
}

function scoreLabel(score: number): string {
  if (score >= 90) return chalk.green('Excellent ✓');
  if (score >= 70) return chalk.yellow('Good');
  if (score >= 50) return chalk.yellow('Needs work');
  return chalk.red.bold('Critical issues found');
}

/** Show only the last 3 path segments to keep output readable. */
function shortPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return (parts.length > 3 ? '…/' : '') + parts.slice(-3).join('/');
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? '…' + str.slice(-(maxLen - 1)) : str;
}