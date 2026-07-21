import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Search, Plus } from 'lucide-react';
import { PageHeader } from '../../components/shared/PageHeader.jsx';
import { permissionsApi } from '../../lib/api.js';
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

export default function PermissionsScreen() {
  const toast = useToast();
  const { auth, hasPermission } = useAuth();
  const isSuperAdmin = auth?.tenantId === null;
  const canCreate = isSuperAdmin && hasPermission('PERMISSION_READ');

  const [permissions, setPermissions]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [showCreate, setShowCreate]     = useState(false);
  const [newCode, setNewCode]           = useState('');
  const [newDesc, setNewDesc]           = useState('');
  const [newCat, setNewCat]             = useState('');
  const [creating, setCreating]         = useState(false);
  const [createErr, setCreateErr]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await permissionsApi.list();
      setPermissions(Array.isArray(data) ? data : (data?.flat ?? []));
    } catch (e) {
      if (e?.status !== 403) toast.error('Failed to load permissions.', e?.message);
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = search.trim()
    ? permissions.filter(p =>
        p.code?.toLowerCase().includes(search.toLowerCase()) ||
        p.description?.toLowerCase().includes(search.toLowerCase())
      )
    : permissions;

  const grouped = groupByCategory(filtered);

  const handleCreate = async () => {
    const code = newCode.trim().toUpperCase();
    if (!code) { setCreateErr('Code is required.'); return; }
    setCreating(true); setCreateErr('');
    try {
      await permissionsApi.create({ code, description: newDesc.trim(), category: newCat.trim() || undefined });
      toast.success(`Permission "${code}" created.`);
      setNewCode(''); setNewDesc(''); setNewCat('');
      setShowCreate(false);
      load();
    } catch (e) {
      if (e?.status !== 403) setCreateErr(e?.message ?? 'Create failed.');
    } finally { setCreating(false); }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <PageHeader
          title="Permission Catalog"
          eyebrow="ADMIN"
          description="View and manage platform permission codes"
          actions={canCreate && (
            <button
              onClick={() => setShowCreate(s => !s)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
            >
              <Plus size={14} />
              New Permission
            </button>
          )}
        />

        {showCreate && canCreate && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-5">
            <h3 className="text-sm font-bold text-slate-800 mb-4">Create Permission</h3>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[160px]">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Code</label>
                <input type="text" value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="BATCH_CREATE" />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Description</label>
                <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Create new batches" />
              </div>
              <div className="w-36">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Category</label>
                <input type="text" value={newCat} onChange={e => setNewCat(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Batch" />
              </div>
              <button onClick={handleCreate} disabled={creating} className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm font-bold rounded-xl transition-colors shadow-sm">
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
            {createErr && <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{createErr}</div>}
          </div>
        )}

        {/* Search */}
        <div className="relative mb-5">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by code or description…"
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-slate-400 gap-2">
            <svg className="animate-spin w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading permissions…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            {search ? 'No permissions match your search.' : 'No permissions found.'}
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, perms]) => (
              <div key={cat} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                  <Lock size={12} className="text-blue-700" />
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">{cat}</span>
                  <span className="ml-auto text-[10px] text-slate-400">{perms.length}</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {perms.map(p => (
                    <div key={p.id ?? p.code} className="px-5 py-3 flex items-start gap-4">
                      <span className="font-mono text-xs font-semibold text-blue-700 w-52 flex-shrink-0 pt-0.5">{p.code}</span>
                      <span className="text-xs text-slate-500 flex-1">{p.description ?? '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 text-center text-xs text-slate-400">{permissions.length} permission{permissions.length !== 1 ? 's' : ''} in catalog</div>
      </div>
    </div>
  );
}
