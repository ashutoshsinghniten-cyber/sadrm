import React, { useState } from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import PdfPageRenderer from '../../../components/pdf/PdfPageRenderer.jsx';

// QCDocumentPreview — compact PDF page carousel for QC right pane.
const QCDocumentPreview = ({ pages = [] }) => {
  const [pageIdx, setPageIdx] = useState(0);
  const safePage = Math.max(0, Math.min(pageIdx, pages.length - 1));
  const currentPage = pages[safePage];
  if (!currentPage) return null;
  const pageCode = currentPage.code || currentPage.kind;
  return (
    <div className="mb-3  border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
          <FileText size={10} />
          Document Preview
          {pageCode && (
            <span className="px-1.5 py-0  bg-blue-100 text-blue-800 font-bold">{pageCode}</span>
          )}
        </div>
        {pages.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPageIdx(i => Math.max(0, i - 1))}
              disabled={safePage === 0}
              className="w-5 h-5 flex items-center justify-center  text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-[11px] font-bold"
            >
              ‹
            </button>
            <span className="text-[10px] text-slate-500 tabular-nums">{safePage + 1}/{pages.length}</span>
            <button
              onClick={() => setPageIdx(i => Math.min(pages.length - 1, i + 1))}
              disabled={safePage === pages.length - 1}
              className="w-5 h-5 flex items-center justify-center  text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-[11px] font-bold"
            >
              ›
            </button>
          </div>
        )}
      </div>
      <div className="max-h-[520px] overflow-auto bg-slate-100 flex items-start justify-center p-2">
        {currentPage.file ? (
          <PdfPageRenderer
            key={`${currentPage.file.name}-${currentPage.pageNum}`}
            file={currentPage.file}
            pageNum={1}
            scale={1.5}
            className="w-full"
          />
        ) : (
          <div className="w-full py-8 flex flex-col items-center justify-center text-center">
            <RefreshCw size={20} className="mb-2 text-amber-500" />
            <div className="text-xs font-semibold text-slate-600">PDF preview unavailable</div>
            <div className="text-[10px] text-slate-400 mt-1">
              {currentPage.filename || pageCode || 'Page'} · Re-import this batch to restore
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QCDocumentPreview;
