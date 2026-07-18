#!/usr/bin/env node
/**
 * UIAudit CLI entry point.
 * This file is what runs when someone types `uiaudit` in their terminal.
 *
 * The bin field in package.json points to `dist/cli.js` (compiled version).
 * During development: `npx ts-node src/cli.ts audit ./src`
 */

import { Command } from 'commander';
import ora         from 'ora';
import chalk       from 'chalk';
import * as fs     from 'fs';
import * as path   from 'path';

import { runAudit }        from './auditor.js';
import { renderTerminal }  from './reporter/terminal.js';
import { detectTechStack } from './detector.js';
import { renderDetectorTerminal } from './reporter/detector-terminal.js';
import type { AuditCategory } from './types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_CATEGORIES: AuditCategory[] = ['performance', 'seo', 'accessibility'];
const VERSION = '1.0.0';

// ─── CLI setup ────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('uiaudit')
  .description('Audit React/Next.js components for performance, SEO, and accessibility issues')
  .version(VERSION);

// ─── Main command: uiaudit audit <target> ────────────────────────────────────

program
  .command('audit <target>')
  .description('Audit a file or directory of React/Next.js components')
  .option(
    '-t, --type <types>',
    'Comma-separated audit categories to run: performance, seo, accessibility',
    'performance,seo,accessibility'
  )
  .option(
    '-o, --output <format>',
    'Output format: terminal (default) or json',
    'terminal'
  )
  .option(
    '-f, --file <path>',
    'Save JSON report to a file (also prints to terminal by default)'
  )
  .action((target: string, opts: { type: string; output: string; file?: string }) => {
    const types = parseTypes(opts.type);
    if (!types) process.exit(1);

    runAuditCommand(target, types, opts.output, opts.file);
  });

// ─── Shorthand commands ───────────────────────────────────────────────────────
// These exist so developers can type `uiaudit perf ./src` instead of the
// full `uiaudit audit ./src --type performance`. Less typing = more usage.

program
  .command('perf <target>')
  .description('Shorthand: run performance audit only')
  .option('-o, --output <format>', 'Output format: terminal or json', 'terminal')
  .option('-f, --file <path>', 'Save JSON report to a file')
  .action((target: string, opts: { output: string; file?: string }) => {
    runAuditCommand(target, ['performance'], opts.output, opts.file);
  });

program
  .command('seo <target>')
  .description('Shorthand: run SEO audit only')
  .option('-o, --output <format>', 'Output format: terminal or json', 'terminal')
  .option('-f, --file <path>', 'Save JSON report to a file')
  .action((target: string, opts: { output: string; file?: string }) => {
    runAuditCommand(target, ['seo'], opts.output, opts.file);
  });

program
  .command('a11y <target>')
  .description('Shorthand: run accessibility audit only')
  .option('-o, --output <format>', 'Output format: terminal or json', 'terminal')
  .option('-f, --file <path>', 'Save JSON report to a file')
  .action((target: string, opts: { output: string; file?: string }) => {
    runAuditCommand(target, ['accessibility'], opts.output, opts.file);
  });

program
  .command('detect <url>')
  .description('Detect the technology stack of a live website')
  .option('-o, --output <format>', 'Output format: terminal or json', 'terminal')
  .option('-f, --file <path>', 'Save JSON report to a file')
  .action((url: string, opts: { output: string; file?: string }) => {
    runDetectCommand(url, opts.output, opts.file);
  });

program.parse(process.argv);

// ─── Shared action handlers ───────────────────────────────────────────────────

function runAuditCommand(
  target: string,
  types: AuditCategory[],
  output: string,
  outputFile?: string
): void {
  const spinner = ora({
    text: `Scanning ${chalk.cyan(target)}...`,
    color: 'cyan',
  }).start();

  try {
    const report = runAudit(target, { types });

    spinner.succeed(
      chalk.green(
        `Scanned ${report.totalFiles} file${report.totalFiles !== 1 ? 's' : ''}`
      )
    );

    // Save JSON report to file if requested
    if (outputFile) {
      const resolvedPath = path.resolve(outputFile);
      fs.writeFileSync(resolvedPath, JSON.stringify(report, null, 2), 'utf-8');
      console.log(chalk.green(`\n  ✓ Report saved → ${resolvedPath}\n`));
    }

    // Render output
    if (output === 'json') {
      console.log(JSON.stringify(report, null, 2));
    } else {
      renderTerminal(report);
    }

    // Exit code 1 if any critical issues — makes this useful in CI pipelines.
    // Example: `uiaudit audit ./src && git push` will block the push if crits exist.
    const hasCritical = Object.values(report.results).some(
      (r) => r && r.counts.critical > 0
    );
    process.exit(hasCritical ? 1 : 0);

  } catch (err: unknown) {
    spinner.fail(chalk.red(`Audit failed: ${(err as Error).message}`));
    if (process.env.DEBUG) {
      console.error('\n', err);
    } else {
      console.error(chalk.dim('  Run with DEBUG=1 for stack trace.'));
    }
    process.exit(1);
  }
}

async function runDetectCommand(url: string, output: string, outputFile?: string): Promise<void> {
  const spinner = ora({
    text: `Analyzing tech stack for ${chalk.cyan(url)}...`,
    color: 'cyan',
  }).start();

  try {
    const result = await detectTechStack(url);

    spinner.succeed(
      chalk.green(
        `Successfully analyzed ${chalk.cyan(result.url)}`
      )
    );

    // Save JSON report to file if requested
    if (outputFile) {
      const resolvedPath = path.resolve(outputFile);
      fs.writeFileSync(resolvedPath, JSON.stringify(result, null, 2), 'utf-8');
      console.log(chalk.green(`\n  ✓ Report saved → ${resolvedPath}\n`));
    }

    if (output === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      renderDetectorTerminal(result);
    }

    process.exit(0);
  } catch (err: unknown) {
    spinner.fail(chalk.red(`Detection failed: ${(err as Error).message}`));
    if (process.env.DEBUG) {
      console.error('\n', err);
    } else {
      console.error(chalk.dim('  Run with DEBUG=1 for stack trace.'));
    }
    process.exit(1);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseTypes(raw: string): AuditCategory[] | null {
  const parts = raw.split(',').map((t) => t.trim().toLowerCase()) as AuditCategory[];
  const invalid = parts.filter((p) => !ALL_CATEGORIES.includes(p));

  if (invalid.length > 0) {
    console.error(
      chalk.red(`\n  Unknown category: "${invalid.join('", "')}"\n`) +
      chalk.dim(`  Valid options: ${ALL_CATEGORIES.join(', ')}\n`)
    );
    return null;
  }

  return parts;
}