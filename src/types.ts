/**
 * Type definitions for HACS Compatibility Auditor Card.
 */

export interface HacsPackageResult {
  name: string;
  repository: string;
  type: string;
  installed_version: string;
  latest_version: string;
  compatible_with_current: boolean | null;
  compatible_with_next: boolean | null;
  status: 'compatible' | 'warning' | 'incompatible' | 'unknown' | 'ignored';
  issues_relevant: GitHubIssue[];
  manifest_ha_requirement: string;
  last_checked: string;
  error: string;
  reason: string;
  repository_url?: string;
}

export interface GitHubIssue {
  title: string;
  url: string;
  state: string;
  labels: string[];
  priority: number;
  updated_at: string;
}

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
}

export type FilterStatus = 'all' | 'compatible' | 'warning' | 'incompatible' | 'unknown';
export type FilterType = 'all' | 'integration' | 'plugin' | 'theme' | 'appdaemon' | 'netdaemon' | 'python_script';

export interface CardConfig {
  type: 'custom:hacs-compatibility-auditor-card';
  entity_incompatible?: string;
  entity_packages_total?: string;
  entity_ha_version?: string;
  show_summary?: boolean;
  show_filters?: boolean;
  show_issues?: boolean;
  show_reason?: boolean;
  compact?: boolean;
  title?: string;
}

export interface LovelaceCardEditor {
  hass?: HomeAssistant;
  lovelace?: any;
  setConfig(config: CardConfig): void;
}

export interface HomeAssistant {
  states: Record<string, HomeAssistantState>;
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>
  ): Promise<void>;
}

export interface HomeAssistantState {
  state: string;
  attributes: Record<string, any>;
}
