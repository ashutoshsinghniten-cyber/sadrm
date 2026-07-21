import React, { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Shield, RefreshCw, Building2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { PageHeader } from '../../components/shared/PageHeader.jsx';
import { authClient } from '../../lib/axiosInstance.js';
import { tenantsApi, rolesApi } from '../../lib/api.js';

const SYSTEM_ROLES_BASE = ['user', 'admin', 'client'];
const SYSTEM_ROLES_SUPERADMIN = ['user', 'admin', 'client', 'superadmin'];

function UserMgmtInitials({ username }) {
  const letters = (username || '?').slice(0, 2).toUpperCase();
  const colors = ['bg-blue-700', 'bg-indigo-600', 'bg-blue-800', 'bg-sky-700', 'bg-blue-600', 'bg-indigo-700'];
  const color = colors[username.charCodeAt(0) % colors.length];
  return (
    <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${color} text-white text-xs font-bold flex-shrink-0 shadow-sm`}>
      {letters}
    </span>
  );
}

export default function UserManagementScreen() {
  const { auth: jwtAuth } = useAuth();
  const isSuperAdmin = jwtAuth?.role === 'superadmin';

  const [apiUsers, setApiUsers]       = useState([]);
  const [tenants, setTenants]         = useState([]);
  const [allRoles, setAllRoles]       = useState([]);   // roles fetched from API
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');

  // Pagination state — server returns at most PAGE_SIZE users per request.
  const PAGE_SIZE = 50;
  const [umPage, setUmPage]   = useState(0);   // 0-based current page
  const [umTotal, setUmTotal] = useState(0);   // total users from server
  const umTotalPages = Math.max(1, Math.ceil(umTotal / PAGE_SIZE));
  const [addTab, setAddTab]           = useState('single');
  const [confirmRevoke, setConfirmRevoke] = useState(null);

  // Single-user form fields — newRoleId stores the selected role's ID (or '' for 'user')
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRoleId, setNewRoleId]     = useState('role_user');  // role's id field
  const [newTenantId, setNewTenantId] = useState('');
  const [addBusy, setAddBusy]         = useState(false);

  // Bulk import
  const [bulkText, setBulkText]       = useState('');
  const [bulkBusy, setBulkBusy]       = useState(false);
  const [bulkResults, setBulkResults] = useState([]);

  // page is 0-based. Always pass explicitly so there's no stale-closure risk.
  const fetchApiUsers = useCallback(async (page = 0) => {
    setLoadingUsers(true);
    try {
      const data = await authClient.get('/admin/users', {
        params: { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
      });
      setApiUsers(data.users || []);
      setUmTotal(Number(data.total || 0));
      setUmPage(page);
    } catch (e) { setError(e.message); }
    finally { setLoadingUsers(false); }
  }, []); // no state deps — page is always passed as an argument

  const fetchTenants = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      const data = await tenantsApi.list();
      setTenants(Array.isArray(data) ? data : (data?.tenants ?? []));
    } catch {}
  }, [isSuperAdmin]);

  const fetchRoles = useCallback(async () => {
    try {
      const data = await rolesApi.list();
      const roles = Array.isArray(data) ? data : (data?.roles ?? []);
      setAllRoles(roles.filter(r => r.active !== false));
    } catch {}
  }, []);

  useEffect(() => { fetchApiUsers(); fetchTenants(); fetchRoles(); }, [fetchApiUsers, fetchTenants, fetchRoles]);

  const flash = (msg, isErr = false) => {
    if (isErr) { setError(msg); setSuccess(''); } else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 5000);
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    const u = newUsername.trim();
    if (!u || !newPassword) { flash('Username and password are required.', true); return; }
    const selectedRole = allRoles.find(r => r.id === newRoleId);
    const roleName = selectedRole?.name ?? 'user';
    if (isSuperAdmin && !newTenantId && roleName !== 'superadmin') {
      flash('Select a tenant for this user, or leave blank for superadmin role.', true); return;
    }
    setAddBusy(true);
    try {
      const body = { username: u, password: newPassword, role: roleName, roleId: newRoleId };
      if (isSuperAdmin && newTenantId) body.tenantId = newTenantId;
      await authClient.post('/admin/users', body);
      flash(`User "${u}" created successfully.`);
      setNewUsername(''); setNewPassword(''); setNewRoleId('role_user'); setNewTenantId('');
      fetchApiUsers(0);  // new user — go to page 0 to see them
    } catch (e) { flash(e.message, true); }
    finally { setAddBusy(false); }
  };

  const handleBulkAdd = async () => {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) { flash('Enter at least one user.', true); return; }
    setBulkBusy(true); setBulkResults([]);
    const validRoleNames = allRoles.map(r => r.name);
    const results = [];
    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      const username = parts[0], password = parts[1], roleName = parts[2] || 'user', tenantId = parts[3];
      if (!username || !password) { results.push({ username: username || '(empty)', ok: false, error: 'Missing username or password' }); continue; }
      const matchedRole = allRoles.find(r => r.name === roleName);
      try {
        const body = {
          username,
          password,
          role: validRoleNames.includes(roleName) ? roleName : 'user',
          ...(matchedRole ? { roleId: matchedRole.id } : {})
        };
        if (isSuperAdmin && tenantId) body.tenantId = tenantId;
        await authClient.post('/admin/users', body);
        results.push({ username, ok: true });
      } catch (e) { results.push({ username, ok: false, error: e.message }); }
    }
    setBulkResults(results); setBulkBusy(false);
    const ok = results.filter(r => r.ok).length;
    const fail = results.length - ok;
    if (ok > 0) fetchApiUsers(0);  // bulk create — go to page 0 to see the new users
    flash(`${ok} user${ok !== 1 ? 's' : ''} created${fail > 0 ? `, ${fail} failed` : ''}.`, fail > 0 && ok === 0);
  };

  const handleRevoke = async (username) => {
    setConfirmRevoke(null);
    try {
      await authClient.patch(`/admin/users/${encodeURIComponent(username)}/revoke`, {});
      // Optimistic update — no re-fetch needed for a single field change.
      setApiUsers(prev => prev.map(u => u.username === username ? { ...u, active: false } : u));
      flash(`"${username}" access revoked.`);
    } catch (e) { flash(e.message, true); }
  };

  const handleActivate = async (username) => {
    try {
      await authClient.patch(`/admin/users/${encodeURIComponent(username)}/activate`, {});
      setApiUsers(prev => prev.map(u => u.username === username ? { ...u, active: true } : u));
      flash(`"${username}" access restored.`);
    } catch (e) { flash(e.message, true); }
  };

  const handleRoleChange = async (username, roleId) => {
    const role = allRoles.find(r => r.id === roleId);
    if (!role) return;
    try {
      await authClient.patch(`/admin/users/${encodeURIComponent(username)}/role`, { role: role.name, roleId: role.id });
      setApiUsers(prev => prev.map(u => u.username === username ? { ...u, role: role.name, roleId: role.id } : u));
      flash(`"${username}" role updated to ${role.name}.`);
    } catch (e) { flash(e.message, true); }
  };

  const activeUsers  = apiUsers.filter(u => u.active);
  const revokedUsers = apiUsers.filter(u => !u.active);
  const adminUsers   = apiUsers.filter(u => u.role === 'admin');

  // Tenant name lookup helper
  const tenantName = (id) => {
    if (!id) return '—';
    const t = tenants.find(t => t.id === id);
    return t ? t.name : id;
  };

  const activeTenants = tenants.filter(t => t.active !== false);

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <PageHeader title="User Management" eyebrow="ADMIN" description="Create, manage, and revoke platform user accounts" />
        {error && <div className="flex items-start gap-3 px-4 py-3 rounded-xl border bg-red-50 border-red-200 text-red-700 text-sm mb-5"><span className="flex-1">{error}</span><button onClick={() => setError('')} className="opacity-50 hover:opacity-100 text-lg leading-none">×</button></div>}
        {success && <div className="flex items-start gap-3 px-4 py-3 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-700 text-sm mb-5"><span className="flex-1">{success}</span><button onClick={() => setSuccess('')} className="opacity-50 hover:opacity-100 text-lg leading-none">×</button></div>}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total Users', value: umTotal,             color: 'border-slate-200' },
            { label: 'Active',      value: activeUsers.length,  color: 'border-blue-200' },
            { label: 'Revoked',     value: revokedUsers.length, color: 'border-red-200' },
            { label: 'Admins',      value: adminUsers.length,   color: 'border-indigo-200' },
          ].map(stat => (
            <div key={stat.label} className={`bg-white rounded-xl border ${stat.color} p-4 shadow-sm`}>
              <div className="text-2xl font-black text-slate-900">{stat.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Add Users card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-5 overflow-hidden">
          <div className="px-6 pt-5 pb-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><UserPlus size={14} className="text-blue-700" />Add Users</h2>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
                <button onClick={() => { setAddTab('single'); setBulkResults([]); }} className={`px-4 py-1.5 transition-colors ${addTab === 'single' ? 'bg-blue-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>Single</button>
                <button onClick={() => setAddTab('bulk')} className={`px-4 py-1.5 transition-colors ${addTab === 'bulk' ? 'bg-blue-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>Bulk Import</button>
              </div>
            </div>
          </div>

          {addTab === 'single' ? (
            <form onSubmit={handleAddUser} className="px-4 md:px-6 pb-6">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Username</label>
                  <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} disabled={addBusy} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-50" placeholder="e.g. johndoe" autoComplete="off" />
                </div>
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} disabled={addBusy} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-50" placeholder="Temporary password" autoComplete="new-password" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Role</label>
                  <select value={newRoleId} onChange={e => setNewRoleId(e.target.value)} disabled={addBusy} className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50">
                    {allRoles.map(r => <option key={r.id} value={r.id}>{r.name}{r.system ? '' : ' (custom)'}</option>)}
                  </select>
                </div>
                {/* Tenant selector — only for superadmin; auto-inherited for admin */}
                {isSuperAdmin && (
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">
                      <Building2 size={11} /> Tenant
                      {allRoles.find(r => r.id === newRoleId)?.name === 'superadmin' && <span className="text-slate-400">(optional)</span>}
                    </label>
                    <select value={newTenantId} onChange={e => setNewTenantId(e.target.value)} disabled={addBusy} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50">
                      <option value="">— {allRoles.find(r => r.id === newRoleId)?.name === 'superadmin' ? 'No tenant (superadmin)' : 'Select tenant'} —</option>
                      {activeTenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.id})</option>)}
                    </select>
                  </div>
                )}
                {!isSuperAdmin && (
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">
                      <Building2 size={11} /> Tenant
                    </label>
                    <div className="px-3 py-2.5 border border-slate-100 rounded-xl text-sm bg-slate-50 text-slate-500 font-mono">
                      {jwtAuth?.tenantId || '—'} <span className="text-xs text-slate-400">(auto)</span>
                    </div>
                  </div>
                )}
                <button type="submit" disabled={addBusy} className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm font-bold rounded-xl transition-colors shadow-sm">
                  {addBusy ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </form>
          ) : (
            <div className="px-6 pb-6">
              <p className="text-xs text-slate-400 mb-2">
                One user per line —{' '}
                <code className="bg-slate-100 px-1 py-0.5 rounded">username, password, role{isSuperAdmin ? ', tenantId' : ''}</code>.
                Role defaults to <code className="bg-slate-100 px-1 py-0.5 rounded">user</code> if omitted.
                {isSuperAdmin && <> Tenant ID is required for non-superadmin roles.</>}
              </p>
              <textarea
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                disabled={bulkBusy}
                rows={5}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 resize-none"
                placeholder={isSuperAdmin
                  ? 'alice, Pass@123, user, tenant-abc\nbob, Temp!456, admin, tenant-xyz'
                  : 'alice, Pass@123, user\nbob, Temp!456, client'}
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-slate-400">{bulkText.split('\n').filter(l => l.trim()).length} line(s)</span>
                <button onClick={handleBulkAdd} disabled={bulkBusy || !bulkText.trim()} className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm font-bold rounded-xl transition-colors shadow-sm">
                  {bulkBusy ? 'Importing…' : 'Import All'}
                </button>
              </div>
              {bulkResults.length > 0 && (
                <div className="mt-4 rounded-xl border border-slate-100 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-100">Import Results</div>
                  <div className="divide-y divide-slate-50 max-h-40 overflow-y-auto">
                    {bulkResults.map((r, i) => (
                      <div key={i} className={`px-3 py-2 flex items-center gap-2 text-xs ${r.ok ? 'text-emerald-700' : 'text-red-600'}`}>
                        <span className="font-mono font-medium">{r.username}</span>
                        {r.ok ? <span className="text-emerald-500">✓ Created</span> : <span className="text-red-400">✗ {r.error}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Users table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Users size={14} className="text-blue-700" />All Users</h2>
              <p className="text-xs text-slate-400 mt-0.5">{umTotal} user{umTotal !== 1 ? 's' : ''}{!isSuperAdmin && jwtAuth?.tenantId ? ` in tenant ${jwtAuth.tenantId}` : ''}</p>
            </div>
            <button onClick={() => fetchApiUsers(umPage)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors px-3 py-1.5 border border-slate-100 rounded-lg hover:border-slate-200">
              <RefreshCw size={11} />Refresh
            </button>
          </div>

          {loadingUsers ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-400 gap-2">
              <svg className="animate-spin w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading users…
            </div>
          ) : apiUsers.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">No users found.</div>
          ) : (
            <>
            {umTotalPages > 1 && (
              <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing {umPage * PAGE_SIZE + 1}–{Math.min((umPage + 1) * PAGE_SIZE, umTotal)} of {umTotal.toLocaleString()} users
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => fetchApiUsers(Math.max(0, umPage - 1))}
                    disabled={umPage === 0 || loadingUsers}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Prev
                  </button>
                  <span className="px-3 font-semibold text-slate-700">{umPage + 1} / {umTotalPages}</span>
                  <button
                    onClick={() => fetchApiUsers(Math.min(umTotalPages - 1, umPage + 1))}
                    disabled={umPage >= umTotalPages - 1 || loadingUsers}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['User', 'Role', isSuperAdmin ? 'Tenant' : null, 'Status', 'Joined', 'Actions']
                      .filter(Boolean)
                      .map((h, i, arr) => (
                        <th key={h} className={`text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide${h === 'Joined' ? ' hidden sm:table-cell' : ''}${h === 'Actions' ? ' text-right' : ''}`}>
                          {h}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {apiUsers.map((u, idx) => (
                    <tr key={u.username} className={`border-b border-slate-50 transition-colors hover:bg-slate-50/60 ${!u.active ? 'opacity-50' : ''} ${idx === apiUsers.length - 1 ? 'border-b-0' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <UserMgmtInitials username={u.username} />
                          <div>
                            <div className="font-semibold text-slate-800">
                              {u.username}
                              {u.username === jwtAuth?.username && <span className="ml-2 text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">you</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {u.username === jwtAuth?.username ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700">{u.role}</span>
                        ) : (
                          <select
                            value={u.roleId || allRoles.find(r => r.name === u.role)?.id || ''}
                            onChange={e => handleRoleChange(u.username, e.target.value)}
                            className="px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {allRoles.map(r => <option key={r.id} value={r.id}>{r.name}{r.system ? '' : ' (custom)'}</option>)}
                          </select>
                        )}
                      </td>
                      {isSuperAdmin && (
                        <td className="px-6 py-4">
                          <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
                            <Building2 size={11} className="text-slate-400" />
                            {tenantName(u.tenantId)}
                          </span>
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${u.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.active ? 'bg-emerald-500' : 'bg-red-400'}`} />
                          {u.active ? 'Active' : 'Revoked'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400 hidden sm:table-cell">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {u.username !== jwtAuth?.username && (
                          u.active
                            ? <button onClick={() => setConfirmRevoke(u.username)} className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-lg transition-all">Revoke</button>
                            : <button onClick={() => handleActivate(u.username)} className="px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:text-white hover:bg-emerald-600 border border-emerald-200 hover:border-emerald-600 rounded-lg transition-all">Activate</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      </div>

      {/* Revoke confirmation dialog */}
      {confirmRevoke && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4"><Shield size={20} className="text-blue-700" /></div>
            <h3 className="text-base font-bold text-slate-900 text-center mb-1">Revoke Access</h3>
            <p className="text-sm text-slate-500 text-center mb-6">
              Revoke access for <span className="font-semibold text-slate-800">{confirmRevoke}</span>? They will be blocked from logging in immediately.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmRevoke(null)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={() => handleRevoke(confirmRevoke)} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors">Revoke</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
