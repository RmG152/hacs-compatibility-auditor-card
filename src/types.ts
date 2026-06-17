/**
 * Type definitions for HACS Compatibility Auditor Card.
 */

// ── Enums ────────────────────────────────────────────────────────────────────

export type PackageStatus = "compatible" | "warning" | "incompatible" | "unknown" | "ignored";

export type PackageType = "integration" | "plugin" | "theme" | "appdaemon" | "netdaemon" | "python_script";

export type AIVerdict = "affected" | "not_affected" | "uncertain";

export type AICategory =
  | "true_positive"
  | "false_positive"
  | "config_issue"
  | "feature_request"
  | "unrelated"
  | "uncertain";

export type AIAction = "add_false_positive" | "report_incompatibility";

export type IssueTemplate = "false_positive_report.yml" | "blacklist_request.yml";

export type FilterStatus = "all" | PackageStatus;
export type FilterType = "all" | PackageType;

// ── Core Data ────────────────────────────────────────────────────────────────

export interface GitHubIssue {
  title: string;
  url: string;
  state: string;
  labels: string[];
  priority: number;
  updated_at: string;
}

export interface AIAnalysisResult {
  verdict: AIVerdict | null;
  reasoning: string;
  confidence: number;
  provider_used: string;
  error: string;
}

export interface IssueCategoryResult {
  category: AICategory;
  confidence: number;
  reasoning: string;
  provider_used: string;
  error: string;
}

// ── Package Result (from sensor attributes) ──────────────────────────────────

export interface HacsPackageResult {
  name: string;
  repository: string;
  type: string;
  installed_version: string;
  latest_version: string;
  compatible_with_current: boolean | null;
  compatible_with_next: boolean | null;
  status: PackageStatus;
  issues_relevant: GitHubIssue[];
  manifest_ha_requirement: string;
  last_checked: string;
  error: string;
  reason: string;
  repository_url?: string;
  ai_verdict: AIVerdict | null;
  ai_confidence: number | null;
  ai_reasoning: string;
  ai_provider: string;
  ai_analysis: AIAnalysisResult | null;
  ai_categorizations: Record<string, IssueCategoryResult>;
}

// ── Global Data ──────────────────────────────────────────────────────────────

export interface CompatibilityData {
  ha_current: string;
  ha_next: string | null;
  ha_next_is_rc: boolean;
  packages_total: number;
  incompatible_count: number;
  warning_count: number;
  compatible_count: number;
  unknown_count: number;
  results: HacsPackageResult[];
  last_scan: string;
  scan_in_progress: boolean;
  scan_progress: number;
  scan_total: number;
  rules_enabled: boolean;
  rules_loaded: boolean;
}

// ── Card Config ──────────────────────────────────────────────────────────────

export interface CardConfig {
  type: "custom:hacs-compatibility-auditor-card";
  entity_incompatible?: string;
  entity_packages_total?: string;
  entity_ha_version?: string;
  show_summary?: boolean;
  show_filters?: boolean;
  show_issues?: boolean;
  show_reason?: boolean;
  show_ai_indicator?: boolean;
  show_ai_actions?: boolean;
  compact?: boolean;
  title?: string;
}

// ── HA Types ─────────────────────────────────────────────────────────────────

export interface HomeAssistantState {
  state: string;
  attributes: Record<string, any>;
}

export interface HomeAssistant {
  states: Record<string, HomeAssistantState>;
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
    notifyOnError?: boolean,
    returnResponse?: boolean,
  ): Promise<any>;
  callApi(
    method: string,
    path: string,
    data?: Record<string, unknown>,
  ): Promise<any>;
}

export interface LovelaceCardEditor {
  hass?: HomeAssistant;
  lovelace?: any;
  setConfig(config: CardConfig): void;
}
