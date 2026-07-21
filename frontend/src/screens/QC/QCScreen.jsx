import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Check, AlertTriangle, FileText, X,
  Plus, Minus, RotateCw, RotateCcw, CheckCircle2, Zap, ClipboardCheck, ShieldCheck,
  Activity, RefreshCw, Database, Eye, Flag
} from 'lucide-react';
import { PageHeader } from '../../components/shared/PageHeader.jsx';
import Button from '../../components/shared/Button.jsx';
import FlagBadge from '../../components/shared/FlagBadge.jsx';
import PdfPageRenderer from '../../components/pdf/PdfPageRenderer.jsx';
import { BatchSelector } from '../HITL/HITLScreen.jsx';
import QCFieldDiffView from './modals/QCFieldDiffView.jsx';
import RecordHistoryModal from './modals/RecordHistoryModal.jsx';
import { pgFetchBatchPage } from '../../utils/pgApi.js';
import { getQcReason } from '../../utils/qcUtils.js';

export default function QCScreen({ batches = [], archiveRecords = () => {}, setRoute = () => {}, setHitlFocus = () => {}, updateRecordQcReview = () => {}, updateRecordFlag = () => {}, currentUser = null }) {
  const qcBatches = useMemo(
    () => batches
      .filter(b => b.status === 'qc-pending' || b.status === 'archived')
      .filter(b => (b.records || []).some(r => r.hitlReview))
      .sort((a, b) => (b.id > a.id ? 1 : -1)),
    [batches]
  );

  const [activeBatchId, setActiveBatchId] = useState(null);
  const [filterTab, setFilterTab] = useState('all');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'detail' — list shows all batches, detail is the record-by-record inspector
  const [selectedBatchIds, setSelectedBatchIds] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [hoverRecordId, setHoverRecordId] = useState(null);
  const [activeRecordId, setActiveRecordId] = useState(null);
  const [qcHistoryRecord, setQcHistoryRecord] = useState(null);
  const [activeTabId, setActiveTabId] = useState(null);
  const [zoom, setZoom] = useState(100);
  const [qcPageFileCache, setQcPageFileCache] = useState({});
  const qcFetchingPagesRef = useRef(new Set());
  const [qcLoadingPageKeys, setQcLoadingPageKeys] = useState(new Set());

  useEffect(() => {
    if (!activeBatchId && qcBatches.length > 0) {
      setActiveBatchId(qcBatches[0].id);
    } else if (activeBatchId && !qcBatches.find(b => b.id === activeBatchId)) {
      setActiveBatchId(qcBatches[0]?.id || null);
    }
  }, [qcBatches, activeBatchId]);

  useEffect(() => { setSelectedIds(new Set()); setActiveRecordId(null); setHoverRecordId(null); }, [activeBatchId, filterTab]);
  useEffect(() => { setActiveTabId(null); }, [activeRecordId]);

  const activeBatch = qcBatches.find(b => b.id === activeBatchId) || null;

  const visibleRecords = useMemo(() => {
    if (!activeBatch) return [];
    let recs = (activeBatch.records || []).filter(r => r.hitlReview);
    switch (filterTab) {
      case 'approved': recs = recs.filter(r => r.hitlReview.status === 'approved'); break;
      case 'hold': recs = recs.filter(r => r.hitlReview.status === 'hold'); break;
      case 'edited': recs = recs.filter(r => Object.keys(r.hitlReview.edits || {}).length > 0 || Object.keys(r.hitlReview.tabPicks || {}).length > 0); break;
      default: break;
    }
    return recs.sort((a, b) => {
      const aId = (a.recordId || a.id || '').toString();
      const bId = (b.recordId || b.id || '').toString();
      const idCmp = aId.localeCompare(bId, undefined, { numeric: true, sensitivity: 'base' });
      if (idCmp !== 0) return idCmp;
      const aFinalized = !!a.qcReview?.status;
      const bFinalized = !!b.qcReview?.status;
      if (aFinalized !== bFinalized) return aFinalized ? 1 : -1;
      const aEdits = Object.keys(a.hitlReview?.edits || {}).length + Object.keys(a.hitlReview?.tabPicks || {}).length;
      const bEdits = Object.keys(b.hitlReview?.edits || {}).length + Object.keys(b.hitlReview?.tabPicks || {}).length;
      if (aEdits !== bEdits) return bEdits - aEdits;
      return (b.hitlReview?.status === 'hold' ? 1 : 0) - (a.hitlReview?.status === 'hold' ? 1 : 0);
    });
  }, [activeBatch, filterTab]);

  const detailRecordId = hoverRecordId || activeRecordId || (visibleRecords[0]?.id ?? null);
  const detailRecord = visibleRecords.find(r => r.id === detailRecordId) || null;

  useEffect(() => {
    if (!detailRecord || !activeBatchId) return;
    const pages = detailRecord.pages || [];
    const pageIdx = activeTabId != null ? parseInt(activeTabId.split('-')[1], 10) : 0;
    if (isNaN(pageIdx) || pageIdx < 0 || pageIdx >= pages.length) return;
    const page = pages[pageIdx];
    if (!page || (page.file && !page.pageStored) || page.fileBase64 || !(detailRecord.recordId || detailRecord.id)) return;
    const rid = detailRecord.recordId || detailRecord.id;
    const fname = page.filename || page.name || 'page.pdf';
    const key = `${activeBatchId}|${rid}|${fname}`;
    if (qcFetchingPagesRef.current.has(key)) return;
    qcFetchingPagesRef.current.add(key);
    setQcLoadingPageKeys(prev => { const s = new Set(prev); s.add(key); return s; });
    pgFetchBatchPage(activeBatchId, rid, fname).then(data => {
      if (!data) { qcFetchingPagesRef.current.delete(key); setQcLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; }); return; }
      // data.url is the WebP preview (fast, pre-rendered); data.originalUrl is the real PDF.
      // Prefer the WebP image when ready — loads via <img>, far faster than fetching+parsing
      // a full PDF through pdf.js, and avoids pdf.js's canvas-size failure modes.
      if (data.mimeType && data.mimeType.startsWith('image/') && data.url) {
        setQcPageFileCache(prev => ({ ...prev, [key]: { kind: 'url', url: data.url, mimeType: data.mimeType } }));
        setQcLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
      } else if (data.originalUrl || data.url) {
        fetch(data.originalUrl || data.url).then(r => r.arrayBuffer()).then(buf => {
          setQcPageFileCache(prev => ({ ...prev, [key]: { kind: 'file', file: new File([buf], fname, { type: 'application/pdf' }) } }));
          setQcLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
        }).catch(() => { qcFetchingPagesRef.current.delete(key); setQcLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; }); });
      } else if (data.fileBase64) {
        try {
          const bytes = Uint8Array.from(atob(data.fileBase64), c => c.charCodeAt(0));
          setQcPageFileCache(prev => ({ ...prev, [key]: { kind: 'file', file: new File([bytes], fname, { type: 'application/pdf' }) } }));
          setQcLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
        } catch { qcFetchingPagesRef.current.delete(key); setQcLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; }); }
      } else { qcFetchingPagesRef.current.delete(key); setQcLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; }); }
    }).catch(() => { qcFetchingPagesRef.current.delete(key); setQcLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; }); });
  }, [activeTabId, detailRecord?.recordId, detailRecord?.id, activeBatchId]);

  const filterCounts = useMemo(() => {
    if (!activeBatch) return { all: 0, approved: 0, hold: 0, edited: 0 };
    const hitlReviewed = (activeBatch.records || []).filter(r => r.hitlReview);
    return {
      all: hitlReviewed.length,
      approved: hitlReviewed.filter(r => r.hitlReview.status === 'approved').length,
      hold: hitlReviewed.filter(r => r.hitlReview.status === 'hold').length,
      edited: hitlReviewed.filter(r => Object.keys(r.hitlReview.edits || {}).length > 0 || Object.keys(r.hitlReview.tabPicks || {}).length > 0).length
    };
  }, [activeBatch]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      const eligible = visibleRecords.filter(r => !r.qcReview?.status);
      if (prev.size === eligible.length) return new Set();
      return new Set(eligible.map(r => r.id));
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const archiveSelected = () => {
    if (!activeBatch || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const recordsToArchive = (activeBatch.records || []).filter(r => ids.includes(r.id));
    const reviewer = currentUser?.email || currentUser?.username || 'unknown';
    archiveRecords(recordsToArchive, activeBatch.id);
    updateRecordQcReview(activeBatch.id, ids, { status: 'archived', reviewedAt: new Date().toISOString(), reviewer });
    clearSelection();
    setActiveRecordId(null);
  };

  const removeRecordFlag = (record) => {
    if (!activeBatch || !record) return;
    updateRecordFlag(activeBatch.id, record.id, false);
  };

  const toggleRecordFlag = (record) => {
    if (!activeBatch || !record) return;
    updateRecordFlag(activeBatch.id, record.id, !record.flagged);
  };

  // Approve & archive every pending (HITL-reviewed, not-yet-QC'd) record in one batch —
  // used by the per-row "Approve N" button in List View.
  const approveAllInBatch = (batchId) => {
    const batch = qcBatches.find(b => b.id === batchId);
    if (!batch) return;
    const pending = (batch.records || []).filter(r => r.hitlReview && !r.qcReview?.status);
    if (pending.length === 0) return;
    const reviewer = currentUser?.email || currentUser?.username || 'unknown';
    archiveRecords(pending, batchId);
    updateRecordQcReview(batchId, pending.map(r => r.id), { status: 'archived', reviewedAt: new Date().toISOString(), reviewer });
  };

  // Bulk-approve every selected batch in List View's multi-select toolbar.
  const approveSelectedBatches = () => {
    if (selectedBatchIds.size === 0) return;
    selectedBatchIds.forEach(batchId => approveAllInBatch(batchId));
    setSelectedBatchIds(new Set());
  };

  const buildFieldDefsForRecord = useCallback((record) => {
    const pm = record?.paymentMethod || 'Unknown';
    const core = [
      { key: 'donorName', label: 'Donor Name' }, { key: 'donorAddress', label: 'Donor Address' },
      { key: 'date', label: 'Donation Date' }, { key: 'paymentMethod', label: 'Donation Type' },
      { key: 'amount', label: 'Amount in Number' }
    ];
    if (pm === 'Cheque') { core.push({ key: 'amountWords', label: 'Amount in Words' }, { key: 'chequeNo', label: 'Check Number' }); }
    else if (pm === 'CreditCard') { core.push({ key: 'cardLast4', label: 'Credit Card Number' }, { key: 'cardExpiry', label: 'Expiration Date' }); }
    else { core.push({ key: 'amountWords', label: 'Amount in Words' }, { key: 'invoiceNo', label: 'Check / Credit Card Number' }); }
    return core;
  }, []);

  if (qcBatches.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-slate-50 p-6">
        <div>
          <PageHeader title="QC Approval" eyebrow="PROCESSING" description="Secondary Quality Check of HITL-Approved Records Before Archiving" />
          <div className="mt-8 bg-white border-2 border-dashed border-slate-300  p-12 text-center">
            <ShieldCheck size={36} className="text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800 mb-1">No batches awaiting QC</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">Once HITL Review approves all records in a batch, the batch moves here for secondary quality check before archiving.</p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <Button variant="secondary" onClick={() => setRoute('hitl')} icon={ClipboardCheck}>Open HITL Review</Button>
              <Button variant="secondary" onClick={() => setRoute('extraction')} icon={Zap}>Open AI Extraction</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const recordNavIdx = Math.max(0, visibleRecords.findIndex(r => r.id === detailRecordId));
  const goPrevRecord = () => { if (recordNavIdx > 0) setActiveRecordId(visibleRecords[recordNavIdx - 1].id); };
  const goNextRecord = () => { if (recordNavIdx < visibleRecords.length - 1) setActiveRecordId(visibleRecords[recordNavIdx + 1].id); };
  const pageTabs = (detailRecord?.pages || []).map((p, i) => {
    const code = p.code || p.kind || `P${i + 1}`;
    const kindLabel = { SF: 'Slip Front', SB: 'Slip Back', CF: 'Check Front', CB: 'Check Back' }[code] || code;
    const dotColor = code.startsWith('C') ? 'bg-blue-500' : 'bg-emerald-500';
    return { id: `page-${i}`, label: kindLabel, code, dotColor, pageIdx: i };
  });
  const activeTab = pageTabs.find(t => t.id === activeTabId) || pageTabs[0] || null;
  const detailFieldDefs = detailRecord ? buildFieldDefsForRecord(detailRecord) : [];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Dark sub-header */}
      <div className="flex-shrink-0 text-white px-6 py-3.5 flex items-end justify-between gap-4" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.18em] text-slate-400 mb-1">PROCESSING</div>
          <h2 className="text-2xl font-black tracking-tight">QC Approval</h2>
          <div className="w-16 h-0.5 bg-gradient-to-r from-red-600 via-amber-400 to-blue-400 mt-1.5 opacity-80 rounded-full" />
          <p className="text-xs text-slate-400 mt-2">Secondary Quality Check of HITL-Approved Records Before Archiving</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* View mode toggle */}
          <div className="flex items-center bg-slate-800/60 border border-slate-700/60 rounded overflow-hidden">
            <button onClick={() => setViewMode('list')} title="List View — all batches, bulk approval" className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold transition-colors ${viewMode === 'list' ? 'bg-blue-700 text-white' : 'text-slate-400 hover:text-white'}`}>
              <Database size={12} />List
            </button>
            <button onClick={() => setViewMode('detail')} title="Detail View — record-by-record inspection" className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold transition-colors ${viewMode === 'detail' ? 'bg-blue-700 text-white' : 'text-slate-400 hover:text-white'}`}>
              <Eye size={12} />Detail
            </button>
          </div>

          {viewMode === 'detail' && (<>
            {activeBatch && (() => {
              const reviewed = (activeBatch.records || []).filter(r => r.hitlReview);
              const archived = reviewed.filter(r => r.qcReview?.status === 'archived').length;
              const rejected = reviewed.filter(r => r.qcReview?.status === 'rejected').length;
              const pendingQc = reviewed.length - archived - rejected;
              return (
                <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-700/60 rounded px-3 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                  <span className="font-mono text-xs truncate max-w-[160px]">{activeBatch.id}</span>
                  <span className="text-slate-500">·</span>
                  <span className="text-[10px] text-slate-400">{reviewed.length}r</span>
                  {pendingQc > 0 && <span className="text-[9px] font-bold text-amber-300 flex-shrink-0">· {pendingQc} pending</span>}
                  {rejected > 0 && <span className="text-[9px] font-bold text-red-300 flex-shrink-0">· {rejected} rejected</span>}
                </div>
              );
            })()}
            {qcBatches.length > 1 && <BatchSelector batches={qcBatches} selectedId={activeBatchId} onSelect={setActiveBatchId} placeholder="Switch…" />}
            <div className="flex items-center gap-px rounded overflow-hidden">
              <div className="bg-slate-800/60 border border-slate-700/60 px-3 py-1 text-center"><div className="text-base font-black text-blue-300 tabular-nums leading-tight">{filterCounts.all}</div><div className="text-[9px] font-bold text-slate-400 tracking-widest">RECORDS</div></div>
              <div className="bg-slate-800/60 border border-slate-700/60 px-3 py-1 text-center"><div className={`text-base font-black tabular-nums leading-tight ${filterCounts.edited > 0 ? 'text-amber-300' : 'text-white'}`}>{filterCounts.edited}</div><div className="text-[9px] font-bold text-slate-400 tracking-widest">EDITED</div></div>
              <div className="bg-slate-800/60 border border-slate-700/60 px-3 py-1 text-center"><div className={`text-base font-black tabular-nums leading-tight ${filterCounts.hold > 0 ? 'text-amber-300' : 'text-white'}`}>{filterCounts.hold}</div><div className="text-[9px] font-bold text-slate-400 tracking-widest">HOLD</div></div>
            </div>
            <div className="flex items-center gap-1 bg-slate-800/60 border border-slate-700/60 rounded px-2 py-1">
              <button onClick={goPrevRecord} disabled={recordNavIdx === 0} className="p-1 hover:bg-slate-700/60 rounded disabled:opacity-30 disabled:cursor-not-allowed"><ChevronLeft size={13} /></button>
              <div className="px-2 text-xs"><span className="font-bold text-slate-400">REC </span><span className="font-mono font-black text-white tabular-nums">{recordNavIdx + 1}</span><span className="text-slate-500"> / </span><span className="font-mono text-slate-400">{visibleRecords.length}</span></div>
              <button onClick={goNextRecord} disabled={recordNavIdx === visibleRecords.length - 1} className="p-1 hover:bg-slate-700/60 rounded disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight size={13} /></button>
            </div>
          </>)}

          {viewMode === 'list' && (<>
            <div className="text-[11px] text-slate-400">
              {qcBatches.filter(b => b.status === 'qc-pending').length} batch{qcBatches.filter(b => b.status === 'qc-pending').length !== 1 ? 'es' : ''} pending
            </div>
            {selectedBatchIds.size > 0 && (
              <button onClick={approveSelectedBatches} className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded border border-emerald-700 transition-colors">
                <CheckCircle2 size={13} />
                Approve {selectedBatchIds.size} Batch{selectedBatchIds.size !== 1 ? 'es' : ''}
              </button>
            )}
          </>)}
        </div>
      </div>

      {/* ============================ LIST VIEW ============================ */}
      {viewMode === 'list' && (
        <div className="flex-1 overflow-y-auto p-6">
          {selectedBatchIds.size > 0 && (
            <div className="mb-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
              <span className="text-sm font-semibold text-blue-900">{selectedBatchIds.size} batch{selectedBatchIds.size !== 1 ? 'es' : ''} selected</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedBatchIds(new Set())} className="text-xs font-semibold text-blue-700 hover:text-blue-900 px-2 py-1 hover:bg-blue-100 rounded transition-colors">Clear selection</button>
                <button onClick={approveSelectedBatches} className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded border border-emerald-700 transition-colors shadow-sm">
                  <CheckCircle2 size={13} />
                  Approve &amp; Archive All Selected ({Array.from(selectedBatchIds).reduce((s, bid) => {
                    const b = qcBatches.find(x => x.id === bid);
                    return s + (b?.records || []).filter(r => r.hitlReview && !r.qcReview?.status).length;
                  }, 0)} records)
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
            <div className="grid text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 bg-slate-50 px-4 py-2.5" style={{ gridTemplateColumns: '32px 1fr 80px 70px 70px 70px 80px 180px' }}>
              <div>
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                  checked={selectedBatchIds.size === qcBatches.filter(b => b.status === 'qc-pending').length && qcBatches.filter(b => b.status === 'qc-pending').length > 0}
                  onChange={() => {
                    const pending = qcBatches.filter(b => b.status === 'qc-pending');
                    if (selectedBatchIds.size === pending.length) setSelectedBatchIds(new Set());
                    else setSelectedBatchIds(new Set(pending.map(b => b.id)));
                  }}
                  title="Select all pending batches"
                />
              </div>
              <div>Batch ID</div>
              <div className="text-right">Records</div>
              <div className="text-right">Pending</div>
              <div className="text-right">Approved</div>
              <div className="text-right">Flagged</div>
              <div className="text-right">Priority</div>
              <div className="text-right">Actions</div>
            </div>

            {qcBatches.map(batch => {
              const isPending = batch.status === 'qc-pending';
              const isArchived = batch.status === 'archived';
              const records = batch.records || [];
              const hitlReviewed = records.filter(r => r.hitlReview);
              const pendingRecs = hitlReviewed.filter(r => !r.qcReview?.status);
              const approvedRecs = records.filter(r => r.qcReview?.status === 'archived').length;
              const flaggedRecs = hitlReviewed.filter(r => r.flagged).length;
              const editedRecs = hitlReviewed.filter(r => Object.keys(r.hitlReview?.edits || {}).length > 0).length;
              const isSelected = selectedBatchIds.has(batch.id);
              const allDone = pendingRecs.length === 0;

              return (
                <div key={batch.id} className={`grid items-center px-4 py-3 border-b border-slate-100 last:border-b-0 transition-colors ${isSelected ? 'bg-blue-50' : isPending ? 'hover:bg-slate-50' : 'bg-slate-50/50'}`} style={{ gridTemplateColumns: '32px 1fr 80px 70px 70px 70px 80px 180px' }}>
                  <div>
                    {isPending && !allDone && (
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                        checked={isSelected}
                        onChange={() => setSelectedBatchIds(prev => {
                          const next = new Set(prev);
                          if (next.has(batch.id)) next.delete(batch.id); else next.add(batch.id);
                          return next;
                        })}
                      />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-slate-800 truncate">{batch.id}</span>
                      {isArchived && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded uppercase tracking-wide">Archived</span>}
                      {isPending && allDone && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded uppercase tracking-wide">Complete</span>}
                      {editedRecs > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">{editedRecs} edited</span>}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Uploaded {batch.uploaded || '—'}
                      {batch.uploader && <span className="ml-1 text-slate-400">· {batch.uploader}</span>}
                    </div>
                  </div>

                  <div className="text-right tabular-nums text-sm font-bold text-slate-700">{hitlReviewed.length}</div>

                  <div className={`text-right tabular-nums text-sm font-bold ${pendingRecs.length > 0 ? 'text-amber-600' : 'text-slate-300'}`}>
                    {pendingRecs.length > 0 ? pendingRecs.length : '—'}
                  </div>

                  <div className={`text-right tabular-nums text-sm font-bold ${approvedRecs > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                    {approvedRecs > 0 ? approvedRecs : '—'}
                  </div>

                  <div className={`text-right tabular-nums text-sm font-bold ${flaggedRecs > 0 ? 'text-amber-500' : 'text-slate-300'}`}>
                    {flaggedRecs > 0 ? <span className="flex items-center justify-end gap-1"><Flag size={11} />{flaggedRecs}</span> : '—'}
                  </div>

                  <div className="text-right">
                    {batch.priority && batch.priority !== 'Normal' ? (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${batch.priority === 'High' ? 'bg-red-100 text-red-700' : batch.priority === 'Low' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{batch.priority}</span>
                    ) : <span className="text-slate-300 text-xs">Normal</span>}
                  </div>

                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => { setViewMode('detail'); setActiveBatchId(batch.id); }} className="px-2.5 py-1 text-[10px] font-semibold text-slate-600 border border-slate-300 hover:bg-slate-100 rounded transition-colors flex items-center gap-1" title="Inspect records in Detail View">
                      <Eye size={10} /> Inspect
                    </button>
                    {isPending && pendingRecs.length > 0 && (
                      <button onClick={() => approveAllInBatch(batch.id)} className="px-2.5 py-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded border border-emerald-700 transition-colors flex items-center gap-1" title={`Approve & archive all ${pendingRecs.length} pending records`}>
                        <CheckCircle2 size={10} /> Approve {pendingRecs.length}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
            <span>{qcBatches.length} batch{qcBatches.length !== 1 ? 'es' : ''} total · {qcBatches.filter(b => b.status === 'qc-pending').length} pending QC</span>
            <span>{qcBatches.reduce((s, b) => s + (b.records || []).filter(r => r.hitlReview && !r.qcReview?.status).length, 0)} records awaiting approval</span>
          </div>
        </div>
      )}

      {/* ============================ DETAIL VIEW ============================ */}
      {viewMode === 'detail' && (<>
      {/* Tab strip */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 flex-shrink-0">
        <div className="flex items-end">
          <div className="flex items-end gap-0.5">
            {[{ id: 'all', label: 'All', count: filterCounts.all, color: 'border-slate-700' }, { id: 'approved', label: 'Approved', count: filterCounts.approved, color: 'border-emerald-600' }, { id: 'hold', label: 'Hold', count: filterCounts.hold, color: 'border-amber-600' }, { id: 'edited', label: 'Edited', count: filterCounts.edited, color: 'border-blue-600' }].map(t => {
              const active = filterTab === t.id;
              return (
                <button key={t.id} onClick={() => setFilterTab(t.id)} className={`px-2.5 py-2.5 text-[11px] font-semibold flex items-center gap-1 border-b-2 transition-colors flex-shrink-0 whitespace-nowrap ${active ? `text-slate-800 ${t.color}` : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {t.label}<span className={`text-[9px] px-1.5 py-0 font-bold ${active ? 'bg-slate-100 text-slate-700' : 'bg-slate-100 text-slate-500'}`}>{t.count}</span>
                </button>
              );
            })}
          </div>
          {(() => {
            const eligible = visibleRecords.filter(r => !r.qcReview?.status);
            if (eligible.length === 0) return null;
            const allSelected = selectedIds.size === eligible.length;
            return <button onClick={toggleSelectAll} className="ml-3 mb-1.5 px-2.5 py-1 text-[10px] font-bold border border-slate-300 text-slate-600 hover:bg-slate-100 hover:border-slate-400 rounded transition-colors flex-shrink-0">{allSelected ? 'Clear All' : `Select All (${eligible.length})`}</button>;
          })()}
          <div className="flex-1" />
          <div className="flex items-end">
            {pageTabs.map(tab => {
              const active = activeTabId === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTabId(tab.id)} className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${active ? 'border-blue-700 text-slate-800 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${tab.dotColor}`} />
                  {tab.label}<span className="text-slate-400 font-normal">· {tab.code}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-2 flex items-center justify-between flex-shrink-0">
          <span className="text-xs font-semibold text-blue-900">{selectedIds.size} record{selectedIds.size !== 1 ? 's' : ''} selected</span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={clearSelection}>Clear</Button>
            <Button variant="success" size="sm" icon={CheckCircle2} onClick={archiveSelected}>Approve &amp; Archive ({selectedIds.size})</Button>
          </div>
        </div>
      )}

      {/* Main body */}
      <div className="flex-1 grid overflow-hidden bg-slate-50" style={{ gridTemplateColumns: '1fr clamp(420px, 40vw, 720px)' }}>
        {/* Left: document viewer */}
        <div className="overflow-auto p-6">
          {detailRecord ? (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col" style={{ minHeight: '520px' }}>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 flex-shrink-0">
                <div className="text-xs font-bold text-slate-700">
                  {activeTab ? <>{activeTab.label}<span className="text-slate-400 font-normal"> · {activeTab.code}</span></> : <span className="text-slate-400">No pages</span>}
                  <span className="text-slate-300 mx-2">·</span>
                  <span className="font-mono text-slate-600">Record {detailRecord.recordId || detailRecord.id}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setZoom(z => Math.max(50, z - 10))} className="p-1.5 hover:bg-slate-100 rounded border border-slate-200"><Minus size={12} /></button>
                  <span className="px-2 text-[11px] font-bold text-slate-700 tabular-nums w-12 text-center">{zoom}%</span>
                  <button onClick={() => setZoom(z => Math.min(200, z + 10))} className="p-1.5 hover:bg-slate-100 rounded border border-slate-200"><Plus size={12} /></button>
                  <div className="w-px h-4 bg-slate-200 mx-1" />
                  <button className="p-1.5 hover:bg-slate-100 rounded border border-slate-200"><RotateCw size={12} /></button>
                  <button className="p-1.5 hover:bg-slate-100 rounded border border-slate-200"><RotateCcw size={12} /></button>
                </div>
              </div>
              <div className="flex-1 bg-slate-50 flex items-center justify-center p-4 overflow-auto">
                {activeTab?.pageIdx != null ? (
                  <div style={{ width: `${zoom}%`, maxWidth: '900px' }} className="transition-all">
                    {(() => {
                      const page = (detailRecord.pages || [])[activeTab.pageIdx];
                      if (!page) return null;
                      const rid = detailRecord.recordId || detailRecord.id;
                      const fname = page.filename || page.name || 'page.pdf';
                      const cacheKey = `${activeBatchId}|${rid}|${fname}`;
                      const cacheEntry = qcPageFileCache[cacheKey];
                      const isLoading = qcLoadingPageKeys.has(cacheKey);
                      const fileToRender = page.file || (cacheEntry?.kind === 'file' ? cacheEntry.file : null) || (page.fileBase64 ? new File([Uint8Array.from(atob(page.fileBase64), c => c.charCodeAt(0))], fname, { type: 'application/pdf' }) : null);
                      const imageUrlToRender = !fileToRender && cacheEntry?.kind === 'url' ? cacheEntry.url : null;
                      if (fileToRender) return <PdfPageRenderer key={`${cacheKey}-${activeTab.pageIdx}`} file={fileToRender} pageNum={1} scale={1.5} className="w-full" />;
                      if (imageUrlToRender) return <img key={`${cacheKey}-${activeTab.pageIdx}`} src={imageUrlToRender} alt={fname} className="w-full h-auto block" />;
                      if (isLoading) return <div className="py-16 flex flex-col items-center justify-center text-center"><div className="w-8 h-8 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" /><div className="text-xs font-medium text-slate-500">Loading PDF…</div></div>;
                      return <div className="py-16 flex flex-col items-center justify-center text-center"><RefreshCw size={20} className="mb-2 text-amber-500" /><div className="text-xs font-semibold text-slate-600">PDF preview unavailable</div></div>;
                    })()}
                  </div>
                ) : (
                  <div className="text-center text-slate-400"><FileText size={28} className="mx-auto mb-2" /><div className="text-xs">No pages available</div></div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400">
              <div className="text-center"><FileText size={28} className="mx-auto mb-2" /><div className="text-sm">No record selected</div></div>
            </div>
          )}
        </div>

        {/* Right: detail panel */}
        <aside className="bg-white border-l border-slate-200 overflow-y-auto flex flex-col">
          {detailRecord ? (
            <>
              <div className="px-5 py-4 border-b border-slate-200 flex-shrink-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {!detailRecord.qcReview?.status && <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600 cursor-pointer flex-shrink-0" checked={selectedIds.has(detailRecord.id)} onChange={() => toggleSelect(detailRecord.id)} />}
                    <div className="text-[10px] font-bold text-slate-500 tracking-[0.18em]">RECORD DETAIL</div>
                  </div>
                  <button onClick={() => setQcHistoryRecord(detailRecord)} className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 px-1.5 py-0.5 hover:bg-slate-100 rounded transition-colors flex items-center gap-1 flex-shrink-0"><Activity size={10} /> History</button>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <h3 className="text-2xl font-black text-slate-800 font-mono tabular-nums">{detailRecord.recordId || detailRecord.id}</h3>
                  <FlagBadge flagged={!!detailRecord.flagged} reason={detailRecord.flagReason} onToggle={() => toggleRecordFlag(detailRecord)} />
                  {detailRecord.flagged && (
                    <button
                      onClick={() => removeRecordFlag(detailRecord)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded border border-slate-300 text-slate-500 hover:text-red-600 hover:border-red-400 transition-colors"
                      title="Remove the flag from this record"
                    >
                      <X size={10} /> Remove Flag
                    </button>
                  )}
                </div>
                {detailRecord.qcReview?.source === 'repository' && (
                  <span className="inline-block mt-1 px-1.5 py-0.5 bg-violet-50 border border-violet-200 text-violet-700 text-[9px] font-bold tracking-wider uppercase">From Repository</span>
                )}
                {detailRecord.hitlReview?.reviewedAt && (
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Reviewed by <span className="text-slate-700 font-semibold">{detailRecord.hitlReview.reviewer || 'admin'}</span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span className="text-slate-700">{new Date(detailRecord.hitlReview.reviewedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                <QCFieldDiffView record={detailRecord} coreFieldDefs={detailFieldDefs} />
                {detailRecord.qcReview?.status === 'rejected' && (() => {
                  const reason = getQcReason(detailRecord.qcReview);
                  return <div className="m-3 p-2.5 bg-red-50 border border-red-200 text-[11px] text-red-900"><strong>Rejected:</strong> {reason || <em>no reason provided</em>}</div>;
                })()}
              </div>
              {!detailRecord.qcReview?.status && (
                <div className="border-t border-slate-200 bg-white p-4 flex-shrink-0 sticky bottom-0">
                  <button onClick={() => { archiveRecords([detailRecord], activeBatch.id); updateRecordQcReview(activeBatch.id, [detailRecord.id], { status: 'archived', reviewedAt: new Date().toISOString(), reviewer: currentUser?.email || currentUser?.username || 'unknown' }); }} className="w-full px-3 py-2.5 text-sm font-bold rounded-md bg-gradient-to-b from-emerald-600 to-emerald-800 text-white hover:from-emerald-500 hover:to-emerald-700 shadow-md shadow-emerald-900/20 border border-emerald-900/40 flex items-center justify-center gap-2 transition-all"><CheckCircle2 size={14} />Approve &amp; Archive</button>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center text-slate-400"><FileText size={28} className="mx-auto mb-2" /><div className="text-sm">Select a record to compare AI vs HITL</div></div>
            </div>
          )}
        </aside>
      </div>
      </>)}

      {qcHistoryRecord && <RecordHistoryModal record={qcHistoryRecord} onClose={() => setQcHistoryRecord(null)} />}
    </div>
  );
}
