import React, { useState, useEffect } from 'react';
import { Database, Inbox, Zap, CheckCircle2, RefreshCw } from 'lucide-react';
import { formatDuration } from '../../../utils/extractionUtils.js';

export default function BatchQueuePanel({ batches, extractionJobs, activeBatchId, onSelect, onStart, onPause }) {
  const priorityStyle = {
    High:   { pill: 'bg-red-500/20 text-red-300 ring-red-500/40',   dot: 'bg-red-500' },
    Normal: { pill: 'bg-slate-700/60 text-slate-300 ring-slate-600', dot: 'bg-slate-400' },
    Low:    { pill: 'bg-blue-500/20 text-blue-300 ring-blue-500/40', dot: 'bg-blue-400' }
  };

  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bg-white  border border-slate-200 shadow-xl overflow-hidden flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2"><Database size={13} className="text-slate-700" /><h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-widest">Queue</h3></div>
        <div className="text-[10px] text-slate-500 font-mono">{batches.length}</div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {batches.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8">
            <div className="relative w-14 h-14  flex items-center justify-center shadow-md border border-slate-200 overflow-hidden mb-3" style={{ background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)' }}><Inbox size={22} className="text-slate-400" strokeWidth={2.25} /></div>
            <h3 className="text-sm font-bold text-slate-700">No batch available</h3>
            <p className="text-[11px] text-slate-500 mt-1 leading-snug">Batches queued for AI Extraction from the Import Batches page will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {batches.map((b, i) => {
              const job = extractionJobs[b.id] || {};
              const isActive = b.id === activeBatchId;
              const priority = b.priority || 'Normal';
              const timerDisplay = formatDuration(job.elapsedMs || 0);
              const stepCount = 7;
              const pctComplete = job.done ? 100 : Math.min(99, Math.floor(((job.currentStep || 0) + ((job.stepProgress || 0) / 10)) / stepCount * 100));

              if (job.done) {
                const isFinalizing = job.realExtractionPhase === 'running';
                const cardCfg = isFinalizing
                  ? { border: isActive ? 'border-amber-400 shadow-lg shadow-amber-500/20' : 'border-amber-300 hover:border-amber-400', bg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', iconBg: 'bg-gradient-to-br from-amber-500 to-amber-700', label: 'Finalizing', labelColor: 'text-amber-800', timerBg: 'bg-white/70 border-amber-300', timerColor: 'text-amber-800', metricColor: 'text-amber-700' }
                  : { border: isActive ? 'border-emerald-400 shadow-lg shadow-emerald-500/20' : 'border-emerald-200 hover:border-emerald-300', bg: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', iconBg: 'bg-gradient-to-br from-emerald-500 to-emerald-700', label: 'Done · Locked', labelColor: 'text-emerald-800', timerBg: 'bg-white/70 border-emerald-300', timerColor: 'text-emerald-800', metricColor: 'text-emerald-700' };
                const recordsRemaining = (b.recordCount || 0) - (job?.realRecordsDone || 0);
                return (
                  <div key={b.id} onClick={() => onSelect(b.id)} className={`relative  border-2 cursor-pointer transition-all overflow-hidden ${cardCfg.border}`} style={{ background: cardCfg.bg }}>
                    <div className="p-2.5">
                      <div className="flex items-center gap-2">
                        <div className={`relative w-7 h-7  flex-shrink-0 ${cardCfg.iconBg} flex items-center justify-center shadow-md`}>
                          {isFinalizing ? <RefreshCw size={12} className="text-white animate-spin" strokeWidth={2.5} /> : <CheckCircle2 size={12} className="text-white" strokeWidth={2.5} />}
                        </div>
                        <span className="flex-1 min-w-0 font-mono text-[11px] font-bold text-slate-900 truncate">{b.id}</span>
                        <span className={`flex-shrink-0 text-[9px] font-bold ${cardCfg.labelColor} uppercase tracking-wider whitespace-nowrap px-1.5 py-0.5  ${cardCfg.timerBg} border`}>{cardCfg.label}</span>
                      </div>
                      <div className="flex items-center gap-x-2 mt-1.5 ml-9">
                        <span className={`text-[10px] font-bold ${cardCfg.timerColor} tabular-nums font-mono whitespace-nowrap`}>{timerDisplay}</span>
                        <span className={`text-[10px] ${cardCfg.metricColor} font-semibold whitespace-nowrap`}>{b.recordCount}r · {b.pages}p</span>
                      </div>
                      {isFinalizing && recordsRemaining > 0 && <div className="mt-1 ml-9"><span className="text-[10px] text-amber-700 font-semibold whitespace-nowrap">{recordsRemaining} left</span></div>}
                    </div>
                  </div>
                );
              }

              if (job.running) {
                return (
                  <div key={b.id} onClick={() => onSelect(b.id)} className={`relative  border-2 cursor-pointer transition-all overflow-hidden ${isActive ? 'border-amber-400 shadow-lg shadow-amber-500/20' : 'border-amber-300 hover:border-amber-400'}`} style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)' }}>
                    <div className="p-2.5">
                      <div className="flex items-center gap-2">
                        <div className="relative w-7 h-7  flex-shrink-0 bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-md shadow-amber-900/30">
                          <Zap size={12} className="text-white" strokeWidth={2.5} />
                          <div className="absolute inset-0  animate-ping bg-amber-300 opacity-40"></div>
                        </div>
                        <span className="flex-1 min-w-0 font-mono text-[11px] font-bold text-slate-900 truncate">{b.id}</span>
                        {(priority === 'High' || priority === 'Low') && <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5  ${priority === 'High' ? 'bg-red-100 text-red-800 ring-1 ring-red-200' : 'bg-blue-100 text-blue-800 ring-1 ring-blue-200'}`}>{priority.toUpperCase()}</span>}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1.5 ml-9">
                        <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider whitespace-nowrap">Extracting · {pctComplete}%</span>
                        <button onClick={(e) => { e.stopPropagation(); onPause?.(b.id); }} className="flex-shrink-0 px-2 py-0.5 text-[10px] font-bold bg-amber-700 hover:bg-amber-800 text-white rounded border border-amber-800 transition-all flex items-center gap-1">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>Pause
                        </button>
                      </div>
                      <div className="flex items-center gap-x-2 mt-1 ml-9">
                        <div className="inline-flex items-center gap-1 px-1.5 py-0  bg-white/70 border border-amber-300 flex-shrink-0"><div className="w-1 h-1  bg-amber-500 animate-pulse"></div><span className="text-[10px] font-bold text-amber-800 tabular-nums font-mono">{timerDisplay}</span></div>
                        <span className="text-[10px] text-amber-700 font-semibold whitespace-nowrap">{b.recordCount}r · {b.pages}p</span>
                      </div>
                    </div>
                  </div>
                );
              }

              if (job.paused) {
                return (
                  <div key={b.id} onClick={() => onSelect(b.id)} className={`relative  border-2 cursor-pointer transition-all overflow-hidden ${isActive ? 'border-blue-400 shadow-md' : 'border-blue-200 hover:border-blue-300'}`} style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' }}>
                    <div className="p-2.5">
                      <div className="flex items-center gap-2">
                        <div className="relative w-7 h-7  flex-shrink-0 bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-md shadow-blue-900/30"><svg width="11" height="11" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg></div>
                        <span className="flex-1 min-w-0 font-mono text-[11px] font-bold text-slate-900 truncate">{b.id}</span>
                        {(priority === 'High' || priority === 'Low') && <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5  ${priority === 'High' ? 'bg-red-100 text-red-800 ring-1 ring-red-200' : 'bg-blue-100 text-blue-800 ring-1 ring-blue-200'}`}>{priority.toUpperCase()}</span>}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1.5 ml-9">
                        <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider whitespace-nowrap">Paused · {pctComplete}%</span>
                        <button onClick={(e) => { e.stopPropagation(); onStart(b.id); }} className="flex-shrink-0 px-2.5 py-0.5 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded border border-emerald-700 transition-all flex items-center gap-1"><Zap size={9} />Resume</button>
                      </div>
                      <div className="flex items-center gap-x-2 mt-1 ml-9">
                        <div className="inline-flex items-center px-1.5 py-0  bg-white/70 border border-blue-300 flex-shrink-0"><span className="text-[10px] font-bold text-blue-800 tabular-nums font-mono">{timerDisplay}</span></div>
                        <span className="text-[10px] text-slate-600 whitespace-nowrap">{b.recordCount}r · {b.pages}p</span>
                      </div>
                    </div>
                  </div>
                );
              }

              // QUEUED
              const allRecs = b.records || [];
              const pendingRecs = allRecs.filter(r => r.extractionStatus !== 'done');
              const pendingPages = pendingRecs.reduce((s, r) => s + (r.pages?.length || 0), 0);
              const isPartialRerun = allRecs.length > 0 && pendingRecs.length > 0 && pendingRecs.length < allRecs.length;
              return (
                <div key={b.id} onClick={() => onSelect(b.id)} className={`relative  border cursor-pointer transition-all bg-white ${isActive ? 'border-slate-400 shadow-md' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}>
                  <div className="p-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7  flex-shrink-0 bg-slate-100 border border-slate-200 flex items-center justify-center"><span className="text-[11px] font-bold text-slate-500 tabular-nums">{i + 1}</span></div>
                      <span className="flex-1 min-w-0 font-mono text-[11px] font-bold text-slate-800 truncate">{b.id}</span>
                      {(priority === 'High' || priority === 'Low') && <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5  ${priority === 'High' ? 'bg-red-100 text-red-800 ring-1 ring-red-200' : 'bg-blue-100 text-blue-800 ring-1 ring-blue-200'}`}>{priority.toUpperCase()}</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1.5 ml-9">
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Queued</span>
                      <button onClick={(e) => { e.stopPropagation(); onStart(b.id); }} className="flex-shrink-0 px-2.5 py-0.5 text-[10px] font-bold bg-slate-900 hover:bg-slate-800 text-white rounded border border-slate-700 transition-all flex items-center gap-1"><Zap size={9} />Start</button>
                    </div>
                    <div className="flex items-center gap-x-2 mt-1 ml-9">
                      {isPartialRerun ? (
                        <><span className="text-[10px] text-amber-700 font-semibold whitespace-nowrap">{pendingRecs.length} of {allRecs.length} records · {pendingPages}p to re-extract</span><span className="text-[9px] font-bold px-1.5 py-0.5  bg-violet-100 text-violet-700 ring-1 ring-violet-200 uppercase tracking-wider">Rework</span></>
                      ) : (
                        <span className="text-[10px] text-slate-500 whitespace-nowrap">{b.recordCount}r · {b.pages}p</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
