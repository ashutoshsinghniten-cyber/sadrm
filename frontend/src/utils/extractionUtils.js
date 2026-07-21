import { loadXlsx } from './batchUtils.js';
import { resolvePageCode, resolvePageLabel } from './batchUtils.js';
import { getQcDestination, getQcReason } from './qcUtils.js';
import { Upload, FileText, Cpu, Database, ShieldCheck, Gauge, Send } from 'lucide-react';

export const PIPELINE_STEPS = [
  { name: 'Document Ingestion', desc: 'Multi-page PDF intake · page segmentation & deskew', icon: Upload },
  { name: 'Page Rendering', desc: 'Pages rasterised at 300dpi for extraction & HITL overlay', icon: FileText },
  { name: 'OCR Extraction', desc: 'Text + handwriting regions', icon: Cpu },
  { name: 'Field Classification', desc: 'Donor, amount, date, check #, signature, bank extraction', icon: Database },
  { name: 'Cross-Validation', desc: 'Field values reconciled across all pages · matches and conflicts flagged', icon: ShieldCheck },
  { name: 'Confidence Scoring', desc: 'Per-field confidence bands · Match & Mismatch flags', icon: Gauge },
  { name: 'Routing to HITL', desc: 'Batch handed off to human reviewer queue', icon: Send }
];

export const WORKFLOW_STAGE_CONFIG = {
  'extraction':   { label: 'AI Extraction',  route: 'extraction', tone: 'bg-blue-100 text-blue-800 ring-blue-200',         icon: Cpu },
  'hitl-review':  { label: 'HITL Review',    route: 'hitl',       tone: 'bg-emerald-100 text-emerald-800 ring-emerald-200', icon: Database },
  'qc-pending':   { label: 'QC Approval',    route: 'qc',         tone: 'bg-amber-100 text-amber-800 ring-amber-200',       icon: ShieldCheck },
  'archived':     { label: 'Archived',       route: 'repository', tone: 'bg-slate-100 text-slate-700 ring-slate-200',       icon: Upload }
};

export const formatDuration = (ms) => {
  if (!ms || ms < 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

export const makeFreshJob = (batch) => ({
  started: false,
  running: false,
  paused: false,
  done: false,
  elapsedMs: 0,
  lastTickAt: null,
  startedAt: null,
  currentStep: 0,
  stepProgress: 0,
  logs: [],
  totalFiles: batch.files,
  totalPages: batch.pages,
  filesDone: 0,
  pagesDone: 0,
  fieldsExtracted: 0,
  avgConfidence: (() => {
    const seed = (batch.id || '').split('').reduce((s, c) => s + c.charCodeAt(0), 0);
    return 86 + (seed % 9);
  })()
});

export const flattenExtractedRecord = (extracted) => {
  const donor = extracted?.donor || {};
  const donation = extracted?.donation || {};
  const donorConf = extracted?.donorConf || {};
  const donationConf = extracted?.donationConf || {};
  return {
    fields: {
      donorName: donor.name || '',
      donorAddress: donor.address || '',
      donorType: donor.type || '',
      donorId: donor.donorId || '',
      amount: donation.amount || '',
      date: donation.date || '',
      chequeNo: donation.chequeNo || '',
      amountWords: donation.amountWords || '',
      cardLast4: donation.cardLast4 || '',
      cardExpiry: donation.cardExpiry || '',
      cardType: donation.cardType || '',
      authCode: donation.authCode || '',
      invoiceNo: donation.invoiceNo || '',
      grantId: donation.grantId || '',
      fundName: donation.fundName || '',
      actualDonor: donation.actualDonor || '',
      purpose: donation.purpose || '',
      payee: donation.payee || ''
    },
    fieldsConf: {
      donorName: donorConf.name || 0,
      donorAddress: donorConf.address || 0,
      donorType: donorConf.type || 0,
      donorId: donorConf.donorId || 0,
      amount: donationConf.amount || 0,
      date: donationConf.date || 0,
      chequeNo: donationConf.chequeNo || 0,
      amountWords: donationConf.amountWords || 0,
      cardLast4: donationConf.cardLast4 || 0,
      cardExpiry: donationConf.cardExpiry || 0,
      cardType: donationConf.cardType || 0,
      authCode: donationConf.authCode || 0,
      invoiceNo: donationConf.invoiceNo || 0,
      grantId: donationConf.grantId || 0,
      fundName: donationConf.fundName || 0,
      actualDonor: donationConf.actualDonor || 0,
      purpose: donationConf.purpose || 0,
      payee: donationConf.payee || 0
    }
  };
};

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const buildBatchExportPayload = (batch, archivedRecords = []) => {
  if (!batch) return null;
  const records = batch.records || [];
  const archivedById = new Map((archivedRecords || []).filter(r => r.batchId === batch.id).map(r => [r.id, r]));
  const exportRecords = records.map(r => {
    const archived = archivedById.get(r.id);
    const source = archived || r;
    const lockedFields = source.hitlReview?.lockedFields;
    const canonical = (lockedFields && Object.keys(lockedFields).length > 0)
      ? lockedFields
      : (source.fields || flattenExtractedRecord(source.extractedRecord).fields || {});
    return {
      recordId: source.recordId || source.id,
      paymentMethod: source.paymentMethod || 'Unknown',
      stage: archived ? 'archived' : (source.qcReview?.status || (source.hitlReview ? 'hitl-reviewed' : (source.extractionStatus === 'done' ? 'extracted' : 'pending'))),
      fields: canonical,
      aiFields: source.fields || flattenExtractedRecord(source.extractedRecord).fields || {},
      aiConfidences: source.fieldsConf || {},
      hitlReview: source.hitlReview || null,
      qcReview: source.qcReview || null,
      pages: (source.pages || []).map(p => ({
        code: resolvePageCode(p) || p.code,
        label: resolvePageLabel(p),
        filename: p.filename
      })),
      archivedAt: archived?.archivedAt || null
    };
  });
  return {
    schemaVersion: '1.0',
    exportedAt: new Date().toISOString(),
    batch: {
      id: batch.id,
      uploaded: batch.uploaded,
      uploader: batch.uploader,
      status: batch.status,
      bucketId: batch.bucketId,
      priority: batch.priority,
      hitlTeam: batch.hitlTeam,
      recordCount: records.length,
      pageCount: batch.pages || records.reduce((s, r) => s + (r.pages?.length || 0), 0)
    },
    records: exportRecords
  };
};

export const exportBatchAsJson = (batch, archivedRecords = []) => {
  const payload = buildBatchExportPayload(batch, archivedRecords);
  if (!payload) return;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${batch.id}.json`);
};

export const exportBatchAsXlsx = async (batch, archivedRecords = []) => {
  const payload = buildBatchExportPayload(batch, archivedRecords);
  if (!payload) return;
  const XLSX = await loadXlsx();
  if (!XLSX) { alert('Could not load XLSX library.'); return; }
  const wb = XLSX.utils.book_new();
  const batchSheetRows = [{
    'Batch ID': payload.batch.id, 'Uploaded': payload.batch.uploaded || '',
    'Uploader': payload.batch.uploader || '', 'Status': payload.batch.status || '',
    'Bucket': payload.batch.bucketId || '', 'Priority': payload.batch.priority || '',
    'HITL Team': payload.batch.hitlTeam || '', 'Record Count': payload.batch.recordCount,
    'Page Count': payload.batch.pageCount, 'Exported At': payload.exportedAt
  }];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(batchSheetRows), 'Batch');
  const recordRows = payload.records.map(r => {
    const f = r.fields || {};
    return {
      'Record ID': r.recordId, 'Stage': r.stage, 'Payment Method': r.paymentMethod,
      'Donor ID': f.donorId || '', 'Donor Name': f.donorName || '',
      'Donor Address': f.donorAddress || '', 'Donor Type': f.donorType || '',
      'Amount': f.amount || '', 'Donation Date': f.date || '',
      'Check Number': f.chequeNo || '', 'Amount in Words': f.amountWords || '',
      'Card Last 4': f.cardLast4 || '', 'Card Expiry': f.cardExpiry || '',
      'Card Type': f.cardType || '', 'Auth Code': f.authCode || '',
      'Actual Donor (DAF)': f.actualDonor || '', 'Fund Name': f.fundName || '',
      'Grant ID': f.grantId || '', 'Invoice / Voucher #': f.invoiceNo || '',
      'Purpose': f.purpose || '', 'Payee': f.payee || '',
      'Pages': r.pages.map(p => p.code).join(', '),
      'HITL Status': r.hitlReview?.status || '', 'HITL Reviewer': r.hitlReview?.reviewer || '',
      'HITL Reviewed At': r.hitlReview?.reviewedAt || '',
      'HITL Edits Count': Object.keys(r.hitlReview?.edits || {}).length,
      'NCV Fields': (r.hitlReview?.ncvFields || []).join(', '),
      'QC Status': r.qcReview?.status || '', 'QC Reviewer': r.qcReview?.reviewer || '',
      'QC Reviewed At': r.qcReview?.reviewedAt || '',
      'QC Destination': getQcDestination(r.qcReview) || '',
      'QC Reason': getQcReason(r.qcReview), 'Archived At': r.archivedAt || ''
    };
  });
  const recordsSheet = XLSX.utils.json_to_sheet(recordRows.length > 0 ? recordRows : [{ 'Record ID': '— no records —' }]);
  const cols = Object.keys(recordRows[0] || { '_': '' }).map(k => ({ wch: Math.max(k.length + 2, 14) }));
  recordsSheet['!cols'] = cols;
  XLSX.utils.book_append_sheet(wb, recordsSheet, 'Records');
  XLSX.writeFile(wb, `${batch.id}.xlsx`);
};
