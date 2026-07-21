// ==================== SADRMP PAGE TYPE TAXONOMY ====================
export const PAGE_TYPES = {
  CF: { code: 'CF', label: 'Check Front',   group: 'Check',  accent: 'bg-blue-600',    hex: '#2563eb' },
  CB: { code: 'CB', label: 'Check Back',    group: 'Check',  accent: 'bg-blue-500',    hex: '#3b82f6' },
  RF: { code: 'RF', label: 'Receipt Front',  group: 'Receipt', accent: 'bg-emerald-600', hex: '#059669' },
  RB: { code: 'RB', label: 'Receipt Back',   group: 'Receipt', accent: 'bg-emerald-500', hex: '#10b981' },
  LF: { code: 'LF', label: 'Letter Front',   group: 'Letter',  accent: 'bg-violet-600',  hex: '#7c3aed' },
  LB: { code: 'LB', label: 'Letter Back',    group: 'Letter',  accent: 'bg-violet-500',  hex: '#8b5cf6' },
  OT: { code: 'OT', label: 'Other',          group: 'Other',   accent: 'bg-slate-500',   hex: '#64748b' },
  // Legacy codes kept for backward-compat with existing archived records — not shown in new classification UI
  SF: { code: 'SF', label: 'Slip Front',     group: 'Receipt', accent: 'bg-emerald-600', hex: '#059669' },
  SB: { code: 'SB', label: 'Slip Back',      group: 'Receipt', accent: 'bg-emerald-500', hex: '#10b981' },
  VF: { code: 'VF', label: 'Voucher Front',  group: 'Receipt', accent: 'bg-emerald-600', hex: '#059669' },
  VB: { code: 'VB', label: 'Voucher Back',   group: 'Receipt', accent: 'bg-emerald-500', hex: '#10b981' },
};

// Canonical page ordering
export const PAGE_TYPE_ORDER = ['CF', 'CB', 'RF', 'RB', 'LF', 'LB', 'OT'];

export const VALID_PAGE_CODES = ['CF', 'CB', 'RF', 'RB', 'LF', 'LB', 'OT', 'SF', 'SB', 'VF', 'VB'];

// VF/VB (Voucher) and SF/SB (Slip) are legacy aliases — remapped to RF/RB at ingest.
export const LEGACY_CODE_REMAP = { VF: 'RF', VB: 'RB', SF: 'RF', SB: 'RB' };

// Strict filename pattern: NNNNNNN_XX_NNNN.pdf
export const STRICT_FILENAME_PATTERN = /^(\d+)_(CF|CB|SF|SB|LF|LB|VF|VB|RF|RB|OT)_(\d+)\.pdf$/i;

export const PAGE_COLORS = [
  { accent: 'bg-purple-500', text: 'text-purple-700', soft: 'bg-purple-50', border: 'border-purple-400', hex: '#a855f7' },
  { accent: 'bg-teal-500', text: 'text-teal-700', soft: 'bg-teal-50', border: 'border-teal-400', hex: '#14b8a6' },
  { accent: 'bg-orange-500', text: 'text-orange-700', soft: 'bg-orange-50', border: 'border-orange-400', hex: '#f97316' },
  { accent: 'bg-pink-500', text: 'text-pink-700', soft: 'bg-pink-50', border: 'border-pink-400', hex: '#ec4899' },
  { accent: 'bg-lime-500', text: 'text-lime-700', soft: 'bg-lime-50', border: 'border-lime-400', hex: '#84cc16' },
  { accent: 'bg-yellow-500', text: 'text-yellow-700', soft: 'bg-yellow-50', border: 'border-yellow-400', hex: '#eab308' }
];
