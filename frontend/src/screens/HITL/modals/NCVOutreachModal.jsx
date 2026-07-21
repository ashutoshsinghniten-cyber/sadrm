import React, { useState } from 'react';
import { X, Send } from 'lucide-react';
import { QC_OUTREACH_STAFF } from '../../../constants/geoHierarchy.js';
import Button from '../../../components/shared/Button.jsx';

const NCVOutreachModal = ({ records, onClose, onSubmit }) => {
  const [method, setMethod] = useState('email');
  const [assignedTo, setAssignedTo] = useState(QC_OUTREACH_STAFF[2]);
  const [notes, setNotes] = useState('');
  const canSubmit = records.length > 0;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white  shadow-2xl max-w-lg w-full overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-amber-50 to-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8  bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-sm shadow-amber-900/30">
              <Send size={14} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Initiate Donor Outreach</h3>
              <p className="text-[11px] text-slate-500">{records.length} donation record{records.length !== 1 ? 's' : ''} with NCV fields</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded"><X size={15} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Affected Records</label>
            <div className="bg-slate-50 border border-slate-200  p-2 max-h-28 overflow-y-auto">
              {records.slice(0, 6).map(c => (
                <div key={c.id} className="text-[11px] flex items-center justify-between py-0.5">
                  <span className="font-mono text-slate-700">{c.id}</span>
                  <span className="text-slate-600 truncate mx-2 flex-1">{(c.donorName || '').slice(0, 30)}{(c.donorName || '').length > 30 ? '…' : ''}</span>
                  <span className="text-amber-700 font-semibold">{c.ncvFields.length} field{c.ncvFields.length !== 1 ? 's' : ''}</span>
                </div>
              ))}
              {records.length > 6 && <div className="text-[10px] text-slate-500 italic mt-1">…and {records.length - 6} more</div>}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Outreach Method</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { v: 'phone', label: 'Phone Call', icon: '📞' },
                { v: 'email', label: 'Email', icon: '✉️' },
                { v: 'letter', label: 'Form Letter', icon: '📬' }
              ].map(m => (
                <button key={m.v} onClick={() => setMethod(m.v)} className={`px-2 py-2 text-xs rounded border transition-colors ${method === m.v ? 'bg-blue-900 text-white border-blue-950' : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400'}`}>
                  <div className="text-base mb-0.5">{m.icon}</div>
                  <div className="text-[11px] font-semibold">{m.label}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Assign To</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-300  bg-white focus:outline-none focus:ring-2 focus:ring-blue-200">
              {QC_OUTREACH_STAFF.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Any context for the outreach — specific fields, donor preferences, etc." className="w-full px-3 py-2 text-xs border border-slate-300  bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
          </div>
        </div>
        <div className="border-t border-slate-200 px-5 py-3 bg-slate-50 flex items-center justify-between flex-shrink-0">
          <span className="text-[11px] text-slate-500">Record{records.length !== 1 ? 's' : ''} will be set to <span className="font-semibold text-amber-800">NCV · Outreach</span> status.</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="warning" size="sm" icon={Send} onClick={() => onSubmit({ method, assignedTo, notes })} disabled={!canSubmit}>Initiate Outreach</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NCVOutreachModal;
