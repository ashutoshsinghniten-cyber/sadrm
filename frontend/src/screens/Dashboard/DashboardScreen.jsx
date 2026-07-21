import React, { useState, useEffect } from 'react';
import {
  Upload, BarChart3, Archive as ArchiveIcon, Sparkles, Download, Plus,
  FileText, HardDrive, Wifi, Activity, TrendingUp, ClipboardCheck,
  ShieldCheck, Inbox, ArrowUpRight, ArrowDownRight, PieChart, Flag
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { PageHeader, Sparkline } from '../../components/shared/PageHeader.jsx';
import Button from '../../components/shared/Button.jsx';
import { pgGetArchivedRecordsCount, pgGetFlaggedArchivedRecordsCount } from '../../utils/pgApi.js';

const MetricCard = ({ label, value, sub, icon: Icon, tone, spark, sparkColor, trend, onClick }) => {
  const tones = { navy: { grad: 'from-blue-700 to-blue-900', shadow: 'shadow-blue-900/25' }, amber: { grad: 'from-amber-500 to-amber-700', shadow: 'shadow-amber-900/20' }, emerald: { grad: 'from-emerald-600 to-emerald-800', shadow: 'shadow-emerald-900/20' }, slate: { grad: 'from-slate-700 to-slate-900', shadow: 'shadow-slate-900/25' }, red: { grad: 'from-red-700 to-red-900', shadow: 'shadow-red-900/25' } };
  const t = tones[tone];
  return (
    <button onClick={onClick} className="group relative text-left bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-300 hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden">
      <div className={`absolute -top-8 -right-8 w-32 h-32 bg-gradient-to-br ${t.grad} opacity-5  blur-2xl group-hover:opacity-10 transition-opacity`}></div>
      <div className="relative">
        <div className="flex items-start justify-between">
          <div className={`w-10 h-10  bg-gradient-to-br ${t.grad} flex items-center justify-center shadow-md ${t.shadow}`}><Icon size={18} className="text-white" /></div>
          {trend != null && (<div className={`flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5  ${trend > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{trend > 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}{Math.abs(trend)}%</div>)}
        </div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mt-3">{label}</div>
        <div className="text-3xl font-black text-slate-800 mt-1 tracking-tight">{value}</div>
        {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
        {spark && (<div className="mt-3 -mx-1 h-8"><Sparkline data={spark} color={sparkColor} /></div>)}
      </div>
    </button>
  );
};

export { MetricCard };

const DashboardScreen = ({ setRoute, batches = [], archivedRecords = [], pendingCounts = { hitl: 0, qc: 0, extraction: 0 }, setAiPanelRequest = () => {} }) => {
  const hitlPending = pendingCounts.hitl;
  const qcPending = pendingCounts.qc;

  // archivedRecords (from App.jsx state) only holds records archived THIS session —
  // it's not the true archive total, which can be far larger than the 100/500-row page
  // size the list endpoint returns. Fetch the real COUNT-only total separately.
  const [archivedTotal, setArchivedTotal] = useState(null);
  const [flaggedTotal, setFlaggedTotal] = useState(null);
  useEffect(() => {
    let cancelled = false;
    pgGetArchivedRecordsCount().then(count => { if (!cancelled) setArchivedTotal(count); });
    pgGetFlaggedArchivedRecordsCount().then(count => { if (!cancelled) setFlaggedTotal(count); });
    return () => { cancelled = true; };
  }, []);
  const archived = archivedTotal !== null ? archivedTotal : archivedRecords.length;
  const flagged = flaggedTotal !== null ? flaggedTotal : 0;

  const confSamples = archivedRecords.flatMap(c => Object.values(c.fieldsConf || {}).filter(v => typeof v === 'number'));
  const avgConf = confSamples.length > 0 ? (confSamples.reduce((s, v) => s + v, 0) / confSamples.length).toFixed(1) : null;
  const totalDonationValue = archivedRecords.reduce((s, c) => s + (parseFloat(c.fields?.amount) || 0), 0);
  return (
  <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
    <div className="p-4 md:p-6">
      <PageHeader
        title="Dashboard"
        eyebrow="WORKSPACE"
        description={`${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · System Healthy`}
        actions={<>
          <Button variant="secondary" icon={Download}>Export Summary</Button>
          <Button variant="primary" icon={Plus} onClick={() => setRoute('import')}>Import New Batch</Button>
        </>}
      />
      {/* Top metric cards — 1 col on mobile, 2 on sm, 4 on lg */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div className="border-2 border-blue-200 bg-blue-50/60 p-3">
          <div className="text-[9px] font-bold text-blue-700 uppercase tracking-widest mb-2">Import / Upload</div>
          <MetricCard label="Total Batches" value={batches.length.toString()} sub={batches.length === 0 ? 'No batches imported' : `${batches.length} batch${batches.length !== 1 ? 'es' : ''} in pipeline`} icon={Upload} tone="navy" onClick={() => setRoute('import')} />
        </div>
        <div className="border-2 border-orange-200 bg-orange-50/60 p-3">
          <div className="text-[9px] font-bold text-orange-700 uppercase tracking-widest mb-2">Pre-Preparation</div>
          <MetricCard label="Extraction Queue" value={batches.filter(b => b.status === 'extraction').length.toString()} sub="Batches queued for AI" icon={FileText} tone="amber" onClick={() => setRoute('preprep')} />
        </div>
        <div className="border-2 border-purple-200 bg-purple-50/60 p-3">
          <div className="text-[9px] font-bold text-purple-700 uppercase tracking-widest mb-2">AI Extraction</div>
          <MetricCard label="Avg Extraction Conf." value={avgConf !== null ? `${avgConf}%` : '—'} sub={avgConf !== null ? `Across ${confSamples.length} extracted fields` : 'Awaiting first extraction'} icon={Activity} tone="slate" onClick={() => setRoute('extraction')} />
        </div>
        <div className="border-2 border-emerald-200 bg-emerald-50/60 p-3">
          <div className="text-[9px] font-bold text-emerald-700 uppercase tracking-widest mb-2">Archived</div>
          <MetricCard label="Archived to Repository" value={archived.toLocaleString()} sub={archived === 0 ? 'No records yet' : `${archived} record${archived !== 1 ? 's' : ''} archived`} icon={ArchiveIcon} tone="emerald" onClick={() => setRoute('repository')} />
          {flagged > 0 && (
            <button onClick={() => setRoute('repository')} className="mt-2 w-full flex items-center justify-center gap-1.5 text-[10px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2 py-1 transition-colors">
              <Flag size={10} />
              {flagged.toLocaleString()} flagged record{flagged !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
      {/* HITL / QC — 1 col mobile, 2 on sm */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="border-2 border-amber-200 bg-amber-50/60 p-3">
          <div className="text-[9px] font-bold text-amber-700 uppercase tracking-widest mb-2">HITL Review</div>
          <MetricCard label="Pending HITL Review" value={hitlPending.toString()} sub={hitlPending === 0 ? 'No donation records pending' : `${hitlPending} donation record${hitlPending !== 1 ? 's' : ''} to review`} icon={ClipboardCheck} tone="navy" onClick={() => setRoute('hitl')} />
        </div>
        <div className="border-2 border-indigo-200 bg-indigo-50/60 p-3">
          <div className="text-[9px] font-bold text-indigo-700 uppercase tracking-widest mb-2">QC Approval</div>
          <MetricCard label="Pending QC Approval" value={qcPending.toString()} sub={qcPending === 0 ? 'No batches queued' : `${qcPending} donation record${qcPending !== 1 ? 's' : ''} awaiting QC`} icon={ShieldCheck} tone="amber" onClick={() => setRoute('qc')} />
        </div>
      </div>
      {/* Chart + sidebar — 1 col mobile, 3 col on md */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-white border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Donation Volume — Last 30 Days</h3>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-2xl font-black text-slate-800">{totalDonationValue > 0 ? `$${totalDonationValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</span>
                {totalDonationValue === 0 && <span className="text-[11px] text-slate-500">Awaiting archived data</span>}
              </div>
            </div>
          </div>
          {totalDonationValue === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-xs text-slate-400 bg-slate-50/50 border border-dashed border-slate-200 ">
              <div className="text-center">
                <TrendingUp size={24} className="mx-auto mb-2 text-slate-300" />
                <div>Donation volume chart will appear once donation records are archived</div>
              </div>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-xs text-slate-500 bg-slate-50/50 ">
              Trend chart (historical data aggregation pending)
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-950  p-5 text-white shadow-lg overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-amber-500 opacity-15  blur-3xl"></div>
            <div className="relative">
              <div className="flex items-center gap-2 mb-3"><div className="w-9 h-9  bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-md shadow-amber-900/40 border border-amber-700"><Sparkles size={15} className="text-slate-900" /></div><div><div className="text-sm font-bold">DigiStore AI</div><div className="text-[10px] text-slate-400">AI-powered insights</div></div></div>
              <div className="text-xs text-slate-300 mb-3">Query the archive conversationally — find donors, summarize, flag patterns.</div>
              <Button variant="gold" size="sm" icon={Sparkles} onClick={() => { setAiPanelRequest(true); setRoute('repository'); }} className="w-full">Open DigiStore AI</Button>
            </div>
          </div>
          <div className="bg-white  border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 mb-3">AWS Infrastructure</h3>
            <div className="space-y-3">
              <div><div className="flex justify-between text-[11px] mb-1"><span className="text-slate-600 flex items-center gap-1"><HardDrive size={11} /> S3 Storage</span><span className="font-bold text-slate-800">0.0<span className="text-slate-400 font-normal"> / 50 GB</span></span></div><div className="h-2 bg-slate-100  overflow-hidden"><div className="h-full bg-gradient-to-r from-blue-700 to-blue-900 shadow-sm" style={{ width: '0%' }}></div></div></div>
              <div><div className="flex justify-between text-[11px] mb-1"><span className="text-slate-600 flex items-center gap-1"><Wifi size={11} /> Bandwidth</span><span className="font-bold text-slate-800">0.0<span className="text-slate-400 font-normal"> / 20 GB</span></span></div><div className="h-2 bg-slate-100  overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-800 shadow-sm" style={{ width: '0%' }}></div></div></div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-white border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-slate-800">Recent Batches</h3><button onClick={() => setRoute('import')} className="text-xs text-blue-800 font-semibold hover:text-blue-950">View all →</button></div>
          {batches.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-slate-200 ">
              <Inbox size={24} className="text-slate-300 mx-auto mb-2" />
              <div className="text-xs text-slate-500">No batches yet</div>
              <div className="text-[10px] text-slate-400 mt-1">Batches will appear here after import</div>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs min-w-[480px]">
              <thead><tr className="border-b border-slate-200 text-[10px] text-slate-500 uppercase"><th className="text-left pb-2 font-semibold tracking-wider">Batch ID</th><th className="text-left pb-2 font-semibold tracking-wider">Uploaded</th><th className="text-left pb-2 font-semibold tracking-wider">Records</th><th className="text-left pb-2 font-semibold tracking-wider">Pages</th><th className="text-left pb-2 font-semibold tracking-wider">Status</th><th className="text-right pb-2 font-semibold tracking-wider">Progress</th></tr></thead>
              <tbody>
                {batches.slice(0, 5).map(b => {
                  const statusCfg = { 'extraction': { label: 'Extracting', color: 'bg-slate-800 text-slate-100 ring-slate-600' }, 'hitl-review': { label: 'HITL Review', color: 'bg-blue-100 text-blue-800 ring-blue-200' }, 'qc-pending': { label: 'QC Pending', color: 'bg-amber-100 text-amber-800 ring-amber-200' }, 'archived': { label: 'Archived', color: 'bg-emerald-100 text-emerald-800 ring-emerald-200' } }[b.status] || { label: b.status, color: 'bg-slate-100 text-slate-600 ring-slate-200' };
                  return (
                    <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                      <td className="py-2.5 font-mono text-slate-700">{b.id}</td>
                      <td className="py-2.5 text-slate-600">{b.uploaded || '—'}</td>
                      <td className="py-2.5 text-slate-600">{b.recordCount || 0}</td>
                      <td className="py-2.5 text-slate-600">{b.pages || 0}</td>
                      <td className="py-2.5"><span className={`px-2 py-0.5  text-[10px] font-semibold ring-1 ring-inset ${statusCfg.color}`}>{statusCfg.label}</span></td>
                      <td className="py-2.5"><div className="flex items-center gap-2 justify-end"><div className="w-20 h-1.5 bg-slate-100  overflow-hidden"><div className="h-full bg-gradient-to-r from-blue-700 to-blue-900" style={{ width: `${b.progress || 0}%` }}></div></div><span className="text-slate-500 text-[10px] w-8">{b.progress || 0}%</span></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
        <div className="bg-white  border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-1">Donor Distribution</h3>
          <p className="text-[10px] text-slate-500 mb-3">By source type · derived from archive</p>
          <div className="h-[180px] flex items-center justify-center text-xs text-slate-400 bg-slate-50/50 border border-dashed border-slate-200 ">
            <div className="text-center px-3">
              <PieChart width={32} height={32} className="mx-auto mb-2 text-slate-300" />
              <div>Distribution will populate as donation records are archived</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

export default DashboardScreen;
