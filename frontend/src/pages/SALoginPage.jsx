import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, Cpu, HardDrive, X } from 'lucide-react';

const APP_VERSION = 'v3.13.42';

export default function SALoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [loginId, setLoginId]         = useState('');
  const [password, setPassword]       = useState('');
  const [tenantKey, setTenantKey]     = useState('');   // the actual id sent to backend
  const [query, setQuery]             = useState('');   // what the user is typing
  const [tenants, setTenants]         = useState([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [open, setOpen]               = useState(false);
  const [error, setError]             = useState('');
  const [busy, setBusy]               = useState(false);

  const comboRef  = useRef(null);
  const inputRef  = useRef(null);

  // Fetch tenant list once on mount
  useEffect(() => {
    fetch('/api/admin/tenants/for-login')
      .then(r => r.json().then(data => ({ ok: r.ok, status: r.status, data })))
      .then(({ ok, status, data }) => {
        if (ok && Array.isArray(data?.tenants)) setTenants(data.tenants);
        else console.error('Tenant fetch failed', status, data);
      })
      .catch(err => console.error('Tenant fetch error:', err))
      .finally(() => setTenantsLoading(false));
  }, []);

  // Close popup on outside click
  useEffect(() => {
    const handler = (e) => {
      if (comboRef.current && !comboRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = tenants.filter(t =>
    t.name.toLowerCase().includes(query.toLowerCase())
  );

  const selectedTenant = tenants.find(t => t.id === tenantKey) ?? null;

  const handleInputChange = (e) => {
    setQuery(e.target.value);
    setTenantKey('');   // clear selection while user is typing
    setOpen(true);
  };

  const handleSelect = (t) => {
    setTenantKey(t.id);
    setQuery(t.name);
    setOpen(false);
  };

  const handleClear = () => {
    setTenantKey('');
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    if (!tenantsLoading) setOpen(true);
  };

  const submit = async () => {
    setError('');
    const u = loginId.trim();
    if (!u || !password) { setError('Login ID and password are required.'); return; }
    setBusy(true);
    try {
      await login(u, password, tenantKey || undefined);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid credentials.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-screen w-full flex bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100"
      style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' }}>

      {/* Left: branding panel */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-950 text-white relative overflow-hidden flex-col justify-between p-10">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-amber-500 opacity-15 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-500 opacity-15 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-3xl font-black tracking-tight">
              <span className="text-red-400">Digi</span><span className="text-white">Store</span>
            </span>
            <span className="ml-1 px-1.5 py-0.5 text-[9px] font-bold bg-white/10 text-white rounded border border-white/20 font-mono tracking-wider">{APP_VERSION}</span>
          </div>
          <div className="w-32 h-0.5 bg-gradient-to-r from-red-500 via-amber-400 to-blue-400 mt-1" />
          <h1 className="text-xl font-bold mt-6 leading-tight">Salvation Army<br />Donation Records Management (DRM) Platform</h1>
          <p className="text-sm text-slate-300 mt-3 max-w-md leading-relaxed">Secure, auditable processing of donation records — from upload through HITL review, QC approval, archiving and intelligent retrieval.</p>
        </div>
        <div className="relative space-y-3 text-sm text-slate-300">
          <div className="flex items-center gap-2"><Shield size={14} className="text-amber-400" /><span>End-to-end audit trail · ISO 16363 &amp; ISO 27001 compliant</span></div>
          <div className="flex items-center gap-2"><Cpu size={14} className="text-amber-400" /><span>Advanced extraction with Human-In-The-Loop validation</span></div>
          <div className="flex items-center gap-2"><HardDrive size={14} className="text-amber-400" /><span>Multi-bucket S3 storage with full provenance</span></div>
        </div>
      </div>

      {/* Right: login form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="md:hidden mb-6 text-center">
            <span className="text-2xl font-black tracking-tight">
              <span className="text-red-700">Digi</span><span className="text-blue-900">Find</span>
            </span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xl">
            <div className="px-6 pt-6 pb-2">
              <h2 className="text-xl font-black text-slate-800 tracking-tight">Sign in</h2>
              <p className="text-xs text-slate-500 mt-1">Enter your credentials to access the platform.</p>
            </div>

            <div className="px-6 py-4 space-y-3">

              {/* Login ID */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Login ID</label>
                <input
                  type="text"
                  value={loginId}
                  onChange={e => setLoginId(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                  placeholder="Enter login ID"
                  disabled={busy}
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 disabled:opacity-50"
                />
              </div>

              {/* Password */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                  placeholder="Enter password"
                  disabled={busy}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 disabled:opacity-50"
                />
              </div>

              {/* Organisation combobox */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Organisation</label>
                <div ref={comboRef} className="relative">
                  <div className={`flex items-center border rounded bg-white transition-all ${open ? 'ring-2 ring-blue-200 border-blue-500' : 'border-slate-300'} ${busy ? 'opacity-50' : ''}`}>
                    <input
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={handleInputChange}
                      onFocus={handleFocus}
                      onKeyDown={e => {
                        if (e.key === 'Escape') { setOpen(false); }
                        if (e.key === 'Enter' && open && filtered.length > 0) { handleSelect(filtered[0]); }
                      }}
                      placeholder={tenantsLoading ? 'Loading organisations…' : 'Search or select organisation…'}
                      disabled={busy || tenantsLoading}
                      autoComplete="off"
                      className="flex-1 px-3 py-2 text-sm bg-transparent focus:outline-none disabled:cursor-not-allowed"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={handleClear}
                        className="px-2 text-slate-400 hover:text-slate-600"
                        tabIndex={-1}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  {/* Suggestion popup */}
                  {open && !tenantsLoading && (
                    <ul className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded shadow-lg overflow-y-auto"
                        style={{ maxHeight: '180px' }}>

                      {/* Super Admin option — always shown when query is empty */}
                      {!query && (
                        <li>
                          <button
                            type="button"
                            onMouseDown={e => { e.preventDefault(); handleClear(); }}
                            className="w-full px-3 py-2 text-sm text-left text-slate-400 italic hover:bg-slate-50"
                          >
                            — Super Admin (no organisation) —
                          </button>
                        </li>
                      )}

                      {filtered.length === 0 && (
                        <li className="px-3 py-2 text-xs text-slate-400 text-center">No matching organisations</li>
                      )}

                      {filtered.map(t => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onMouseDown={e => { e.preventDefault(); handleSelect(t); }}
                            className={`w-full px-3 py-2 text-sm text-left hover:bg-blue-50 hover:text-blue-700 ${tenantKey === t.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'}`}
                          >
                            {t.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Leave blank if you are a Super Admin.</p>
              </div>

              {error && (
                <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>
              )}

              <button
                onClick={submit}
                disabled={busy}
                className="w-full mt-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
              >
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Signing in…
                  </span>
                ) : 'Sign in'}
              </button>
            </div>
          </div>

          <div className="text-center text-[10px] text-slate-500 mt-4">{APP_VERSION}</div>
        </div>
      </div>
    </div>
  );
}
