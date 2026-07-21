import React, { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, Eye } from 'lucide-react';
import { PageHeader } from '../../components/shared/PageHeader.jsx';
import { tenantsApi } from '../../lib/api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const SLUG_RE = /^[a-z0-9-]+$/;

function TenantRow({ tenant, canManage, onEdit, onDelete, onToggleActive }) {
  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
      <td className="px-6 py-4">
        <div className="font-semibold text-slate-800 text-sm">{tenant.name}</div>
        <div className="text-xs text-slate-400 font-mono mt-0.5">{tenant.slug}</div>
      </td>
      <td className="px-6 py-4 text-xs text-slate-500 font-mono">{tenant.id}</td>
      <td className="px-6 py-4">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${tenant.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${tenant.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          {tenant.active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-6 py-4 text-xs text-slate-400">
        {tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
      </td>
      <td className="px-6 py-4 text-right">
        {canManage ? (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => onToggleActive(tenant)}
              title={tenant.active ? 'Deactivate' : 'Activate'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              {tenant.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            </button>
            <button onClick={() => onEdit(tenant)} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" title="Edit tenant">
              <Pencil size={14} />
            </button>
            <button onClick={() => onDelete(tenant)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete tenant">
              <Trash2 size={14} />
            </button>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 px-2 py-1 bg-slate-50 rounded-lg border border-slate-100">
            <Eye size={11} /> Read only
          </span>
        )}
      </td>
    </tr>
  );
}

function TenantModal({ tenant, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!tenant?.id;
  const [name, setName] = useState(tenant?.name ?? '');
  const [slug, setSlug] = useState(tenant?.slug ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async () => {
    const n = name.trim(), s = slug.trim();
    if (!n) { setErr('Name is required.'); return; }
    if (!s || !SLUG_RE.test(s)) { setErr('Slug must be lowercase letters, numbers, and hyphens only.'); return; }
    setBusy(true); setErr('');
    try {
      if (isEdit) {
        await tenantsApi.update(tenant.id, { name: n, slug: s });
        toast.success('Tenant updated.');
      } else {
        await tenantsApi.create({ name: n, slug: s });
        toast.success('Tenant created.');
      }
      onSaved();
    } catch (e) {
      if (e?.status !== 403) setErr(e?.message ?? 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-slate-900">{isEdit ? 'Edit Tenant' : 'New Tenant'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Salvation Army — NYC" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Slug / ID</label>
            <input type="text" value={slug} onChange={e => setSlug(e.target.value.toLowerCase())} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="salvation-army-nyc" />
            <p className="text-[10px] text-slate-400 mt-1">This becomes the tenant key users enter at login.</p>
          </div>
          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{err}</div>}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={busy} className="flex-1 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white rounded-xl text-sm font-semibold transition-colors">
            {busy ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Tenant'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteModal({ tenant, onClose, onDeleted }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await tenantsApi.delete(tenant.id);
      toast.success(`Tenant "${tenant.name}" deleted.`);
      onDeleted();
    } catch (e) {
      if (e?.status !== 403) toast.error('Delete failed.', e?.message);
      onClose();
    } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trash2 size={20} className="text-red-600" />
        </div>
        <h3 className="text-base font-bold text-slate-900 text-center mb-1">Delete Tenant</h3>
        <p className="text-sm text-slate-500 text-center mb-6">
          Delete <span className="font-semibold text-slate-800">{tenant.name}</span>? This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={confirm} disabled={busy} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-xl text-sm font-semibold transition-colors">
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TenantsScreen() {
  const toast  = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('TENANT_CREATE'); // superadmin only

  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null); // null | { type: 'edit'|'create'|'delete', tenant? }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tenantsApi.list();
      setTenants(Array.isArray(data) ? data : (data?.tenants ?? []));
    } catch (e) {
      if (e?.status !== 403) toast.error('Failed to load tenants.', e?.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleToggleActive = async (tenant) => {
    try {
      if (tenant.active) {
        await tenantsApi.deactivate(tenant.id);
        toast.success(`"${tenant.name}" deactivated.`);
      } else {
        await tenantsApi.activate(tenant.id);
        toast.success(`"${tenant.name}" activated.`);
      }
      load();
    } catch (e) {
      if (e?.status !== 403) toast.error('Toggle failed.', e?.message);
    }
  };

  const closeModal = () => setModal(null);
  const onSaved    = () => { closeModal(); load(); };

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <PageHeader
          title="Tenants"
          eyebrow="ADMIN"
          description={canManage
            ? 'Create and manage platform tenants and their access'
            : 'View platform tenants assigned to your account'}
          actions={canManage && (
            <button
              onClick={() => setModal({ type: 'create' })}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
            >
              <Plus size={14} />
              New Tenant
            </button>
          )}
        />

        {/* Read-only info bar for non-superadmin */}
        {!canManage && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl border bg-blue-50 border-blue-200 text-blue-700 text-sm mb-5">
            <Eye size={15} className="flex-shrink-0 mt-0.5" />
            <span>You have read-only access to tenants. Contact a Super Admin to create or modify tenants.</span>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <Building2 size={14} className="text-blue-700" />
            <span className="text-sm font-bold text-slate-800">All Tenants</span>
            <span className="ml-auto text-xs text-slate-400">{tenants.length} total</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-400 gap-2">
              <svg className="animate-spin w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading tenants…
            </div>
          ) : tenants.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">No tenants found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Tenant', 'ID / Key', 'Status', 'Created', 'Actions'].map((h, i) => (
                      <th key={h} className={`text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide${i === 4 ? ' text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tenants.map(t => (
                    <TenantRow
                      key={t.id}
                      tenant={t}
                      canManage={canManage}
                      onEdit={(t) => setModal({ type: 'edit', tenant: t })}
                      onDelete={(t) => setModal({ type: 'delete', tenant: t })}
                      onToggleActive={handleToggleActive}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {canManage && modal?.type === 'create' && (
        <TenantModal onClose={closeModal} onSaved={onSaved} />
      )}
      {canManage && modal?.type === 'edit' && (
        <TenantModal tenant={modal.tenant} onClose={closeModal} onSaved={onSaved} />
      )}
      {canManage && modal?.type === 'delete' && (
        <DeleteModal tenant={modal.tenant} onClose={closeModal} onDeleted={onSaved} />
      )}
    </div>
  );
}
