import React, { useState, useMemo, useCallback } from 'react';
import { Search, Database, Trash2, Download, ExternalLink, ChevronDown, ChevronRight, FileJson, FileSpreadsheet, Zap, ClipboardCheck, ShieldCheck, Archive as ArchiveIcon, FileText } from 'lucide-react';
import { PageHeader } from '../../components/shared/PageHeader.jsx';
import Button from '../../components/shared/Button.jsx';
import FlagBadge from '../../components/shared/FlagBadge.jsx';
import { WORKFLOW_STAGE_CONFIG, exportBatchAsJson, exportBatchAsXlsx } from '../../utils/extractionUtils.js';
import DeleteBatchModal from './modals/DeleteBatchModal.jsx';
import DeleteRecordModal from './modals/DeleteRecordModal.jsx';
import DeletedBatchesScreen from './modals/DeletedBatchesScreen.jsx';

export default function BatchManagerScreen({ batches, archivedRecords, deletedBatches, deleteBatch, deleteRecord, setRoute }) {
  const [tab, setTab] = useState('batches');
  const [stageFilter, setStageFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  const [expandedBatches, setExpandedBatches] = useState(() => new Set());
  const [confirmingRecordDelete, setConfirmingRecordDelete] = useState(null);

  const toggleExpanded = (batchId) => {
    setExpandedBatches(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId); else next.add(batchId);
      return next;
    });
  };

  const stageCounts = useMemo(() => {
    const counts = { all: batches.length, extraction: 0, 'hitl-review': 0, 'qc-pending': 0, archived: 0 };
    batches.forEach(b => { if (counts[b.status] != null) counts[b.status]++; });
    return counts;
  }, [batches]);

  const filtered = useMemo(() => {
    let list = [...batches];
    if (stageFilter !== 'all') list = list.filter(b => b.status === stageFilter);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(b => b.id.toLowerCase().includes(q) || (b.uploader || '').toLowerCase().includes(q));
    }
    return list.sort((a, b) => (b.id > a.id ? 1 : -1));
  }, [batches, stageFilter, search]);

  const archivedCountForBatch = (batchId) => archivedRecords.filter(r => r.batchId === batchId).length;

  const exportDeletionLogCsv = useCallback(() => {
    const list = (deletedBatches || []).map(e => ({ ...e, kind: e.kind || 'batch' }));
    const rows = [
      ['Type', 'ID', 'Parent Batch', 'Deleted At', 'Deleted By', 'From Stage', 'Records / Pages', 'Cascaded Archived', 'Reason'].join(','),
      ...list.map(e => [e.kind, e.id, e.batchId || '', e.deletedAt, e.deletedBy, e.deletedFromStage, e.kind === 'record' ? e.pageCount : e.recordCount, e.kind === 'record' ? (e.wasArchived ? 1 : 0) : e.archivedRecordCount, '"' + (e.deletionReason || '').replace(/"/g, '""') + '"'].join(','))
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deletion-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [deletedBatches]);

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="p-4 md:p-6">
        <PageHeader title="Batch Manager" eyebrow="ADMIN" description="Cross-Pipeline View of All Batches and Deletion Audit Trail · Admin-Only" />
        <div className="mt-4 flex items-center gap-1 border-b border-slate-200">
          {[{ id: 'batches', label: 'Batch Management', count: batches.length }, { id: 'deleted', label: 'Deletion Log', count: (deletedBatches || []).length }].map(t => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`relative px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${active ? 'text-blue-900' : 'text-slate-500 hover:text-slate-700'}`}>
                {t.label}
                <span className={`ml-2 inline-block px-1.5 py-0.5  text-[10px] font-bold tabular-nums ${active ? 'bg-blue-900 text-white' : 'bg-slate-200 text-slate-600'}`}>{t.count}</span>
                {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-blue-900 " />}
              </button>
            );
          })}
          {tab === 'deleted' && (
            <div className="ml-auto pb-1.5">
              <Button variant="primary" icon={Download} onClick={exportDeletionLogCsv} disabled={(deletedBatches || []).length === 0}>Export CSV</Button>
            </div>
          )}
        </div>

        {tab === 'batches' && <>
          <div className="mt-5 flex items-center gap-2 flex-wrap">
            {[{ id: 'all', label: 'All Batches', count: stageCounts.all }, { id: 'extraction', label: 'AI Extraction', count: stageCounts.extraction }, { id: 'hitl-review', label: 'HITL Review', count: stageCounts['hitl-review'] }, { id: 'qc-pending', label: 'QC Approval', count: stageCounts['qc-pending'] }, { id: 'archived', label: 'Archived', count: stageCounts.archived }].map(s => {
              const active = stageFilter === s.id;
              return (
                <button key={s.id} onClick={() => setStageFilter(s.id)} className={`px-3 py-1.5  text-[11px] font-semibold border transition-all ${active ? 'bg-blue-900 border-blue-900 text-white shadow-md' : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'}`}>
                  {s.label}<span className={`ml-1.5 text-[10px] font-bold ${active ? 'text-blue-100' : 'text-slate-500'}`}>{s.count}</span>
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search batch ID or uploader…" className="pl-7 pr-3 py-1.5 text-xs border border-slate-300  bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 w-64" />
              </div>
            </div>
          </div>
          <div className="mt-4 bg-white  border border-slate-200 shadow-sm overflow-hidden">
            {filtered.length === 0 ? (
              <div className="px-6 py-16 text-center"><Database size={32} className="text-slate-300 mx-auto mb-3" /><h3 className="text-sm font-bold text-slate-700 mb-1">No batches match</h3><p className="text-xs text-slate-500">Try a different stage filter or clear the search.</p></div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-[10px] text-slate-500 uppercase tracking-wider">
                    <th className="text-left px-3 py-2.5 font-semibold w-8"></th>
                    {['Batch ID','Stage','Uploaded','Uploader'].map(h => <th key={h} className="text-left px-3 py-2.5 font-semibold">{h}</th>)}
                    {['Records','Archived'].map(h => <th key={h} className="text-right px-3 py-2.5 font-semibold">{h}</th>)}
                    <th className="text-right px-4 py-2.5 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(b => {
                    const stage = WORKFLOW_STAGE_CONFIG[b.status] || { label: b.status, route: 'dashboard', tone: 'bg-slate-100 text-slate-700 ring-slate-200', icon: FileText };
                    const StageIcon = stage.icon;
                    const archivedCount = archivedCountForBatch(b.id);
                    const records = b.records || [];
                    const recordCount = records.length;
                    const isExpanded = expandedBatches.has(b.id);
                    return (
                      <React.Fragment key={b.id}>
                        <tr className={`border-b border-slate-100 transition ${isExpanded ? 'bg-blue-50/40' : 'hover:bg-slate-50'}`}>
                          <td className="px-3 py-3">
                            <button onClick={() => recordCount > 0 && toggleExpanded(b.id)} disabled={recordCount === 0} className={`p-1  transition ${recordCount === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-200 text-slate-600'}`} title={recordCount === 0 ? 'No records' : isExpanded ? 'Collapse' : 'Expand'}>
                              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            </button>
                          </td>
                          <td className="px-3 py-3 font-mono text-slate-800 font-bold">{b.id}</td>
                          <td className="px-3 py-3">
                            <button onClick={() => setRoute(stage.route)} className={`inline-flex items-center gap-1 px-2 py-0.5  text-[10px] font-bold ring-1 ring-inset hover:opacity-80 transition ${stage.tone}`} title={`Jump to ${stage.label}`}>
                              <StageIcon size={9} />{stage.label}<ExternalLink size={8} className="opacity-50" />
                            </button>
                          </td>
                          <td className="px-3 py-3 text-slate-600">{b.uploaded || '—'}</td>
                          <td className="px-3 py-3 text-slate-600">{b.uploader || '—'}</td>
                          <td className="px-3 py-3 text-right text-slate-800 font-semibold tabular-nums">{recordCount}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{archivedCount > 0 ? <span className="text-emerald-700 font-semibold">{archivedCount}</span> : <span className="text-slate-400">—</span>}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1 ml-auto">
                              <button onClick={() => exportBatchAsJson(b, archivedRecords)} className="p-1.5 text-slate-500 hover:text-blue-800 hover:bg-blue-50  border border-slate-200 hover:border-blue-300 transition" title="Export JSON"><FileJson size={11} /></button>
                              <button onClick={() => exportBatchAsXlsx(b, archivedRecords)} className="p-1.5 text-slate-500 hover:text-emerald-800 hover:bg-emerald-50  border border-slate-200 hover:border-emerald-300 transition" title="Export XLSX"><FileSpreadsheet size={11} /></button>
                              <button onClick={() => setConfirmingDelete(b)} className="px-2 py-1 text-[10px] font-bold text-red-700 hover:bg-red-50  border border-red-200 hover:border-red-400 transition flex items-center gap-1" title="Delete batch"><Trash2 size={10} />Delete batch</button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && recordCount > 0 && (
                          <tr className="bg-blue-50/30 border-b border-blue-200">
                            <td colSpan={8} className="px-0 py-0">
                              <div className="px-12 py-3">
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">{recordCount} record{recordCount === 1 ? '' : 's'} in this batch</div>
                                <table className="w-full text-xs bg-white  border border-slate-200">
                                  <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr className="text-[9px] text-slate-500 uppercase tracking-wider">
                                      {['Record ID','Stage','Pages','Donor','Amount','State','Actions'].map(h => <th key={h} className={`${h === 'Pages' || h === 'Amount' || h === 'State' || h === 'Actions' ? 'text-right' : 'text-left'} px-3 py-2 font-semibold`}>{h}</th>)}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {records.map(rec => {
                                      const archived = archivedRecords.find(ar => ar.batchId === b.id && (ar.id === rec.id || ar.recordId === rec.recordId));
                                      const f = archived?.fields || rec.hitlReview?.lockedFields || (rec.extractedRecord ? { donorName: rec.extractedRecord.donor?.name, amount: rec.extractedRecord.donation?.amount } : {});
                                      const donor = f.donorName || '—';
                                      const amount = f.amount != null && f.amount !== '' ? `$${parseFloat(f.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
                                      const state = archived ? { label: 'Archived', tone: 'bg-emerald-100 text-emerald-800 ring-emerald-200' } : rec.hitlReview ? { label: rec.qcReview?.status || 'HITL approved', tone: 'bg-blue-100 text-blue-800 ring-blue-200' } : rec.extractionStatus === 'done' ? { label: 'Extracted', tone: 'bg-slate-100 text-slate-700 ring-slate-200' } : rec.extractionStatus === 'error' ? { label: 'Error', tone: 'bg-red-100 text-red-700 ring-red-200' } : { label: rec.extractionStatus || 'pending', tone: 'bg-slate-100 text-slate-600 ring-slate-200' };
                                      const flagged = !!(rec.flagged || archived?.flagged);
                                      const flagReason = rec.flagReason || archived?.flagReason;
                                      return (
                                        <tr key={rec.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition">
                                          <td className="px-3 py-2 font-mono text-slate-800">
                                            <div className="flex items-center gap-1.5">
                                              {rec.recordId || rec.id}
                                              {flagged && <FlagBadge flagged reason={flagReason} />}
                                            </div>
                                          </td>
                                          <td className="px-3 py-2 text-slate-600">{(rec.pages || []).map(p => p.code).join(', ') || '—'}</td>
                                          <td className="px-3 py-2 text-right text-slate-700 tabular-nums">{(rec.pages || []).length}</td>
                                          <td className="px-3 py-2 text-slate-700 truncate max-w-[200px]" title={donor}>{donor}</td>
                                          <td className="px-3 py-2 text-right text-slate-800 font-semibold tabular-nums">{amount}</td>
                                          <td className="px-3 py-2 text-right"><span className={`inline-flex items-center px-1.5 py-0.5  text-[9px] font-bold ring-1 ring-inset ${state.tone}`}>{state.label}</span></td>
                                          <td className="px-3 py-2 text-right"><button onClick={() => setConfirmingRecordDelete({ batch: b, record: rec, archived })} className="px-2 py-0.5 text-[10px] font-bold text-red-700 hover:bg-red-50  border border-red-200 hover:border-red-400 transition inline-flex items-center gap-1" title={archived ? 'Delete record (also removes archived copy)' : 'Delete record'}><Trash2 size={9} />Delete</button></td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>}

        {tab === 'deleted' && <DeletedBatchesScreen deletedBatches={deletedBatches} embedded />}
      </div>

      {confirmingDelete && (
        <DeleteBatchModal batch={confirmingDelete} archivedRecordCount={archivedCountForBatch(confirmingDelete.id)} onClose={() => setConfirmingDelete(null)} onConfirm={(reason) => { deleteBatch(confirmingDelete.id, reason); setConfirmingDelete(null); }} />
      )}
      {confirmingRecordDelete && (
        <DeleteRecordModal record={confirmingRecordDelete.record} batch={confirmingRecordDelete.batch} wasArchived={!!confirmingRecordDelete.archived} onClose={() => setConfirmingRecordDelete(null)} onConfirm={(reason) => { deleteRecord(confirmingRecordDelete.batch.id, confirmingRecordDelete.record.id, reason); setConfirmingRecordDelete(null); }} />
      )}
    </div>
  );
}
