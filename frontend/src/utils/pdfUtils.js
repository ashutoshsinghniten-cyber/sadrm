import * as pdfJsLib from 'pdfjs-dist/build/pdf.mjs';
import { PDFDocument as PDFDocumentLib, degrees as pdfDegrees } from 'pdf-lib';

// ===== pdf.js — loaded from npm package (no CDN, works on Mac/Safari) =====
pdfJsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
export const loadPdfJs = () => Promise.resolve(pdfJsLib);

// ===== pdf-lib — loaded from npm package =====
export const loadPdfLib = () => Promise.resolve({ PDFDocument: PDFDocumentLib, degrees: pdfDegrees });

// Count pages in a PDF using pdf.js (primary) or structural regex (fallback)
export const countPdfPages = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const pdfjs = await loadPdfJs();
    if (pdfjs) {
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdf = await loadingTask.promise;
      const count = pdf.numPages;
      pdf.destroy();
      if (count > 0) return count;
    }
  } catch (err) {
    console.warn('pdf.js page count failed for', file.name, '— falling back to structural parser:', err);
  }
  // Structural fallback — Flate-aware
  try {
    const buf = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('latin1');
    const str = decoder.decode(buf);
    const allCounts = [];
    const scanText = (text) => {
      if (!text) return;
      const matches = [...text.matchAll(/\/Count\s+(\d+)(?!\d)/g)];
      for (const m of matches) {
        const v = parseInt(m[1], 10);
        if (v > 0 && v < 100000) allCounts.push(v);
      }
    };
    scanText(str);
    const tryDecompress = async (bytes) => {
      const order = bytes[0] === 0x78 ? ['deflate', 'deflate-raw'] : ['deflate-raw', 'deflate'];
      for (const format of order) {
        try {
          if (typeof DecompressionStream === 'undefined') return null;
          const ds = new DecompressionStream(format);
          const writer = ds.writable.getWriter();
          writer.write(bytes);
          writer.close();
          const resp = new Response(ds.readable);
          const decompBuf = new Uint8Array(await resp.arrayBuffer());
          if (decompBuf.length > 0) return decoder.decode(decompBuf);
        } catch (err) { /* try next */ }
      }
      return null;
    };
    const streamMarkerRegex = /stream\r?\n/g;
    let sm;
    const decompressPromises = [];
    while ((sm = streamMarkerRegex.exec(str)) !== null) {
      const streamDataStart = sm.index + sm[0].length;
      const searchStart = Math.max(0, sm.index - 4096);
      const lookback = str.substring(searchStart, sm.index);
      const dictEndRel = lookback.lastIndexOf('>>');
      if (dictEndRel === -1) continue;
      let depth = 1; let dictStartRel = -1; let i = dictEndRel - 1;
      while (i >= 1 && depth > 0) {
        if (lookback[i - 1] === '>' && lookback[i] === '>') { depth++; i -= 2; continue; }
        if (lookback[i - 1] === '<' && lookback[i] === '<') { depth--; if (depth === 0) { dictStartRel = i - 1; break; } i -= 2; continue; }
        i--;
      }
      if (dictStartRel === -1) continue;
      const dictPart = lookback.substring(dictStartRel + 2, dictEndRel);
      if (!/\/Filter[\s/]*[^]*?\/FlateDecode/.test(dictPart)) continue;
      const lengthMatch = dictPart.match(/\/Length\s+(\d+)(?!\d)/);
      if (!lengthMatch) continue;
      const length = parseInt(lengthMatch[1], 10);
      if (length <= 0 || length > buf.length) continue;
      if (streamDataStart + length > buf.length) continue;
      decompressPromises.push(tryDecompress(buf.subarray(streamDataStart, streamDataStart + length)));
    }
    const decompTexts = await Promise.all(decompressPromises);
    for (const t of decompTexts) scanText(t);
    if (allCounts.length > 0) return Math.max(...allCounts);
    return 1;
  } catch (err) {
    return 1;
  }
};

export const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result;
    const commaIdx = typeof result === 'string' ? result.indexOf(',') : -1;
    if (commaIdx !== -1) {
      resolve(result.slice(commaIdx + 1));
    } else {
      reject(new Error('FileReader returned unexpected result format'));
    }
  };
  reader.onerror = () => {
    file.arrayBuffer().then(buf => {
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      resolve(btoa(binary));
    }).catch(() => reject(new Error('FileReader and arrayBuffer both failed for: ' + file.name)));
  };
  reader.readAsDataURL(file);
});
