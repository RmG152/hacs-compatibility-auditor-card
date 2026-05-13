/**
 * Entry point for HACS Compatibility Auditor Card.
 */
import './hacs-compatibility-auditor-card';
import './editor';

// Register the card with the Lovelace card loader
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: 'hacs-compatibility-auditor-card',
  name: 'HACS Compatibility Auditor',
  description: 'Muestra el estado de compatibilidad de los paquetes HACS instalados',
});
