import React, { useState, useMemo, useRef } from 'react';
import {
  Upload, X, FileText, FolderOpen, Plus, Trash2, AlertTriangle,
  AlertCircle, Sparkles, Check, CheckCircle2, Zap, ClipboardCheck, ShieldCheck,
  Send, RefreshCw, Cloud, Settings, Inbox, Sliders
} from 'lucide-react';
import { PageHeader } from '../../components/shared/PageHeader.jsx';
import Button from '../../components/shared/Button.jsx';
import {
  countPdfPages, fileToBase64
} from '../../utils/pdfUtils.js';
import {
  parsePageTypeFromFilename, LEGACY_CODE_REMAP, generateBatchId,
  extractPdfsFromZip, validatePdfFilename, deriveRecordGroupKey,
  inferPaymentMethod, PAGE_TYPES, PAGE_TYPE_ORDER
} from '../../utils/batchUtils.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function ImportScreen({ batches, addBatch, setRoute, buckets, setBuckets, activeBucketId, setActiveBucketId }) {
  const { auth } = useAuth();
  const [dragOver, setDragOver] = useState(false);
  const [stagedFiles, setStagedFiles] = useState([]);
  const [mergePrompt, setMergePrompt] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [queueError, setQueueError] = useState(null);
  const [defaultBatchId, setDefaultBatchId] = useState('');
  const [customBatchId, setCustomBatchId] = useState('');
  const [priority, setPriority] = useState('Low');
  const [hitlTeam, setHitlTeam] = useState('Default Queue');
  const [uploadExpanded, setUploadExpanded] = useState(() => batches.length === 0);

  const activeBucket = buckets.find(b => b.id === activeBucketId) || buckets[0];

  const classifyFile = (filename) => {
    const code = parsePageTypeFromFilename(filename);
    if (!code) return 'unknown';
    return LEGACY_CODE_REMAP[code] || code;
  };

  const ingestFileList = async (fileList) => {
    const allFiles = Array.from(fileList);
    const zipFiles = allFiles.filter(f => f.name.toLowerCase().endsWith('.zip'));
    const directPdfs = allFiles.filter(f => f.name.toLowerCase().endsWith('.pdf'));
    const extractedFromZips = [];
    let detectedBatchFromZip = null;
    for (const zf of zipFiles) {
      try {
        const { files: extracted, rootBatch } = await extractPdfsFromZip(zf);
        if (rootBatch && !detectedBatchFromZip) detectedBatchFromZip = rootBatch;
        extractedFromZips.push(...extracted);
      } catch (err) { console.error('ZIP extraction failed for', zf.name, err); }
    }
    const pdfs = [...directPdfs, ...extractedFromZips];
    setUploadProgress({ done: 0, total: pdfs.length });
    const results = [];
    for (let i = 0; i < pdfs.length; i++) {
      const f = pdfs[i];
      const kind = classifyFile(f.name);
      const pages = await countPdfPages(f);
      const relativePath = f.webkitRelativePath || f.relativePath || '';
      const recordId = deriveRecordGroupKey(relativePath, f.name);
      const filenameCheck = validatePdfFilename(f.name);
      const violations = [];
      if (!filenameCheck.ok) violations.push(filenameCheck.reason);
      if (pages > 1) violations.push(`PDF has ${pages} pages — only single-page PDFs are accepted.`);
      if (pages === 0) violations.push('PDF appears to be empty (0 pages).');
      results.push({ id: `${Date.now()}-${i}-${f.name}`, name: f.name, kind, pages, file: f, recordId, relativePath, violations });
      setUploadProgress({ done: i + 1, total: pdfs.length });
    }
    setUploadProgress(null);
    return { staged: results, detectedBatchFromZip };
  };

  const collectFilesFromDataTransfer = async (dataTransfer) => {
    const items = Array.from(dataTransfer.items || []);
    const collected = [];
    const walkEntry = async (entry, prefix) => {
      if (!entry) return;
      if (entry.isFile) {
        await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(), 5000);
          entry.file((file) => {
            clearTimeout(timer);
            try { Object.defineProperty(file, 'relativePath', { value: `${prefix}${file.name}`, writable: false, configurable: true }); } catch {}
            collected.push(file);
            resolve();
          }, () => { clearTimeout(timer); resolve(); });
        });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readAll = () => new Promise((resolve) => {
          const all = [];
          const readBatch = () => { reader.readEntries((batch) => { if (!batch || !batch.length) { resolve(all); return; } all.push(...batch); readBatch(); }, () => resolve(all)); };
          readBatch();
        });
        const children = await readAll();
        for (const c of children) await walkEntry(c, `${prefix}${entry.name}/`);
      }
    };
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry?.();
      if (!entry) { const f = item.getAsFile?.(); if (f) collected.push(f); continue; }
      await walkEntry(entry, '');
    }
    return collected;
  };

  const handleFileSelection = async (fileList) => {
    const { staged: incoming } = await ingestFileList(fileList);
    if (incoming.length === 0) return;
    if (stagedFiles.length === 0) {
      setStagedFiles(incoming);
      const initialId = generateBatchId();
      setDefaultBatchId(initialId);
      setCustomBatchId(initialId);
    } else {
      setMergePrompt({ incoming });
    }
  };

  const removeStagedFile = (id) => { setStagedFiles(prev => prev.filter(f => f.id !== id)); setQueueError(null); };
  const clearStaged = () => { setStagedFiles([]); setDefaultBatchId(''); setCustomBatchId(''); setPriority('Low'); setHitlTeam('Default Queue'); setQueueError(null); };

  const stagedRecords = useMemo(() => {
    const byRecord = new Map();
    for (const f of stagedFiles) {
      if (f.violations && f.violations.length > 0) continue;
      if (!f.recordId) continue;
      if (!byRecord.has(f.recordId)) byRecord.set(f.recordId, { recordId: f.recordId, pages: [] });
      byRecord.get(f.recordId).pages.push(f);
    }
    return [...byRecord.values()].sort((a, b) => a.recordId.localeCompare(b.recordId)).map(r => {
      r.pages.sort((a, b) => PAGE_TYPE_ORDER.indexOf(a.kind) - PAGE_TYPE_ORDER.indexOf(b.kind));
      r.pageTypeCodes = r.pages.map(p => p.kind).filter(k => k !== 'unknown');
      r.paymentMethod = inferPaymentMethod(r.pageTypeCodes);
      return r;
    });
  }, [stagedFiles]);

  const recordCount = stagedRecords.length;
  const fileCount = stagedFiles.length;
  const validPageCount = stagedFiles.filter(f => !f.violations || f.violations.length === 0).length;
  const pageCount = validPageCount;
  const invalidStagedItems = stagedFiles.filter(f => f.violations && f.violations.length > 0);
  const violationCount = invalidStagedItems.length;

  const processBatch = async () => {
    if (recordCount === 0 || violationCount > 0) return;
    setQueueError(null);
    const batchId = customBatchId.trim() || generateBatchId();
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const uploadedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const records = stagedRecords.map(sr => ({
      id: sr.recordId, recordId: sr.recordId, paymentMethod: 'Unknown', pageTypeCodes: [...sr.pageTypeCodes],
      pages: sr.pages.map(p => {
        const rawCode = (p.kind && p.kind !== 'unknown' && PAGE_TYPES[p.kind]) ? p.kind : (parsePageTypeFromFilename(p.name) || p.kind || 'OT');
        const recoveredCode = LEGACY_CODE_REMAP[rawCode] || rawCode;
        return { code: recoveredCode, label: PAGE_TYPES[recoveredCode]?.label || recoveredCode, file: p.file, filename: p.name, pages: p.pages || 1 };
      }),
      extractionStatus: 'pending', extractedRecord: null
    }));
    const newBatch = { id: batchId, uploaded: uploadedAt, uploader: auth?.username || 'unknown', recordCount: records.length, files: fileCount, pages: pageCount, status: 'extraction', progress: 0, priority, hitlTeam, bucketId: activeBucket?.id || null, records, stagedFiles: [...stagedFiles] };
    try {
      setUploadProgress({ done: 0, total: Math.max(1, pageCount) });
      const savedBatch = await addBatch(newBatch);
      setUploadProgress({ done: Math.max(1, pageCount), total: Math.max(1, pageCount) });
      if (savedBatch == null) {
        // Duplicate detected — addBatch blocked the batch (it is NOT in state and will NOT
        // reach AI Extraction). Show a persistent error so the operator knows why.
        setQueueError('Duplicate file detected — one or more files in this batch have already been uploaded for this tenant. The batch was not sent to AI Extraction.');
        return;
      }
      clearStaged();
      setUploadExpanded(false);
    } catch (err) {
      console.error('Queue for extraction failed:', err);
      setQueueError(err?.message || 'Batch could not be saved. Staged files were kept so no work is lost.');
    } finally { setUploadProgress(null); }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div>
        <PageHeader title="Import Batches" eyebrow="WORKSPACE" description="Upload Donation Record Batches for Processing" />

        {/* Active bucket strip */}
        <div className="mb-4 bg-white  border border-slate-200 p-3 shadow-sm flex items-center gap-3">
          <div className={`w-9 h-9  ${activeBucket ? `bg-gradient-to-br ${activeBucket.tone}` : 'bg-slate-200'} flex items-center justify-center shadow-sm flex-shrink-0`}><Cloud size={15} className={activeBucket ? 'text-white' : 'text-slate-500'} /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Import Target</span>
              {activeBucket ? <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-800  ring-1 ring-emerald-200">CONNECTED</span> : <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600  ring-1 ring-slate-200">LOCAL ONLY</span>}
            </div>
            {activeBucket ? <div className="font-mono text-[11px] text-slate-700 truncate">s3://{activeBucket.name}/{activeBucket.prefix} <span className="text-slate-400">· {activeBucket.regionLabel}</span></div> : <div className="text-[11px] text-slate-500">No S3 bucket configured · uploads stay local. <button onClick={() => setRoute('integrations')} className="text-blue-700 font-semibold hover:text-blue-900">Configure in Integrations →</button></div>}
          </div>
          {buckets.length > 1 && <select value={activeBucketId || ''} onChange={(e) => setActiveBucketId(e.target.value)} className="text-[11px] font-mono px-2 py-1.5 border border-slate-300  bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 max-w-[200px]">{buckets.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}</select>}
          <button onClick={() => setRoute('integrations')} className="text-[11px] font-semibold text-slate-600 hover:text-blue-800 hover:bg-slate-50 px-2.5 py-1.5 border border-slate-300  flex items-center gap-1 flex-shrink-0"><Settings size={11} />Configure</button>
        </div>

        {/* Upload area */}
        {(uploadExpanded || stagedFiles.length > 0) ? (
          <div className="bg-white  border border-slate-200 p-8 mb-4 shadow-sm relative">
            {batches.length > 0 && stagedFiles.length === 0 && <button onClick={() => setUploadExpanded(false)} className="absolute top-3 right-3 text-[11px] text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-2 py-1  flex items-center gap-1"><X size={11} />Collapse</button>}
            <div className="text-center mb-5"><h3 className="text-lg font-bold text-blue-900">Upload Donation Records</h3><p className="text-xs text-slate-500 mt-1">Each donation record is a folder of single-page PDFs</p></div>
            {uploadProgress !== null && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 ">
                <div className="flex items-center justify-between mb-1.5"><span className="text-xs font-semibold text-blue-900">Processing files…</span><span className="text-xs font-bold text-blue-800 tabular-nums">{uploadProgress.done} of {uploadProgress.total}</span></div>
                <div className="h-2 bg-blue-200  overflow-hidden"><div className="h-full bg-gradient-to-r from-blue-600 to-blue-800 transition-all duration-300" style={{ width: uploadProgress.total > 0 ? `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%` : '0%' }}></div></div>
              </div>
            )}
            {queueError && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-xs text-red-800"><div className="font-bold">Batch was not cleared because persistence failed.</div><div className="mt-1 break-words">{queueError}</div></div>}

            {stagedFiles.length === 0 ? (
              <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={async (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.items && e.dataTransfer.items.length > 0) { const files = await collectFilesFromDataTransfer(e.dataTransfer); if (files.length > 0) { handleFileSelection(files); return; } } if (e.dataTransfer.files) handleFileSelection(e.dataTransfer.files); }} className={`border-2 border-dashed  p-12 text-center transition-all ${dragOver ? 'border-blue-700 bg-blue-50' : 'border-slate-300 bg-gradient-to-br from-slate-50 to-white'}`}>
                <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-blue-200  flex items-center justify-center mx-auto mb-4 shadow-sm"><Upload size={22} className="text-blue-800" /></div>
                <div className="text-sm"><span className="text-blue-900 font-bold">Click to Upload</span><span className="text-slate-700"> or Drag and Drop PDF pages</span></div>
                <div className="mt-5 flex items-center justify-center gap-2">
                  <label className="cursor-pointer"><input type="file" multiple accept="application/pdf,.pdf,.zip,application/zip" className="hidden" onChange={(e) => { handleFileSelection(e.target.files); e.target.value = ''; }} /><span className="px-3.5 py-1.5 text-xs bg-gradient-to-b from-blue-800 to-blue-950 text-white hover:from-blue-700 hover:to-blue-900 shadow-md shadow-blue-950/30 border border-blue-950 font-semibold  transition-all flex items-center justify-center gap-1.5"><FileText size={12} />Select PDFs / ZIP</span></label>
                  <label className="cursor-pointer"><input type="file" multiple ref={(el) => { if (el) { el.setAttribute('webkitdirectory', ''); el.setAttribute('directory', ''); } }} className="hidden" onChange={(e) => { handleFileSelection(e.target.files); e.target.value = ''; }} /><span className="px-3.5 py-1.5 text-xs bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 shadow-sm font-semibold  transition-all flex items-center justify-center gap-1.5"><FolderOpen size={12} />Select Folder</span></label>
                </div>
                <div className="mt-3 text-[10px] text-slate-500 leading-relaxed"><div className="font-semibold text-slate-700 mb-0.5">Strict requirements:</div>Each PDF must be a <strong>single page</strong>, named <span className="font-mono bg-slate-100 px-1 ">NNNNNNN_XX_NNNN.pdf</span> where NNNNNNN is the record number, XX ∈ CF · CB · SF · SB · LF · LB · VF · VB · OT, and NNNN is the per-record occurrence starting at 0001.</div>
              </div>
            ) : (
              <div>
                <div className={`grid ${violationCount > 0 ? 'grid-cols-3' : 'grid-cols-2'} gap-3 mb-4`}>
                  <div className="relative bg-white  border-2 border-blue-200 p-4 shadow-sm overflow-hidden">
                    <div className="relative flex items-center gap-3"><div className="w-9 h-9  bg-gradient-to-br from-blue-700 to-blue-900 flex items-center justify-center shadow-md shadow-blue-900/25 flex-shrink-0"><ClipboardCheck size={16} className="text-white" /></div><div><div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Donation Records</div><div className="text-2xl font-black text-slate-800 tabular-nums leading-tight">{recordCount}</div><div className="text-[10px] text-slate-500 mt-0.5">payment method · determined after AI extraction</div></div></div>
                  </div>
                  <div className="bg-white  border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center gap-3"><div className="w-9 h-9  bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center shadow-md shadow-emerald-900/25 flex-shrink-0"><FileText size={16} className="text-white" /></div><div><div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Pages</div><div className="text-2xl font-black text-slate-800 tabular-nums leading-tight">{pageCount}</div><div className="text-[10px] text-slate-500 mt-0.5">{PAGE_TYPE_ORDER.map(code => { const n = stagedFiles.filter(f => f.kind === code).length; return n > 0 ? `${n} ${code}` : null; }).filter(Boolean).join(' · ') || '—'}</div></div></div>
                  </div>
                  {violationCount > 0 && (
                    <div className="bg-white  border-2 border-red-200 p-4 shadow-sm">
                      <div className="flex items-center gap-3"><div className="w-9 h-9  bg-gradient-to-br from-red-700 to-red-900 flex items-center justify-center shadow-md shadow-red-900/25 flex-shrink-0"><AlertTriangle size={16} className="text-white" /></div><div><div className="text-[10px] text-red-700 uppercase font-semibold tracking-wider">Invalid Pages</div><div className="text-2xl font-black text-red-700 tabular-nums leading-tight">{violationCount}</div><div className="text-[10px] text-red-700/80 mt-0.5">must be removed before queuing</div></div></div>
                    </div>
                  )}
                </div>

                {violationCount > 0 && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 ">
                    <div className="flex items-start gap-2 mb-2"><AlertTriangle size={14} className="text-red-700 flex-shrink-0 mt-0.5" /><div className="text-[11px] text-red-900 leading-snug"><strong>{violationCount} page{violationCount !== 1 ? 's' : ''} violate platform rules</strong> and must be removed before this batch can be queued.</div></div>
                    <div className="ml-6 mt-1 text-[10px] text-red-800/90 max-h-24 overflow-y-auto space-y-0.5">
                      {invalidStagedItems.slice(0, 6).map(item => (<div key={item.id} className="flex gap-1.5"><span className="font-mono flex-shrink-0">{item.name.length > 28 ? item.name.slice(0, 28) + '…' : item.name}</span><span className="text-red-700/70">— {item.violations[0]}</span></div>))}
                      {invalidStagedItems.length > 6 && <div className="text-red-700/60 italic">…and {invalidStagedItems.length - 6} more</div>}
                    </div>
                  </div>
                )}

                <div className="bg-slate-50  border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-200 bg-white flex items-center justify-between">
                    <div className="flex items-center gap-2"><FileText size={13} className="text-blue-800" /><h4 className="text-xs font-bold text-slate-800">Staged Pages</h4><span className="text-[10px] text-slate-500">{recordCount} record{recordCount !== 1 ? 's' : ''} · {pageCount} valid page{pageCount !== 1 ? 's' : ''}</span>{violationCount > 0 && <span className="text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 ">{violationCount} invalid</span>}</div>
                    <div className="flex items-center gap-1">
                      <label className="cursor-pointer"><input type="file" multiple accept="application/pdf,.pdf,.zip,application/zip" className="hidden" onChange={(e) => { handleFileSelection(e.target.files); e.target.value = ''; }} /><span className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 border border-slate-300  flex items-center gap-1"><Plus size={11} />Add Pages</span></label>
                      <button onClick={clearStaged} className="px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 border border-slate-300 hover:border-red-300 rounded flex items-center gap-1"><Trash2 size={11} />Clear All</button>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <tbody>
                        {stagedFiles.map((f, i) => {
                          const isInvalid = f.violations && f.violations.length > 0;
                          const kindBadge = { CF: 'bg-blue-100 text-blue-800 ring-blue-200', CB: 'bg-blue-50 text-blue-700 ring-blue-100', SF: 'bg-emerald-100 text-emerald-800 ring-emerald-200', SB: 'bg-emerald-50 text-emerald-700 ring-emerald-100', LF: 'bg-violet-100 text-violet-800 ring-violet-200', LB: 'bg-violet-50 text-violet-700 ring-violet-100', unknown: 'bg-slate-100 text-slate-600 ring-slate-200' }[f.kind] || 'bg-slate-100 text-slate-600 ring-slate-200';
                          const kindLabel = { CF: 'Check Front', CB: 'Check Back', SF: 'Slip Front', SB: 'Slip Back', LF: 'Letter Front', LB: 'Letter Back', VF: 'Voucher Front', VB: 'Voucher Back', OT: 'Other', unknown: 'Unclassified' }[f.kind] || f.kind;
                          return (
                            <tr key={f.id} className={`border-t ${isInvalid ? 'border-red-200 bg-red-50/40 hover:bg-red-50' : `border-slate-200 hover:bg-white ${i % 2 === 1 ? 'bg-white/50' : ''}`}`}>
                              <td className="pl-4 py-2 w-8 align-top"><div className={`w-6 h-7  flex items-center justify-center shadow-sm ${isInvalid ? 'bg-gradient-to-b from-red-700 to-red-900' : 'bg-gradient-to-b from-red-500 to-red-700'}`}>{isInvalid ? <AlertTriangle size={10} className="text-white" /> : <span className="text-[7px] font-black text-white">PDF</span>}</div></td>
                              <td className="py-2 align-top"><div className={`font-mono text-[11px] truncate ${isInvalid ? 'text-red-900 font-semibold' : 'text-slate-800'}`}>{f.name}{f.recordId && !isInvalid && <span className="ml-2 text-slate-400">· rec {f.recordId}</span>}</div>{isInvalid && <div className="text-[10px] text-red-700 mt-0.5 leading-snug">{f.violations[0]}</div>}</td>
                              <td className="py-2 w-40 align-top"><div className="flex flex-col gap-0.5">{isInvalid ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold ring-1 ring-inset uppercase tracking-wider whitespace-nowrap bg-red-100 text-red-800 ring-red-200"><AlertTriangle size={9} />Invalid</span> : <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold ring-1 ring-inset uppercase tracking-wider whitespace-nowrap ${kindBadge}`}>{f.kind === 'unknown' && <AlertCircle size={9} />}{kindLabel}</span>}{!isInvalid && (f.kind === 'CF' || f.kind === 'RF') && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap bg-blue-600 text-white rounded-sm"><Sparkles size={8} />AI Extraction</span>}</div></td>
                              <td className="py-2 w-16 text-right text-[11px] text-slate-600 tabular-nums align-top">{f.pages}p</td>
                              <td className="py-2 pr-4 w-8 text-right align-top"><button onClick={() => removeStagedFile(f.id)} className={`p-1 ${isInvalid ? 'text-red-500 hover:text-red-800' : 'text-slate-400 hover:text-red-700'}`}><X size={12} /></button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Batch settings */}
                <div className="mt-4">
                  <div className="text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-wider flex items-center gap-1"><Sliders size={10} />Batch Settings</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-xs">
                      <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1 tracking-wider">Batch ID</label>
                      <input type="text" value={customBatchId} onChange={(e) => setCustomBatchId(e.target.value)} className="w-full px-3 py-2 border border-slate-300  focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 font-mono text-[11px]" />
                      <div className="text-[10px] text-slate-500 mt-1">{customBatchId.trim() === '' ? <span className="text-amber-700 font-semibold">Required</span> : customBatchId.trim() === defaultBatchId ? 'Auto-generated' : <span className="text-blue-800 font-semibold">Using custom ID</span>}</div>
                    </div>
                    <div className="text-xs">
                      <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1 tracking-wider">Priority</label>
                      <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full px-3 py-2 border border-slate-300  focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"><option>Low</option><option>High</option></select>
                      <div className="text-[10px] text-slate-500 mt-1">{priority === 'Low' ? 'Default' : <span className="text-blue-800 font-semibold">Overridden</span>}</div>
                    </div>
                    <div className="text-xs">
                      <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1 tracking-wider">Assign HITL Team</label>
                      <select value={hitlTeam} onChange={(e) => setHitlTeam(e.target.value)} className="w-full px-3 py-2 border border-slate-300  focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"><option>Default Queue</option><option>Team Alpha</option><option>Team Beta</option></select>
                      <div className="text-[10px] text-slate-500 mt-1">{hitlTeam === 'Default Queue' ? 'Default' : <span className="text-blue-800 font-semibold">Overridden</span>}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-200 flex flex-col gap-3">
                  <div className="text-xs text-slate-600 whitespace-nowrap overflow-x-auto"><span className="font-semibold text-slate-800">{recordCount} donation record{recordCount !== 1 ? 's' : ''}</span> · <span className="font-semibold text-slate-800">{pageCount} page{pageCount !== 1 ? 's' : ''}</span>{violationCount > 0 && <span className="text-red-700 font-semibold ml-2">· {violationCount} invalid (must remove)</span>}</div>
                  <div className="flex items-stretch gap-2 justify-end">
                    <Button variant="secondary" size="md" icon={X} onClick={clearStaged} className="whitespace-nowrap min-w-[180px]">Cancel</Button>
                    <Button variant="primary" size="md" icon={Send} onClick={processBatch} disabled={uploadProgress !== null || recordCount === 0 || customBatchId.trim() === '' || violationCount > 0} className="whitespace-nowrap min-w-[180px]">{uploadProgress !== null ? 'Saving Batch…' : 'Queue for Extraction'}</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => setUploadExpanded(true)} className="w-full mb-4 bg-white  border border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/30 px-5 py-3 shadow-sm transition-colors flex items-center gap-3 group">
            <div className="w-8 h-8  bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center flex-shrink-0 group-hover:from-blue-200 group-hover:to-blue-300 transition-colors"><Upload size={14} className="text-blue-800" /></div>
            <div className="flex-1 min-w-0 text-left"><div className="text-sm font-semibold text-slate-800 group-hover:text-blue-900">Import another batch</div><div className="text-[11px] text-slate-500">Upload more donation records · {batches.length} batch{batches.length !== 1 ? 'es' : ''} already imported</div></div>
            <span className="text-[11px] font-semibold text-blue-700 group-hover:text-blue-900 flex items-center gap-1 flex-shrink-0"><Plus size={11} />Open Uploader</span>
          </button>
        )}

        {/* Recent imports */}
        <div className="bg-white  border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2"><h3 className="text-sm font-bold text-slate-800">Recent Imports</h3>{batches.length > 0 && <span className="text-[10px] text-slate-500">last {Math.min(5, batches.length)} of {batches.length}</span>}</div></div>
          {batches.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-slate-200 "><Inbox size={24} className="text-slate-300 mx-auto mb-2" /><div className="text-xs font-semibold text-slate-600">No batches imported yet</div></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs table-fixed min-w-[640px]">
                <colgroup><col style={{ width: '200px' }} /><col style={{ width: '150px' }} /><col style={{ width: '90px' }} /><col style={{ width: '75px' }} /><col /></colgroup>
                <thead><tr className="border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-wider align-bottom"><th className="text-left pb-2 pr-3 font-semibold whitespace-nowrap">Batch ID</th><th className="text-left pb-2 pr-3 font-semibold whitespace-nowrap">Date/Time</th><th className="text-right pb-2 pr-4 font-semibold leading-tight">Donation<br />Records</th><th className="text-right pb-2 pr-6 font-semibold whitespace-nowrap">Pages</th><th className="text-left pb-2 font-semibold whitespace-nowrap">Status</th></tr></thead>
                <tbody>
                  {batches.slice(0, 5).map((b) => {
                    const statusCfg = { 'extraction': { label: 'AI Extraction', color: 'bg-slate-800 text-slate-100 ring-slate-600', icon: Zap }, 'hitl-review': { label: 'HITL Review', color: 'bg-blue-100 text-blue-800 ring-blue-200', icon: ClipboardCheck }, 'qc-pending': { label: 'QC Pending', color: 'bg-amber-100 text-amber-800 ring-amber-200', icon: ShieldCheck }, 'archived': { label: 'Archived', color: 'bg-emerald-100 text-emerald-800 ring-emerald-200', icon: CheckCircle2 } }[b.status] || { label: b.status, color: 'bg-slate-100 text-slate-600 ring-slate-200', icon: FileText };
                    const StatusIcon = statusCfg.icon;
                    return (
                      <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => { if (b.status === 'extraction') setRoute('extraction'); }}>
                        <td className="py-2.5 pr-3 font-mono text-slate-700 whitespace-nowrap truncate">{b.id}</td>
                        <td className="py-2.5 pr-3 text-slate-600 whitespace-nowrap">{b.uploaded}</td>
                        <td className="py-2.5 pr-4 text-right font-semibold text-slate-800 tabular-nums">{b.recordCount}</td>
                        <td className="py-2.5 pr-6 text-right text-slate-600 tabular-nums">{b.pages}</td>
                        <td className="py-2.5"><span className={`inline-flex items-center gap-1 px-2 py-0.5  text-[10px] font-semibold ring-1 ring-inset whitespace-nowrap ${statusCfg.color}`}>{b.status === 'extraction' ? <div className="w-2 h-2  bg-slate-300 animate-pulse"></div> : <StatusIcon size={9} />}{statusCfg.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Merge prompt */}
      {mergePrompt && (() => {
        const currentRecordIds = new Set(stagedFiles.map(f => f.recordId).filter(Boolean));
        const incomingRecordIds = new Set(mergePrompt.incoming.map(f => f.recordId).filter(Boolean));
        const newRecordCount = [...incomingRecordIds].filter(id => !currentRecordIds.has(id)).length;
        const totalRecordsAfterMerge = currentRecordIds.size + newRecordCount;
        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setMergePrompt(null)}>
            <div className="bg-white  shadow-2xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex items-center gap-2"><div className="w-8 h-8  bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-md"><AlertCircle size={14} className="text-white" /></div><div><h3 className="text-sm font-bold text-slate-800">Pages already staged</h3><div className="text-[10px] text-slate-500">How would you like to handle the new selection?</div></div></div>
              <div className="p-5">
                <div className="text-xs text-slate-700 mb-4 leading-relaxed">You have <span className="font-bold text-slate-900">{currentRecordIds.size} record{currentRecordIds.size !== 1 ? 's' : ''}</span> ({stagedFiles.length} page{stagedFiles.length !== 1 ? 's' : ''}) currently staged. This new selection contains <span className="font-bold text-slate-900">{incomingRecordIds.size} record{incomingRecordIds.size !== 1 ? 's' : ''}</span> ({mergePrompt.incoming.length} page{mergePrompt.incoming.length !== 1 ? 's' : ''}).</div>
                <div className="space-y-2">
                  <button onClick={() => { setStagedFiles(prev => [...prev, ...mergePrompt.incoming]); setMergePrompt(null); }} className="w-full text-left p-3 bg-white border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50 rounded-lg transition-all flex items-start gap-3"><div className="w-8 h-8  bg-gradient-to-br from-blue-700 to-blue-900 flex items-center justify-center shadow-sm flex-shrink-0 mt-0.5"><Plus size={14} className="text-white" /></div><div className="flex-1 min-w-0"><div className="text-sm font-bold text-slate-800">Add More</div><div className="text-[11px] text-slate-500">Merge — staging will have <span className="font-bold text-slate-700">{totalRecordsAfterMerge} record{totalRecordsAfterMerge !== 1 ? 's' : ''}</span></div></div></button>
                  <button onClick={() => { setStagedFiles(mergePrompt.incoming); setMergePrompt(null); }} className="w-full text-left p-3 bg-white border-2 border-slate-200 hover:border-slate-400 hover:bg-slate-50 rounded-lg transition-all flex items-start gap-3"><div className="w-8 h-8  bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-sm flex-shrink-0 mt-0.5"><RefreshCw size={14} className="text-white" /></div><div className="flex-1 min-w-0"><div className="text-sm font-bold text-slate-800">Replace</div><div className="text-[11px] text-slate-500">Discard current and use this selection ({incomingRecordIds.size} records)</div></div></button>
                </div>
              </div>
              <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end"><Button variant="ghost" size="sm" onClick={() => setMergePrompt(null)}>Cancel</Button></div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
