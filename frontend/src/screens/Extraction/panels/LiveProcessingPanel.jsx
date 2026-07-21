import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Check, FolderOpen, CheckCircle2 } from 'lucide-react';
import { PIPELINE_STEPS, formatDuration } from '../../../utils/extractionUtils.js';

export default function LiveProcessingPanel({ batch, job }) {
  const isRunning = !!job?.running && !job?.done;
  const isPaused = !!job?.paused && !job?.done;
  const isDone = !!job?.done;
  const [expandedRecords, setExpandedRecords] = useState(() => new Set());
  useEffect(() => { setExpandedRecords(new Set()); }, [batch?.id]);
  const toggleRecordExpansion = (idx) => {
    setExpandedRecords(prev => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next; });
  };
  const currentStep = job?.currentStep ?? 0;
  const stepProgress = job?.stepProgress ?? 0;
  const overallProgress = isDone ? 100 : (isRunning || isPaused) ? Math.min(100, Math.floor(((currentStep + stepProgress / 10) / PIPELINE_STEPS.length) * 100)) : 0;
  const isComplete = isDone || overallProgress >= 100;
  const realExtractionPhase = job?.realExtractionPhase;
  const isRealStillRunning = realExtractionPhase === 'running';
  const isFullyComplete = isComplete && !isRealStillRunning;
  const logRef = useRef(null);
  useEffect(() => {
    try { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; } catch {}
  }, [job?.logs?.length]);
  const currentRecordIdx = batch && (isRunning || isPaused || isDone) ? Math.min(batch.recordCount - 1, Math.floor(overallProgress / 100 * batch.recordCount)) : -1;
  const recordsDone = batch ? (isDone ? batch.recordCount : (isRunning || isPaused) ? Math.max(0, Math.floor(overallProgress / 100 * batch.recordCount)) : 0) : 0;
  const batchTimer = formatDuration(job?.elapsedMs || 0);

  return (
    <div className="border border-slate-700/60 shadow-2xl overflow-hidden flex flex-col h-full" style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(10,16,32,0.98) 100%)' }}>
      <div className="px-4 py-3 border-b border-slate-700/50 bg-gradient-to-r from-slate-900/80 to-slate-950/80 flex items-center justify-between flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isRunning && <div className="w-1.5 h-1.5  bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.9)] flex-shrink-0"></div>}
          {isPaused && <div className="w-1.5 h-1.5  bg-blue-400 flex-shrink-0"></div>}
          {isDone && <CheckCircle2 size={11} className="text-emerald-400 flex-shrink-0" />}
          <h3 className="text-[11px] font-bold text-slate-200 uppercase tracking-widest truncate">
            {!batch ? 'Live Processing' : isFullyComplete ? 'Extraction Complete' : isComplete ? 'Finalizing Extraction' : isPaused ? 'Paused' : isRunning ? (PIPELINE_STEPS[currentStep]?.name || 'Processing') : 'Ready to Start'}
          </h3>
        </div>
        {batch && job?.started && (
          <div className={`text-[10px] font-bold tabular-nums font-mono px-2 py-0.5  border flex-shrink-0 ${isRunning ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300' : isDone ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300' : 'bg-slate-800/60 border-slate-600/50 text-slate-300'}`}>
            {isRunning && <span className="inline-block w-1 h-1  bg-emerald-400 animate-pulse mr-1.5 align-middle"></span>}
            {batchTimer}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        {!batch ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div className="text-slate-600 text-[11px] font-mono">&gt; awaiting batch selection</div>
            <div className="text-slate-700 text-[10px] mt-2">Select a batch from the queue to begin</div>
          </div>
        ) : !job?.started ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div className="text-slate-400 text-xs font-semibold">{batch.id}</div>
            <div className="text-slate-500 text-[10px] mt-1">{batch.recordCount} donation records · {batch.pages} pages</div>
            <div className="text-slate-600 text-[11px] font-mono mt-4 animate-pulse">&gt; awaiting start command</div>
          </div>
        ) : isPaused && !isComplete ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div className="text-slate-300 text-xs font-semibold">{batch.id}</div>
            <div className="text-blue-300 text-[10px] mt-1 uppercase tracking-wider font-bold">Paused at {overallProgress}%</div>
            <div className="text-slate-600 text-[11px] font-mono mt-4">&gt; resume from queue to continue</div>
          </div>
        ) : (
          <div className="space-y-2">
            {isComplete && !isFullyComplete && (
              <div className="bg-amber-950/40 border border-amber-600/50 p-4 text-center">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center mx-auto mb-2 shadow-md shadow-amber-900/40"><RefreshCw size={18} className="text-white animate-spin" strokeWidth={2.5} /></div>
                <div className="text-sm font-bold text-amber-200">Finalizing Extraction</div>
                <div className="text-[10px] text-amber-400/70 mt-1">Pipeline complete · AI extraction still running for {batch.recordCount - (job?.realRecordsDone || 0)} record{batch.recordCount - (job?.realRecordsDone || 0) !== 1 ? 's' : ''}</div>
              </div>
            )}
            {isFullyComplete && (
              <div className="bg-emerald-950/40 border border-emerald-600/50 p-4 text-center">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center mx-auto mb-2 shadow-md shadow-emerald-900/40"><Check size={18} className="text-white" strokeWidth={3} /></div>
                <div className="text-sm font-bold text-emerald-200">Extraction Complete</div>
                <div className="text-[10px] text-emerald-400/70 mt-1">{batch.recordCount} donation records · {job?.realFieldsExtracted || job?.fieldsExtracted || 0} fields · ready for HITL</div>
              </div>
            )}
            <div className="mb-3"><div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5"><div className="w-1 h-1  bg-emerald-400"></div><span>Batch <span className="text-slate-200">{batch.id}</span> · {batch.recordCount} records · {batch.pages} pages</span></div></div>
            {currentRecordIdx >= 0 && (
              <>
                {Array.from({ length: isDone ? recordsDone : Math.min(3, recordsDone) }, (_, k) => {
                  const idx = isDone ? k : (recordsDone - 1 - (Math.min(3, recordsDone) - 1 - k));
                  if (idx < 0) return null;
                  const realRec = batch.records?.[idx];
                  const recId = realRec?.recordId || String(idx + 1).padStart(7, '0');
                  const pages = realRec?.pages || [];
                  const isExpanded = expandedRecords.has(idx);
                  return (
                    <div key={`done-${idx}`} className="bg-emerald-950/30 border border-emerald-900/50 overflow-hidden">
                      <button type="button" onClick={() => toggleRecordExpansion(idx)} className="w-full flex items-stretch hover:bg-emerald-950/50 transition-colors text-left">
                        <div className="w-16 flex-shrink-0 bg-emerald-600/30 flex items-center justify-center text-[9px] font-bold text-emerald-300 uppercase tracking-wider">REC {idx + 1}</div>
                        <div className="flex-1 px-3 py-2 flex items-center gap-2 min-w-0">
                          {isExpanded ? <ChevronDown size={11} className="text-emerald-400 flex-shrink-0" /> : <ChevronRight size={11} className="text-emerald-500 flex-shrink-0" />}
                          <FolderOpen size={11} className="text-emerald-500 flex-shrink-0" />
                          <span className="text-[11px] font-mono font-semibold text-emerald-300 truncate">{recId}</span>
                          <span className="text-[9px] font-semibold flex-shrink-0 whitespace-nowrap text-slate-500">· {pages.length} page{pages.length !== 1 ? 's' : ''}</span>
                          <Check size={12} className="text-emerald-400 flex-shrink-0 ml-auto" strokeWidth={3} />
                        </div>
                      </button>
                      {isExpanded && pages.length > 0 && (
                        <div className="px-3 py-2.5 border-t border-emerald-900/40 bg-emerald-950/20">
                          <div className="space-y-1">
                            {pages.map((p, pi) => (
                              <div key={pi} className="flex items-center gap-2 text-[10px]">
                                <span className="text-[8px] font-bold px-1 py-0.5  flex-shrink-0 bg-blue-500/30 text-blue-200">{p.code}</span>
                                <span className="text-slate-300 font-mono truncate flex-1">{p.filename}</span>
                                <Check size={9} className="text-emerald-400 flex-shrink-0" strokeWidth={3} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
      {(isRunning || isPaused || isDone) && batch && (
        <div className="px-4 py-3 border-t border-slate-700/50 bg-gradient-to-r from-slate-950/60 to-slate-900/60 flex-shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400">Step {Math.min(currentStep + 1, PIPELINE_STEPS.length)}/{PIPELINE_STEPS.length}</span>
              <span className="text-[10px] font-bold text-white tabular-nums">{overallProgress}%</span>
              {isPaused && <span className="text-[9px] text-blue-300 uppercase font-bold tracking-wider">paused</span>}
              {isDone && <span className="text-[9px] text-emerald-300 uppercase font-bold tracking-wider">done · locked</span>}
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-emerald-300 font-mono"><span className="font-bold tabular-nums">{job?.fieldsExtracted || 0}</span> extracted</span>
            </div>
          </div>
          <div className="relative h-1.5 bg-slate-800  overflow-hidden">
            <div className={`absolute inset-y-0 left-0 transition-all duration-500 ${isDone ? 'bg-gradient-to-r from-emerald-500 to-emerald-300' : isPaused ? 'bg-gradient-to-r from-blue-500 to-blue-300' : 'bg-gradient-to-r from-slate-400 via-slate-200 to-slate-300'}`} style={{ width: `${overallProgress}%` }}></div>
          </div>
        </div>
      )}
    </div>
  );
}
