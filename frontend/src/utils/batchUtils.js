import JSZip from 'jszip';
import * as XLSXModule from 'xlsx';
import { PAGE_TYPES, PAGE_TYPE_ORDER, LEGACY_CODE_REMAP, VALID_PAGE_CODES, STRICT_FILENAME_PATTERN } from '../constants/pageTypes.js';

export { PAGE_TYPES, PAGE_TYPE_ORDER, LEGACY_CODE_REMAP };

// ==================== JSZip Loader ====================
export const loadJSZip = () => Promise.resolve(JSZip);

// ==================== SheetJS (xlsx) Loader ====================
export const loadXlsx = () => Promise.resolve(XLSXModule);

// ==================== Batch ID Generator ====================
export const generateBatchId = () => {
  const now = new Date();
  const pad = (value, size = 2) => String(value).padStart(size, '0');
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  const ms = pad(now.getMilliseconds(), 3);
  const randomPart =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replaceAll('-', '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${y}${m}${d}_${hh}${mm}${ss}_${ms}_${randomPart}`;
};

// Extract the trailing numeric suffix from filenames like SACR_CF_00000001.pdf
export const extractFileNumericKey = (filename) => {
  const m = String(filename || '').match(/_(\d+)\.pdf$/i) || String(filename || '').match(/(\d+)\.pdf$/i);
  return m ? parseInt(m[1], 10) : null;
};

// Extract page-type code from a filename like "0000001_CF_0001.pdf" → "CF"
export const parsePageTypeFromFilename = (filename) => {
  const base = filename.split('/').pop().split('\\').pop();
  let m = base.match(/_([A-Z]{2})_\d+\.pdf$/i);
  if (!m) {
    m = base.match(/_([A-Z]{2})\.pdf$/i);
  }
  if (!m) return null;
  const code = m[1].toUpperCase();
  return PAGE_TYPES[code] ? code : null;
};

// Extract record id from filename like "0000001_CF_0001.pdf" → "0000001"
export const parseRecordIdFromFilename = (filename) => {
  const base = filename.split('/').pop().split('\\').pop();
  let m = base.match(/(\d+)_[A-Z]{2}_\d+\.pdf$/i);
  if (!m) {
    m = base.match(/(\d+)_[A-Z]{2}\.pdf$/i);
  }
  return m ? m[1] : null;
};

// Validates a filename against the strict platform rule.
export const validatePdfFilename = (filename) => {
  const base = filename.split('/').pop().split('\\').pop();
  if (!base.toLowerCase().endsWith('.pdf')) {
    return { ok: false, reason: 'Not a PDF file' };
  }
  const m = base.match(STRICT_FILENAME_PATTERN);
  if (!m) {
    return {
      ok: false,
      reason: `Filename "${base}" doesn't match the required pattern NNNNNNN_XX_NNNN.pdf (where XX ∈ ${VALID_PAGE_CODES.join('/')} and NNNN is the per-record occurrence starting at 0001).`
    };
  }
  return {
    ok: true,
    recordId: m[1],
    code: m[2].toUpperCase(),
    occurrence: parseInt(m[3], 10)
  };
};

// Derive a record group key from a file's relative path.
export const deriveRecordGroupKey = (relativePath, filename) => {
  if (relativePath) {
    const segments = relativePath.split('/').filter(Boolean);
    if (segments.length >= 3 && /^BATCH[_\s-]?\d+$/i.test(segments[0])) {
      return segments[1];
    }
    if (segments.length >= 2) {
      return segments[segments.length - 2];
    }
  }
  return parseRecordIdFromFilename(filename);
};

// Infer payment method from the set of page-type codes present.
export const inferPaymentMethod = (pageTypeCodes) => {
  const codes = new Set(pageTypeCodes);
  if (codes.has('CF')) return 'Cheque';
  if (codes.has('RF') || codes.has('RB') || codes.has('SF') || codes.has('SB') || codes.has('VF') || codes.has('VB')) return 'CreditCard';
  return 'Unknown';
};

// Resolve a page-type code defensively from any page object.
export const resolvePageCode = (page) => {
  if (!page) return null;
  if (page.code && page.code !== 'unknown' && PAGE_TYPES[page.code]) return page.code;
  if (page.kind && page.kind !== 'unknown' && PAGE_TYPES[page.kind]) {
    return LEGACY_CODE_REMAP[page.kind] || page.kind;
  }
  if (page.filename || page.name) {
    const fromName = parsePageTypeFromFilename(page.filename || page.name);
    if (fromName) return LEGACY_CODE_REMAP[fromName] || fromName;
  }
  if (page.file || page.filename || page.name) return 'OT';
  return null;
};

// Resolve a human-readable label for a page
export const resolvePageLabel = (page) => {
  const code = resolvePageCode(page);
  if (code) return PAGE_TYPES[code].label;
  if (page?.label && page.label !== 'unknown') return page.label;
  return 'Unclassified';
};

// Build a structured batch from a list of File objects
export const buildBatchFromFiles = (files, defaultBatchId = null) => {
  if (!files || files.length === 0) return null;
  const records = new Map();
  let detectedBatchId = defaultBatchId;

  for (const f of files) {
    const filename = f.name || '';
    if (!filename.toLowerCase().endsWith('.pdf')) continue;

    const relPath = f.webkitRelativePath || f.relativePath || '';
    if (!detectedBatchId && relPath) {
      const parts = relPath.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const batchCandidate = parts[0];
        if (/^BATCH[_\s-]?\d+$/i.test(batchCandidate)) detectedBatchId = batchCandidate;
      }
    }

    const rawPageCode = parsePageTypeFromFilename(filename);
    const pageCode = rawPageCode ? (LEGACY_CODE_REMAP[rawPageCode] || rawPageCode) : null;
    const recordId = parseRecordIdFromFilename(filename);
    if (!pageCode || !recordId) continue;

    if (!records.has(recordId)) {
      records.set(recordId, { recordId, pages: [] });
    }
    records.get(recordId).pages.push({
      code: pageCode,
      label: PAGE_TYPES[pageCode].label,
      file: f,
      filename
    });
  }

  if (records.size === 0) return null;

  const sortedRecords = [...records.values()]
    .sort((a, b) => a.recordId.localeCompare(b.recordId))
    .map(r => {
      r.pages.sort((a, b) => PAGE_TYPE_ORDER.indexOf(a.code) - PAGE_TYPE_ORDER.indexOf(b.code));
      r.pageTypeCodes = r.pages.map(p => p.code);
      r.paymentMethod = inferPaymentMethod(r.pageTypeCodes);
      return r;
    });

  return {
    batchId: detectedBatchId || `BATCH_${Date.now()}`,
    records: sortedRecords,
    totalPages: sortedRecords.reduce((s, r) => s + r.pages.length, 0)
  };
};

// Extract all PDFs from a ZIP file.
export const extractPdfsFromZip = async (zipFile) => {
  const JSZipLib = await loadJSZip();
  if (!JSZipLib) throw new Error('JSZip failed to load');
  const zip = await JSZipLib.loadAsync(zipFile);
  const files = [];
  let rootBatch = null;

  const entries = Object.keys(zip.files);
  for (const path of entries) {
    const entry = zip.files[path];
    if (entry.dir) continue;
    if (path.startsWith('__MACOSX') || path.includes('.DS_Store')) continue;
    if (!path.toLowerCase().endsWith('.pdf')) continue;

    const parts = path.split('/').filter(Boolean);
    if (parts.length >= 2 && /^BATCH[_\s-]?\d+$/i.test(parts[0])) rootBatch = parts[0];

    const baseName = parts[parts.length - 1];
    const uint8array = await entry.async('uint8array');
    const file = new File([uint8array], baseName, { type: 'application/pdf' });
    try {
      Object.defineProperty(file, 'relativePath', { value: path, writable: false, configurable: true });
    } catch (e) { /* ignore */ }
    files.push(file);
  }
  return { files, rootBatch };
};
