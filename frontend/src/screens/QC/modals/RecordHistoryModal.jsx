import React from 'react';
import { X, Activity, Check, CheckCircle2, ChevronLeft, ChevronRight, Scissors, RotateCcw } from 'lucide-react';
import Button from '../../../components/shared/Button.jsx';
import { getQcHistory, getQcReason } from '../../../utils/qcUtils.js';

// ==================== RECORD HISTORY MODAL (v3.13.11) ====================
const RecordHistoryModal = ({ record, onClose }) => {
  if (!record) return null;

  const history = getQcHistory(record.qcReview);
  const reworkOf = record.reworkOf;
  const currentStatus = record.qcReview?.status;
  const currentReason = getQcReason(record.qcReview);

  const actionTone = (action, destination) => {
    if (action === 'rejected') return { color: 'bg-red-500', label: 'Rejected', icon: X, text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' };
    if (action === 'restored') return { color: 'bg-emerald-500', label: 'Restored', icon: RotateCcw, text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' };
    if (action === 'sent-back') {
      if (destination === 'preprep') {
        return { color: 'bg-violet-500', label: 'Sent to Pre-Prep', icon: Scissors, text: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' };
      }
      return { color: 'bg-orange-500', label: 'Sent to HITL', icon: ChevronLeft, text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' };
    }
    if (action === 'sent-back-from-hitl') {
      return { color: 'bg-violet-500', label: 'HITL → Pre-Prep', icon: Scissors, text: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' };
    }
    if (action === 'page-moved-out') return { color: 'bg-blue-500', label: 'Page moved out', icon: ChevronRight, text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' };
    if (action === 'page-moved-in') return { color: 'bg-blue-500', label: 'Page moved in', icon: ChevronLeft, text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' };
    if (action === 'merged-into') return { color: 'bg-purple-500', label: 'Merged into another', icon: ChevronRight, text: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' };
    if (action === 'merged-from') return { color: 'bg-purple-500', label: 'Received merge', icon: ChevronLeft, text: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' };
    return { color: 'bg-slate-400', label: action || 'Event', icon: Activity, text: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200' };
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white  shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-slate-600" />
              <h3 className="text-sm font-bold text-slate-800">Record History</h3>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
              {record.recordId || record.id}
              {currentStatus && (
                <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5  bg-slate-100 text-slate-700 ring-1 ring-slate-200 uppercase tracking-wider">
                  {currentStatus}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-700">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {history.length === 0 && !reworkOf ? (
            <div className="text-center py-12 text-slate-400">
              <Activity size={32} className="mx-auto mb-2 text-slate-300" />
              <div className="text-sm">No history yet</div>
              <div className="text-[11px] mt-1">This record hasn't been reworked.</div>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-[14px] top-2 bottom-2 w-px bg-slate-200"></div>

              {reworkOf && (
                <div className="relative pl-10 pb-4">
                  <div className="absolute left-0 top-0 w-7 h-7  bg-purple-500 ring-4 ring-purple-50 flex items-center justify-center">
                    <Scissors size={12} className="text-white" />
                  </div>
                  <div className=" border border-purple-200 bg-purple-50 px-3 py-2">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] font-black px-1.5 py-0.5  bg-purple-600 text-white uppercase tracking-wider">Origin</span>
                      <span className="text-[10px] font-bold text-purple-900">Split from {reworkOf.originalRecordId}</span>
                      {reworkOf.splitAt && (
                        <span className="text-[10px] text-purple-700">
                          · {new Date(reworkOf.splitAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    {reworkOf.originalQcReason && (
                      <div className="text-[11px] text-purple-800 italic break-words">
                        Inherited reason: "{reworkOf.originalQcReason}"
                      </div>
                    )}
                  </div>
                </div>
              )}

              {history.map((h, idx) => {
                const tone = actionTone(h.action, h.destination);
                const Icon = tone.icon;
                return (
                  <div key={idx} className="relative pl-10 pb-4 last:pb-0">
                    <div className={`absolute left-0 top-0 w-7 h-7  ${tone.color} ring-4 ring-white flex items-center justify-center`}>
                      <Icon size={12} className="text-white" />
                    </div>
                    <div className={` border ${tone.border} ${tone.bg} px-3 py-2`}>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[10px] font-bold ${tone.text} uppercase tracking-wider`}>
                          {tone.label}
                        </span>
                        {h.reviewer && <span className="text-[10px] font-semibold text-slate-700">· {h.reviewer}</span>}
                        {h.at && (
                          <span className="text-[10px] text-slate-500">
                            · {new Date(h.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      {h.reason && (
                        <div className="text-[11px] text-slate-800 leading-snug break-words">
                          {h.reason}
                        </div>
                      )}
                      {(h.flaggedFields?.length > 0 || h.flaggedPages?.length > 0 || h.boundaryIssue) && (
                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          {h.flaggedFields?.map(f => (
                            <span key={f} className="text-[9px] font-bold px-1.5 py-0.5  bg-white text-slate-700 ring-1 ring-slate-300">{f}</span>
                          ))}
                          {h.flaggedPages?.map(p => (
                            <span key={p} className="text-[9px] font-mono font-bold px-1.5 py-0.5  bg-white text-slate-700 ring-1 ring-slate-300">{p}</span>
                          ))}
                          {h.boundaryIssue && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5  bg-white text-violet-700 ring-1 ring-violet-300">boundaries</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {(currentStatus === 'archived' || currentStatus === 'rejected') && (
                <div className="relative pl-10 pt-1">
                  <div className={`absolute left-0 top-1 w-7 h-7  ${currentStatus === 'archived' ? 'bg-emerald-500' : 'bg-slate-400'} ring-4 ring-white flex items-center justify-center`}>
                    {currentStatus === 'archived' ? <CheckCircle2 size={12} className="text-white" /> : <X size={12} className="text-white" />}
                  </div>
                  <div className={` border ${currentStatus === 'archived' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'} px-3 py-2`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${currentStatus === 'archived' ? 'text-emerald-700' : 'text-slate-700'}`}>
                        Current: {currentStatus}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between flex-shrink-0 bg-slate-50">
          <div className="text-[10px] text-slate-500">
            {history.length} event{history.length === 1 ? '' : 's'} · audit trail is read-only
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
};

export default RecordHistoryModal;
