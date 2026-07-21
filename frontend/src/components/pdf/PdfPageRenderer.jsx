import React, { useRef, useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { loadPdfJs } from '../../utils/pdfUtils.js';

// ===== PdfPageRenderer — renders a specific page of a PDF File to canvas =====
const MAX_CANVAS_DIM = 4096; // Chrome/Edge safe upper bound per side

const PdfPageRenderer = ({ file, pageNum = 1, scale = 2, className = '' }) => {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!file || !canvasRef.current) return;
    let cancelled = false;
    let pdfDoc = null;
    let renderTask = null;

    (async () => {
      try {
        setStatus('loading');
        const pdfjs = await loadPdfJs();
        if (!pdfjs) {
          if (!cancelled) { setStatus('error'); setErrorMsg('pdf.js failed to load'); }
          return;
        }
        let buf;
        try {
          buf = await file.arrayBuffer();
        } catch (readErr) {
          throw new Error('Failed to read PDF file: ' + (readErr?.message || 'read error'));
        }
        if (cancelled) return;
        pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
        if (cancelled) { pdfDoc?.destroy(); return; }
        const pageNumClamped = Math.max(1, Math.min(pageNum, pdfDoc.numPages));
        const page = await pdfDoc.getPage(pageNumClamped);
        if (cancelled) { pdfDoc?.destroy(); return; }
        const baseViewport = page.getViewport({ scale: 1 });
        const safeScale = Math.min(
          scale,
          MAX_CANVAS_DIM / baseViewport.width,
          MAX_CANVAS_DIM / baseViewport.height
        );
        const viewport = page.getViewport({ scale: safeScale });
        const canvas = canvasRef.current;
        if (!canvas) { pdfDoc?.destroy(); return; }
        const ctx = canvas.getContext('2d', { willReadFrequently: false });
        if (!ctx) {
          throw new Error('Canvas 2D context unavailable (canvas size may exceed browser limit)');
        }
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
        if (cancelled) { pdfDoc?.destroy(); return; }
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        console.warn('PdfPageRenderer error:', err);
        setStatus('error');
        setErrorMsg(err?.message || 'render failed');
      }
    })();

    return () => {
      cancelled = true;
      if (renderTask) { try { renderTask.cancel(); } catch (e) {} }
      if (pdfDoc) { try { pdfDoc.destroy(); } catch (e) {} }
    };
  }, [file, pageNum, scale]);

  return (
    <div className={`relative ${className}`}>
      <canvas ref={canvasRef} className="block w-full h-auto bg-white" />
      {status === 'loading' && (
        <div className="absolute inset-0 bg-slate-50 flex items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-3 h-3 border-2 border-slate-300 border-t-blue-700  animate-spin"></div>
            <span>Loading PDF page…</span>
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 bg-red-50 flex items-center justify-center p-4">
          <div className="text-xs text-red-700 text-center">
            <AlertTriangle size={16} className="mx-auto mb-1" />
            Could not render PDF page
            {errorMsg && <div className="text-[10px] text-red-600 mt-1 font-mono">{errorMsg}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default PdfPageRenderer;
