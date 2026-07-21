import React, { useState } from 'react';
import { UserPlus, X, Shield, Check, Send } from 'lucide-react';
import Button from '../../../components/shared/Button.jsx';
import { ROLE_DEFS } from '../../../constants/features.js';

const computeInitials = (fullName) => {
  if (!fullName) return '??';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export default function AddUserModal({ teams, onClose, onSubmit }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(ROLE_DEFS[1].name);
  const [team, setTeam] = useState(teams.length > 0 ? teams[0].name : '');
  const [mfa, setMfa] = useState(true);
  const [status, setStatus] = useState('invited');

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit = name.trim().length > 0 && emailValid;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      id: `u_${Date.now()}`,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      team: team || '—',
      status,
      lastActive: status === 'invited' ? '—' : 'Just now',
      initials: computeInitials(name),
      mfa
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white  shadow-2xl max-w-md w-full overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8  bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center shadow-sm"><UserPlus size={14} className="text-white" /></div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Add User</h3>
              <p className="text-[11px] text-slate-500">Invite a new team member to the platform</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded"><X size={15} /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Full Name <span className="text-red-600">*</span></label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aarti Deshmukh" className="w-full px-3 py-2 text-sm border border-slate-300  focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500" autoFocus />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Initials (Auto)</label>
              <div className="w-full px-3 py-2 text-sm border border-slate-200  bg-slate-50 font-mono text-slate-700">{computeInitials(name) || '—'}</div>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Email <span className="text-red-600">*</span></label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@tsa.org" className={`w-full px-3 py-2 text-sm border  focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 ${email && !emailValid ? 'border-red-400' : 'border-slate-300'}`} />
            {email && !emailValid && <div className="text-[10px] text-red-600 mt-1">Enter a valid email address</div>}
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Role <span className="text-red-600">*</span></label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300  bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500">
              {ROLE_DEFS.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
            </select>
            <div className="text-[10px] text-slate-500 mt-1">{ROLE_DEFS.find(r => r.name === role)?.perms.slice(0, 2).join(' · ')}…</div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Team</label>
            {teams.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-500 bg-slate-50 border border-slate-200  italic">No teams yet — user will be unassigned.</div>
            ) : (
              <select value={team} onChange={(e) => setTeam(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300  bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500">
                <option value="">— Unassigned —</option>
                {teams.map(t => <option key={t.id} value={t.name}>{t.name} · {t.location}</option>)}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Initial Status</label>
              <div className="flex gap-1.5">
                {[{ v: 'invited', label: 'Invited', icon: Send }, { v: 'active', label: 'Active', icon: Check }].map(s => {
                  const SIcon = s.icon;
                  return (
                    <button key={s.v} onClick={() => setStatus(s.v)} className={`flex-1 px-3 py-2 text-xs  border transition-colors flex items-center justify-center gap-1.5 ${status === s.v ? 'bg-blue-900 text-white border-blue-950' : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400'}`}>
                      <SIcon size={10} /> {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Require MFA</label>
              <button onClick={() => setMfa(!mfa)} className={`w-full px-3 py-2 text-xs  border transition-colors flex items-center justify-center gap-1.5 ${mfa ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-white text-slate-600 border-slate-300'}`}>
                <Shield size={10} />{mfa ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-200 px-5 py-3 bg-slate-50 flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="success" size="sm" icon={UserPlus} onClick={submit} disabled={!canSubmit}>
            {status === 'invited' ? 'Send Invitation' : 'Create User'}
          </Button>
        </div>
      </div>
    </div>
  );
}
