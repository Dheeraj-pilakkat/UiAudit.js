import { traverse } from '../parser/traverse.js';
import type { ParsedFile } from '../parser/index.js';
import type { Issue } from '../types.js';

/**
 * Audits parsed files for accessibility (a11y) violations detectable via
 * static JSX analysis. Checks map directly to WCAG 2.1 success criteria.
 */
export function auditAccessibility(parsedFiles: ParsedFile[]): Issue[] {
  const issues: Issue[] = [];

  for (const { ast, filePath } of parsedFiles) {
    const declaredIds = new Set<string>();
    const headingLevels: number[] = [];
    let hasH1 = false;
    let mainCount = 0;

    traverse(ast, {
      JSXOpeningElement(path: any) {
        const tagName = path.node.name?.type === 'JSXIdentifier' ? path.node.name.name : '';

        // Count <main> elements
        if (tagName === 'main') {
          mainCount++;
        }

        const attr = (path.node.attributes || []).find(
          (a: any) =>
            a.type === 'JSXAttribute' &&
            a.name.type === 'JSXIdentifier' &&
            a.name.name === 'id'
        ) as any;

        const value =
          attr?.value?.type === 'StringLiteral'
            ? attr.value.value
            : attr?.value?.type === 'JSXExpressionContainer' &&
              attr.value.expression?.type === 'StringLiteral'
            ? attr.value.expression.value
            : null;

        if (value) declaredIds.add(value);

        // Track heading levels for hierarchy check
        if (tagName.match(/^h[1-6]$/)) {
          const level = parseInt(tagName[1]);
          if (level === 1) hasH1 = true;
          headingLevels.push(level);
        }
      },
    });

    traverse(ast, {

      JSXOpeningElement(path: any) {
        const node = path.node;
        if (node.name.type !== 'JSXIdentifier') return;

        const tagName = node.name.name;

        // ─── Attribute helpers ─────────────────────────────────────────────

        /** Returns true if the element has an attribute with this name. */
        const hasAttr = (name: string): boolean =>
          node.attributes.some(
            (a: any) =>
              a.type === 'JSXAttribute' &&
              a.name.type === 'JSXIdentifier' &&
              a.name.name === name
          );

        /** Returns an attribute node (or undefined) by name. */
        const getAttr = (name: string) =>
          node.attributes.find(
            (a: any) =>
              a.type === 'JSXAttribute' &&
              a.name.type === 'JSXIdentifier' &&
              a.name.name === name
          ) as any;

        /** Returns a string attribute value, or null if dynamic/absent. */
        const getStringValue = (name: string): string | null => {
          const attr = getAttr(name);
          return attr?.value?.type === 'StringLiteral'
            ? attr.value.value
            : null;
        };

        // ── Check 1: <img> without alt attribute ─────────────────────────
        //
        // WCAG 2.1 SC 1.1.1 — Non-text Content (Level A)
        // Screen readers announce images to users who cannot see them.
        // Without alt text, the image is meaningless noise or completely
        // invisible, depending on the screen reader.
        if (tagName === 'img') {
          if (!hasAttr('alt')) {
            issues.push({
              id: 'img-missing-alt-a11y',
              category: 'accessibility',
              title: '<img> is missing an alt attribute',
              description:
                'Screen readers announce images using their alt text. Without it, users who rely on assistive technology cannot understand the image. Violates WCAG 2.1 SC 1.1.1 (Level A).',
              impact: 'critical',
              status: 'fail',
              suggestion:
                'Describe what the image shows: alt="A bar chart showing revenue growth from 2022 to 2024"\nFor purely decorative images (borders, spacers, backgrounds): alt="" — this tells screen readers to skip it.',
              codeSnippet: '<img src={chart} />',
              fixSnippet:  '<img src={chart} alt="Bar chart showing Q4 revenue" />',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 2: Clickable <div>/<span> without role and tabIndex ────
        //
        // WCAG 2.1 SC 2.1.1 — Keyboard (Level A)
        // <div> and <span> are not natively focusable or keyboard-operable.
        // A user navigating by keyboard (or using Switch Access) cannot
        // reach or activate a click handler on these elements.
        if (tagName === 'div' || tagName === 'span') {
          const hasOnClick   = hasAttr('onClick');
          const hasRole      = hasAttr('role');
          const hasTabIndex  = hasAttr('tabIndex');

          if (hasOnClick && (!hasRole || !hasTabIndex)) {
            const missing = [
              !hasRole     && 'role="button"',
              !hasTabIndex && 'tabIndex={0}',
            ]
              .filter(Boolean)
              .join(' and ');

            issues.push({
              id: 'clickable-div-no-role',
              category: 'accessibility',
              title: `<${tagName}> with onClick is missing ${missing}`,
              description:
                `<${tagName}> elements are not in the tab order and have no semantic role. Keyboard users and screen reader users cannot find or activate this element. Violates WCAG 2.1 SC 2.1.1 and SC 4.1.2 (both Level A).`,
              impact: 'critical',
              status: 'fail',
              suggestion:
                `Best fix: Replace <${tagName}> with <button> — it is focusable, keyboard-operable, and announces itself to screen readers automatically.\n\nIf you must use <${tagName}>:\n<${tagName} role="button" tabIndex={0} onClick={handler} onKeyDown={(e) => e.key === 'Enter' && handler()}>`,
              codeSnippet: `<${tagName} onClick={handleClick}>Submit</${tagName}>`,
              fixSnippet:  `<button onClick={handleClick}>Submit</button>`,
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 3: <label> without htmlFor ─────────────────────────────
        //
        // WCAG 2.1 SC 1.3.1 — Info and Relationships (Level A)
        // A label must be programmatically linked to its input so that
        // screen readers can announce "Email address, edit field" instead
        // of just "edit field" when the input is focused.
        if (tagName === 'label') {
          const hasHtmlFor        = hasAttr('htmlFor');
          const hasAriaLabelledBy = hasAttr('aria-labelledby');

          // Allow implicit label wrapping (<label><input /></label>)
          const parentNode = path.parentPath?.node as any;
          const hasWrappedInput =
            parentNode?.type === 'JSXElement' &&
            parentNode.children?.some(
              (c: any) =>
                c.type === 'JSXElement' &&
                c.openingElement?.name?.name === 'input'
            );

          if (!hasHtmlFor && !hasAriaLabelledBy && !hasWrappedInput) {
            issues.push({
              id: 'label-missing-htmlfor',
              category: 'accessibility',
              title: '<label> is not linked to an input',
              description:
                'This label has no htmlFor attribute and is not wrapping an input. Screen readers cannot associate the label text with any form field, so the input gets announced with no description. Violates WCAG 2.1 SC 1.3.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Link the label to its input via matching htmlFor / id:\n\n<label htmlFor="email-input">Email address</label>\n<input id="email-input" type="email" />\n\nOr use an implicit label by wrapping the input:\n<label>Email address <input type="email" /></label>',
              codeSnippet: '<label>Email</label>\n<input type="email" />',
              fixSnippet:  '<label htmlFor="email">Email</label>\n<input id="email" type="email" />',
              file: filePath,
              line: node.loc?.start.line,
            });
          }

          const htmlFor = getStringValue('htmlFor');
          if (htmlFor && !declaredIds.has(htmlFor)) {
            issues.push({
              id: 'label-htmlfor-invalid',
              category: 'accessibility',
              title: '<label> htmlFor references a missing id',
              description:
                'A label with htmlFor must point to an existing form control id. When the referenced id does not exist, assistive technology cannot associate the label with its input. Violates WCAG 2.1 SC 1.3.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Ensure htmlFor matches the id of a form control, or remove the attribute if it does not reference an existing element.',
              codeSnippet: '<label htmlFor="missing-id">Email</label>',
              fixSnippet:  '<label htmlFor="email">Email</label>\n<input id="email" type="email" />',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        const hasNonEmptyStringAttr = (name: string): boolean => {
          const value = getStringValue(name);
          return typeof value === 'string' && value.trim().length > 0;
        };

        const containsVisibleText = (node: any): boolean => {
          if (!node) return false;
          if (node.type === 'JSXText') return node.value.trim().length > 0;
          if (node.type === 'JSXExpressionContainer') {
            return (
              node.expression?.type === 'StringLiteral' &&
              node.expression.value.trim().length > 0
            );
          }
          if (node.type === 'JSXElement') {
            return node.children.some(containsVisibleText);
          }
          return false;
        };

        const hasVisibleTextName = (): boolean => {
          const parent = path.parentPath?.node as any;
          if (!parent || parent.type !== 'JSXElement') return false;

          return parent.children.some(containsVisibleText);
        };

        const hasDescendantElement = (element: any, tag: string): boolean => {
          if (!element || element.type !== 'JSXElement') return false;
          return element.children.some((child: any) => {
            if (child.type !== 'JSXElement') return false;
            const childName = child.openingElement?.name?.name;
            return childName === tag || hasDescendantElement(child, tag);
          });
        };

        const hasTrackCaptions = (element: any): boolean => {
          if (!element || element.type !== 'JSXElement') return false;
          return element.children.some((child: any) => {
            if (child.type !== 'JSXElement' || child.openingElement?.name?.name !== 'track') return false;
            return child.openingElement.attributes.some((attr: any) =>
              attr.type === 'JSXAttribute' &&
              attr.name.type === 'JSXIdentifier' &&
              attr.name.name === 'kind' &&
              attr.value?.type === 'StringLiteral' &&
              attr.value.value.toLowerCase() === 'captions'
            );
          });
        };

        const hasAccessibleName = (): boolean =>
          hasNonEmptyStringAttr('aria-label') ||
          hasNonEmptyStringAttr('aria-labelledby') ||
          hasNonEmptyStringAttr('title') ||
          hasNonEmptyStringAttr('alt') ||
          hasVisibleTextName();

        const hasKeyboardSupport = (): boolean =>
          hasAttr('onKeyDown') || hasAttr('onKeyUp') || hasAttr('onKeyPress');

        const role = getStringValue('role');
        const elementHasAction = hasAttr('onClick');
        const isHiddenFromAT = getStringValue('aria-hidden')?.toLowerCase() === 'true';

        const hasEmptyAriaReference = (name: string): boolean =>
          hasAttr(name) && !hasNonEmptyStringAttr(name);

        const hasInvalidAriaReference = (name: string): boolean => {
          const value = getStringValue(name)?.trim();
          if (!value) return false;

          return value
            .split(/\s+/)
            .filter(Boolean)
            .some((id) => !declaredIds.has(id));
        };

        const interactiveAriaRoles = new Set([
          'button',
          'link',
          'checkbox',
          'switch',
          'radio',
          'menuitem',
          'tab',
        ]);

        const needsTabIndex =
          role !== null &&
          interactiveAriaRoles.has(role) &&
          !['button', 'a', 'input', 'select', 'textarea'].includes(tagName);

        const isInteractiveRole = role !== null && interactiveAriaRoles.has(role);

        if (hasEmptyAriaReference('aria-labelledby') || hasEmptyAriaReference('aria-describedby')) {
          issues.push({
            id: 'aria-reference-empty',
            category: 'accessibility',
            title: 'aria-labelledby or aria-describedby has an empty reference',
            description:
              'aria-labelledby and aria-describedby must reference a non-empty ID. An empty reference does not provide a usable accessible name or description. Violates WCAG 2.1 SC 4.1.2 (Level A).',
            impact: 'critical',
            status: 'fail',
            suggestion:
              'Provide a valid ID reference for aria-labelledby or aria-describedby, or remove the empty attribute.',
            codeSnippet: '<div aria-labelledby=""></div>',
            fixSnippet:  '<div aria-labelledby="label-id"></div>',
            file: filePath,
            line: node.loc?.start.line,
          });
        }

        if (hasInvalidAriaReference('aria-labelledby') || hasInvalidAriaReference('aria-describedby')) {
          issues.push({
            id: 'aria-reference-invalid',
            category: 'accessibility',
            title: 'aria-labelledby or aria-describedby references a missing ID',
            description:
              'aria-labelledby and aria-describedby must point to an existing element ID. Missing IDs mean the accessible name or description cannot be resolved. Violates WCAG 2.1 SC 4.1.2 (Level A).',
            impact: 'critical',
            status: 'fail',
            suggestion:
              'Use a valid ID that exists in the document, or remove the invalid aria-labelledby / aria-describedby attribute.',
            codeSnippet: '<div aria-labelledby="missing-id"></div>',
            fixSnippet:  '<div aria-labelledby="existing-id"></div>',
            file: filePath,
            line: node.loc?.start.line,
          });
        }

        if (needsTabIndex && !hasAttr('tabIndex')) {
          issues.push({
            id: 'role-interactive-missing-tabindex',
            category: 'accessibility',
            title: `element with role="${role}" is missing tabIndex`,
            description:
              'Custom role-based controls must be keyboard focusable. Elements with an interactive ARIA role need tabIndex=0 when they are not native focusable elements. Violates WCAG 2.1 SC 2.1.1 (Level A).',
            impact: 'critical',
            status: 'fail',
            suggestion:
              'Add tabIndex={0} to the element so keyboard users can focus and interact with it.',
            codeSnippet: `<div role="${role}"></div>`,
            fixSnippet:  `<div role="${role}" tabIndex={0}></div>`,
            file: filePath,
            line: node.loc?.start.line,
          });
        }

        if (hasNonEmptyStringAttr('title') && !hasNonEmptyStringAttr('aria-label') && !hasNonEmptyStringAttr('aria-labelledby') && !hasVisibleTextName()) {
          issues.push({
            id: 'title-only-accessible-name',
            category: 'accessibility',
            title: 'Interactive control relies only on title for accessible name',
            description:
              'The title attribute alone is not a reliable accessible name for interactive controls. Screen readers may not announce it consistently. Violates WCAG 2.1 SC 4.1.2 (Level A).',
            impact: 'critical',
            status: 'fail',
            suggestion:
              'Provide a visible label, aria-label, or aria-labelledby instead of relying solely on title.',
            codeSnippet: '<button title="Submit"></button>',
            fixSnippet:  '<button aria-label="Submit"></button>',
            file: filePath,
            line: node.loc?.start.line,
          });
        }

        if ((tagName === 'button' || tagName === 'a') && !hasAccessibleName()) {
          const id = tagName === 'button' ? 'button-missing-accessible-name' : 'anchor-missing-accessible-name';
          const title = tagName === 'button' ? '<button> has no accessible name' : '<a> has no accessible name';
          const description = tagName === 'button'
            ? 'Buttons must have a visible label or an accessible name so screen reader users can understand their purpose. Violates WCAG 2.1 SC 4.1.2 (Level A).'
            : 'Links must have visible text or an accessible name so screen reader users can understand their destination. Violates WCAG 2.1 SC 4.1.2 (Level A).';
          const suggestion = tagName === 'button'
            ? 'Add visible text, aria-label, or aria-labelledby to describe the button action.'
            : 'Provide visible link text or an aria-label/aria-labelledby value that describes the link target.';
          const codeSnippet = tagName === 'button' ? '<button></button>' : '<a href="/about"></a>';
          const fixSnippet = tagName === 'button' ? '<button>Submit</button>' : '<a href="/about">About us</a>';

          issues.push({
            id,
            category: 'accessibility',
            title,
            description,
            impact: 'critical',
            status: 'fail',
            suggestion,
            codeSnippet,
            fixSnippet,
            file: filePath,
            line: node.loc?.start.line,
          });
        }

        if (role !== null && interactiveAriaRoles.has(role) && elementHasAction && !hasKeyboardSupport()) {
          issues.push({
            id: 'role-interactive-missing-keyboard',
            category: 'accessibility',
            title: `interactive element with role="${role}" is missing keyboard support`,
            description:
              'Elements with interactive ARIA roles that are activated by pointer events must also support keyboard interaction. Violates WCAG 2.1 SC 2.1.1 (Level A).',
            impact: 'critical',
            status: 'fail',
            suggestion:
              'Add keyboard event handlers such as onKeyDown or onKeyUp to support Enter / Space activation for keyboard users.',
            codeSnippet: `<div role="${role}" onClick={handler}></div>`,
            fixSnippet:  `<div role="${role}" onClick={handler} onKeyDown={(e) => e.key === 'Enter' && handler()}></div>`,
            file: filePath,
            line: node.loc?.start.line,
          });
        }

        if (role === 'img' && tagName !== 'img' && !hasAccessibleName()) {
          issues.push({
            id: 'role-img-missing-accessible-name',
            category: 'accessibility',
            title: 'element with role="img" has no accessible name',
            description:
              'Elements with role="img" must provide an accessible name so screen readers can announce the image content. Violates WCAG 2.1 SC 4.1.2 (Level A).',
            impact: 'critical',
            status: 'fail',
            suggestion:
              'Provide an accessible name using alt, aria-label, or aria-labelledby for the image role.',
            codeSnippet: `<div role="img"></div>`,
            fixSnippet:  `<div role="img" aria-label="Company logo"></div>`,
            file: filePath,
            line: node.loc?.start.line,
          });
        }

        if (isHiddenFromAT && (hasAttr('tabIndex') || elementHasAction || isInteractiveRole)) {
          issues.push({
            id: 'focusable-aria-hidden',
            category: 'accessibility',
            title: 'Focusable or interactive element is hidden from assistive technology',
            description:
              'An element with aria-hidden="true" should not be interactive or focusable because it is hidden from assistive technology. This creates a confusing experience for keyboard and screen reader users. Violates WCAG 2.1 SC 1.3.1 (Level A).',
            impact: 'critical',
            status: 'fail',
            suggestion:
              'Remove aria-hidden="true" from interactive elements, or make the element non-focusable and non-interactive when it is hidden from assistive technology.',
            codeSnippet: '<div aria-hidden="true" tabIndex={0} onClick={handler}>',
            fixSnippet:  '<div tabIndex={-1}>...</div>',
            file: filePath,
            line: node.loc?.start.line,
          });
        }

        if ((role === 'button' || role === 'link') && tagName !== 'button' && tagName !== 'a') {
          if (!hasAccessibleName()) {
            issues.push({
              id: 'role-missing-accessible-name',
              category: 'accessibility',
              title: `element with role="${role}" has no accessible name`,
              description:
                'Elements with role="button" or role="link" must have an accessible name so assistive technology can announce their purpose. Violates WCAG 2.1 SC 4.1.2 (Level A).',
              impact: 'critical',
              status: 'fail',
              suggestion:
                'Provide an accessible name using visible text, aria-label, or aria-labelledby for the role-based control.',
              codeSnippet: `<div role="${role}"></div>`,
              fixSnippet:  `<div role="${role}" aria-label="Submit form"></div>`,
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 4: <a> without href or with placeholder href ────────────
        //
        // WCAG 2.1 SC 4.1.2 and general accessible navigation
        // Anchors without a valid href are not real links and confuse
        // keyboard and assistive technology users.
        if (tagName === 'a') {
          const href = getStringValue('href');
          if (!hasAttr('href') || !href || href === '#' || href.toLowerCase().startsWith('javascript:')) {
            issues.push({
              id: 'anchor-missing-href',
              category: 'accessibility',
              title: '<a> is missing a valid href attribute',
              description:
                'An anchor without a valid href is not a real navigational link, and keyboard or screen reader users cannot use it like a normal link. Use a <button> for actions or provide a real URL for navigation.',
              impact: 'critical',
              status: 'fail',
              suggestion:
                'Use a real href for navigation, or replace the anchor with a button if the element performs an action instead of linking to another page.',
              codeSnippet: '<a>Learn more</a>',
              fixSnippet:  '<a href="/about">Learn more</a>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 5: <input> with no accessible label ─────────────────────
        //
        // WCAG 2.1 SC 4.1.2 (Level A)
        // Every input must have a visible or programmatically associated label.
        if (tagName === 'input') {
          const inputType = getStringValue('type')?.toLowerCase();

          if (inputType === 'image') {
            if (!hasAttr('alt')) {
              issues.push({
                id: 'input-image-missing-alt',
                category: 'accessibility',
                title: '<input type="image"> is missing an alt attribute',
                description:
                  'Image buttons must have alternative text so screen readers can announce their purpose. Violates WCAG 2.1 SC 1.1.1 (Level A).',
                impact: 'critical',
                status: 'fail',
                suggestion:
                  'Add a meaningful alt attribute to describe the button action, e.g. alt="Submit form".',
                codeSnippet: '<input type="image" src={sendIcon} />',
                fixSnippet:  '<input type="image" src={sendIcon} alt="Send message" />',
                file: filePath,
                line: node.loc?.start.line,
              });
            }
            return;
          }

          // Check for checkbox missing label
          if (inputType === 'checkbox') {
            const hasLabel = hasAccessibleName();
            if (!hasLabel) {
              issues.push({
                id: 'checkbox-missing-label',
                category: 'accessibility',
                title: '<input type="checkbox"> is missing an accessible label',
                description:
                  'Checkboxes must have an associated <label> element with a matching htmlFor attribute or be wrapped by a label. Without a label, screen reader users cannot identify the checkbox\'s purpose. Violates WCAG 2.1 SC 1.3.1 (Level A) and 4.1.2 (Level A).',
                impact: 'major',
                status: 'fail',
                suggestion:
                  'Associate a label with the checkbox using:\n<label htmlFor="checkbox1">\n  <input type="checkbox" id="checkbox1" /> Option\n</label>',
                codeSnippet: '<input type="checkbox" />',
                fixSnippet:  '<label htmlFor="cb1">\n  <input type="checkbox" id="cb1" /> Label text\n</label>',
                file: filePath,
                line: node.loc?.start.line,
              });
            }
            return;
          }

          // Check for radio button missing label
          if (inputType === 'radio') {
            const hasLabel = hasAccessibleName();
            if (!hasLabel) {
              issues.push({
                id: 'radio-missing-label',
                category: 'accessibility',
                title: '<input type="radio"> is missing an accessible label',
                description:
                  'Radio buttons must have an associated <label> element with a matching htmlFor attribute or be wrapped by a label. Without a label, screen reader users cannot identify the radio button\'s purpose. Violates WCAG 2.1 SC 1.3.1 (Level A) and 4.1.2 (Level A).',
                impact: 'major',
                status: 'fail',
                suggestion:
                  'Associate a label with the radio button using:\n<label htmlFor="radio1">\n  <input type="radio" id="radio1" name="group" /> Option\n</label>',
                codeSnippet: '<input type="radio" name="group" />',
                fixSnippet:  '<label htmlFor="r1">\n  <input type="radio" id="r1" name="group" /> Option\n</label>',
                file: filePath,
                line: node.loc?.start.line,
              });
            }
            return;
          }

          // hidden, submit, button, reset have implicit labels or no need
          const EXEMPT_TYPES = new Set(['hidden', 'submit', 'button', 'reset']);
          if (inputType && EXEMPT_TYPES.has(inputType)) return;

          const hasId             = hasAttr('id');
          const hasAriaLabel      = hasAttr('aria-label');
          const hasAriaLabelledBy = hasAttr('aria-labelledby');

          if (!hasId && !hasAriaLabel && !hasAriaLabelledBy) {
            issues.push({
              id: 'input-no-accessible-label',
              category: 'accessibility',
              title: `<input${inputType ? ` type="${inputType}"` : ''}> has no accessible label`,
              description:
                'This input has no id (for a <label htmlFor> to point at), no aria-label, and no aria-labelledby. Screen readers will announce it as just "edit field" with no context — the user cannot tell what to type. Violates WCAG 2.1 SC 4.1.2 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Option A — Link to a visible label (preferred):\n  <label htmlFor="username">Username</label>\n  <input id="username" type="text" />\n\nOption B — Inline label for space-constrained UI:\n  <input type="search" aria-label="Search products" />\n\nOption C — Label from another element:\n  <h2 id="results-heading">Search results</h2>\n  <input aria-labelledby="results-heading" />',
              codeSnippet: `<input type="${inputType || 'text'}" />`,
              fixSnippet:  `<input type="${inputType || 'text'}" aria-label="Describe this field" />`,
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 6: <select> with no accessible label ────────────────────
        //
        // WCAG 2.1 SC 4.1.2 (Level A)
        if (tagName === 'select') {
          const hasId             = hasAttr('id');
          const hasAriaLabel      = hasAttr('aria-label');
          const hasAriaLabelledBy = hasAttr('aria-labelledby');

          if (!hasId && !hasAriaLabel && !hasAriaLabelledBy) {
            issues.push({
              id: 'select-no-accessible-label',
              category: 'accessibility',
              title: '<select> has no accessible label',
              description:
                'A select dropdown without a label or accessible name is ambiguous to screen reader users. Violates WCAG 2.1 SC 4.1.2 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add a visible <label> paired with the select, or provide aria-label / aria-labelledby.',
              codeSnippet: '<select>...</select>',
              fixSnippet:  '<label htmlFor="country">Country</label>\n<select id="country">...</select>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 7: <textarea> with no accessible label ──────────────────
        //
        // WCAG 2.1 SC 4.1.2 (Level A)
        if (tagName === 'textarea') {
          const hasId             = hasAttr('id');
          const hasAriaLabel      = hasAttr('aria-label');
          const hasAriaLabelledBy = hasAttr('aria-labelledby');

          if (!hasId && !hasAriaLabel && !hasAriaLabelledBy) {
            issues.push({
              id: 'textarea-no-accessible-label',
              category: 'accessibility',
              title: '<textarea> has no accessible label',
              description:
                'A textarea without a label or accessible name is ambiguous to screen reader users. Violates WCAG 2.1 SC 4.1.2 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add a visible <label> paired with the textarea, or provide aria-label / aria-labelledby.',
              codeSnippet: '<textarea></textarea>',
              fixSnippet:  '<label htmlFor="message">Message</label>\n<textarea id="message"></textarea>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 8: <iframe> missing accessible title ───────────────────
        //
        // WCAG 2.1 SC 1.1.1 and 2.4.1 (Level A)
        if (tagName === 'iframe') {
          const hasTitle = hasAttr('title');
          const hasAriaLabel = hasAttr('aria-label');
          const hasAriaLabelledBy = hasAttr('aria-labelledby');

          if (!hasTitle && !hasAriaLabel && !hasAriaLabelledBy) {
            issues.push({
              id: 'iframe-missing-accessible-title',
              category: 'accessibility',
              title: '<iframe> is missing an accessible title',
              description:
                'Frames must have an accessible name so screen reader users understand the embedded content. Violates WCAG 2.1 SC 1.1.1 and SC 2.4.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add a descriptive title, aria-label, or aria-labelledby to the iframe.',
              codeSnippet: '<iframe src="map.html"></iframe>',
              fixSnippet:  '<iframe src="map.html" title="Map of downtown Seattle"></iframe>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 8b: <embed> or <object> missing accessible alternative ──
        //
        // WCAG 2.1 SC 1.1.1 (Level A)
        if (tagName === 'embed' || tagName === 'object') {
          const hasAlt = hasAttr('alt') || hasAttr('aria-label') || hasAttr('title');
          if (!hasAlt) {
            issues.push({
              id: 'embed-object-missing-accessible-alternative',
              category: 'accessibility',
              title: `<${tagName}> is missing an accessible alternative`,
              description:
                `The <${tagName}> element is used to embed external content (plugins, documents, etc.). It must have an accessible alternative such as alt text, aria-label, or descriptive surrounding text. Without this, screen reader users cannot access the content. Violates WCAG 2.1 SC 1.1.1 (Level A).`,
              impact: 'major',
              status: 'fail',
              suggestion:
                `Provide an accessible name or description:\n<${tagName} src="content" aria-label="Description of content" />\nor\n<${tagName} src="content" title="Description of content" />`,
              codeSnippet: `<${tagName} src="file.pdf" />`,
              fixSnippet:  `<${tagName} src="file.pdf" aria-label="Annual Report PDF" />`,
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 9: <table> missing caption or accessible name ─────────
        //
        // WCAG 2.1 SC 1.3.1 and 2.4.2 (Level A)
        if (tagName === 'table') {
          const parent = path.parentPath?.node as any;
          const hasCaption =
            parent?.children?.some(
              (child: any) =>
                child.type === 'JSXElement' &&
                child.openingElement?.name?.name === 'caption'
            );
          const hasAriaLabel = hasAttr('aria-label');
          const hasAriaLabelledBy = hasAttr('aria-labelledby');

          if (!hasCaption && !hasAriaLabel && !hasAriaLabelledBy) {
            issues.push({
              id: 'table-missing-caption-or-label',
              category: 'accessibility',
              title: '<table> is missing a caption or accessible name',
              description:
                'Data tables need a caption or an accessible name so screen reader users can understand the table purpose. Violates WCAG 2.1 SC 1.3.1 and SC 2.4.2 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add a <caption> to the table or provide aria-label / aria-labelledby.',
              codeSnippet: '<table>...</table>',
              fixSnippet:  '<table aria-label="Quarterly sales data">...</table>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 10: <fieldset> missing legend or accessible label ──────
        //
        // WCAG 2.1 SC 1.3.1 (Level A)
        if (tagName === 'fieldset') {
          const parent = path.parentPath?.node as any;
          const hasLegend =
            parent?.children?.some(
              (child: any) =>
                child.type === 'JSXElement' &&
                child.openingElement?.name?.name === 'legend'
            );
          const hasAriaLabel = hasAttr('aria-label');
          const hasAriaLabelledBy = hasAttr('aria-labelledby');

          if (!hasLegend && !hasAriaLabel && !hasAriaLabelledBy) {
            issues.push({
              id: 'fieldset-missing-legend-or-label',
              category: 'accessibility',
              title: '<fieldset> is missing a legend or accessible label',
              description:
                'Fieldset groups need a legend or an accessible name so users understand the form grouping. Violates WCAG 2.1 SC 1.3.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add a <legend> inside the fieldset or provide aria-label / aria-labelledby.',
              codeSnippet: '<fieldset>...</fieldset>',
              fixSnippet:  '<fieldset>\n  <legend>Payment information</legend>\n  ...\n</fieldset>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 10.1: <details> missing <summary> or accessible name ────
        //
        // WCAG 2.1 SC 2.4.3 (Level A)
        if (tagName === 'details') {
          const parent = path.parentPath?.node as any;
          const hasSummary =
            parent?.children?.some(
              (child: any) =>
                child.type === 'JSXElement' &&
                child.openingElement?.name?.name === 'summary'
            );
          const hasAriaLabel = hasAttr('aria-label');
          const hasAriaLabelledBy = hasAttr('aria-labelledby');

          if (!hasSummary && !hasAriaLabel && !hasAriaLabelledBy) {
            issues.push({
              id: 'details-missing-summary',
              category: 'accessibility',
              title: '<details> is missing a <summary> or accessible name',
              description:
                'A <details> element must include a <summary> or accessible name to describe its purpose and make the disclosure control available to keyboard and screen reader users. Violates WCAG 2.1 SC 2.4.3 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add a <summary> child or provide aria-label / aria-labelledby for the details element.',
              codeSnippet: '<details>\n  <p>More info</p>\n</details>',
              fixSnippet:  '<details>\n  <summary>More information</summary>\n  <p>More info</p>\n</details>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 11: <html> missing lang attribute ──────────────────────
        //
        // WCAG 2.1 SC 3.1.1 (Level A)
        if (tagName === 'html') {
          if (!hasAttr('lang')) {
            issues.push({
              id: 'html-missing-lang',
              category: 'accessibility',
              title: '<html> is missing a lang attribute',
              description:
                'The document language must be declared so screen readers can use the correct pronunciation. Violates WCAG 2.1 SC 3.1.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion: 'Add a lang attribute to the <html> element, for example lang="en".',
              codeSnippet: '<html>...</html>',
              fixSnippet:  '<html lang="en">...</html>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 12: <area> missing an accessible name ────────────────
        //
        // WCAG 2.1 SC 1.1.1 (Level A)
        if (tagName === 'area') {
          if (!hasAttr('alt') && !hasAttr('aria-label') && !hasAttr('aria-labelledby')) {
            issues.push({
              id: 'area-missing-accessible-name',
              category: 'accessibility',
              title: '<area> is missing an accessible name',
              description:
                'Image map areas must have a text alternative so screen reader users can understand each target. Violates WCAG 2.1 SC 1.1.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add alt, aria-label, or aria-labelledby to the <area> element.',
              codeSnippet: '<area shape="rect" coords="0,0,100,100" href="/shop" />',
              fixSnippet:  '<area shape="rect" coords="0,0,100,100" href="/shop" alt="Shop section" />',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 13: <video> missing captions ─────────────────────────
        //
        // WCAG 2.1 SC 1.2.2 (Level A)
        if (tagName === 'video') {
          const parent = path.parentPath?.node as any;
          if (!hasTrackCaptions(parent)) {
            issues.push({
              id: 'video-missing-captions',
              category: 'accessibility',
              title: '<video> is missing captions',
              description:
                'Pre-recorded video content must provide captions so users who cannot hear the audio can understand it. Violates WCAG 2.1 SC 1.2.2 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add a <track kind="captions" src="..."> child to the video element.',
              codeSnippet: '<video src="promo.mp4" controls></video>',
              fixSnippet:  '<video src="promo.mp4" controls>\n  <track kind="captions" src="promo-captions.vtt" label="English captions" />\n</video>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 14: <audio> missing captions/transcript ───────────────
        //
        // WCAG 2.1 SC 1.2.2 (Level A)
        if (tagName === 'audio') {
          const parent = path.parentPath?.node as any;
          if (!hasTrackCaptions(parent)) {
            issues.push({
              id: 'audio-missing-captions',
              category: 'accessibility',
              title: '<audio> is missing captions or a transcript',
              description:
                'Pre-recorded audio content requires captions or a transcript for users who cannot hear the audio. Violates WCAG 2.1 SC 1.2.2 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add a caption track or provide a transcript for the audio content.',
              codeSnippet: '<audio src="podcast.mp3" controls></audio>',
              fixSnippet:  '<audio src="podcast.mp3" controls>\n  <track kind="captions" src="podcast-captions.vtt" label="English captions" />\n</audio>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 15: aria landmark / region missing accessible name ─────
        //
        // WCAG 2.1 SC 2.4.2 (Level A)
        if (
          (tagName === 'nav' || tagName === 'aside' ||
            role === 'navigation' || role === 'region' || role === 'search' ||
            role === 'banner' || role === 'complementary') &&
          !hasAccessibleName()
        ) {
          issues.push({
            id: 'landmark-missing-accessible-name',
            category: 'accessibility',
            title: 'Landmark region is missing an accessible name',
            description:
              'Landmark regions such as navigation and region elements need an accessible label so screen reader users can distinguish them. Violates WCAG 2.1 SC 2.4.2 (Level A).',
            impact: 'major',
            status: 'fail',
            suggestion:
              'Add an accessible name using aria-label or aria-labelledby to the landmark.',
            codeSnippet: '<nav>...</nav>',
            fixSnippet:  '<nav aria-label="Main navigation">...</nav>',
            file: filePath,
            line: node.loc?.start.line,
          });
        }

        // ── Check 16: <table> missing header cells ──────────────────────
        //
        // WCAG 2.1 SC 1.3.1 (Level A)
        if (tagName === 'table') {
          const parent = path.parentPath?.node as any;
          const hasCaption =
            parent?.children?.some(
              (child: any) =>
                child.type === 'JSXElement' &&
                child.openingElement?.name?.name === 'caption'
            );
          const hasTableLabel = hasAttr('aria-label') || hasAttr('aria-labelledby');
          if (!hasTableLabel && !hasCaption && !hasDescendantElement(parent, 'th')) {
            issues.push({
              id: 'table-missing-headers',
              category: 'accessibility',
              title: '<table> is missing header cells',
              description:
                'Data tables should include header cells (<th>) so screen reader users can understand the relationships between row and column data. Violates WCAG 2.1 SC 1.3.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Use <th> for header cells in the table header row or provide row/column headers using scope.',
              codeSnippet: '<table>...</table>',
              fixSnippet:  '<table>\n  <thead>\n    <tr><th scope="col">Name</th><th scope="col">Role</th></tr>\n  </thead>\n  ...\n</table>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 17: <details> missing <summary> ────────────────────────
        //
        // WCAG 2.1 SC 1.3.1 (Level A)
        if (tagName === 'details') {
          const parent = path.parentPath?.node as any;
          const hasSummary = hasDescendantElement(parent, 'summary');

          if (!hasSummary) {
            issues.push({
              id: 'details-missing-summary',
              category: 'accessibility',
              title: '<details> is missing a <summary>',
              description:
                'The <details> element requires a <summary> child so users can understand what the collapsible section contains. Violates WCAG 2.1 SC 1.3.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion: 'Add a <summary> as the first child of the <details> element.',
              codeSnippet: '<details>Hidden content</details>',
              fixSnippet:  '<details>\n  <summary>Additional information</summary>\n  Hidden content\n</details>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 18: <label> htmlFor pointing to missing id ──────────────
        //
        // WCAG 2.1 SC 4.1.2 (Level A)
        if (tagName === 'label') {
          const htmlFor = getStringValue('htmlFor');
          if (htmlFor && !declaredIds.has(htmlFor)) {
            issues.push({
              id: 'label-htmlfor-invalid-id',
              category: 'accessibility',
              title: '<label> htmlFor points to a non-existent element',
              description:
                'A label\'s htmlFor attribute must reference an existing form control id. If the id does not exist, the label cannot associate with the form control. Violates WCAG 2.1 SC 4.1.2 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Ensure the referenced id exists on the form control, or remove the htmlFor attribute.',
              codeSnippet: '<label htmlFor="missing-id">Email</label>',
              fixSnippet:  '<label htmlFor="email-input">Email</label>\n<input id="email-input" type="email" />',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 19: <img> with empty alt not marked as decorative ──────
        //
        // WCAG 2.1 SC 1.1.1 (Level A)
        if (tagName === 'img') {
          const alt = getStringValue('alt');
          const role = getStringValue('role');
          if (alt === '' && role !== 'presentation' && role !== 'none') {
            issues.push({
              id: 'img-empty-alt-not-decorative',
              category: 'accessibility',
              title: '<img> has empty alt but is not marked as decorative',
              description:
                'An image with alt="" is marked as decorative, but if the image has semantic meaning, use role="presentation" or role="none". If it is truly decorative, no additional attributes are needed. Violates WCAG 2.1 SC 1.1.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'If the image is decorative, no fix is needed. If the image conveys meaning, provide a meaningful alt text instead of an empty string.',
              codeSnippet: '<img src="spacer.png" alt="" />',
              fixSnippet:  '<img src="icon.png" alt="Important notification" />',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 20: <form> without programmatically associated labels ──
        //
        // WCAG 2.1 SC 3.3.2 (Level A)
        if (tagName === 'form') {
          const parent = path.parentPath?.node as any;
          const inputs = parent?.children?.filter((child: any) =>
            child.type === 'JSXElement' &&
            (child.openingElement?.name?.name === 'input' ||
             child.openingElement?.name?.name === 'select' ||
             child.openingElement?.name?.name === 'textarea')
          ) || [];

          const hasLabels = inputs.some((input: any) => {
            const inputId = input.openingElement.attributes.find((attr: any) =>
              attr.type === 'JSXAttribute' &&
              attr.name.type === 'JSXIdentifier' &&
              attr.name.name === 'id'
            );
            return inputId;
          });

          if (inputs.length > 0 && !hasLabels) {
            issues.push({
              id: 'form-missing-associated-labels',
              category: 'accessibility',
              title: '<form> has controls without associated labels',
              description:
                'Form controls should have programmatically associated labels using <label> with htmlFor, or aria-label / aria-labelledby. Violates WCAG 2.1 SC 3.3.2 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add <label> elements paired to form control ids, or provide aria-label / aria-labelledby to each control.',
              codeSnippet: '<form>\n  <input type="text" />\n  <button>Submit</button>\n</form>',
              fixSnippet:  '<form>\n  <label htmlFor="name">Name</label>\n  <input id="name" type="text" />\n  <button>Submit</button>\n</form>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 21: <input> with aria-invalid without error message ────
        //
        // WCAG 2.1 SC 3.3.1 (Level A)
        if (
          tagName === 'input' &&
          getStringValue('aria-invalid')?.toLowerCase() === 'true'
        ) {
          const hasAriaDescribedBy = hasAttr('aria-describedby');
          const hasErrorId = hasAriaDescribedBy
            ? getStringValue('aria-describedby')
                ?.split(/\s+/)
                .some((id) => declaredIds.has(id))
            : false;

          if (!hasErrorId) {
            issues.push({
              id: 'input-invalid-without-error-message',
              category: 'accessibility',
              title: '<input> marked as invalid but has no error message',
              description:
                'When aria-invalid="true" is used to mark a form control as invalid, the control should also have aria-describedby pointing to an error message. Screen reader users need to know why the field failed validation. Violates WCAG 2.1 SC 3.3.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add aria-describedby to point to an error message element:\n\n<input aria-invalid="true" aria-describedby="error-msg" />\n<div id="error-msg">Email address is invalid</div>',
              codeSnippet: '<input aria-invalid="true" />',
              fixSnippet:  '<input aria-invalid="true" aria-describedby="email-error" />\n<div id="email-error">Please enter a valid email</div>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 22: Page missing <title> element ──────────────────────
        //
        // WCAG 2.1 SC 2.4.2 (Level A)
        if (tagName === 'head') {
          const parent = path.parentPath?.node as any;
          const hasTitle = parent?.children?.some(
            (child: any) =>
              child.type === 'JSXElement' &&
              child.openingElement?.name?.name === 'title'
          );

          if (!hasTitle) {
            issues.push({
              id: 'page-missing-title',
              category: 'accessibility',
              title: '<head> is missing a <title> element',
              description:
                'Every page must have a unique, descriptive <title> that identifies the page purpose. Screen reader users rely on the page title to understand the page context. Violates WCAG 2.1 SC 2.4.2 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add a descriptive <title> to the <head> that describes the page content, for example: <title>Contact Us — Example Company</title>',
              codeSnippet: '<head>...</head>',
              fixSnippet:  '<head>\n  <title>Contact Us — Example Company</title>\n  ...\n</head>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 23: Missing skip link to main content ──────────────────
        //
        // WCAG 2.1 SC 2.4.1 (Level A)
        if (tagName === 'body') {
          const parent = path.parentPath?.node as any;
          const hasSkipLink = parent?.children?.some((child: any) => {
            if (child.type !== 'JSXElement' || child.openingElement?.name?.name !== 'a') {
              return false;
            }
            const href = child.openingElement.attributes?.find((attr: any) =>
              attr.type === 'JSXAttribute' &&
              attr.name.type === 'JSXIdentifier' &&
              attr.name.name === 'href'
            );
            const hrefValue =
              href?.value?.type === 'StringLiteral'
                ? href.value.value
                : null;
            return hrefValue?.startsWith('#');
          });

          if (!hasSkipLink) {
            issues.push({
              id: 'missing-skip-link',
              category: 'accessibility',
              title: 'Page is missing a skip link to main content',
              description:
                'A skip link allows keyboard and screen reader users to bypass repetitive navigation and jump directly to main content. Without it, users must navigate through all navigation elements on every page. Violates WCAG 2.1 SC 2.4.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add a skip link as the first element in the body, typically styled to be visually hidden until focused:\n\n<a href="#main-content" className="skip-link">Skip to main content</a>\n\nThen ensure your main content has id="main-content".',
              codeSnippet: '<body>...</body>',
              fixSnippet:  '<body>\n  <a href="#main-content" className="sr-only">Skip to main content</a>\n  ...\n  <main id="main-content">...</main>\n</body>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 24: <meta> viewport missing or unoptimized ──────────────
        //
        // WCAG 2.1 SC 1.4.4 (Level A)
        if (tagName === 'meta') {
          const name = getStringValue('name');
          if (name?.toLowerCase() === 'viewport') {
            const content = getStringValue('content');
            if (!content || !content.includes('width') || content.includes('user-scalable=no')) {
              issues.push({
                id: 'meta-viewport-unoptimized',
                category: 'accessibility',
                title: '<meta viewport> is missing or disables zoom',
                description:
                  'The viewport meta tag should allow users to zoom the page. Disabling zoom (user-scalable=no) prevents users with low vision from enlarging content. Violates WCAG 2.1 SC 1.4.4 (Level A).',
                impact: 'major',
                status: 'fail',
                suggestion:
                  'Use a standard viewport tag that allows zoom:\n<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=yes" />',
                codeSnippet: '<meta name="viewport" content="user-scalable=no" />',
                fixSnippet:  '<meta name="viewport" content="width=device-width, initial-scale=1" />',
                file: filePath,
                line: node.loc?.start.line,
              });
            }
          }
        }

        // ── Check 25: <select> or <input> with optgroup missing labels ────
        //
        // WCAG 2.1 SC 1.3.1 (Level A)
        if (tagName === 'optgroup') {
          const parent = path.parentPath?.node as any;
          const label = parent?.openingElement?.attributes?.find((attr: any) =>
            attr.type === 'JSXAttribute' &&
            attr.name.type === 'JSXIdentifier' &&
            attr.name.name === 'label'
          );

          if (!label) {
            issues.push({
              id: 'optgroup-missing-label',
              category: 'accessibility',
              title: '<optgroup> is missing a label attribute',
              description:
                'Option groups in select elements must have a label so screen reader users understand the grouping. Violates WCAG 2.1 SC 1.3.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add a descriptive label attribute to the optgroup element.',
              codeSnippet: '<optgroup>\n  <option>Option 1</option>\n</optgroup>',
              fixSnippet:  '<optgroup label="Group Name">\n  <option>Option 1</option>\n</optgroup>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 26: <button> inside <form> without type attribute ───────
        //
        // WCAG 2.1 SC 4.1.2 (Level A)
        if (tagName === 'button') {
          const formParent = path.findParent(
            (p: any) => p.isJSXElement && p.node.openingElement?.name?.name === 'form'
          );

          if (formParent && !hasAttr('type')) {
            issues.push({
              id: 'button-in-form-missing-type',
              category: 'accessibility',
              title: '<button> in <form> should have an explicit type attribute',
              description:
                'Buttons inside forms should explicitly specify their type (submit, reset, button) to avoid unexpected form submission. Screen readers also announce the button type more clearly. Violates WCAG 2.1 SC 4.1.2 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add type="submit", type="reset", or type="button" to clarify the button\'s action.',
              codeSnippet: '<button>Submit</button>',
              fixSnippet:  '<button type="submit">Submit</button>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 27: Image with alt longer than expected or too vague ────
        //
        // WCAG 2.1 SC 1.1.1 (Level A)
        if (tagName === 'img') {
          const alt = getStringValue('alt');
          if (typeof alt === 'string') {
            if (alt.toLowerCase().includes('image') || alt.toLowerCase().includes('picture') || alt.toLowerCase() === 'icon') {
              issues.push({
                id: 'img-alt-text-redundant',
                category: 'accessibility',
                title: '<img> alt text is redundant or too vague',
                description:
                  'Alt text should describe what the image shows, not use generic words like "image" or "picture". Screen readers already announce images as images. Violates WCAG 2.1 SC 1.1.1 (Level A).',
                impact: 'major',
                status: 'fail',
                suggestion:
                  'Describe what the image shows specifically: alt="A golden retriever playing fetch in the park"',
                codeSnippet: `<img src="dog.jpg" alt="image of a dog" />`,
                fixSnippet:  `<img src="dog.jpg" alt="Golden retriever running in grass" />`,
                file: filePath,
                line: node.loc?.start.line,
              });
            }
          }
        }

        // ── Check 28: Form input with invalid autocomplete value ──────────
        //
        // WCAG 2.1 SC 1.3.5 (Level AA)
        if (tagName === 'input') {
          const autocomplete = getStringValue('autocomplete');
          const validAutocompletes = new Set([
            'off', 'on', 'name', 'email', 'username', 'new-password',
            'current-password', 'one-time-code', 'organization-title',
            'organization', 'street-address', 'address-line1', 'address-line2',
            'address-line3', 'address-level4', 'address-level3', 'address-level2',
            'address-level1', 'country', 'country-name', 'postal-code', 'cc-name',
            'cc-given-name', 'cc-family-name', 'cc-number', 'cc-exp', 'cc-exp-month',
            'cc-exp-year', 'cc-csc', 'cc-type', 'transaction-currency', 'transaction-amount',
            'language', 'bday', 'bday-day', 'bday-month', 'bday-year', 'sex', 'url',
            'photo', 'tel', 'tel-country-code', 'tel-national', 'tel-area-code',
            'tel-local', 'tel-extension', 'impp', 'nickname', 'given-name', 'family-name',
            'additional-name', 'honorific-prefix', 'honorific-suffix', 'webauthn'
          ]);

          if (autocomplete && !validAutocompletes.has(autocomplete.toLowerCase())) {
            issues.push({
              id: 'input-invalid-autocomplete',
              category: 'accessibility',
              title: '<input> has an invalid autocomplete value',
              description:
                'The autocomplete attribute should use valid values from the HTML spec. Invalid values may confuse assistive technology. Violates WCAG 2.1 SC 1.3.5 (Level AA).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Use a valid autocomplete value like "email", "password", "given-name", etc.',
              codeSnippet: `<input autocomplete="invalid-value" />`,
              fixSnippet:  `<input type="email" autocomplete="email" />`,
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 29: <li> not inside <ul> or <ol> ──────────────────────
        //
        // WCAG 2.1 SC 1.3.1 (Level A)
        if (tagName === 'li') {
          const parent = path.parentPath?.node as any;
          const parentTag = parent?.type === 'JSXElement' ? parent.openingElement?.name?.name : '';
          if (parentTag !== 'ul' && parentTag !== 'ol') {
            issues.push({
              id: 'list-item-not-in-list',
              category: 'accessibility',
              title: '<li> is not inside <ul> or <ol>',
              description:
                'List items must be direct children of <ul> or <ol>. Using <li> outside of a list breaks semantic structure and confuses screen readers. Violates WCAG 2.1 SC 1.3.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Move the <li> inside a <ul> (unordered) or <ol> (ordered) list, or convert <li> to a different element if it is not a list item.',
              codeSnippet: '<div>\n  <li>Item 1</li>\n</div>',
              fixSnippet:  '<ul>\n  <li>Item 1</li>\n</ul>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 30: <select> with only one <option> ────────────────────
        //
        // WCAG 2.1 SC 1.3.1 (Level A)
        if (tagName === 'select') {
          const parent = path.parentPath?.node as any;
          const optionCount = parent?.children?.filter((child: any) =>
            child.type === 'JSXElement' &&
            child.openingElement?.name?.name === 'option'
          ).length || 0;

          if (optionCount === 1) {
            issues.push({
              id: 'select-with-single-option',
              category: 'accessibility',
              title: '<select> has only one <option>',
              description:
                'A dropdown with a single choice is not a true selection control and can confuse users. If there is only one choice, use a different UI pattern or explain why selection is needed.',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Either add more options to the dropdown, or replace it with static text or a different UI component if selection is not needed.',
              codeSnippet: '<select>\n  <option>Only choice</option>\n</select>',
              fixSnippet:  '<select>\n  <option>Option 1</option>\n  <option>Option 2</option>\n</select>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 31: <form> missing submit button ──────────────────────
        //
        // WCAG 2.1 SC 3.3.2 (Level A)
        if (tagName === 'form') {
          const parent = path.parentPath?.node as any;
          const hasSubmitButton = parent?.children?.some((child: any) => {
            if (child.type !== 'JSXElement' || child.openingElement?.name?.name !== 'button') {
              return false;
            }
            const typeAttr = child.openingElement.attributes?.find((attr: any) =>
              attr.type === 'JSXAttribute' &&
              attr.name.type === 'JSXIdentifier' &&
              attr.name.name === 'type'
            );
            const typeValue = typeAttr?.value?.type === 'StringLiteral' ? typeAttr.value.value : 'submit';
            return typeValue === 'submit' || !typeAttr;
          });

          if (!hasSubmitButton) {
            issues.push({
              id: 'form-missing-submit-button',
              category: 'accessibility',
              title: '<form> is missing an explicit submit button',
              description:
                'Forms should include a button with type="submit" to provide users with a clear way to submit the form. Without one, it may be unclear how to complete the action. Violates WCAG 2.1 SC 3.3.2 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add a submit button to the form:\n<button type="submit">Submit</button>',
              codeSnippet: '<form>\n  <input type="text" />\n</form>',
              fixSnippet:  '<form>\n  <input type="text" />\n  <button type="submit">Submit</button>\n</form>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 34: <figure> without <figcaption> ────────────────────
        //
        // WCAG 2.1 SC 1.3.1 (Level A)
        if (tagName === 'figure') {
          const parent = path.parentPath?.node as any;
          const hasFigcaption = parent?.children?.some(
            (child: any) =>
              child.type === 'JSXElement' &&
              child.openingElement?.name?.name === 'figcaption'
          );

          if (!hasFigcaption && hasDescendantElement(parent, 'img')) {
            issues.push({
              id: 'figure-missing-figcaption',
              category: 'accessibility',
              title: '<figure> with image is missing a <figcaption>',
              description:
                'Figures containing images or complex content should include a <figcaption> to describe the figure purpose. Without it, screen reader users cannot understand the relationship between the figure and the content. Violates WCAG 2.1 SC 1.3.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add a descriptive <figcaption> inside the figure element.',
              codeSnippet: '<figure>\n  <img src="chart.png" alt="Bar chart" />\n</figure>',
              fixSnippet:  '<figure>\n  <img src="chart.png" alt="Bar chart" />\n  <figcaption>Figure 1: Revenue growth 2022-2024</figcaption>\n</figure>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 35: <noscript> element present ──────────────────────
        //
        // WCAG 2.1 SC 4.1.1 (Level A)
        if (tagName === 'noscript') {
          issues.push({
            id: 'noscript-element-present',
            category: 'accessibility',
            title: '<noscript> element found in JavaScript application',
            description:
              '<noscript> is typically used to provide fallback content when JavaScript is disabled. In modern React/Next.js applications, script dependencies are often required, but if they are truly optional, ensure <noscript> content is accessible. Violates WCAG 2.1 SC 4.1.1 (Level A) if critical content is script-dependent.',
            impact: 'major',
            status: 'fail',
            suggestion:
              'If JavaScript is truly required for functionality, document this. If JavaScript is optional, ensure <noscript> contains helpful fallback instructions or information.',
            codeSnippet: '<noscript>Please enable JavaScript</noscript>',
            fixSnippet:  '<noscript>This application requires JavaScript. Please enable it to continue.</noscript>',
            file: filePath,
            line: node.loc?.start.line,
          });
        }

        // ── Check 36: <a> with only icon or aria-label without visible purpose ──
        //
        // WCAG 2.1 SC 2.4.4 (Level A)
        if (tagName === 'a') {
          const hasVisibleText = hasVisibleTextName();
          const hasAriaLabel = hasNonEmptyStringAttr('aria-label');
          const hasTitle = hasNonEmptyStringAttr('title');

          if (!hasVisibleText && !hasAriaLabel && !hasTitle) {
            issues.push({
              id: 'link-missing-purpose',
              category: 'accessibility',
              title: '<a> link has no visible purpose',
              description:
                'Links must have a clear, understandable purpose. This link has no visible text, aria-label, or title. Screen reader users cannot determine where the link goes. Violates WCAG 2.1 SC 2.4.4 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Provide visible link text or an aria-label that describes the link destination. For icon-only links:\n\n<a href="/about" aria-label="Learn more about us">\n  <IconComponent />\n</a>',
              codeSnippet: '<a href="/about"><IconComponent /></a>',
              fixSnippet:  '<a href="/about" aria-label="Learn more about us"><IconComponent /></a>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 37: <video> missing audio description track ────────────
        //
        // WCAG 2.1 SC 1.2.5 (Level AA)
        if (tagName === 'video') {
          const parent = path.parentPath?.node as any;
          const hasDescTrack = parent?.children?.some((child: any) => {
            if (child.type !== 'JSXElement' || child.openingElement?.name?.name !== 'track') {
              return false;
            }
            const kindAttr = child.openingElement.attributes?.find((attr: any) =>
              attr.type === 'JSXAttribute' &&
              attr.name.type === 'JSXIdentifier' &&
              attr.name.name === 'kind'
            );
            return kindAttr?.value?.type === 'StringLiteral' && 
                   kindAttr.value.value.toLowerCase() === 'descriptions';
          });

          if (!hasDescTrack) {
            issues.push({
              id: 'video-missing-audio-description',
              category: 'accessibility',
              title: '<video> is missing an audio description track',
              description:
                'Videos with important visual content should provide audio descriptions for users who cannot see the video. Add a <track kind="descriptions"> with a WebVTT file describing visual elements. Violates WCAG 2.1 SC 1.2.5 (Level AA).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add a descriptive audio track or text description:\n<video controls>\n  <track kind="descriptions" src="video-descriptions.vtt" label="English descriptions" />\n  <source src="video.mp4" type="video/mp4" />\n</video>',
              codeSnippet: '<video src="video.mp4" controls></video>',
              fixSnippet:  '<video controls>\n  <track kind="descriptions" src="descriptions.vtt" label="English" />\n  <source src="video.mp4" type="video/mp4" />\n</video>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 38: Live region element without aria-live ───────────────
        //
        // WCAG 2.1 SC 4.1.3 (Level A)
        if ((tagName === 'div' || tagName === 'span' || tagName === 'section') &&
            (role === 'status' || role === 'alert' || role === 'log' || role === 'region')) {
          if (!hasAttr('aria-live')) {
            issues.push({
              id: 'live-region-missing-aria-live',
              category: 'accessibility',
              title: 'Live region element missing aria-live attribute',
              description:
                'Elements with live region roles (status, alert, log, region) should have an aria-live attribute to notify screen readers of dynamic content changes. Violates WCAG 2.1 SC 4.1.3 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add aria-live attribute with appropriate politeness level:\n- aria-live="polite" — for general updates (default for most cases)\n- aria-live="assertive" — for urgent updates like error messages\n- aria-live="off" — if not a live region',
              codeSnippet: `<div role="${role}">Status message</div>`,
              fixSnippet:  `<div role="${role}" aria-live="polite">Status message</div>`,
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 39: aria-label hiding required text alternative ────────
        //
        // WCAG 2.1 SC 1.3.1 (Level A)
        if (hasAttr('aria-label') && hasVisibleTextName()) {
          const ariaLabel = getStringValue('aria-label');
          if (ariaLabel) {
            issues.push({
              id: 'aria-label-overriding-visible-text',
              category: 'accessibility',
              title: 'aria-label is overriding visible text',
              description:
                'When both aria-label and visible text are present, aria-label takes precedence for screen readers. If they differ, it creates confusion between what sighted and non-sighted users see. Violates WCAG 2.1 SC 1.3.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Either remove aria-label if visible text is sufficient, or ensure aria-label matches or extends the visible text meaningfully.',
              codeSnippet: '<button aria-label="Save">Submit</button>',
              fixSnippet:  '<button>Save</button>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 40: Foreign language text without lang attribute ────────
        //
        // WCAG 2.1 SC 3.1.2 (Level AA)
        if ((tagName === 'span' || tagName === 'div' || tagName === 'p') &&
            !hasAttr('lang') && hasVisibleTextName()) {
          // Note: This is a heuristic check and may have false positives
          const textContent = path.node.children?.filter((c: any) =>
            c.type === 'JSXText' && c.value.trim().length > 0
          );
          if (textContent && textContent.length > 0) {
            // Only report if element has substantial text content and lang attribute is missing
            const hasLang = path.findParent((p: any) =>
              p.isJSXElement && p.node.openingElement?.attributes?.some((a: any) =>
                a.type === 'JSXAttribute' && a.name.name === 'lang'
              )
            );

            if (!hasLang && role !== 'img') {
              // Only flag if it's likely a text element that could have language-specific content
              if (textContent.some((c: any) => /[àâäéèêëìîïòôöùûüç]/.test(c.value))) {
                issues.push({
                  id: 'missing-lang-attribute-for-text',
                  category: 'accessibility',
                  title: 'Text with non-ASCII characters missing lang attribute',
                  description:
                    'Content in languages other than the page language should be marked with a lang attribute. This helps screen readers pronounce text correctly. Violates WCAG 2.1 SC 3.1.2 (Level AA).',
                  impact: 'major',
                  status: 'fail',
                  suggestion:
                    'Add lang attribute with the appropriate language code:\n<span lang="fr">Bonjour</span>',
                  codeSnippet: '<span>Café</span>',
                  fixSnippet:  '<span lang="fr">Café</span>',
                  file: filePath,
                  line: node.loc?.start.line,
                });
              }
            }
          }
        }

        // ── Check 41: <video> with autoplay without muted or controls ────
        //
        // WCAG 2.1 SC 2.2.2 (Level A)
        if (tagName === 'video') {
          const hasAutoplay = hasAttr('autoplay');
          const hasMuted = hasAttr('muted');
          const hasControls = hasAttr('controls');

          if (hasAutoplay && !hasMuted) {
            issues.push({
              id: 'video-autoplay-without-muted',
              category: 'accessibility',
              title: '<video> with autoplay is not muted',
              description:
                'Videos should not autoplay with unmuted audio as it can disorient users and violate their control preferences. If autoplay is needed, mute the audio or provide controls to stop playback. Violates WCAG 2.1 SC 2.2.2 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Either remove autoplay, add muted attribute, or provide explicit user controls:\n<video autoplay muted controls>...',
              codeSnippet: '<video autoplay>\n  <source src="video.mp4" />\n</video>',
              fixSnippet:  '<video autoplay muted controls>\n  <source src="video.mp4" />\n</video>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 44: <button> or <a> with aria-disabled without role ────
        //
        // WCAG 2.1 SC 4.1.2 (Level A)
        if ((tagName === 'button' || tagName === 'a') && hasAttr('aria-disabled')) {
          if (!hasAttr('role')) {
            issues.push({
              id: 'aria-disabled-without-role',
              category: 'accessibility',
              title: `<${tagName}> with aria-disabled is missing a role`,
              description:
                `Buttons and links should not use aria-disabled as they are already semantic elements. If you need to disable a button, use the disabled attribute. For links, removing the href is better than using aria-disabled. Violates WCAG 2.1 SC 4.1.2 (Level A).`,
              impact: 'major',
              status: 'fail',
              suggestion:
                `Use the native disabled attribute for buttons or remove href from links instead of aria-disabled:\n<button disabled>Submit</button>\nor\n<button role="button" aria-disabled="true">Submit</button> (only for non-native elements)`,
              codeSnippet: `<${tagName} aria-disabled="true">Action</${tagName}>`,
              fixSnippet:  tagName === 'button' ? '<button disabled>Submit</button>' : '<a href="/path">Link</a>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 45: Empty <ul> or <ol> ───────────────────────────────
        //
        // WCAG 2.1 SC 1.3.1 (Level A)
        if (tagName === 'ul' || tagName === 'ol') {
          const parent = path.parentPath?.node as any;
          const hasItems = parent?.children?.some((child: any) =>
            child.type === 'JSXElement' &&
            child.openingElement?.name?.name === 'li'
          );

          if (!hasItems) {
            issues.push({
              id: 'empty-list',
              category: 'accessibility',
              title: `<${tagName}> is empty or has no <li> children`,
              description:
                `Lists should contain at least one list item (<li>). An empty list confuses users and serves no semantic purpose. Violates WCAG 2.1 SC 1.3.1 (Level A).`,
              impact: 'major',
              status: 'fail',
              suggestion:
                `Add list items to the list or remove the empty list element:\n<${tagName}>\n  <li>Item 1</li>\n  <li>Item 2</li>\n</${tagName}>`,
              codeSnippet: `<${tagName}></${tagName}>`,
              fixSnippet:  `<${tagName}>\n  <li>Item 1</li>\n  <li>Item 2</li>\n</${tagName}>`,
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 46: <option> outside <select> or <optgroup> ─────────
        //
        // WCAG 2.1 SC 1.3.1 (Level A)
        if (tagName === 'option') {
          const parent = path.parentPath?.node as any;
          const parentTag = parent?.type === 'JSXElement' ? parent.openingElement?.name?.name : '';
          if (parentTag !== 'select' && parentTag !== 'optgroup') {
            issues.push({
              id: 'option-outside-select',
              category: 'accessibility',
              title: '<option> is not inside <select> or <optgroup>',
              description:
                'Options must be direct children of <select> or <optgroup>. Using <option> outside of these containers breaks semantic structure. Violates WCAG 2.1 SC 1.3.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Move the <option> inside a <select> or <optgroup>:\n<select>\n  <option>Choice 1</option>\n</select>',
              codeSnippet: '<div><option>Invalid</option></div>',
              fixSnippet:  '<select>\n  <option>Choice 1</option>\n</select>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 47: <input type="checkbox"> or radio without label ────
        //
        // WCAG 2.1 SC 4.1.2 (Level A)
        if (tagName === 'input') {
          const inputType = getStringValue('type')?.toLowerCase();
          if (inputType === 'checkbox' || inputType === 'radio') {
            const hasId = hasAttr('id');
            const hasAriaLabel = hasAttr('aria-label');
            const hasAriaLabelledBy = hasAttr('aria-labelledby');

            if (!hasId && !hasAriaLabel && !hasAriaLabelledBy) {
              issues.push({
                id: `${inputType}-missing-label`,
                category: 'accessibility',
                title: `<input type="${inputType}"> has no accessible label`,
                description:
                  `Checkboxes and radio buttons must have an associated label so users and screen readers can understand their purpose. Violates WCAG 2.1 SC 4.1.2 (Level A).`,
                impact: 'major',
                status: 'fail',
                suggestion:
                  `Link the input to a label using matching id and htmlFor:\n<label htmlFor="agree"><input id="agree" type="${inputType}" /> I agree</label>`,
                codeSnippet: `<input type="${inputType}" />`,
                fixSnippet:  `<label><input type="${inputType}" /> Option</label>`,
                file: filePath,
                line: node.loc?.start.line,
              });
            }
          }
        }

        // ── Check 48: <th> without scope attribute ──────────────────────
        //
        // WCAG 2.1 SC 1.3.1 (Level A)
        if (tagName === 'th') {
          if (!hasAttr('scope')) {
            issues.push({
              id: 'th-missing-scope',
              category: 'accessibility',
              title: '<th> is missing a scope attribute',
              description:
                'Table header cells should have a scope attribute to indicate if they are row or column headers. This helps screen readers understand table structure. Violates WCAG 2.1 SC 1.3.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add scope="col" for column headers or scope="row" for row headers:\n<th scope="col">Column Name</th>',
              codeSnippet: '<th>Header</th>',
              fixSnippet:  '<th scope="col">Header</th>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 49: <section> without heading ────────────────────────
        //
        // WCAG 2.1 SC 1.3.1 (Level A)
        if (tagName === 'section') {
          const parent = path.parentPath?.node as any;
          const hasHeading = parent?.children?.some((child: any) => {
            if (child.type !== 'JSXElement') return false;
            const childTag = child.openingElement?.name?.name;
            return childTag?.match(/^h[1-6]$/);
          });
          const hasAriaLabel = hasAttr('aria-label');
          const hasAriaLabelledBy = hasAttr('aria-labelledby');

          if (!hasHeading && !hasAriaLabel && !hasAriaLabelledBy) {
            issues.push({
              id: 'section-missing-heading',
              category: 'accessibility',
              title: '<section> is missing a heading or accessible name',
              description:
                'Sections should have an associated heading or accessible name so screen reader users can understand the section purpose. Without it, the section is unlabeled and confusing. Violates WCAG 2.1 SC 1.3.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add a heading inside the section or provide aria-label / aria-labelledby:\n<section>\n  <h2>Section Title</h2>\n  ...\n</section>',
              codeSnippet: '<section>...</section>',
              fixSnippet:  '<section>\n  <h2>Section Title</h2>\n  ...\n</section>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 50: <aside> without accessible name ──────────────────
        //
        // WCAG 2.1 SC 1.3.1 (Level A)
        if (tagName === 'aside') {
          const hasAriaLabel = hasAttr('aria-label');
          const hasAriaLabelledBy = hasAttr('aria-labelledby');
          const hasHeading = hasVisibleTextName();

          if (!hasAriaLabel && !hasAriaLabelledBy && !hasHeading) {
            issues.push({
              id: 'aside-missing-accessible-name',
              category: 'accessibility',
              title: '<aside> is missing an accessible name',
              description:
                'Aside elements (complementary content) should have an accessible name to identify their purpose. This helps screen reader users understand the relationship to main content. Violates WCAG 2.1 SC 1.3.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add aria-label or aria-labelledby to the aside:\n<aside aria-label="Related articles">...</aside>',
              codeSnippet: '<aside>...</aside>',
              fixSnippet:  '<aside aria-label="Related information">...</aside>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 51: <label> wrapping multiple form controls ──────────
        //
        // WCAG 2.1 SC 4.1.2 (Level A)
        if (tagName === 'label') {
          const parent = path.parentPath?.node as any;
          const formControlCount = parent?.children?.filter((child: any) =>
            child.type === 'JSXElement' &&
            ['input', 'select', 'textarea'].includes(child.openingElement?.name?.name)
          ).length || 0;

          if (formControlCount > 1) {
            issues.push({
              id: 'label-wrapping-multiple-controls',
              category: 'accessibility',
              title: '<label> is wrapping multiple form controls',
              description:
                'A label should be associated with only one form control. When a label wraps multiple controls, it creates ambiguity about which control the label describes. Violates WCAG 2.1 SC 4.1.2 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Use separate labels for each form control, or use aria-label / aria-labelledby:\n<label htmlFor="first">First name</label>\n<input id="first" />\n<label htmlFor="last">Last name</label>\n<input id="last" />',
              codeSnippet: '<label>\n  <input type="text" />\n  <input type="text" />\n</label>',
              fixSnippet:  '<label htmlFor="input1">Field 1</label>\n<input id="input1" />\n<label htmlFor="input2">Field 2</label>\n<input id="input2" />',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 52: <img> with title but no alt ──────────────────────
        //
        // WCAG 2.1 SC 1.1.1 (Level A)
        if (tagName === 'img') {
          const hasAlt = hasAttr('alt');
          const hasTitle = hasAttr('title');

          if (!hasAlt && hasTitle) {
            issues.push({
              id: 'img-title-without-alt',
              category: 'accessibility',
              title: '<img> has title but no alt attribute',
              description:
                'The title attribute is not a substitute for alt text. Screen readers do not announce title by default, and it is not visible on screen. Alt text is required for all images. Violates WCAG 2.1 SC 1.1.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Always provide an alt attribute in addition to title. For most images, alt can be the same as or similar to the title.',
              codeSnippet: '<img src="photo.jpg" title="Family portrait" />',
              fixSnippet:  '<img src="photo.jpg" alt="Family portrait" title="Family portrait" />',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 53: <embed> or <object> without accessible alternative
        //
        // WCAG 2.1 SC 1.1.1 (Level A)
        if (tagName === 'embed' || tagName === 'object') {
          const hasAriaLabel = hasAttr('aria-label');
          const hasAriaLabelledBy = hasAttr('aria-labelledby');
          const hasTitle = hasAttr('title');

          if (!hasAriaLabel && !hasAriaLabelledBy && !hasTitle) {
            issues.push({
              id: `${tagName}-missing-accessible-alternative`,
              category: 'accessibility',
              title: `<${tagName}> is missing an accessible alternative`,
              description:
                `Embedded content and objects should have an accessible name or alternative text. Without it, screen reader users cannot understand the embedded content. Violates WCAG 2.1 SC 1.1.1 (Level A).`,
              impact: 'major',
              status: 'fail',
              suggestion:
                `Add aria-label, aria-labelledby, or title:\n<${tagName} src="file.pdf" aria-label="Project report" />`,
              codeSnippet: `<${tagName} src="content" />`,
              fixSnippet:  `<${tagName} src="content" aria-label="Content description" />`,
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 54: <svg> without title and description ───────────────
        //
        // WCAG 2.1 SC 1.1.1 (Level A)
        if (tagName === 'svg') {
          const hasRole = getStringValue('role');
          const hasAriaLabel = hasAttr('aria-label');
          const hasAriaLabelledBy = hasAttr('aria-labelledby');

          // Only check SVGs with img role or no role (which act as images)
          if ((!hasRole || hasRole === 'img') && !hasAriaLabel && !hasAriaLabelledBy) {
            const parent = path.parentPath?.node as any;
            const hasTitle = parent?.children?.some((child: any) =>
              child.type === 'JSXElement' &&
              child.openingElement?.name?.name === 'title'
            );

            if (!hasTitle) {
              issues.push({
                id: 'svg-missing-accessible-name',
                category: 'accessibility',
                title: '<svg> image is missing an accessible name',
                description:
                  'SVG images should have an accessible name via <title> element, aria-label, or aria-labelledby. Without it, screen reader users cannot understand the image. Violates WCAG 2.1 SC 1.1.1 (Level A).',
                impact: 'major',
                status: 'fail',
                suggestion:
                  'Add a <title> element inside the SVG or use aria-label:\n<svg aria-label="Chart of sales data">\n  ...\n</svg>',
                codeSnippet: '<svg>...</svg>',
                fixSnippet:  '<svg aria-label="Icon description">\n  <title>Icon description</title>\n  ...\n</svg>',
                file: filePath,
                line: node.loc?.start.line,
              });
            }
          }
        }

        // ── Check 55: <iframe> with restrictive sandbox ───────────────
        //
        // WCAG 2.1 SC 2.1.1 (Level A)
        if (tagName === 'iframe') {
          const sandbox = getStringValue('sandbox');
          if (sandbox && !sandbox.includes('allow-keyboard')) {
            issues.push({
              id: 'iframe-sandbox-restricts-keyboard',
              category: 'accessibility',
              title: '<iframe> sandbox may restrict keyboard access',
              description:
                'The sandbox attribute with restrictive permissions (missing "allow-keyboard") may prevent keyboard users from accessing iframe content. Ensure keyboard access is preserved. Violates WCAG 2.1 SC 2.1.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add "allow-keyboard" to the sandbox attribute to allow keyboard navigation:\n<iframe sandbox="allow-same-origin allow-keyboard" ...></iframe>',
              codeSnippet: '<iframe sandbox="allow-same-origin" ...></iframe>',
              fixSnippet:  '<iframe sandbox="allow-same-origin allow-keyboard" ...></iframe>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 56: Table missing <tbody> or <thead> ─────────────────
        //
        // WCAG 2.1 SC 1.3.1 (Level A)
        if (tagName === 'table') {
          const parent = path.parentPath?.node as any;
          const hasHead = parent?.children?.some((child: any) =>
            child.type === 'JSXElement' &&
            child.openingElement?.name?.name === 'thead'
          );
          const hasBody = parent?.children?.some((child: any) =>
            child.type === 'JSXElement' &&
            child.openingElement?.name?.name === 'tbody'
          );

          if (!hasHead || !hasBody) {
            const missing = [!hasHead && 'thead', !hasBody && 'tbody']
              .filter(Boolean)
              .join(' and ');

            issues.push({
              id: 'table-missing-structure-elements',
              category: 'accessibility',
              title: `<table> is missing <${missing}> element(s)`,
              description:
                `Tables should use <thead> and <tbody> to properly structure header and body content. This helps screen readers understand table relationships. Violates WCAG 2.1 SC 1.3.1 (Level A).`,
              impact: 'major',
              status: 'fail',
              suggestion:
                'Organize table structure with <thead> and <tbody>:\n<table>\n  <thead><tr><th scope="col">Header</th></tr></thead>\n  <tbody><tr><td>Data</td></tr></tbody>\n</table>',
              codeSnippet: '<table>\n  <tr><th>Header</th></tr>\n  <tr><td>Data</td></tr>\n</table>',
              fixSnippet:  '<table>\n  <thead><tr><th scope="col">Header</th></tr></thead>\n  <tbody><tr><td>Data</td></tr></tbody>\n</table>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

        // ── Check 57: <td> with colspan/rowspan without proper headers ──
        //
        // WCAG 2.1 SC 1.3.1 (Level A)
        if (tagName === 'td') {
          const hasColspan = getStringValue('colspan');
          const hasRowspan = getStringValue('rowspan');
          const hasHeaders = hasAttr('headers');

          if ((hasColspan || hasRowspan) && !hasHeaders) {
            issues.push({
              id: 'td-complex-header-without-headers-attr',
              category: 'accessibility',
              title: '<td> with colspan or rowspan is missing headers attribute',
              description:
                'Data cells that span multiple rows or columns should have a headers attribute that references the corresponding header cells. This helps screen readers map complex table relationships. Violates WCAG 2.1 SC 1.3.1 (Level A).',
              impact: 'major',
              status: 'fail',
              suggestion:
                'Add headers attribute referencing the header cell IDs:\n<td headers="header1 header2">Data</td>',
              codeSnippet: '<td colspan="2">Merged cell</td>',
              fixSnippet:  '<td colspan="2" headers="col1 col2">Merged cell</td>',
              file: filePath,
              line: node.loc?.start.line,
            });
          }
        }

      }, // end JSXOpeningElement

    }); // end traverse

    // ── Check 28: Page missing <h1> element ────────────────────────────
    //
    // WCAG 2.1 SC 1.3.1 (Level A)
    if (!hasH1) {
      issues.push({
        id: 'page-missing-h1',
        category: 'accessibility',
        title: 'Page is missing an <h1> element',
        description:
          'Every page should have exactly one <h1> that describes the main purpose or topic. The <h1> is the primary heading and helps users and assistive technology understand page structure. Violates WCAG 2.1 SC 1.3.1 (Level A).',
        impact: 'major',
        status: 'fail',
        suggestion:
          'Add a descriptive <h1> at the beginning of your main content:\n<h1>Welcome to My Site</h1>',
        codeSnippet: '<main>...</main>',
        fixSnippet:  '<main>\n  <h1>Page Title</h1>\n  ...\n</main>',
        file: filePath,
        line: 1,
      });
    }

    // ── Check 33: Heading hierarchy broken ──────────────────────────────
    //
    // WCAG 2.1 SC 1.3.1 (Level A)
    for (let i = 1; i < headingLevels.length; i++) {
      const prev = headingLevels[i - 1]!;
      const curr = headingLevels[i]!;
      if (curr > prev + 1) {
        issues.push({
          id: 'heading-hierarchy-skipped',
          category: 'accessibility',
          title: `Heading hierarchy skipped from <h${prev}> to <h${curr}>`,
          description:
            `Heading levels should be sequential (h1 → h2 → h3, etc.). Skipping levels breaks the document structure and confuses screen reader users. You jumped from <h${prev}> to <h${curr}>. Violates WCAG 2.1 SC 1.3.1 (Level A).`,
          impact: 'major',
          status: 'fail',
          suggestion:
            `Use <h${prev + 1}> instead of <h${curr}>, or add a missing intermediate heading level.`,
          codeSnippet: `<h${prev}>Section</h${prev}>\n<h${curr}>Subsection</h${curr}>`,
          fixSnippet:  `<h${prev}>Section</h${prev}>\n<h${prev + 1}>Subsection</h${prev + 1}>`,
          file: filePath,
          line: 1,
        });
        break; // Report only the first hierarchy issue per file
      }
    }

    // ── Check 43: Multiple <main> elements ──────────────────────────────
    //
    // WCAG 2.1 SC 1.3.1 (Level A)
    if (mainCount > 1) {
      issues.push({
        id: 'multiple-main-elements',
        category: 'accessibility',
        title: `Page has ${mainCount} <main> elements (should have 1)`,
        description:
          'Pages should have exactly one <main> element that contains the main content. Multiple <main> elements confuse screen reader users and violate semantic structure. Violates WCAG 2.1 SC 1.3.1 (Level A).',
        impact: 'major',
        status: 'fail',
        suggestion:
          'Keep only one <main> element and move secondary content out of additional <main> tags, or use <section> with aria-label instead.',
        codeSnippet: '<main>...</main>\n<main>...</main>',
        fixSnippet:  '<main>...</main>',
        file: filePath,
        line: 1,
      });
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