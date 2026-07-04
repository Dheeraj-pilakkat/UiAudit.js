# Contributing to UIAudit.js

Thank you for your interest in contributing to UIAudit.js! We welcome all contributions, whether they're bug reports, feature requests, documentation improvements, or code contributions. This document provides guidelines to help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Conventions](#commit-conventions)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

We are committed to providing a welcoming and inclusive environment for all contributors. Please be respectful, considerate, and professional in all interactions. We do not tolerate harassment, discrimination, or any form of disruptive behavior.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/uiaudit.git
   cd uiaudit
   ```
3. **Add upstream remote** to keep your fork synced:
   ```bash
   git remote add upstream https://github.com/Dheeraj-pilakkat/UiAudit.js.git
   ```
4. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Setup

### Prerequisites

- Node.js (v16.0.0 or higher)
- npm (v7.0.0 or higher)
- Git

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the TypeScript project:
   ```bash
   npm run build
   ```

3. Verify setup by running a test audit:
   ```bash
   node dist/cli.js audit ./src
   ```

### Available npm Scripts

```bash
npm run build    # Compile TypeScript to JavaScript
npm run dev      # Run TypeScript files directly (development)
npm start        # Run the CLI from built dist files
```

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with:

1. **Clear title** describing the bug
2. **Detailed description** of the issue
3. **Steps to reproduce** the problem
4. **Expected behavior** vs. **actual behavior**
5. **Environment** (Node.js version, OS, npm version)
6. **Code example** or minimal reproducible case

**Example:**
```
Title: Checkbox accessibility rule incorrectly reports error on wrapped labels

Description:
The `checkbox-missing-label` rule is triggering false positives when a checkbox is wrapped inside a <label> element.

Steps to reproduce:
1. Create a component with: <label><input type="checkbox" /> Click me</label>
2. Run: uiaudit a11y ./path/to/component
3. See error: "checkbox-missing-label"

Expected: No error (label is implicitly associated)
Actual: Error reported

Environment: Node 18.0.0, npm 9.0.0, macOS 12
```

### Requesting Features

Feature requests should include:

1. **Clear description** of the feature
2. **Use case** - why is this needed?
3. **Proposed implementation** (if you have ideas)
4. **Examples** of how it would be used

**Example:**
```
Title: Add support for Vue components

Description:
Currently UIAudit only supports React/Next.js. Adding Vue support would expand the tool's usefulness.

Use case:
Teams using Vue want to leverage UIAudit's comprehensive accessibility checks.

Proposed approach:
- Add a new parser for Vue SFCs
- Extend auditor to handle Vue template syntax
```

## Pull Request Process

1. **Keep your branch updated**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Make your changes** following [Coding Standards](#coding-standards)

3. **Write tests** for new features (if applicable)

4. **Update documentation** if needed

5. **Build and test**:
   ```bash
   npm run build
   npm test  # if test script exists
   ```

6. **Commit your changes** following [Commit Conventions](#commit-conventions)

7. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

8. **Create a Pull Request** on GitHub with:
   - Descriptive title
   - Reference to related issues (e.g., "Fixes #123")
   - Summary of changes
   - Screenshots/examples if applicable

9. **Respond to reviews** promptly and professionally

10. **Squash commits** if requested before merging

### PR Template

```markdown
## Description
Brief description of what this PR does

## Related Issues
Fixes #(issue number)
Related to #(issue number)

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring

## Changes Made
- Change 1
- Change 2
- Change 3

## Testing
- [ ] I have tested this locally
- [ ] All existing tests pass
- [ ] New tests added (if applicable)

## Screenshots (if applicable)
Add screenshots for UI changes

## Checklist
- [ ] Code follows project style guidelines
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No breaking changes introduced
```

## Coding Standards

### TypeScript

1. **Use strict mode**: Enable `strict: true` in tsconfig
2. **Type everything**: Avoid `any` types, use proper interfaces/types
3. **File naming**: Use kebab-case for files (`accessibility.ts`)
4. **Function naming**: Use camelCase for functions and variables
5. **Class naming**: Use PascalCase for classes and interfaces

### Accessibility Rules

When adding new accessibility checks:

1. **Map to WCAG 2.1**: Reference specific success criteria
2. **Use consistent Issue schema**:
   ```typescript
   issues.push({
     id: 'unique-rule-id',
     category: 'accessibility',
     title: 'Descriptive title',
     description: 'Why this matters and WCAG reference',
     impact: 'critical' | 'major' | 'minor',
     status: 'fail',
     suggestion: 'How to fix it with example',
     codeSnippet: 'Before example',
     fixSnippet: 'After example',
     file: filePath,
     line: node.loc?.start.line,
   });
   ```

### Code Style

- **Indentation**: 2 spaces (no tabs)
- **Line length**: Max 100 characters
- **Semicolons**: Required at end of statements
- **Trailing commas**: Use trailing commas in multi-line arrays/objects
- **Comments**: Use `//` for single-line, `/** */` for JSDoc

### Example

```typescript
/**
 * Check if element has keyboard support
 * @param node - JSX opening element node
 * @returns true if element has keyboard event handlers
 */
const hasKeyboardSupport = (node: any): boolean =>
  hasAttr('onKeyDown') || 
  hasAttr('onKeyUp') || 
  hasAttr('onKeyPress');
```

## Commit Conventions

Use conventional commits for consistency:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Test additions/changes
- `chore`: Build process, dependencies, etc.

### Scope

- `accessibility`: Changes to a11y checks
- `performance`: Changes to performance checks
- `seo`: Changes to SEO checks
- `cli`: CLI changes
- `parser`: Parser changes
- `core`: Core auditor logic
- `docs`: Documentation
- `build`: Build configuration

### Examples

```
feat(accessibility): add checkbox-missing-label rule

Add new accessibility check to detect checkboxes without proper labels.
This addresses WCAG 2.1 SC 1.3.1 and 4.1.2 requirements.

Implements:
- Detection of checkbox elements
- Accessible name checking
- Appropriate suggestion for fixes

Fixes #123
```

```
fix(accessibility): correct false positive in radio-button check

The radio-missing-label rule was incorrectly flagging wrapped radio buttons
where the label is properly associated implicitly.

Updated the hasAccessibleName helper to account for parent label elements.

Fixes #456
```

## Testing

### Running Tests

```bash
npm test
```

### Adding Tests

When adding new features or fixing bugs, include tests:

1. **Unit tests** for utility functions
2. **Integration tests** for complete audit flows
3. **Snapshot tests** for output formatting

### Test File Structure

```
tests/
├── auditors/
│   ├── accessibility.test.ts
│   ├── performance.test.ts
│   └── seo.test.ts
├── parser/
│   └── parser.test.ts
└── reporter/
    └── terminal.test.ts
```

## Documentation

### README Updates

- Update README.md if adding user-facing features
- Include examples and usage instructions
- Update architecture diagrams if needed

### Code Comments

- Comment complex logic and algorithms
- Use JSDoc for public functions
- Keep comments up-to-date with code changes

### Commit Messages

- Write clear, descriptive commit messages
- Reference issues when relevant
- Explain the "why" not just the "what"

## Review Process

1. At least one maintainer review required
2. All CI checks must pass
3. Code coverage should not decrease
4. Documentation must be updated

## Questions?

- Check existing [GitHub Issues](https://github.com/Dheeraj-pilakkat/UiAudit.js/issues)
- Review the [README.md](README.md) for project overview
- Read the [Architecture Overview](README.md#architecture-overview)

## License

By contributing to UIAudit.js, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to UIAudit.js!** Your efforts help make web components more accessible and performant. 🎉
