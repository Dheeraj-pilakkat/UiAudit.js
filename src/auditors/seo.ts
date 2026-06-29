import { traverse } from '../parser/traverse.js';
import type { ParsedFile } from '../parser/index.js';
import type { Issue } from '../types.js';

/**
 * Audits parsed files for SEO issues detectable via static AST analysis.
 * Focus: things that directly cost you search ranking or crawlability.
 */
export function auditSEO(parsedFiles: ParsedFile[]): Issue[] {
  const issues: Issue[] = [];

  for (const { ast, filePath } of parsedFiles) {
    // Per-file state — we collect import info first, then use it in checks
    const fileState = {
      importsNextImage: false,
      imgTagLines: [] as number[],
    };

    traverse(ast, {

      // ── Track which packages this file imports ────────────────────────────
      ImportDeclaration(path: any) {
        if (path.node.source.value === 'next/image') {
          fileState.importsNextImage = true;
        }
      },

      // ── All JSXOpeningElement checks ──────────────────────────────────────
      JSXOpeningElement(path: any) {
        const node = path.node;
        if (node.name.type !== 'JSXIdentifier') return;

        const tagName = node.name.name;

        // Helper: check if an attribute exists on this element
        const hasAttr = (name: string): boolean =>
          node.attributes.some(
            (a: any) =>
              a.type === 'JSXAttribute' &&
              a.name.type === 'JSXIdentifier' &&
              a.name.name === name
          );

        // Helper: get an attribute's string value (returns null if dynamic/absent)
        const getStringAttr = (name: string): string | null => {
          const attr = node.attributes.find(
            (a: any) =>
              a.type === 'JSXAttribute' &&
              a.name.type === 'JSXIdentifier' &&
              a.name.name === name
          ) as any;
          return attr?.value?.type === 'StringLiteral'
            ? attr.value.value
            : null;
        };

        // ── Check 1: <img> without alt attribute ─────────────────────────
        //
        // Why this matters: Google uses alt text to understand image content
        // for image search ranking. Missing alt = invisible to search engines.
        if (tagName === 'img') {
          fileState.imgTagLines.push(node.loc?.start.line ?? 0);

          if (!hasAttr('alt')) {
            issues.push({
              id: 'img-missing-alt',
              category: 'seo',
              title: '<img> is missing an alt attribute',
              description:
                'Search engines use alt text to index image content. Missing alt attributes also break Google Image Search rankings and violate WCAG 1.1.1.',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add an alt attribute describing what the image shows.\nFor decorative images (pure visual flair, no meaning): alt=""\nFor meaningful images: alt="Two developers reviewing code on a laptop"',
              codeSnippet: '<img src={hero} />',
              fixSnippet:  '<img src={hero} alt="Hero banner showing the product dashboard" />',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 2: Self-closing <a> with no content or aria-label ──────
        //
        // Why this matters: Google uses anchor text to understand what the
        // linked page is about. An empty link gives it nothing to rank on.
        if (tagName === 'a' && node.selfClosing) {
          const hasAriaLabel = hasAttr('aria-label');
          const hasTitle = hasAttr('title');

          if (!hasAriaLabel && !hasTitle) {
            issues.push({
              id: 'anchor-no-content',
              category: 'seo',
              title: '<a> tag has no content or accessible label',
              description:
                'Empty anchor tags give search engines no anchor text to rank with, and give screen readers nothing to announce. Both hurt you — one in rankings, one in accessibility.',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add descriptive text between <a> and </a>, or add aria-label if the link contains only an icon:\n<a href="/about">About us</a>\n// Icon-only link:\n<a href="/about" aria-label="About us"><Icon /></a>',
              codeSnippet: '<a href="/about" />',
              fixSnippet:  '<a href="/about">About us</a>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 3: <div> used where a semantic HTML tag belongs ────────
        //
        // Why this matters: Semantic HTML is a direct ranking signal.
        // Google's crawlers assign structural meaning to <nav>, <main>,
        // <article>, etc. A <div> with className="nav" tells them nothing.
        if (tagName === 'div') {
          // Look at className and id for hints about intended semantics
          const className = getStringAttr('className') ?? '';
          const idVal     = getStringAttr('id') ?? '';
          const combined  = `${className} ${idVal}`.toLowerCase();

          const SEMANTIC_MAP: Record<string, string> = {
            nav:         'nav',
            navigation:  'nav',
            header:      'header',
            footer:      'footer',
            main:        'main',
            sidebar:     'aside',
            aside:       'aside',
            article:     'article',
            section:     'section',
          };

          // Check each word in className/id against our semantic map
          const words = combined.split(/[\s\-_/]+/);
          const match = words.find((w) => SEMANTIC_MAP[w]);

          if (match) {
            const replacement = SEMANTIC_MAP[match];
            issues.push({
              id: 'non-semantic-html',
              category: 'seo',
              title: `Use <${replacement}> instead of <div className="${className || idVal}">`,
              description:
                `Search engines assign structural roles to semantic HTML elements. <${replacement}> signals its purpose to Google's crawler and improves your document outline. A <div> is invisible to that system.`,
              impact: 'minor',
              status: 'warning',
              suggestion:
                `Replace <div> with <${replacement}>. You can keep the existing className — the element name is what changes.\n<${replacement} className="${className || idVal}">...</${replacement}>`,
              codeSnippet: `<div className="${className || idVal}">...</div>`,
              fixSnippet:  `<${replacement} className="${className || idVal}">...</${replacement}>`,
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

      }, // end JSXOpeningElement

    }); // end traverse

    // ── Post-traverse: Check for raw <img> in Next.js component files ────────
    //
    // This runs AFTER traverse because we need to know both:
    //   (a) whether 'next/image' was imported (set in ImportDeclaration)
    //   (b) whether any <img> tags were used (set in JSXOpeningElement)
    //
    // Why this matters: next/image gives you automatic WebP, lazy-loading,
    // responsive sizes, and CLS prevention — all Core Web Vitals wins.
    // A raw <img> tag bypasses ALL of that.

    const isComponentFile =
      filePath.endsWith('.tsx') || filePath.endsWith('.jsx');

    if (
      isComponentFile &&
      fileState.imgTagLines.length > 0 &&
      !fileState.importsNextImage
    ) {
      for (const line of fileState.imgTagLines) {
        issues.push({
          id: 'use-next-image',
          category: 'seo',
          title: 'Use Next.js <Image> instead of <img>',
          description:
            'Next.js <Image> automatically converts to WebP, lazy-loads below-the-fold images, prevents layout shift (CLS), and serves correctly-sized images per viewport. Raw <img> gets none of this.',
          impact: 'major',
          status: 'warning',
          suggestion:
            "Import and use the Next.js Image component:\nimport Image from 'next/image';\n\n// Replace:\n<img src={src} alt={alt} width={500} height={300} />",
          codeSnippet: `import Image from 'next/image';`,
          fixSnippet:  `<Image src={src} alt="description" width={500} height={300} />`,
          file: filePath,
          line,
        });
      }
    }
  }

  return deduplicate(issues);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deduplicate(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.id}::${i.file}::${i.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}