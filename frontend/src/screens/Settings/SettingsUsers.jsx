import React, { useState } from 'react';
import { Users, UserPlus, Building2, Plus, Search, Edit2, Trash2, Shield, AlertCircle, Lock, Check } from 'lucide-react';
import Button from '../../components/shared/Button.jsx';
import { FEATURES, FEATURE_IDS, FEATURE_GROUPS, ROLE_DEFS } from '../../constants/features.js';
import AddUserModal from '../UserManagement/modals/AddUserModal.jsx';
import AddTeamModal from '../UserManagement/modals/AddTeamModal.jsx';

export default function SettingsUsers({ users = [], setUsers = () => {}, teams = [], setTeams = () => {} }) {
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState(null);

  const filtered = users.filter(u =>
    (roleFilter === 'all' || u.role === roleFilter) &&
    (statusFilter === 'all' || u.status === statusFilter) &&
    (!search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
  );
  const statusBadge = { active: 'bg-emerald-100 text-emerald-800 ring-emerald-200', invited: 'bg-blue-100 text-blue-800 ring-blue-200', inactive: 'bg-slate-100 text-slate-600 ring-slate-200' };
  const roleCounts = ROLE_DEFS.reduce((acc, r) => { acc[r.name] = users.filter(u => u.role === r.name).length; return acc; }, {});

  const addUser = (user) => { setUsers(prev => [...prev, user]); setAddUserOpen(false); };
  const addTeam = (team) => { setTeams(prev => [...prev, team]); setAddTeamOpen(false); };
  const removeUser = (id) => setUsers(prev => prev.filter(u => u.id !== id));
  const removeTeam = (id) => {
    const t = teams.find(x => x.id === id);
    if (!t) return;
    setUsers(prev => prev.map(u => u.team === t.name ? { ...u, team: '—' } : u));
    setTeams(prev => prev.filter(x => x.id !== id));
  };
  const toggleTeamFeature = (teamId, featureId) => {
    setTeams(prev => prev.map(t => {
      if (t.id !== teamId) return t;
      const has = (t.features || []).includes(featureId);
      return { ...t, features: has ? (t.features || []).filter(f => f !== featureId) : [...(t.features || []), featureId] };
    }));
    const team = teams.find(t => t.id === teamId);
    if (!team) return;
    setUsers(prev => prev.map(u => {
      if (u.team !== team.name) return u;
      const has = (u.features || []).includes(featureId);
      return { ...u, features: has ? (u.features || []).filter(f => f !== featureId) : [...(u.features || []), featureId] };
    }));
  };
  const applyRoleToTeam = (teamId, roleName) => {
    const role = ROLE_DEFS.find(r => r.name === roleName);
    if (!role) return;
    const features = [...role.features];
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, features } : t));
    const team = teams.find(t => t.id === teamId);
    if (!team) return;
    setUsers(prev => prev.map(u => u.team === team.name ? { ...u, features } : u));
  };

  const activeToday = users.filter(u => u.status === 'active').length;
  const pendingInvites = users.filter(u => u.status === 'invited').length;
  const mfaCount = users.filter(u => u.mfa).length;
  const mfaPct = users.length > 0 ? Math.round((mfaCount / users.length) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Feature editor modal */}
      {editingTeamId && (() => {
        const team = teams.find(t => t.id === editingTeamId);
        if (!team) return null;
        const teamFeatures = new Set(team.features || []);
        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setEditingTeamId(null)}>
            <div className="bg-white  shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
                <div><div className="flex items-center gap-2"><Lock size={14} className="text-blue-800" /><h3 className="text-sm font-bold text-slate-800">Features for {team.name}</h3></div><div className="text-[11px] text-slate-500 mt-0.5">Changes apply to all members immediately.</div></div>
                <button onClick={() => setEditingTeamId(null)} className="p-1.5 hover:bg-slate-100 rounded"><span>✕</span></button>
              </div>
              <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Apply Preset:</span>
                {ROLE_DEFS.map(r => (
                  <button key={r.name} onClick={() => applyRoleToTeam(editingTeamId, r.name)} className="text-[10px] font-bold px-2 py-1  border border-slate-300 bg-white hover:bg-slate-50 hover:border-blue-400 transition" title={r.perms.join(' · ')}>{r.name}</button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {FEATURE_GROUPS.map(group => {
                  const groupFeatures = Object.entries(FEATURES).filter(([, f]) => f.group === group);
                  if (groupFeatures.length === 0) return null;
                  return (
                    <div key={group}>
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">{group}</div>
                      <div className="space-y-1.5">
                        {groupFeatures.map(([fid, f]) => {
                          const enabled = teamFeatures.has(fid);
                          return (
                            <label key={fid} className={`flex items-start gap-2.5 p-2.5  border cursor-pointer transition ${enabled ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                              <input type="checkbox" checked={enabled} onChange={() => toggleTeamFeature(editingTeamId, fid)} className="mt-0.5 accent-blue-800" />
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] font-semibold text-slate-800">{f.label}</div>
                                <div className="text-[10px] text-slate-500 leading-snug mt-0.5">{f.desc}</div>
                              </div>
                              <span className="text-[8px] font-mono text-slate-400 mt-1">{fid}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="text-[11px] text-slate-500"><span className="font-bold text-slate-800">{(team.features || []).length}</span> of {FEATURE_IDS.length} features enabled</div>
                <Button variant="primary" onClick={() => setEditingTeamId(null)}>Done</Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[{ label: 'Total Users', value: users.length }, { label: 'Active', value: activeToday }, { label: 'Pending Invites', value: pendingInvites }, { label: 'MFA Enabled', value: `${mfaCount} / ${users.length || 0}` }].map((s, i) => (
          <div key={s.label} className="bg-white  border border-slate-200 p-4 shadow-sm">
            <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">{s.label}</div>
            <div className={`text-2xl font-black mt-1 ${i === 1 ? 'text-emerald-700' : i === 2 ? 'text-blue-700' : 'text-slate-800'}`}>{s.value}</div>
            {i === 3 && <div className="text-[10px] text-emerald-700 mt-0.5 font-semibold">{mfaPct}% coverage</div>}
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="bg-white  border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white gap-3 flex-wrap">
          <div className="flex items-center gap-2"><Users size={14} className="text-blue-800" /><h3 className="text-sm font-bold text-slate-800">Users</h3></div>
          <div className="flex items-center gap-2 flex-wrap">
            {users.length > 0 && <>
              <div className="relative"><Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-7 pr-3 py-1.5 text-xs border border-slate-300  focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 w-48" /></div>
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="text-xs border border-slate-300  px-2 py-1.5 bg-white"><option value="all">All Roles</option>{ROLE_DEFS.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}</select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs border border-slate-300  px-2 py-1.5 bg-white"><option value="all">All Status</option><option value="active">Active</option><option value="invited">Invited</option><option value="inactive">Inactive</option></select>
            </>}
            <Button variant="primary" size="sm" icon={UserPlus} onClick={() => setAddUserOpen(true)}>Add User</Button>
          </div>
        </div>
        {users.length === 0 ? (
          <div className="px-5 py-16 text-center"><Users size={22} className="text-slate-400 mx-auto mb-2" /><h4 className="text-sm font-bold text-slate-700 mb-1">No users yet</h4><Button variant="primary" size="sm" icon={UserPlus} onClick={() => setAddUserOpen(true)}>Add First User</Button></div>
        ) : (
          <>
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-wider bg-slate-50/50">
                {['User','Role','Team','Last Active','MFA','Status','Actions'].map(h => <th key={h} className={`${h === 'Actions' ? 'text-right px-5' : 'text-left'} py-2.5 px-${h === 'User' ? '5' : '3'} font-semibold`}>{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-5 py-3"><div className="flex items-center gap-3"><div className="w-9 h-9  bg-gradient-to-br from-blue-700 to-blue-900 flex items-center justify-center text-white text-[11px] font-bold shadow-sm ring-1 ring-blue-950">{u.initials}</div><div><div className="font-semibold text-slate-800">{u.name}</div><div className="text-[11px] text-slate-500">{u.email}</div></div></div></td>
                    <td className="py-3 px-3"><span className="text-[11px] font-semibold text-slate-700">{u.role}</span></td>
                    <td className="py-3 px-3 text-slate-600 text-[11px]">{u.team || '—'}</td>
                    <td className="py-3 px-3 text-slate-600 text-[11px]">{u.lastActive}</td>
                    <td className="py-3 px-3">{u.mfa ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><Shield size={10} />Enabled</span> : <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700"><AlertCircle size={10} />Off</span>}</td>
                    <td className="py-3 px-3"><span className={`inline-block px-2 py-0.5  text-[10px] font-bold ring-1 ring-inset uppercase tracking-wider ${statusBadge[u.status]}`}>{u.status}</span></td>
                    <td className="px-5 py-3 text-right"><div className="inline-flex items-center gap-1"><button className="p-1 text-slate-400 hover:text-blue-700" title="Edit"><Edit2 size={12} /></button><button onClick={() => removeUser(u.id)} className="p-1 text-slate-400 hover:text-red-700" title="Remove"><Trash2 size={12} /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="px-5 py-12 text-center text-xs text-slate-500">No users match these filters.</div>}
          </>
        )}
      </div>

      {/* Teams */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="text-xs font-bold text-slate-800 flex items-center gap-2"><Building2 size={13} className="text-blue-800" />Teams</div>
          <Button variant="primary" size="sm" icon={Plus} onClick={() => setAddTeamOpen(true)}>Add Team</Button>
        </div>
        {teams.length === 0 ? (
          <div className="bg-white  border border-dashed border-slate-300 px-5 py-12 text-center"><Building2 size={22} className="text-slate-400 mx-auto mb-2" /><h4 className="text-sm font-bold text-slate-700 mb-1">No teams yet</h4><Button variant="primary" size="sm" icon={Plus} onClick={() => setAddTeamOpen(true)}>Add First Team</Button></div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {teams.map(t => {
              const members = users.filter(u => u.team === t.name);
              return (
                <div key={t.id} className="bg-white  border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition">
                  <div className={`h-1 bg-gradient-to-r ${t.color}`}></div>
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2 gap-3">
                      <div className="min-w-0 flex-1"><h4 className="text-sm font-bold text-slate-800 truncate">{t.name}</h4><div className="text-[11px] text-slate-500 mt-0.5">{t.location}</div></div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => setEditingTeamId(t.id)} className="p-1.5 text-slate-400 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors" title="Edit features"><Edit2 size={11} /></button>
                        <button onClick={() => removeTeam(t.id)} className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded transition-colors" title="Remove team"><Trash2 size={11} /></button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div><div className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">Members</div><div className="text-sm font-black text-slate-800 tabular-nums">{members.length}</div></div>
                      <div><div className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">Features</div><div className="text-sm font-black text-slate-800 tabular-nums">{(t.features || []).length}</div></div>
                    </div>
                    <button onClick={() => setEditingTeamId(t.id)} className="w-full px-3 py-2  text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 hover:border-blue-400 transition-colors flex items-center justify-center gap-1.5">
                      <Lock size={11} />Manage Features<span className="text-[10px] font-normal text-blue-600">· {(t.features || []).length} of {FEATURE_IDS.length}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {addUserOpen && <AddUserModal teams={teams} onClose={() => setAddUserOpen(false)} onSubmit={addUser} />}
      {addTeamOpen && <AddTeamModal existingUsers={users} onClose={() => setAddTeamOpen(false)} onSubmit={addTeam} />}
    </div>
  );
}
