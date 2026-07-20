"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const index_js_1 = require("../../src/index.js");
let diagnosticCollection;
function activate(context) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('uiaudit');
    context.subscriptions.push(diagnosticCollection);
    // Command: Run audit on active document
    const runAuditCmd = vscode.commands.registerCommand('uiaudit.runAudit', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            auditDocument(editor.document);
        }
    });
    // Command: Clear diagnostics
    const clearDiagnosticsCmd = vscode.commands.registerCommand('uiaudit.clearDiagnostics', () => {
        diagnosticCollection.clear();
    });
    context.subscriptions.push(runAuditCmd, clearDiagnosticsCmd);
    // Listen for document save events
    vscode.workspace.onDidSaveTextDocument((document) => {
        const config = vscode.workspace.getConfiguration('uiaudit');
        if (config.get('enable', true) && config.get('runOnSave', true)) {
            auditDocument(document);
        }
    }, null, context.subscriptions);
    // Listen for active document open/change
    vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
            const config = vscode.workspace.getConfiguration('uiaudit');
            if (config.get('enable', true)) {
                auditDocument(editor.document);
            }
        }
    }, null, context.subscriptions);
    // Register Quick Fix Provider for inline suggestions
    const codeActionProvider = vscode.languages.registerCodeActionsProvider([
        { language: 'typescriptreact', scheme: 'file' },
        { language: 'javascriptreact', scheme: 'file' },
        { language: 'typescript', scheme: 'file' },
        { language: 'javascript', scheme: 'file' },
    ], new UiAuditQuickFixProvider(), {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    });
    context.subscriptions.push(codeActionProvider);
    // Audit active document if one is open at start
    if (vscode.window.activeTextEditor) {
        auditDocument(vscode.window.activeTextEditor.document);
    }
}
function deactivate() {
    if (diagnosticCollection) {
        diagnosticCollection.clear();
    }
}
/**
 * Runs UiAudit engine on the specified text document and updates diagnostics.
 */
function auditDocument(document) {
    const fileExt = path.extname(document.fileName).toLowerCase();
    if (!['.tsx', '.jsx', '.ts', '.js'].includes(fileExt)) {
        return;
    }
    // Skip node_modules or output folders
    if (document.fileName.includes('node_modules') || document.fileName.includes('dist')) {
        return;
    }
    try {
        const config = vscode.workspace.getConfiguration('uiaudit');
        const categories = config.get('categories', ['accessibility', 'performance', 'seo']);
        const report = (0, index_js_1.runAudit)(document.fileName, {
            types: categories,
        });
        const diagnostics = [];
        for (const result of Object.values(report.results)) {
            if (!result)
                continue;
            for (const issue of result.issues) {
                const lineNum = Math.max(0, (issue.line ?? 1) - 1);
                const lineText = document.lineAt(Math.min(lineNum, document.lineCount - 1)).text;
                const startChar = lineText.search(/\S/) !== -1 ? lineText.search(/\S/) : 0;
                const range = new vscode.Range(lineNum, startChar, lineNum, lineText.length);
                const severity = mapImpactToSeverity(issue.impact);
                const message = formatDiagnosticMessage(issue);
                const diagnostic = new vscode.Diagnostic(range, message, severity);
                diagnostic.source = 'UiAudit';
                diagnostic.code = issue.id;
                diagnostics.push(diagnostic);
            }
        }
        diagnosticCollection.set(document.uri, diagnostics);
    }
    catch (err) {
        // Audit error handled gracefully in extension
    }
}
function mapImpactToSeverity(impact) {
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
function formatDiagnosticMessage(issue) {
    let msg = `[${issue.category.toUpperCase()}] ${issue.title}\n\n${issue.description}`;
    if (issue.suggestion) {
        msg += `\n\n💡 Suggestion: ${issue.suggestion}`;
    }
    return msg;
}
/**
 * Provides Quick Fixes for UiAudit diagnostic items.
 */
class UiAuditQuickFixProvider {
    provideCodeActions(document, _range, context, _token) {
        const actions = [];
        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source !== 'UiAudit')
                continue;
            const action = new vscode.CodeAction(`UiAudit Suggestion for ${diagnostic.code}`, vscode.CodeActionKind.QuickFix);
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
//# sourceMappingURL=extension.js.map