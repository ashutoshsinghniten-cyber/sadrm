import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import Button from '../../../components/shared/Button.jsx';

// ==================== QC REJECT MODAL ====================
// Reject-only — the old HITL/Pre-Prep "send back for rework" destinations were
// removed in favor of the cross-stage Flag feature. This modal now does exactly
// one thing: terminally reject the selected record(s) with a reason.
const QCSendBackModal = ({ records = [], onClose, onSubmit }) => {
  const [reason, setReason] = useState('');
  const reasonRef = useRef(null);

  const minLen = 10;
  const reasonValid = reason.trim().length >= minLen;

  const submit = () => {
    if (!reasonValid) return;
    onSubmit(reason.trim());
  };

  useEffect(() => {
    reasonRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { submit(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason]);

  const recordSummary = records.length === 1
    ? `Record ${records[0].recordId || records[0].id}`
    : `${records.length} records · ${records.slice(0, 3).map(r => r.recordId || r.id).join(', ')}${records.length > 3 ? '…' : ''}`;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Reject Record{records.length !== 1 ? 's' : ''}</h3>
            <div className="text-[11px] text-slate-500 mt-0.5">{recordSummary}</div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-700">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-900">
            Terminal action — non-donation, duplicate, or junk content. To flag a record for later
            review without rejecting it, use the Flag toggle instead.
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Reason <span className="text-red-600">*</span>
              </label>
              <span className={`text-[10px] ${reasonValid ? 'text-emerald-600' : 'text-slate-400'}`}>
                {reason.trim().length} / {minLen}+
              </span>
            </div>
            <textarea
              ref={reasonRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this being rejected? Be specific (10+ chars)…"
              className={`w-full px-3 py-2 text-sm border resize-none focus:outline-none focus:ring-2 ${
                reasonValid
                  ? 'border-slate-300 focus:ring-blue-200 focus:border-blue-400'
                  : 'border-amber-300 focus:ring-amber-200 focus:border-amber-400'
              }`}
              rows={3}
            />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between flex-shrink-0 bg-slate-50">
          <div className="text-[10px] text-slate-500">
            <kbd className="px-1 bg-white border border-slate-200 text-slate-600">Esc</kbd> close · <kbd className="px-1 bg-white border border-slate-200 text-slate-600">⌘↵</kbd> submit
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="danger" size="sm" icon={X} disabled={!reasonValid} onClick={submit}>
              {records.length === 1 ? 'Reject Record' : `Reject ${records.length} Records`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QCSendBackModal;
