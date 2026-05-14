import { LitElement, html, css, TemplateResult, CSSResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { CardConfig, LovelaceCardEditor, HomeAssistant } from './types';

@customElement('hacs-compatibility-auditor-card-editor')
export class HacsCompatibilityAuditorCardEditor
  extends LitElement
  implements LovelaceCardEditor
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public lovelace?: any;

  @state() private _config: CardConfig = {
    type: 'custom:hacs-compatibility-auditor-card',
  };

  public setConfig(config: CardConfig): void {
    this._config = { ...config };
  }

  private _valueChanged(ev: Event): void {
    const target = ev.target as HTMLElement;
    if (!target.id) return;

    const key = target.id as keyof CardConfig;
    let value: unknown;

    if (target.tagName === 'HA-SWITCH') {
      value = (target as HTMLInputElement).checked;
    } else if (target.tagName === 'HA-TEXTFIELD') {
      value = (target as HTMLInputElement).value;
    } else {
      return;
    }

    const newConfig = { ...this._config, [key]: value };
    const event = new CustomEvent('config-changed', {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  protected render(): TemplateResult {
    if (!this.hass) return html``;

    return html`
      <div class="card-config">
        <ha-textfield
          id="title"
          label="Título"
          .value=${this._config.title || ''}
          @change=${this._valueChanged}
        ></ha-textfield>

        <ha-formfield label="Mostrar resumen">
          <ha-switch
            id="show_summary"
            .checked=${this._config.show_summary !== false}
            @change=${this._valueChanged}
          ></ha-switch>
        </ha-formfield>

        <ha-formfield label="Mostrar filtros">
          <ha-switch
            id="show_filters"
            .checked=${this._config.show_filters !== false}
            @change=${this._valueChanged}
          ></ha-switch>
        </ha-formfield>

        <ha-formfield label="Mostrar issues">
          <ha-switch
            id="show_issues"
            .checked=${this._config.show_issues !== false}
            @change=${this._valueChanged}
          ></ha-switch>
        </ha-formfield>

        <ha-formfield label="Mostrar razón">
          <ha-switch
            id="show_reason"
            .checked=${this._config.show_reason !== false}
            @change=${this._valueChanged}
          ></ha-switch>
        </ha-formfield>

        <ha-formfield label="Compacto">
          <ha-switch
            id="compact"
            .checked=${this._config.compact === true}
            @change=${this._valueChanged}
          ></ha-switch>
        </ha-formfield>
      </div>
    `;
  }

  static get styles(): CSSResult {
    return css`
      .card-config {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 8px;
      }
    `;
  }
}
