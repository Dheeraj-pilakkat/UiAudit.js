import * as path from 'path';

/**
 * Determines whether a given source file represents a standalone page / route / layout document
 * versus an imported modular sub-component (e.g. Marquee.tsx, ProjectCard.tsx, SmoothScroll.tsx).
 *
 * @param filePath The absolute or relative file path.
 * @param ast Optional Babel AST of the parsed file.
 * @returns boolean True if the file represents a page/route/layout; false if it's a sub-component.
 */
export function isPageFile(filePath: string, ast?: any): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const fileName = path.basename(normalizedPath);
  const lowerFileName = fileName.toLowerCase();

  // 1. Explicit Framework Page / Route / Layout path rules:
  // Next.js App Router (app/page.tsx, app/about/page.tsx, app/layout.tsx, app/template.tsx, src/app/...)
  if (/(^|\/)app\/(.+\/)?(page|layout|template)\.[jt]sx?$/i.test(normalizedPath)) {
    return true;
  }

  // Next.js Pages Router (pages/index.tsx, pages/about.tsx, src/pages/contact.tsx)
  // Exclude API routes (pages/api/...)
  if (/(^|\/)pages\/(?!api\/).+\.[jt]sx?$/i.test(normalizedPath)) {
    return true;
  }

  // General Page/Route/View/Screen directory conventions (routes/home.tsx, src/pages/About.tsx, src/views/Profile.tsx, src/screens/Feed.tsx)
  if (/(^|\/)(pages|routes|views|screens)\/.+\.[jt]sx?$/i.test(normalizedPath)) {
    return true;
  }

  // Root Entry point files (App.tsx, Root.tsx) when not inside a component directory
  if (
    /^(app|root)\.[jt]sx?$/i.test(lowerFileName) &&
    !/(^|\/)(components|subcomponents|ui|widgets|common|shared|elements|modules)\//i.test(normalizedPath)
  ) {
    return true;
  }

  // 2. AST Content Signals (if AST is provided)
  if (ast) {
    let hasPageSignal = false;

    const body = ast.program?.body || ast.body || [];
    if (Array.isArray(body)) {
      for (const statement of body) {
        // Check for Next.js metadata or data fetching exports
        if (statement.type === 'ExportNamedDeclaration') {
          const decl = statement.declaration;
          if (decl?.type === 'VariableDeclaration') {
            for (const d of decl.declarations) {
              if (d.id?.type === 'Identifier' && ['metadata', 'viewport'].includes(d.id.name)) {
                hasPageSignal = true;
              }
            }
          } else if (decl?.type === 'FunctionDeclaration') {
            if (decl.id?.type === 'Identifier' && ['generateMetadata', 'getStaticProps', 'getServerSideProps', 'getStaticPaths'].includes(decl.id.name)) {
              hasPageSignal = true;
            }
          }
        }
      }
    }

    if (hasPageSignal) {
      return true;
    }
  }

  // 3. Explicit Component / Sub-component directory check
  // If inside components/, ui/, subcomponents/, widgets/, shared/, modules/, features/*/components/
  if (
    /(^|\/)(components|subcomponents|ui|widgets|common|shared|elements|modules)\//i.test(normalizedPath) ||
    /(^|\/)features\/[^\/]+\/components\//i.test(normalizedPath)
  ) {
    return false;
  }

  // 4. Default for non-route files:
  // If the file is not in a page directory, does not match page patterns, and has no metadata/route exports,
  // treat it as a component file rather than a standalone page.
  return false;
}
