// === Storage size simulation ===
export const PAGE_PDF_BYTES = 145 * 1024;        // ~145 KB per page PDF (typical scan)
export const RECORD_METADATA_BYTES = 4 * 1024;   // ~4 KB JSON per record

export const computeBucketUsageBytes = (batchesInBucket, archivedInBucket) => {
  let pdfBytes = 0;
  let metaBytes = 0;
  for (const b of batchesInBucket) {
    const pages = b.pages || (b.records || []).reduce((s, r) => s + (r.pages?.length || 0), 0);
    pdfBytes += pages * PAGE_PDF_BYTES;
    metaBytes += (b.records?.length || 0) * RECORD_METADATA_BYTES;
  }
  for (const r of archivedInBucket) {
    metaBytes += RECORD_METADATA_BYTES;
  }
  let recordPdfPages = 0, spPdfPages = 0;
  for (const b of batchesInBucket) {
    for (const r of (b.records || [])) {
      for (const p of (r.pages || [])) {
        if (p.code === 'CF' || p.code === 'CB') recordPdfPages++;
        else spPdfPages++;
      }
    }
  }
  return {
    totalBytes: pdfBytes + metaBytes,
    recordPdfBytes: recordPdfPages * PAGE_PDF_BYTES,
    spPdfBytes: spPdfPages * PAGE_PDF_BYTES,
    metadataBytes: metaBytes
  };
};

export const formatBytes = (bytes) => {
  if (!bytes || bytes < 0) return '0.0 GB';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / (1024 ** 2);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
};
