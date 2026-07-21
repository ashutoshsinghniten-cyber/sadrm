import React, { useState } from 'react';
import { SlidersHorizontal, Cpu } from 'lucide-react';
import { PageHeader } from '../../components/shared/PageHeader.jsx';

export default function SettingsScreen() {
  const [tab, setTab] = useState('thresholds');
  const tabs = [
    {
      id: 'thresholds',
      label: 'Threshold Management',
      icon: SlidersHorizontal,
      title: 'Threshold Management',
      blurb: 'Confidence thresholds, NCV triggers, mismatch tolerances, and per-stage routing rules. Tune the values that decide whether a record auto-advances or routes to HITL review.'
    },
    {
      id: 'parallel',
      label: 'Parallel Processing',
      icon: Cpu,
      title: 'Parallel Processing',
      blurb: 'Concurrency controls for the extraction pipeline: number of parallel workers, batch size limits, queue priority weighting, and rate-limit handling for external AI providers.'
    }
  ];
  const active = tabs.find(t => t.id === tab) || tabs[0];
  const ActiveIcon = active.icon;
  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="p-4 md:p-6">
        <PageHeader title="Settings" eyebrow="ADMIN" description="Pipeline thresholds and parallel-processing configuration" />
        <div className="mt-4 flex items-center gap-1 border-b border-slate-200">
          {tabs.map(t => {
            const isActive = tab === t.id;
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`relative px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${isActive ? 'text-blue-900' : 'text-slate-500 hover:text-slate-700'}`}>
                <Icon size={13} />
                {t.label}
                {isActive && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-blue-900 " />}
              </button>
            );
          })}
        </div>
        <div className="mt-6 bg-white  border border-slate-200 shadow-sm">
          <div className="px-6 py-16 flex flex-col items-center text-center max-w-2xl mx-auto">
            <div className="w-14 h-14  bg-slate-100 border border-slate-200 flex items-center justify-center mb-4">
              <ActiveIcon size={22} className="text-slate-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">{active.title}</h3>
            <p className="text-sm text-slate-600 leading-relaxed mb-5">{active.blurb}</p>
            <span className="inline-block px-3 py-1  text-[10px] font-bold bg-amber-100 text-amber-800 ring-1 ring-amber-200 tracking-wider uppercase">Coming Soon</span>
          </div>
        </div>
      </div>
    </div>
  );
}
