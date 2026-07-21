import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search, X, Filter, ChevronDown, ChevronLeft, Sparkles, Bot, Send, Flag,
  Eye, AlertTriangle, Calendar, DollarSign, Building2, RefreshCw, Clock, UserCheck, Trash2
} from 'lucide-react';
import { PageHeader } from '../../components/shared/PageHeader.jsx';
import Button from '../../components/shared/Button.jsx';
import FlagBadge from '../../components/shared/FlagBadge.jsx';
import { GEO_HIERARCHY } from '../../constants/geoHierarchy.js';
import { AI_RUNTIME } from '../../constants/appConfig.js';
import { resolvePageCode } from '../../utils/batchUtils.js';
import { askDigiFind } from '../../utils/aiExtraction.js';
import { recordConversationTurn } from '../../utils/billing.js';
import { runAIQuery, formatRichText } from '../../utils/queryUtils.js';
import RecordDetailModal from './modals/RecordDetailModal.jsx';
import { dataClient } from '../../lib/axiosInstance.js';
import { pgToggleArchivedRecordFlag, pgDeleteArchivedRecord } from '../../utils/pgApi.js';

// Records per server API fetch. Kept at 100 so each page load never exceeds 100 rows in memory.
const SERVER_PAGE_SIZE = 100;

export default function RepositoryScreen({ archivedRecords = [], setArchivedRecords = () => {}, aiPanelRequest = false, clearAiPanelRequest = () => {}, browserMode = false, sseActive = false }) {
  const [query, setQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [amountMax, setAmountMax] = useState(10000);
  const [selectedBanks, setSelectedBanks] = useState([]);
  const [sortBy, setSortBy] = useState('recent');
  const [repPage, setRepPage] = useState(1);
  const [geoCountry, setGeoCountry] = useState('');
  const [geoState, setGeoState] = useState('');
  const [geoCounty, setGeoCounty] = useState('');
  const [geoArea, setGeoArea] = useState('');
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState('');
  const [aiFilterIds, setAiFilterIds] = useState(null);
  const [aiFilterLabel, setAiFilterLabel] = useState('');
  const [aiPending, setAiPending] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false); // "Flagged" filter tab
  const [flagTogglingId, setFlagTogglingId] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null); // { record } | null
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const toggleRecordFlag = async (record) => {
    setFlagTogglingId(record.id);
    const nextFlagged = !record.flagged;
    const reason = nextFlagged ? (window.prompt('Reason for flagging this record (optional):') || '') : '';
    const result = await pgToggleArchivedRecordFlag(record.id, nextFlagged, reason);
    if (result) {
      const patch = (r) => r.id === record.id ? { ...r, flagged: nextFlagged, flagReason: nextFlagged ? reason : null } : r;
      setArchivedRecords(prev => prev.map(patch));
      setServerRecords(prev => prev.map(patch));
      // If we're viewing the Flagged tab and just unflagged a record, drop it from view immediately.
      if (flaggedOnly && !nextFlagged) setServerRecords(prev => prev.filter(r => r.id !== record.id));
    }
    setFlagTogglingId(null);
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    setDeleteSubmitting(true);
    await pgDeleteArchivedRecord(deleteModal.record.id);
    setDeleteSubmitting(false);
    setDeleteModal(null);
    fetchServerPage(serverPage);
  };

  // Debounced query — avoids one API call per keystroke.
  const debounceRef = useRef(null);
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Stable string key for selectedBanks so it can be used as an effect dep.
  const selectedBanksStr = selectedBanks.join(',');

  // ── Server-side pagination state ──────────────────────────────────────────
  // serverPage is 0-indexed; each page fetches exactly SERVER_PAGE_SIZE records.
  const [serverRecords, setServerRecords] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverPage, setServerPage] = useState(0);
  const serverTotalPages = Math.max(1, Math.ceil(serverTotal / SERVER_PAGE_SIZE));

  // Build the API params object from the current search state.
  const buildParams = (page) => {
    const p = { limit: SERVER_PAGE_SIZE, offset: page * SERVER_PAGE_SIZE, sortBy };
    if (debouncedQ)        p.q    = debouncedQ;
    if (selectedBanksStr)  p.bank = selectedBanksStr;
    if (flaggedOnly)       p.flaggedOnly = true;
    return p;
  };

  // Manual refresh button — re-fetches the current page with current search params.
  const fetchServerPage = (page) => {
    setServerLoading(true);
    dataClient.get('/archived-records', { params: buildParams(page) })
      .then(data => {
        setServerRecords(Array.isArray(data?.records) ? data.records : []);
        setServerTotal(Number(data?.total || 0));
      })
      .catch(() => setServerRecords([]))
      .finally(() => setServerLoading(false));
  };

  // When search params change, reset to page 0.
  useEffect(() => {
    setServerPage(0);
    setRepPage(1);
  }, [debouncedQ, selectedBanksStr, sortBy, flaggedOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch whenever the effective search params or page changes.
  useEffect(() => {
    let cancelled = false;
    setServerLoading(true);
    dataClient.get('/archived-records', { params: buildParams(serverPage) })
      .then(data => {
        if (cancelled) return;
        setServerRecords(Array.isArray(data?.records) ? data.records : []);
        setServerTotal(Number(data?.total || 0));
      })
      .catch(() => { if (!cancelled) setServerRecords([]); })
      .finally(() => { if (!cancelled) setServerLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedQ, selectedBanksStr, sortBy, serverPage, flaggedOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh the current page every 30 seconds to pick up records from other sessions.
  // Suspended when SSE is connected — App.jsx pushes batch events in real-time, reducing
  // redundant polling. Resumes automatically if SSE drops (sseActive goes false).
  useEffect(() => {
    if (sseActive) return;
    const id = setInterval(() => fetchServerPage(serverPage), 30_000);
    return () => clearInterval(id);
  }, [debouncedQ, selectedBanksStr, sortBy, serverPage, sseActive, flaggedOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge: records archived in this session that haven't been persisted to DB yet
  // sit at the top of the view so the user sees them immediately.
  const serverIds = useMemo(() => new Set(serverRecords.map(r => r.id)), [serverRecords]);
  const freshLocalRecords = useMemo(
    () => archivedRecords.filter(r => r?.id && !serverIds.has(r.id)),
    [archivedRecords, serverIds]
  );
  // viewRecords replaces the old full archivedRecords array — bounded to SERVER_PAGE_SIZE + local additions.
  const viewRecords = useMemo(
    () => [...freshLocalRecords, ...serverRecords],
    [freshLocalRecords, serverRecords]
  );

  useEffect(() => { if (aiPanelRequest) { setAiPanelOpen(true); clearAiPanelRequest(); } }, [aiPanelRequest]);

  const submitAi = async (text) => {
    const q = (text ?? aiInput).trim();
    if (!q || aiPending) return;
    setAiInput('');
    recordConversationTurn();
    const placeholderId = `pending-${Date.now()}`;
    setAiMessages(m => [...m, { role: 'user', text: q }, { role: 'ai', pending: true, _id: placeholderId, text: 'Thinking…' }]);
    const historyForApi = [...aiMessages, { role: 'user', text: q }];
    if (AI_RUNTIME.isConfigured()) {
      setAiPending(true);
      try {
        const result = await askDigiFind(q, viewRecords, historyForApi);
        setAiMessages(m => m.map(msg => msg._id === placeholderId ? { role: 'ai', text: result.answer, recordIds: result.recordIds } : msg));
        if (result.recordIds && result.recordIds.length > 0) {
          const idSet = new Set(result.recordIds);
          const matched = viewRecords.filter(r => idSet.has(r.id));
          if (matched.length > 0) { setAiFilterIds(new Set(matched.map(r => r.id))); setAiFilterLabel(`${matched.length} record${matched.length === 1 ? '' : 's'} DigiFind found`); }
        }
      } catch {
        const fallback = runAIQuery(q, viewRecords);
        setAiMessages(m => m.map(msg => msg._id === placeholderId ? { role: 'ai', ...fallback, fallback: true } : msg));
        if (Array.isArray(fallback.records) && fallback.records.length > 0) { const ids = new Set(fallback.records.map(r => r.id).filter(Boolean)); if (ids.size > 0) { setAiFilterIds(ids); setAiFilterLabel(`${ids.size} record${ids.size === 1 ? '' : 's'} DigiFind found`); } }
      } finally { setAiPending(false); }
    } else {
      const fallback = runAIQuery(q, viewRecords);
      setAiMessages(m => m.map(msg => msg._id === placeholderId ? { role: 'ai', ...fallback, fallback: true } : msg));
      if (Array.isArray(fallback.records) && fallback.records.length > 0) { const ids = new Set(fallback.records.map(r => r.id).filter(Boolean)); if (ids.size > 0) { setAiFilterIds(ids); setAiFilterLabel(`${ids.size} record${ids.size === 1 ? '' : 's'} DigiFind found`); } }
    }
  };
  const clearAiFilter = () => { setAiFilterIds(null); setAiFilterLabel(''); };

  const normalizeBankName = (raw) => { if (!raw) return ''; return String(raw).split(',')[0].trim(); };
  const banks = [...new Set(viewRecords.map(c => normalizeBankName(c.fields?.bank)).filter(Boolean))].sort();
  const countryOptions = Object.keys(GEO_HIERARCHY);
  const stateOptions = geoCountry ? Object.keys(GEO_HIERARCHY[geoCountry] || {}) : [];
  const countyOptions = geoCountry && geoState ? Object.keys(GEO_HIERARCHY[geoCountry]?.[geoState] || {}) : [];
  const areaOptions = geoCountry && geoState && geoCounty ? (GEO_HIERARCHY[geoCountry]?.[geoState]?.[geoCounty] || []) : [];
  const onCountryChange = (v) => { setGeoCountry(v); setGeoState(''); setGeoCounty(''); setGeoArea(''); };
  const onStateChange = (v) => { setGeoState(v); setGeoCounty(''); setGeoArea(''); };
  const onCountyChange = (v) => { setGeoCounty(v); setGeoArea(''); };

  const STATE_ABBR = { 'Florida': 'FL', 'Massachusetts': 'MA', 'South Carolina': 'SC', 'Georgia': 'GA', 'New York': 'NY', 'California': 'CA', 'Texas': 'TX', 'Ontario': 'ON', 'British Columbia': 'BC' };
  const geoMatchTokens = useMemo(() => {
    if (!geoCountry) return null;
    if (geoArea) return [geoArea];
    if (geoCounty) return GEO_HIERARCHY[geoCountry]?.[geoState]?.[geoCounty] || [];
    if (geoState) { const counties = GEO_HIERARCHY[geoCountry]?.[geoState] || {}; return Object.values(counties).flat(); }
    const states = GEO_HIERARCHY[geoCountry] || {}; const cities = [];
    for (const sn of Object.keys(states)) { cities.push(sn); for (const cn of Object.keys(states[sn])) { for (const a of states[sn][cn]) cities.push(a); } }
    return cities;
  }, [geoCountry, geoState, geoCounty, geoArea]);

  // Server handles: text search (q), bank filter, and sort order.
  // Client-side only: AI filter highlight, amount range cap, and geo filter (complex hierarchy).
  const filtered = useMemo(() => viewRecords.filter(c => {
    if (aiFilterIds && !aiFilterIds.has(c.id)) return false;
    const fields = c.fields || {};
    const amt = parseFloat(fields.amount) || 0;
    if (amountMax < 10000 && amt > amountMax) return false;
    if (geoMatchTokens) {
      const addressText = (fields.donorAddress || '').toLowerCase();
      const stateAbbr = geoState ? STATE_ABBR[geoState] : null;
      const stateMatch = geoState && !geoCounty && !geoArea && stateAbbr ? new RegExp(`\\b${stateAbbr}\\b`, 'i').test(addressText) : false;
      const tokenMatch = geoMatchTokens.some(tok => addressText.includes(tok.toLowerCase()));
      if (!tokenMatch && !stateMatch) return false;
    }
    return true;
  }), [viewRecords, amountMax, geoMatchTokens, geoState, geoCounty, geoArea, aiFilterIds]);

  // Sort is handled by the server; preserve server-returned order here.
  const sorted = useMemo(() => filtered, [filtered]);

  const REP_PAGE_SIZE = 5;
  const repTotalPages = Math.max(1, Math.ceil(sorted.length / REP_PAGE_SIZE));
  const repPageClamped = Math.min(repPage, repTotalPages);
  const paginated = sorted.slice((repPageClamped - 1) * REP_PAGE_SIZE, repPageClamped * REP_PAGE_SIZE);
  const prevSortedLen = useRef(sorted.length);
  if (prevSortedLen.current !== sorted.length) { prevSortedLen.current = sorted.length; if (repPage !== 1) setRepPage(1); }
  const activeFilterCount = (selectedBanks.length > 0 ? 1 : 0) + (amountMax < 10000 ? 1 : 0) + (geoCountry ? 1 : 0) + (debouncedQ ? 1 : 0);
  const resetAll = () => { setQuery(''); setAmountMax(10000); setSelectedBanks([]); setGeoCountry(''); setGeoState(''); setGeoCounty(''); setGeoArea(''); clearAiFilter(); };

  return (
    <div className="flex-1 flex overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Main content */}
      <div className={`flex-1 overflow-y-auto transition-all duration-300 ${aiPanelOpen ? 'min-w-0' : ''}`}>
        <div className="p-4 md:p-6">
          <PageHeader title="Digital Repository" eyebrow="ARCHIVE" description="Search the Archive — Donation Records, Supporting Pages, and Extracted Metadata"
            actions={
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <div className={`w-1.5 h-1.5 rounded-full ${serverLoading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`}></div>
                  <span>{serverTotal.toLocaleString()} record{serverTotal !== 1 ? 's' : ''} in archive</span>
                </div>
                <button
                  onClick={() => fetchServerPage(serverPage)}
                  disabled={serverLoading}
                  title="Refresh current page"
                  className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-40 transition-colors"
                >
                  <RefreshCw size={13} className={serverLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            }
          />

          {/* Search bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-white  border border-slate-200 shadow-sm flex items-center gap-2 px-3">
              <Search size={15} className="text-slate-400 flex-shrink-0" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search donors, record numbers, addresses, amounts…" className="flex-1 px-2 py-2.5 text-sm focus:outline-none bg-transparent" />
              {query && <button onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-700 p-1"><X size={14} /></button>}
              <div className="w-px h-5 bg-slate-200"></div>
              <Button variant="primary" size="sm" icon={Search}>Search</Button>
            </div>
            <button onClick={() => setFiltersOpen(o => !o)} className={`relative px-3.5 py-2  text-xs font-semibold border transition-all flex items-center gap-1.5 ${filtersOpen ? 'bg-gradient-to-b from-blue-700 to-blue-900 border-blue-950 text-white shadow-md' : activeFilterCount > 0 ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-sm hover:bg-blue-100' : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50'}`}>
              <Filter size={13} />Filters
              {activeFilterCount > 0 && <span className={`text-[9px] font-bold px-1.5 py-0.5  ${filtersOpen ? 'bg-amber-400 text-blue-950' : 'bg-blue-800 text-white'}`}>{activeFilterCount}</span>}
              <ChevronDown size={12} className={`transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
            </button>
            <button onClick={() => setAiPanelOpen(o => !o)} className={`relative px-3.5 py-2  text-xs font-bold border transition-all flex items-center gap-2 ${aiPanelOpen ? 'bg-gradient-to-br from-violet-600 via-purple-600 to-amber-500 border-purple-700 text-white shadow-lg' : 'bg-gradient-to-b from-amber-400 to-amber-600 border-amber-700 text-amber-950 hover:from-amber-300 hover:to-amber-500 shadow-md'}`}>
              <Sparkles size={13} className={aiPanelOpen ? 'text-amber-200' : 'text-amber-950'} />
              <span>DigiStore AI</span>
              {!aiPanelOpen && aiMessages.length > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5  bg-amber-950 text-amber-300">{Math.floor(aiMessages.length / 2)}</span>}
              {aiPanelOpen ? <ChevronLeft size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>

          {/* All / Flagged tabs */}
          <div className="mt-3 flex items-center gap-1 border-b border-slate-200">
            <button
              onClick={() => setFlaggedOnly(false)}
              className={`px-3 py-2 text-xs font-bold border-b-2 transition-colors ${!flaggedOnly ? 'border-blue-700 text-slate-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              All Records
            </button>
            <button
              onClick={() => setFlaggedOnly(true)}
              className={`px-3 py-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${flaggedOnly ? 'border-amber-600 text-amber-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <Flag size={12} />
              Flagged
            </button>
          </div>

          {/* Filters panel */}
          {filtersOpen && (
            <div className="mt-3 bg-gradient-to-br from-blue-50 via-blue-50/70 to-white border border-blue-200/70  shadow-sm p-4 ring-1 ring-blue-100/50">
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 flex items-center gap-1 tracking-wider"><Calendar size={10} />Date Range</div>
                  <div className="space-y-1.5"><input type="date" className="w-full px-2 py-1 text-xs border border-slate-300  focus:outline-none focus:ring-1 focus:ring-blue-400" defaultValue="2025-09-01" /><input type="date" className="w-full px-2 py-1 text-xs border border-slate-300  focus:outline-none focus:ring-1 focus:ring-blue-400" defaultValue="2026-04-18" /></div>
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 flex items-center gap-1 tracking-wider"><DollarSign size={10} />Amount Range</div>
                  <div className="text-[11px] text-slate-600 mb-1.5">$0.00 — ${amountMax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <input type="range" min="0" max="10000" step="100" value={amountMax} onChange={(e) => setAmountMax(parseInt(e.target.value))} className="w-full accent-blue-800" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 flex items-center gap-1 tracking-wider"><Building2 size={10} />Bank</div>
                  {banks.length === 0 ? <div className="text-[11px] text-slate-400 italic px-1 py-1.5">No banks in archive yet</div> : (
                    <div className="max-h-24 overflow-y-auto space-y-0.5 pr-1">{banks.map(b => (<label key={b} className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer hover:bg-slate-50 px-1 py-0.5  min-w-0" title={b}><input type="checkbox" checked={selectedBanks.includes(b)} onChange={(e) => setSelectedBanks(s => e.target.checked ? [...s, b] : s.filter(x => x !== b))} className="accent-blue-800 flex-shrink-0" /><span className="truncate min-w-0">{b}</span></label>))}</div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 flex items-center gap-1 tracking-wider">Geography{geoCountry && <button onClick={() => onCountryChange('')} className="ml-auto text-[9px] font-semibold text-slate-500 hover:text-blue-800">clear</button>}</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[{ value: geoCountry, options: countryOptions, onChange: onCountryChange, placeholder: 'All countries' }, { value: geoState, options: stateOptions, onChange: onStateChange, placeholder: geoCountry ? 'All states' : 'State', disabled: !geoCountry }, { value: geoCounty, options: countyOptions, onChange: onCountyChange, placeholder: geoState ? 'All counties' : 'County', disabled: !geoState }, { value: geoArea, options: areaOptions, onChange: (v) => setGeoArea(v), placeholder: geoCounty ? 'All areas' : 'Area', disabled: !geoCounty }].map((s, i) => (
                      <select key={i} value={s.value} onChange={(e) => s.onChange(e.target.value)} disabled={s.disabled} className="min-w-0 px-2 py-1 text-xs border border-slate-300  bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-slate-50 disabled:cursor-not-allowed"><option value="">{s.placeholder}</option>{s.options.map(o => <option key={o} value={o}>{o}</option>)}</select>
                    ))}
                  </div>
                </div>
              </div>
              {(geoCountry || activeFilterCount > 0) && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1 flex-wrap text-[10px]">{geoCountry && <><span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mr-1">Active:</span><span className="px-1.5 py-0.5 bg-blue-100 text-blue-800  font-semibold">{geoCountry}</span>{geoState && <><span className="text-slate-400">›</span><span className="px-1.5 py-0.5 bg-blue-100 text-blue-800  font-semibold">{geoState}</span></>}{geoCounty && <><span className="text-slate-400">›</span><span className="px-1.5 py-0.5 bg-blue-100 text-blue-800  font-semibold">{geoCounty}</span></>}{geoArea && <><span className="text-slate-400">›</span><span className="px-1.5 py-0.5 bg-blue-100 text-blue-800  font-semibold">{geoArea}</span></>}</>}</div>
                  <button onClick={resetAll} className="text-[10px] text-blue-800 hover:text-blue-950 font-semibold flex items-center gap-1"><X size={10} />Reset all filters</button>
                </div>
              )}
            </div>
          )}

          {/* AI filter chip */}
          {aiFilterIds && (
            <div className="mt-4 flex items-center justify-between gap-2 px-3 py-2  bg-gradient-to-r from-amber-50 via-amber-50/70 to-white border border-amber-300 shadow-sm">
              <div className="flex items-center gap-2 min-w-0"><Sparkles size={14} className="text-amber-600 flex-shrink-0" /><span className="text-[11px] text-slate-700">Filtered by DigiFind · <span className="font-bold text-slate-800">{aiFilterLabel}</span></span></div>
              <button onClick={clearAiFilter} className="text-[10px] font-bold text-amber-800 hover:text-amber-900 px-2 py-1  hover:bg-amber-100 transition-colors flex items-center gap-1 flex-shrink-0"><X size={11} /> Clear</button>
            </div>
          )}

          {/* Results header */}
          <div className="mt-5 flex items-center justify-between">
            <div className="text-xs text-slate-600">
              {debouncedQ || selectedBanksStr
                ? <><span className="font-black text-slate-800 text-base">{serverTotal.toLocaleString()}</span> matching records</>
                : <><span className="font-black text-slate-800 text-base">{serverTotal.toLocaleString()}</span> records in archive</>
              }
              {sorted.length < serverTotal && sorted.length > 0 && (
                <span className="ml-2 text-slate-400">· {sorted.length} on this page</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Sort:</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="border border-slate-300  px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400">
                <option value="recent">Most recent</option><option value="amount-desc">Amount high → low</option><option value="amount-asc">Amount low → high</option><option value="donor-asc">Donor A-Z</option>
              </select>
            </div>
          </div>

          {/* Record cards */}
          <div className="mt-3 space-y-2">
            {paginated.map(c => {
              const fields = c.fields || {};
              const pages = c.pages || [];
              const primaryId = fields.chequeNo || c.recordId || c.id;
              const primaryIdLabel = c.paymentMethod === 'Cheque' ? 'Check #' : 'Record #';
              return (
                <div key={c.id} className="group bg-white border border-slate-200  p-4 flex items-center gap-4 hover:border-blue-400 hover:shadow-md transition-all shadow-sm">
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 text-xs min-w-0">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">{primaryIdLabel}</div>
                      <div className="text-blue-800 font-black text-base group-hover:text-blue-950">{primaryId}</div>
                      <div className="text-[10px] text-slate-500 mt-1.5">Donor</div>
                      <div className="font-semibold text-slate-800 truncate">{fields.donorName || '—'}</div>
                    </div>
                    <div><div className="text-[10px] text-slate-400 uppercase tracking-wider">Date</div><div className="text-slate-800">{fields.date || '—'}</div><div className="text-[10px] text-slate-500 mt-1.5">{c.paymentMethod === 'Cheque' ? 'Bank' : 'Payment Method'}</div><div className="text-slate-700 text-[11px] truncate">{c.paymentMethod === 'Cheque' ? (fields.bank || '—') : (c.paymentMethod === 'CreditCard' ? `Credit Card${fields.cardLast4 ? ` · •••• ${fields.cardLast4}` : ''}` : c.paymentMethod)}</div></div>
                    <div><div className="text-[10px] text-slate-400 uppercase tracking-wider">Amount</div><div className="text-slate-900 font-black text-lg tracking-tight">${(parseFloat(fields.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div><div className="text-[10px] text-slate-500 mt-1">Pages</div><div className="text-slate-700 text-[11px]">{pages.map(p => resolvePageCode(p) || '?').join(', ') || '—'}</div></div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Donor Address</div>
                      <div className="text-slate-700 text-[11px] leading-tight truncate">{fields.donorAddress || '—'}</div>
                      {(fields.actualDonor || c.paymentMethod === 'CreditCard') && (
                        <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                          {fields.actualDonor && <span className="inline-block px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-bold ring-1 ring-amber-200 whitespace-nowrap">DAF</span>}
                          {c.paymentMethod === 'CreditCard' && <span className="inline-block px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[9px] font-bold ring-1 ring-blue-200">CC</span>}
                        </div>
                      )}
                      {/* Modification audit trail */}
                      {c.lastModifiedAt && (
                        <div className="mt-1.5 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1 text-[9px] text-slate-500">
                            <Clock size={9} className="flex-shrink-0 text-slate-400" />
                            <span title={c.lastModifiedAt}>
                              {c.lastModifiedAt !== c.archivedAt
                                ? `Modified ${new Date(c.lastModifiedAt).toLocaleDateString()}`
                                : `Archived ${new Date(c.archivedAt).toLocaleDateString()}`}
                            </span>
                          </div>
                          {c.lastModifiedBy && (
                            <div className="flex items-center gap-1 text-[9px] text-slate-500">
                              <UserCheck size={9} className="flex-shrink-0 text-slate-400" />
                              <span className="truncate" title={c.lastModifiedBy}>{c.lastModifiedBy}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex flex-col gap-1">
                    <button onClick={() => setSelectedRecord({ record: c, focus: pages[0]?.code || 'CF' })} className="px-2.5 py-1 text-[10px] font-bold  border border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 hover:border-blue-500 transition-colors flex items-center gap-1 whitespace-nowrap" title="Open Record Detail"><Eye size={10} /> View Record</button>
                    <FlagBadge
                      flagged={!!c.flagged}
                      reason={c.flagReason}
                      size="md"
                      onToggle={() => toggleRecordFlag(c)}
                      className={`justify-center w-full !py-1 ${flagTogglingId === c.id ? 'opacity-50 pointer-events-none' : ''}`}
                    />
                    <button onClick={() => setDeleteModal({ record: c })} className="px-2.5 py-1 text-[10px] font-bold  border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-400 transition-colors flex items-center gap-1 whitespace-nowrap" title="Permanently delete this record"><Trash2 size={10} /> Delete</button>
                  </div>
                </div>
              );
            })}
            {paginated.length === 0 && (
              <div className="py-16 text-center text-slate-400">
                {serverLoading
                  ? <div className="flex flex-col items-center gap-2"><RefreshCw size={28} className="animate-spin" /><div className="text-sm">Loading records…</div></div>
                  : <><Search size={28} className="mx-auto mb-2" /><div className="text-sm">{serverTotal === 0 ? 'No archived records yet' : 'No records match your filters'}</div><div className="text-[11px] mt-1">{serverTotal === 0 ? 'Records appear here after QC approval and archiving' : 'Try clearing some filters'}</div></>
                }
              </div>
            )}
          </div>

          {/* Client-side pagination (within the current server page of 100 records) */}
          {repTotalPages > 1 && (
            <div className="flex items-center justify-between pb-3 pt-3 border-t border-slate-100">
              <div className="text-xs text-slate-500">Page <span className="font-bold text-slate-700">{repPageClamped}</span> of <span className="font-bold text-slate-700">{repTotalPages}</span> · Showing {((repPageClamped - 1) * REP_PAGE_SIZE) + 1}–{Math.min(repPageClamped * REP_PAGE_SIZE, sorted.length)} of {sorted.length}</div>
              <div className="flex items-center gap-1">
                <button onClick={() => setRepPage(1)} disabled={repPageClamped === 1} className="px-2 py-1 text-xs border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">«</button>
                <button onClick={() => setRepPage(p => Math.max(1, p - 1))} disabled={repPageClamped === 1} className="px-2.5 py-1 text-xs border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Prev</button>
                {Array.from({ length: Math.min(5, repTotalPages) }, (_, i) => { const pg = i + 1; return <button key={pg} onClick={() => setRepPage(pg)} className={`px-2.5 py-1 text-xs border font-semibold ${pg === repPageClamped ? 'bg-blue-800 border-blue-900 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>{pg}</button>; })}
                <button onClick={() => setRepPage(p => Math.min(repTotalPages, p + 1))} disabled={repPageClamped === repTotalPages} className="px-2.5 py-1 text-xs border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
                <button onClick={() => setRepPage(repTotalPages)} disabled={repPageClamped === repTotalPages} className="px-2 py-1 text-xs border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">»</button>
              </div>
            </div>
          )}

          {/* Server-page navigation — load the previous/next block of 100 records from DB */}
          {serverTotalPages > 1 && (
            <div className="flex items-center justify-between pb-6 pt-2 border-t border-dashed border-slate-200">
              <div className="text-[11px] text-slate-400">
                Showing records {serverPage * SERVER_PAGE_SIZE + 1}–{Math.min((serverPage + 1) * SERVER_PAGE_SIZE, serverTotal)} of{' '}
                <span className="font-semibold text-slate-600">{serverTotal.toLocaleString()}</span> in the archive
                {serverLoading && <span className="ml-2 text-amber-600 animate-pulse">· loading…</span>}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { setServerPage(p => Math.max(0, p - 1)); setRepPage(1); }}
                  disabled={serverPage === 0 || serverLoading}
                  className="px-3 py-1.5 text-[11px] font-semibold border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Newer
                </button>
                <span className="text-[11px] text-slate-500 px-1">
                  {serverPage + 1} / {serverTotalPages}
                </span>
                <button
                  onClick={() => { setServerPage(p => Math.min(serverTotalPages - 1, p + 1)); setRepPage(1); }}
                  disabled={serverPage >= serverTotalPages - 1 || serverLoading}
                  className="px-3 py-1.5 text-[11px] font-semibold border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Older →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* DigiFind panel */}
      <div className="bg-white border-l border-slate-200 flex flex-col flex-shrink-0 overflow-hidden transition-all duration-300" style={{ width: aiPanelOpen ? 'clamp(420px, 40vw, 720px)' : 0, borderLeftWidth: aiPanelOpen ? undefined : 0 }}>
        {aiPanelOpen && (
          <>
            <div className="flex-shrink-0 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white px-4 py-3 relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500 opacity-15  blur-3xl"></div>
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8  bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-md shadow-amber-900/40 border border-amber-700"><Sparkles size={14} className="text-slate-900" /></div>
                  <div><div className="text-sm font-bold flex items-center gap-1.5">DigiStore AI<span className="text-[9px] font-bold px-1.5 py-0.5  bg-amber-400 text-amber-950">BETA</span></div><div className="text-[10px] text-slate-400">Conversational search across the archive</div></div>
                </div>
                <div className="flex items-center gap-1">
                  {aiMessages.length > 0 && <button onClick={() => setAiMessages([])} className="p-1.5  text-slate-300 hover:text-white hover:bg-white/10 transition" title="Clear conversation"><X size={13} /></button>}
                  <button onClick={() => setAiPanelOpen(false)} className="p-1.5  text-slate-300 hover:text-white hover:bg-white/10 transition"><ChevronLeft size={14} /></button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {aiMessages.length === 0 ? (
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Try asking</div>
                  <div className="space-y-1.5">
                    {['Summarize the archive', 'Which records are Donor Advised Fund grants?', 'Break down records by bank', 'Total amount from Georgia donors', 'Largest gifts over $500'].map(s => (
                      <button key={s} onClick={() => submitAi(s)} className="group w-full text-left px-3 py-2 bg-white border border-slate-200  hover:border-amber-400 hover:shadow-sm hover:bg-amber-50/30 transition-all">
                        <div className="flex items-center gap-2"><Sparkles size={11} className="text-amber-500 flex-shrink-0 group-hover:text-amber-600" /><span className="text-xs text-slate-700 group-hover:text-slate-900">{s}</span></div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {aiMessages.map((m, i) => m.role === 'user' ? (
                    <div key={i} className="flex justify-end"><div className="max-w-[85%] px-3 py-2 bg-gradient-to-b from-blue-800 to-blue-950 text-white   shadow-sm text-xs leading-relaxed">{m.text}</div></div>
                  ) : (
                    <div key={i} className="flex gap-2">
                      <div className="w-7 h-7  bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center flex-shrink-0 shadow-sm border border-amber-700"><Sparkles size={11} className="text-slate-900" /></div>
                      <div className="flex-1 bg-white border border-slate-200   shadow-sm p-3 text-xs min-w-0">
                        {m.pending ? (
                          <div className="flex items-center gap-2 text-slate-500"><div className="flex gap-1"><span className="w-1.5 h-1.5  bg-amber-400 animate-pulse"></span><span className="w-1.5 h-1.5  bg-amber-500 animate-pulse" style={{ animationDelay: '150ms' }}></span><span className="w-1.5 h-1.5  bg-amber-600 animate-pulse" style={{ animationDelay: '300ms' }}></span></div><span className="text-[11px]">Thinking…</span></div>
                        ) : (
                          <div className="text-slate-800 leading-relaxed">{typeof m.text === 'string' ? formatRichText(m.text) : m.text}</div>
                        )}
                        {m.records && m.records.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {m.records.map(r => {
                              const rf = r.fields || {};
                              return (
                                <button key={r.id} onClick={() => setSelectedRecord({ record: r, focus: (r.pages || [])[0]?.code || 'CF' })} className="w-full flex items-center gap-2 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300  p-2 text-left transition group">
                                  <div className="w-1 self-stretch bg-gradient-to-b from-blue-700 to-blue-900 "></div>
                                  <div className="flex-1 min-w-0"><div className="font-bold text-slate-800 truncate text-[11px]">{rf.donorName || '—'}</div><div className="text-slate-500 text-[10px] truncate">{r.paymentMethod === 'Cheque' ? `Check #${rf.chequeNo || '—'}` : `Record · ${rf.date || '—'}`}</div></div>
                                  <div className="font-black text-slate-900 text-[12px]">${(parseFloat(rf.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                  <Eye size={10} className="text-slate-300 group-hover:text-blue-600 flex-shrink-0" />
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-shrink-0 border-t border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-300  focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 transition p-1.5">
                <Sparkles size={12} className="text-amber-500 ml-1.5 flex-shrink-0" />
                <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitAi()} placeholder="Ask about donors, amounts, mismatches…" className="flex-1 px-1 py-1 text-xs focus:outline-none bg-transparent min-w-0" />
                <Button variant="primary" size="sm" icon={Send} onClick={() => submitAi()}>Send</Button>
              </div>
              <div className="mt-1.5 text-[9px] text-slate-400 text-center">Answers are cited against source documents</div>
            </div>
          </>
        )}
      </div>

      {selectedRecord && (
        <RecordDetailModal
          record={selectedRecord.record}
          focus={selectedRecord.focus}
          onClose={() => setSelectedRecord(null)}
          onToggleFlag={toggleRecordFlag}
          browserMode={browserMode}
        />
      )}

      {deleteModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => !deleteSubmitting && setDeleteModal(null)}>
          <div className="bg-white shadow-2xl max-w-sm w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-red-100 flex items-center gap-2 bg-red-50">
              <Trash2 size={15} className="text-red-600" />
              <h3 className="text-sm font-bold text-red-900">Delete Archived Record</h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-[11px] text-slate-700 leading-relaxed bg-red-50 border border-red-200 px-3 py-2.5">
                This will <strong>permanently delete</strong> record <strong>{deleteModal.record.recordId || deleteModal.record.id}</strong> from the archive. This action cannot be undone.
              </div>
              <div className="text-[10px] text-slate-500">
                Donor: {deleteModal.record.fields?.donorName || '—'} · Amount: ${(parseFloat(deleteModal.record.fields?.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setDeleteModal(null)} disabled={deleteSubmitting}>Cancel</Button>
              <button
                onClick={handleDelete}
                disabled={deleteSubmitting}
                className="px-3 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white border border-red-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={11} />
                {deleteSubmitting ? 'Deleting…' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
