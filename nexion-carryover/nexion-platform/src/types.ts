// Shared domain types for the NEXION platform.

export type Severity = "critical" | "major" | "minor";
export type Verdict = "production-ready" | "conditional-go" | "not-ready" | "do-not-deploy";

export interface CheckItem {
  key: string;
  title: string;
  detail: string;
  weight: number; // 1..3, higher = more important
}

export interface CheckCategory {
  category: string;
  items: CheckItem[];
}

export interface CategoryScore {
  category: string;
  got: number;
  max: number;
  pct: number; // 0..1
  missing: CheckItem[];
}

export interface Gap {
  category: string;
  key: string;
  title: string;
  detail: string;
  weight: number;
  severity: Severity;
}

export interface ReadinessResult {
  system: string;
  description?: string;
  score: number; // 0..10, one decimal
  verdict: Verdict;
  verdictLabel: string;
  summary: string;
  categories: CategoryScore[];
  primaryQuestions: { question: string; status: "pass" | "partial" | "fail"; answer: string }[];
  gaps: Gap[];
  generatedAt: string;
}

export interface RepoHealth {
  repo: string;
  defaultBranch: string;
  openIssues: number;
  openPullRequests: number;
  lastCommitAt: string | null;
  lastRelease: string | null;
  ciStatus: "passing" | "failing" | "unknown";
  ciConclusion?: string | null;
  stars?: number;
  source: "github" | "sample";
}

export interface SloStatus {
  service: string;
  availability: number | null; // percentage
  errorRate: number | null;
  openMonitors: number;
  activeIncidents: number;
  source: "datadog" | "sample";
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  source: "database" | "sample";
}
