import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authClient } from '../lib/axiosInstance';

const ALL_ROLES = ['user', 'admin', 'client', 'superadmin'];

function getRolesForRequester(requesterRole) {
  return requesterRole === 'superadmin' ? ALL_ROLES : ['user', 'admin'];
}


function UserInitials({ username }) {
  const letters = (username || '?').slice(0, 2).toUpperCase();
  const colors = [
    'bg-red-600', 'bg-blue-600', 'bg-emerald-600', 'bg-amber-600',
    'bg-purple-600', 'bg-teal-600', 'bg-rose-600', 'bg-indigo-600',
  ];
  const color = colors[username.charCodeAt(0) % colors.length];
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${color} text-white text-xs font-bold flex-shrink-0`}>
      {letters}
    </span>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className={`flex-1 min-w-[100px] bg-white rounded-xl border ${color} p-4`}>
      <div className="text-2xl font-black text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function Alert({ type, message, onDismiss }) {
  if (!message) return null;
  const styles = type === 'error'
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-emerald-50 border-emerald-200 text-emerald-700';
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${styles} text-sm mb-5`}>
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="opacity-50 hover:opacity-100 text-lg leading-none mt-0.5">×</button>
    </div>
  );
}

export default function AdminPage() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

  const availableRoles = getRolesForRequester(auth.role);

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tab, setTab] = useState('single'); // 'single' | 'bulk'
  const [confirmRevoke, setConfirmRevoke] = useState(null);

  // Single add
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [addBusy, setAddBusy] = useState(false);

  // Bulk add
  const [bulkText, setBulkText] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResults, setBulkResults] = useState([]); // [{username, ok, error}]

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await authClient.get('/admin/users');
      setUsers(data.users || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const flash = (msg, isError = false) => {
    if (isError) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 5000);
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    const u = newUsername.trim();
    if (!u || !newPassword) { flash('Username and password are required.', true); return; }
    setAddBusy(true);
    try {
      await authClient.post('/admin/users', { username: u, password: newPassword, role: newRole });
      flash(`User "${u}" created successfully.`);
      setNewUsername(''); setNewPassword(''); setNewRole('user');
      fetchUsers();
    } catch (e) { flash(e.message, true); }
    finally { setAddBusy(false); }
  };

  const handleBulkAdd = async () => {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) { flash('Enter at least one user.', true); return; }
    setBulkBusy(true);
    setBulkResults([]);
    const results = [];
    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      const username = parts[0];
      const password = parts[1];
      const role = parts[2] || 'user';
      if (!username || !password) {
        results.push({ username: username || '(empty)', ok: false, error: 'Missing username or password' });
        continue;
      }
      try {
        await authClient.post('/admin/users', { username, password, role: availableRoles.includes(role) ? role : 'user' });
        results.push({ username, ok: true });
      } catch (e) {
        results.push({ username, ok: false, error: e.message });
      }
    }
    setBulkResults(results);
    setBulkBusy(false);
    const ok = results.filter(r => r.ok).length;
    const fail = results.length - ok;
    if (ok > 0) fetchUsers();
    flash(`${ok} user${ok !== 1 ? 's' : ''} created${fail > 0 ? `, ${fail} failed` : ''}.`, fail > 0 && ok === 0);
  };

  const handleRevoke = async (username) => {
    setConfirmRevoke(null);
    try {
      await authClient.patch(`/admin/users/${encodeURIComponent(username)}/revoke`, {});
      flash(`"${username}" access revoked.`);
      fetchUsers();
    } catch (e) { flash(e.message, true); }
  };

  const handleActivate = async (username) => {
    try {
      await authClient.patch(`/admin/users/${encodeURIComponent(username)}/activate`, {});
      flash(`"${username}" access restored.`);
      fetchUsers();
    } catch (e) { flash(e.message, true); }
  };

  const handleRoleChange = async (username, role) => {
    try {
      await authClient.patch(`/admin/users/${encodeURIComponent(username)}/role`, { role });
      flash(`"${username}" role changed to ${role}.`);
      fetchUsers();
    } catch (e) { flash(e.message, true); }
  };

  const activeUsers = users.filter(u => u.active);
  const revokedUsers = users.filter(u => !u.active);
  const adminUsers = users.filter(u => u.role === 'admin' || u.role === 'superadmin');
  const clientUsers = users.filter(u => u.role === 'client');

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      {/* Header */}
      <header style={{ background: 'linear-gradient(135deg, #7f0000 0%, #b91c1c 60%, #991b1b 100%)' }} className="text-white shadow-xl">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <div className="w-px h-5 bg-white/20" />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-red-200/70">Salvation Army DRMS</div>
              <h1 className="text-lg font-black tracking-tight">Admin Panel</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-xs text-white/50">Signed in as</div>
              <div className="text-sm font-semibold">{auth.username}</div>
            </div>
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-sm transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <Alert type="error" message={error} onDismiss={() => setError('')} />
        <Alert type="success" message={success} onDismiss={() => setSuccess('')} />

        {/* Stats */}
        <div className="flex flex-wrap gap-3 mb-8">
          <StatCard label="Total Users" value={users.length} color="border-slate-200" />
          <StatCard label="Active" value={activeUsers.length} color="border-emerald-200" />
          <StatCard label="Revoked" value={revokedUsers.length} color="border-red-200" />
          <StatCard label="Admins" value={adminUsers.length} color="border-blue-200" />
          {auth.role === 'superadmin' && (
            <StatCard label="Clients" value={clientUsers.length} color="border-purple-200" />
          )}
        </div>

        {/* Add User Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
          <div className="px-6 pt-5 pb-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">Add Users</h2>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
                <button
                  onClick={() => { setTab('single'); setBulkResults([]); }}
                  className={`px-4 py-1.5 transition-colors ${tab === 'single' ? 'bg-red-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  Single
                </button>
                <button
                  onClick={() => setTab('bulk')}
                  className={`px-4 py-1.5 transition-colors ${tab === 'bulk' ? 'bg-red-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  Bulk Import
                </button>
              </div>
            </div>
          </div>

          {tab === 'single' ? (
            <form onSubmit={handleAddUser} className="px-6 pb-6">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Username</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    disabled={addBusy}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent bg-gray-50"
                    placeholder="e.g. johndoe"
                    autoComplete="off"
                  />
                </div>
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    disabled={addBusy}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent bg-gray-50"
                    placeholder="Temporary password"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Role</label>
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value)}
                    disabled={addBusy}
                    className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-gray-50 capitalize"
                  >
                    {availableRoles.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={addBusy}
                  className="px-5 py-2.5 bg-red-700 hover:bg-red-800 disabled:bg-red-300 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
                >
                  {addBusy ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </form>
          ) : (
            <div className="px-6 pb-6">
              <p className="text-xs text-gray-400 mb-2">
                One user per line — <code className="bg-gray-100 px-1 py-0.5 rounded">username, password, role</code>. Role defaults to <code className="bg-gray-100 px-1 py-0.5 rounded">user</code> if omitted.
              </p>
              <textarea
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                disabled={bulkBusy}
                rows={5}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500 bg-gray-50 resize-none"
                placeholder={auth.role === 'superadmin'
                  ? "alice, Pass@123, user\nbob, Temp!456, admin\nclient1, Secret@7, client"
                  : "alice, Pass@123, user\nbob, Temp!456, admin\ncarol, Welcome1, user"}
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-gray-400">
                  {bulkText.split('\n').filter(l => l.trim()).length} line(s) entered
                </span>
                <button
                  onClick={handleBulkAdd}
                  disabled={bulkBusy || !bulkText.trim()}
                  className="px-5 py-2.5 bg-red-700 hover:bg-red-800 disabled:bg-red-300 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
                >
                  {bulkBusy ? 'Importing…' : 'Import All'}
                </button>
              </div>
              {bulkResults.length > 0 && (
                <div className="mt-4 rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-600 border-b border-gray-100">Import Results</div>
                  <div className="divide-y divide-gray-50 max-h-40 overflow-y-auto">
                    {bulkResults.map((r, i) => (
                      <div key={i} className={`px-3 py-2 flex items-center gap-2 text-xs ${r.ok ? 'text-emerald-700' : 'text-red-600'}`}>
                        <span className="font-mono font-medium">{r.username}</span>
                        {r.ok
                          ? <span className="text-emerald-500">✓ Created</span>
                          : <span className="text-red-400">✗ {r.error}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">All Users</h2>
              <p className="text-xs text-gray-400 mt-0.5">{users.length} user{users.length !== 1 ? 's' : ''} in the system</p>
            </div>
            <button
              onClick={fetchUsers}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors px-3 py-1.5 border border-gray-100 rounded-lg hover:border-gray-200"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>

          {loadingUsers ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400 gap-2">
              <svg className="animate-spin w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading users…
            </div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">No users found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Joined</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, idx) => (
                    <tr
                      key={u.username}
                      className={`border-b border-gray-50 transition-colors hover:bg-gray-50/60 ${!u.active ? 'opacity-50' : ''} ${idx === users.length - 1 ? 'border-b-0' : ''}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <UserInitials username={u.username} />
                          <div>
                            <div className="font-semibold text-gray-800">
                              {u.username}
                              {u.username === auth.username && (
                                <span className="ml-2 text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">you</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {u.username === auth.username ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 capitalize">{u.role}</span>
                        ) : (
                          <select
                            value={u.role}
                            onChange={e => handleRoleChange(u.username, e.target.value)}
                            className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-red-500 capitalize"
                          >
                            {availableRoles.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${u.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.active ? 'bg-emerald-500' : 'bg-red-400'}`} />
                          {u.active ? 'Active' : 'Revoked'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-400 hidden sm:table-cell">
                        {new Date(u.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {u.username !== auth.username && (
                          u.active ? (
                            <button
                              onClick={() => setConfirmRevoke(u.username)}
                              className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-lg transition-all"
                            >
                              Revoke
                            </button>
                          ) : (
                            <button
                              onClick={() => handleActivate(u.username)}
                              className="px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:text-white hover:bg-emerald-600 border border-emerald-200 hover:border-emerald-600 rounded-lg transition-all"
                            >
                              Activate
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Revoke Confirmation Modal */}
      {confirmRevoke && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-900 text-center mb-1">Revoke Access</h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              Revoke access for <span className="font-semibold text-gray-800">{confirmRevoke}</span>? They will be blocked from logging in immediately.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmRevoke(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRevoke(confirmRevoke)}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                Revoke
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
