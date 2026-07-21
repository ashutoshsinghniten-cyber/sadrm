import React, { useMemo } from 'react';
import { X, CheckCircle2, RotateCcw } from 'lucide-react';
import Button from '../../../components/shared/Button.jsx';
import { getQcReason } from '../../../utils/qcUtils.js';

export default function RejectedRecordsModal({ batches = [], archivedRecords = [], onClose, onRestore, canRestore = false }) {
  const rejected = useMemo(() => {
    const out = [];
    for (const b of batches) {
      for (const r of (b.records || [])) {
        if (r.qcReview?.status !== 'rejected') continue;
        out.push({ batchId: b.id, batch: b, record: r });
      }
    }
    for (const r of archivedRecords) {
      if (r.qcReview?.status !== 'rejected') continue;
      if (out.some(o => o.record.id === r.id)) continue;
      out.push({ batchId: r.batchId, batch: null, record: r });
    }
    return out.sort((a, b) => {
      const aT = new Date(a.record.qcReview?.reviewedAt || 0).getTime();
      const bT = new Date(b.record.qcReview?.reviewedAt || 0).getTime();
      return bT - aT;
    });
  }, [batches, archivedRecords]);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white  shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <X size={14} className="text-red-700" />
              <h3 className="text-sm font-bold text-slate-800">Rejected Records</h3>
              <span className="text-[10px] font-bold px-1.5 py-0.5  bg-red-100 text-red-800">{rejected.length}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Records terminal-rejected by QC or Pre-Prep
              {!canRestore && <span className="ml-2 text-amber-700">· read-only (admin role required to restore)</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-700"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {rejected.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <CheckCircle2 size={32} className="mx-auto mb-2 text-slate-300" />
              <div className="text-sm">No rejected records</div>
              <div className="text-[11px] mt-1">All records have a place in the workflow.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {rejected.map(({ batchId, record }) => {
                const reason = getQcReason(record.qcReview);
                const reviewer = record.qcReview?.reviewer || '—';
                const reviewedAt = record.qcReview?.reviewedAt;
                return (
                  <div key={record.id} className=" border border-slate-200 bg-white p-3 hover:border-slate-300 transition">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-mono text-[12px] font-bold text-slate-800">{record.recordId || record.id}</span>
                          <span className="text-[10px] text-slate-400">·</span>
                          <span className="text-[10px] font-mono text-slate-500">{batchId || '—'}</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5  bg-red-100 text-red-700 ring-1 ring-red-200 uppercase tracking-wider">Rejected</span>
                        </div>
                        <div className="text-[11px] text-slate-700 leading-snug break-words">{reason || <em className="text-slate-400">No reason provided</em>}</div>
                        <div className="text-[10px] text-slate-500 mt-1">
                          By <span className="font-semibold">{reviewer}</span>
                          {reviewedAt && <span> · {new Date(reviewedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                        </div>
                      </div>
                      {canRestore && batchId && (
                        <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => onRestore(batchId, record.id)} title="Restore this record">Restore</Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end flex-shrink-0 bg-slate-50">
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
