// PrePrepScreen — Pre-Preparation module.
// Raw PDF intake — operator uploads multi-page PDFs, classifies pages, marks record breaks, sends to AI Extraction.
//
// Extracted from App.jsx monolith and wrapped as a standalone module.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  RefreshCw, Upload, FileText, Download, Zap, X,
  ChevronLeft, ChevronRight, AlertCircle,
  FileSpreadsheet, RotateCcw, RotateCw,
  Crop, Trash, Flag,
} from 'lucide-react';
import { PageHeader } from '../../components/shared/PageHeader.jsx';
import Button from '../../components/shared/Button.jsx';
import { loadPdfJs, loadPdfLib } from '../../utils/pdfUtils.js';
import { loadJSZip, generateBatchId, LEGACY_CODE_REMAP } from '../../utils/batchUtils.js';
import { PAGE_TYPES, PAGE_TYPE_ORDER, PAGE_COLORS } from '../../constants/pageTypes.js';
import { useAuth } from '../../context/AuthContext.jsx';
//
// Lifecycle:
//   Upload PDF      → intake[] updated → saved to IndexedDB automatically
//   Refresh page    → PrePrepScreen loads intake[] from IndexedDB on mount
//   Send to Extraction → IndexedDB cleared (batch is now in the pipeline / React state)
// =============================================================================
const IDB_PREPREP_VERSION = 2;
const IDB_PREPREP_STORE   = 'intake';
const IDB_PREPREP_META_STORE = 'meta';

// Each user gets their own IDB so preprep data never leaks across tenants/users.
const getPrePrepDbName = (username) => `sadrmp-preprep-${username ?? 'anonymous'}`;

// Document types selectable for a crop segment. Matches PAGE_TYPE_ORDER's
// non-legacy codes (crop is a new-page-only workflow, no VF/VB/SF/SB legacy aliases).
const CROP_SELECTABLE_KINDS = ['CF', 'CB', 'LF', 'LB', 'RF', 'RB', 'OT'];

function openPrePrepDB(dbName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, IDB_PREPREP_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_PREPREP_STORE)) {
        db.createObjectStore(IDB_PREPREP_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(IDB_PREPREP_META_STORE)) {
        db.createObjectStore(IDB_PREPREP_META_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror  = (e) => reject(e.target.error);
  });
}

async function idbSaveIntake(dbName, docs) {
  try {
    const db = await openPrePrepDB(dbName);
    const tx = db.transaction(IDB_PREPREP_STORE, 'readwrite');
    const store = tx.objectStore(IDB_PREPREP_STORE);
    store.clear();
    // pdfDoc is a pdf.js PDFDocumentProxy — it contains internal handles and methods
    // that the structured clone algorithm cannot serialize, causing a DataCloneError
    // and silently dropping the entire save. Strip it here; it is re-created from
    // the File blob when the screen mounts after a refresh.
    docs.forEach(doc => {
      const { pdfDoc: _ignored, ...storable } = doc;
      store.put(storable);
    });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = (e) => rej(e.target.error); });
    db.close();
  } catch (e) { console.warn('IDB preprep save failed:', e); }
}

async function idbLoadIntake(dbName) {
  try {
    const db = await openPrePrepDB(dbName);
    const tx = db.transaction(IDB_PREPREP_STORE, 'readonly');
    const docs = await new Promise((res, rej) => {
      const req = tx.objectStore(IDB_PREPREP_STORE).getAll();
      req.onsuccess = (e) => res(e.target.result || []);
      req.onerror   = (e) => rej(e.target.error);
    });
    db.close();
    return docs;
  } catch (e) { console.warn('IDB preprep load failed:', e); return []; }
}

async function idbClearIntake(dbName) {
  try {
    const db = await openPrePrepDB(dbName);
    const tx = db.transaction(IDB_PREPREP_STORE, 'readwrite');
    tx.objectStore(IDB_PREPREP_STORE).clear();
    db.close();
  } catch (e) { console.warn('IDB preprep clear failed:', e); }
}

async function idbSaveMeta(dbName, meta) {
  try {
    const db = await openPrePrepDB(dbName);
    const tx = db.transaction(IDB_PREPREP_META_STORE, 'readwrite');
    tx.objectStore(IDB_PREPREP_META_STORE).put({ id: 'config', ...meta });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = (e) => rej(e.target.error); });
    db.close();
  } catch (e) { console.warn('IDB preprep meta save failed:', e); }
}

async function idbLoadMeta(dbName) {
  try {
    const db = await openPrePrepDB(dbName);
    const tx = db.transaction(IDB_PREPREP_META_STORE, 'readonly');
    const record = await new Promise((res, rej) => {
      const req = tx.objectStore(IDB_PREPREP_META_STORE).get('config');
      req.onsuccess = (e) => res(e.target.result || null);
      req.onerror   = (e) => rej(e.target.error);
    });
    db.close();
    return record;
  } catch (e) { console.warn('IDB preprep meta load failed:', e); return null; }
}

async function idbClearMeta(dbName) {
  try {
    const db = await openPrePrepDB(dbName);
    const tx = db.transaction(IDB_PREPREP_META_STORE, 'readwrite');
    tx.objectStore(IDB_PREPREP_META_STORE).clear();
    db.close();
  } catch (e) { console.warn('IDB preprep meta clear failed:', e); }
}


// ---------- Helper: render a specific page from an already-loaded pdf.js document ----------
// Takes a parsed pdf.js document object (NOT a raw File). The parent component is
// responsible for parsing the source PDF once and sharing the doc across all thumbnails —
// this avoids the "render error" storm you'd hit if every thumbnail independently tried
// to parse a 200-page PDF (concurrent worker saturation, buffer transfer races, etc).
//
// rotation prop: degrees (0/90/180/270). Passed to pdfjs viewport so the bitmap is
// rendered in the correct orientation natively (cleaner than CSS transform —
// canvas dimensions match what the viewer expects, no aspect-ratio squish).
const PrePrepThumbnail = ({ pdfDoc, pageNum, scale = 0.4, rotation = 0 }) => {
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!pdfDoc) {
      setRendering(true);
      return;
    }
    (async () => {
      try {
        setError(null);
        setRendering(true);
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;
        // Combine pdf-intrinsic rotation (some PDFs declare a base rotation in their
        // metadata) with the operator-requested rotation. Pages that already declare
        // rotation 90 will need an additional +90 from us to land at +180 on screen.
        const baseRotation = (typeof page.rotate === 'number' ? page.rotate : 0) || 0;
        const effectiveRotation = (baseRotation + rotation) % 360;
        const viewport = page.getViewport({ scale, rotation: effectiveRotation });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context unavailable');
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setRendering(false);
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || String(e) || 'Render failed');
          setRendering(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum, scale, rotation]);

  if (error) {
    return (
      <div className="w-full h-full bg-red-50 border border-red-200 flex items-center justify-center text-[9px] text-red-700 p-1 text-center" title={error}>
        <div className="line-clamp-3">{error}</div>
      </div>
    );
  }
  return (
    <div className="w-full h-full relative bg-white">
      <canvas ref={canvasRef} className="w-full h-auto" />
      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
          <RefreshCw size={14} className="text-slate-300 animate-spin" />
        </div>
      )}
    </div>
  );
};

// ---------- Crop Segment Modal ----------
// Lets the operator manually draw crop rectangles on a PDF page to define
// independent segments. Each drawn box becomes a separate exported PDF file
// (and its own donation record via bifurcation).
//
// Coordinates are stored in NORMALISED form (0-1 relative to canvas) so they
// survive any zoom or window-size change between draw and export.
//
// Export pipeline (in exportActiveDoc / sendToImport):
//   1. pdf.js renders the source page to an offscreen canvas at 2x resolution
//   2. For each cropBox, ctx.drawImage crops the region to a temp canvas
//   3. tempCanvas.toDataURL('image/png') -> base64 PNG
//   4. pdf-lib embeds the PNG into a new single-page PDF sized to the crop
//   5. The new PDF is named {baseName}_{001}.pdf, {baseName}_{002}.pdf ...
const CropSegmentModal = ({ page, pdfDoc, recId, kindOcc, onClose, onApply }) => {
  const canvasRef  = useRef(null);
  const overlayRef = useRef(null);
  const [rendered,   setRendered]   = useState(false);
  const [canvasDims, setCanvasDims] = useState({ w: 1, h: 1 });
  // Each box: {x, y, w, h, kind}  (kind defaults to source page kind)
  const [boxes,    setBoxes]   = useState(
    (page.cropBoxes || []).map(b => ({ kind: page.kind, ...b }))
  );
  const [drawing,  setDrawing] = useState(null);
  const [selected, setSelected] = useState(null);

  const sourceOcc    = kindOcc;                            // e.g. "0001"
  const sourceFile   = `${recId}_${page.kind}_${sourceOcc}.pdf`;

  // ── Render PDF page ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const pg    = await pdfDoc.getPage(page.pageNum);
        const base  = pg.getViewport({ scale: 1 });
        const scale = Math.min(900 / base.width, 1100 / base.height, 2);
        const vp    = pg.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width  = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        await pg.render({ canvasContext: ctx, viewport: vp }).promise;
        if (!cancelled) { setCanvasDims({ w: canvas.width, h: canvas.height }); setRendered(true); }
      } catch (e) { console.warn('[CropModal]', e); }
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, page.pageNum]);

  // ── Coordinate helpers ─────────────────────────────────────────────────────
  const toNorm = (px, py) => ({
    x: Math.max(0, Math.min(1, px / canvasDims.w)),
    y: Math.max(0, Math.min(1, py / canvasDims.h)),
  });

  const getPointerPos = (e) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const scaleX = canvasDims.w / rect.width;
    const scaleY = canvasDims.h / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const { x, y } = getPointerPos(e);
    setDrawing({ startX: x, startY: y, curX: x, curY: y });
    setSelected(null);
  };
  const onPointerMove = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const { x, y } = getPointerPos(e);
    setDrawing(d => d ? { ...d, curX: x, curY: y } : null);
  };
  const onPointerUp = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const { startX, startY, curX, curY } = drawing;
    const x = Math.min(startX, curX), y = Math.min(startY, curY);
    const w = Math.abs(curX - startX), h = Math.abs(curY - startY);
    if (w > 20 && h > 20) {
      const n  = toNorm(x, y);
      const n2 = toNorm(x + w, y + h);
      const newBox = { x: n.x, y: n.y, w: n2.x - n.x, h: n2.y - n.y, kind: page.kind };
      setBoxes(prev => { setSelected(prev.length); return [...prev, newBox]; });
    }
    setDrawing(null);
  };

  const deleteBox   = (i) => { setBoxes(prev => prev.filter((_, j) => j !== i)); setSelected(null); };
  const setBoxKind  = (i, kind) => setBoxes(prev => prev.map((b, j) => j === i ? { ...b, kind } : b));

  // ── Per-box filename preview ───────────────────────────────────────────────
  // Track occurrence count per kind across boxes so naming is correct
  const boxFilenames = (() => {
    const kindCount = {};
    return boxes.map((box) => {
      kindCount[box.kind] = (kindCount[box.kind] || 0) + 1;
      const occ    = String(kindCount[box.kind]).padStart(4, '0');
      const segIdx = String(kindCount[box.kind]).padStart(3, '0');
      return `${recId}_${box.kind}_${occ}_${segIdx}.pdf`;
    });
  })();

  // ── Box colours ───────────────────────────────────────────────────────────
  const BOX_COLOURS = [
    '#7c3aed','#2563eb','#059669','#d97706',
    '#dc2626','#db2777','#0284c7','#9333ea',
  ];
  const boxColour = (i) => BOX_COLOURS[i % BOX_COLOURS.length];
  const hexToRgba = (hex, a) => {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-50 flex flex-col"
         onClick={onClose}>
      <div className="flex-1 flex overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* ── Left: canvas ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex-shrink-0 px-4 py-2.5 flex items-center gap-3"
               style={{ background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
            <Crop size={14} className="text-emerald-400" />
            <span className="text-[11px] font-bold text-white">Draw Crop Regions</span>
            <span className="text-[10px] text-slate-400">click and drag to define each segment · set type in the panel →</span>
            <div className="ml-auto flex items-center gap-2">
              {boxes.length > 0 && (
                <button onClick={() => { setBoxes([]); setSelected(null); }}
                  className="text-[10px] font-semibold text-red-400 hover:text-red-300 px-2 py-1 hover:bg-red-900/30 transition-colors">
                  Clear all
                </button>
              )}
              <button onClick={onClose}
                className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Canvas area */}
          <div className="flex-1 overflow-auto bg-slate-900 flex items-start justify-center p-6">
            <div className="relative inline-block shadow-2xl select-none">
              <canvas ref={canvasRef} className="block"
                style={{ maxWidth:'100%', height:'auto', display: rendered ? 'block' : 'none' }} />

              {!rendered && (
                <div className="w-80 h-96 bg-slate-800 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3 text-slate-400">
                    <div className="w-8 h-8 border-2 border-slate-600 border-t-emerald-400 rounded-full animate-spin" />
                    <span className="text-xs font-medium">Rendering PDF page…</span>
                  </div>
                </div>
              )}

              {rendered && (
                <div ref={overlayRef} className="absolute inset-0"
                  style={{ cursor:'crosshair', touchAction:'none' }}
                  onMouseDown={onPointerDown} onMouseMove={onPointerMove} onMouseUp={onPointerUp}
                  onTouchStart={onPointerDown} onTouchMove={onPointerMove} onTouchEnd={onPointerUp}
                >
                  {/* Drawn boxes */}
                  {boxes.map((box, i) => {
                    const col    = boxColour(i);
                    const isSel  = selected === i;
                    return (
                      <div key={i}
                        onClick={e => { e.stopPropagation(); setSelected(i); }}
                        className="absolute"
                        style={{
                          left:       `${box.x * 100}%`,
                          top:        `${box.y * 100}%`,
                          width:      `${box.w * 100}%`,
                          height:     `${box.h * 100}%`,
                          border:     `2.5px solid ${col}`,
                          background: hexToRgba(col, 0.1),
                          boxSizing:  'border-box',
                          outline:    isSel ? '2.5px solid #fff' : 'none',
                          outlineOffset: '2px',
                          boxShadow:  isSel ? `0 0 0 4px ${hexToRgba(col, 0.3)}` : 'none',
                        }}
                      >
                        {/* Index + kind label on box */}
                        <div className="absolute top-0 left-0 flex items-center gap-1 px-1 py-0.5"
                             style={{ background: col, lineHeight: 1.2 }}>
                          <span className="text-[9px] font-black text-white">{String(i+1).padStart(3,'0')}</span>
                          <span className="text-[9px] font-bold text-white opacity-80">·</span>
                          <span className="text-[9px] font-bold text-white">{box.kind}</span>
                        </div>
                        {/* Delete */}
                        <button
                          onClick={e => { e.stopPropagation(); deleteBox(i); }}
                          className="absolute top-0 right-0 w-5 h-5 flex items-center justify-center text-white hover:bg-red-600 transition-colors"
                          style={{ background: col }}
                        ><X size={9} /></button>
                      </div>
                    );
                  })}

                  {/* In-progress drawing */}
                  {drawing && (() => {
                    const x = Math.min(drawing.startX, drawing.curX);
                    const y = Math.min(drawing.startY, drawing.curY);
                    const w = Math.abs(drawing.curX - drawing.startX);
                    const h = Math.abs(drawing.curY - drawing.startY);
                    return (
                      <div className="absolute pointer-events-none" style={{
                        left: `${(x/canvasDims.w)*100}%`, top: `${(y/canvasDims.h)*100}%`,
                        width:`${(w/canvasDims.w)*100}%`, height:`${(h/canvasDims.h)*100}%`,
                        border:'2px dashed rgba(52,211,153,0.9)',
                        background:'rgba(52,211,153,0.06)', boxSizing:'border-box',
                      }} />
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="w-80 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden">

          {/* Panel header */}
          <div className="flex-shrink-0 px-4 py-3 border-b"
               style={{ background:'linear-gradient(135deg,#0f172a 0%,#064e3b 100%)' }}>
            <div className="flex items-center gap-2">
              <Crop size={13} className="text-emerald-400" />
              <span className="text-[11px] font-bold text-white">Crop Segments</span>
            </div>
            <div className="font-mono text-[10px] text-slate-400 mt-0.5">{sourceFile}</div>
          </div>

          {/* Instructions */}
          <div className="flex-shrink-0 px-3 py-2.5 bg-emerald-50 border-b border-emerald-200">
            <p className="text-[10px] text-emerald-900 leading-relaxed">
              Draw boxes on the image. Set the <strong>document type</strong> for each box.
              Each crop becomes a <strong>separate file and record</strong> sent to AI Extraction.
              The original page is retained but <strong>not sent to AI</strong>.
            </p>
          </div>

          {/* Segment list */}
          <div className="flex-1 overflow-y-auto">
            {boxes.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <Crop size={28} className="mx-auto mb-3 text-slate-300" />
                <div className="text-[12px] font-semibold">No segments yet</div>
                <div className="text-[10px] mt-1.5 text-slate-400 leading-relaxed px-4">
                  Draw crop boxes on the page image.<br />Each box = one exported record.
                </div>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {/* Source file row */}
                <div className="flex items-center gap-2 px-2.5 py-2 bg-slate-50 border border-slate-200">
                  <FileText size={11} className="text-slate-400 flex-shrink-0" />
                  <span className="font-mono text-[10px] text-slate-500 flex-1 truncate">{sourceFile}</span>
                  <span className="flex items-center gap-0.5 text-[8px] font-bold bg-slate-200 text-slate-500 px-1.5 py-0.5 flex-shrink-0">
                    retained · not in AI
                  </span>
                </div>

                {/* Crop rows */}
                {boxes.map((box, i) => {
                  const col    = boxColour(i);
                  const isSel  = selected === i;
                  return (
                    <div key={i}
                      onClick={() => setSelected(isSel ? null : i)}
                      className={`border-2 transition-all cursor-pointer ${isSel ? 'shadow-md' : 'shadow-sm'}`}
                      style={{ borderColor: isSel ? col : '#e2e8f0' }}
                    >
                      {/* Box header */}
                      <div className="flex items-center gap-2 px-2.5 py-1.5"
                           style={{ background: isSel ? hexToRgba(col, 0.1) : '#f8fafc' }}>
                        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 text-[9px] font-black text-white"
                             style={{ background: col }}>
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-[10px] text-slate-800 truncate font-semibold">
                            {boxFilenames[i]}
                          </div>
                          <div className="text-[9px] text-slate-400 mt-0.5">
                            {Math.round(box.w * 100)}% × {Math.round(box.h * 100)}% · AI Extraction →
                          </div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); deleteBox(i); }}
                          className="p-1 hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors flex-shrink-0">
                          <Trash size={10} />
                        </button>
                      </div>

                      {/* Type selector — always visible */}
                      <div className="px-2.5 py-2 border-t border-slate-100">
                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Document Type
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          {CROP_SELECTABLE_KINDS.map(k => {
                            const kpt  = PAGE_TYPES[k];
                            const isK  = box.kind === k;
                            return (
                              <button key={k}
                                onClick={e => { e.stopPropagation(); setBoxKind(i, k); }}
                                className="px-1 py-1 text-[9px] font-bold transition-all text-center"
                                style={{
                                  background: isK ? kpt.hex : '#f1f5f9',
                                  color:      isK ? '#fff'  : '#475569',
                                  border:     `1px solid ${isK ? kpt.hex : '#e2e8f0'}`,
                                  transform:  isK ? 'scale(1.05)' : 'scale(1)',
                                }}
                                title={kpt.label}
                              >
                                {k}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-3 py-3 border-t border-slate-200 bg-slate-50 space-y-2">
            {page.cropBoxes?.length > 0 && boxes.length === 0 && (
              <button onClick={() => onApply([])}
                className="w-full text-[11px] font-semibold text-red-600 hover:text-red-800 py-1 hover:bg-red-50 transition-colors">
                Remove all crop segments
              </button>
            )}
            <button onClick={onClose}
              className="w-full px-3 py-1.5 text-[11px] font-semibold text-slate-700 border border-slate-300 bg-white hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button
              disabled={boxes.length === 0}
              onClick={() => onApply(boxes)}
              className="w-full px-3 py-1.5 text-[11px] font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
            >
              <Crop size={12} />
              Apply {boxes.length} Crop Segment{boxes.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Rendering a crop from a full page fixed at a low scale starves small crop boxes
// of resolution — e.g. a 2x-scaled full page gives a box covering 10% of the page
// width only ~10% of that already-modest pixel budget, which is enough to make
// text illegible. This computes a scale that targets a fixed pixel budget for the
// crop's own output (regardless of how small the box is), floored at the previous
// fixed 2x for large/near-full-page crops.
// The scale is applied to render the WHOLE page (then crop a region out of it), so
// it must also stay within a safe absolute canvas size regardless of how small the
// crop is — otherwise a small crop on a large-format scanned page can compute a
// high ratio that produces a full-page canvas exceeding browser/GPU canvas limits,
// silently corrupting the render (and the PDF built from it). Matches the same
// MAX_CANVAS_DIM safety bound used by PdfPageRenderer.jsx.
const CROP_TARGET_LONG_EDGE_PX = 1400;
const CROP_MAX_FULL_PAGE_DIM = 4096;
const cropRenderScale = (pageWidthPt, pageHeightPt, box) => {
  const longEdgePt = Math.max(box.w, box.h) * Math.max(pageWidthPt, pageHeightPt);
  const adaptive = longEdgePt > 0 ? CROP_TARGET_LONG_EDGE_PX / longEdgePt : 2;
  const safetyCap = CROP_MAX_FULL_PAGE_DIM / Math.max(pageWidthPt, pageHeightPt, 1);
  return Math.min(Math.max(adaptive, 2), 5, safetyCap);
};

// ── CropBoxThumbnail ─────────────────────────────────────────────────────────
// Renders just the cropped region of a PDF page (for virtual segment cards).
// Uses the shared pdfDoc reference from the parent intake document.
const CropBoxThumbnail = ({ pdfDoc, pageNum, cropBox, scale = 0.4, rotation = 0 }) => {
  const canvasRef = useRef(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!pdfDoc || !cropBox || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const page    = await pdfDoc.getPage(pageNum);
        const baseRot = (typeof page.rotate === 'number' ? page.rotate : 0) || 0;
        const eff     = (baseRot + rotation) % 360;
        const basePageVp = page.getViewport({ scale: 1 });
        const renderScale = cropRenderScale(basePageVp.width, basePageVp.height, cropBox);
        const vp  = page.getViewport({ scale: renderScale, rotation: eff });
        const tmp = document.createElement('canvas');
        tmp.width  = Math.floor(vp.width);
        tmp.height = Math.floor(vp.height);
        const ctx  = tmp.getContext('2d', { willReadFrequently: true });
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        if (cancelled) return;
        // Crop the box region
        const sx = Math.round(cropBox.x * tmp.width);
        const sy = Math.round(cropBox.y * tmp.height);
        const sw = Math.max(1, Math.round(cropBox.w * tmp.width));
        const sh = Math.max(1, Math.round(cropBox.h * tmp.height));
        const canvas = canvasRef.current;
        canvas.width  = sw;
        canvas.height = sh;
        canvas.getContext('2d').drawImage(tmp, sx, sy, sw, sh, 0, 0, sw, sh);
        canvas.style.width  = '100%';
        canvas.style.height = 'auto';
        if (!cancelled) setRendered(true);
      } catch (e) { console.warn('[CropBoxThumbnail]', e); }
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum, cropBox, scale, rotation]);

  return (
    <div className="w-full h-full relative bg-white">
      <canvas ref={canvasRef} className="w-full h-auto" />
      {!rendered && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
          <RefreshCw size={14} className="text-slate-300 animate-spin" />
        </div>
      )}
    </div>
  );
};

// ---------- Pre-Preparation Screen ----------
const PrePrepScreen = ({ setRoute, addBatch }) => {
  const { auth } = useAuth();
  // Each user gets their own IDB database — prevents preprep data leaking across tenants.
  const idbName = getPrePrepDbName(auth?.username);

  // Each "intake document" represents one raw multi-page PDF the operator uploaded.
  // Multiple can be staged together (a "raw batch") with shared context metadata.
  // Shape: {
  //   id, file, name, pageCount, pages: [{ pageNum, kind, isRecordStart }],
  //   notes, priority, indexFile (optional Excel), exported: bool
  // }
  const [intake, setIntake] = useState([]);              // staged intake documents
  const [activeDocId, setActiveDocId] = useState(null);  // currently-open document
  const [batchNotes, setBatchNotes] = useState('');      // shared notes across the intake bundle
  const [priority, setPriority] = useState('Low');
  const [indexFile, setIndexFile] = useState(null);      // Excel/CSV with manifest info
  const [dragOver, setDragOver] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [warningsDismissed, setWarningsDismissed] = useState(false);
  // RWK008: Session timer — ref-based so the 1-second tick does NOT trigger a
  // full component re-render (which would repaint all PDF thumbnails every second).
  // The DOM element is updated imperatively via timerDisplayRef instead.
  const prepSecsRef = useRef(0);
  const timerDisplayRef = useRef(null);
  const prepTimerRef = useRef(null);
  useEffect(() => {
    const fmt = (s) => {
      const h = String(Math.floor(s / 3600)).padStart(2, '0');
      const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const sec = String(s % 60).padStart(2, '0');
      return `${h}:${m}:${sec}`;
    };
    prepTimerRef.current = setInterval(() => {
      prepSecsRef.current += 1;
      if (timerDisplayRef.current) timerDisplayRef.current.textContent = fmt(prepSecsRef.current);
    }, 1000);
    return () => clearInterval(prepTimerRef.current);
  }, []);

  // Guard: save effect must not clear IDB before this load completes on mount.
  // Using a ref (not state) so flipping it doesn't trigger an extra re-render.
  const idbLoadedRef = useRef(false);

  // Load staged intake docs from IndexedDB on mount (survives refresh).
  // pdfDoc was stripped before save (non-serializable); re-parse it here from the
  // stored File blob so thumbnails and page previews work immediately after reload.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [saved, meta] = await Promise.all([idbLoadIntake(idbName), idbLoadMeta(idbName)]);
      if (cancelled) return;
      if (meta) {
        if (meta.batchNotes != null) setBatchNotes(meta.batchNotes);
        if (meta.priority    != null) setPriority(meta.priority);
        if (meta.indexFile   != null) setIndexFile(meta.indexFile);
      }
      if (saved.length === 0) { idbLoadedRef.current = true; return; }
      const pdfjs = await loadPdfJs().catch(() => null);
      if (cancelled) return;
      const restored = await Promise.all(saved.map(async (doc) => {
        if (!doc.file || !pdfjs) return { ...doc, pdfDoc: null };
        try {
          const buf = await doc.file.arrayBuffer();
          const pdfDoc = await pdfjs.getDocument({ data: buf }).promise;
          return { ...doc, pdfDoc };
        } catch { return { ...doc, pdfDoc: null }; }
      }));
      if (cancelled) return;
      idbLoadedRef.current = true;
      setIntake(restored);
      setActiveDocId(restored[0].id);
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist intake to IndexedDB whenever it changes.
  // Guard: skip until the IDB load has completed so the initial empty intake
  // on mount does not clear the previously-saved data before it is read back.
  useEffect(() => {
    if (!idbLoadedRef.current) return;
    if (intake.length === 0) idbClearIntake(idbName);
    else idbSaveIntake(idbName, intake);
  }, [intake]);

  // Persist batch-level metadata (notes, priority, index file) across refreshes
  useEffect(() => {
    idbSaveMeta(idbName, { batchNotes, priority, indexFile });
  }, [batchNotes, priority, indexFile]);
  const [activePageNum, setActivePageNum] = useState(null);  // page being inspected (large preview)
  // Operators can mark pages in different ways. To make multi-page selection ergonomic,
  // we support shift-click range select for assigning the same page-type to many pages.
  const [shiftAnchor, setShiftAnchor] = useState(null);
  // RWK007: Multi-select for bulk rotation of pages. Checkbox on each page card.
  const [selectedPageNums, setSelectedPageNums] = useState(new Set());
  // Side-panel collapse state. Operators with smaller screens (or who want more room
  // for the page grid) can collapse either panel to a thin rail showing just an
  // expand button + a vertical label.
  const [intakeOpen, setIntakeOpen] = useState(true);
  const [treeOpen, setTreeOpen] = useState(true);
  // Crop-segment modal — { docId, pageNum } when open, null otherwise.
  const [cropModalTarget, setCropModalTarget] = useState(null);

  // Keyboard handler for the page-preview modal:
  //   ESC      — close modal
  //   ← →      — navigate prev/next page
  // Active only when activePageNum is set; ignored when typing in inputs.
  useEffect(() => {
    if (activePageNum === null) return;
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.key === 'Escape') { e.preventDefault(); setActivePageNum(null); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setActivePageNum(n => Math.max(1, (n || 1) - 1)); }
      else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const max = intake.find(d => d.id === activeDocId)?.pageCount || 1;
        setActivePageNum(n => Math.min(max, (n || 0) + 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activePageNum, intake, activeDocId]);

  const activeDoc = intake.find(d => d.id === activeDocId) || null;

  // Reset warning dismiss state whenever the operator switches to a different document.
  useEffect(() => { setWarningsDismissed(false); }, [activeDocId]);

  // ===== Upload handling =====
  // For each PDF dropped or selected, parse the page count via pdf.js and create an
  // intake document with default page-type 'OT' and no record breaks (operator marks them).
  const ingestFiles = useCallback(async (files) => {
    const newDocs = [];
    for (const f of files) {
      if (!f.type.includes('pdf') && !f.name.toLowerCase().endsWith('.pdf')) {
        // Excel/CSV files become the index manifest
        if (f.name.match(/\.(xlsx|xls|csv)$/i)) {
          setIndexFile(f);
        }
        continue;
      }
      try {
        const pdfjs = await loadPdfJs();
        if (!pdfjs) throw new Error('PDF library unavailable');
        const buf = await f.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: buf }).promise;
        const pageCount = pdf.numPages;
        const pages = Array.from({ length: pageCount }, (_, i) => ({
          pageNum: i + 1,
          kind: 'OT',                 // default until operator assigns
          isRecordStart: i === 0,     // first page always starts a record
          rotation: 0                  // operator-applied rotation (0/90/180/270 mod 360)
        }));
        newDocs.push({
          id: `intake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file: f,
          name: f.name,
          pageCount,
          pages,
          // The parsed pdf.js document — shared across all thumbnails so they don't
          // each re-parse the source PDF (which previously caused "Render error" storms
          // on 50+ page documents from concurrent worker saturation).
          pdfDoc: pdf,
          exported: false
        });
      } catch (e) {
        console.error('Failed to parse PDF', f.name, e);
        // Soft-fail — show a placeholder doc so operator knows the upload was attempted
        newDocs.push({
          id: `intake-error-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file: f,
          name: f.name,
          pageCount: 0,
          pages: [],
          pdfDoc: null,
          error: e.message,
          exported: false
        });
      }
    }
    if (newDocs.length > 0) {
      setIntake(prev => [...prev, ...newDocs]);
      // Auto-open the first newly-added doc if no doc is currently active
      if (!activeDocId && newDocs[0]?.pageCount > 0) {
        setActiveDocId(newDocs[0].id);
      }
    }
  }, [activeDocId]);

  const onFilesSelected = (e) => { ingestFiles(Array.from(e.target.files || [])); e.target.value = ''; };
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); ingestFiles(Array.from(e.dataTransfer.files || [])); };
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);

  const removeDoc = (id) => {
    setIntake(prev => prev.filter(d => d.id !== id));
    if (activeDocId === id) setActiveDocId(null);
  };

  // Local-only flag — intake documents aren't archived records yet, so this has no
  // backend call. Persisted automatically by the existing IndexedDB save effect.
  const toggleIntakeFlag = (id) => {
    setIntake(prev => prev.map(d => d.id === id ? { ...d, flagged: !d.flagged } : d));
  };

  // ===== Page operations on the active document =====
  const updatePage = useCallback((pageNum, patch) => {
    if (!activeDoc) return;
    setIntake(prev => prev.map(d => {
      if (d.id !== activeDocId) return d;
      return {
        ...d,
        pages: d.pages.map(p => p.pageNum === pageNum ? { ...p, ...patch } : p)
      };
    }));
  }, [activeDoc, activeDocId]);

  const updatePagesRange = useCallback((fromNum, toNum, patch) => {
    if (!activeDoc) return;
    const lo = Math.min(fromNum, toNum);
    const hi = Math.max(fromNum, toNum);
    setIntake(prev => prev.map(d => {
      if (d.id !== activeDocId) return d;
      return {
        ...d,
        pages: d.pages.map(p => (p.pageNum >= lo && p.pageNum <= hi) ? { ...p, ...patch } : p)
      };
    }));
  }, [activeDoc, activeDocId]);

  // applyCropSegments — the core of the two-phase crop workflow.
  //
  // Phase 1 (this function): operator draws crop boxes and assigns types.
  //   → Source page is marked isCropSource:true (retained, not sent to AI).
  //   → N virtual segment pages are inserted right after the source in the array.
  //   → Each virtual page looks and behaves like a real page (Start, type, rotate).
  //
  // Phase 2 (existing Start/record-break UI): operator groups virtual pages into
  //   records exactly like they would with real pages.
  //
  // Virtual page shape:
  //   { pageNum, kind, isVirtualCrop:true, _sourcePageNum, _cropBox, _cropBoxIdx,
  //     isRecordStart, rotation }
  //   pageNum = sourcePageNum + (cropBoxIdx+1)*0.001  →  sorts after source, before next real page
  const setPageCropBoxes = useCallback((sourcePageNum, boxes) => {
    if (!activeDoc) return;
    setIntake(prev => prev.map(d => {
      if (d.id !== activeDocId) return d;
      // Remove any existing virtual pages from this source
      const withoutOld = d.pages.filter(
        p => !(p.isVirtualCrop && p._sourcePageNum === sourcePageNum)
      );
      const sourceIdx = withoutOld.findIndex(p => p.pageNum === sourcePageNum);
      if (sourceIdx === -1) return d;
      // Clear crop source if boxes is empty (removing crop mode)
      if (!boxes || boxes.length === 0) {
        const cleared = withoutOld.map(p =>
          p.pageNum === sourcePageNum
            ? (({ isCropSource, cropBoxes, ...rest }) => rest)(p) // eslint-disable-line
            : p
        );
        return { ...d, pages: cleared };
      }
      // Mark source page
      const updated = withoutOld.map(p =>
        p.pageNum === sourcePageNum ? { ...p, isCropSource: true, cropBoxes: boxes } : p
      );
      // Build virtual segment pages
      const virtualPages = boxes.map((box, ci) => ({
        pageNum:       sourcePageNum + (ci + 1) * 0.001, // floats sort between integers
        kind:          box.kind || 'OT',
        isVirtualCrop: true,
        _sourcePageNum: sourcePageNum,
        _cropBox:      box,
        _cropBoxIdx:   ci,
        isRecordStart: ci === 0,   // first segment defaults to new record start
        rotation:      0,
      }));
      // Insert virtual pages right after the source page
      const newPages = [
        ...updated.slice(0, sourceIdx + 1),
        ...virtualPages,
        ...updated.slice(sourceIdx + 1),
      ];
      return { ...d, pages: newPages };
    }));
  }, [activeDoc, activeDocId]);

  const toggleRecordStart = (pageNum) => {
    // First page is always a record start — can't unset it (would make page 1 belong nowhere)
    if (pageNum === 1) return;
    if (!activeDoc) return;
    const page = activeDoc.pages.find(p => p.pageNum === pageNum);
    if (!page) return;
    // Crop-source pages are retained but not sent to AI — they never form
    // records themselves, so the Start toggle doesn't apply to them.
    if (page.isCropSource) return;
    updatePage(pageNum, { isRecordStart: !page.isRecordStart });
  };

  // Rotate a page by ±90° (delta is 90 or -90). Normalized into [0, 360).
  // The rotation persists on the page state and is applied at:
  //   1. Thumbnail render time (via pdfjs viewport rotation)
  //   2. Preview modal render time (same)
  //   3. Export time (via pdf-lib page.setRotation) so the produced PDF has the
  //      operator's chosen orientation baked in — downstream AI sees correctly-
  //      oriented pages without needing to re-rotate.
  const rotatePage = useCallback((pageNum, delta) => {
    if (!activeDoc) return;
    const page = activeDoc.pages.find(p => p.pageNum === pageNum);
    if (!page) return;
    const next = (((page.rotation || 0) + delta) % 360 + 360) % 360;
    updatePage(pageNum, { rotation: next });
  }, [activeDoc, updatePage]);

  // ENH002: Auto-tag mapping: Front → Back
  const FRONT_TO_BACK_MAP = { CF: 'CB', RF: 'RB', LF: 'LB' };

  const setPageKind = (pageNum, kind, withShift = false) => {
    if (withShift && shiftAnchor !== null && shiftAnchor !== pageNum) {
      updatePagesRange(shiftAnchor, pageNum, { kind });
      setShiftAnchor(null);
    } else {
      updatePage(pageNum, { kind });
      setShiftAnchor(pageNum);
      // ENH002: Auto-tag next page as the matching Back when a Front is selected.
      // We auto-tag whenever the next page isn't already a Front itself (so we
      // never overwrite the next record's start) and isn't already the matching
      // Back. Operators can still flip it manually if the document differs.
      const autoBackKind = FRONT_TO_BACK_MAP[kind];
      if (autoBackKind && activeDoc) {
        const nextPage = activeDoc.pages.find(p => p.pageNum === pageNum + 1);
        const nextIsFront = nextPage && FRONT_TO_BACK_MAP[nextPage.kind];
        if (nextPage && !nextIsFront && nextPage.kind !== autoBackKind) {
          updatePage(pageNum + 1, { kind: autoBackKind });
        }
      }
    }
  };

  // RWK007: Rotate all selected pages by +90° (clockwise).
  // Applies the same delta that rotatePage() uses to each selected page.
  const rotateSelectedPages = (delta = 90) => {
    if (!activeDoc || selectedPageNums.size === 0) return;
    setIntake(prev => prev.map(d => {
      if (d.id !== activeDocId) return d;
      return {
        ...d,
        pages: d.pages.map(p => {
          if (!selectedPageNums.has(p.pageNum)) return p;
          const next = (((p.rotation || 0) + delta) % 360 + 360) % 360;
          return { ...p, rotation: next };
        })
      };
    }));
  };

  // ===== Auto-suggest record breaks based on page-kind heuristic =====
  // When operator clicks "Auto-detect record breaks", we scan the page kinds and place
  // a record-start flag wherever a CF appears (every Check Front begins a new donation
  // record by definition). Useful when operator has labeled pages but not split yet.
  const autoDetectBreaks = () => {
    if (!activeDoc) return;
    setIntake(prev => prev.map(d => {
      if (d.id !== activeDocId) return d;
      return {
        ...d,
        pages: d.pages.map((p, i) => ({
          ...p,
          isRecordStart: i === 0 || p.kind === 'CF'
        }))
      };
    }));
  };

  // ===== Compute records from current page state =====
  // Pages sorted by pageNum (virtual crop pages have float pageNums like 1.001
  // so they sort after their source page, before the next real page).
  // Source pages (isCropSource) are excluded — retained in ZIP, not sent to AI.
  // Virtual segment pages (isVirtualCrop) and regular pages both form records
  // via isRecordStart, exactly like before.
  const records = useMemo(() => {
    if (!activeDoc) return [];
    const sorted = [...activeDoc.pages].sort((a, b) => a.pageNum - b.pageNum);
    const workingPages = sorted.filter(p => !p.isCropSource);
    const rec = [];
    let current = null;
    for (const p of workingPages) {
      if (p.isRecordStart || current === null) {
        if (current) rec.push(current);
        current = { recordIdx: rec.length + 1, pages: [p] };
      } else {
        current.pages.push(p);
      }
    }
    if (current) rec.push(current);
    return rec;
  }, [activeDoc]);

  // ===== Validation =====
  // Each record needs at least one page. Every exported page gets its own
  // auto-incrementing occurrence suffix (_0001, _0002, ...), so filenames within
  // a record never collide even when two pages share the same page-type code
  // (e.g. two Check-Front pages stapled together as one donation is valid —
  // it just yields CF_0001.pdf and CF_0002.pdf). A "duplicate" is only real
  // when two files share the same filename (or the same unique file identifier);
  // sharing a page-type code is not a duplicate and should not be flagged as one.
  //
  // Kept as an extension point: if future rules need to surface real record-level
  // problems (e.g. "every record must have at least one of CF/SF"), they'd
  // populate `issues[]` here and the issues panel below would display them.
  const recordIssues = [];

  const hasBlockingIssues = recordIssues.some(i => i.severity === 'error');
  const hasWarnings = recordIssues.some(i => i.severity === 'warning');
  const canExport = activeDoc && activeDoc.pageCount > 0 && records.length > 0 && !hasBlockingIssues && !exporting;

  // ===== Export to ZIP =====
  // Output structure:
  //   <inputfile.zip>
  //     0000001/
  //       0000001_CF.pdf
  //       0000001_CB.pdf
  //       0000001_SF.pdf
  //     0000002/
  //       0000002_CF.pdf
  //       ...
  //   _manifest.json   (operator notes, priority, source filename)
  // Each single-page PDF is created by extracting the corresponding page from the
  // source PDF using pdf-lib. Records are zero-padded to 7 digits to match the
  // existing platform's filename pattern.
  const exportActiveDoc = async () => {
    if (!canExport) return;
    setExporting(true);
    setExportError(null);
    try {
      const PDFLib = await loadPdfLib();
      const JSZip = await loadJSZip();
      if (!PDFLib || !JSZip) throw new Error('PDF or ZIP library unavailable');
      // Read twice — pdf-lib and pdf.js both consume/detach the ArrayBuffer internally.
      // Keeping two independent Uint8Array copies prevents "detached buffer" errors
      // when renderPageToCanvas is called for virtual crop pages.
      const srcBytesForPdfLib = new Uint8Array(await activeDoc.file.arrayBuffer());
      const srcBytesForCanvas = new Uint8Array(await activeDoc.file.arrayBuffer());
      const srcDoc = await PDFLib.PDFDocument.load(srcBytesForPdfLib);
      const zip = new JSZip();
      const baseName = activeDoc.name.replace(/\.pdf$/i, '');
      const folder = zip.folder(baseName);

      // Helper: render a PDF page to an offscreen canvas.
      // Slices a fresh copy from srcBytesForCanvas each call so pdf.js worker
      // transfer never neuters the source buffer. `box` (the crop region about to
      // be cut from this render) drives the render scale so small crops don't lose
      // most of their resolution to a fixed low scale.
      const renderPageToCanvas = async (pageIndex, box) => {
        const pdfjs = await loadPdfJs();
        const pdfjsDoc = await pdfjs.getDocument({ data: srcBytesForCanvas.slice(0) }).promise;
        const pg = await pdfjsDoc.getPage(pageIndex + 1);
        const basePageVp = pg.getViewport({ scale: 1 });
        const renderScale = cropRenderScale(basePageVp.width, basePageVp.height, box);
        const vp = pg.getViewport({ scale: renderScale });
        const oc = document.createElement('canvas');
        oc.width = Math.floor(vp.width);
        oc.height = Math.floor(vp.height);
        await pg.render({ canvasContext: oc.getContext('2d', { willReadFrequently: true }), viewport: vp }).promise;
        pdfjsDoc.destroy();
        return oc;
      };

      // Helper: crop a canvas region → PNG Uint8Array
      const cropCanvasToPng = (srcCanvas, box) => {
        const sx = Math.round(box.x * srcCanvas.width);
        const sy = Math.round(box.y * srcCanvas.height);
        const sw = Math.round(box.w * srcCanvas.width);
        const sh = Math.round(box.h * srcCanvas.height);
        const tmp = document.createElement('canvas');
        tmp.width = sw; tmp.height = sh;
        tmp.getContext('2d').drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
        return Uint8Array.from(atob(tmp.toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0));
      };

      // For each record, extract its pages into single-page PDFs.
      // EVERY page filename carries an occurrence number starting at _0001 (4-digit
      // zero-padded). So a record with one CF and three OTs produces:
      //   0000001_CF_0001.pdf, 0000001_OT_0001.pdf, 0000001_OT_0002.pdf, 0000001_OT_0003.pdf.
      // Predictable filenames; all page types may legitimately duplicate.
      // Operator-applied rotation is baked into each output PDF via pdf-lib's
      // setRotation, so downstream AI receives correctly-oriented pages without
      // needing to re-rotate from metadata.
      for (const rec of records) {
        const recId = String(rec.recordIdx).padStart(7, '0');
        const recFolder = folder.folder(recId);
        const kindSeenCount = {};
        for (const p of rec.pages) {
          kindSeenCount[p.kind] = (kindSeenCount[p.kind] || 0) + 1;
          const occurrence = String(kindSeenCount[p.kind]).padStart(4, '0');
          const filename = `${recId}_${p.kind}_${occurrence}.pdf`;

          if (p.isVirtualCrop && p._cropBox) {
            // Virtual segment page — render source PDF page, crop the box, embed as PDF
            const srcCanvas = await renderPageToCanvas(p._sourcePageNum - 1, p._cropBox);
            const pngBytes = cropCanvasToPng(srcCanvas, p._cropBox);
            const cropDoc = await PDFLib.PDFDocument.create();
            const img = await cropDoc.embedPng(pngBytes);
            const cropPg = cropDoc.addPage([img.width, img.height]);
            cropPg.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
            if (p.rotation && p.rotation !== 0) {
              cropDoc.getPages()[0].setRotation(PDFLib.degrees(p.rotation % 360));
            }
            recFolder.file(filename, await cropDoc.save());
          } else {
            // Regular page — copy from source PDF
            const realPageNum = Math.round(p.pageNum);
            const newDoc = await PDFLib.PDFDocument.create();
            const [copied] = await newDoc.copyPages(srcDoc, [realPageNum - 1]);
            newDoc.addPage(copied);
            // Apply operator rotation. pdf-lib's degrees() helper takes a number;
            // adding to any rotation already declared on the source page so the
            // visible orientation in the export matches what the operator saw.
            if (p.rotation && p.rotation !== 0) {
              const pages = newDoc.getPages();
              if (pages.length > 0) {
                const existing = pages[0].getRotation().angle || 0;
                const total = (existing + p.rotation) % 360;
                pages[0].setRotation(PDFLib.degrees(total));
              }
            }
            recFolder.file(filename, await newDoc.save());
          }
        }
      }
      // Manifest with operator context
      const manifest = {
        sourceFilename: activeDoc.name,
        sourcePageCount: activeDoc.pageCount,
        recordCount: records.length,
        notes: batchNotes,
        priority,
        indexFilename: indexFile?.name || null,
        preparedAt: new Date().toISOString(),
        records: records.map(r => ({
          recordId: String(r.recordIdx).padStart(7, '0'),
          pages: r.pages.map(p => ({ sourcePage: p.pageNum, kind: p.kind }))
        }))
      };
      folder.file('_manifest.json', JSON.stringify(manifest, null, 2));
      // Optionally include the original index Excel/CSV for traceability
      if (indexFile) {
        const idxBuf = await indexFile.arrayBuffer();
        folder.file(`_index_${indexFile.name}`, idxBuf);
      }
      // Trigger download
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}_prepared.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      // Mark exported
      setIntake(prev => prev.map(d => d.id === activeDocId ? { ...d, exported: true } : d));
    } catch (e) {
      console.error('Export failed:', e);
      setExportError(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  // ===== Send-to-Import handoff =====
  // Skip the ZIP→download→re-upload roundtrip. Build the same per-record single-page
  // PDFs in memory, wrap each in a File object, construct a batch in the exact
  // shape ImportScreen produces, and call addBatch() with status 'extraction' so
  // the new batch lands in AI Extraction ready for the worker to pick up.
  const [sendingToImport, setSendingToImport] = useState(false);
  const [sendError, setSendError] = useState(null);
  const sendToImport = async () => {
    if (!canExport || !addBatch) return;
    setSendingToImport(true);
    setSendError(null);
    try {
      const PDFLib = await loadPdfLib();
      if (!PDFLib) throw new Error('PDF library unavailable');
      // Read file bytes twice — pdf-lib and pdf.js both consume ArrayBuffers internally.
      // Independent copies prevent "detached ArrayBuffer" / "operation aborted" errors.
      const srcBytesForPdfLib = new Uint8Array(await activeDoc.file.arrayBuffer());
      const srcBytesForCanvas = new Uint8Array(await activeDoc.file.arrayBuffer());
      const srcDoc = await PDFLib.PDFDocument.load(srcBytesForPdfLib);

      // Build per-record File objects matching the shape ImportScreen creates.
      const builtRecords = [];
      let totalFiles = 0;
      let totalPages = 0;

      for (const rec of records) {
        const recId = String(rec.recordIdx).padStart(7, '0');
        const kindSeenCount = {};
        const pages = [];

        for (const p of rec.pages) {
          // Default unknown/unclassified page kind to 'OT' (Other) so pages
          // never enter the pipeline with an invalid code.
          const rawKind = (p.kind && p.kind !== 'unknown' && PAGE_TYPES[p.kind]) ? p.kind : 'OT';
          const pageKind = LEGACY_CODE_REMAP[rawKind] || rawKind;
          kindSeenCount[pageKind] = (kindSeenCount[pageKind] || 0) + 1;
          const occurrence = String(kindSeenCount[pageKind]).padStart(4, '0');
          const filename = `${recId}_${pageKind}_${occurrence}.pdf`;

          if (p.isVirtualCrop && p._cropBox) {
            // Virtual segment page — canvas-render the crop region → PDF
            const pdfjsV = await loadPdfJs();
            const pdfjsDocV = await pdfjsV.getDocument({ data: srcBytesForCanvas.slice(0) }).promise;
            const pgV = await pdfjsDocV.getPage(p._sourcePageNum);
            const basePageVpV = pgV.getViewport({ scale: 1 });
            const renderScaleV = cropRenderScale(basePageVpV.width, basePageVpV.height, p._cropBox);
            const vpV = pgV.getViewport({ scale: renderScaleV });
            const ocV = document.createElement('canvas');
            ocV.width = Math.floor(vpV.width); ocV.height = Math.floor(vpV.height);
            await pgV.render({ canvasContext: ocV.getContext('2d', { willReadFrequently: true }), viewport: vpV }).promise;
            pdfjsDocV.destroy();
            const box = p._cropBox;
            const sx = Math.round(box.x * ocV.width), sy = Math.round(box.y * ocV.height);
            const sw = Math.round(box.w * ocV.width), sh = Math.round(box.h * ocV.height);
            const tmpV = document.createElement('canvas');
            tmpV.width = sw; tmpV.height = sh;
            tmpV.getContext('2d').drawImage(ocV, sx, sy, sw, sh, 0, 0, sw, sh);
            const pngV = Uint8Array.from(atob(tmpV.toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0));
            const cropDocV = await PDFLib.PDFDocument.create();
            const imgV = await cropDocV.embedPng(pngV);
            const cropPgV = cropDocV.addPage([imgV.width, imgV.height]);
            cropPgV.drawImage(imgV, { x: 0, y: 0, width: imgV.width, height: imgV.height });
            const file = new File([await cropDocV.save()], filename, { type: 'application/pdf' });
            pages.push({
              code: pageKind,
              label: PAGE_TYPES[pageKind]?.label || pageKind,
              file,
              filename,
              pages: 1
            });
            totalFiles++;
            totalPages++;
          } else {
            // Regular page — copy from source PDF
            const realPageNum = Math.round(p.pageNum);
            const newDoc = await PDFLib.PDFDocument.create();
            const [copied] = await newDoc.copyPages(srcDoc, [realPageNum - 1]);
            newDoc.addPage(copied);
            if (p.rotation && p.rotation !== 0) {
              const newPages = newDoc.getPages();
              if (newPages.length > 0) {
                const existing = newPages[0].getRotation().angle || 0;
                const total = (existing + p.rotation) % 360;
                newPages[0].setRotation(PDFLib.degrees(total));
              }
            }
            const pdfBytes = await newDoc.save();
            const file = new File([pdfBytes], filename, { type: 'application/pdf' });
            pages.push({
              code: pageKind,
              label: PAGE_TYPES[pageKind]?.label || pageKind,
              file,
              filename,
              pages: 1
            });
            totalFiles++;
            totalPages++;
          }
        }

        builtRecords.push({
          id: recId,
          recordId: recId,
          paymentMethod: 'Unknown',
          pageTypeCodes: pages.map(p => p.code),
          pages,
          extractionStatus: 'pending',
          extractedRecord: null
        });
      }

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const uploadedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const batchId = generateBatchId();

      const newBatch = {
        id: batchId,
        uploaded: uploadedAt,
        uploader: auth?.username || 'unknown',
        recordCount: builtRecords.length,
        files: totalFiles,
        pages: totalPages,
        // status 'extraction' means "ready for AI extraction" — the worker on the
        // Extraction screen polls this stage and starts processing.
        status: 'extraction',
        progress: 0,
        priority,
        hitlTeam: 'Default Queue',
        bucketId: null,
        records: builtRecords,
        stagedFiles: [],
        // Provenance back to Pre-Prep — useful for the audit log.
        sourceMode: 'pre-prep',
        sourceDocument: activeDoc.name,
        notes: batchNotes
      };

      const savedBatch = await addBatch(newBatch);
      // Phase 9: addBatch returns null when duplicate content is blocked.
      // Do not mark intake as sent, do not navigate to extraction.
      if (savedBatch == null) {
        setSendError('This generated content has already been uploaded for this tenant and was blocked from extraction. No new batch was created.');
        return;
      }
      // Mark this intake doc as sent only after durable DB/page persistence succeeds.
      const updatedIntake = intake.map(d => d.id === activeDocId ? { ...d, exported: true, sentToImport: true } : d);
      setIntake(updatedIntake);
      // Remove all exported docs from IndexedDB — batch is now in the pipeline.
      const remaining = updatedIntake.filter(d => !d.exported && !d.sentToImport);
      if (remaining.length === 0) { idbClearIntake(idbName); idbClearMeta(idbName); }
      else idbSaveIntake(idbName, remaining);
      // Take the user to AI Extraction so they see their new batch lined up.
      setRoute('extraction');
    } catch (e) {
      console.error('Send to Import failed:', e);
      setSendError(e.message || 'Send to Import failed');
    } finally {
      setSendingToImport(false);
    }
  };

  // ===== Active page (large preview pane) =====
  const activePage = activeDoc && activePageNum
    ? activeDoc.pages.find(p => p.pageNum === activePageNum)
    : null;

  // ===== Empty state =====
  // When there's nothing to do at all — no raw uploads — show the friendly drop zone.
  if (intake.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-slate-50 p-6">
        <div>
          <PageHeader title="Pre-Preparation" eyebrow="WORKSPACE" description="Split raw multi-page PDF scans into properly-named single-page records" />
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={`mt-6 border-2 border-dashed p-16 text-center transition-all ${
              dragOver ? 'border-blue-500 bg-blue-50/60 shadow-inner' : 'border-slate-300 bg-white hover:border-blue-300'
            }`}
          >
            <div className="w-20 h-20 mx-auto mb-4 bg-blue-50 flex items-center justify-center">
              <Upload size={36} className={`transition-colors ${dragOver ? 'text-blue-600' : 'text-blue-700'}`} />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Drop raw PDFs here</h3>
            <p className="text-sm text-slate-500 mb-5 max-w-md mx-auto leading-relaxed">
              Upload one or more multi-page PDFs (e.g., a weekly mail scan).
              Optionally attach an Excel index or CSV manifest with the same drop.
            </p>
            <label className="inline-block">
              <input type="file" multiple accept=".pdf,.xlsx,.xls,.csv" onChange={onFilesSelected} className="hidden" />
              <span className="inline-flex items-center gap-2 px-6 py-3 bg-blue-700 text-white text-sm font-bold cursor-pointer hover:bg-blue-800 active:bg-blue-900 transition-colors shadow-sm">
                <Upload size={15} />Select Files
              </span>
            </label>
            <p className="text-[11px] text-slate-400 mt-5 max-w-sm mx-auto leading-relaxed">
              Output: ZIP with one subfolder per record, each containing single-page PDFs named NNNNNNN_XX_NNNN.pdf — upload to Import for AI Extraction.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* === Dark navy PageHeader — kept visible after files are ingested.
          Earlier the header was only shown in the empty state; once files were
          uploaded the screen jumped straight into the 3-column working surface
          which lost the page identity. Now the header rides on top of the workspace
          for the entire session, matching HITL / QC / AI Extraction. */}
      <div className="px-6 py-3 flex-shrink-0 relative" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #0b1a36 40%, #0a1020 100%)' }}>
        <PageHeader
          tone="dark"
          title="Pre-Preparation"
          eyebrow="WORKSPACE"
          description="Split raw multi-page PDF scans into properly-named single-page records"
          className="mb-0"
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              {/* Bundle stats — files / pages / records */}
              <div className="flex gap-2 font-mono">
                <div className="text-center px-3 py-1.5 bg-slate-900/60 border border-slate-700/50 min-w-[52px]">
                  <div className="text-base font-black text-blue-300 tabular-nums leading-none">{intake.length}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Files</div>
                </div>
                <div className="text-center px-3 py-1.5 bg-slate-900/60 border border-slate-700/50 min-w-[52px]">
                  <div className="text-base font-black text-blue-300 tabular-nums leading-none">
                    {intake.reduce((sum, d) => sum + (d.pages?.length || 0), 0)}
                  </div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Pages</div>
                </div>
                <div className="text-center px-3 py-1.5 bg-slate-900/60 border border-slate-700/50 min-w-[52px]">
                  <div className="text-base font-black text-blue-300 tabular-nums leading-none">
                    {intake.reduce((sum, d) => sum + (d.pages || []).filter(p => p.isRecordStart).length, 0)}
                  </div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Records</div>
                </div>
              </div>
              {/* RWK009: Pending Pages — pages not yet assigned a type (still OT) */}
              {(() => {
                const pendingCnt = intake.reduce((sum, d) => sum + (d.pages || []).filter(p => p.kind === 'OT').length, 0);
                return (
                  <div className={`text-center px-3 py-1.5 border min-w-[52px] ${pendingCnt > 0 ? 'bg-amber-900/50 border-amber-600/60' : 'bg-slate-900/60 border-slate-700/50'}`} title="Pages not yet assigned a specific type (still OT)">
                    <div className={`text-base font-black tabular-nums leading-none ${pendingCnt > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>{pendingCnt}</div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Pending</div>
                  </div>
                );
              })()}
              {/* Cropped pages count */}
              {(() => {
                const cropCnt = intake.reduce((sum, d) => sum + (d.pages || []).filter(p => p.cropBoxes && p.cropBoxes.length > 0).length, 0);
                if (cropCnt === 0) return null;
                return (
                  <div className="text-center px-3 py-1.5 bg-slate-900/60 border border-emerald-700/50 min-w-[52px]" title="Pages with crop segments defined">
                    <div className="text-base font-black tabular-nums leading-none text-emerald-300">{cropCnt}</div>
                    <div className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mt-0.5">Crops</div>
                  </div>
                );
              })()}
              {/* RWK008: Session timer — ref-driven; ticks update the DOM directly
                  so the 1-second interval does not re-render this component */}
              <div className="text-center px-3 py-1.5 bg-slate-900/60 border border-slate-700/50 min-w-[72px]" title="Time spent in Pre-Preparation this session">
                <div ref={timerDisplayRef} className="text-base font-black text-amber-300 tabular-nums leading-none font-mono">
                  00:00:00
                </div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Session</div>
              </div>
            </div>
          }
        />
      </div>

      <div
        className="flex-1 grid overflow-hidden bg-slate-50 px-6 py-4 gap-3"
        style={{
          gridTemplateColumns: `${intakeOpen ? '264px' : '40px'} 1fr ${treeOpen ? '320px' : '40px'}`,
          transition: 'grid-template-columns 200ms ease'
        }}
      >
      {/* ============================================================ */}
      {/* LEFT — Intake bundle (uploaded raw PDFs)                       */}
      {/* ============================================================ */}
      <aside className="bg-white border-r border-slate-200 flex flex-col overflow-hidden">
        {intakeOpen ? (
          <>
            {/* Header — single Raw-intake work mode. */}
            <div className="border-b border-slate-200 flex-shrink-0 flex items-stretch">
              <div className="flex-1 px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-blue-900 flex items-center justify-center gap-1.5">
                Raw
                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-700 text-white">
                  {intake.length}
                </span>
              </div>
              <button
                onClick={() => setIntakeOpen(false)}
                className="px-2.5 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors flex-shrink-0 border-l border-slate-200"
                title="Collapse panel"
              >
                <ChevronLeft size={14} />
              </button>
            </div>
            <div className="px-3 py-2 border-b border-slate-200 flex-shrink-0">
              <p className="text-[10px] text-slate-500">Raw PDFs awaiting prep</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {intake.length === 0 ? (
                <div className="text-center py-6 text-[11px] text-slate-400">
                  <FileText size={20} className="mx-auto mb-1.5 text-slate-300" />
                  No raw PDFs.
                  <div className="text-[10px] mt-0.5">Drop or upload below.</div>
                </div>
              ) : intake.map(d => {
                const isActive = d.id === activeDocId;
                const recordCount = (() => {
                  if (!d.pages || d.pages.length === 0) return 0;
                  return d.pages.filter(p => p.isRecordStart).length;
                })();
                const pendingPages = (d.pages || []).filter(p => p.kind === 'OT').length;
                const totalPages = d.pageCount || 0;
                const donePages = totalPages - pendingPages;
                return (
                  <div key={d.id} className={`group border-l-[3px] border transition-all flex items-stretch ${isActive ? 'border-l-blue-600 border-blue-300 bg-blue-50 shadow-sm' : 'border-l-slate-200 border-slate-200 bg-white hover:border-slate-300 hover:border-l-blue-300'}`}>
                    <button onClick={() => { setActiveDocId(d.id); setActivePageNum(null); }} className="flex-1 text-left p-3 min-w-0">
                      <div className="flex items-start gap-2">
                        <FileText size={15} className={`flex-shrink-0 mt-0.5 ${isActive ? 'text-blue-700' : 'text-slate-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className={`text-[11px] font-semibold truncate leading-tight ${isActive ? 'text-blue-900' : 'text-slate-800'}`}>{d.name}</div>
                          <div className="text-[9px] text-slate-500 mt-1">
                            {d.error ? <span className="text-red-600 font-bold">parse error</span> : `${d.pageCount}p · ${recordCount}r`}
                            {d.exported && <span className="ml-1 text-emerald-600 font-bold">· exported</span>}
                          </div>
                          {!d.error && totalPages > 0 && (
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <div className="flex-1 h-1 bg-slate-200 overflow-hidden">
                                <div
                                  className={`h-full transition-all ${donePages === totalPages ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                  style={{ width: `${Math.round((donePages / totalPages) * 100)}%` }}
                                />
                              </div>
                              {pendingPages > 0 && (
                                <span className="text-[8px] font-bold text-amber-700 tabular-nums flex-shrink-0">{pendingPages} OT</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                    <div className="flex flex-col items-center justify-center flex-shrink-0 px-1 gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleIntakeFlag(d.id); }}
                        className={`transition-all ${d.flagged ? 'text-amber-600' : 'opacity-30 group-hover:opacity-80 hover:!opacity-100 text-slate-400 hover:text-amber-600'}`}
                        title={d.flagged ? 'Unflag document' : 'Flag document'}
                      >
                        <Flag size={12} fill={d.flagged ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={() => removeDoc(d.id)}
                        className="opacity-30 group-hover:opacity-80 hover:!opacity-100 text-slate-400 hover:text-red-600 transition-all"
                        title="Remove document"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
        <div className="p-3 border-t border-slate-200 flex-shrink-0">
          <label className="block">
            <input type="file" multiple accept=".pdf,.xlsx,.xls,.csv" onChange={onFilesSelected} className="hidden" />
            <span className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] font-bold text-blue-800 bg-blue-50 border border-blue-400 cursor-pointer hover:bg-blue-100 hover:border-blue-500 active:bg-blue-200 transition-colors">
              <Upload size={12} />
              Add More Files
            </span>
          </label>
        </div>
          </>
        ) : (
          // Collapsed rail — vertical label + expand button. Click anywhere on the
          // rail to expand; explicit chevron at top doubles up for clarity.
          <button
            onClick={() => setIntakeOpen(true)}
            className="flex-1 flex flex-col items-center py-3 gap-3 hover:bg-slate-50 transition-colors group"
            title="Expand intake bundle panel"
          >
            <ChevronRight size={14} className="text-slate-500 group-hover:text-slate-800" />
            <div className="flex-1 flex items-center justify-center">
              <div
                className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] group-hover:text-slate-800"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                Intake Bundle · {intake.length}
              </div>
            </div>
          </button>
        )}
      </aside>

      {/* ============================================================ */}
      {/* CENTER — Active document page grid                            */}
      {/* ============================================================ */}
      <section className="flex flex-col overflow-hidden">
        {(() => {
          return activeDoc ? (
          <>
            {/* Toolbar */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Document</div>
                  <div className="text-sm font-bold text-slate-800 truncate">{activeDoc.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {activeDoc.pageCount} pages · {records.length} record{records.length !== 1 ? 's' : ''}
                    {hasBlockingIssues && (
                      <span className="ml-2 text-red-700 font-semibold">· {recordIssues.filter(i => i.severity === 'error').length} error{recordIssues.filter(i => i.severity === 'error').length !== 1 ? 's' : ''}</span>
                    )}
                  {!hasBlockingIssues && hasWarnings && (
                      <span className="ml-2 text-amber-600 font-semibold">· {recordIssues.filter(i => i.severity === 'warning').length} warning{recordIssues.filter(i => i.severity === 'warning').length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" icon={Download} onClick={exportActiveDoc} disabled={!canExport || sendingToImport}>
                    {exporting ? 'Exporting…' : 'Export ZIP'}
                  </Button>
                  <Button variant="primary" size="md" icon={Zap} onClick={sendToImport} disabled={!canExport || exporting}>
                    {sendingToImport ? 'Sending…' : 'Send to AI Extraction'}
                  </Button>
                </div>
              </div>
              {exportError && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 text-[11px] text-red-800">
                  Export failed: {exportError}
                </div>
              )}
              {sendError && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 text-[11px] text-red-800">
                  Send to Import failed: {sendError}
                </div>
              )}
              {hasBlockingIssues && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 text-[11px] text-red-900">
                  <strong>{recordIssues.filter(i => i.severity === 'error').length} error{recordIssues.filter(i => i.severity === 'error').length !== 1 ? 's' : ''} (export blocked):</strong>{' '}
                  {recordIssues.filter(i => i.severity === 'error').slice(0, 3).map((iss, i, arr) => (
                    <span key={i}>Record {iss.recordIdx}: {iss.detail}{i < Math.min(2, arr.length - 1) ? '; ' : ''}</span>
                  ))}
                </div>
              )}
              {hasWarnings && !warningsDismissed && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
                  <div className="flex-1">
                    <strong>{recordIssues.filter(i => i.severity === 'warning').length} warning{recordIssues.filter(i => i.severity === 'warning').length !== 1 ? 's' : ''}:</strong>{' '}
                    {recordIssues.filter(i => i.severity === 'warning').slice(0, 3).map((iss, i, arr) => (
                      <span key={i}>Record {iss.recordIdx}: {iss.detail}{i < Math.min(2, arr.length - 1) ? '; ' : ''}</span>
                    ))}
                    {recordIssues.filter(i => i.severity === 'warning').length > 3 && <span> …and {recordIssues.filter(i => i.severity === 'warning').length - 3} more</span>}
                    <span className="block mt-1 text-amber-700">Export is still allowed — proceed if intentional.</span>
                  </div>
                  <button onClick={() => setWarningsDismissed(true)} className="flex-shrink-0 text-amber-600 hover:text-amber-900 hover:bg-amber-100 p-0.5 transition-colors" title="Dismiss warnings">
                    <X size={13} />
                  </button>
                </div>
              )}
              <p className="text-[10px] text-slate-400 mt-2">
                Click page to preview · "Start" marks a record break · dropdown sets page type · shift-click dropdown to apply range
              </p>
              {/* RWK007: Multi-select bulk rotation toolbar */}
              <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200">
                <button
                  onClick={() => {
                    const allNums = (activeDoc?.pages || []).map(p => p.pageNum);
                    if (selectedPageNums.size === allNums.length && allNums.length > 0) {
                      setSelectedPageNums(new Set());
                    } else {
                      setSelectedPageNums(new Set(allNums));
                    }
                  }}
                  className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 border border-blue-400 bg-white text-blue-800 hover:bg-blue-100 active:bg-blue-200 transition-colors"
                  title={selectedPageNums.size === (activeDoc?.pages || []).length && (activeDoc?.pages || []).length > 0 ? 'Deselect all pages' : 'Select all pages'}
                >
                  {selectedPageNums.size === (activeDoc?.pages || []).length && (activeDoc?.pages || []).length > 0 ? 'Deselect All' : 'Select All'}
                </button>
                {selectedPageNums.size > 0 && (
                  <>
                    <span className="text-[10px] font-semibold text-blue-900 flex-1">{selectedPageNums.size} page{selectedPageNums.size !== 1 ? 's' : ''} selected</span>
                    <button
                      onClick={() => rotateSelectedPages(-90)}
                      className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 border border-blue-300 bg-white text-blue-800 hover:bg-blue-50 active:bg-blue-100 transition-colors"
                      title="Rotate selected pages 90° counter-clockwise"
                    >
                      <RotateCcw size={11} /> CCW
                    </button>
                    <button
                      onClick={() => rotateSelectedPages(90)}
                      className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 border border-blue-300 bg-white text-blue-800 hover:bg-blue-50 active:bg-blue-100 transition-colors"
                      title="Rotate selected pages 90° clockwise"
                    >
                      <RotateCw size={11} /> CW
                    </button>
                    <button
                      onClick={() => setSelectedPageNums(new Set())}
                      className="text-[10px] font-semibold px-2.5 py-1.5 border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                      title="Clear selection"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Page grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeDoc.error ? (
                <div className="bg-red-50 border border-red-200  p-6 text-center text-red-800">
                  <AlertCircle size={28} className="mx-auto mb-2" />
                  <div className="text-sm font-bold">Could not parse PDF</div>
                  <div className="text-xs mt-1">{activeDoc.error}</div>
                </div>
              ) : (
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))' }}>
                  {activeDoc.pages
                    .slice()
                    .sort((a, b) => a.pageNum - b.pageNum)
                    .map((p) => {
                    const pt = PAGE_TYPES[p.kind] || { label: p.kind, accent: 'bg-slate-500' };
                    const isPreview = activePageNum === p.pageNum;
                    // Determine which record this page belongs to (for the colored band)
                    const recordForPage = records.find(r => r.pages.some(rp => rp.pageNum === p.pageNum));
                    const recordIdx = recordForPage?.recordIdx || 0;
                    // Hash recordIdx → one of the page-color palette entries
                    const recordColor = PAGE_COLORS[(recordIdx - 1) % PAGE_COLORS.length] || PAGE_COLORS[0];
                    const isPageSelected = selectedPageNums.has(p.pageNum);
                    const isSource = !!p.isCropSource;
                    const isVirtual = !!p.isVirtualCrop;
                    return (
                      <div
                        key={p.pageNum}
                        className={`relative  border-2 overflow-hidden bg-white transition-all ${
                          isSource ? 'border-slate-300 opacity-60' :
                          isPageSelected ? 'border-blue-400 shadow-sm ring-1 ring-blue-200' :
                          isPreview ? 'border-blue-500 shadow-md' :
                          isVirtual ? 'border-emerald-400 shadow-sm' :
                          'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {/* Record band — top edge colored by record index */}
                        <div className={`h-1.5 ${isVirtual ? 'bg-emerald-500' : isSource ? 'bg-slate-300' : recordColor.accent}`} title={isSource ? 'Source page (retained, not sent to AI)' : `Record ${recordIdx}`}></div>
                        {/* RWK007: Checkbox for multi-select bulk rotation — not applicable to source pages */}
                        {!isSource && (
                          <div
                            className="absolute top-2 right-2 z-20"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPageNums(prev => {
                                const next = new Set(prev);
                                if (next.has(p.pageNum)) next.delete(p.pageNum); else next.add(p.pageNum);
                                return next;
                              });
                            }}
                            title={isPageSelected ? 'Deselect page' : 'Select page for bulk rotation'}
                          >
                            <input
                              type="checkbox"
                              readOnly
                              checked={isPageSelected}
                              className="w-4 h-4 accent-blue-700 cursor-pointer"
                            />
                          </div>
                        )}
                        {/* Source page badge */}
                        {isSource && (
                          <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 bg-slate-500 text-white text-[9px] font-bold shadow-sm">
                            SOURCE
                          </div>
                        )}
                        {/* Virtual crop segment badge */}
                        {isVirtual && (
                          <div className="absolute top-2 left-2 z-10 flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-700 text-white text-[9px] font-bold shadow-sm">
                            <Crop size={8} />SEG {p._cropBoxIdx + 1}
                          </div>
                        )}
                        {/* Record-start marker */}
                        {p.isRecordStart && !isSource && (
                          <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 bg-blue-700 text-white text-[9px] font-bold shadow-sm">
                            REC {recordForPage?.recordIdx || '?'}
                          </div>
                        )}
                        {/* Crop count badge on source pages */}
                        {isSource && p.cropBoxes?.length > 0 && (
                          <div className="absolute bottom-2 right-2 z-10 flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-700 text-white text-[9px] font-bold shadow-sm">
                            <Crop size={8} />{p.cropBoxes.length}
                          </div>
                        )}
                        {/* Page thumb */}
                        <button
                          onClick={() => !isSource && setActivePageNum(p.pageNum)}
                          className={`block w-full aspect-[3/4] bg-slate-100 overflow-hidden ${isSource ? 'cursor-default' : ''}`}
                        >
                          {isVirtual ? (
                            <CropBoxThumbnail
                              pdfDoc={activeDoc.pdfDoc}
                              pageNum={p._sourcePageNum}
                              cropBox={p._cropBox}
                              scale={0.4}
                              rotation={p.rotation || 0}
                            />
                          ) : (
                            <PrePrepThumbnail pdfDoc={activeDoc.pdfDoc} pageNum={Math.round(p.pageNum)} scale={0.4} rotation={p.rotation || 0} />
                          )}
                        </button>
                        {/* Page footer: number, kind dropdown, record-start toggle */}
                        <div className="p-2 border-t border-slate-200 bg-white">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold text-slate-600">
                              {isVirtual ? `p.${p._sourcePageNum} ✂${p._cropBoxIdx + 1}` : `p.${p.pageNum}`}
                            </span>
                            {isSource ? (
                              <span className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5">no AI</span>
                            ) : (
                              <button
                                onClick={() => toggleRecordStart(p.pageNum)}
                                disabled={p.pageNum === 1}
                                className={`text-[9px] font-bold px-2 py-1 transition-colors ${
                                  p.isRecordStart
                                    ? 'bg-blue-700 text-white hover:bg-blue-800'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                } ${p.pageNum === 1 ? 'opacity-40 cursor-not-allowed' : ''}`}
                                title={p.pageNum === 1 ? 'Page 1 always starts a record' : (p.isRecordStart ? 'Click to remove break' : 'Click to mark this page as start of new record')}
                              >
                                {p.isRecordStart ? '✓ Start' : 'Start'}
                              </button>
                            )}
                          </div>
                          <div className="relative">
                            <span
                              className={`absolute right-6 top-1/2 -translate-y-1/2 w-2.5 h-2.5 ${pt.accent} pointer-events-none ring-1 ring-slate-300 z-10`}
                              aria-hidden="true"
                            ></span>
                            <select
                              value={p.kind}
                              onChange={(e) => setPageKind(p.pageNum, e.target.value, e.nativeEvent?.shiftKey)}
                              disabled={isSource}
                              className="w-full text-[11px] font-bold pl-2 pr-7 py-1.5 text-slate-800 bg-white border border-slate-300 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-colors text-left disabled:opacity-50"
                              title="Page type. Shift-click to apply same kind to all pages between this and your last selection."
                            >
                              {PAGE_TYPE_ORDER.map(code => (
                                <option key={code} value={code}>
                                  {code} — {PAGE_TYPES[code]?.label || code}
                                </option>
                              ))}
                            </select>
                          </div>
                          {/* Rotation controls — not applicable to source pages */}
                          {!isSource && (
                            <div className="flex items-center justify-between mt-1.5 gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); rotatePage(p.pageNum, -90); }}
                                className="flex-1 flex items-center justify-center gap-1 text-[9px] font-semibold px-1 py-1.5 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100 transition-colors"
                                title="Rotate 90° counter-clockwise"
                              >
                                <RotateCcw size={11} />
                              </button>
                              <span
                                className="text-[9px] font-mono text-slate-500 tabular-nums px-1"
                                title="Current rotation"
                              >
                                {(p.rotation || 0)}°
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); rotatePage(p.pageNum, 90); }}
                                className="flex-1 flex items-center justify-center gap-1 text-[9px] font-semibold px-1 py-1.5 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100 transition-colors"
                                title="Rotate 90° clockwise"
                              >
                                <RotateCw size={11} />
                              </button>
                            </div>
                          )}
                          {/* Source page: reverse the crop and restore the page to normal */}
                          {isSource && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setPageCropBoxes(p.pageNum, []); }}
                              className="mt-1.5 w-full flex items-center justify-center gap-1 text-[9px] font-semibold px-1 py-1 border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-400 transition-colors"
                              title="Remove all crop segments and restore this page to normal"
                            >
                              <X size={9} />
                              Remove Crops
                            </button>
                          )}
                          {/* Crop button — only on real pages (not source, not virtual segments) */}
                          {!isVirtual && !isSource && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setCropModalTarget({ docId: activeDocId, pageNum: p.pageNum }); }}
                              className={`mt-1.5 w-full flex items-center justify-center gap-1 text-[9px] font-semibold px-1 py-1 border transition-colors ${
                                p.cropBoxes?.length > 0
                                  ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                                  : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50'
                              }`}
                            >
                              <Crop size={9} />
                              {p.cropBoxes?.length > 0 ? `Re-crop (${p.cropBoxes.length} segs)` : 'Crop'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
          ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <FileText size={40} className="mx-auto mb-3 text-slate-300" />
              <div className="text-sm font-semibold text-slate-500">Select a document to begin</div>
              <div className="text-[11px] text-slate-400 mt-1">Choose a file from the bundle on the left</div>
            </div>
          </div>
          );
        })()}
      </section>

      {/* ============================================================ */}
      {/* RIGHT — Live record tree + bundle context                      */}
      {/* ============================================================ */}
      <aside className="bg-white border-l border-slate-200 flex flex-col overflow-hidden">
        {treeOpen ? (
          <>
            {/* Record tree */}
            <div className="px-3 py-3 border-b border-slate-200 flex-shrink-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    onClick={() => setTreeOpen(false)}
                    className="p-1  hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0"
                    title="Collapse record structure panel"
                  >
                    <ChevronRight size={13} />
                  </button>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider truncate">Record Structure</h3>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5  bg-emerald-100 text-emerald-800 flex-shrink-0">{records.length}</span>
              </div>
              <p className="text-[10px] text-slate-500">Live preview of export folders</p>
            </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {records.length === 0 ? (
            <div className="p-4 text-center text-[11px] text-slate-400 italic">
              No records yet — open a document and mark page breaks
            </div>
          ) : records.map(r => {
            const recordColor = PAGE_COLORS[(r.recordIdx - 1) % PAGE_COLORS.length] || PAGE_COLORS[0];
            const recId = String(r.recordIdx).padStart(7, '0');
            const hasIssue = recordIssues.find(i => i.recordIdx === r.recordIdx);
            return (
              <div key={r.recordIdx} className={` border ${hasIssue ? 'border-red-300 bg-red-50/40' : 'border-slate-200 bg-white'}`}>
                <div className={`px-2 py-1 ${recordColor.soft} ${recordColor.text} text-[10px] font-bold flex items-center justify-between`}>
                  <span className="font-mono">{recId}/</span>
                  <span>{r.pages.length} page{r.pages.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="p-1.5 space-y-0.5">
                  {(() => {
                    // Compute occurrence number per kind so the tree preview shows the
                    // exact filename the export will produce (CF_0001, OT_0001, OT_0002, etc.).
                    // Tracks running counts as we iterate the record's pages in order.
                    const seen = {};
                    return r.pages.map(p => {
                      const pt = PAGE_TYPES[p.kind] || { label: p.kind, accent: 'bg-slate-500' };
                      seen[p.kind] = (seen[p.kind] || 0) + 1;
                      const occ = String(seen[p.kind]).padStart(4, '0');
                      return (
                        <button
                          key={p.pageNum}
                          onClick={() => setActivePageNum(p.pageNum)}
                          className="w-full flex items-center gap-1.5 px-1.5 py-1 text-left hover:bg-slate-50 text-[10px]"
                        >
                          <span className={`w-2 h-2 flex-shrink-0 ${pt.accent}`}></span>
                          <span className="font-mono text-slate-600 truncate">{recId}_{p.kind}_{occ}.pdf</span>
                          {p.isVirtualCrop && (
                            <span className="text-[8px] font-bold text-emerald-700 bg-emerald-100 px-1 flex-shrink-0">crop</span>
                          )}
                          <span className="ml-auto text-slate-400 flex-shrink-0">
                            {p.isVirtualCrop ? `✂${p._cropBoxIdx + 1}` : `p.${p.pageNum}`}
                          </span>
                        </button>
                      );
                    });
                  })()}
                </div>
                {hasIssue && (
                  <div className="px-2 py-1 text-[9px] text-red-700 border-t border-red-200">
                    ⚠ {hasIssue.detail}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Bundle context (shared across docs in this intake) */}
        <div className="p-3 border-t border-slate-200 flex-shrink-0 space-y-2.5">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Bundle Context</div>
          <div>
            <label className="text-xs text-slate-600 font-medium block mb-1">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full text-xs px-2 py-1.5 border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400">
              <option>Low</option>
              <option>High</option>
              <option>Urgent</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-600 font-medium block mb-1">Notes</label>
            <textarea
              value={batchNotes}
              onChange={(e) => setBatchNotes(e.target.value)}
              rows={2}
              placeholder="e.g., Mail received Mar 18-22, Tampa region…"
              className="w-full text-xs px-2 py-1.5 border border-slate-300 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 font-medium block mb-1">Index file (optional)</label>
            {indexFile ? (
              <div className="flex items-center gap-1.5 text-xs bg-emerald-50 border border-emerald-200 px-2 py-1.5">
                <FileSpreadsheet size={12} className="text-emerald-700 flex-shrink-0" />
                <span className="flex-1 text-emerald-900 truncate">{indexFile.name}</span>
                <button onClick={() => setIndexFile(null)} className="text-slate-400 hover:text-red-600 p-0.5"><X size={11} /></button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-1.5 text-xs text-slate-500 border border-dashed border-slate-300 px-2 py-2 cursor-pointer hover:border-blue-400 hover:text-blue-700 transition-colors">
                <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { if (e.target.files?.[0]) setIndexFile(e.target.files[0]); e.target.value = ''; }} className="hidden" />
                <FileSpreadsheet size={12} />
                Upload Excel/CSV
              </label>
            )}
          </div>
        </div>
          </>
        ) : (
          // Collapsed rail — vertical label + expand button.
          <button
            onClick={() => setTreeOpen(true)}
            className="flex-1 flex flex-col items-center py-3 gap-3 hover:bg-slate-50 transition-colors group"
            title="Expand record structure panel"
          >
            <ChevronLeft size={14} className="text-slate-500 group-hover:text-slate-800" />
            <div className="flex-1 flex items-center justify-center">
              <div
                className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] group-hover:text-slate-800"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                Record Structure · {records.length}
              </div>
            </div>
          </button>
        )}
      </aside>

      {/* Page preview modal — opens when operator clicks any thumbnail. Renders the
          page at full size with a small caption showing the page number, current
          page-type assignment, and which record it belongs to. ESC or click outside
          to close. The Record Structure tree stays visible throughout, so this is
          purely an inspect-at-size action; no editing happens in the modal. */}
      {activePage && activeDoc?.pdfDoc && (
        <div
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          onClick={() => setActivePageNum(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setActivePageNum(null); }}
        >
          <div
            className="bg-white  shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header — two rows. Top row: identity + nav. Bottom row: editing controls
                (Start toggle, page-type, rotate). The bottom row acts on the currently-
                previewed page so the operator can label and orient without closing. */}
            <div className="border-b border-slate-200 flex-shrink-0 bg-gradient-to-r from-slate-50 to-white">
              {/* Row 1: identity + record + navigation */}
              <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="text-sm font-bold text-slate-800 truncate">{activeDoc.name}</div>
                  <span className="text-[10px] text-slate-400">·</span>
                  <div className="text-xs text-slate-600 flex-shrink-0">
                    {activePage.isVirtualCrop
                      ? `Page ${activePage._sourcePageNum} ✂${activePage._cropBoxIdx + 1} of ${activeDoc.pageCount}`
                      : `Page ${activePageNum} of ${activeDoc.pageCount}`}
                  </div>
                  {(() => {
                    const recordForPage = records.find(r => r.pages.some(rp => rp.pageNum === activePageNum));
                    if (!recordForPage) return null;
                    return (
                      <>
                        <span className="text-[10px] text-slate-400">·</span>
                        <span className="text-[11px] text-blue-800 font-semibold">Record {recordForPage.recordIdx}</span>
                      </>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setActivePageNum(n => Math.max(1, (n || 1) - 1))}
                    disabled={activePageNum <= 1 && !activePage.isVirtualCrop}
                    className="p-1.5  hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600"
                    title="Previous page (←)"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setActivePageNum(n => Math.min(activeDoc.pageCount, (n || 0) + 1))}
                    disabled={activePageNum >= activeDoc.pageCount && !activePage.isVirtualCrop}
                    className="p-1.5  hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600"
                    title="Next page (→)"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <div className="w-px h-5 bg-slate-200 mx-1"></div>
                  <button
                    onClick={() => setActivePageNum(null)}
                    className="p-1.5  hover:bg-slate-100 text-slate-600"
                    title="Close (Esc)"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
              {/* Row 2: editing controls — Start, page-type, rotate */}
              <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
                {/* Start (record break) toggle */}
                <button
                  onClick={() => toggleRecordStart(activePageNum)}
                  disabled={activePageNum === 1}
                  className={`text-[11px] font-bold px-3 py-1.5  transition-colors ${
                    activePage.isRecordStart
                      ? 'bg-blue-700 text-white hover:bg-blue-800'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                  } ${activePageNum === 1 ? 'opacity-60 cursor-not-allowed' : ''}`}
                  title={activePageNum === 1 ? 'Page 1 always starts a record' : (activePage.isRecordStart ? 'Click to remove break' : 'Click to mark this page as start of new record')}
                >
                  {activePage.isRecordStart ? '✓ Start of Record' : 'Mark as Record Start'}
                </button>
                {/* Page-type selector */}
                <div className="relative">
                  {(() => {
                    const pt = PAGE_TYPES[activePage.kind] || { label: activePage.kind, accent: 'bg-slate-500' };
                    return (
                      <span
                        className={`absolute right-7 top-1/2 -translate-y-1/2 w-2.5 h-2.5  ${pt.accent} pointer-events-none ring-1 ring-slate-300 z-10`}
                        aria-hidden="true"
                      ></span>
                    );
                  })()}
                  <select
                    value={activePage.kind}
                    onChange={(e) => setPageKind(activePageNum, e.target.value, false)}
                    className="text-[11px] font-bold  pl-7 pr-2 py-1.5 text-slate-800 bg-white border border-slate-300 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-colors"
                    title="Page type — auto-tags the next page as the matching Back"
                  >
                    {PAGE_TYPE_ORDER.map(code => (
                      <option key={code} value={code}>
                        {code} — {PAGE_TYPES[code]?.label || code}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Rotate controls */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => rotatePage(activePageNum, -90)}
                    className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1.5  border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                    title="Rotate 90° counter-clockwise"
                  >
                    <RotateCcw size={12} />
                  </button>
                  <span
                    className="text-[10px] font-mono text-slate-500 tabular-nums px-1.5"
                    title="Current rotation"
                  >
                    {(activePage.rotation || 0)}°
                  </span>
                  <button
                    onClick={() => rotatePage(activePageNum, 90)}
                    className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1.5  border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                    title="Rotate 90° clockwise"
                  >
                    <RotateCw size={12} />
                  </button>
                </div>
                {/* Crop button — only for real pages, not virtual segments */}
                {!activePage.isVirtualCrop && (
                  <button
                    onClick={() => { setActivePageNum(null); setCropModalTarget({ docId: activeDocId, pageNum: activePageNum }); }}
                    className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 border transition-colors ${
                      activePage.cropBoxes && activePage.cropBoxes.length > 0
                        ? 'border-emerald-500 bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50'
                    }`}
                    title={activePage.cropBoxes?.length > 0 ? `${activePage.cropBoxes.length} crops defined — edit` : 'Crop: draw segments on this page'}
                  >
                    <Crop size={13} />
                    {activePage.cropBoxes?.length > 0 ? `${activePage.cropBoxes.length} Crops` : 'Crop'}
                  </button>
                )}
              </div>
            </div>
            {/* Body — the rendered page at large scale */}
            <div className="flex-1 overflow-auto bg-slate-100 p-6 flex items-start justify-center">
              <div className="bg-white shadow-lg" style={{ minWidth: '400px' }}>
                {activePage.isVirtualCrop ? (
                  <CropBoxThumbnail
                    pdfDoc={activeDoc.pdfDoc}
                    pageNum={activePage._sourcePageNum}
                    cropBox={activePage._cropBox}
                    scale={1.5}
                    rotation={activePage.rotation || 0}
                  />
                ) : (
                  <PrePrepThumbnail
                    pdfDoc={activeDoc.pdfDoc}
                    pageNum={Math.round(activePage.pageNum)}
                    scale={1.5}
                    rotation={activePage.rotation || 0}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* === Crop Segment Modal === */}
      {cropModalTarget && (() => {
        const targetDoc = intake.find(d => d.id === cropModalTarget.docId);
        if (!targetDoc) return null;
        const targetPage = targetDoc.pages.find(p => p.pageNum === cropModalTarget.pageNum);
        if (!targetPage) return null;
        const seen = {};
        for (const p of targetDoc.pages) {
          seen[p.kind] = (seen[p.kind] || 0) + 1;
          if (p.pageNum === targetPage.pageNum) break;
        }
        const occ = String(seen[targetPage.kind] || 1).padStart(4, '0');
        const recForPage = (() => {
          let idx = 0;
          for (const p of targetDoc.pages) {
            if (p.isRecordStart) idx++;
            if (p.pageNum === targetPage.pageNum) return { idx };
          }
          return { idx: 1 };
        })();
        const recId = String(recForPage.idx).padStart(7, '0');
        return (
          <CropSegmentModal
            page={targetPage}
            pdfDoc={targetDoc.pdfDoc}
            recId={recId}
            kindOcc={occ}
            onClose={() => setCropModalTarget(null)}
            onApply={(boxes) => {
              setPageCropBoxes(cropModalTarget.pageNum, boxes);
              setCropModalTarget(null);
            }}
          />
        );
      })()}
    </div>
  );
};
export default PrePrepScreen;