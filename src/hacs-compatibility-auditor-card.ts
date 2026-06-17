/**
 * HACS Compatibility Auditor - Custom Lovelace Card
 *
 * A filterable card that displays HACS package compatibility status
 * with links to repositories and detected issues.
 */

import {
  LitElement,
  html,
  css,
  PropertyValues,
  TemplateResult,
  CSSResult,
} from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  CardConfig,
  CompatibilityData,
  HacsPackageResult,
  FilterStatus,
  FilterType,
  GitHubIssue,
  IssueCategoryResult,
  LovelaceCardEditor,
} from './types';
import type { HomeAssistant } from './types';

@customElement('hacs-compatibility-auditor-card')
export class HacsCompatibilityAuditorCard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public config?: CardConfig;

  @state() private _filterStatus: FilterStatus = 'all';
  @state() private _filterType: FilterType = 'all';
  @state() private _searchQuery: string = '';
  @state() private _expandedPackage: string | null = null;
  @state() private _ignoredPackages: Set<string> = new Set();
  @state() private _reviewedPackages: Set<string> = new Set();
  @state() private _aiAnalyzing = false;
  @state() private _aiAnalyzeAllRunning = false;
  @state() private _packageLoading: Map<string, boolean> = new Map();
  @state() private _packageAiLoading: Map<string, boolean> = new Map();

  private _data?: CompatibilityData;

  static getStubConfig(): Record<string, unknown> {
    return {
      show_summary: true,
      show_filters: true,
      show_issues: true,
      show_reason: true,
      show_ai_indicator: true,
      compact: false,
    };
  }

  public getCardSize(): number {
    if (!this._data) return 2;
    const count = this._getFilteredResults().length;
    return 3 + count * 1.2;
  }

  public static getConfigElement(): LovelaceCardEditor {
    return document.createElement('hacs-compatibility-auditor-card-editor') as unknown as LovelaceCardEditor;
  }

  public getLayoutOptions(): object {
    return {
      grid_columns: 4,
      grid_rows: 'auto',
    };
  }

  public setConfig(config: CardConfig): void {
    if (!config) {
      throw new Error('Invalid configuration');
    }
    this.config = {
      ...config,
      show_summary: config.show_summary ?? true,
      show_filters: config.show_filters ?? true,
      show_issues: config.show_issues ?? true,
      show_reason: config.show_reason ?? true,
      show_ai_indicator: config.show_ai_indicator ?? true,
      compact: config.compact ?? false,
      title: config.title ?? 'HCA',
    };
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    if (changedProps.has('hass') && this.hass) {
      this._updateData();
    }
  }

  private _updateData(): void {
    if (!this.hass) return;

    const incompatibleEntity = this.config?.entity_incompatible || 'sensor.hca_hacs_incompatible_count';
    const totalEntity = this.config?.entity_packages_total || 'sensor.hca_hacs_packages_total';
    const haVersionEntity = this.config?.entity_ha_version || 'sensor.hca_ha_version_current';

    // Collect data from all package sensors
    const results: HacsPackageResult[] = [];
    const allStates = this.hass?.states as Record<string, any> | undefined;

    for (const [entityId, entityState] of Object.entries(allStates ?? {})) {
      if (entityId.startsWith('sensor.hca_package_')) {
        const attrs = entityState.attributes || {};
        results.push({
          name: attrs.name || entityId,
          repository: attrs.repository || '',
          type: attrs.type || 'unknown',
          installed_version: attrs.installed_version || '',
          latest_version: attrs.latest_version || '',
          compatible_with_current: attrs.compatible_with_current,
          compatible_with_next: attrs.compatible_with_next,
          status: entityState.state as HacsPackageResult['status'],
          issues_relevant: attrs.issues_relevant || [],
          manifest_ha_requirement: attrs.manifest_ha_requirement || '',
          last_checked: attrs.last_checked || '',
          error: attrs.error || '',
          reason: attrs.reason || '',
          repository_url: attrs.repository_url || '',
          ai_verdict: attrs.ai_verdict ?? null,
          ai_confidence: attrs.ai_confidence ?? null,
          ai_reasoning: attrs.ai_reasoning || '',
          ai_provider: attrs.ai_provider || '',
          ai_analysis: attrs.ai_analysis ?? null,
          ai_categorizations: attrs.ai_categorizations ?? {},
        });
      }
    }

    // Get global data from summary sensors
    const incompatibleState = this.hass.states[incompatibleEntity];
    const totalState = this.hass.states[totalEntity];
    const haVersionState = this.hass.states[haVersionEntity];

    this._data = {
      ha_current: haVersionState?.state || '',
      ha_next: haVersionState?.attributes?.ha_next || null,
      ha_next_is_rc: haVersionState?.attributes?.is_release_candidate || false,
      packages_total: parseInt(totalState?.state || '0', 10),
      incompatible_count: parseInt(incompatibleState?.state || '0', 10),
      warning_count: incompatibleState?.attributes?.warning_count || 0,
      compatible_count: incompatibleState?.attributes?.compatible_count || 0,
      unknown_count: incompatibleState?.attributes?.unknown_count || 0,
      results,
      last_scan: incompatibleState?.attributes?.last_scan || '',
      scan_in_progress: incompatibleState?.attributes?.scan_in_progress ?? false,
      scan_progress: incompatibleState?.attributes?.scan_progress ?? 0,
      scan_total: incompatibleState?.attributes?.scan_total ?? 0,
      rules_enabled: incompatibleState?.attributes?.rules_enabled ?? false,
      rules_loaded: incompatibleState?.attributes?.rules_loaded ?? false,
    };

    // Load ignored/reviewed from localStorage
    try {
      const stored = localStorage.getItem('hacs_auditor_ignored');
      if (stored) this._ignoredPackages = new Set(JSON.parse(stored));
      const reviewed = localStorage.getItem('hacs_auditor_reviewed');
      if (reviewed) this._reviewedPackages = new Set(JSON.parse(reviewed));
    } catch { /* ignore */ }
  }

  private _getFilteredResults(): HacsPackageResult[] {
    if (!this._data) return [];

    let results = this._data.results;

    // Filter by status
    if (this._filterStatus !== 'all') {
      results = results.filter(r => r.status === this._filterStatus);
    }

    // Filter by type
    if (this._filterType !== 'all') {
      results = results.filter(r => r.type === this._filterType);
    }

    // Filter by search query
    if (this._searchQuery) {
      const query = this._searchQuery.toLowerCase();
      results = results.filter(r =>
        r.name.toLowerCase().includes(query) ||
        r.repository.toLowerCase().includes(query)
      );
    }

    // Sort: incompatible first, then warning, then compatible
    const statusOrder: Record<string, number> = {
      incompatible: 0,
      warning: 1,
      unknown: 2,
      compatible: 3,
      ignored: 4,
    };

    return results.sort((a, b) =>
      (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5)
    );
  }

  private _getStatusIcon(status: string): string {
    switch (status) {
      case 'compatible': return 'mdi:check-circle';
      case 'warning': return 'mdi:alert';
      case 'incompatible': return 'mdi:close-circle';
      case 'ignored': return 'mdi:eye-off';
      default: return 'mdi:help-circle';
    }
  }

  private _getStatusColor(status: string): string {
    switch (status) {
      case 'compatible': return 'var(--success-color, #4caf50)';
      case 'warning': return 'var(--warning-color, #ff9800)';
      case 'incompatible': return 'var(--error-color, #f44336)';
      case 'ignored': return 'var(--disabled-text-color, #9e9e9e)';
      default: return 'var(--state-icon-color, #9e9e9e)';
    }
  }

  private _getAiConfidenceLevel(confidence: number | null): { level: string; color: string } | null {
    if (confidence === null || confidence === undefined) return null;
    if (confidence >= 0.7) return { level: 'high', color: 'var(--success-color, #4caf50)' };
    if (confidence >= 0.4) return { level: 'medium', color: 'var(--warning-color, #ff9800)' };
    return { level: 'low', color: 'var(--error-color, #f44336)' };
  }

  private _getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      integration: 'Integración',
      plugin: 'Tarjeta/Plugin',
      theme: 'Tema',
      appdaemon: 'AppDaemon',
      netdaemon: 'NetDaemon',
      python_script: 'Python Script',
    };
    return labels[type] || type;
  }

  private _togglePackageExpanded(repo: string): void {
    this._expandedPackage = this._expandedPackage === repo ? null : repo;
  }

  private _ignorePackage(repo: string): void {
    this._ignoredPackages.add(repo);
    localStorage.setItem(
      'hacs_auditor_ignored',
      JSON.stringify([...this._ignoredPackages])
    );
    this.requestUpdate();
  }

  private _markReviewed(repo: string): void {
    this._reviewedPackages.add(repo);
    localStorage.setItem(
      'hacs_auditor_reviewed',
      JSON.stringify([...this._reviewedPackages])
    );
    this.requestUpdate();
  }

  private _unignorePackage(repo: string): void {
    this._ignoredPackages.delete(repo);
    localStorage.setItem(
      'hacs_auditor_ignored',
      JSON.stringify([...this._ignoredPackages])
    );
    this.requestUpdate();
  }

  private async _forceCheck(): Promise<void> {
    if (!this.hass) return;
    await this.hass.callService('hacs_compatibility_auditor', 'check_now', {});
  }

  private _openIssueTemplate(repo: string): void {
    const url = `https://github.com/${repo}/issues/new?title=Compatibility+issue+with+Home+Assistant&body=Please+describe+the+compatibility+issue...`;
    window.open(url, '_blank');
  }

  // ── Service Callers ────────────────────────────────────────────────────────

  private async _checkPackage(entityId: string, repository: string): Promise<void> {
    if (!this.hass || !entityId) return;
    this._packageLoading.set(repository, true);
    this.requestUpdate();
    try {
      await this.hass.callService(
        'hacs_compatibility_auditor',
        'check_package',
        { entity_id: entityId },
      );
    } catch (e) {
      console.error('check_package failed:', e);
    } finally {
      this._packageLoading.set(repository, false);
      this.requestUpdate();
    }
  }

  private async _aiAnalyzePackage(entityId: string, repository: string): Promise<void> {
    if (!this.hass || !entityId) return;
    this._packageAiLoading.set(repository, true);
    this.requestUpdate();
    try {
      const result = await this.hass.callService(
        'hacs_compatibility_auditor',
        'ai_analyze_package',
        { entity_id: entityId },
        undefined,
        undefined,
        true,
      );
      if (result === undefined) {
        console.warn('ai_analyze_package: service called, result unavailable');
      } else if (!result.success) {
        console.error('ai_analyze_package failed:', result.error);
      }
    } catch (e) {
      console.error('ai_analyze_package failed:', e);
    } finally {
      this._packageAiLoading.set(repository, false);
      this.requestUpdate();
    }
  }

  private async _aiAnalyzeAll(): Promise<void> {
    if (!this.hass) return;
    this._aiAnalyzeAllRunning = true;
    this.requestUpdate();
    try {
      const result = await this.hass.callService(
        'hacs_compatibility_auditor',
        'ai_analyze_all',
        {},
        undefined,
        undefined,
        true,
      );
      if (result === undefined) {
        console.warn('ai_analyze_all: service called, result unavailable');
      } else if (result.success) {
        console.log(`AI analyzed ${result.analyzed}/${result.total} packages`);
      } else {
        console.error('ai_analyze_all failed:', result.error);
      }
    } catch (e) {
      console.error('ai_analyze_all failed:', e);
    } finally {
      this._aiAnalyzeAllRunning = false;
      this.requestUpdate();
    }
  }

  private async _aiConfirmReport(entityId: string, repository: string, issueNumber?: number): Promise<void> {
    if (!this.hass || !entityId) return;
    try {
      const data: Record<string, unknown> = { entity_id: entityId };
      if (issueNumber) data.issue_number = issueNumber;

      const result = await this.hass.callService(
        'hacs_compatibility_auditor',
        'ai_confirm_report',
        data,
        undefined,
        undefined,
        true,
      );
      if (result === undefined) {
        console.warn('ai_confirm_report: service called, result unavailable');
      } else if (result.success && result.issue_url) {
        window.open(result.issue_url, '_blank');
      } else {
        console.error('ai_confirm_report failed:', result.error);
      }
    } catch (e) {
      console.error('ai_confirm_report failed:', e);
    }
  }

  private async _aiCategorizeIssue(repository: string, issueNumber: number): Promise<void> {
    if (!this.hass) return;
    try {
      const result = await this.hass.callService(
        'hacs_compatibility_auditor',
        'ai_categorize_issue',
        { repository, issue_number: issueNumber },
        undefined,
        undefined,
        true,
      );
      if (result === undefined) {
        console.warn('ai_categorize_issue: service called, result unavailable');
      } else if (!result.success) {
        console.error('ai_categorize_issue failed:', result.error);
      }
    } catch (e) {
      console.error('ai_categorize_issue failed:', e);
    }
  }

  private _getEntityIdForRepository(repository: string): string | null {
    if (!this.hass) return null;
    const slug = repository.replace(/\//g, '_').toLowerCase();
    const entityId = `sensor.hca_package_${slug}`;
    return this.hass.states[entityId] ? entityId : null;
  }

  private _getIssueCategorization(repository: string, issueUrl: string): IssueCategoryResult | null {
    if (!this._data) return null;
    const pkg = this._data.results.find((r) => r.repository === repository);
    if (!pkg?.ai_categorizations) return null;
    const match = issueUrl.match(/\/issues\/(\d+)/);
    if (!match) return null;
    return pkg.ai_categorizations[match[1]] ?? null;
  }

  private _getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      true_positive: 'Verdadero positivo',
      false_positive: 'Falso positivo',
      config_issue: 'Problema de config',
      feature_request: 'Petición de función',
      unrelated: 'Sin relación',
      uncertain: 'Incierto',
    };
    return labels[category] || category;
  }

  private _getRulesReportUrl(repository: string, issueNumber: number, category: string): string {
    const rulesRepo = 'RmG152/hacs-compatibility-auditor';
    const templates: Record<string, string> = {
      false_positive: 'false_positive_report.yml',
      true_positive: 'blacklist_request.yml',
      config_issue: 'bug_report.yml',
      feature_request: 'feature_request.yml',
    };
    const template = templates[category] || '';
    const title = `[${category}] ${repository}#${issueNumber}`;
    const body = `**Repository:** ${repository}\n**Issue #:** ${issueNumber}\n**Category:** ${category}\n\n`;
    const params = new URLSearchParams({ title, body });
    if (template) params.set('template', template);
    return `https://github.com/${rulesRepo}/issues/new?${params.toString()}`;
  }

  protected render(): TemplateResult {
    if (!this._data) {
      return html`
        <ha-card>
          <div class="card-header">
            <h2>${this.config?.title || 'HACS Compatibility Auditor'}</h2>
          </div>
          <div class="card-content">
            <p>Cargando datos de compatibilidad...</p>
          </div>
        </ha-card>
      `;
    }

    const filtered = this._getFilteredResults();

    return html`
      <ha-card>
        <div class="card-header">
          <div class="header-row">
            <h2>${this.config?.title || 'HACS Compatibility Auditor'}</h2>
            <div class="header-actions">
              ${this.config?.show_ai_actions !== false ? html`
                <ha-icon-button
                  .label=${'Analizar todo con IA'}
                  .disabled=${this._aiAnalyzeAllRunning || this._data?.scan_in_progress}
                  @click=${this._aiAnalyzeAll}
                >
                  <ha-icon icon=${this._aiAnalyzeAllRunning ? 'mdi:loading' : 'mdi:robot-outline'}></ha-icon>
                </ha-icon-button>
              ` : ''}
              <ha-icon-button
                .label=${'Forzar comprobación'}
                .disabled=${this._data?.scan_in_progress}
                @click=${this._forceCheck}
              >
                <ha-icon icon="mdi:refresh"></ha-icon>
              </ha-icon-button>
            </div>
          </div>
          ${this._data?.scan_in_progress ? this._renderScanProgress() : ''}
        </div>

        ${this.config?.show_summary ? this._renderSummary() : ''}
        ${this.config?.show_filters ? this._renderFilters() : ''}
        ${this._renderPackageList(filtered)}
      </ha-card>
    `;
  }

  private _renderScanProgress(): TemplateResult {
    const d = this._data!;
    const pct = d.scan_total > 0 ? Math.round((d.scan_progress / d.scan_total) * 100) : 0;
    return html`
      <div class="scan-progress">
        <div class="scan-progress-bar">
          <div class="scan-progress-fill" style="width: ${pct}%"></div>
        </div>
        <span class="scan-progress-text">${d.scan_progress} / ${d.scan_total}</span>
      </div>
    `;
  }

  private _renderSummary(): TemplateResult {
    const d = this._data!;
    return html`
      <div class="summary">
        <div class="summary-item version">
          <span class="summary-label">HA Actual</span>
          <span class="summary-value">${d.ha_current || '—'}</span>
        </div>
        ${d.ha_next ? html`
          <div class="summary-item version">
            <span class="summary-label">HA Próxima${d.ha_next_is_rc ? ' (RC)' : ''}</span>
            <span class="summary-value">${d.ha_next}</span>
          </div>
        ` : ''}
        <div class="summary-item stat">
          <span class="summary-label">Paquetes</span>
          <span class="summary-value">${d.packages_total}</span>
        </div>
        <div class="summary-item stat error">
          <span class="summary-label">Incompatibles</span>
          <span class="summary-value">${d.incompatible_count}</span>
        </div>
        <div class="summary-item stat warning">
          <span class="summary-label">Advertencias</span>
          <span class="summary-value">${d.warning_count}</span>
        </div>
        <div class="summary-item stat ok">
          <span class="summary-label">Compatibles</span>
          <span class="summary-value">${d.compatible_count}</span>
        </div>
      </div>
    `;
  }

  private _renderFilters(): TemplateResult {
    return html`
      <div class="filters">
        <div class="filter-row">
          <div class="filter-group">
            <label>Estado:</label>
            <select
              .value=${this._filterStatus}
              @change=${(e: Event) => {
                this._filterStatus = (e.target as HTMLSelectElement).value as FilterStatus;
              }}
            >
              <option value="all">Todos</option>
              <option value="incompatible">Incompatible</option>
              <option value="warning">Advertencia</option>
              <option value="compatible">Compatible</option>
              <option value="unknown">Desconocido</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Tipo:</label>
            <select
              .value=${this._filterType}
              @change=${(e: Event) => {
                this._filterType = (e.target as HTMLSelectElement).value as FilterType;
              }}
            >
              <option value="all">Todos</option>
              <option value="integration">Integraciones</option>
              <option value="plugin">Tarjetas/Plugins</option>
              <option value="theme">Temas</option>
              <option value="appdaemon">AppDaemon</option>
              <option value="python_script">Python Scripts</option>
            </select>
          </div>
          <div class="filter-group search">
            <ha-textfield
              label="Buscar paquete..."
              .value=${this._searchQuery}
              @input=${(e: Event) => {
                this._searchQuery = (e.target as HTMLInputElement).value;
              }}
              type="search"
            ></ha-textfield>
          </div>
        </div>
      </div>
    `;
  }

  private _renderPackageList(packages: HacsPackageResult[]): TemplateResult {
    if (packages.length === 0) {
      return html`
        <div class="card-content empty">
          <ha-icon icon="mdi:check-all"></ha-icon>
          <p>No se encontraron paquetes con los filtros seleccionados.</p>
        </div>
      `;
    }

    return html`
      <div class="package-list">
        ${packages.map(pkg => this._renderPackageItem(pkg))}
      </div>
    `;
  }

  private _renderPackageItem(pkg: HacsPackageResult): TemplateResult {
    const isExpanded = this._expandedPackage === pkg.repository;
    const isIgnored = this._ignoredPackages.has(pkg.repository);
    const isReviewed = this._reviewedPackages.has(pkg.repository);

    return html`
      <div
        class="package-item ${pkg.status} ${isExpanded ? 'expanded' : ''} ${isIgnored ? 'ignored' : ''}"
        @click=${() => this._togglePackageExpanded(pkg.repository)}
      >
        <div class="package-header">
          <div class="package-status">
            <ha-icon
              icon=${this._getStatusIcon(pkg.status)}
              style="color: ${this._getStatusColor(pkg.status)}"
              title=${this.config?.show_reason && pkg.reason ? pkg.reason : ''}
            ></ha-icon>
          </div>
          <div class="package-info">
            <span class="package-name">${pkg.name}</span>
            <span class="package-repo">${pkg.repository}</span>
          </div>
          <div class="package-meta">
            ${this.config?.show_ai_indicator !== false ? this._renderAiIndicator(pkg) : ''}
            <span class="package-type-badge">${this._getTypeLabel(pkg.type)}</span>
            <span class="package-version">${pkg.installed_version || '—'}</span>
            ${isReviewed ? html`<ha-icon icon="mdi:eye-check" class="reviewed-badge"></ha-icon>` : ''}
          </div>
          <div class="package-expand">
            <ha-icon icon=${isExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}></ha-icon>
          </div>
        </div>

        ${isExpanded ? this._renderPackageDetails(pkg, isIgnored) : ''}
      </div>
    `;
  }

  private _renderAiIndicator(pkg: HacsPackageResult): TemplateResult {
    const aiLevel = this._getAiConfidenceLevel(pkg.ai_confidence);
    if (!aiLevel) {
      return html`
        <span class="ai-indicator ai-none" title="Sin análisis IA">
          <ha-icon icon="mdi:robot-off"></ha-icon>
        </span>
      `;
    }
    const pct = Math.round(pkg.ai_confidence! * 100);
    const label = aiLevel.level === 'high' ? 'Confianza alta'
      : aiLevel.level === 'medium' ? 'Confianza media'
      : 'Confianza baja';
    return html`
      <span class="ai-indicator ai-${aiLevel.level}" title="IA: ${pct}% — ${label}">
        <ha-icon icon="mdi:robot"></ha-icon>
        <span class="ai-dot" style="background: ${aiLevel.color}"></span>
      </span>
    `;
  }

  private _renderPackageDetails(pkg: HacsPackageResult, isIgnored: boolean): TemplateResult {
    const entityId = this._getEntityIdForRepository(pkg.repository);
    const isRefreshing = this._packageLoading.get(pkg.repository) ?? false;
    const isAiLoading = this._packageAiLoading.get(pkg.repository) ?? false;
    const hasAiAnalysis = !!pkg.ai_verdict;
    const showAiActions = this.config?.show_ai_actions !== false;

    return html`
      <div class="package-details" @click=${(e: Event) => e.stopPropagation()}>
        <div class="details-grid">
          <div class="detail-row">
            <span class="detail-label">Versión instalada:</span>
            <span class="detail-value">${pkg.installed_version || '—'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Versión más reciente:</span>
            <span class="detail-value">${pkg.latest_version || '—'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Compatible (actual):</span>
            <span class="detail-value ${pkg.compatible_with_current ? 'ok' : 'error'}">
              ${pkg.compatible_with_current === true ? 'Sí' : pkg.compatible_with_current === false ? 'No' : 'Desconocido'}
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Compatible (siguiente):</span>
            <span class="detail-value ${pkg.compatible_with_next ? 'ok' : pkg.compatible_with_next === false ? 'error' : ''}">
              ${pkg.compatible_with_next === true ? 'Sí' : pkg.compatible_with_next === false ? 'No' : 'Desconocido'}
            </span>
          </div>
          ${this.config?.show_reason && pkg.reason ? html`
            <div class="detail-row reason">
              <span class="detail-label">Razón:</span>
              <span class="detail-value">${pkg.reason}</span>
            </div>
          ` : ''}
          ${pkg.manifest_ha_requirement ? html`
            <div class="detail-row">
              <span class="detail-label">Requisito HA (manifest):</span>
              <span class="detail-value">${pkg.manifest_ha_requirement}</span>
            </div>
          ` : ''}
          ${pkg.error ? html`
            <div class="detail-row">
              <span class="detail-label">Error:</span>
              <span class="detail-value error">${pkg.error}</span>
            </div>
          ` : ''}
          <div class="detail-row">
            <span class="detail-label">Última comprobación:</span>
            <span class="detail-value">${pkg.last_checked || '—'}</span>
          </div>
        </div>

        ${this.config?.show_ai_indicator !== false && pkg.ai_verdict ? html`
          <div class="ai-section">
            <h4>Análisis IA</h4>
            <div class="ai-details">
              <div class="ai-row">
                <span class="detail-label">Veredicto:</span>
                <span class="detail-value ai-verdict-${pkg.ai_verdict}">${pkg.ai_verdict === 'affected' ? 'Afectado' : pkg.ai_verdict === 'not_affected' ? 'No afectado' : 'Incierto'}</span>
              </div>
              <div class="ai-row">
                <span class="detail-label">Confianza:</span>
                <span class="detail-value">${pkg.ai_confidence !== null ? `${Math.round(pkg.ai_confidence * 100)}%` : '—'}</span>
              </div>
              ${pkg.ai_provider ? html`
                <div class="ai-row">
                  <span class="detail-label">Proveedor:</span>
                  <span class="detail-value">${pkg.ai_provider}</span>
                </div>
              ` : ''}
              ${pkg.ai_reasoning ? html`
                <div class="ai-row reasoning">
                  <span class="detail-label">Razonamiento:</span>
                  <span class="detail-value">${pkg.ai_reasoning}</span>
                </div>
              ` : ''}
            </div>
          </div>
        ` : ''}

        ${this.config?.show_issues && pkg.issues_relevant.length > 0 ? html`
          <div class="issues-section">
            <h4>Issues relevantes (${pkg.issues_relevant.length})</h4>
            <div class="issues-list">
              ${pkg.issues_relevant.map(issue => this._renderIssueItem(issue, pkg.repository))}
            </div>
          </div>
        ` : ''}

        <div class="package-actions">
          <a
            href=${pkg.repository_url || `https://github.com/${pkg.repository}`}
            target="_blank"
            rel="noopener noreferrer"
            class="action-button link"
          >
            <ha-icon icon="mdi:github"></ha-icon>
            Repositorio
          </a>

          ${entityId && showAiActions ? html`
            <button
              class="action-button"
              .disabled=${isRefreshing}
              @click=${() => this._checkPackage(entityId, pkg.repository)}
            >
              <ha-icon icon=${isRefreshing ? 'mdi:loading' : 'mdi:refresh'}></ha-icon>
              ${isRefreshing ? 'Comprobando...' : 'Comprobar'}
            </button>
          ` : ''}

          ${entityId && showAiActions ? html`
            <button
              class="action-button ai-button"
              .disabled=${isAiLoading}
              @click=${() => this._aiAnalyzePackage(entityId, pkg.repository)}
            >
              <ha-icon icon=${isAiLoading ? 'mdi:loading' : 'mdi:brain'}></ha-icon>
              ${isAiLoading ? 'Analizando...' : 'Analizar con IA'}
            </button>
          ` : ''}

          ${entityId && hasAiAnalysis && showAiActions ? html`
            <button
              class="action-button ai-confirm"
              @click=${() => this._aiConfirmReport(entityId, pkg.repository)}
            >
              <ha-icon icon="mdi:check-decagram"></ha-icon>
              Confirmar y reportar
            </button>
          ` : ''}

          ${!isIgnored ? html`
            <button
              class="action-button"
              @click=${() => this._ignorePackage(pkg.repository)}
            >
              <ha-icon icon="mdi:eye-off"></ha-icon>
              Ignorar
            </button>
          ` : html`
            <button
              class="action-button"
              @click=${() => this._unignorePackage(pkg.repository)}
            >
              <ha-icon icon="mdi:eye"></ha-icon>
              No ignorar
            </button>
          `}
          <button
            class="action-button"
            @click=${() => this._markReviewed(pkg.repository)}
          >
            <ha-icon icon="mdi:eye-check"></ha-icon>
            Revisado
          </button>
          <button
            class="action-button"
            @click=${() => this._openIssueTemplate(pkg.repository)}
          >
            <ha-icon icon="mdi:message-alert"></ha-icon>
            Reportar issue
          </button>
        </div>
      </div>
    `;
  }

  private _renderIssueItem(issue: GitHubIssue, repository: string): TemplateResult {
    const categorization = this._getIssueCategorization(repository, issue.url);
    const showAiActions = this.config?.show_ai_actions !== false;
    const issueNumberMatch = issue.url.match(/\/issues\/(\d+)/);
    const issueNumber = issueNumberMatch ? parseInt(issueNumberMatch[1], 10) : 0;

    return html`
      <div class="issue-item">
        <div class="issue-header">
          <a href=${issue.url} target="_blank" rel="noopener noreferrer" class="issue-title">
            ${issue.title}
          </a>
          <span class="issue-state ${issue.state}">${issue.state === 'open' ? 'Abierto' : 'Cerrado'}</span>
        </div>
        <div class="issue-labels">
          ${issue.labels.map(label => html`
            <span class="issue-label">${label}</span>
          `)}
        </div>
        ${categorization ? html`
          <div class="issue-ai-category">
            <span class="issue-ai-badge ${categorization.category}">
              ${this._getCategoryLabel(categorization.category)}
            </span>
            <span class="issue-ai-confidence">${Math.round(categorization.confidence * 100)}%</span>
            ${issueNumber > 0 ? html`
              <a
                href=${this._getRulesReportUrl(repository, issueNumber, categorization.category)}
                target="_blank"
                rel="noopener noreferrer"
                class="action-button report-link"
                title="Reportar a rules"
                @click=${(e: Event) => e.stopPropagation()}
              >
                <ha-icon icon="mdi:github"></ha-icon>
                Reportar a rules
              </a>
            ` : ''}
          </div>
        ` : showAiActions ? html`
          <button
            class="action-button issue-categorize"
            @click=${(e: Event) => {
              e.stopPropagation();
              if (issueNumber > 0) this._aiCategorizeIssue(repository, issueNumber);
            }}
          >
            <ha-icon icon="mdi:tag-outline"></ha-icon>
            Categorizar con IA
          </button>
        ` : ''}
      </div>
    `;
  }

  static get styles(): CSSResult {
    return css`
      :host {
        display: block;
      }

      ha-card {
        overflow: hidden;
      }

      .card-header {
        padding: 16px 16px 0;
      }

      .header-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .header-row h2 {
        margin: 0;
        font-size: 1.2em;
        font-weight: 500;
      }

      .header-actions {
        display: flex;
        gap: 4px;
      }

      .summary {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--divider-color);
      }

      .summary-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--card-background-color, #fff);
        min-width: 80px;
        flex: 1;
      }

      .summary-item.version {
        background: var(--primary-color, #03a9f4);
        color: #fff;
      }

      .summary-item.version .summary-value {
        color: #fff;
        font-weight: bold;
      }

      .summary-label {
        font-size: 0.75em;
        opacity: 0.8;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .summary-value {
        font-size: 1.3em;
        font-weight: 600;
      }

      .summary-item.error .summary-value {
        color: var(--error-color, #f44336);
      }

      .summary-item.warning .summary-value {
        color: var(--warning-color, #ff9800);
      }

      .summary-item.ok .summary-value {
        color: var(--success-color, #4caf50);
      }

      .filters {
        padding: 8px 16px;
        border-bottom: 1px solid var(--divider-color);
      }

      .filter-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: flex-end;
      }

      .filter-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .filter-group label {
        font-size: 0.75em;
        opacity: 0.7;
        text-transform: uppercase;
      }

      .filter-group select {
        padding: 6px 8px;
        border: 1px solid var(--divider-color);
        border-radius: 4px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 0.9em;
      }

      .filter-group.search {
        flex: 1;
        min-width: 150px;
      }

      .package-list {
        padding: 8px;
      }

      .package-item {
        border-radius: 8px;
        margin-bottom: 4px;
        cursor: pointer;
        transition: background 0.2s;
        border: 1px solid transparent;
      }

      .package-item:hover {
        background: var(--secondary-background-color, #f5f5f5);
      }

      .package-item.incompatible {
        border-left: 3px solid var(--error-color, #f44336);
      }

      .package-item.warning {
        border-left: 3px solid var(--warning-color, #ff9800);
      }

      .package-item.compatible {
        border-left: 3px solid var(--success-color, #4caf50);
      }

      .package-item.ignored {
        opacity: 0.5;
      }

      .package-header {
        display: flex;
        align-items: center;
        padding: 10px 12px;
        gap: 10px;
      }

      .package-status ha-icon {
        --mdi-icon-size: 22px;
      }

      .package-info {
        flex: 1;
        min-width: 0;
      }

      .package-name {
        display: block;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .package-repo {
        display: block;
        font-size: 0.8em;
        opacity: 0.6;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .package-meta {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .package-type-badge {
        font-size: 0.7em;
        padding: 2px 6px;
        border-radius: 10px;
        background: var(--primary-color, #03a9f4);
        color: #fff;
        text-transform: uppercase;
      }

      .package-version {
        font-size: 0.85em;
        opacity: 0.7;
      }

      .reviewed-badge {
        --mdi-icon-size: 16px;
        color: var(--success-color, #4caf50);
      }

      .package-expand ha-icon {
        --mdi-icon-size: 24px;
        opacity: 0.5;
      }

      .package-details {
        padding: 12px 16px 12px 44px;
        border-top: 1px solid var(--divider-color);
      }

      .details-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 16px;
        margin-bottom: 12px;
      }

      @media (max-width: 600px) {
        .details-grid {
          grid-template-columns: 1fr;
        }
      }

      .detail-row {
        display: flex;
        gap: 4px;
      }

      .detail-label {
        font-size: 0.85em;
        opacity: 0.7;
        white-space: nowrap;
      }

      .detail-value {
        font-size: 0.85em;
        font-weight: 500;
      }

      .detail-value.ok {
        color: var(--success-color, #4caf50);
      }

      .detail-value.error {
        color: var(--error-color, #f44336);
      }

      .detail-row.reason {
        grid-column: 1 / -1;
        background: var(--secondary-background-color, #f5f5f5);
        padding: 6px 8px;
        border-radius: 4px;
        align-items: flex-start;
      }

      .detail-row.reason .detail-label {
        white-space: nowrap;
      }

      .detail-row.reason .detail-value {
        font-style: italic;
        line-height: 1.4;
      }

      .issues-section {
        margin-top: 12px;
        padding-top: 8px;
        border-top: 1px solid var(--divider-color);
      }

      .issues-section h4 {
        margin: 0 0 8px;
        font-size: 0.9em;
        font-weight: 500;
      }

      .issues-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .issue-item {
        padding: 6px 8px;
        border-radius: 4px;
        background: var(--secondary-background-color, #f5f5f5);
      }

      .issue-header {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .issue-title {
        flex: 1;
        font-size: 0.85em;
        color: var(--primary-text-color);
        text-decoration: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .issue-title:hover {
        text-decoration: underline;
      }

      .issue-state {
        font-size: 0.7em;
        padding: 1px 6px;
        border-radius: 10px;
        text-transform: uppercase;
      }

      .issue-state.open {
        background: var(--success-color, #4caf50);
        color: #fff;
      }

      .issue-state.closed {
        background: var(--error-color, #f44336);
        color: #fff;
      }

      .issue-labels {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 4px;
      }

      .issue-label {
        font-size: 0.7em;
        padding: 1px 5px;
        border-radius: 8px;
        background: var(--divider-color, #e0e0e0);
      }

      .package-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }

      .action-button {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        border: 1px solid var(--divider-color);
        border-radius: 4px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 0.85em;
        cursor: pointer;
        text-decoration: none;
        transition: background 0.2s;
      }

      .action-button:hover {
        background: var(--secondary-background-color, #f5f5f5);
      }

      .action-button ha-icon {
        --mdi-icon-size: 16px;
      }

      .action-button.link {
        color: var(--primary-color);
      }

      .empty {
        text-align: center;
        padding: 32px 16px;
        opacity: 0.6;
      }

      .empty ha-icon {
        --mdi-icon-size: 48px;
        color: var(--success-color, #4caf50);
        margin-bottom: 8px;
      }

      .empty p {
        margin: 0;
      }

      .ai-indicator {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        position: relative;
      }

      .ai-indicator ha-icon {
        --mdi-icon-size: 14px;
        opacity: 0.6;
      }

      .ai-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
        flex-shrink: 0;
      }

      .ai-indicator.ai-none ha-icon {
        opacity: 0.25;
      }

      .ai-indicator.ai-none .ai-dot {
        display: none;
      }

      .ai-section {
        margin-top: 12px;
        padding-top: 8px;
        border-top: 1px solid var(--divider-color);
      }

      .ai-section h4 {
        margin: 0 0 8px;
        font-size: 0.9em;
        font-weight: 500;
      }

      .ai-details {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .ai-row {
        display: flex;
        gap: 4px;
        align-items: flex-start;
      }

      .ai-row .detail-label {
        white-space: nowrap;
      }

      .ai-row.reasoning {
        background: var(--secondary-background-color, #f5f5f5);
        padding: 6px 8px;
        border-radius: 4px;
        flex-direction: column;
        gap: 4px;
      }

      .ai-row.reasoning .detail-value {
        font-style: italic;
        line-height: 1.4;
        font-size: 0.85em;
      }

      .ai-verdict-affected {
        color: var(--error-color, #f44336);
        font-weight: 600;
      }

      .ai-verdict-not_affected {
        color: var(--success-color, #4caf50);
        font-weight: 600;
      }

      .ai-verdict-uncertain {
        color: var(--warning-color, #ff9800);
        font-weight: 600;
      }

      /* ── Scan Progress ──────────────────────────────────────────────────── */

      .scan-progress {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
      }

      .scan-progress-bar {
        flex: 1;
        height: 4px;
        background: var(--divider-color);
        border-radius: 2px;
        overflow: hidden;
      }

      .scan-progress-fill {
        height: 100%;
        background: var(--primary-color, #03a9f4);
        border-radius: 2px;
        transition: width 0.3s ease;
      }

      .scan-progress-text {
        font-size: 0.75em;
        opacity: 0.7;
        white-space: nowrap;
      }

      /* ── AI Action Buttons ──────────────────────────────────────────────── */

      .action-button.ai-button {
        color: var(--primary-color, #03a9f4);
        border-color: var(--primary-color, #03a9f4);
      }

      .action-button.ai-button:hover {
        background: rgba(3, 169, 244, 0.08);
      }

      .action-button.ai-confirm {
        color: var(--success-color, #4caf50);
        border-color: var(--success-color, #4caf50);
      }

      .action-button.ai-confirm:hover {
        background: rgba(76, 175, 80, 0.08);
      }

      .action-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* ── Spin animation for loading icons ───────────────────────────────── */

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      ha-icon[icon="mdi:loading"] {
        animation: spin 1s linear infinite;
      }

      /* ── Issue AI Category ──────────────────────────────────────────────── */

      .issue-ai-category {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 4px;
      }

      .issue-ai-badge {
        font-size: 0.7em;
        padding: 2px 8px;
        border-radius: 10px;
        font-weight: 500;
      }

      .issue-ai-badge.true_positive {
        background: rgba(244, 67, 54, 0.15);
        color: var(--error-color, #f44336);
      }

      .issue-ai-badge.false_positive {
        background: rgba(76, 175, 80, 0.15);
        color: var(--success-color, #4caf50);
      }

      .issue-ai-badge.config_issue {
        background: rgba(255, 152, 0, 0.15);
        color: var(--warning-color, #ff9800);
      }

      .issue-ai-badge.feature_request {
        background: rgba(3, 169, 244, 0.15);
        color: var(--primary-color, #03a9f4);
      }

      .issue-ai-badge.unrelated {
        background: var(--divider-color);
        color: var(--secondary-text-color);
      }

      .issue-ai-badge.uncertain {
        background: rgba(255, 152, 0, 0.1);
        color: var(--warning-color, #ff9800);
      }

      .issue-ai-confidence {
        font-size: 0.7em;
        opacity: 0.6;
      }

      .issue-categorize {
        margin-top: 4px;
        font-size: 0.75em;
        padding: 2px 8px;
      }

      .report-link {
        margin-left: auto;
        font-size: 0.7em;
        padding: 2px 8px;
        color: var(--primary-color, #03a9f4);
        border-color: var(--primary-color, #03a9f4);
      }

      .report-link:hover {
        background: rgba(3, 169, 244, 0.08);
      }

      .issue-ai-category {
        flex-wrap: wrap;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hacs-compatibility-auditor-card': HacsCompatibilityAuditorCard;
  }
}
