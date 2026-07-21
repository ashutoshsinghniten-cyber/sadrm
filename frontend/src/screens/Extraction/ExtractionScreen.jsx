import React, { useState, useMemo, useCallback } from 'react';
import { CheckCircle2, Zap } from 'lucide-react';
import { PageHeader } from '../../components/shared/PageHeader.jsx';
import Button from '../../components/shared/Button.jsx';
import { PIPELINE_STEPS, formatDuration } from '../../utils/extractionUtils.js';
import BatchQueuePanel from './panels/BatchQueuePanel.jsx';
import LiveProcessingPanel from './panels/LiveProcessingPanel.jsx';
import ExecutionPipelinePanel from './panels/ExecutionPipelinePanel.jsx';

export default function ExtractionScreen({ batches, extractionJobs, startExtraction, pauseExtraction, globalElapsedMs = 0, setRoute }) {
  const [timerPaused, setTimerPaused] = useState(false);

  const queueBatches = useMemo(() => {
    return batches.filter(b => {
      if (b.status === 'extraction') return true;
      const job = extractionJobs[b.id];
      return !!job?.done;
    }).slice(0, 5000);
  }, [batches, extractionJobs]);

  const runningBatches = queueBatches.filter(b => extractionJobs[b.id]?.running && !extractionJobs[b.id]?.done);
  const queuedBatches  = queueBatches.filter(b => !extractionJobs[b.id]?.running && !extractionJobs[b.id]?.done);
  const doneBatches    = queueBatches.filter(b => extractionJobs[b.id]?.done);
  const recentlyCompleted = batches.filter(b => b.status === 'hitl-review' || b.status === 'qc-pending' || b.status === 'archived').slice(0, 5);

  const [selectedBatchId, setSelectedBatchId] = useState(null);

  const handleSelectBatch = useCallback((id) => {
    setSelectedBatchId(id);
    Object.entries(extractionJobs).forEach(([bId, j]) => {
      if (bId !== id && j.running && !j.done) pauseExtraction(bId);
    });
  }, [extractionJobs, pauseExtraction]);

  const activeBatch = useMemo(() => {
    if (selectedBatchId) {
      const found = queueBatches.find(b => b.id === selectedBatchId);
      if (found) return found;
    }
    return runningBatches[0] || queueBatches[0] || null;
  }, [selectedBatchId, queueBatches, runningBatches]);

  const activeJob = activeBatch ? extractionJobs[activeBatch.id] : null;

  const overallRunningProgress = useMemo(() => {
    if (runningBatches.length === 0) return 0;
    const totalSteps = runningBatches.length * PIPELINE_STEPS.length;
    const completedSteps = runningBatches.reduce((s, b) => {
      const j = extractionJobs[b.id];
      return s + (j ? j.currentStep + (j.stepProgress / 10) : 0);
    }, 0);
    return Math.min(100, Math.floor((completedSteps / totalSteps) * 100));
  }, [runningBatches, extractionJobs]);

  const totalExtracted = runningBatches.reduce((s, b) => { const j = extractionJobs[b.id]; return s + (j?.fieldsExtracted || 0); }, 0);

  const computeOverallPct = (job) => {
    if (!job) return 0;
    if (job.done) return 100;
    return Math.min(100, ((job.currentStep || 0) + (job.stepProgress || 0) / 10) / PIPELINE_STEPS.length * 100);
  };
  let totalRecordsProcessed = 0, totalRecordsAll = 0, totalPagesProcessed = 0, totalPagesAll = 0;
  for (const b of runningBatches) {
    const j = extractionJobs[b.id];
    const overall = computeOverallPct(j);
    const recCount = b.recordCount || (b.records?.length) || b.files || 0;
    const pageCount = b.records && b.records.length > 0 ? b.records.reduce((rs, r) => rs + (r.pages?.length || 0), 0) : (b.pages || 0);
    totalRecordsAll += recCount; totalPagesAll += pageCount;
    totalRecordsProcessed += Math.floor((overall / 100) * recCount);
    totalPagesProcessed += Math.floor((overall / 100) * pageCount);
  }

  return (
    <div className="flex-1 overflow-y-auto relative" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #0b1a36 40%, #0a1020 100%)' }}>
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] " style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)' }}></div>
        <div className="absolute top-40 -right-40 w-[500px] h-[500px] " style={{ background: 'radial-gradient(circle, rgba(148,163,184,0.08) 0%, transparent 70%)' }}></div>
      </div>
      <div className="relative p-6 flex flex-col" style={{ minHeight: '100%' }}>
        <PageHeader
          tone="dark" title="AI Extraction" eyebrow="PROCESSING"
          description={runningBatches.length > 0 ? `Extracting ${runningBatches.length} Batch${runningBatches.length !== 1 ? 'es' : ''} · In Progress` : queuedBatches.length > 0 ? `${queuedBatches.length} Batch${queuedBatches.length !== 1 ? 'es' : ''} Queued` : 'Document Ingestion, OCR, Field Extraction, and Cross-Validation'}
          actions={
            <div className="flex gap-2 font-mono">
              {[{ v: runningBatches.length, label: 'Running', c: 'text-emerald-400' }, { v: queuedBatches.length, label: 'Queued', c: 'text-amber-400' }, { v: doneBatches.length, label: 'Done', c: 'text-blue-400' }].map(s => (
                <div key={s.label} className="text-center px-2.5 py-1.5  bg-slate-900/60 border border-slate-700/50 min-w-[56px]">
                  <div className={`text-base font-black tabular-nums leading-none ${s.c}`}>{s.v}</div>
                  <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{s.label}</div>
                </div>
              ))}
              <div className={`text-center px-3 py-1.5  border min-w-[88px] transition-colors ${runningBatches.length > 0 && !timerPaused ? 'bg-emerald-950/40 border-emerald-700/50' : 'bg-slate-900/60 border-slate-700/50'}`}>
                <div className={`text-base font-black tabular-nums leading-none ${runningBatches.length > 0 && !timerPaused ? 'text-emerald-300' : 'text-slate-400'}`}>{formatDuration(globalElapsedMs)}</div>
                <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Total Time</div>
              </div>
              {runningBatches.length > 0 && (
                <button onClick={() => { if (timerPaused) { setTimerPaused(false); } else { setTimerPaused(true); runningBatches.forEach(b => pauseExtraction(b.id)); } }} className={`px-2.5 py-1.5 text-[10px] font-bold  border transition-all flex items-center gap-1.5 ${timerPaused ? 'bg-emerald-700 hover:bg-emerald-600 text-white border-emerald-600' : 'bg-slate-700/60 hover:bg-slate-600/60 text-slate-200 border-slate-600/50'}`}>
                  {timerPaused ? <><Zap size={10} />Resume</> : <>⏸ Hold</>}
                </button>
              )}
            </div>
          }
        />

        {runningBatches.length > 0 && (
          <div className="mb-4 p-3  border border-slate-700/60 backdrop-blur-sm flex items-center gap-4 flex-shrink-0" style={{ background: 'rgba(15,23,42,0.6)' }}>
            <div className="flex items-center gap-2 flex-shrink-0"><span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Upload Queue</span><span className="text-[10px] text-slate-500">· {runningBatches.length} batch{runningBatches.length !== 1 ? 'es' : ''}</span></div>
            <div className="flex-1 relative h-2 bg-slate-800  overflow-hidden"><div className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 transition-all duration-500 shadow-[0_0_10px_rgba(74,222,128,0.6)]" style={{ width: `${overallRunningProgress}%` }}></div></div>
            <div className="flex-shrink-0 text-[11px] font-black text-emerald-400 tabular-nums min-w-[44px] text-right">{overallRunningProgress}%</div>
            <div className="flex gap-2 flex-shrink-0">
              {[{ label: 'Records', p: totalRecordsProcessed, t: totalRecordsAll }, { label: 'Pages', p: totalPagesProcessed, t: totalPagesAll }].map(s => (
                <div key={s.label} className="text-center px-3 py-1  border border-slate-700/60 bg-slate-900/60 min-w-[68px]">
                  <div className="text-base font-black tabular-nums leading-none"><span className="text-emerald-400">{s.p}</span><span className="text-slate-500 mx-1">of</span><span className="text-slate-300">{s.t}</span></div>
                  <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{s.label}</div>
                </div>
              ))}
              <div className="text-center px-3 py-1  border border-emerald-500/30 bg-emerald-950/30 min-w-[68px]">
                <div className="text-base font-black text-emerald-400 tabular-nums leading-none">{totalExtracted}</div>
                <div className="text-[8px] font-bold text-emerald-300/70 uppercase tracking-widest mt-0.5">Fields</div>
              </div>
            </div>
          </div>
        )}

        <div className={`flex-1 grid gap-3 min-h-[560px] transition-opacity ${timerPaused ? 'opacity-50 pointer-events-none' : ''}`} style={{ gridTemplateColumns: 'minmax(260px, 1fr) minmax(320px, 1.2fr) minmax(300px, 1fr)' }}>
          <BatchQueuePanel batches={queueBatches} extractionJobs={extractionJobs} activeBatchId={activeBatch?.id} onSelect={handleSelectBatch} onStart={(id) => { startExtraction(id); setSelectedBatchId(id); }} onPause={pauseExtraction} />
          <LiveProcessingPanel batch={activeBatch} job={activeJob} />
          <ExecutionPipelinePanel batch={activeBatch} job={activeJob} />
        </div>

        {recentlyCompleted.length > 0 && (
          <div className="mt-4 flex-shrink-0">
            <div className="flex items-center gap-2 mb-2"><CheckCircle2 size={12} className="text-emerald-400" /><h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Handed Off to HITL · {recentlyCompleted.length}</h3></div>
            <div className="bg-white/95  border border-slate-200 shadow-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-wider bg-slate-50/50"><th className="text-left px-4 py-2 font-semibold">Batch ID</th><th className="text-right py-2 font-semibold">Records</th><th className="text-right py-2 font-semibold pr-4">Pages</th><th className="text-left py-2 font-semibold">Handoff</th><th className="text-right px-4 py-2 font-semibold">Actions</th></tr></thead>
                <tbody>
                  {recentlyCompleted.map(b => (
                    <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-slate-700">{b.id}</td>
                      <td className="py-2 text-right font-semibold text-slate-800 tabular-nums">{b.recordCount}</td>
                      <td className="py-2 text-right text-slate-600 tabular-nums pr-4">{b.pages}</td>
                      <td className="py-2"><span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">✓ Ready for HITL review</span></td>
                      <td className="px-4 py-2 text-right"><button onClick={() => setRoute('hitl')} className="text-blue-800 font-semibold hover:text-blue-950 text-[11px]">Open in HITL →</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
