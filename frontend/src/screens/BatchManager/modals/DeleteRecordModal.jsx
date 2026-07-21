import React, { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import Button from '../../../components/shared/Button.jsx';

export default function DeleteRecordModal({ record, batch, wasArchived, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const pageCount = (record.pages || []).length;
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white  shadow-2xl max-w-lg w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-red-50 to-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8  bg-red-100 border border-red-200 flex items-center justify-center"><Trash2 size={14} className="text-red-700" /></div>
            <h3 className="text-sm font-bold text-slate-800">Delete Record</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded">✕</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="bg-red-50 border border-red-200  p-3">
            <div className="flex items-start gap-2 text-[12px] text-red-900">
              <AlertTriangle size={14} className="text-red-700 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold mb-1">This action is permanent.</div>
                <div className="leading-snug">
                  Removes record <span className="font-mono font-bold">{record.recordId || record.id}</span> from batch{' '}
                  <span className="font-mono font-bold">{batch.id}</span>
                  {wasArchived ? <> and the archived copy from the Digital Repository</> : null}.
                  An audit entry will be retained in the Deleted Batches log.
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Pages</div><div className="text-sm font-bold text-slate-800 tabular-nums">{pageCount}</div></div>
            <div><div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Status</div><div className="text-sm font-bold text-slate-800">{wasArchived ? 'Archived' : record.hitlReview ? 'In review' : record.extractionStatus || 'pending'}</div></div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Reason (required)</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Duplicate record · scanned twice · operator error" className="w-full px-3 py-2 text-xs border border-slate-300  focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-500 resize-none" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" icon={Trash2} disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>Delete Record</Button>
        </div>
      </div>
    </div>
  );
}
