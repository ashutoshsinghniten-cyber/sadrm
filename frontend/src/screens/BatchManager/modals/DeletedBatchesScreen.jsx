import React, { useState, useMemo } from 'react';
import { Search, Trash2, Download, Activity } from 'lucide-react';
import { PageHeader } from '../../../components/shared/PageHeader.jsx';
import Button from '../../../components/shared/Button.jsx';
import { WORKFLOW_STAGE_CONFIG } from '../../../utils/extractionUtils.js';

export default function DeletedBatchesScreen({ deletedBatches, setRoute, embedded = false }) {
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('all');

  const filtered = useMemo(() => {
    let list = [...(deletedBatches || [])].map(e => ({ ...e, kind: e.kind || 'batch' }));
    if (kindFilter !== 'all') list = list.filter(e => e.kind === kindFilter);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(b => (b.id || '').toLowerCase().includes(q) || (b.batchId || '').toLowerCase().includes(q) || (b.deletedBy || '').toLowerCase().includes(q) || (b.deletionReason || '').toLowerCase().includes(q));
    }
    return list.sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
  }, [deletedBatches, search, kindFilter]);

  const kindCounts = useMemo(() => {
    const all = (deletedBatches || []).length;
    const batch = (deletedBatches || []).filter(e => (e.kind || 'batch') === 'batch').length;
    const record = (deletedBatches || []).filter(e => e.kind === 'record').length;
    return { all, batch, record };
  }, [deletedBatches]);

  const exportCsv = () => {
    const rows = [
      ['Type', 'ID', 'Parent Batch', 'Deleted At', 'Deleted By', 'From Stage', 'Records / Pages', 'Cascaded Archived', 'Reason'].join(','),
      ...filtered.map(e => [e.kind || 'batch', e.id, e.batchId || '', e.deletedAt, e.deletedBy, e.deletedFromStage, e.kind === 'record' ? e.pageCount : e.recordCount, e.kind === 'record' ? (e.wasArchived ? 1 : 0) : e.archivedRecordCount, '"' + (e.deletionReason || '').replace(/"/g, '""') + '"'].join(','))
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deletion-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const body = (
    <>
      <div className="mt-5 flex items-center gap-2 flex-wrap">
        {[{ id: 'all', label: 'All', count: kindCounts.all }, { id: 'batch', label: 'Batches', count: kindCounts.batch }, { id: 'record', label: 'Records', count: kindCounts.record }].map(k => {
          const active = kindFilter === k.id;
          return (
            <button key={k.id} onClick={() => setKindFilter(k.id)} className={`px-3 py-1.5  text-[11px] font-semibold border transition-all ${active ? 'bg-blue-900 border-blue-900 text-white shadow-md' : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'}`}>
              {k.label}<span className={`ml-1.5 text-[10px] font-bold ${active ? 'text-blue-100' : 'text-slate-500'}`}>{k.count}</span>
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ID, deleter, or reason…" className="pl-7 pr-3 py-1.5 text-xs border border-slate-300  bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 w-64" />
          </div>
          <span className="text-[11px] text-slate-500"><span className="font-bold text-slate-800">{filtered.length}</span> {filtered.length === 1 ? 'entry' : 'entries'}</span>
        </div>
      </div>
      <div className="mt-4 bg-white  border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center"><Trash2 size={32} className="text-slate-300 mx-auto mb-3" /><h3 className="text-sm font-bold text-slate-700 mb-1">No deletions to show</h3><p className="text-xs text-slate-500 max-w-md mx-auto">When an admin deletes a batch or a single record, it appears here with the reason and the items cascaded.</p></div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-[10px] text-slate-500 uppercase tracking-wider">
                {['Type','ID','Deleted At','By','From Stage','Records / Pages','Cascaded','Reason'].map(h => <th key={h} className={`text-${h === 'Records / Pages' || h === 'Cascaded' ? 'right' : 'left'} px-3 py-2.5 font-semibold`}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const kind = e.kind || 'batch';
                const stage = WORKFLOW_STAGE_CONFIG[e.deletedFromStage] || { label: e.deletedFromStage, tone: 'bg-slate-100 text-slate-700 ring-slate-200' };
                const itemCount = kind === 'record' ? e.pageCount : e.recordCount;
                const cascaded = kind === 'record' ? (e.wasArchived ? 1 : 0) : e.archivedRecordCount;
                return (
                  <tr key={e.id + ':' + e.deletedAt} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="px-3 py-3"><span className={`inline-block px-1.5 py-0.5  text-[10px] font-bold ring-1 ring-inset ${kind === 'batch' ? 'bg-violet-100 text-violet-800 ring-violet-200' : 'bg-amber-100 text-amber-800 ring-amber-200'}`}>{kind === 'batch' ? 'Batch' : 'Record'}</span></td>
                    <td className="px-3 py-3 font-mono text-slate-800 font-bold">{e.id}{kind === 'record' && e.batchId && <div className="text-[10px] font-normal text-slate-500 mt-0.5">in {e.batchId}</div>}</td>
                    <td className="px-3 py-3 text-slate-600 text-[11px]">{e.deletedAt ? new Date(e.deletedAt).toLocaleString() : '—'}</td>
                    <td className="px-3 py-3 text-slate-700">{e.deletedBy || '—'}</td>
                    <td className="px-3 py-3"><span className={`inline-block px-2 py-0.5  text-[10px] font-bold ring-1 ring-inset ${stage.tone}`}>{stage.label}</span></td>
                    <td className="px-3 py-3 text-right text-slate-700 tabular-nums">{itemCount ?? '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{cascaded > 0 ? <span className="text-amber-800 font-semibold">{cascaded}</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 text-slate-700 max-w-md"><div className="line-clamp-2 leading-snug">{e.deletionReason || '—'}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );

  if (embedded) return <div className="mt-4">{body}</div>;

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="p-4 md:p-6">
        <PageHeader title="Deletion Log" eyebrow="ADMIN" description="Audit Trail of Batches and Records Removed from the Pipeline · Admin-Only"
          actions={<><Button variant="secondary" icon={Activity} onClick={() => setRoute && setRoute('workflow')}>Batch Manager</Button><Button variant="primary" icon={Download} onClick={exportCsv} disabled={filtered.length === 0}>Export CSV</Button></>} />
        {body}
      </div>
    </div>
  );
}
