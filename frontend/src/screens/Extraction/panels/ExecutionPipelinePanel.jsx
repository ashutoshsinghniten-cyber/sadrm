import React from 'react';
import { Cpu, Check } from 'lucide-react';
import { PIPELINE_STEPS } from '../../../utils/extractionUtils.js';

const MetallicSilverIcon = ({ icon: Icon, size = 18, className = '' }) => (
  <div className={`relative w-9 h-9  flex items-center justify-center shadow-md shadow-slate-900/30 border border-slate-500/60 overflow-hidden ${className}`} style={{ background: 'linear-gradient(135deg, #e2e8f0 0%, #f8fafc 35%, #cbd5e1 65%, #94a3b8 100%)' }}>
    <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-transparent to-black/10 pointer-events-none"></div>
    <Icon size={size} className="relative text-slate-700" strokeWidth={2.25} />
  </div>
);

export default function ExecutionPipelinePanel({ job, batch }) {
  const currentStep = job?.currentStep ?? -1;
  const isRunning = !!job?.running && !job?.done;
  const isPaused = !!job?.paused && !job?.done;
  const isDone = !!job?.done;
  const hasActivity = isRunning || isPaused || isDone;
  const overallProgress = hasActivity ? Math.min(100, ((currentStep + (job?.stepProgress ?? 0) / 10) / PIPELINE_STEPS.length) * 100) : 0;
  const isComplete = isDone || overallProgress >= 100;

  return (
    <div className="bg-white  border border-slate-200 shadow-xl overflow-hidden flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Cpu size={13} className="text-slate-700" />
          <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-widest">Execution Pipeline</h3>
        </div>
        {isComplete && batch && (
          <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-700  border border-emerald-200 flex items-center gap-1"><Check size={9} />HITL Ready</span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {PIPELINE_STEPS.map((s, i) => {
          const Icon = s.icon;
          const isStepComplete = hasActivity && (i < currentStep || isComplete);
          const isStepActive = isRunning && !isComplete && i === currentStep;
          const isStepPaused = isPaused && !isComplete && i === currentStep;
          return (
            <div key={i} className={`relative  p-3 transition-all ${isStepActive ? 'bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-slate-400 shadow-md' : isStepPaused ? 'bg-blue-50 border-2 border-blue-300' : isStepComplete ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-200'}`}>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  {isStepComplete ? (
                    <div className="w-8 h-8  bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-md shadow-emerald-900/30"><Check size={14} className="text-white" strokeWidth={3} /></div>
                  ) : isStepActive ? (
                    <div className="relative w-8 h-8">
                      <MetallicSilverIcon icon={Icon} size={14} className="w-8 h-8" />
                      <div className="absolute inset-0  animate-ping bg-slate-400 opacity-30"></div>
                    </div>
                  ) : isStepPaused ? (
                    <div className="w-8 h-8  bg-blue-200 flex items-center justify-center border border-blue-400">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="rgb(30, 64, 175)"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                    </div>
                  ) : (
                    <div className="w-8 h-8  bg-slate-200 flex items-center justify-center border border-slate-300"><span className="text-[11px] font-bold text-slate-500">{i + 1}</span></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className={`text-xs font-bold ${isStepActive ? 'text-slate-900' : isStepPaused ? 'text-blue-900' : isStepComplete ? 'text-emerald-900' : 'text-slate-700'}`}>{s.name}</h4>
                    {isStepActive && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-800 text-slate-100  shadow-sm animate-pulse">RUNNING</span>}
                    {isStepPaused && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-700 text-white  shadow-sm">PAUSED</span>}
                  </div>
                  <div className={`text-[10px] mt-0.5 leading-snug ${isStepActive ? 'text-slate-700' : isStepPaused ? 'text-blue-800' : isStepComplete ? 'text-emerald-800' : 'text-slate-500'}`}>{s.desc}</div>
                  {(isStepActive || isStepPaused) && (
                    <div className="mt-2 h-1 bg-slate-200  overflow-hidden">
                      <div className={`h-full transition-all ${isStepPaused ? 'bg-gradient-to-r from-blue-500 to-blue-700' : 'bg-gradient-to-r from-slate-500 to-slate-700'}`} style={{ width: `${Math.min(100, ((job?.stepProgress ?? 0) / 10) * 100)}%` }}></div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
