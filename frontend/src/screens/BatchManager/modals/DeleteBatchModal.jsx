import React, { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import Button from '../../../components/shared/Button.jsx';
import { WORKFLOW_STAGE_CONFIG } from '../../../utils/extractionUtils.js';

export default function DeleteBatchModal({ batch, archivedRecordCount, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const stage = WORKFLOW_STAGE_CONFIG[batch.status] || { label: batch.status };
  const expected = (batch.id || '').slice(-8);
  const canConfirm = confirmText.trim().toUpperCase() === expected.toUpperCase();
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white  shadow-2xl max-w-lg w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-red-50 to-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8  bg-red-100 border border-red-200 flex items-center justify-center"><Trash2 size={14} className="text-red-700" /></div>
            <h3 className="text-sm font-bold text-slate-800">Delete Batch</h3>
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
                  Deleting from <span className="font-semibold">{stage.label}</span> will remove the batch from the live pipeline
                  {archivedRecordCount > 0 ? <> and cascade-delete <span className="font-bold">{archivedRecordCount}</span> archived record{archivedRecordCount !== 1 ? 's' : ''} from the Digital Repository</> : null}.
                  An audit entry will be retained in the Deleted Batches log.
                </div>
              </div>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Batch</div>
            <div className="font-mono text-sm font-bold text-slate-800">{batch.id}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{(batch.records || []).length} record{(batch.records || []).length !== 1 ? 's' : ''} · uploaded {batch.uploaded || '—'}</div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Reason (required)</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Duplicate batch uploaded in error; replaced by BATCH-..." className="w-full px-3 py-2 text-xs border border-slate-300  focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-500 resize-none" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Type <span className="font-mono text-red-700">{expected}</span> to confirm</label>
            <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="w-full px-3 py-2 text-xs font-mono border border-slate-300  focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-500" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" icon={Trash2} disabled={!canConfirm || !reason.trim()} onClick={() => onConfirm(reason.trim())}>Delete Batch</Button>
        </div>
      </div>
    </div>
  );
}
