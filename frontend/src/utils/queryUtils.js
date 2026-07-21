import React from 'react';

// Local pattern-matcher fallback for when the AI provider isn't configured.
// Returns { text, records?, bankTable?, moreCount? }
export function runAIQuery(q, archivedRecords = []) {
  const data = archivedRecords;
  if (data.length === 0) {
    return { text: "The archive is empty. Once donation records have been processed through HITL Review and QC Approval, they'll appear here and you can query them conversationally." };
  }
  const lower = q.toLowerCase();
  const filters = [];
  let records = data;
  const fieldsOf = (c) => c.fields || {};
  const amtOf = (c) => parseFloat(fieldsOf(c).amount) || 0;

  if (/credit\s*card|\bcc\b/i.test(q)) { records = records.filter(c => c.paymentMethod === 'CreditCard'); filters.push('paid by credit card'); }
  if (/\bcheque\b|\bcheck\b/i.test(q) && !/largest|smallest|top/i.test(q)) { records = records.filter(c => c.paymentMethod === 'Cheque'); filters.push('paid by check'); }

  const allBankNames = [...new Set(data.map(c => fieldsOf(c).bank).filter(Boolean))];
  const namedBank = allBankNames.find(b => { const compact = b.toLowerCase().replace(/,.*/, '').replace(/\bn\.?a\.?\b/g, '').replace(/^the\s+/, '').trim(); return compact.length > 3 && lower.includes(compact); });
  if (namedBank) { const matched = data.filter(c => fieldsOf(c).bank === namedBank); const total = matched.reduce((s, c) => s + amtOf(c), 0); return { text: `Found ${matched.length} record${matched.length === 1 ? '' : 's'} from **${namedBank}** totaling **$${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**.`, records: matched }; }

  if (/\bbank\b|by\s+bank|which\s+bank/i.test(q)) { const groups = {}; data.forEach(c => { const b = fieldsOf(c).bank || 'Unknown'; groups[b] = groups[b] || { count: 0, total: 0 }; groups[b].count++; groups[b].total += amtOf(c); }); const table = Object.entries(groups).map(([bank, stats]) => ({ bank, count: stats.count, total: stats.total })).sort((a, b) => b.total - a.total); return { text: `Breakdown by bank across ${data.length} archived records:`, bankTable: table }; }

  if (/largest|biggest|highest|top|max/i.test(q)) { return { text: `Top 3 largest donation records:`, records: [...data].sort((a, b) => amtOf(b) - amtOf(a)).slice(0, 3) }; }
  if (/smallest|lowest|bottom|min/i.test(q)) { return { text: `3 smallest donation records:`, records: [...data].sort((a, b) => amtOf(a) - amtOf(b)).slice(0, 3) }; }

  if (/summarize|summary|overview/i.test(q)) {
    const total = data.reduce((s, c) => s + amtOf(c), 0);
    const avg = data.length > 0 ? total / data.length : 0;
    const pmCounts = data.reduce((g, c) => ({ ...g, [c.paymentMethod]: (g[c.paymentMethod] || 0) + 1 }), {});
    const pmBreakdown = Object.entries(pmCounts).map(([k, v]) => `${v} ${k}`).join(', ');
    const dafCount = data.filter(c => fieldsOf(c).actualDonor).length;
    return { text: `**Archive overview** — ${data.length} donation records totaling **$${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**, average gift $${avg.toFixed(2)}. Breakdown: ${pmBreakdown}. ${dafCount} DAF/grant sources.`, records: data.slice(0, 3) };
  }

  const stateKeys = [{ rx: /\b(ga|georgia)\b/i, name: 'Georgia' }, { rx: /\b(fl|florida)\b/i, name: 'Florida' }, { rx: /\b(ma|massachusetts)\b/i, name: 'Massachusetts' }, { rx: /\b(sc|south carolina)\b/i, name: 'South Carolina' }];
  for (const s of stateKeys) { if (s.rx.test(q)) { records = records.filter(c => s.rx.test(fieldsOf(c).donorAddress || '')); filters.push(`from ${s.name}`); break; } }

  if (/\bdaf\b|advised\s+fund|charitable\s+(?:gift\s+)?fund|grant|donor\s+advised/i.test(q)) { records = records.filter(c => fieldsOf(c).actualDonor || fieldsOf(c).fundName || fieldsOf(c).grantId); filters.push('DAF/grant-sourced'); }

  const overMatch = q.match(/(?:over|more than|above|greater than|>)\s*\$?([\d,]+)/i);
  const underMatch = q.match(/(?:under|less than|below|<)\s*\$?([\d,]+)/i);
  if (overMatch) { const amt = parseFloat(overMatch[1].replace(/,/g, '')); records = records.filter(c => amtOf(c) > amt); filters.push(`over $${amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`); }
  if (underMatch) { const amt = parseFloat(underMatch[1].replace(/,/g, '')); records = records.filter(c => amtOf(c) < amt); filters.push(`under $${amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`); }

  if (/total|sum|how much|amount/i.test(q) || filters.length > 0) {
    const totalAmt = records.reduce((s, c) => s + amtOf(c), 0);
    const filterText = filters.length > 0 ? ` ${filters.join(' and ')}` : '';
    return { text: records.length === 0 ? `No records match "${filters.join(' and ') || q}" in the archive.` : `**${records.length} record${records.length === 1 ? '' : 's'}**${filterText} total **$${totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**.`, records: records.slice(0, 5), moreCount: records.length > 5 ? records.length - 5 : 0 };
  }

  const terms = lower.split(/\s+/).filter(w => w.length > 2);
  if (terms.length > 0) {
    const scored = data.map(c => { const f = fieldsOf(c); const hay = (f.donorName + ' ' + f.donorAddress + ' ' + f.bank + ' ' + f.chequeNo + ' ' + f.actualDonor + ' ' + f.fundName + ' ' + f.invoiceNo + ' ' + c.recordId).toLowerCase(); return { c, score: terms.filter(t => hay.includes(t)).length }; }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
    if (scored.length > 0) { const matched = scored.map(x => x.c).slice(0, 5); const total = matched.reduce((s, c) => s + amtOf(c), 0); return { text: `Found ${scored.length} matching record${scored.length === 1 ? '' : 's'}. Total: $${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`, records: matched }; }
  }

  return { text: "I can search the archive of donation records. Try: *total*, *DAF grants*, *by bank*, *largest donations*, *credit card donations*, *from Georgia*, *under $500*, or a donor name." };
}

// Render **bold** markdown in a string as React elements
export function formatRichText(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return React.createElement('strong', { key: i, className: 'font-bold text-slate-900' }, p.slice(2, -2));
    }
    return React.createElement('span', { key: i }, p);
  });
}
