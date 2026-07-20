# UiAudit — VS Code Extension 🔍

Real-time inline auditing of React and Next.js components for Accessibility (a11y), Performance anti-patterns, and SEO issues.

---

## Features

- ⚡ **Real-Time Inline Diagnostics:** Highlights WCAG accessibility violations, React performance pitfalls, and SEO issues directly in your editor as you code or save files.
- 💡 **Instant Suggestions & Quick Fixes:** Provides actionable suggestions and Quick Fix code actions.
- 🎨 **Severity Color Coding:**
  - 🔴 **Critical (Error):** Severe accessibility failures or critical component bugs.
  - 🟡 **Major (Warning):** Significant WCAG compliance or performance issues.
  - 🔵 **Minor (Information):** Code hygiene, logging, or non-semantic HTML warnings.
- 🛠️ **Zero Configuration Required:** Works out-of-the-box, or respects your project's local `uiaudit.config.json`.

---

## Supported File Extensions

- `.tsx` — TypeScript React
- `.jsx` — JavaScript React
- `.ts` — TypeScript
- `.js` — JavaScript

---

## Commands

Access these commands via the VS Code Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Title | Description |
| :--- | :--- | :--- |
| `uiaudit.runAudit` | `UiAudit: Scan Active File` | Manually run UiAudit on the active document |
| `uiaudit.scanWorkspace` | `UiAudit: Scan Entire Workspace` | Scan all project files and populate the Problems panel |
| `uiaudit.clearDiagnostics` | `UiAudit: Clear Diagnostics` | Clear all active UiAudit diagnostic markers |

---

## Extension Settings

Customize extension behavior in VS Code settings (`settings.json`):

```json
{
  "uiaudit.enable": true,
  "uiaudit.runOnSave": true,
  "uiaudit.categories": [
    "accessibility",
    "performance",
    "seo"
  ]
}
```

---

## Local Configuration File (`uiaudit.config.json`)

UiAudit automatically loads project-level configuration files (`uiaudit.config.json` or `.uiauditrc`):

```json
{
  "categories": ["accessibility", "performance", "seo"],
  "ignore": ["node_modules/**", "dist/**", ".next/**"],
  "rules": {
    "img-missing-alt": "critical",
    "missing-key-prop": "major",
    "console-in-component": "off"
  }
}
```

---

## License

MIT © [Dheeraj p](https://github.com/Dheeraj-pilakkat/UiAudit.js)
