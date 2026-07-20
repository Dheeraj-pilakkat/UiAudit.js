// ─── Audit Categories ────────────────────────────────────────────────────────

export type AuditCategory = 'performance' | 'seo' | 'accessibility';
export type IssueImpact = 'critical' | 'major' | 'minor';
export type IssueStatus = 'fail' | 'warning';

// ─── A single issue found in a file ─────────────────────────────────────────

export interface Issue {
  id: string;
  category: AuditCategory;
  title: string;
  description: string;
  impact: IssueImpact;
  status: IssueStatus;
  suggestion: string;       // Plain-text fix explanation
  codeSnippet?: string;     // The problematic pattern
  fixSnippet?: string;      // The corrected version
  file?: string;            // Absolute path
  line?: number;            // Line number in the source file
}

// ─── Result for a single audit category ─────────────────────────────────────

export interface AuditResult {
  category: AuditCategory;
  score: number;            // 0–100
  issues: Issue[];
  counts: {
    critical: number;
    major: number;
    minor: number;
    total: number;
  };
}

// ─── Configuration Types ───────────────────────────────────────────────────

export interface UiAuditConfig {
  categories?: AuditCategory[] | undefined;
  ignore?: string[] | undefined;
  rules?: Record<string, 'off' | IssueImpact> | undefined;
  failOn?: IssueImpact | undefined;
  minScore?: number | undefined;
}

// ─── Options passed in from CLI or programmatic API ─────────────────────────

export interface AuditOptions {
  types: AuditCategory[];
  configPath?: string | undefined;
  config?: UiAuditConfig | undefined;
  failOn?: IssueImpact | undefined;
  minScore?: number | undefined;
}

// ─── The full report returned by runAudit() ──────────────────────────────────

export interface AuditReport {
  target: string;           // The path that was audited
  timestamp: string;        // ISO 8601
  overallScore: number;     // Weighted average of category scores
  totalFiles: number;       // How many .tsx/.ts/.jsx/.js files scanned
  config?: UiAuditConfig | undefined;   // Applied configuration
  results: Partial<Record<AuditCategory, AuditResult>>;
}