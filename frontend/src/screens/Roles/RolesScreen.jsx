import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Plus, Trash2, X, ChevronRight } from 'lucide-react';
import { PageHeader } from '../../components/shared/PageHeader.jsx';
import { rolesApi, permissionsApi } from '../../lib/api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

function groupByCategory(permissions) {
  return (Array.isArray(permissions) ? permissions : []).reduce((acc, p) => {
    const cat = p.category ?? 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});
}

function CreateRoleModal({ permissions, onClose, onCreated }) {
  const toast = useToast();
  const [name, setName]           = useState('');
  const [description, setDesc]    = useState('');
  const [selected, setSelected]   = useState(new Set());
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState('');
  const grouped = groupByCategory(permissions);

  const toggle = (code) => setSelected(prev => {
    const next = new Set(prev);
    next.has(code) ? next.delete(code) : next.add(code);
    return next;
  });

  const handleCreate = async () => {
    const n = name.trim();
    if (!n) { setErr('Name is required.'); return; }
    setBusy(true); setErr('');
    try {
      await rolesApi.create({ name: n, description: description.trim(), permissionIds: [...selected] });
      toast.success('Role created.');
      onCreated();
    } catch (e) {
      if (e?.status !== 403) setErr(e?.message ?? 'Create failed.');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">New Role</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. HITL Reviewer" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Description</label>
            <input type="text" value={description} onChange={e => setDesc(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Optional description" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Permissions</label>
            {Object.entries(grouped).map(([cat, perms]) => (
              <div key={cat} className="mb-3">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{cat}</div>
                <div className="grid grid-cols-2 gap-1">
                  {perms.map(p => (
                    <label key={p.id ?? p.code} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={selected.has(p.id ?? p.code)} onChange={() => toggle(p.id ?? p.code)} className="rounded" />
                      <span className="text-xs font-mono text-slate-700">{p.code}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {permissions.length === 0 && <p className="text-xs text-slate-400">No permissions available.</p>}
          </div>
          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{err}</div>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleCreate} disabled={busy} className="flex-1 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white rounded-xl text-sm font-semibold transition-colors">
            {busy ? 'Creating…' : 'Create Role'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleDetail({ role, permissions, onDeleted, onUpdated }) {
  const toast = useToast();
  const { refreshAuth } = useAuth();
  const [assigned, setAssigned]   = useState(new Set((role.permissions ?? []).map(p => p.id ?? p.code ?? p)));
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const grouped = groupByCategory(permissions);
  const isSystem = role.type === 'system';

  const toggle = async (permId) => {
    const prev = new Set(assigned);
    const next = new Set(assigned);
    const adding = !next.has(permId);
    adding ? next.add(permId) : next.delete(permId);
    setAssigned(next);
    setSaving(true);
    try {
      const updated = await rolesApi.patchPermissions(role.id, {
        add: adding ? [permId] : [],
        revoke: adding ? [] : [permId],
      });
      if (Array.isArray(updated?.permissions)) {
        setAssigned(new Set(updated.permissions.map(p => p.id ?? p.code)));
      }
      // Re-sync the current user's permission snapshot with the backend so the
      // frontend route guard and sidebar reflect the change immediately, preventing
      // phantom 403 toasts on background API calls and stale page access.
      await refreshAuth();
      onUpdated?.();
    } catch (e) {
      if (e?.status !== 403) toast.error('Permission update failed.', e?.message);
      setAssigned(prev);
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await rolesApi.delete(role.id);
      toast.success(`Role "${role.name}" deleted.`);
      onDeleted();
    } catch (e) {
      if (e?.status !== 403) toast.error('Delete failed.', e?.message);
    } finally { setDeleting(false); setConfirmDel(false); }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <div className="text-base font-bold text-slate-900">{role.name}</div>
          {role.description && <div className="text-xs text-slate-400 mt-0.5">{role.description}</div>}
          <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded mt-1 ${isSystem ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
            {isSystem ? 'system' : 'custom'}
          </span>
        </div>
        {!isSystem && (
          <button
            onClick={() => setConfirmDel(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-lg transition-all"
          >
            <Trash2 size={12} />
            Delete
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
          Permissions {saving && <span className="normal-case font-normal text-blue-500 ml-1">Saving…</span>}
        </div>
        {Object.entries(grouped).map(([cat, perms]) => (
          <div key={cat} className="mb-4">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{cat}</div>
            <div className="space-y-1">
              {perms.map(p => {
                const id = p.id ?? p.code;
                return (
                  <label key={id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${isSystem ? 'cursor-default' : 'hover:bg-slate-50'}`}>
                    <input
                      type="checkbox"
                      checked={assigned.has(id)}
                      onChange={() => !isSystem && toggle(id)}
                      disabled={isSystem || saving}
                      className="rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono font-medium text-slate-700">{p.code}</div>
                      {p.description && <div className="text-[10px] text-slate-400 truncate">{p.description}</div>}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        {permissions.length === 0 && <p className="text-xs text-slate-400">No permissions in catalog.</p>}
      </div>

      {confirmDel && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-base font-bold text-slate-900 text-center mb-1">Delete Role</h3>
            <p className="text-sm text-slate-500 text-center mb-6">
              Delete <span className="font-semibold text-slate-800">{role.name}</span>? Users with this role will lose its permissions.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(false)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-xl text-sm font-semibold">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RolesScreen() {
  const toast = useToast();
  const [roles, setRoles]             = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selected, setSelected]       = useState(null);
  const [loading, setLoading]         = useState(true);
  const [showCreate, setShowCreate]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesData, permsData] = await Promise.all([rolesApi.list(), permissionsApi.list()]);
      const roleList = Array.isArray(rolesData) ? rolesData : (rolesData?.roles ?? []);
      const permList = Array.isArray(permsData) ? permsData : (permsData?.flat ?? []);
      setRoles(roleList);
      setPermissions(permList);
      if (selected) setSelected(prev => roleList.find(r => r.id === prev?.id) ?? null);
    } catch (e) {
      if (e?.status !== 403) toast.error('Failed to load roles.', e?.message);
    } finally { setLoading(false); }
  }, [toast, selected?.id]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Left panel — role list (full width on mobile, fixed sidebar on md+) */}
      <div className={`${selected ? 'hidden md:flex' : 'flex'} md:flex w-full md:w-72 flex-shrink-0 flex-col border-b md:border-b-0 md:border-r border-slate-200 bg-white md:max-h-full`}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">ADMIN</div>
            <div className="text-sm font-bold text-slate-800 mt-0.5">Roles</div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-700 hover:bg-blue-800 text-white rounded-lg transition-colors"
          >
            <Plus size={12} />
            New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-xs text-slate-400 gap-2">
              <svg className="animate-spin w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading…
            </div>
          ) : roles.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">No roles found.</div>
          ) : (
            roles.map(role => (
              <button
                key={role.id}
                onClick={() => setSelected(role)}
                className={`w-full flex items-center justify-between px-5 py-3 text-left transition-colors ${selected?.id === role.id ? 'bg-blue-50 border-l-2 border-blue-600' : 'hover:bg-slate-50 border-l-2 border-transparent'}`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{role.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-bold ${role.type === 'system' ? 'text-blue-600' : 'text-slate-400'}`}>
                      {role.type ?? 'custom'}
                    </span>
                    {role.permissions && <span className="text-[10px] text-slate-400">{role.permissions.length} perms</span>}
                  </div>
                </div>
                <ChevronRight size={12} className="text-slate-300 flex-shrink-0" />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel — role detail (hidden on mobile when no role selected, shown otherwise) */}
      <div className={`${selected ? 'flex' : 'hidden md:flex'} flex-1 flex-col overflow-hidden`}>
        {selected ? (
          <>
            {/* Back button on mobile */}
            <button
              onClick={() => setSelected(null)}
              className="md:hidden flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-blue-700 border-b border-slate-100 bg-white"
            >
              ← Back to roles
            </button>
            <RoleDetail
              key={selected.id}
              role={selected}
              permissions={permissions}
              onDeleted={() => { setSelected(null); load(); }}
              onUpdated={load}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
            <div className="text-center">
              <Shield size={32} className="mx-auto mb-3 text-slate-300" />
              <p>Select a role to view details</p>
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateRoleModal
          permissions={permissions}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}
