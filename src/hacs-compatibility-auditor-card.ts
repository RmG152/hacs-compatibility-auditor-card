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
  LovelaceCardEditor,
} from './types';

@customElement('hacs-compatibility-auditor-card')
export class HacsCompatibilityAuditorCard extends LitElement {
  @property({ attribute: false }) public hass?: any;
  @property({ attribute: false }) public config?: CardConfig;

  @state() private _filterStatus: FilterStatus = 'all';
  @state() private _filterType: FilterType = 'all';
  @state() private _searchQuery: string = '';
  @state() private _expandedPackage: string | null = null;
  @state() private _ignoredPackages: Set<string> = new Set();
  @state() private _reviewedPackages: Set<string> = new Set();

  private _data?: CompatibilityData;

  static getStubConfig(): Record<string, unknown> {
    return {
      show_summary: true,
      show_filters: true,
      show_issues: true,
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

    const domain = 'hacs_compatibility_auditor';
    const incompatibleEntity = this.config?.entity_incompatible
      || `sensor.hca_hacs_incompatible_count`;
    const totalEntity = this.config?.entity_packages_total
      || `sensor.hca_hacs_packages_total`;
    const haVersionEntity = this.config?.entity_ha_version
      || `sensor.hca_ha_version_current`;

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
          repository_url: attrs.repository_url || '',
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
              <ha-icon-button
                .label=${'Forzar comprobación'}
                @click=${this._forceCheck}
              >
                <ha-icon icon="mdi:refresh"></ha-icon>
              </ha-icon-button>
            </div>
          </div>
        </div>

        ${this.config?.show_summary ? this._renderSummary() : ''}
        ${this.config?.show_filters ? this._renderFilters() : ''}
        ${this._renderPackageList(filtered)}
      </ha-card>
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
            ></ha-icon>
          </div>
          <div class="package-info">
            <span class="package-name">${pkg.name}</span>
            <span class="package-repo">${pkg.repository}</span>
          </div>
          <div class="package-meta">
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

  private _renderPackageDetails(pkg: HacsPackageResult, isIgnored: boolean): TemplateResult {
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

        ${this.config?.show_issues && pkg.issues_relevant.length > 0 ? html`
          <div class="issues-section">
            <h4>Issues relevantes (${pkg.issues_relevant.length})</h4>
            <div class="issues-list">
              ${pkg.issues_relevant.map(issue => this._renderIssueItem(issue))}
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

  private _renderIssueItem(issue: GitHubIssue): TemplateResult {
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
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hacs-compatibility-auditor-card': HacsCompatibilityAuditorCard;
  }
}
