import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Check, Flag, X, AlertTriangle, Search,
  Edit2, Save, ChevronDown, ChevronUp,
  FileText, Activity, CheckCircle2, AlertCircle,
  Eye, Bot, User, RefreshCw, Scissors, Inbox
} from 'lucide-react';
import { PageHeader } from '../../components/shared/PageHeader.jsx';
import Button from '../../components/shared/Button.jsx';
import FlagBadge from '../../components/shared/FlagBadge.jsx';
import PdfPageRenderer from '../../components/pdf/PdfPageRenderer.jsx';
import BoundingBoxOverlay from '../../components/pdf/BoundingBoxOverlay.jsx';
import { PAGE_TYPES, PAGE_TYPE_ORDER } from '../../constants/pageTypes.js';
import { getQcDestination, getQcFlaggedFields, getQcReason, getQcHistory, getConfTier } from '../../utils/qcUtils.js';
import { extractDonationRecord } from '../../utils/aiExtraction.js';
import { pgLockRecord, pgUnlockRecord, pgFetchBatchPage } from '../../utils/pgApi.js';
import NCVOutreachModal from './modals/NCVOutreachModal.jsx';
import RecordHistoryModal from '../QC/modals/RecordHistoryModal.jsx';

// ==================== CHECK VISUAL ====================
const CheckVisual = ({ cheque }) => {
  const { cf } = cheque;
  return (
    <svg viewBox="0 0 800 340" className="w-full h-auto">
      <rect x="0" y="0" width="800" height="340" fill="white" />
      <rect x="8" y="8" width="784" height="324" fill="none" stroke="#cbd5e1" strokeWidth="0.5" />
      <text x="30" y="40" fontSize="13" fontWeight="700" fill="#1e293b">{cf.donorName.length > 55 ? cf.donorName.slice(0, 55) + '…' : cf.donorName}</text>
      <text x="30" y="56" fontSize="9" fill="#475569">{cf.donorAddress}</text>
      <text x="520" y="40" fontSize="10" fontWeight="600" fill="#334155">{cf.bank}</text>
      <text x="730" y="40" fontSize="16" fontWeight="700" fill="#1e293b" textAnchor="end">{cf.chequeNo}</text>
      <text x="550" y="110" fontSize="9" fill="#64748b">CHECK DATE</text>
      <text x="550" y="128" fontSize="12" fontWeight="600" fill="#0f172a">{cf.date}</text>
      <text x="30" y="155" fontSize="9" fill="#64748b">PAY TO THE ORDER OF</text>
      <text x="30" y="178" fontSize="13" fontWeight="600" fill="#0f172a">The Salvation Army</text>
      <text x="30" y="205" fontSize="9" fill="#64748b">AMOUNT IN WORDS</text>
      <text x="30" y="224" fontSize="12" fontStyle="italic" fill="#0f172a">**{cf.amountWords}**</text>
      <text x="600" y="205" fontSize="9" fill="#64748b">AMOUNT</text>
      <text x="600" y="228" fontSize="18" fontWeight="700" fill="#0f172a">${cf.amountFigures}</text>
      <line x1="500" y1="270" x2="760" y2="270" stroke="#475569" strokeWidth="0.5" />
      <text x="500" y="285" fontSize="8" fill="#64748b">AUTHORIZED SIGNATURE</text>
      <text x="580" y="265" fontSize="16" fontStyle="italic" fill="#334155" opacity="0.7">✓ Signed</text>
      <rect x="30" y="300" width="730" height="22" fill="#f8fafc" />
      <text x="40" y="316" fontSize="12" fontFamily="monospace" fill="#0f172a" letterSpacing="2">{cf.chequeNo}</text>
    </svg>
  );
};

const SPVisual = ({ sp }) => (
  <svg viewBox="0 0 800 600" className="w-full h-auto">
    <rect x="0" y="0" width="800" height="600" fill="white" />
    <rect x="20" y="20" width="760" height="560" fill="none" stroke="#cbd5e1" strokeWidth="0.5" />
    <text x="400" y="70" fontSize="20" fontWeight="800" fill="#1e293b" textAnchor="middle">{sp.type.toUpperCase()}</text>
    <line x1="200" y1="90" x2="600" y2="90" stroke="#94a3b8" strokeWidth="1" />
    <g transform="translate(60, 130)">
      {Object.entries(sp.fields).map(([k, v], i) => (
        <g key={k} transform={`translate(0, ${i * 50})`}>
          <text x="0" y="0" fontSize="10" fontWeight="600" fill="#64748b" letterSpacing="1">{k.replace(/([A-Z])/g, ' $1').toUpperCase().trim()}</text>
          <text x="0" y="22" fontSize="13" fill="#0f172a">{String(v).length > 70 ? String(v).slice(0, 70) + '…' : v}</text>
          <line x1="0" y1="34" x2="680" y2="34" stroke="#e2e8f0" strokeWidth="0.5" />
        </g>
      ))}
    </g>
  </svg>
);

// ==================== FIELD ROW ====================
const FieldRow = ({ label, value, confidence, confidenceByPage = null, spMatches, crossValidation = [], isNCV, onToggleNCV, isEditing, onEdit, onSave, onCancel, editValue, setEditValue,
  hasBox = false, boxPage = null, isActive = false, onActivate, onHover, onHoverOut,
  pageBadgePosition = 'inline',
  activeTabPage = null, onTabChange = null,
  isFlaggedByQc = false,
  pageOrder = null }) => {
  const currentPage = activeTabPage || boxPage;
  const effectiveConfidence = (() => {
    if (confidenceByPage && currentPage && typeof confidenceByPage[currentPage] === 'number') {
      return confidenceByPage[currentPage];
    }
    return confidence;
  })();
  const conf = getConfTier(effectiveConfidence);
  const showInlineBadge = hasBox && pageBadgePosition === 'inline';
  const showAboveBadge = hasBox && pageBadgePosition === 'above';
  return (
    <div
      className={`group py-1 border-b border-slate-100 last:border-b-0 transition-colors ${isActive ? 'bg-amber-50/60 -mx-2 px-2 ' : ''} ${isFlaggedByQc && !isActive ? 'bg-orange-50/40' : ''}`}
      onMouseEnter={onHover}
      onMouseLeave={onHoverOut}
    >
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <label className="text-[11px] font-semibold text-slate-700 leading-tight truncate flex items-center gap-1">
          {isFlaggedByQc && (
            <span
              className="w-1.5 h-1.5  bg-orange-500 flex-shrink-0 ring-1 ring-orange-300"
              title="Flagged by QC — focus here"
            ></span>
          )}
          {label}
        </label>
        <div className="flex items-center gap-1 flex-shrink-0">
          {showInlineBadge && (
            <button
              onClick={onActivate}
              className={`px-1.5 py-0.5  text-[9px] font-bold tracking-wider transition-all border ${
                isActive
                  ? 'bg-blue-700 text-white border-blue-800 shadow-sm'
                  : 'text-blue-700 hover:bg-blue-50 border-blue-300 hover:border-blue-500'
              }`}
              title={`Show source on ${boxPage} page`}
            >
              {boxPage}
            </button>
          )}
          <button
            onClick={onToggleNCV}
            className={`px-1.5 py-0.5  text-[9px] font-bold tracking-wider transition-all ${
              isNCV
                ? 'bg-gradient-to-b from-amber-500 to-amber-700 text-white shadow-sm shadow-amber-900/30 border border-amber-800'
                : 'text-slate-400 hover:text-amber-800 hover:bg-amber-50 border border-slate-200 hover:border-amber-400 opacity-0 group-hover:opacity-100 focus:opacity-100'
            }`}
            title="Toggle Need Customer Verification"
          >
            NCV
          </button>
          <span className={`text-[9px] font-bold px-1.5 py-0.5  border ${conf.pill}`} title={confidenceByPage && currentPage && typeof confidenceByPage[currentPage] === 'number' ? `Confidence on ${currentPage} page · ${effectiveConfidence}%` : `Field confidence · ${effectiveConfidence}%`}>{effectiveConfidence}%</span>
        </div>
      </div>

      {showAboveBadge && (
        <div className="mb-0.5 flex items-end gap-0.5 flex-wrap">
          {(() => {
            const allCodes = new Set();
            if (boxPage) allCodes.add(boxPage);
            for (const cv of (crossValidation || [])) {
              for (const s of (cv.sources || [])) {
                if (s) allCodes.add(s);
              }
            }
            const ordered = Array.from(allCodes).sort(
              (a, b) => PAGE_TYPE_ORDER.indexOf(a) - PAGE_TYPE_ORDER.indexOf(b)
            );
            const currentTab = activeTabPage || boxPage;
            const isInteractive = onTabChange && ordered.length > 1;
            return ordered.map(code => {
              const isCurrent = code === currentTab;
              return (
                <button
                  key={code}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isInteractive) onTabChange(code);
                  }}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5  text-[9px] font-bold tracking-wider transition-all border-t border-l border-r ${
                    isCurrent
                      ? 'bg-blue-700 text-white border-blue-800 shadow-sm cursor-pointer'
                      : isInteractive
                        ? 'text-blue-700 hover:bg-blue-50 border-blue-300 hover:border-blue-500 bg-white cursor-pointer'
                        : 'text-slate-500 border-slate-200 bg-slate-50 cursor-default'
                  }`}
                  title={isInteractive ? `Show value extracted from ${code}` : `Source page · ${code}`}
                >
                  {isCurrent && <FileText size={9} />}
                  {code}
                </button>
              );
            });
          })()}
        </div>
      )}

      <div onClick={hasBox && !isEditing ? onActivate : undefined} style={hasBox && !isEditing ? { cursor: 'pointer' } : undefined}>
        {isEditing ? (
          <div className="flex gap-1">
            <input value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }} className="flex-1 px-3 py-1 text-sm bg-white border border-blue-500  focus:outline-none focus:ring-2 focus:ring-blue-200" autoFocus />
            <Button variant="success" size="sm" icon={Save} onClick={onSave}>Save</Button>
            <button onClick={onCancel} className="p-1.5 text-slate-500 hover:text-slate-700"><X size={13} /></button>
          </div>
        ) : (
          <div className={`relative border-l-2 ${conf.border} bg-white border-t border-r border-b ${isActive ? 'border-blue-500 shadow-sm shadow-blue-200' : 'border-slate-200'} ${showAboveBadge ? ' ' : ''} px-3 py-1 flex items-center gap-2 ${isNCV ? 'ring-1 ring-amber-400' : ''}`}>
            <span className="flex-1 text-sm text-slate-900 break-words">{value || <em className="text-slate-400">empty</em>}</span>
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="text-slate-300 hover:text-blue-700 opacity-0 group-hover:opacity-100 flex-shrink-0"><Edit2 size={12} /></button>
          </div>
        )}
      </div>

      {spMatches.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {spMatches.map((m, i) => (
            <div key={i} className={`text-[10px] flex items-center gap-1 ${m.matches ? 'text-emerald-600' : 'text-red-700'}`}>
              {m.matches ? <Check size={10} /> : <AlertTriangle size={10} />}
              <span>{m.matches ? 'matches' : 'differs from'} SP Pg {m.page}</span>
              {!m.matches && <span className="text-slate-500 truncate">— "{String(m.value).slice(0, 40)}{String(m.value).length > 40 ? '…' : ''}"</span>}
            </div>
          ))}
        </div>
      )}

      {crossValidation.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {crossValidation.map((cv, i) => {
            const rawSources = cv.sources || [];
            const orderedSources = pageOrder && pageOrder.length > 0
              ? [...rawSources].sort((a, b) => {
                  const ai = pageOrder.indexOf(a);
                  const bi = pageOrder.indexOf(b);
                  const aRank = ai === -1 ? 999 : ai;
                  const bRank = bi === -1 ? 999 : bi;
                  return aRank - bRank;
                })
              : rawSources;
            const sources = orderedSources.join('/');
            const consistent = cv.consistent !== false;
            return (
              <div key={i} className={`text-[10px] flex items-start gap-1 ${consistent ? 'text-emerald-700' : 'text-red-700'}`}>
                {consistent ? <Check size={10} className="flex-shrink-0 mt-0.5" /> : <AlertTriangle size={10} className="flex-shrink-0 mt-0.5" />}
                <span className="leading-snug">
                  {consistent ? 'matches' : 'differs across'} <span className="font-mono font-semibold">{sources}</span>
                  {cv.note && <span className="text-slate-500"> — {cv.note}</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const SPField = ({ label, value }) => (
  <div className="py-2 border-b border-slate-100 last:border-b-0 flex items-start gap-3">
    <label className="w-32 flex-shrink-0 text-[11px] font-semibold text-slate-600 leading-tight pt-2">{label}</label>
    <div className="flex-1 min-w-0 bg-white border border-slate-200  px-3 py-1.5 text-sm text-slate-900 break-words">{value || <em className="text-slate-400">empty</em>}</div>
  </div>
);

// ==================== BATCH SELECTOR ====================
const BatchSelector = ({ batches, selectedId, onSelect, placeholder = 'Select a batch…' }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selected = useMemo(() => batches.find(b => b.id === selectedId) || null, [batches, selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter(b => b.id.toLowerCase().includes(q));
  }, [batches, query]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => { setHighlightIdx(0); }, [query, open]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[highlightIdx];
      if (target) { onSelect(target.id); setOpen(false); setQuery(''); }
    }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`text-[11px] font-mono font-semibold pl-2.5 pr-2 py-1  border transition-all flex items-center gap-1.5 min-w-[220px] ${open ? 'bg-blue-900 text-white border-blue-950 shadow-sm' : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400 hover:bg-blue-50'}`}
      >
        {selected ? (
          <>
            <span className="truncate">{selected.id}</span>
            <span className={`text-[9px] flex-shrink-0 ${open ? 'text-blue-200' : 'text-slate-500'}`}>· {selected.records.length} record{selected.records.length !== 1 ? 's' : ''}</span>
          </>
        ) : (
          <span className="text-slate-500 italic">{placeholder}</span>
        )}
        <ChevronDown size={12} className={`flex-shrink-0 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-[320px] bg-white border border-slate-300  shadow-xl overflow-hidden z-50">
          <div className="p-2 border-b border-slate-200 bg-slate-50">
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder={`Search ${batches.length} batch${batches.length !== 1 ? 'es' : ''}…`}
                className="w-full pl-7 pr-2 py-1.5 text-[11px] font-mono border border-slate-300  focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11px] text-slate-500">
                No batches match "{query}"
              </div>
            ) : (
              filtered.map((b, i) => {
                const active = b.id === selectedId;
                const highlighted = i === highlightIdx;
                return (
                  <button
                    key={b.id}
                    onClick={() => { onSelect(b.id); setOpen(false); setQuery(''); }}
                    onMouseEnter={() => setHighlightIdx(i)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${highlighted ? 'bg-blue-50' : ''} ${active ? 'border-l-2 border-blue-700' : 'border-l-2 border-transparent'}`}
                  >
                    <span className="font-mono text-[11px] font-semibold text-slate-800 truncate flex-1">{b.id}</span>
                    <span className="text-[9px] text-slate-500 flex-shrink-0">{b.records.length} record{b.records.length !== 1 ? 's' : ''}</span>
                    {active && <Check size={11} className="text-blue-700 flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
          <div className="px-3 py-1.5 border-t border-slate-200 bg-slate-50 text-[9px] text-slate-500 flex items-center gap-2">
            <kbd className="px-1 bg-white  border border-slate-300 text-[9px]">↑↓</kbd> nav
            <kbd className="px-1 bg-white  border border-slate-300 text-[9px]">↵</kbd> select
            <kbd className="px-1 bg-white  border border-slate-300 text-[9px]">esc</kbd> close
          </div>
        </div>
      )}
    </div>
  );
};

export { FieldRow, SPField, BatchSelector, CheckVisual, SPVisual };

// ==================== HITL SCREEN ====================
const HITLScreen = ({ batches = [], hitlFocus = null, clearHitlFocus = () => {}, updateRecordPairExtraction = () => {}, updateRecordHitlReview = () => {}, updateRecordFlag = () => {}, loadBatchDetail = () => {}, currentUser = null }) => {
  const reviewableBatches = useMemo(
    () => batches
      .filter(b => {
        if (!b.records || b.records.length === 0) return false;
        if (b.status === 'hitl-review') return true;
        const hasHitlRework = b.records.some(r =>
          r.qcReview?.status === 'sent-back' &&
          getQcDestination(r.qcReview) === 'hitl' &&
          !r.hitlReview
        );
        return hasHitlRework;
      })
      .slice()
      .sort((a, b) => b.id.localeCompare(a.id)),
    [batches]
  );
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [pendingRecordFocus, setPendingRecordFocus] = useState(null);

  useEffect(() => {
    const stillValid = reviewableBatches.some(b => b.id === selectedBatchId);
    if (!stillValid && reviewableBatches.length > 0) {
      setSelectedBatchId(reviewableBatches[0].id);
    } else if (reviewableBatches.length === 0 && selectedBatchId !== null) {
      setSelectedBatchId(null);
    }
  }, [reviewableBatches, selectedBatchId]);

  useEffect(() => {
    if (!hitlFocus) return;
    const { batchId, recordId } = hitlFocus;
    if (batchId && reviewableBatches.some(b => b.id === batchId)) {
      setSelectedBatchId(batchId);
      setPendingRecordFocus(recordId || null);
    }
    clearHitlFocus();
  }, [hitlFocus, reviewableBatches, clearHitlFocus]);

  const activeRealBatch = useMemo(
    () => selectedBatchId ? reviewableBatches.find(b => b.id === selectedBatchId) : null,
    [selectedBatchId, reviewableBatches]
  );

  const records = useMemo(() => {
    if (!activeRealBatch) return [];
    const srcRecords = (activeRealBatch.records || []).filter(r => {
      if (r.qcReview?.status === 'sent-back' && getQcDestination(r.qcReview) === 'preprep') return false;
      if (r.qcReview?.status === 'archived' || r.qcReview?.status === 'rejected') return false;
      const hitlDecided = r.hitlReview?.status === 'approved' || r.hitlReview?.status === 'hold';
      if (hitlDecided && r.qcReview?.status !== 'sent-back') return false;
      return true;
    });
    return srcRecords.map((rec) => {
      const extracted = rec.extractedRecord || null;
      const donor = extracted?.donor || {};
      const donation = extracted?.donation || {};
      const donorConf = extracted?.donorConf || {};
      const donationConf = extracted?.donationConf || {};
      const rawBoxes = extracted?.boxes || {};
      const boxes = {};
      const BOX_PATH_TO_KEY = {
        'donor.name': 'donorName',
        'donor.address': 'donorAddress',
        'donor.donorId': 'donorId',
        'donation.amount': 'amount',
        'donation.date': 'date',
        'donation.chequeNo': 'chequeNo',
        'donation.amountWords': 'amountWords',
        'donation.signature': 'signature',
        'donation.cardLast4': 'cardLast4',
        'donation.cardExpiry': 'cardExpiry',
        'donation.cardType': 'cardType',
        'donation.authCode': 'authCode',
        'donation.invoiceNo': 'invoiceNo',
        'donation.grantId': 'grantId',
        'donation.fundName': 'fundName',
        'donation.actualDonor': 'actualDonor',
        'donation.purpose': 'purpose',
        'donation.payee': 'payee'
      };
      for (const [path, box] of Object.entries(rawBoxes)) {
        const flatKey = BOX_PATH_TO_KEY[path];
        if (!flatKey || !box || typeof box !== 'object') continue;
        const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));
        boxes[flatKey] = {
          page: typeof box.page === 'string' ? box.page.toUpperCase() : null,
          x: clamp(box.x), y: clamp(box.y), w: clamp(box.w), h: clamp(box.h)
        };
      }
      return {
        id: rec.id,
        recordId: rec.recordId,
        paymentMethod: extracted?.paymentMethod || rec.paymentMethod || 'Unknown',
        paymentMethodConf: extracted?.paymentMethodConf || 0,
        pages: rec.pages || [],
        pageTypeCodes: rec.pageTypeCodes || (rec.pages || []).map(p => p.code),
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
          signature: donationConf.signature || 0,
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
        },
        crossValidation: extracted?.crossValidation || [],
        pageNotes: extracted?.pageNotes || [],
        boxes,
        filename: (rec.pages && rec.pages[0]?.filename) || `${rec.recordId}.pdf`,
        isReal: true,
        extractionStatus: rec.extractionStatus || 'pending',
        qcReview: rec.qcReview || null,
        hitlReview: rec.hitlReview || null,
        reworkOf: rec.reworkOf || null,
        stage: rec.stage || null
      };
    });
  }, [activeRealBatch]);

  const batchId = activeRealBatch?.id || '';
  const totalRecords = records.length;
  const totalPages = activeRealBatch ? activeRealBatch.pages : 0;

  const [recordIdx, setRecordIdx] = useState(0);
  const [activeDoc, setActiveDoc] = useState(() => {
    const pages = records[0]?.pages || [];
    const primaryPage = pages.find(p => p.code === 'CF') || pages.find(p => p.code === 'RF');
    return { code: primaryPage ? primaryPage.code : 'metadata' };
  });
  const [statuses, setStatuses] = useState(() => records.map(() => 'pending'));
  const [metadataEdits, setMetadataEdits] = useState({});
  const [ncvFlags, setNcvFlags] = useState({});
  const [tabSelections, setTabSelections] = useState({});
  const [extractionByRecord, setExtractionByRecord] = useState({});
  const [extractionError, setExtractionError] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [activeFieldKey, setActiveFieldKey] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pageFileCache, setPageFileCache] = useState({});
  const fetchingPagesRef = useRef(new Set());
  const [loadingPageKeys, setLoadingPageKeys] = useState(new Set());
  const [lockConflict, setLockConflict] = useState(null);

  useEffect(() => {
    setStatuses(records.map(() => 'pending'));
    if (pendingRecordFocus && records.length > 0) {
      const targetIdx = records.findIndex(c => c.id === pendingRecordFocus);
      setRecordIdx(targetIdx >= 0 ? targetIdx : 0);
      setPendingRecordFocus(null);
    } else {
      setRecordIdx(0);
    }
  }, [records.length, activeRealBatch?.id, pendingRecordFocus]);

  const safeRecordIdx = Math.min(recordIdx, records.length - 1);
  const record = records[safeRecordIdx] || records[0];
  const editKey = (field) => `${record?.id}:${field}`;
  const pageOrder = (record?.pages || []).map(p => p.code).filter(Boolean);

  const cvValuesByField = (() => {
    const out = {};
    const flatten = (k) => (k || '').replace(/\.([a-z])/g, (_, c) => c.toUpperCase());
    for (const cv of (record?.crossValidation || [])) {
      const fieldKey = flatten(cv.field);
      if (!fieldKey) continue;
      out[fieldKey] = {
        sources: cv.sources || [],
        values: cv.values || {},
        consistent: cv.consistent !== false
      };
    }
    return out;
  })();

  const getActiveTabPage = (field) => {
    const sel = tabSelections[editKey(field)];
    if (sel) return sel;
    const box = record?.boxes?.[field];
    return box?.page || null;
  };

  const getFieldValue = (field) => {
    const edit = metadataEdits[editKey(field)];
    if (edit !== undefined) return edit;
    const cv = cvValuesByField[field];
    const activeTab = tabSelections[editKey(field)];
    if (cv && activeTab && cv.values[activeTab] !== undefined && cv.values[activeTab] !== '') {
      return cv.values[activeTab];
    }
    return record?.fields?.[field] ?? '';
  };

  const setTabFor = (field, code) => {
    setTabSelections(p => ({ ...p, [editKey(field)]: code }));
    setMetadataEdits(p => {
      const k = editKey(field);
      if (!(k in p)) return p;
      const next = { ...p };
      delete next[k];
      return next;
    });
  };

  const isNCV = (field) => !!ncvFlags[editKey(field)];
  const ncvCount = record ? Object.entries(ncvFlags).filter(([k, v]) => v && k.startsWith(record.id + ':')).length : 0;
  const editCount = record ? Object.keys(metadataEdits).filter(k => k.startsWith(record.id + ':')).length : 0;

  useEffect(() => {
    // Default to the cheque/receipt image instead of the Extraction Summary —
    // reviewers work through large record sets and shouldn't have to click into
    // the image every time; falls back to metadata only when no CF/RF page exists.
    const pages = record?.pages || [];
    const primaryPage = pages.find(p => p.code === 'CF') || pages.find(p => p.code === 'RF');
    setActiveDoc({ code: primaryPage ? primaryPage.code : 'metadata' });
    setEditingField(null);
    setActiveFieldKey(null);
  }, [safeRecordIdx, activeRealBatch?.id]);

  useEffect(() => {
    if (!selectedBatchId) return;
    const batch = batches.find(b => b.id === selectedBatchId);
    if (batch?._summary) loadBatchDetail(selectedBatchId);
  }, [selectedBatchId, batches]);

  const username = currentUser?.email || currentUser?.username || 'unknown';
  useEffect(() => {
    if (!record || !batchId || !record.recordId) return;
    setLockConflict(null);
    pgLockRecord(batchId, record.recordId, username).then(result => {
      if (result.conflict) setLockConflict({ lockedBy: result.lockedBy });
    });
    return () => {
      pgUnlockRecord(batchId, record.recordId);
    };
  }, [record?.recordId, batchId]);

  // Fetches every page of the current record up front (not just the active tab) so
  // the page-thumbnail strip has content to show immediately instead of only after
  // each thumbnail is clicked.
  useEffect(() => {
    if (!record || !batchId || !record.recordId) return;
    (record.pages || []).forEach(page => {
      if (!page || (page.file && !page.pageStored) || page.fileBase64) return;
      const fname = page.filename || page.name || 'page.pdf';
      const key = `${batchId}|${record.recordId}|${fname}`;
      if (fetchingPagesRef.current.has(key)) return;
      fetchingPagesRef.current.add(key);
      setLoadingPageKeys(prev => { const s = new Set(prev); s.add(key); return s; });
      pgFetchBatchPage(batchId, record.recordId, fname).then(data => {
        if (!data) {
          fetchingPagesRef.current.delete(key);
          setLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
          return;
        }
        // data.url is the WebP preview (fast, pre-rendered at upload time); data.originalUrl
        // is the real PDF. Prefer the WebP image when it's ready — it's an <img>, so it loads
        // and decodes far faster than fetching+parsing a full PDF through pdf.js, and doesn't
        // hit the canvas-size limits PDF rendering can. Only fall back to the real PDF when no
        // WebP preview exists yet (mimeType missing/non-image) or the request explicitly needs
        // the original (data.originalUrl with no WebP counterpart).
        if (data.mimeType && data.mimeType.startsWith('image/') && data.url) {
          setPageFileCache(prev => ({ ...prev, [key]: { kind: 'url', url: data.url, mimeType: data.mimeType } }));
          setLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
        } else if (data.originalUrl || data.url) {
          fetch(data.originalUrl || data.url)
            .then(r => r.arrayBuffer())
            .then(buf => {
              setPageFileCache(prev => ({ ...prev, [key]: { kind: 'file', file: new File([buf], fname, { type: 'application/pdf' }) } }));
              setLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
            })
            .catch(() => {
              fetchingPagesRef.current.delete(key);
              setLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
            });
        } else if (data.fileBase64) {
          try {
            const bytes = Uint8Array.from(atob(data.fileBase64), c => c.charCodeAt(0));
            setPageFileCache(prev => ({ ...prev, [key]: { kind: 'file', file: new File([bytes], fname, { type: 'application/pdf' }) } }));
            setLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
          } catch {
            fetchingPagesRef.current.delete(key);
            setLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
          }
        } else {
          fetchingPagesRef.current.delete(key);
          setLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
        }
      }).catch(() => {
        fetchingPagesRef.current.delete(key);
        setLoadingPageKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
      });
    });
  }, [record?.recordId, batchId]);

  const startEdit = (field) => { setEditingField(field); setEditValue(getFieldValue(field) ?? ''); };
  const saveEdit = (field) => {
    const currentVal = getFieldValue(field) ?? '';
    const incoming = editValue ?? '';
    setEditingField(null);
    if (String(incoming) === String(currentVal)) return;
    setMetadataEdits(p => ({ ...p, [editKey(field)]: incoming }));
  };
  const toggleNCV = (field) => setNcvFlags(p => ({ ...p, [editKey(field)]: !p[editKey(field)] }));

  const focusField = useCallback((fieldKey) => {
    setActiveFieldKey(fieldKey);
    if (activeDoc.code === 'metadata') return;
    const box = record?.boxes?.[fieldKey];
    if (box?.page && box.page !== activeDoc.code) {
      const targetPage = record?.pages?.find(p => p.code === box.page);
      if (targetPage) setActiveDoc({ code: box.page });
    }
  }, [record, activeDoc.code]);

  const goPrev = useCallback(() => setRecordIdx(i => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setRecordIdx(i => Math.min(records.length - 1, i + 1)), [records.length]);

  const commitVisibleValues = useCallback(() => {
    if (!record) return;
    const updates = {};
    for (const cv of (record.crossValidation || [])) {
      const flatten = (k) => (k || '').replace(/\.([a-z])/g, (_, c) => c.toUpperCase());
      const fieldKey = flatten(cv.field);
      if (!fieldKey) continue;
      const k = `${record.id}:${fieldKey}`;
      if (k in metadataEdits) continue;
      const tabPick = tabSelections[k];
      if (tabPick && cv.values && cv.values[tabPick] !== undefined && cv.values[tabPick] !== '') {
        updates[k] = cv.values[tabPick];
      }
    }
    if (Object.keys(updates).length > 0) {
      setMetadataEdits(p => ({ ...p, ...updates }));
    }
  }, [record, metadataEdits, tabSelections]);

  const buildReviewState = useCallback((status) => {
    if (!record) return null;
    const lockedFields = {};
    const edits = {};
    const ncvFields = [];
    const tabPicks = {};

    const allKeys = new Set([
      ...Object.keys(record.fields || {}),
      ...Object.keys(record.boxes || {})
    ]);
    for (const fieldKey of allKeys) {
      const k = `${record.id}:${fieldKey}`;
      const editVal = metadataEdits[k];
      const tabPick = tabSelections[k];
      let finalValue;
      if (editVal !== undefined) {
        finalValue = editVal;
        edits[fieldKey] = editVal;
      } else if (tabPick) {
        const cv = (record.crossValidation || []).find(c => {
          const flat = (c.field || '').replace(/\.([a-z])/g, (_, c2) => c2.toUpperCase());
          return flat === fieldKey;
        });
        if (cv && cv.values && cv.values[tabPick] !== undefined && cv.values[tabPick] !== '') {
          finalValue = cv.values[tabPick];
          tabPicks[fieldKey] = tabPick;
        } else {
          finalValue = record.fields?.[fieldKey] ?? '';
        }
      } else {
        finalValue = record.fields?.[fieldKey] ?? '';
      }
      lockedFields[fieldKey] = finalValue;
      if (ncvFlags[k]) ncvFields.push(fieldKey);
    }

    return {
      status,
      lockedFields,
      edits,
      tabPicks,
      ncvFields,
      reviewedAt: new Date().toISOString(),
      reviewer: currentUser?.email || currentUser?.username || 'unknown'
    };
  }, [record, metadataEdits, tabSelections, ncvFlags, currentUser]);

  const approve = useCallback(() => {
    if (ncvCount > 0) return;
    commitVisibleValues();
    const reviewState = buildReviewState('approved');
    if (reviewState && activeRealBatch?.id && record?.id) {
      updateRecordHitlReview(activeRealBatch.id, record.id, reviewState);
    }
    setStatuses(p => { const n = [...p]; n[safeRecordIdx] = 'approved'; return n; });
    setRecordIdx(i => Math.min(records.length - 1, i + 1));
  }, [safeRecordIdx, records.length, ncvCount, commitVisibleValues, buildReviewState, activeRealBatch?.id, record?.id, updateRecordHitlReview]);

  // Flags the record and lets it continue downward through the pipeline (same
  // advance behavior as approve) — replaces the old Hold/Pre-Prep buttons.
  // Flagged records aren't blocked or routed backward; they flow through QC to
  // Archive normally, where they can be found (and deleted, if needed) later
  // via the Repository's Flagged filter.
  const flagAndContinue = useCallback(() => {
    if (!activeRealBatch?.id || !record?.id) return;
    commitVisibleValues();
    updateRecordFlag(activeRealBatch.id, record.id, true);
    const reviewState = buildReviewState('approved');
    if (reviewState) {
      updateRecordHitlReview(activeRealBatch.id, record.id, reviewState);
    }
    setStatuses(p => { const n = [...p]; n[safeRecordIdx] = 'approved'; return n; });
    setRecordIdx(i => Math.min(records.length - 1, i + 1));
  }, [safeRecordIdx, records.length, commitVisibleValues, buildReviewState, activeRealBatch?.id, record?.id, updateRecordHitlReview, updateRecordFlag]);

  const runExtraction = useCallback(async () => {
    if (!record || !record.pages || record.pages.length === 0) return;
    const cid = record.id;
    setExtractionError(null);
    setExtractionByRecord(prev => ({ ...prev, [cid]: 'running' }));
    try {
      const result = await extractDonationRecord(record.pages);
      updateRecordPairExtraction(activeRealBatch?.id, cid, result);
      setExtractionByRecord(prev => ({ ...prev, [cid]: 'done' }));
    } catch (err) {
      console.error('Extraction failed:', err);
      setExtractionError(err?.message || 'Extraction failed');
      setExtractionByRecord(prev => ({ ...prev, [cid]: 'error' }));
    }
  }, [record, activeRealBatch?.id, updateRecordPairExtraction]);

  const toggleFlag = useCallback(() => {
    if (!activeRealBatch?.id || !record?.id) return;
    updateRecordFlag(activeRealBatch.id, record.id, !record.flagged);
  }, [activeRealBatch?.id, record?.id, record?.flagged, updateRecordFlag]);

  useEffect(() => {
    const handler = (e) => {
      if (editingField || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft' || e.key === 'j') { e.preventDefault(); goPrev(); }
      else if (e.key === 'ArrowRight' || e.key === 'k') { e.preventDefault(); goNext(); }
      else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); approve(); }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); flagAndContinue(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goPrev, goNext, approve, flagAndContinue, editingField]);

  const paymentIsCheque = (record?.paymentMethod || 'Cheque') === 'Cheque';
  const paymentIsCard = record?.paymentMethod === 'CreditCard';

  const coreFieldDefs = paymentIsCheque ? [
    { key: 'date',          label: 'Donation Date' },
    { key: 'donorName',     label: 'Donor Name' },
    { key: 'donorAddress',  label: 'Donor Address' },
    { key: 'paymentMethod', label: 'Donation Type' },
    { key: 'amountWords',   label: 'Amount in Words' },
    { key: 'amount',        label: 'Amount in Number' },
    { key: 'chequeNo',      label: 'Check / Credit Card Number' },
  ] : paymentIsCard ? [
    { key: 'date',          label: 'Donation Date' },
    { key: 'donorName',     label: 'Donor Name' },
    { key: 'donorAddress',  label: 'Donor Address' },
    { key: 'paymentMethod', label: 'Donation Type' },
    { key: 'amount',        label: 'Amount in Number' },
    { key: 'cardLast4',     label: 'Credit Card Number' },
    { key: 'cardExpiry',    label: 'Expiration Date' },
  ] : [
    { key: 'date',          label: 'Donation Date' },
    { key: 'donorName',     label: 'Donor Name' },
    { key: 'donorAddress',  label: 'Donor Address' },
    { key: 'paymentMethod', label: 'Donation Type' },
    { key: 'amountWords',   label: 'Amount in Words' },
    { key: 'amount',        label: 'Amount in Number' },
    { key: 'invoiceNo',     label: 'Check / Credit Card Number' },
  ];

  const fieldDefs = [
    { key: 'donorName',    label: 'Donor Name' },
    { key: 'donorAddress', label: 'Donor Address' },
    { key: 'amount',       label: 'Amount in Number' },
    { key: 'date',         label: 'Donation Date' },
    ...(paymentIsCheque ? [
      { key: 'chequeNo',   label: 'Check Number' },
      { key: 'amountWords',label: 'Amount in Words' }
    ] : []),
    ...(paymentIsCard ? [
      { key: 'cardLast4',  label: 'Credit Card Number' },
      { key: 'cardExpiry', label: 'Expiration Date' }
    ] : []),
    ...(!paymentIsCheque && !paymentIsCard ? [
      { key: 'invoiceNo',  label: 'Check / Credit Card Number' }
    ] : [])
  ];

  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const imageContainerRef = useRef(null);

  useEffect(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
    setRotation(0);
    setPanMode(false);
  }, [activeDoc.code, safeRecordIdx]);

  const zoomIn = () => setZoomLevel(z => Math.min(4, z + 0.25));
  const zoomOut = () => setZoomLevel(z => Math.max(0.5, z - 0.25));
  const resetView = () => { setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); setRotation(0); setPanMode(false); };
  const rotateRight = () => setRotation(r => (r + 90) % 360);

  const canPan = zoomLevel > 1 || panMode;

  const onImageMouseDown = (e) => {
    if (!canPan) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, offsetX: panOffset.x, offsetY: panOffset.y };
  };
  const onImageMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPanOffset({ x: dragStartRef.current.offsetX + dx, y: dragStartRef.current.offsetY + dy });
  };
  const onImageMouseUp = () => setIsDragging(false);

  if (!record) {
    return (
      <>
        <div className="px-6 py-4 flex-shrink-0 relative" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #0b1a36 40%, #0a1020 100%)' }}>
          <PageHeader
            tone="dark"
            title="HITL Review"
            eyebrow="PROCESSING"
            description="Review Extracted Fields, Flag Discrepancies, and Approve Records Before QC"
            className="mb-0"
          />
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-center p-8 max-w-md">
            <Inbox size={40} className="text-slate-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-700">No donation records to review</h3>
            <p className="text-sm text-slate-500 mt-1">Upload batches in Import &rarr; run AI Extraction to bring donation records here.</p>
          </div>
        </div>
      </>
    );
  }

  const currentStatus = statuses[safeRecordIdx] || 'pending';

  const METADATA_TAB = { id: 'metadata', code: 'metadata', label: 'Record Metadata', detail: 'Unified', accent: 'bg-blue-700', hex: '#1e40af' };
  const pageTabs = (record.pages || []).map(p => {
    const pt = PAGE_TYPES[p.code];
    return {
      id: p.code,
      code: p.code,
      label: pt?.label || p.code,
      detail: p.code,
      accent: pt?.accent || 'bg-slate-500',
      hex: pt?.hex || '#64748b'
    };
  });
  const docTabs = [METADATA_TAB, ...pageTabs];

  const activeTab = docTabs.find(t => t.id === activeDoc.code) || docTabs[0];
  const activePage = (record.pages || []).find(p => p.code === activeTab.code);
  const pageCacheKey = activePage ? `${batchId}|${record.recordId}|${activePage.filename || activePage.name || 'page.pdf'}` : null;
  const pageCacheEntry = pageCacheKey ? pageFileCache[pageCacheKey] : null;
  const viewerFile = activePage?.file || (pageCacheEntry?.kind === 'file' ? pageCacheEntry.file : null) || null;
  const viewerImageUrl = !viewerFile && pageCacheEntry?.kind === 'url' ? pageCacheEntry.url : null;
  const isPageLoading = pageCacheKey ? loadingPageKeys.has(pageCacheKey) : false;

  return (
    <>
      <div className="px-6 py-3 flex-shrink-0 relative" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #0b1a36 40%, #0a1020 100%)' }}>
        <PageHeader
          tone="dark"
          title="HITL Review"
          eyebrow="PROCESSING"
          description="Review Extracted Fields, Flag Discrepancies, and Approve Records Before QC"
          className="mb-0"
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              {selectedBatchId && (() => {
                const sel = reviewableBatches.find(b => b.id === selectedBatchId);
                if (!sel) return null;
                return (
                  <div
                    className="text-[10px] font-mono font-semibold px-2.5 py-1.5  bg-slate-900/60 border border-slate-700/50 text-white flex items-center gap-1.5 max-w-[220px]"
                    title={`Reviewing ${sel.id}`}
                  >
                    <span className="w-1.5 h-1.5  bg-emerald-400 animate-pulse flex-shrink-0"></span>
                    <span className="truncate">{sel.id}</span>
                    <span className="text-[9px] text-slate-400 flex-shrink-0">· {sel.records.length}r</span>
                  </div>
                );
              })()}
              {reviewableBatches.length > 1 && (
                <BatchSelector
                  batches={reviewableBatches}
                  selectedId={selectedBatchId}
                  onSelect={setSelectedBatchId}
                  placeholder="Switch…"
                />
              )}
              <div className="flex gap-1.5 font-mono">
                <div className="text-center px-2.5 py-1  bg-slate-900/60 border border-slate-700/50 min-w-[48px]">
                  <div className="text-sm font-black text-blue-300 tabular-nums leading-none">{totalRecords}</div>
                  <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Records</div>
                </div>
                <div className="text-center px-2.5 py-1  bg-slate-900/60 border border-slate-700/50 min-w-[48px]">
                  <div className="text-sm font-black text-blue-300 tabular-nums leading-none">{totalPages}</div>
                  <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Pages</div>
                </div>
              </div>
              <div className="flex items-center gap-1 px-1.5 py-1  bg-slate-900/60 border border-slate-700/50">
                <button
                  onClick={goPrev}
                  disabled={safeRecordIdx === 0}
                  className="w-6 h-6  text-slate-300 hover:text-white hover:bg-slate-700/60 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  title="Previous (←)"
                >
                  <ChevronLeft size={13} />
                </button>
                <div className="px-2 text-[10px] font-mono font-bold text-white tabular-nums whitespace-nowrap">
                  REC {safeRecordIdx + 1} / {records.length}
                </div>
                <button
                  onClick={goNext}
                  disabled={safeRecordIdx === records.length - 1}
                  className="w-6 h-6  text-slate-300 hover:text-white hover:bg-slate-700/60 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  title="Next (→)"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
              {(record.pages || []).length > 0 && (
                <div className="flex items-center gap-1 px-2 py-1  bg-slate-900/60 border border-slate-700/50">
                  <FileText size={10} className="text-slate-400 flex-shrink-0" />
                  {(record.pages || []).map((p, i) => {
                    const pt = PAGE_TYPES[p.code];
                    const tone = {
                      CF: 'bg-blue-500/25 text-blue-200 ring-blue-400/30',
                      CB: 'bg-blue-500/15 text-blue-300 ring-blue-400/20',
                      SF: 'bg-emerald-500/25 text-emerald-200 ring-emerald-400/30',
                      SB: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20',
                      VF: 'bg-amber-500/25 text-amber-200 ring-amber-400/30',
                      VB: 'bg-amber-500/15 text-amber-300 ring-amber-400/20',
                      LF: 'bg-violet-500/25 text-violet-200 ring-violet-400/30',
                      LB: 'bg-violet-500/15 text-violet-300 ring-violet-400/20',
                    }[p.code] || 'bg-slate-500/25 text-slate-300 ring-slate-400/30';
                    return (
                      <span
                        key={i}
                        className={`text-[9px] font-bold px-1.5 py-0.5  ring-1 ring-inset ${tone}`}
                        title={pt?.label || p.code}
                      >
                        {p.code}
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                {(() => {
                  const isRework = record.qcReview?.status === 'sent-back';
                  const fromRepo = record.qcReview?.source === 'repository';
                  if (isRework) {
                    return (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-black px-2 py-1  uppercase tracking-wider ring-1 ring-inset bg-orange-500/25 text-orange-200 ring-orange-400/50" title={fromRepo ? 'Sent back from Digital Repository' : 'Sent back from QC for rework'}>
                          Re-Work
                        </span>
                        {fromRepo && (
                          <span className="text-[10px] font-bold px-2 py-1  uppercase tracking-wider ring-1 ring-inset bg-violet-500/25 text-violet-200 ring-violet-400/50" title="This record was sent back from the Digital Repository">
                            From Repo
                          </span>
                        )}
                      </div>
                    );
                  }
                  const darkStatusTone = {
                    approved: 'bg-emerald-500/20 text-emerald-300 ring-emerald-400/40',
                    hold:     'bg-amber-500/20 text-amber-300 ring-amber-400/40',
                    pending:  'bg-slate-700/60 text-slate-300 ring-slate-600',
                  }[currentStatus] || 'bg-slate-700/60 text-slate-300 ring-slate-600';
                  return (
                    <span className={`text-[10px] font-bold px-2 py-1  uppercase tracking-wider ring-1 ring-inset ${darkStatusTone}`}>
                      {currentStatus}
                    </span>
                  );
                })()}
                {ncvCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-1  bg-gradient-to-b from-amber-500 to-amber-700 text-white shadow-sm shadow-amber-900/30 border border-amber-800 tracking-wider">
                    {ncvCount} NCV
                  </span>
                )}
                {editCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-1  bg-blue-500/25 text-blue-200 ring-1 ring-inset ring-blue-400/40 flex items-center gap-1">
                    <Edit2 size={10} /> {editCount}
                  </span>
                )}
                <FlagBadge flagged={!!record.flagged} reason={record.flagReason} onToggle={toggleFlag} />
              </div>
            </div>
          }
        />
      </div>

      <div className="bg-slate-50 border-b border-slate-200 px-6 flex-shrink-0 overflow-x-auto">
        <div className="flex items-end gap-1 min-w-max">
          {docTabs.map((tab, ti) => {
            const active = tab.id === activeTab.id;
            const isPrimary = tab.code === 'CF' || tab.code === 'RF';
            const isNonMeta = tab.code !== 'metadata' && tab.code !== undefined;
            return (
              <button key={ti} onClick={() => setActiveDoc({ code: tab.code })} className={`px-4 py-2 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${active ? 'text-slate-800 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`} style={active ? { borderBottomColor: tab.hex } : { borderBottomColor: 'transparent' }}>
                <span className={`w-1.5 h-1.5  ${tab.accent}`}></span>
                {tab.label}
                <span className="text-slate-400 font-normal">· {tab.detail}</span>
                {isNonMeta && (
                  isPrimary
                    ? <span className="ml-0.5 text-[9px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-700 ring-1 ring-blue-200 uppercase tracking-wide" title="Sent to AI Extraction">AI</span>
                    : <span className="ml-0.5 text-[9px] font-bold px-1 py-0.5 rounded bg-slate-100 text-slate-400 ring-1 ring-slate-200 uppercase tracking-wide" title="Bypasses AI Extraction">Skip</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 grid overflow-hidden bg-slate-50 px-6 py-4 gap-3" style={{ gridTemplateColumns: '1fr clamp(420px, 40vw, 720px)' }}>
        <div className="flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-slate-200 flex-shrink-0">
            <h3 className="text-xs font-bold text-slate-700 truncate flex-1 min-w-0">
              {activeDoc.code === 'metadata'
                ? <>Extraction Summary{record.recordId && <span className="ml-2 text-slate-400 font-normal">· Record {record.recordId}</span>}</>
                : <>{activeTab.label} ({activeTab.code}){record.recordId && <span className="ml-2 text-slate-400 font-normal">· Record {record.recordId}</span>}</>
              }
            </h3>
            {activeDoc.code !== 'metadata' && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={zoomOut} disabled={zoomLevel <= 0.5} className="w-7 h-7 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center transition-colors" title="Zoom out">
                <span className="text-slate-700 text-sm font-bold leading-none">−</span>
              </button>
              <div className="px-2 py-1 text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-300  tabular-nums min-w-[50px] text-center">
                {Math.round(zoomLevel * 100)}%
              </div>
              <button onClick={zoomIn} disabled={zoomLevel >= 4} className="w-7 h-7 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center transition-colors" title="Zoom in">
                <span className="text-slate-700 text-sm font-bold leading-none">+</span>
              </button>
              <div className="w-px h-5 bg-slate-200 mx-1"></div>
              <button onClick={rotateRight} className="w-7 h-7 rounded border border-slate-300 hover:bg-slate-50 flex items-center justify-center transition-colors" title="Rotate 90°">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-700">
                  <path d="M21 12a9 9 0 11-9-9 9 9 0 016.36 2.64M21 3v6h-6" />
                </svg>
              </button>
              <button onClick={resetView} className="w-7 h-7 rounded border border-slate-300 hover:bg-slate-50 flex items-center justify-center transition-colors" title="Reset zoom & rotation">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-700">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
              <div className="w-px h-5 bg-slate-200 mx-1"></div>
              <button
                onClick={() => setPanMode(m => !m)}
                className={`w-7 h-7  border flex items-center justify-center transition-colors ${panMode ? 'bg-blue-100 border-blue-400 text-blue-800 shadow-inner' : 'border-slate-300 hover:bg-slate-50 text-slate-700'}`}
                title={panMode ? 'Pan mode active · click to exit' : 'Pan mode · click then drag to move'}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"></path>
                  <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"></path>
                  <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"></path>
                  <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path>
                </svg>
              </button>
            </div>
            )}
          </div>
          {activeDoc.code !== 'metadata' && pageTabs.length > 1 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-slate-200 flex-shrink-0 overflow-x-auto">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex-shrink-0">Pages:</span>
              {pageTabs.map(tab => {
                const tabPage = (record.pages || []).find(p => p.code === tab.code);
                const tabCacheKey = tabPage ? `${batchId}|${record.recordId}|${tabPage.filename || tabPage.name || 'page.pdf'}` : null;
                const tabCacheEntry = tabCacheKey ? pageFileCache[tabCacheKey] : null;
                const tabFile = tabPage?.file || (tabCacheEntry?.kind === 'file' ? tabCacheEntry.file : null) || null;
                const tabImageUrl = !tabFile && tabCacheEntry?.kind === 'url' ? tabCacheEntry.url : null;
                const active = tab.code === activeDoc.code;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveDoc({ code: tab.code })}
                    className={`flex-shrink-0 flex flex-col items-center gap-1 p-1 rounded border-2 transition-colors ${active ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                    title={tab.label}
                  >
                    <div className="w-12 h-16 bg-slate-100 overflow-hidden flex items-center justify-center">
                      {tabFile ? (
                        <PdfPageRenderer file={tabFile} pageNum={1} scale={0.3} />
                      ) : tabImageUrl ? (
                        <img src={tabImageUrl} alt={tab.label} className="w-full h-full object-cover" />
                      ) : (
                        <FileText size={14} className="text-slate-300" />
                      )}
                    </div>
                    <span className={`text-[9px] font-bold ${active ? 'text-blue-800' : 'text-slate-500'}`}>{tab.code}</span>
                  </button>
                );
              })}
            </div>
          )}
          {activeDoc.code === 'metadata' ? (
            (() => {
              const pages = record.pages || [];
              const confEntries = Object.entries(record.fieldsConf || {}).filter(([, c]) => typeof c === 'number' && c > 0);
              const allConfs = confEntries.map(([, c]) => c);
              const avgConf = allConfs.length > 0 ? Math.round(allConfs.reduce((s, c) => s + c, 0) / allConfs.length) : null;
              const avgTier = avgConf !== null ? getConfTier(avgConf) : null;
              const fieldCount = Object.values(record.fields || {}).filter(v => v && v.toString().trim()).length;
              const highCount = allConfs.filter(c => c >= 90).length;
              const medCount = allConfs.filter(c => c >= 70 && c < 90).length;
              const lowCount = allConfs.filter(c => c < 70).length;
              const totalForDist = highCount + medCount + lowCount;
              const cvList = record.crossValidation || [];
              const cvMatch = cvList.filter(cv => cv.consistent !== false);
              const cvDiffer = cvList.filter(cv => cv.consistent === false);
              const pm = record.paymentMethod || 'Unknown';
              const pmCfg = pm === 'Cheque'
                ? { bg: 'from-emerald-500 to-emerald-700', ring: 'ring-emerald-200', text: 'Check' }
                : pm === 'CreditCard'
                  ? { bg: 'from-purple-500 to-purple-700', ring: 'ring-purple-200', text: 'Credit Card' }
                  : { bg: 'from-slate-400 to-slate-600', ring: 'ring-slate-200', text: 'Unknown' };
              return (
                <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-blue-50/20">
                  <div className="p-5 max-w-3xl mx-auto">
                    <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b border-slate-200">
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Extraction Summary</div>
                        <div className="font-mono text-xl font-black text-slate-800 tracking-tight truncate">{record.recordId || record.id}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Batch {activeRealBatch?.id || '—'}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1  bg-gradient-to-br ${pmCfg.bg} text-white font-bold text-[10px] tracking-wider uppercase shadow-md ring-2 ${pmCfg.ring}`}>
                          <FileText size={10} />{pmCfg.text}
                        </div>
                        <div className="text-[9px] text-slate-500">Donation Mode</div>
                      </div>
                    </div>
                    {record.qcReview?.status === 'sent-back' && (
                      <div className={`mb-4 px-3 py-2.5 border text-[11px] leading-snug ${record.qcReview.source === 'repository' ? 'bg-violet-50 border-violet-200 text-violet-900' : 'bg-orange-50 border-orange-200 text-orange-900'}`}>
                        {record.qcReview.source === 'repository'
                          ? <>
                              <div className="font-bold mb-0.5">Sent back from Digital Repository</div>
                              <div className="text-[10px]">After approval here, this record will return to <strong>QC</strong> for final sign-off.</div>
                            </>
                          : <>
                              <div className="font-bold mb-0.5">Sent back from QC for rework</div>
                              <div className="text-[10px]">After approval here, this record will return to <strong>QC</strong>.</div>
                            </>
                        }
                        {record.qcReview.reason && <div className="mt-1 text-[10px] italic">Reason: {record.qcReview.reason}</div>}
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2.5 mb-4">
                      <div className={` border-2 p-2.5 ${avgConf !== null ? (avgTier.pill.match(/border-\S+/) || ['border-slate-200'])[0] : 'border-slate-200'} bg-white shadow-sm`}>
                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Avg Confidence</div>
                        {avgConf !== null ? (
                          <>
                            <div className={`text-2xl font-black tabular-nums leading-tight mt-0.5 ${(avgTier.pill.match(/text-\S+/) || ['text-slate-800'])[0]}`}>{avgConf}<span className="text-base">%</span></div>
                            <div className="text-[9px] text-slate-500 mt-0.5">across {allConfs.length} field{allConfs.length !== 1 ? 's' : ''}</div>
                          </>
                        ) : (
                          <div className="text-xs text-slate-400 italic mt-1.5">Pending</div>
                        )}
                      </div>
                      <div className=" border-2 border-slate-200 p-2.5 bg-white shadow-sm">
                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Fields Extracted</div>
                        <div className="text-2xl font-black text-slate-800 tabular-nums leading-tight mt-0.5">{fieldCount}</div>
                        <div className="text-[9px] text-slate-500 mt-0.5">non-empty values</div>
                      </div>
                      <div className=" border-2 border-slate-200 p-2.5 bg-white shadow-sm min-w-0">
                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Source Pages</div>
                        <div className="text-2xl font-black text-slate-800 tabular-nums leading-tight mt-0.5">{pages.length}</div>
                        <div className="text-[9px] text-slate-500 mt-0.5 truncate">{pages.map(p => p.code).join(' · ')}</div>
                      </div>
                    </div>
                    {totalForDist > 0 && (
                      <div className="mb-4  border border-slate-200 bg-white p-2.5 shadow-sm">
                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Confidence Distribution</div>
                        <div className="flex h-2.5  overflow-hidden">
                          {highCount > 0 && <div className="bg-emerald-500" style={{ width: `${(highCount / totalForDist) * 100}%` }} title={`${highCount} field${highCount !== 1 ? 's' : ''} ≥90%`}></div>}
                          {medCount > 0 && <div className="bg-amber-500" style={{ width: `${(medCount / totalForDist) * 100}%` }} title={`${medCount} field${medCount !== 1 ? 's' : ''} 70-89%`}></div>}
                          {lowCount > 0 && <div className="bg-rose-500" style={{ width: `${(lowCount / totalForDist) * 100}%` }} title={`${lowCount} field${lowCount !== 1 ? 's' : ''} <70%`}></div>}
                        </div>
                        <div className="flex items-center justify-between mt-1.5 gap-2 text-[9px] flex-wrap">
                          <span className="flex items-center gap-1 text-emerald-700"><span className="w-1.5 h-1.5  bg-emerald-500"></span><span className="font-bold tabular-nums">{highCount}</span> high <span className="text-slate-400">(≥90%)</span></span>
                          <span className="flex items-center gap-1 text-amber-700"><span className="w-1.5 h-1.5  bg-amber-500"></span><span className="font-bold tabular-nums">{medCount}</span> medium <span className="text-slate-400">(70-89%)</span></span>
                          <span className="flex items-center gap-1 text-rose-700"><span className="w-1.5 h-1.5  bg-rose-500"></span><span className="font-bold tabular-nums">{lowCount}</span> low <span className="text-slate-400">(&lt;70%)</span></span>
                        </div>
                      </div>
                    )}
                    <div className=" border border-slate-200 bg-white shadow-sm overflow-hidden">
                      <div className="px-2.5 py-1.5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cross-Validation</div>
                        <div className="flex items-center gap-2.5 text-[10px]">
                          <span className="flex items-center gap-1 text-emerald-700"><Check size={10} className="flex-shrink-0" /><span className="font-bold tabular-nums">{cvMatch.length}</span> matching</span>
                          <span className="flex items-center gap-1 text-rose-700"><AlertTriangle size={10} className="flex-shrink-0" /><span className="font-bold tabular-nums">{cvDiffer.length}</span> differing</span>
                        </div>
                      </div>
                      {cvList.length === 0 ? (
                        <div className="px-3 py-5 text-center">
                          <div className="text-[11px] text-slate-500 italic">No cross-page references on this record.</div>
                          <div className="text-[10px] text-slate-400 mt-1">{pages.length === 1 ? 'Single-page records have nothing to cross-check.' : 'AI did not flag any shared fields across pages.'}</div>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {cvDiffer.map((cv, i) => {
                            const fieldKey = (cv.field || '').replace(/\.([a-z])/g, (_, c) => c.toUpperCase());
                            const fieldDef = fieldDefs.find(fd => fd.key === fieldKey);
                            const label = fieldDef?.label || cv.field;
                            return (
                              <button key={`d-${i}`} onClick={() => focusField(fieldKey)} className="w-full px-2.5 py-1.5 flex items-start gap-2 text-left hover:bg-rose-50/50 transition-colors group" title="Click to highlight this field on the right panel">
                                <AlertTriangle size={12} className="text-rose-600 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[11px] font-bold text-slate-800 group-hover:text-rose-800">{label}</span>
                                    <span className="text-[9px] font-bold text-rose-700 uppercase tracking-wider">differs across</span>
                                    <div className="flex items-center gap-0.5">{(cv.sources || []).map((src, si) => <span key={si} className="text-[9px] font-bold px-1 py-0.5  bg-rose-100 text-rose-800 border border-rose-200">{src}</span>)}</div>
                                  </div>
                                  {cv.note && <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{cv.note}</div>}
                                </div>
                              </button>
                            );
                          })}
                          {cvMatch.map((cv, i) => {
                            const fieldKey = (cv.field || '').replace(/\.([a-z])/g, (_, c) => c.toUpperCase());
                            const fieldDef = fieldDefs.find(fd => fd.key === fieldKey);
                            const label = fieldDef?.label || cv.field;
                            return (
                              <button key={`m-${i}`} onClick={() => focusField(fieldKey)} className="w-full px-2.5 py-1.5 flex items-start gap-2 text-left hover:bg-emerald-50/40 transition-colors group" title="Click to highlight this field on the right panel">
                                <Check size={12} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[11px] font-semibold text-slate-700 group-hover:text-emerald-800">{label}</span>
                                    <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider">matches</span>
                                    <div className="flex items-center gap-0.5">{(cv.sources || []).map((src, si) => <span key={si} className="text-[9px] font-bold px-1 py-0.5  bg-emerald-100 text-emerald-800 border border-emerald-200">{src}</span>)}</div>
                                  </div>
                                  {cv.note && <div className="text-[10px] text-slate-500 mt-0.5 leading-snug truncate">{cv.note}</div>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
          <div
            ref={imageContainerRef}
            className={`flex-1 overflow-hidden flex items-center justify-center p-6 select-none ${canPan ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'}`}
            style={{ background: '#f1f5f9' }}
            onMouseDown={onImageMouseDown}
            onMouseMove={onImageMouseMove}
            onMouseUp={onImageMouseUp}
            onMouseLeave={onImageMouseUp}
          >
            <div
              className="relative transition-transform duration-150"
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel}) rotate(${rotation}deg)`,
                filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.12)) drop-shadow(0 3px 8px rgba(0,0,0,0.08))',
                transformOrigin: 'center center'
              }}
            >
              <div className="relative bg-white border border-slate-200  overflow-hidden">
                {viewerFile || viewerImageUrl ? (
                  <div className="w-[760px] relative">
                    {viewerFile ? (
                      <PdfPageRenderer file={viewerFile} pageNum={1} scale={2} />
                    ) : (
                      <img src={viewerImageUrl} alt={activeTab.label} className="w-full h-auto block" />
                    )}
                    {record?.boxes && (
                      <BoundingBoxOverlay
                        boxes={record.boxes}
                        fieldDefs={fieldDefs}
                        activeFieldKey={activeFieldKey}
                        activePageCode={activeDoc.code}
                        confidences={record.fieldsConf}
                        onActivate={focusField}
                      />
                    )}
                  </div>
                ) : activePage ? (
                  isPageLoading ? (
                    <div className="w-[760px] h-[400px] flex items-center justify-center bg-slate-50">
                      <div className="text-center text-slate-500">
                        <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
                        <div className="text-sm font-medium">Loading PDF…</div>
                        <div className="text-[10px] mt-1 text-slate-400 font-mono">{activePage.filename || activeTab.label}</div>
                      </div>
                    </div>
                  ) : (
                  <div className="w-[760px] h-[400px] flex items-center justify-center bg-amber-50/40 border border-dashed border-amber-300 ">
                    <div className="text-center text-slate-600 max-w-md px-6">
                      <RefreshCw size={28} className="mx-auto mb-3 text-amber-600" />
                      <div className="text-sm font-semibold text-slate-800">PDF preview unavailable</div>
                      <div className="text-[11px] mt-2 text-slate-600 leading-relaxed">
                        The page metadata is stored, but the source PDF could not be retrieved. Field data and bounding boxes are still available. To see the PDF preview, re-import this batch from the Import screen.
                      </div>
                      <div className="text-[10px] mt-3 text-slate-400 font-mono">
                        Page · {activeTab.label} ({activeTab.code}) · {activePage.filename || 'no filename'}
                      </div>
                    </div>
                  </div>
                  )
                ) : (
                  <div className="w-[760px] h-[400px] flex items-center justify-center bg-slate-50 border border-dashed border-slate-300 ">
                    <div className="text-center text-slate-400">
                      <FileText size={32} className="mx-auto mb-2" />
                      <div className="text-sm font-medium">No {activeTab.label} page in this record</div>
                      <div className="text-xs mt-1">This donation record doesn't include a {activeTab.code} page.</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
          {canPan && (
            <div className="px-4 py-1.5 bg-blue-50 border-t border-blue-100 text-[10px] text-blue-800 flex items-center gap-2 flex-shrink-0">
              <span className="w-1.5 h-1.5  bg-blue-500 animate-pulse"></span>
              <span>{panMode ? 'Pan mode · click and drag to move the image' : 'Click and drag to pan'} · use <kbd className="px-1 bg-white  border border-blue-200">−</kbd> <kbd className="px-1 bg-white  border border-blue-200">+</kbd> to zoom</span>
            </div>
          )}
        </div>
        <aside className="bg-white border-l border-slate-200 overflow-y-auto flex flex-col">
          <div className="border-b border-slate-200 bg-white px-4 py-3 flex-shrink-0 sticky top-0 z-20 shadow-sm">
            {(() => {
              const isTerminal = record.qcReview?.status === 'archived' || record.qcReview?.status === 'rejected';
              if (isTerminal) {
                const isArchived = record.qcReview?.status === 'archived';
                return (
                  <div className={` border ${isArchived ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'} px-3 py-2.5`}>
                    <div className="flex items-center gap-2">
                      {isArchived ? <CheckCircle2 size={14} className="text-emerald-700 flex-shrink-0" /> : <X size={14} className="text-red-700 flex-shrink-0" />}
                      <div className="min-w-0">
                        <div className={`text-[11px] font-bold ${isArchived ? 'text-emerald-900' : 'text-red-900'} uppercase tracking-wider`}>{isArchived ? 'Archived' : 'Rejected'} · Read-Only</div>
                        <div className={`text-[10px] ${isArchived ? 'text-emerald-700' : 'text-red-700'} mt-0.5`}>QC has finalized this record. Field edits are disabled.</div>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <>
                  {lockConflict && (
                    <div className="mb-2 px-3 py-2  border border-amber-300 bg-amber-50 text-[11px] text-amber-800 flex items-center gap-2">
                      <AlertTriangle size={13} className="flex-shrink-0 text-amber-600" />
                      <span><span className="font-bold">{lockConflict.lockedBy}</span> is reviewing this record. Your changes may conflict — coordinate before approving.</span>
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="warning" size="sm" icon={Flag} onClick={flagAndContinue} title="Flag this record for review and continue to QC">Flag</Button>
                    <Button variant="success" size="sm" icon={Check} onClick={approve} disabled={ncvCount > 0}>Approve</Button>
                  </div>
                  <div className="mt-1.5 text-[10px] text-slate-400 text-center">
                    {ncvCount > 0 ? (
                      <span className="text-amber-700">{ncvCount} field{ncvCount === 1 ? '' : 's'} marked NCV · approve disabled · use Flag</span>
                    ) : (
                      <span>All fields clear · ready to approve</span>
                    )}
                    <span className="mx-2 text-slate-300">·</span>
                    <kbd className="px-1 bg-slate-100  text-slate-600">←/→</kbd> nav · <kbd className="px-1 bg-slate-100  text-slate-600">A</kbd> approve · <kbd className="px-1 bg-slate-100  text-slate-600">F</kbd> flag
                  </div>
                </>
              );
            })()}
          </div>
          <div className="flex-1 p-3">
            {record.qcReview?.status === 'sent-back' && (() => {
              const qcReason = getQcReason(record.qcReview);
              const flagged = getQcFlaggedFields(record.qcReview);
              return (
                <div className="mb-3  border-l-4 border-orange-500 bg-orange-50 px-3 py-2.5 shadow-sm">
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6  bg-orange-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <ChevronLeft size={13} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black px-1.5 py-0.5  bg-orange-600 text-white uppercase tracking-wider">RE-WORK</span>
                        {flagged.length > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5  bg-orange-200 text-orange-900 ring-1 ring-orange-300" title={`Flagged fields: ${flagged.join(', ')}`}>
                            {flagged.length} field{flagged.length === 1 ? '' : 's'} flagged
                          </span>
                        )}
                        <span className="text-[10px] text-orange-900">
                          Sent back by QC
                          {record.qcReview.reviewer && <span className="font-semibold"> · {record.qcReview.reviewer}</span>}
                          {record.qcReview.reviewedAt && (
                            <span className="text-orange-700"> · {new Date(record.qcReview.reviewedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          )}
                        </span>
                      </div>
                      <div className="mt-1.5 text-[12px] text-orange-900 leading-snug break-words">
                        {qcReason && qcReason.trim().length > 0
                          ? qcReason
                          : <em className="text-orange-600">No reason provided. Re-review and re-approve to return to QC.</em>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
            {record.reworkOf && (
              <div className="mb-3  border-l-4 border-violet-500 bg-violet-50 px-3 py-2 shadow-sm">
                <div className="flex items-start gap-2">
                  <Scissors size={13} className="text-violet-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 text-[11px]">
                    <div className="text-violet-900">
                      <span className="font-bold">Split from</span>{' '}
                      <span className="font-mono font-bold">{record.reworkOf.originalRecordId}</span>
                      {record.reworkOf.splitAt && <span className="text-violet-700">{' · '}{new Date(record.reworkOf.splitAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                    {record.reworkOf.originalQcReason && <div className="mt-0.5 text-violet-800 italic break-words">Original QC reason: "{record.reworkOf.originalQcReason}"</div>}
                  </div>
                </div>
              </div>
            )}
            <div className="mb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="text-sm font-bold text-slate-800 truncate min-w-0">Donation Record · {record.recordId || '—'}</h3>
                  {(() => {
                    const wasReworked = ((record.qcReview?.history?.length || 0) > 0 || !!record.reworkOf) && record.qcReview?.status !== 'sent-back';
                    if (!wasReworked) return null;
                    return <button onClick={() => setHistoryOpen(true)} className="text-[9px] font-bold px-1.5 py-0.5  bg-violet-100 text-violet-800 ring-1 ring-violet-200 hover:bg-violet-200 transition-colors uppercase tracking-wider flex-shrink-0" title="This record has been through a rework cycle — click to view history">Reworked</button>;
                  })()}
                  {(() => {
                    const hasHistory = (record.qcReview?.history?.length || 0) > 0 || !!record.reworkOf || record.qcReview?.status === 'sent-back';
                    if (!hasHistory) return null;
                    return (
                      <button onClick={() => setHistoryOpen(true)} className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 px-1.5 py-0.5  hover:bg-slate-100 transition-colors flex items-center gap-1 flex-shrink-0" title="Show audit history for this record">
                        <Activity size={10} />
                        History
                      </button>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5  uppercase tracking-wider ${record.paymentMethod === 'Cheque' ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-200' : record.paymentMethod === 'CreditCard' ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'}`}>
                    {record.paymentMethod === 'CreditCard' ? 'Credit Card' : record.paymentMethod === 'Cheque' ? 'Check' : record.paymentMethod}
                  </span>
                  {(() => {
                    const exStatus = extractionByRecord[record?.id] || record?.extractionStatus || 'pending';
                    const hasFiles = (record?.pages || []).some(p => !!p.file);
                    if (exStatus === 'pending' && !hasFiles && (record?.pages?.length || 0) > 0) {
                      return <span className="inline-flex items-center justify-center w-6 h-6  bg-slate-100 text-slate-500 border border-slate-300 flex-shrink-0" title="PDFs unavailable after refresh — return to Import to re-stage this batch"><AlertCircle size={11} /></span>;
                    }
                    if (exStatus === 'running') {
                      return <span className="inline-flex items-center justify-center w-6 h-6  bg-amber-50 text-amber-800 border border-amber-200 flex-shrink-0" title="AI extraction is finishing — please wait"><RefreshCw size={11} className="animate-spin" /></span>;
                    }
                    if (exStatus === 'error') {
                      return <span className="inline-flex items-center justify-center w-6 h-6  bg-red-50 text-red-800 border border-red-200 flex-shrink-0" title={`Extraction failed${extractionError ? ': ' + extractionError : ''}`}><AlertCircle size={11} /></span>;
                    }
                    return null;
                  })()}
                </div>
              </div>
              {extractionError && (extractionByRecord[record?.id] === 'error') && (
                <p className="text-[10px] text-red-700 mt-1.5 bg-red-50 border border-red-200  px-2 py-1">{extractionError}</p>
              )}
            </div>
            <div>
              {(() => {
                const cvList = record.crossValidation || [];
                const cvByField = {};
                const flatten = (k) => k.replace(/\.([a-z])/g, (_, c) => c.toUpperCase());
                for (const cv of cvList) {
                  const key = flatten(cv.field || '');
                  if (!key) continue;
                  if (!cvByField[key]) cvByField[key] = [];
                  cvByField[key].push(cv);
                }

                const isMetadataView = activeDoc.code === 'metadata';
                let visibleFields;
                if (isMetadataView) {
                  visibleFields = coreFieldDefs;
                } else {
                  visibleFields = fieldDefs.filter(fd => {
                    const box = record.boxes?.[fd.key];
                    if (box && box.page === activeDoc.code) return true;
                    const cvs = cvByField[fd.key] || [];
                    return cvs.some(cv => (cv.sources || []).includes(activeDoc.code));
                  });
                }

                if (!isMetadataView && visibleFields.length === 0) {
                  return (
                    <div className="py-6 text-center text-slate-500 text-[11px]">
                      <FileText size={20} className="mx-auto mb-2 text-slate-300" />
                      No fields were extracted from this page.
                      <div className="text-[10px] text-slate-400 mt-1">Switch to Record Metadata for the unified view.</div>
                    </div>
                  );
                }

                return (
                  <>
                    {visibleFields.map(fd => {
                      const box = record.boxes?.[fd.key];
                      const fieldCvs = cvByField[fd.key] || [];
                      const confByPage = (() => {
                        if (fieldCvs.length === 0) return null;
                        const merged = {};
                        for (const cv of fieldCvs) {
                          if (cv && typeof cv.confByPage === 'object' && cv.confByPage) {
                            for (const [code, n] of Object.entries(cv.confByPage)) {
                              if (typeof n === 'number') merged[code] = n;
                            }
                          }
                        }
                        return Object.keys(merged).length > 0 ? merged : null;
                      })();
                      let displayValue = getFieldValue(fd.key);
                      const isPrimaryOnThisPage = !!(box && box.page === activeDoc.code);
                      const isCoReferencedHere = !isMetadataView && !isPrimaryOnThisPage;
                      if (isCoReferencedHere) {
                        for (const cv of fieldCvs) {
                          const pageVal = cv?.values?.[activeDoc.code];
                          if (typeof pageVal === 'string' && pageVal.length > 0) {
                            const ek = `${record.id}:${fd.key}`;
                            if (!(ek in metadataEdits)) {
                              displayValue = pageVal;
                            }
                            break;
                          }
                        }
                      }
                      return (
                        <FieldRow
                          key={fd.key}
                          label={fd.label}
                          value={displayValue}
                          confidence={record.fieldsConf[fd.key] || 0}
                          confidenceByPage={confByPage}
                          spMatches={[]}
                          crossValidation={isMetadataView ? fieldCvs : []}
                          pageOrder={pageOrder}
                          isNCV={isNCV(fd.key)}
                          onToggleNCV={() => toggleNCV(fd.key)}
                          isEditing={editingField === fd.key}
                          onEdit={() => startEdit(fd.key)}
                          onSave={() => saveEdit(fd.key)}
                          onCancel={() => setEditingField(null)}
                          editValue={editValue}
                          setEditValue={setEditValue}
                          hasBox={!!box && (isMetadataView || box.page === activeDoc.code)}
                          boxPage={box?.page || null}
                          pageBadgePosition={isMetadataView ? 'above' : 'hidden'}
                          isActive={activeFieldKey === fd.key}
                          onActivate={() => focusField(fd.key)}
                          onHover={() => box && box.page === activeDoc.code && setActiveFieldKey(fd.key)}
                          onHoverOut={() => setActiveFieldKey(prev => prev === fd.key ? null : prev)}
                          activeTabPage={isMetadataView ? getActiveTabPage(fd.key) : null}
                          onTabChange={isMetadataView ? (code) => setTabFor(fd.key, code) : null}
                          isFlaggedByQc={getQcFlaggedFields(record.qcReview).includes(fd.key)}
                        />
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </div>
        </aside>
      </div>

      {historyOpen && record && (
        <RecordHistoryModal
          record={record}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </>
  );
};

export default HITLScreen;
