import React, { useState } from 'react';
import { Shield, Cpu, HardDrive } from 'lucide-react';
import { APP_VERSION } from '../../constants/appConfig.js';
import { useAuth } from '../../context/AuthContext.jsx';

const LoginScreen = () => {
  const { login } = useAuth();
  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [tenantKey, setTenantKey] = useState('');
  const [error, setError]         = useState('');
  const [busy, setBusy]           = useState(false);

  const handleSignIn = async () => {
    if (!username.trim() || !password) { setError('Username and password are required.'); return; }
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password, tenantKey.trim() || undefined);
    } catch (err) {
      setError(err?.message || 'Invalid credentials.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-screen w-full flex bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100" style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' }}>

      {/* Left branding panel */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-950 text-white relative overflow-hidden flex-col justify-between p-10">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-amber-500 opacity-15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-500 opacity-15 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-3xl font-black tracking-tight">
              <span className="text-red-400">Digi</span><span className="text-white">Store</span>
            </span>
            <span className="ml-1 px-1.5 py-0.5 text-[9px] font-bold bg-white/10 text-white border border-white/20 font-mono tracking-wider">{APP_VERSION}</span>
          </div>
          <div className="w-32 h-0.5 bg-gradient-to-r from-red-500 via-amber-400 to-blue-400 mt-1" />
          <h1 className="text-xl font-bold mt-6 leading-tight">
            Salvation Army<br />Donation Records Management Platform
          </h1>
          <p className="text-sm text-slate-300 mt-3 max-w-md leading-relaxed">
            Secure, auditable, AI-assisted processing of donation records — from upload through HITL review, QC approval, archiving and intelligent retrieval.
          </p>
        </div>
        <div className="relative space-y-3 text-sm text-slate-300">
          <div className="flex items-center gap-2"><Shield size={14} className="text-amber-400" /><span>End-to-end audit trail · ISO 16363 &amp; ISO 27001 compliant</span></div>
          <div className="flex items-center gap-2"><Cpu size={14} className="text-amber-400" /><span>Advanced AI extraction with Human-In-The-Loop validation</span></div>
          <div className="flex items-center gap-2"><HardDrive size={14} className="text-amber-400" /><span>Multi-bucket S3 storage with full provenance</span></div>
        </div>
      </div>

      {/* Right: auth card */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="md:hidden mb-6 text-center">
            <span className="text-2xl font-black tracking-tight">
              <span className="text-red-700">Digi</span><span className="text-blue-900">Store</span>
            </span>
          </div>

          <div className="bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="px-7 pt-7 pb-0">
              <h2 className="text-base font-bold text-slate-900">Sign In</h2>
              <p className="text-xs text-slate-500 mt-1 mb-5">Enter your credentials to access the platform.</p>
            </div>

            <div className="px-7 pb-7 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSignIn(); }}
                  placeholder="Enter your username"
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 transition-colors"
                  autoFocus
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSignIn(); }}
                  placeholder="Enter your password"
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 transition-colors"
                  autoComplete="current-password"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Tenant Key</label>
                <input
                  type="text"
                  value={tenantKey}
                  onChange={(e) => setTenantKey(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSignIn(); }}
                  placeholder="Your organisation tenant key"
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 transition-colors font-mono"
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="text-[10px] text-slate-400 mt-1">Leave blank only if you are a Super Admin.</p>
              </div>

              {error && <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 px-3 py-2">{error}</div>}

              <button
                onClick={handleSignIn}
                disabled={busy}
                className="w-full py-2.5 text-sm font-bold bg-gradient-to-b from-blue-700 to-blue-900 text-white hover:from-blue-600 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-blue-900/30 mt-1"
              >
                {busy ? 'Signing in…' : 'Sign In'}
              </button>
            </div>
          </div>

          <p className="text-center text-[10px] text-slate-400 mt-4">{APP_VERSION} · Secured with JWT &amp; PBKDF2</p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
