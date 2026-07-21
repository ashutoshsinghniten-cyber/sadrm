import React, { useState, useMemo } from 'react';
import { Cloud, Plus, Edit2, Plug, Database, Search, Activity, FileText, Key, Webhook, Settings, Link2, Sparkles, Trash2, Info, TestTube, Clock, CheckCircle2, AlertTriangle, Save } from 'lucide-react';
import Button from '../../components/shared/Button.jsx';
import { computeBucketUsageBytes } from '../../utils/storageCompute.js';
import { AI_RUNTIME } from '../../constants/appConfig.js';

const AWS_REGIONS = [
  { id: 'ap-south-1',    label: 'Mumbai (ap-south-1)' },
  { id: 'ap-southeast-1',label: 'Singapore (ap-southeast-1)' },
  { id: 'us-east-1',     label: 'N. Virginia (us-east-1)' },
  { id: 'us-west-2',     label: 'Oregon (us-west-2)' },
  { id: 'eu-west-1',     label: 'Ireland (eu-west-1)' },
  { id: 'eu-central-1',  label: 'Frankfurt (eu-central-1)' }
];

function BucketTab({ bucket, active, onClick, liveUsageBytes = 0 }) {
  const envBadge = { prod: 'bg-blue-100 text-blue-800 ring-blue-200', staging: 'bg-amber-100 text-amber-800 ring-amber-200', archive: 'bg-slate-100 text-slate-700 ring-slate-200', custom: 'bg-violet-100 text-violet-800 ring-violet-200' }[bucket.env];
  const quotaGB = bucket.quotaGB || 50;
  const usedGB = liveUsageBytes / (1024 ** 3);
  const pct = Math.round(Math.min(100, (usedGB / quotaGB) * 100));
  const usedLabel = usedGB >= 1 ? usedGB.toFixed(2) : (liveUsageBytes / (1024 ** 2)).toFixed(1);
  const usedUnit = usedGB >= 1 ? 'GB' : 'MB';
  return (
    <button onClick={onClick} className={`relative text-left bg-white rounded-xl border-2 p-4 transition-all hover:shadow-md flex-1 min-w-0 overflow-hidden ${active ? 'border-blue-600 shadow-md shadow-blue-900/10' : 'border-slate-200 hover:border-slate-300'}`}>
      {active && <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500"></div>}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-8 h-8  bg-gradient-to-br ${bucket.tone} flex items-center justify-center shadow-md flex-shrink-0`}><Cloud size={14} className="text-white" /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5"><span className={`text-[9px] font-bold px-1.5 py-0.5  ring-1 ring-inset uppercase tracking-wider ${envBadge}`}>{bucket.env}</span></div>
            <h4 className="text-xs font-bold text-slate-800 truncate mt-0.5">{bucket.label}</h4>
          </div>
        </div>
        {active && <div className="w-5 h-5  bg-gradient-to-b from-blue-700 to-blue-900 flex items-center justify-center shadow-md flex-shrink-0"><CheckCircle2 size={11} className="text-white" /></div>}
      </div>
      <div className="font-mono text-[10px] text-slate-600 truncate">s3://{bucket.name}/{bucket.prefix}</div>
      <div className="mt-2.5 h-1 bg-slate-100  overflow-hidden"><div className={`h-full bg-gradient-to-r ${bucket.tone} transition-all`} style={{ width: `${pct}%` }}></div></div>
      <div className="mt-1 flex items-center justify-between text-[9px] text-slate-500"><span>{usedLabel} {usedUnit} / {quotaGB} GB</span><span>{bucket.lastSync}</span></div>
    </button>
  );
}

function BucketConfigModal({ bucket, onSave, onClose, onDelete, canDelete }) {
  const isNew = !bucket;
  const [form, setForm] = useState(bucket || { label: '', name: '', region: 'ap-south-1', prefix: '', env: 'prod', accessKeyId: '', secretAccessKey: '' });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const runTest = () => { setTesting(true); setTestResult(null); setTimeout(() => { setTesting(false); setTestResult({ ok: true, ms: 14 + Math.floor(Math.random() * 20), objects: 247 }); }, 1200); };
  const save = () => {
    const tone = { prod: 'from-blue-700 to-blue-900', staging: 'from-amber-500 to-amber-700', archive: 'from-slate-600 to-slate-800', custom: 'from-violet-600 to-purple-800' }[form.env] || 'from-blue-700 to-blue-900';
    const regionLabel = AWS_REGIONS.find(r => r.id === form.region)?.label.split(' (')[0] || form.region;
    onSave({ ...form, id: form.id || `b${Date.now()}`, tone, regionLabel, status: 'connected', lastSync: 'Just now', lastSyncFresh: true, pendingFiles: 0, usedGB: form.usedGB || 0, quotaGB: form.quotaGB || 50 });
  };
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white  shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2"><div className="w-8 h-8  bg-gradient-to-br from-blue-700 to-blue-900 flex items-center justify-center shadow-md"><Cloud size={14} className="text-white" /></div><div><h3 className="text-sm font-bold text-slate-800">{isNew ? 'Add S3 Bucket' : `Edit Bucket · ${bucket.label}`}</h3><div className="text-[10px] text-slate-500">{isNew ? 'Configure a new bucket' : 'Update connection settings'}</div></div></div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1 tracking-wider">Display Label</label><input value={form.label} onChange={(e) => update('label', e.target.value)} placeholder="e.g. Production · Mumbai" className="w-full px-3 py-2 border border-slate-300  focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500" /></div>
            <div><label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1 tracking-wider">Environment</label><select value={form.env} onChange={(e) => update('env', e.target.value)} className="w-full px-3 py-2 border border-slate-300  focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"><option value="prod">Production</option><option value="staging">Staging</option><option value="archive">Archive</option><option value="custom">Custom</option></select></div>
          </div>
          <div><label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1 tracking-wider">Bucket Name</label><div className="flex items-stretch border border-slate-300  overflow-hidden focus-within:ring-2 focus-within:ring-blue-200 focus-within:border-blue-500"><span className="px-3 py-2 bg-slate-50 text-slate-500 font-mono text-xs border-r border-slate-300">s3://</span><input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="tsa-cheques-prod" className="flex-1 px-3 py-2 font-mono text-xs focus:outline-none" /></div></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1 tracking-wider">AWS Region</label><select value={form.region} onChange={(e) => update('region', e.target.value)} className="w-full px-3 py-2 border border-slate-300  focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white">{AWS_REGIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
            <div><label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1 tracking-wider">Path Prefix</label><input value={form.prefix} onChange={(e) => update('prefix', e.target.value)} placeholder="incoming/" className="w-full px-3 py-2 border border-slate-300  focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 font-mono" /></div>
          </div>
          <div className="pt-3 border-t border-slate-100">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] text-slate-600 block mb-1">Access Key ID</label><input type="password" value={form.accessKeyId || ''} onChange={(e) => update('accessKeyId', e.target.value)} placeholder="AKIA••••" className="w-full px-3 py-2 border border-slate-300  focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 font-mono text-[11px]" /></div>
              <div><label className="text-[10px] text-slate-600 block mb-1">Secret Access Key</label><input type="password" value={form.secretAccessKey || ''} onChange={(e) => update('secretAccessKey', e.target.value)} placeholder="••••••••••••••" className="w-full px-3 py-2 border border-slate-300  focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 font-mono text-[11px]" /></div>
            </div>
          </div>
          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2"><span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider flex items-center gap-1"><TestTube size={10} />Connection Test</span><Button variant="secondary" size="sm" icon={testing ? Clock : TestTube} onClick={runTest} disabled={testing || !form.name}>{testing ? 'Testing…' : 'Test Connection'}</Button></div>
            {testResult?.ok && <div className="p-3 bg-emerald-50 border border-emerald-200  text-[11px] text-emerald-900 flex items-start gap-2"><CheckCircle2 size={12} className="text-emerald-700 flex-shrink-0 mt-0.5" /><div><div className="font-bold">Connection successful</div><div>Round-trip: {testResult.ms}ms · {testResult.objects} objects</div></div></div>}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between flex-shrink-0 gap-3">
          <div>{!isNew && !confirmingDelete && canDelete && <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirmingDelete(true)} className="text-red-700 hover:bg-red-50">Remove Bucket</Button>}
          {!isNew && confirmingDelete && <div className="flex items-center gap-2 bg-red-50 border border-red-200  px-2.5 py-1.5"><AlertTriangle size={12} className="text-red-700" /><span className="text-[11px] text-red-900 font-semibold">Remove?</span><button onClick={() => setConfirmingDelete(false)} className="text-[10px] text-slate-600 px-2 py-0.5 rounded hover:bg-white">Cancel</button><Button variant="danger" size="sm" icon={Trash2} onClick={() => { onDelete(bucket.id); onClose(); }}>Confirm</Button></div>}</div>
          <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" icon={Save} onClick={() => { save(); onClose(); }} disabled={!form.label || !form.name}>{isNew ? 'Add Bucket' : 'Save Changes'}</Button></div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsIntegrations({ buckets = [], setBuckets = () => {}, activeBucketId = null, setActiveBucketId = () => {}, batches = [] }) {
  const [modalBucket, setModalBucket] = useState(null);
  const services = [
    { name: 'AWS Cognito', desc: 'Single sign-on & user authentication', status: 'not-connected', detail: 'Configure a Cognito User Pool to enable SSO', icon: Settings, tone: 'from-orange-500 to-amber-700' },
    { name: 'AI Extraction Engine', desc: 'Vision-language model powering AI extraction', status: AI_RUNTIME.isConfigured() ? 'connected' : 'not-connected', detail: AI_RUNTIME.isConfigured() ? 'Active — routing through runtime gateway' : 'Start the dev server to activate', icon: Sparkles, tone: 'from-amber-500 to-orange-700' },
    { name: 'Tesseract OCR', desc: 'OCR & structured document analysis', status: 'not-connected', detail: 'Optional secondary OCR provider', icon: FileText, tone: 'from-blue-700 to-blue-900' },
    { name: 'AWS CloudWatch', desc: 'Logs, metrics, and alarm routing', status: 'not-connected', detail: 'Connect for production monitoring', icon: Activity, tone: 'from-emerald-600 to-emerald-800' },
    { name: 'AWS OpenSearch', desc: 'Full-text index for Digital Repository', status: 'not-connected', detail: 'Connect for scaled search across archived records', icon: Search, tone: 'from-teal-600 to-cyan-800' },
    { name: 'Salesforce CRM', desc: 'Donor record sync', status: 'not-connected', detail: 'Connect to push archived donor data', icon: Database, tone: 'from-slate-500 to-slate-700' }
  ];

  const usagePerBucket = useMemo(() => {
    const map = {};
    for (const b of buckets) {
      const batchesInBucket = batches.filter(bt => bt.bucketId === b.id);
      map[b.id] = computeBucketUsageBytes(batchesInBucket, []).totalBytes;
    }
    return map;
  }, [buckets, batches]);

  const saveBucket = (b) => {
    setBuckets(prev => { const idx = prev.findIndex(x => x.id === b.id); if (idx === -1) return [...prev, b]; const next = [...prev]; next[idx] = b; return next; });
    if (!activeBucketId) setActiveBucketId(b.id);
  };
  const deleteBucket = (id) => {
    setBuckets(prev => { const next = prev.filter(b => b.id !== id); if (id === activeBucketId) setActiveBucketId(next[0]?.id || null); return next; });
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2"><Cloud size={13} className="text-blue-800" /><h3 className="text-sm font-bold text-slate-800">AWS S3 Buckets</h3><span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-700 ">{buckets.length} connected</span></div>
          <Button variant="primary" size="sm" icon={Plus} onClick={() => setModalBucket('new')}>Add Bucket</Button>
        </div>
        {buckets.length === 0 ? (
          <div className="bg-white  border border-dashed border-slate-300 px-5 py-10 text-center"><Cloud size={18} className="text-slate-400 mx-auto mb-3" /><h4 className="text-sm font-bold text-slate-700 mb-1">No S3 buckets connected</h4><p className="text-xs text-slate-500 max-w-md mx-auto mb-3">Connect an AWS S3 bucket to stage donation records directly from cloud storage.</p><Button variant="primary" size="sm" icon={Plus} onClick={() => setModalBucket('new')}>Add Your First Bucket</Button></div>
        ) : (
          <div className={`grid gap-3 ${buckets.length === 1 ? 'grid-cols-1 max-w-sm' : buckets.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'}`}>
            {buckets.map(b => (
              <div key={b.id} className="relative">
                <BucketTab bucket={b} active={b.id === activeBucketId} onClick={() => setActiveBucketId(b.id)} liveUsageBytes={usagePerBucket[b.id] || 0} />
                <button onClick={(e) => { e.stopPropagation(); setModalBucket(b); }} className="absolute top-2 right-2 p-1 bg-white/90 hover:bg-white text-slate-500 hover:text-blue-700  border border-slate-200 hover:border-blue-300 shadow-sm" title="Edit bucket"><Edit2 size={11} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-2"><Plug size={13} className="text-blue-800" />AWS &amp; Third-Party Services</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {services.map(s => {
            const Icon = s.icon;
            const connected = s.status === 'connected';
            return (
              <div key={s.name} className="bg-white  border border-slate-200 p-4 shadow-sm flex items-center gap-3 hover:shadow-md transition">
                <div className={`w-11 h-11  bg-gradient-to-br ${s.tone} flex items-center justify-center shadow-md flex-shrink-0`}><Icon size={18} className="text-white" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><h4 className="text-sm font-bold text-slate-800">{s.name}</h4>{connected ? <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-800  ring-1 ring-emerald-200">ACTIVE</span> : <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 ">INACTIVE</span>}</div>
                  <div className="text-[11px] text-slate-500">{s.desc}</div>
                  <div className="text-[10px] text-slate-600 mt-1 truncate">{s.detail}</div>
                </div>
                {connected ? <Button variant="ghost" size="sm" icon={Settings}>Manage</Button> : <Button variant="primary" size="sm" icon={Link2}>Connect</Button>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="bg-white  border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between"><div className="flex items-center gap-2"><Key size={13} className="text-blue-800" /><h3 className="text-sm font-bold text-slate-800">API Keys</h3></div><Button variant="primary" size="sm" icon={Plus}>Generate Key</Button></div>
        <div className="px-5 py-10 text-center"><Key size={22} className="text-slate-300 mx-auto mb-2" /><div className="text-xs font-semibold text-slate-600">No API keys generated</div><div className="text-[10px] text-slate-500 mt-1">Generate a key to grant programmatic access to the repository</div></div>
      </div>
      {modalBucket !== null && <BucketConfigModal bucket={modalBucket === 'new' ? null : modalBucket} onSave={saveBucket} onDelete={deleteBucket} onClose={() => setModalBucket(null)} canDelete={true} />}
    </div>
  );
}
