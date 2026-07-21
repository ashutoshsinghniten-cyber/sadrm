import React, { useState, useEffect, useRef } from 'react';
import { FileText, X } from 'lucide-react';
import Button from '../../../components/shared/Button.jsx';
import FlagBadge from '../../../components/shared/FlagBadge.jsx';
import PdfPageRenderer from '../../../components/pdf/PdfPageRenderer.jsx';
import { PAGE_TYPES } from '../../../constants/pageTypes.js';
import { resolvePageCode, resolvePageLabel, loadXlsx } from '../../../utils/batchUtils.js';
import { pgFetchBatchPage, pgFetchBatchPages } from '../../../utils/pgApi.js';
import ExportRecordButton from './ExportRecordButton.jsx';

function SPField({ label, value }) {
  return (
    <div className="py-2 border-b border-slate-100 last:border-b-0 flex items-start gap-3">
      <label className="w-32 flex-shrink-0 text-[11px] font-semibold text-slate-600 leading-tight pt-2">{label}</label>
      <div className="flex-1 min-w-0 bg-white border border-slate-200  px-3 py-1.5 text-sm text-slate-900 break-words">{value || <em className="text-slate-400">empty</em>}</div>
    </div>
  );
}

export default function RecordDetailModal({ record, focus = 'CF', onClose, onToggleFlag = () => {}, browserMode = false }) {
  const pages = record.pages || [];
  const resolvedPages = pages.map((p, i) => ({
    ...p,
    resolvedCode: resolvePageCode(p),
    resolvedLabel: resolvePageLabel(p),
    _key: p.filename || `${p.code || 'page'}-${i}`
  }));
  const initialKey = resolvedPages.find(p => p.resolvedCode === focus)?._key || resolvedPages[0]?._key || null;
  const [activePageKey, setActivePageKey] = useState(initialKey);
  const activePage = resolvedPages.find(p => p._key === activePageKey) || resolvedPages[0];
  const fields = record.fields || {};
  const paymentMethod = record.paymentMethod || 'Unknown';

  const [rdmPageFileCache, setRdmPageFileCache] = useState({});
  const rdmFetchingPagesRef = useRef(new Set());
  const [rdmLoadingPageKeys, setRdmLoadingPageKeys] = useState(new Set());

  useEffect(() => {
    const batchId = record.batchId;
    const rid = record.recordId || (
      typeof record.id === 'string' && record.id.includes(':')
        ? record.id.split(':').slice(1).join(':')
        : record.id
    );
    if (!batchId || !rid || !activePage) return;
    if (activePage.file || activePage.fileBase64) return;
    const fname = activePage.filename || activePage.name || 'page.pdf';
    const key = `${batchId}|${rid}|${fname}`;
    if (rdmFetchingPagesRef.current.has(key)) return;
    rdmFetchingPagesRef.current.add(key);
    setRdmLoadingPageKeys(prev => { const s = new Set(prev); s.add(key); return s; });
    pgFetchBatchPage(batchId, rid, fname).then(async data => {
      if (!data) {
        // batch_pages stores the WebP preview filename, not the original PDF filename.
        // Fall back to listing all pages for the record and matching by originalFilename.
        const listing = await pgFetchBatchPages(batchId, rid).catch(() => null);
        const pages = listing?.pages || [];
        data = pages.find(p => p.originalFilename === fname || p.filename === fname) || null;
      }
      if (!data) { rdmFetchingPagesRef.current.delete(key); setRdmLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; }); return; }
      if (data.originalUrl) {
        fetch(data.originalUrl).then(r => r.arrayBuffer()).then(buf => {
          setRdmPageFileCache(prev => ({ ...prev, [key]: { kind: 'file', file: new File([buf], fname, { type: 'application/pdf' }) } }));
          setRdmLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
        }).catch(() => { rdmFetchingPagesRef.current.delete(key); setRdmLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; }); });
      } else if (data.url) {
        // mimeType can be null (WebP-preview metadata not populated for this page).
        // Don't blindly default to image/webp in that case — infer from the filename
        // extension instead, so an actual PDF with a null mimeType still renders via
        // PdfPageRenderer instead of being pushed through an <img> tag that can't
        // display PDF bytes (silently shows nothing).
        const mime = data.mimeType || (fname.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/webp');
        if (mime.startsWith('image/')) {
          setRdmPageFileCache(prev => ({ ...prev, [key]: { kind: 'url', url: data.url, mimeType: mime } }));
          setRdmLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
        } else {
          // Non-image URL (e.g. application/pdf when WebP preview is disabled) — download bytes and render via PdfPageRenderer
          fetch(data.url).then(r => r.arrayBuffer()).then(buf => {
            setRdmPageFileCache(prev => ({ ...prev, [key]: { kind: 'file', file: new File([buf], fname, { type: 'application/pdf' }) } }));
            setRdmLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
          }).catch(() => { rdmFetchingPagesRef.current.delete(key); setRdmLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; }); });
        }
      } else if (data.fileBase64) {
        try {
          const bytes = Uint8Array.from(atob(data.fileBase64), c => c.charCodeAt(0));
          setRdmPageFileCache(prev => ({ ...prev, [key]: { kind: 'file', file: new File([bytes], fname, { type: 'application/pdf' }) } }));
          setRdmLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
        } catch { rdmFetchingPagesRef.current.delete(key); setRdmLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; }); }
      } else { rdmFetchingPagesRef.current.delete(key); setRdmLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; }); }
    }).catch(() => { rdmFetchingPagesRef.current.delete(key); setRdmLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; }); });
  }, [activePageKey, record.batchId, record.recordId, record.id]);

  const exportRecord = async (format) => {
    const baseId = record.recordId || record.id || 'record';
    const filenameSafe = String(baseId).replace(/[^A-Za-z0-9_-]/g, '_');
    if (format === 'json') {
      const payload = { id: record.id, recordId: record.recordId, paymentMethod: record.paymentMethod, archivedAt: record.archivedAt, batchId: record.batchId, fields: record.fields, fieldsConf: record.fieldsConf, boxes: record.boxes, pages: (record.pages || []).map(p => ({ code: resolvePageCode(p), label: resolvePageLabel(p), filename: p.filename })), qcReview: record.qcReview ? { status: record.qcReview.status, reviewer: record.qcReview.reviewer, reviewedAt: record.qcReview.reviewedAt, history: record.qcReview.history || [] } : null, hitlReview: record.hitlReview || null, exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${filenameSafe}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (format === 'xlsx') {
      let XLSX = null;
      try { XLSX = await loadXlsx(); } catch {}
      if (!XLSX) {
        const f = record.fields || {};
        const csv = [['Field','Value'], ...Object.entries(f).map(([k,v]) => [k, String(v ?? '')])].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${filenameSafe}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      const f = record.fields || {};
      const data = [{ recordId: record.recordId || record.id, paymentMethod: record.paymentMethod || '', archivedAt: record.archivedAt || '', batchId: record.batchId || '', ...f }];
      const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Record');
      XLSX.writeFile(wb, `${filenameSafe}.xlsx`);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white  shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0 bg-gradient-to-r from-slate-50 to-white">
          <div>
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-blue-800" />
              <h3 className="text-sm font-bold text-slate-800">Donation Record · {record.recordId || record.id}</h3>
              <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold  ring-1 ${paymentMethod === 'Cheque' ? 'bg-blue-100 text-blue-800 ring-blue-200' : paymentMethod === 'CreditCard' ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>{paymentMethod === 'CreditCard' ? 'CREDIT CARD' : paymentMethod === 'Cheque' ? 'CHECK' : paymentMethod.toUpperCase()}</span>
              {record.batchId && <span className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-700 text-[9px] font-mono ">{record.batchId}</span>}
              <FlagBadge flagged={!!record.flagged} reason={record.flagReason} onToggle={() => onToggleFlag(record)} />
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Donor: {fields.donorName || '—'}{fields.amount ? ` · $${(parseFloat(fields.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}</div>
          </div>
          <div className="flex items-center gap-2"><button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded"><X size={15} /></button></div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-[280px_1fr] gap-5">
            <div className="space-y-2">
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Pages ({resolvedPages.length})</div>
              {resolvedPages.map((p) => {
                const code = p.resolvedCode;
                const pt = code ? PAGE_TYPES[code] : null;
                const isActive = p._key === activePageKey;
                return (
                  <button key={p._key} onClick={() => setActivePageKey(p._key)} className={`w-full text-left  p-2 border transition-all flex items-center gap-2 ${isActive ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                    <div className={`w-8 h-10  ${pt?.accent || 'bg-slate-400'} flex items-center justify-center flex-shrink-0`}><span className="text-white text-[10px] font-black">{code || '??'}</span></div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold text-slate-800 truncate">{p.resolvedLabel}</div>
                      <div className="text-[10px] text-slate-500 truncate font-mono">{p.filename}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="space-y-5 min-w-0">
              <div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">{activePage?.resolvedLabel || 'Page'}</div>
                <div className="bg-slate-50 border border-slate-200  p-2 min-h-[220px]">
                  {(() => {
                    const batchId = record.batchId;
                    const rid = record.recordId || (typeof record.id === 'string' && record.id.includes(':') ? record.id.split(':').slice(1).join(':') : record.id);
                    const fname = activePage?.filename || activePage?.name || 'page.pdf';
                    const cacheKey = batchId && rid ? `${batchId}|${rid}|${fname}` : null;
                    const cached = cacheKey ? rdmPageFileCache[cacheKey] : null;
                    const fileToRender = activePage?.file
                      || (cached?.kind === 'file' ? cached.file : null)
                      || (activePage?.fileBase64 ? new File([Uint8Array.from(atob(activePage.fileBase64), c => c.charCodeAt(0))], fname, { type: 'application/pdf' }) : null);
                    const isLoading = cacheKey ? rdmLoadingPageKeys.has(cacheKey) : false;
                    if (fileToRender) return <PdfPageRenderer file={fileToRender} pageNum={1} scale={1.4} />;
                    if (cached?.kind === 'url') return <img src={cached.url} alt={activePage?.resolvedLabel || 'Page preview'} className="w-full h-auto" />;
                    if (isLoading) return <div className="flex flex-col items-center justify-center h-[220px] gap-2"><div className="w-7 h-7 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" /><div className="text-xs text-slate-500">Loading PDF…</div></div>;
                    return <div className="flex items-center justify-center h-[220px] text-xs text-slate-400">No file available</div>;
                  })()}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-3"><div className="w-2 h-2 bg-blue-700 "></div><h4 className="text-sm font-bold text-slate-800">Donation Record Fields</h4></div>
                <div className="grid grid-cols-2 gap-2">
                  <SPField label="Donor Name" value={fields.donorName} />
                  <SPField label="Donor Type" value={fields.donorType} />
                  <SPField label="Donor Address" value={fields.donorAddress} />
                  <SPField label="Donor ID" value={fields.donorId} />
                  <SPField label="Amount" value={fields.amount ? `$${fields.amount}` : ''} />
                  <SPField label="Donation Date" value={fields.date} />
                  <SPField label="Payment Method" value={paymentMethod === 'Cheque' ? 'Check' : paymentMethod} />
                  {paymentMethod === 'Cheque' && <><SPField label="Check Number" value={fields.chequeNo} /><SPField label="Amount in Words" value={fields.amountWords} /></>}
                  {paymentMethod === 'CreditCard' && <><SPField label="Card Last 4" value={fields.cardLast4 ? `•••• ${fields.cardLast4}` : ''} /><SPField label="Card Type" value={fields.cardType} /><SPField label="Auth Code" value={fields.authCode} /></>}
                  {fields.actualDonor && <SPField label="Actual Donor (DAF)" value={fields.actualDonor} />}
                  {fields.fundName && <SPField label="Fund Name" value={fields.fundName} />}
                  {fields.invoiceNo && <SPField label="Invoice / Voucher #" value={fields.invoiceNo} />}
                  {fields.grantId && <SPField label="Grant ID" value={fields.grantId} />}
                  {fields.purpose && <SPField label="Purpose" value={fields.purpose} />}
                  {fields.payee && <SPField label="Payee" value={fields.payee} />}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 px-5 py-3 bg-slate-50 flex items-center justify-between flex-shrink-0">
          <div className="text-[11px] text-slate-500">Archived {record.archivedAt || '—'} · Audit log available</div>
          <div className="flex gap-2 items-center">
            <ExportRecordButton onExport={exportRecord} />
            {!browserMode && (
              <Button
                variant={record.flagged ? 'secondary' : 'warning'}
                onClick={() => onToggleFlag(record)}
              >
                {record.flagged ? 'Unflag Record' : 'Flag Record'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
