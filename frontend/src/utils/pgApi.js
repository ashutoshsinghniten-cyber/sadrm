import { dataClient } from '../lib/axiosInstance.js';
import { fileToBase64 } from './pdfUtils.js';

// Kept for App.jsx and storage.js which still use raw fetch and need the token directly.
export const getAuthToken = () => {
  try { return typeof window !== 'undefined' ? window.sessionStorage.getItem('idi.playground.jwt.v1') : null; }
  catch { return null; }
};

export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const mapWithConcurrency = async (items = [], limit = 5, worker) => {
  const list = Array.from(items || []);
  const results = new Array(list.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, list.length || 1) }, async () => {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(list[index], index);
    }
  });
  await Promise.all(workers);
  return results;
};

export async function pgGetAll(resource) {
  try {
    return await dataClient.get(`/${resource}`);
  } catch { return []; }
}

export async function pgGetRecentBatches(limit = 100, offset = 0, status = null) {
  try {
    const params = { limit, offset };
    if (status) params.status = status;
    return await dataClient.get('/batches', { params });
  } catch { return []; }
}

export async function pgGetBatchSummaries(offset = 0, limit = null, status = null) {
  try {
    const params = { summary: '1', offset };
    if (limit !== null) params.limit = limit;
    if (status) params.status = status;
    return await dataClient.get('/batches', { params });
  } catch { return []; }
}

export async function pgGetBatchesByStatusPaged(status, pageSize = 500, maxRows = 5000) {
  const batches = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const page = await pgGetRecentBatches(pageSize, offset, status);
    if (!Array.isArray(page) || page.length === 0) break;
    batches.push(...page);
    if (page.length < pageSize) break;
  }
  return batches;
}

export async function pgGetBatchDetail(batchId) {
  try {
    return await dataClient.get(`/batches/${encodeURIComponent(batchId)}`);
  } catch { return null; }
}

export async function pgLockRecord(batchId, recordId, username) {
  try {
    await dataClient.post(
      `/record-locks/${encodeURIComponent(batchId)}/${encodeURIComponent(recordId)}`,
      { username }
    );
    return { conflict: false };
  } catch (err) {
    if (err.status === 409) {
      return { conflict: true, lockedBy: err.response?.data?.lockedBy };
    }
    return { conflict: false };
  }
}

export async function pgUnlockRecord(batchId, recordId) {
  try {
    await dataClient.delete(
      `/record-locks/${encodeURIComponent(batchId)}/${encodeURIComponent(recordId)}`
    );
  } catch { /* silent */ }
}

export async function pgUploadBatchPage(batchId, recordId, filename, fileBase64) {
  const bytes = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const form = new FormData();
  form.append('batchId', batchId);
  form.append('recordId', recordId);
  if (filename) form.append('filename', filename);
  form.append('file', blob, filename || 'page.pdf');
  try {
    // 'Content-Type': undefined removes the axios default 'application/json' header
    // so the browser can set 'multipart/form-data; boundary=...' automatically.
    return await dataClient.post('/batch-pages', form, {
      headers: { 'Content-Type': undefined },
    });
  } catch (err) {
    throw new Error(
      `S3 page upload failed for batch=${batchId}, record=${recordId}, file=${filename}. ${err.message}`
    );
  }
}

export async function pgFetchBatchPage(batchId, recordId, filename) {
  try {
    return await dataClient.get(
      `/batch-pages/${encodeURIComponent(batchId)}/${encodeURIComponent(recordId)}/${encodeURIComponent(filename)}`
    );
  } catch { return null; }
}

export async function pgFetchBatchPages(batchId, recordId) {
  try {
    return await dataClient.get(
      `/batch-pages/${encodeURIComponent(batchId)}/${encodeURIComponent(recordId)}`
    );
  } catch { return null; }
}

export async function pgGetArchivedRecordsPaged(onPage, pageSize = 100, maxPages = Number.POSITIVE_INFINITY, flaggedOnly = false) {
  const summary = { loaded: 0, total: 0, errors: [] };
  let offset = 0;
  let fetchedPages = 0;

  while (fetchedPages < maxPages) {
    let payload;
    try {
      const params = { offset, limit: pageSize };
      if (flaggedOnly) params.flaggedOnly = true;
      payload = await dataClient.get('/archived-records', { params });
    } catch (err) {
      summary.errors.push({ offset, message: err?.message || 'Failed to fetch archived-record page.' });
      break;
    }

    const records = Array.isArray(payload?.records) ? payload.records : [];
    const total = Number(payload?.total || 0);
    summary.total = total;
    if (records.length > 0) {
      summary.loaded += records.length;
      onPage(records);
    }

    fetchedPages += 1;
    offset += pageSize;
    if (records.length === 0 || offset >= total) break;
  }

  return summary;
}

export async function pgPutAll(resource, items) {
  try {
    await dataClient.put(`/${resource}`, items);
  } catch {}
}

export async function pgDeleteArchivedRecord(archivedId) {
  try {
    return await dataClient.delete(`/archived-records/${encodeURIComponent(archivedId)}`);
  } catch { return null; }
}

// COUNT-only — not capped by the paginated list endpoint's 100/500 page-size limit.
// Used by the Dashboard to show the true archived-record total.
export async function pgGetArchivedRecordsCount(q = null, bank = null) {
  try {
    const params = {};
    if (q) params.q = q;
    if (bank) params.bank = bank;
    const payload = await dataClient.get('/archived-records/count', { params });
    return Number(payload?.count || 0);
  } catch { return 0; }
}

export async function pgToggleArchivedRecordFlag(archivedId, flagged, reason = '') {
  try {
    return await dataClient.patch(
      `/archived-records/${encodeURIComponent(archivedId)}/flag`,
      { flagged, reason }
    );
  } catch { return null; }
}

export async function pgGetFlaggedArchivedRecordsCount() {
  try {
    const payload = await dataClient.get('/archived-records/flagged/count');
    return Number(payload?.count || 0);
  } catch { return 0; }
}

export async function pgGetFlaggedArchivedRecordDetail(archivedId) {
  try {
    return await dataClient.get(`/archived-records/flagged/${encodeURIComponent(archivedId)}`);
  } catch { return null; }
}

export async function pgDeleteFlaggedArchivedRecord(archivedId) {
  try {
    return await dataClient.delete(`/archived-records/flagged/${encodeURIComponent(archivedId)}`);
  } catch { return null; }
}

export const pgPatchBatch = async (batch) => {
  try {
    return await dataClient.patch(`/batches/${encodeURIComponent(batch.id)}`, batch);
  } catch (err) {
    throw new Error(`Batch save failed (${err.status ?? '?'}) for ${batch.id}. ${err.message}`.trim());
  }
};

export const persistBatchDurably = async (batch) => {
  // Phase 5: stripBatchForStorage now returns { stripped, duplicates }.
  const { stripped, duplicates } = await stripBatchForStorage(batch);
  if (duplicates.length > 0) {
    // At least one page was a duplicate — block the whole batch from extraction.
    const first = duplicates[0];
    const msg = duplicates.length === 1
      ? `"${first.filename}" has already been uploaded for this tenant.`
      : `${duplicates.length} files have already been uploaded for this tenant.`;
    return {
      ok: false,
      duplicate: true,
      shouldBlockExtraction: true,
      duplicates,
      message: msg,
      result: null,
    };
  }
  const result = await pgPatchBatch(stripped);
  return { ok: true, duplicate: false, stripped, result };
};

// === Batch serialization ===
export const pageToStorable = async (p) => {
  const { file, fileBase64: existingB64, ...rest } = p;
  let fileBase64 = existingB64 || null;
  if (!fileBase64 && file instanceof Blob) {
    try { fileBase64 = await fileToBase64(file); } catch {}
  }
  return fileBase64 ? { ...rest, file: null, fileBase64 } : { ...rest, file: null };
};

export const pageToStorableLite = ({ file, fileBase64, ...rest }) => ({ ...rest, file: null });

export const stripBatchForStorage = async (batch) => {
  const { stagedFiles: _s, ...batchRest } = batch;
  // Phase 4: Collect all duplicate page results so persistBatchDurably can block the batch.
  const duplicates = [];
  const records = await mapWithConcurrency(batch.records || [], 3, async r => ({
    ...r,
    pages: await mapWithConcurrency(r.pages || [], 3, async p => {
      if (p.pageStored) return pageToStorableLite(p);
      const fname = p.filename || p.name || 'page.pdf';
      if (p.file instanceof Blob || p.fileBase64) {
        let b64 = p.fileBase64;
        if (!b64 && p.file instanceof Blob) b64 = await fileToBase64(p.file);
        if (b64) {
          const uploadResult = await pgUploadBatchPage(batch.id, r.recordId || r.id, fname, b64);
          if (uploadResult?.duplicate === true) {
            // Collect the duplicate info; do NOT mark page as stored.
            duplicates.push({ filename: fname, recordId: r.recordId || r.id, ...uploadResult });
            return pageToStorableLite(p);
          }
          return { ...pageToStorableLite(p), pageStored: true };
        }
      }
      return pageToStorableLite(p);
    }),
  }));
  return { stripped: { ...batchRest, records }, duplicates };
};

export const stripArchivedRecordForStorage = async (rec) => {
  const batchId = rec.batchId || (typeof rec.id === 'string' && rec.id.includes(':') ? rec.id.split(':')[0] : rec.id);
  const recordId = rec.recordId || (typeof rec.id === 'string' && rec.id.includes(':') ? rec.id.split(':').slice(1).join(':') : rec.id);

  const pages = await mapWithConcurrency(rec.pages || [], 5, async (p) => {
    if (!p) return p;
    if (p.pageStored) return pageToStorableLite(p);
    const fname = p.filename || p.name || 'page.pdf';
    if (batchId && recordId && (p.file instanceof Blob || p.fileBase64)) {
      let b64 = p.fileBase64;
      if (!b64 && p.file instanceof Blob) b64 = await fileToBase64(p.file);
      if (b64) {
        await pgUploadBatchPage(batchId, recordId, fname, b64);
        return { ...pageToStorableLite(p), pageStored: true };
      }
    }
    return pageToStorableLite(p);
  });

  return { ...rec, pages };
};

export const restorePage = (p) => {
  if (!p || p.file || !p.fileBase64) return p;
  try {
    const bytes = Uint8Array.from(atob(p.fileBase64), c => c.charCodeAt(0));
    return { ...p, file: new File([bytes], p.filename || 'page.pdf', { type: 'application/pdf' }) };
  } catch { return p; }
};

export const restoreBatch = (batch) => ({
  ...batch,
  records: (batch.records || []).map(r => ({
    ...r,
    pages: (r.pages || []).map(p => {
      if (p.file) return p;
      if (p.fileBase64) return restorePage(p);
      return p;
    }),
  })),
});

export const restoreArchivedRecord = (rec) => ({
  ...rec,
  pages: (rec.pages || []).map(restorePage),
});
