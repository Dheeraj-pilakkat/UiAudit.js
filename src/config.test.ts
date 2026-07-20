import { describe, it, expect } from 'vitest';
import { shouldIgnoreFile, applyConfigToIssues } from './config.js';
import type { Issue } from './types.js';

describe('Config Loader & Ignore System', () => {
  it('should correctly match ignore glob patterns', () => {
    expect(shouldIgnoreFile('/project/node_modules/react/index.js', ['node_modules/**'])).toBe(true);
    expect(shouldIgnoreFile('/project/dist/cli.js', ['dist/**'])).toBe(true);
    expect(shouldIgnoreFile('/project/src/Component.tsx', ['node_modules/**', 'dist/**'])).toBe(false);
  });

  it('should override rule impacts and filter out disabled rules', () => {
    const mockIssues: Issue[] = [
      {
        id: 'img-missing-alt',
        category: 'seo',
        title: 'Missing alt',
        description: 'Test',
        impact: 'major',
        status: 'fail',
        suggestion: 'Fix alt',
      },
      {
        id: 'console-in-component',
        category: 'performance',
        title: 'Console log',
        description: 'Test',
        impact: 'minor',
        status: 'warning',
        suggestion: 'Remove console',
      },
    ];

    const rules = {
      'img-missing-alt': 'critical' as const,
      'console-in-component': 'off' as const,
    };

    const updated = applyConfigToIssues(mockIssues, rules);

    expect(updated.length).toBe(1);
    expect(updated[0]?.id).toBe('img-missing-alt');
    expect(updated[0]?.impact).toBe('critical');
    expect(updated[0]?.status).toBe('fail');
  });
});
