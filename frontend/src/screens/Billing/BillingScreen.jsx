import React, { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';
import { PageHeader } from '../../components/shared/PageHeader.jsx';
import { useSessionBilling } from '../../utils/billing.js';
import { BILLING_PRICE_PER_M_INPUT_USD, BILLING_MULTIPLIER } from '../../constants/appConfig.js';

const SessionBillingPanel = () => {
  const billing = useSessionBilling();
  const fmtUSD = (n) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
  const fmtUSDcompact = (n) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtTokens = (n) => n.toLocaleString();
  const hasData = billing.apiCalls > 0 || billing.conversations > 0 || billing.recordsExtracted > 0;

  return (
    <div>
      <div className="flex items-center justify-end gap-3 mb-4 flex-wrap">
        {hasData && (
          <div className="flex items-baseline gap-1.5 px-3 py-1.5  bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-md shadow-violet-900/20">
            <span className="text-[10px] uppercase tracking-wider opacity-80">Session cost</span>
            <span className="text-base font-black tabular-nums">{fmtUSDcompact(billing.displayTotalUsd)}</span>
          </div>
        )}
      </div>
      {!hasData && (
        <div className=" border border-slate-200 bg-white p-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12  bg-slate-100 mb-3">
            <Activity size={20} className="text-slate-400" />
          </div>
          <div className="text-sm font-bold text-slate-700">No billable activity yet this session</div>
          <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
            Run an AI Extraction batch or have a DigiFind conversation to start populating the billing telemetry. Numbers reset on browser refresh.
          </p>
        </div>
      )}
      {hasData && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
            <div className=" border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-white p-2.5 shadow-sm">
              <div className="text-[10px] font-bold text-violet-700 uppercase tracking-wider mb-0.5">Total Cost</div>
              <div className="text-xl font-black text-slate-900 tabular-nums leading-tight">{fmtUSDcompact(billing.displayTotalUsd)}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{fmtTokens(billing.totalTokens)} tokens · {billing.apiCalls} call{billing.apiCalls === 1 ? '' : 's'}</div>
            </div>
            <div className=" border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-white p-2.5 shadow-sm">
              <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mb-0.5">Input cost</div>
              <div className="text-xl font-black text-slate-900 tabular-nums leading-tight">{fmtUSDcompact(billing.displayInputUsd)}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{fmtTokens(billing.inputTokens)} tokens</div>
            </div>
            <div className=" border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white p-2.5 shadow-sm">
              <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-0.5">Output cost</div>
              <div className="text-xl font-black text-slate-900 tabular-nums leading-tight">{fmtUSDcompact(billing.displayOutputUsd)}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{fmtTokens(billing.outputTokens)} tokens</div>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2 mb-3">
            {[
              { label: 'API calls', value: billing.apiCalls },
              { label: 'Records', value: billing.recordsExtracted },
              { label: 'Pages', value: billing.pagesProcessed },
              { label: 'Conversations', value: billing.conversations },
              { label: 'Total tokens', value: billing.totalTokens }
            ].map(item => (
              <div key={item.label} className=" border border-slate-200 bg-white px-2.5 py-2">
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{item.label}</div>
                <div className="text-base font-black text-slate-800 tabular-nums leading-tight">{fmtTokens(item.value)}</div>
              </div>
            ))}
          </div>
          {billing.callLog.length > 0 && (
            <div className=" border border-slate-200 bg-white overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Recent API calls</div>
                <div className="text-[10px] text-slate-500">Showing {billing.callLog.length} most recent · capped at 50</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-wider">
                      <th className="text-left p-2.5 font-semibold">Time</th>
                      <th className="text-left p-2.5 font-semibold">Source page</th>
                      <th className="text-right p-2.5 font-semibold">Pages</th>
                      <th className="text-right p-2.5 font-semibold">Input tokens</th>
                      <th className="text-right p-2.5 font-semibold">Output tokens</th>
                      <th className="text-right p-2.5 font-semibold">Duration</th>
                      <th className="text-right p-2.5 font-semibold">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billing.callLog.map((entry, idx) => {
                      const rawCost = (entry.inputTokens / 1_000_000) * BILLING_PRICE_PER_M_INPUT_USD
                                    + (entry.outputTokens / 1_000_000) * 15.0;
                      const displayCost = rawCost * BILLING_MULTIPLIER;
                      const t = new Date(entry.at);
                      const timeStr = t.toLocaleTimeString('en-US', { hour12: false });
                      return (
                        <tr key={`${entry.at}-${idx}`} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                          <td className="p-2.5 text-slate-600 font-mono tabular-nums whitespace-nowrap">{timeStr}</td>
                          <td className="p-2.5 text-slate-600 font-mono truncate max-w-[200px]" title={entry.recordTag}>{entry.recordTag || '—'}</td>
                          <td className="p-2.5 text-right text-slate-700 tabular-nums">{entry.pages}</td>
                          <td className="p-2.5 text-right text-slate-700 tabular-nums">{entry.inputTokens.toLocaleString()}</td>
                          <td className="p-2.5 text-right text-slate-700 tabular-nums">{entry.outputTokens.toLocaleString()}</td>
                          <td className="p-2.5 text-right text-slate-500 tabular-nums">{entry.durationMs}ms</td>
                          <td className="p-2.5 text-right font-bold text-violet-700 tabular-nums">{fmtUSD(displayCost)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default function BillingScreen() {
  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="p-4 md:p-6">
        <PageHeader
          title="Session Billing"
          eyebrow="ADMIN"
          description="Token usage and cost telemetry for the current session"
        />
        <SessionBillingPanel />
      </div>
    </div>
  );
}
