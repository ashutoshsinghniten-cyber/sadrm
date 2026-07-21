import React, { useState } from 'react';
import { Building2, X, Check, Plus } from 'lucide-react';
import Button from '../../../components/shared/Button.jsx';

const TEAM_COLOR_OPTIONS = [
  { name: 'Navy',   value: 'from-blue-600 to-blue-900' },
  { name: 'Teal',   value: 'from-emerald-600 to-teal-800' },
  { name: 'Amber',  value: 'from-amber-600 to-orange-800' },
  { name: 'Violet', value: 'from-violet-600 to-indigo-800' },
  { name: 'Rose',   value: 'from-rose-600 to-pink-800' },
  { name: 'Slate',  value: 'from-slate-600 to-slate-900' }
];

export default function AddTeamModal({ existingUsers, onClose, onSubmit }) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [lead, setLead] = useState('');
  const [color, setColor] = useState(TEAM_COLOR_OPTIONS[0].value);

  const canSubmit = name.trim().length > 0 && location.trim().length > 0;
  const leadUser = existingUsers.find(u => u.id === lead);

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      id: `t_${Date.now()}`,
      name: name.trim(),
      location: location.trim(),
      description: description.trim() || 'New team',
      lead: leadUser ? leadUser.name : '—',
      leadInitials: leadUser ? leadUser.initials : '—',
      color,
      activeBatches: 0,
      processedThisMonth: 0
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white  shadow-2xl max-w-md w-full overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-blue-50 to-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8  bg-gradient-to-br from-blue-700 to-blue-900 flex items-center justify-center shadow-sm"><Building2 size={14} className="text-white" /></div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Add Team</h3>
              <p className="text-[11px] text-slate-500">Create a new processing centre or functional team</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded"><X size={15} /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Team Name <span className="text-red-600">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mumbai" className="w-full px-3 py-2 text-sm border border-slate-300  focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500" autoFocus />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Location <span className="text-red-600">*</span></label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Atlanta, GA · USA" className="w-full px-3 py-2 text-sm border border-slate-300  focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What does this team do?" className="w-full px-3 py-2 text-sm border border-slate-300  focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 resize-none" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Team Lead</label>
            {existingUsers.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-500 bg-slate-50 border border-slate-200  italic">No users yet — you can assign a lead later</div>
            ) : (
              <select value={lead} onChange={(e) => setLead(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300  bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500">
                <option value="">— Select a lead (optional) —</option>
                {existingUsers.map(u => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Accent Colour</label>
            <div className="flex gap-2 flex-wrap">
              {TEAM_COLOR_OPTIONS.map(c => (
                <button key={c.value} onClick={() => setColor(c.value)} className={`relative w-12 h-8  bg-gradient-to-r ${c.value} transition-all ${color === c.value ? 'ring-2 ring-offset-2 ring-blue-600 scale-105' : 'opacity-70 hover:opacity-100'}`} title={c.name}>
                  {color === c.value && <Check size={12} className="absolute inset-0 m-auto text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-slate-200 px-5 py-3 bg-slate-50 flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" icon={Plus} onClick={submit} disabled={!canSubmit}>Create Team</Button>
        </div>
      </div>
    </div>
  );
}
