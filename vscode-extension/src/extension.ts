import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { runAudit, type Issue, type AuditReport } from '../../src/index.js';

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
  diagnosticCollection = vscode.languages.createDiagnosticCollection('UIAudit.js');
  context.subscriptions.push(diagnosticCollection);

  // Command: Run audit on active document
  const runAuditCmd = vscode.commands.registerCommand('uiaudit.runAudit', () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      auditDocument(editor.document);
    }
  });

  // Command: Scan entire workspace
  const scanWorkspaceCmd = vscode.commands.registerCommand('uiaudit.scanWorkspace', () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showWarningMessage('UiAudit: No active workspace folder found to scan.');
      return;
    }
    const targetFolder = workspaceFolders[0].uri.fsPath;
    auditWorkspace(targetFolder);
  });

  // Command: Clear diagnostics
  const clearDiagnosticsCmd = vscode.commands.registerCommand('uiaudit.clearDiagnostics', () => {
    diagnosticCollection.clear();
  });

  context.subscriptions.push(runAuditCmd, scanWorkspaceCmd, clearDiagnosticsCmd);


  // Listen for document save events
  vscode.workspace.onDidSaveTextDocument((document) => {
    const config = vscode.workspace.getConfiguration('uiaudit');
    if (config.get<boolean>('enable', true) && config.get<boolean>('runOnSave', true)) {
      auditDocument(document);
    }
  }, null, context.subscriptions);

  // Listen for active document open/change
  vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      const config = vscode.workspace.getConfiguration('uiaudit');
      if (config.get<boolean>('enable', true)) {
        auditDocument(editor.document);
      }
    }
  }, null, context.subscriptions);

  // Register Quick Fix Provider for inline suggestions
  const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    [
      { language: 'typescriptreact', scheme: 'file' },
      { language: 'javascriptreact', scheme: 'file' },
      { language: 'typescript', scheme: 'file' },
      { language: 'javascript', scheme: 'file' },
    ],
    new UiAuditQuickFixProvider(),
    {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }
  );

  context.subscriptions.push(codeActionProvider);

  // Audit active document if one is open at start
  if (vscode.window.activeTextEditor) {
    auditDocument(vscode.window.activeTextEditor.document);
  }
}

export function deactivate() {
  if (diagnosticCollection) {
    diagnosticCollection.clear();
  }
}

function isConfigFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const fileName = path.basename(normalized);
  const lowerName = fileName.toLowerCase();

  // Check declaration files
  if (lowerName.endsWith('.d.ts')) return true;

  // Check test files
  if (
    lowerName.endsWith('.test.ts') ||
    lowerName.endsWith('.test.tsx') ||
    lowerName.endsWith('.test.js') ||
    lowerName.endsWith('.test.jsx') ||
    lowerName.endsWith('.spec.ts') ||
    lowerName.endsWith('.spec.tsx') ||
    lowerName.endsWith('.spec.js') ||
    lowerName.endsWith('.spec.jsx')
  ) {
    return true;
  }

  // Check env files & hidden dot files
  if (lowerName.startsWith('.')) return true;

  // Check config filenames (e.g. config.ts, config.js, next.config.js, tailwind.config.js, uiaudit.config.json)
  if (
    lowerName === 'config.ts' ||
    lowerName === 'config.js' ||
    lowerName === 'config.json' ||
    lowerName.includes('.config.') ||
    lowerName.endsWith('.config.js') ||
    lowerName.endsWith('.config.ts') ||
    lowerName.endsWith('.config.mjs') ||
    lowerName.endsWith('.config.cjs') ||
    lowerName.endsWith('.config.json')
  ) {
    return true;
  }

  // Check common tooling / framework config filenames
  if (
    lowerName.startsWith('tsconfig') ||
    lowerName.startsWith('jsconfig') ||
    lowerName.startsWith('vite.config') ||
    lowerName.startsWith('next.config') ||
    lowerName.startsWith('tailwind.config') ||
    lowerName.startsWith('postcss.config') ||
    lowerName.startsWith('webpack.config') ||
    lowerName.startsWith('babel.config') ||
    lowerName.startsWith('rollup.config') ||
    lowerName.startsWith('vitest.config') ||
    lowerName.startsWith('jest.config') ||
    lowerName.startsWith('eslint.config') ||
    lowerName.startsWith('prettier.config') ||
    lowerName.startsWith('uiaudit.config')
  ) {
    return true;
  }

  // Check non-UI tool directories
  if (
    normalized.includes('/.vscode/') ||
    normalized.includes('/.github/') ||
    normalized.includes('/.idea/') ||
    normalized.includes('/.husky/') ||
    normalized.includes('/scripts/') ||
    normalized.includes('/tools/')
  ) {
    return true;
  }

  return false;
}

/**
 * Runs UiAudit engine on the specified text document and updates diagnostics.
 */
function auditDocument(document: vscode.TextDocument) {
  const fileName = document.fileName;
  const fileExt = path.extname(fileName).toLowerCase();

  if (!['.tsx', '.jsx', '.ts', '.js'].includes(fileExt) || isConfigFile(fileName)) {
    diagnosticCollection.delete(document.uri);
    return;
  }

  // Skip node_modules or output folders
  if (fileName.includes('node_modules') || fileName.includes('dist')) {
    diagnosticCollection.delete(document.uri);
    return;
  }

  try {
    const config = vscode.workspace.getConfiguration('uiaudit');
    const categories = config.get<string[]>('categories', ['accessibility', 'performance', 'seo']) as any[];

    const report: AuditReport = runAudit(document.fileName, {
      types: categories,
    });

    const diagnostics: vscode.Diagnostic[] = [];

    for (const result of Object.values(report.results)) {
      if (!result) continue;

      for (const issue of result.issues) {
        const lineNum = Math.max(0, (issue.line ?? 1) - 1);
        const lineText = document.lineAt(Math.min(lineNum, document.lineCount - 1)).text;
        const startChar = lineText.search(/\S/) !== -1 ? lineText.search(/\S/) : 0;
        const range = new vscode.Range(lineNum, startChar, lineNum, lineText.length);

        const severity = mapImpactToSeverity(issue.impact);
        const message = formatDiagnosticMessage(issue);

        const diagnostic = new vscode.Diagnostic(range, message, severity);
        diagnostic.source = 'UIAudit.js';
        diagnostic.code = issue.id;

        diagnostics.push(diagnostic);
      }
    }

    diagnosticCollection.set(document.uri, diagnostics);
  } catch (err) {
    // Audit error handled gracefully in extension
  }
}

function mapImpactToSeverity(impact: 'critical' | 'major' | 'minor'): vscode.DiagnosticSeverity {
  switch (impact) {
    case 'critical':
      return vscode.DiagnosticSeverity.Error;
    case 'major':
      return vscode.DiagnosticSeverity.Warning;
    case 'minor':
      return vscode.DiagnosticSeverity.Information;
    default:
      return vscode.DiagnosticSeverity.Warning;
  }
}

function formatDiagnosticMessage(issue: Issue): string {
  let msg = `[${issue.category.toUpperCase()}] ${issue.title}\n\n${issue.description}`;
  if (issue.suggestion) {
    msg += `\n\n💡 Suggestion: ${issue.suggestion}`;
  }
  return msg;
}

/**
 * Provides Quick Fixes for UiAudit diagnostic items.
 */
class UiAuditQuickFixProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== 'UiAudit') continue;

      const action = new vscode.CodeAction(
        `UiAudit Suggestion for ${diagnostic.code}`,
        vscode.CodeActionKind.QuickFix
      );
      action.diagnostics = [diagnostic];
      action.isPreferred = true;

      // Opens hover detail / documentation
      action.command = {
        command: 'vscode.open',
        title: 'Learn more about this UiAudit rule',
        arguments: [document.uri],
      };

      actions.push(action);
    }

    return actions;
  }
}

/**
 * Scans an entire workspace directory, updates diagnostics for all files, and focuses the Problems panel.
 */
function auditWorkspace(folderPath: string) {
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'UiAudit: Scanning workspace components...',
      cancellable: false,
    },
    async () => {
      try {
        const config = vscode.workspace.getConfiguration('uiaudit');
        const categories = config.get<string[]>('categories', ['accessibility', 'performance', 'seo']) as any[];

        const report: AuditReport = runAudit(folderPath, { types: categories });

        diagnosticCollection.clear();
        const fileDiagnosticsMap = new Map<string, vscode.Diagnostic[]>();

        for (const result of Object.values(report.results)) {
          if (!result) continue;

          for (const issue of result.issues) {
            if (!issue.file) continue;

            const filePath = issue.file;
            const lineNum = Math.max(0, (issue.line ?? 1) - 1);

            let lineText = '';
            try {
              if (fs.existsSync(filePath)) {
                const fileLines = fs.readFileSync(filePath, 'utf-8').split('\n');
                lineText = fileLines[Math.min(lineNum, fileLines.length - 1)] || '';
              }
            } catch (err) {
              lineText = '';
            }

            const startChar = lineText.search(/\S/) !== -1 ? lineText.search(/\S/) : 0;
            const range = new vscode.Range(lineNum, startChar, lineNum, Math.max(startChar + 1, lineText.length));

            const severity = mapImpactToSeverity(issue.impact);
            const message = formatDiagnosticMessage(issue);

            const diagnostic = new vscode.Diagnostic(range, message, severity);
            diagnostic.source = 'UIAudit.js';
            diagnostic.code = issue.id;

            if (!fileDiagnosticsMap.has(filePath)) {
              fileDiagnosticsMap.set(filePath, []);
            }
            fileDiagnosticsMap.get(filePath)!.push(diagnostic);
          }
        }

        for (const [filePath, diagnostics] of fileDiagnosticsMap.entries()) {
          diagnosticCollection.set(vscode.Uri.file(filePath), diagnostics);
        }

        // Focus the Problems panel so developer sees all workspace issues
        vscode.commands.executeCommand('workbench.action.problems.focus');

        vscode.window.showInformationMessage(
          `UiAudit Scan Complete! Scanned ${report.totalFiles} file${report.totalFiles !== 1 ? 's' : ''}. Overall Score: ${report.overallScore}/100`
        );
      } catch (err) {
        vscode.window.showErrorMessage(`UiAudit workspace scan failed: ${(err as Error).message}`);
      }
    }
  );
}

