import React from 'react';
import { BILLING_PRICE_PER_M_INPUT_USD, BILLING_PRICE_PER_M_OUTPUT_USD, BILLING_MULTIPLIER } from '../constants/appConfig.js';

// =============================================================================
// SESSION BILLING TRACKER (v3.13.27)
// =============================================================================
export const SESSION_BILLING = {
  inputTokens: 0,
  outputTokens: 0,
  apiCalls: 0,
  recordsExtracted: 0,
  pagesProcessed: 0,
  conversations: 0,
  callLog: [], // newest-first; capped at 50
  listeners: new Set(),
  tick: 0
};

export const notifyBillingListeners = () => {
  SESSION_BILLING.tick += 1;
  SESSION_BILLING.listeners.forEach(fn => {
    try { fn(SESSION_BILLING.tick); } catch {}
  });
};

// Called from inside extractDonationRecord on a successful response.
// `entry` shape: { inputTokens, outputTokens, durationMs, recordTag, pages }
export const recordApiCall = (entry) => {
  SESSION_BILLING.inputTokens += entry.inputTokens || 0;
  SESSION_BILLING.outputTokens += entry.outputTokens || 0;
  SESSION_BILLING.apiCalls += 1;
  SESSION_BILLING.callLog.unshift({
    at: new Date().toISOString(),
    inputTokens: entry.inputTokens || 0,
    outputTokens: entry.outputTokens || 0,
    durationMs: entry.durationMs || 0,
    recordTag: entry.recordTag || '',
    pages: entry.pages || 0
  });
  if (SESSION_BILLING.callLog.length > 50) SESSION_BILLING.callLog.length = 50;
  notifyBillingListeners();
};

export const recordRecordExtracted = (pageCount = 0) => {
  SESSION_BILLING.recordsExtracted += 1;
  SESSION_BILLING.pagesProcessed += pageCount;
  notifyBillingListeners();
};

export const recordConversationTurn = () => {
  SESSION_BILLING.conversations += 1;
  notifyBillingListeners();
};

// React hook — subscribe to billing updates and force re-render on each tick.
export const useSessionBilling = () => {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const fn = (t) => setTick(t);
    SESSION_BILLING.listeners.add(fn);
    return () => { SESSION_BILLING.listeners.delete(fn); };
  }, []);
  const totalTokens = SESSION_BILLING.inputTokens + SESSION_BILLING.outputTokens;
  const rawInputUsd = (SESSION_BILLING.inputTokens / 1_000_000) * BILLING_PRICE_PER_M_INPUT_USD;
  const rawOutputUsd = (SESSION_BILLING.outputTokens / 1_000_000) * BILLING_PRICE_PER_M_OUTPUT_USD;
  const rawTotalUsd = rawInputUsd + rawOutputUsd;
  return {
    inputTokens: SESSION_BILLING.inputTokens,
    outputTokens: SESSION_BILLING.outputTokens,
    totalTokens,
    apiCalls: SESSION_BILLING.apiCalls,
    recordsExtracted: SESSION_BILLING.recordsExtracted,
    pagesProcessed: SESSION_BILLING.pagesProcessed,
    conversations: SESSION_BILLING.conversations,
    callLog: SESSION_BILLING.callLog,
    rawInputUsd,
    rawOutputUsd,
    rawTotalUsd,
    displayInputUsd: rawInputUsd * BILLING_MULTIPLIER,
    displayOutputUsd: rawOutputUsd * BILLING_MULTIPLIER,
    displayTotalUsd: rawTotalUsd * BILLING_MULTIPLIER,
    multiplier: BILLING_MULTIPLIER
  };
};
