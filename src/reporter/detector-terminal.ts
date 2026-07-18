import chalk from 'chalk';
import type { DetectionResult, TechMatch } from '../detector.js';

export function renderDetectorTerminal(result: DetectionResult): void {
  const W = 66;
  const rule = '─'.repeat(W);

  const centre = (text: string) => {
    const pad = Math.max(0, Math.floor((W - text.length) / 2));
    return ' '.repeat(pad) + text + ' '.repeat(Math.max(0, W - pad - text.length));
  };

  console.log('');
  console.log(chalk.cyan(`┌${rule}┐`));
  console.log(chalk.cyan('│') + chalk.bold(centre('🔍  UIAudit Tech Detect')) + chalk.cyan('│'));
  console.log(chalk.cyan('│') + chalk.cyan(centre(truncate(result.url, W - 2))) + chalk.cyan('│'));
  if (result.title) {
    console.log(chalk.cyan('│') + chalk.dim(centre(truncate(result.title, W - 2))) + chalk.cyan('│'));
  }
  console.log(chalk.cyan(`└${rule}┘`));
  console.log('');

  const statusColor = result.statusCode >= 200 && result.statusCode < 300 ? chalk.green : chalk.yellow;
  console.log(`  ${chalk.bold('Target URL:')}   ${chalk.cyan(result.url)}`);
  console.log(`  ${chalk.bold('HTTP Status:')}  ${statusColor(`${result.statusCode}`)}`);
  console.log('');

  if (result.technologies.length === 0) {
    console.log(`  ${chalk.yellow('⚠ No common technologies detected on this page.')}`);
    console.log(`     (The site might use custom stack components not matched by our rules.)`);
    console.log('');
    return;
  }

  console.log(chalk.bold('  Detected Stack:'));
  console.log('');

  // Group technologies by category
  const categories = [
    { key: 'Frameworks', icon: '📦' },
    { key: 'UI & Styling', icon: '🎨' },
    { key: 'CMS & E-commerce', icon: '🛒' },
    { key: 'Analytics & Ads', icon: '📈' },
    { key: 'Hosting & CDN', icon: '☁️' },
    { key: 'Utilities & Fonts', icon: '🔧' },
  ];

  for (const cat of categories) {
    const techs = result.technologies.filter(t => t.category === cat.key);
    if (techs.length === 0) continue;

    console.log(`  ${cat.icon} ${chalk.bold.underline(cat.key)}`);
    for (const tech of techs) {
      const confBadge = getConfidenceBadge(tech.confidence);
      console.log(`    • ${chalk.green(tech.name.padEnd(20))} ${confBadge} ${chalk.dim(tech.evidence)}`);
    }
    console.log('');
  }

  console.log(chalk.dim('  ' + '─'.repeat(W - 4)));
  console.log(
    chalk.dim(
      `  Found ${result.technologies.length} tech stack element${result.technologies.length !== 1 ? 's' : ''}.\n`
    )
  );
}

function getConfidenceBadge(confidence: 'high' | 'medium' | 'low'): string {
  switch (confidence) {
    case 'high':
      return chalk.bgGreen.black.bold(' HIGH ');
    case 'medium':
      return chalk.bgYellow.black.bold(' MED  ');
    case 'low':
      return chalk.bgGray.white(' LOW  ');
  }
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 3) + '…' : str;
}
