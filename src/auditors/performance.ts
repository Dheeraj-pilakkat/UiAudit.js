import { traverse } from '../parser/traverse.js';
import type { ParsedFile } from '../parser/index.js';
import type { Issue } from '../types.js';

/**
 * Audits parsed files for React performance anti-patterns.
 * All checks are purely static — no browser, no runtime needed.
 */
export function auditPerformance(parsedFiles: ParsedFile[]): Issue[] {
  const issues: Issue[] = [];

  for (const { ast, filePath } of parsedFiles) {
    traverse(ast, {

      /**
       * All CallExpression checks are merged into ONE visitor.
       * Babel traverse does NOT support duplicate visitor keys —
       * the last one silently wins. Always merge.
       */
      CallExpression(path: any) {
        const node = path.node;

        // ── Check 1: .map() returning JSX without a key prop ─────────────
        //
        // Why this matters: React uses keys to identify which items in a
        // list changed. Without keys, React re-renders the entire list on
        // every state change — O(n) DOM mutations instead of O(1).
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'map' &&
          node.arguments.length > 0
        ) {
          const callback = node.arguments[0];
          if (
            callback.type === 'ArrowFunctionExpression' ||
            callback.type === 'FunctionExpression'
          ) {
            const body = callback.body;
            let jsxEl: any = null;

            // Arrow fn with implicit return: items.map(item => <div />)
            if (body.type === 'JSXElement' || body.type === 'JSXFragment') {
              jsxEl = body;
            }

            // Arrow fn with block body: items.map(item => { return <div /> })
            if (body.type === 'BlockStatement') {
              const ret = body.body.find(
                (s: any) =>
                  s.type === 'ReturnStatement' &&
                  (s as any).argument?.type === 'JSXElement'
              ) as any;
              jsxEl = ret?.argument ?? null;
            }

            if (jsxEl?.type === 'JSXElement') {
              const attrs = jsxEl.openingElement.attributes as any[];
              const hasKey = attrs.some(
                (a) =>
                  a.type === 'JSXAttribute' &&
                  a.name?.type === 'JSXIdentifier' &&
                  a.name.name === 'key'
              );

              if (!hasKey) {
                issues.push({
                  id: 'missing-key-prop',
                  category: 'performance',
                  title: 'Missing key prop in list render',
                  description:
                    'React uses keys to identify which items changed, were added, or removed. Without a key, React re-renders the whole list on every state update — even when nothing changed.',
                  impact: 'major',
                  status: 'fail',
                  suggestion:
                    'Add a unique, stable key to the root element inside .map(). Use a real ID from your data — never the array index (index shifts when items are added/removed).',
                  codeSnippet: 'items.map(item => <Card>{item.name}</Card>)',
                  fixSnippet:  'items.map(item => <Card key={item.id}>{item.name}</Card>)',
                  file: filePath,
                  line: node.loc?.start.line,
                });
              }
            }
          }
        }

        // ── Check 2: useEffect with no dependency array ───────────────────
        //
        // Why this matters: No second argument = runs after EVERY render.
        // This is almost always a bug — it creates fetch loops, causes
        // infinite re-renders, and kills performance.
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'useEffect' &&
          node.arguments.length === 1   // 2nd arg (dep array) is absent
        ) {
          issues.push({
            id: 'useeffect-no-deps',
            category: 'performance',
            title: 'useEffect is missing a dependency array',
            description:
              'A useEffect with no second argument runs after every single render, including renders triggered by unrelated state changes. This almost always causes performance problems or infinite loops.',
            impact: 'major',
            status: 'fail',
            suggestion:
              'Add a dependency array as the second argument.\n  [] — run once on mount (equivalent to componentDidMount)\n  [value] — run whenever `value` changes\n  [id, token] — run when either changes',
            codeSnippet: 'useEffect(() => { fetchUser(id); })',
            fixSnippet:  'useEffect(() => { fetchUser(id); }, [id])',
            file: filePath,
            line: node.loc?.start.line,
          });
        }

        // ── Check 3: console.log/debug/info in component files ────────────
        //
        // Why this matters: Console calls shipped to production leak
        // internal data to any user who opens DevTools, and they
        // accumulate into thousands of log entries in long sessions.
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'console' &&
          node.callee.property.type === 'Identifier' &&
          ['log', 'debug', 'info'].includes(node.callee.property.name)
        ) {
          const method = (node.callee.property as any).name as string;
          issues.push({
            id: 'console-in-component',
            category: 'performance',
            title: `console.${method}() left in component`,
            description:
              `console.${method} calls shipped to production expose internal data to end users and clutter the browser DevTools console.`,
            impact: 'minor',
            status: 'warning',
            suggestion:
              'Remove before shipping. For intentional debug logging, gate it:\nif (process.env.NODE_ENV !== "production") console.log(...)',
            file: filePath,
            line: node.loc?.start.line,
          });
        }
      }, // end CallExpression

      // ── Check 4: Complex inline function in event handler props ──────────
      //
      // Why this matters: () => { ... } inside JSX creates a NEW function
      // object on every render. Any child component that receives this prop
      // will always fail React.memo's shallow equality check and re-render.
      JSXAttribute(path: any) {
        const node = path.node;
        const EVENT_HANDLERS = [
          'onClick', 'onChange', 'onSubmit', 'onBlur', 'onFocus', 'onKeyDown',
        ];

        if (
          node.name.type !== 'JSXIdentifier' ||
          !EVENT_HANDLERS.includes(node.name.name)
        ) return;

        if (node.value?.type !== 'JSXExpressionContainer') return;

        const expr = node.value.expression;
        if (
          expr.type !== 'ArrowFunctionExpression' &&
          expr.type !== 'FunctionExpression'
        ) return;

        // Only flag truly inline logic — 2+ statements in the function body.
        // A simple pass-through like onClick={() => onClick(item)} is fine.
        const body = (expr as any).body;
        const isComplex =
          body?.type === 'BlockStatement' && body.body.length >= 2;

        if (isComplex) {
          const propName = node.name.name;
          const handlerName = `handle${propName.slice(2)}`; // onClick → handleClick

          issues.push({
            id: 'inline-handler-in-jsx',
            category: 'performance',
            title: `Complex inline function in ${propName} prop`,
            description:
              `This creates a new function reference on every render. Any child receiving this prop via React.memo or PureComponent will always re-render because the prop value is never referentially equal.`,
            impact: 'minor',
            status: 'warning',
            suggestion:
              `Extract into a useCallback at the top of your component:\n\nconst ${handlerName} = useCallback(() => {\n  // your logic here\n}, [/* list dependencies */]);\n\n// Then use:\n<Component ${propName}={${handlerName}} />`,
            codeSnippet: `<Button ${propName}={() => { doA(); doB(); }}>`,
            fixSnippet:  `const ${handlerName} = useCallback(() => { doA(); doB(); }, []);\n<Button ${propName}={${handlerName}}>`,
            file: filePath,
            line: node.loc?.start.line,
          });
        }
      }, // end JSXAttribute

    }); // end traverse
  }

  return deduplicate(issues);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Drop exact duplicate issues (same rule, file, and line). */
function deduplicate(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.id}::${issue.file}::${issue.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}