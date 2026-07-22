import { describe, it, expect } from 'vitest';
import { isPageFile } from './utils/page.js';
import { parseFile } from './parser/index.js';
import { auditAccessibility } from './auditors/accessibility.js';

describe('Page vs Component Detection (isPageFile)', () => {
  it('should identify sub-components like Marquee.tsx, ProjectCard.tsx, and SmoothScroll.tsx as components', () => {
    expect(isPageFile('/project/src/components/Marquee.tsx')).toBe(false);
    expect(isPageFile('/project/src/components/ProjectCard.tsx')).toBe(false);
    expect(isPageFile('/project/src/components/SmoothScroll.tsx')).toBe(false);
    expect(isPageFile('/project/src/ui/button.tsx')).toBe(false);
  });

  it('should identify framework page routes as pages', () => {
    expect(isPageFile('/project/src/app/page.tsx')).toBe(true);
    expect(isPageFile('/project/src/app/about/page.tsx')).toBe(true);
    expect(isPageFile('/project/src/pages/index.tsx')).toBe(true);
    expect(isPageFile('/project/src/pages/contact.jsx')).toBe(true);
    expect(isPageFile('/project/src/routes/dashboard.tsx')).toBe(true);
    expect(isPageFile('/project/src/App.tsx')).toBe(true);
  });

  it('should not report page-missing-h1 for sub-components', () => {
    const mockComponentAst = {
      type: 'File',
      program: {
        type: 'Program',
        body: [],
      },
    } as any;

    const parsedSubComponent = {
      filePath: '/project/src/components/Marquee.tsx',
      ast: mockComponentAst,
      source: 'export function Marquee() { return <div>Scrolling text</div>; }',
      isPage: false,
    };

    const issues = auditAccessibility([parsedSubComponent]);
    const h1Issue = issues.find((i) => i.id === 'page-missing-h1');
    expect(h1Issue).toBeUndefined();
  });

  it('should report page-missing-h1 for page files missing an <h1> element', () => {
    const mockPageAst = {
      type: 'File',
      program: {
        type: 'Program',
        body: [],
      },
    } as any;

    const parsedPage = {
      filePath: '/project/src/app/page.tsx',
      ast: mockPageAst,
      source: 'export default function Page() { return <main><p>Hello</p></main>; }',
      isPage: true,
    };

    const issues = auditAccessibility([parsedPage]);
    const h1Issue = issues.find((i) => i.id === 'page-missing-h1');
    expect(h1Issue).toBeDefined();
    expect(h1Issue?.id).toBe('page-missing-h1');
  });
});
