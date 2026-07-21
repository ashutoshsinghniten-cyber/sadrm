// Build version — bumped on each material change. Shown in the header next to
// the DigiFind logo and in the sidebar footer. Update this when shipping new builds.
export const APP_VERSION = 'v3.13.42';

// =============================================================================
// AI PROVIDER CONFIGURATION
// =============================================================================
export const AI_RUNTIME = {
  baseUrl: (() => {
    try {
      if (typeof import.meta !== 'undefined' && import.meta && import.meta.env) {
        return import.meta.env['VITE_RUNTIME_API_BASE'] || '/api/runtime';
      }
    } catch { /* fall through */ }
    return '/api/runtime';
  })(),
  enabled: (() => {
    try {
      if (typeof import.meta !== 'undefined' && import.meta && import.meta.env) {
        return import.meta.env['VITE_RUNTIME_ENABLED'] !== 'false';
      }
    } catch { /* fall through */ }
    return true;
  })(),
  endpoint(path = '') {
    return `${this.baseUrl}${path}`;
  },
  isConfigured() {
    return this.enabled && !!this.baseUrl;
  }
};

// =============================================================================
// SESSION BILLING CONSTANTS
// =============================================================================
export const BILLING_PRICE_PER_M_INPUT_USD = 3.0;
export const BILLING_PRICE_PER_M_OUTPUT_USD = 15.0;
export const BILLING_MULTIPLIER = 5; // display-side multiplier on USD cost

export const EXTRACTION_TERMINAL = new Set(['done', 'skipped', 'error']);
