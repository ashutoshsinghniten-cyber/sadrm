import React, { useState, useMemo, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer
} from 'recharts';
import {
  User, Calendar, DollarSign, Inbox, AlertCircle, Building2, Activity, X,
  HardDrive, TrendingUp, SlidersHorizontal, FileJson, FileSpreadsheet, Scissors,
  ClipboardCheck, BarChart3, ArchiveIcon as Archive, ExternalLink, RotateCcw
} from 'lucide-react';
import { PageHeader } from '../../components/shared/PageHeader.jsx';
import Button from '../../components/shared/Button.jsx';
import { computeBucketUsageBytes, formatBytes } from '../../utils/storageCompute.js';
import { loadXlsx } from '../../utils/batchUtils.js';
import { downloadBlob } from '../../utils/extractionUtils.js';
import { getQcReason, getQcDestination, getQcHistory } from '../../utils/qcUtils.js';
import RejectedRecordsModal from '../Repository/modals/RejectedRecordsModal.jsx';
// Reuse MetricCard shape from Dashboard (inline here to avoid circular import)
const MetricCard = ({ label, value, sub, icon: Icon, tone, trend }) => {
  const tones = { navy: { grad: 'from-blue-700 to-blue-900', shadow: 'shadow-blue-900/25' }, amber: { grad: 'from-amber-500 to-amber-700', shadow: 'shadow-amber-900/20' }, emerald: { grad: 'from-emerald-600 to-emerald-800', shadow: 'shadow-emerald-900/20' }, slate: { grad: 'from-slate-700 to-slate-900', shadow: 'shadow-slate-900/25' }, red: { grad: 'from-red-700 to-red-900', shadow: 'shadow-red-900/25' } };
  const t = tones[tone] || tones.slate;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm overflow-hidden relative">
      <div className={`absolute -top-8 -right-8 w-32 h-32 bg-gradient-to-br ${t.grad} opacity-5 blur-2xl`}></div>
      <div className="relative">
        <div className="flex items-start justify-between">
          <div className={`w-10 h-10 bg-gradient-to-br ${t.grad} flex items-center justify-center shadow-md ${t.shadow}`}><Icon size={18} className="text-white" /></div>
          {trend != null && <div className={`flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 ${trend > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{trend > 0 ? '↑' : '↓'}{Math.abs(trend)}%</div>}
        </div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mt-3">{label}</div>
        <div className="text-3xl font-black text-slate-800 mt-1 tracking-tight">{value}</div>
        {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
};

const parseArchiveDate = (rec) => { if (rec.archivedAt) { const d = new Date(rec.archivedAt); if (!isNaN(d.getTime())) return d; } return null; };
const avgConfidenceOf = (rec) => { const conf = rec.fieldsConf || {}; const vals = Object.values(conf).filter(v => typeof v === 'number'); if (vals.length === 0) return null; return vals.reduce((s, v) => s + v, 0) / vals.length; };

const STAGE_COLORS = {
  extraction:    { bg: 'bg-slate-700',   text: 'text-slate-700',   label: 'AI Extraction' },
  'hitl-review': { bg: 'bg-blue-700',    text: 'text-blue-700',    label: 'HITL Review' },
  'qc-pending':  { bg: 'bg-amber-600',   text: 'text-amber-700',   label: 'QC Pending' },
  archived:      { bg: 'bg-emerald-700', text: 'text-emerald-700', label: 'Archived' }
};

export default function ReportsScreen({ batches = [], archivedRecords = [], buckets = [], restoreRejectedRecord = () => {}, currentUser = null }) {
  const [selectedTemplate, setSelectedTemplate] = useState('donor');
  const [generating, setGenerating] = useState(false);
  const [rejectedModalOpen, setRejectedModalOpen] = useState(false);
  const [exportBatchId, setExportBatchId] = useState('');
  const [exportingBatch, setExportingBatch] = useState(false);
  const isAdmin = currentUser?.role === 'Administrator';

  const usage = useMemo(() => computeBucketUsageBytes(batches, archivedRecords), [batches, archivedRecords]);
  const totalQuotaGB = buckets.length > 0 ? buckets.reduce((s, b) => s + (b.quotaGB || 50), 0) : 50;
  const usedGB = usage.totalBytes / (1024 ** 3);
  const usedPct = Math.min(100, (usedGB / totalQuotaGB) * 100);
  const usedDisplay = usedGB >= 1 ? usedGB.toFixed(2) : (usage.totalBytes / (1024 ** 2)).toFixed(1);
  const usedUnit = usedGB >= 1 ? 'GB' : 'MB';

  const totalArchived = archivedRecords.length;
  const totalDonations = useMemo(() => archivedRecords.reduce((s, r) => s + (parseFloat(r.fields?.amount) || 0), 0), [archivedRecords]);
  const activeBatches = batches.filter(b => b.status !== 'archived').length;
  const avgConfidence = useMemo(() => { const confs = archivedRecords.map(avgConfidenceOf).filter(c => c !== null); if (confs.length === 0) return null; return confs.reduce((s, v) => s + v, 0) / confs.length; }, [archivedRecords]);

  const stageBreakdown = useMemo(() => {
    const counts = { extraction: 0, 'hitl-review': 0, 'qc-pending': 0, archived: 0 };
    batches.forEach(b => { if (counts[b.status] !== undefined) counts[b.status] += (b.records?.length || 0); });
    counts.archived = archivedRecords.length;
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    return { counts, total };
  }, [batches, archivedRecords]);

  const volumeData = useMemo(() => {
    const now = new Date(); const days = [];
    for (let i = 29; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); d.setHours(0,0,0,0); days.push({ date: d, key: d.toISOString().slice(0, 10), count: 0, amount: 0 }); }
    const dayMap = new Map(days.map(d => [d.key, d]));
    archivedRecords.forEach(r => { const d = parseArchiveDate(r); if (!d) return; const key = d.toISOString().slice(0, 10); const bucket = dayMap.get(key); if (bucket) { bucket.count++; bucket.amount += parseFloat(r.fields?.amount) || 0; } });
    return days.map(d => ({ day: d.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), count: d.count, amount: d.amount }));
  }, [archivedRecords]);
  const has30dActivity = volumeData.some(v => v.count > 0);

  const amountBuckets = useMemo(() => {
    const buckets = [{ range: '< $50', min: 0, max: 50, count: 0 }, { range: '$50 – $100', min: 50, max: 100, count: 0 }, { range: '$100 – $500', min: 100, max: 500, count: 0 }, { range: '$500 – $1k', min: 500, max: 1000, count: 0 }, { range: '$1k – $5k', min: 1000, max: 5000, count: 0 }, { range: '> $5k', min: 5000, max: Infinity, count: 0 }];
    archivedRecords.forEach(r => { const amt = parseFloat(r.fields?.amount) || 0; const b = buckets.find(b => amt >= b.min && amt < b.max); if (b) b.count++; });
    return buckets;
  }, [archivedRecords]);

  const sourceDistribution = useMemo(() => {
    const counts = { 'Individual Check': 0, 'DAF / Grant': 0, 'Credit Card': 0, 'Other': 0 };
    archivedRecords.forEach(r => { const isDaf = r.fields?.actualDonor || r.fields?.fundName || r.fields?.grantId; if (isDaf) counts['DAF / Grant']++; else if (r.paymentMethod === 'Cheque') counts['Individual Check']++; else if (r.paymentMethod === 'CreditCard') counts['Credit Card']++; else counts['Other']++; });
    const colors = { 'Individual Check': '#1e40af', 'DAF / Grant': '#b45309', 'Credit Card': '#0d9488', 'Other': '#475569' };
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    return Object.entries(counts).map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0, color: colors[name] }));
  }, [archivedRecords]);

  const hitlMetrics = useMemo(() => {
    let edited = 0, ncv = 0, approved = 0;
    archivedRecords.forEach(r => { const review = r.hitlReview; if (!review) return; if (review.edits && Object.keys(review.edits).length > 0) edited++; if (review.ncvFields && review.ncvFields.length > 0) ncv++; if (review.status === 'approved' || review.status === 'reviewed') approved++; });
    return { edited, ncv, approved };
  }, [archivedRecords]);
  const ncvRatePct = totalArchived > 0 ? (hitlMetrics.ncv / totalArchived) * 100 : 0;
  const editRatePct = totalArchived > 0 ? (hitlMetrics.edited / totalArchived) * 100 : 0;

  const bankBreakdown = useMemo(() => {
    const groups = {};
    archivedRecords.forEach(r => { if (r.paymentMethod !== 'Cheque') return; const bank = String(r.fields?.bank || 'Unknown').split(',')[0].trim() || 'Unknown'; groups[bank] = groups[bank] || { count: 0, total: 0 }; groups[bank].count++; groups[bank].total += parseFloat(r.fields?.amount) || 0; });
    return Object.entries(groups).map(([bank, stats]) => ({ bank, ...stats })).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [archivedRecords]);

  const monthlyMetrics = useMemo(() => {
    const now = new Date(); const thisMonth = now.getMonth(); const thisYear = now.getFullYear();
    let thisMonthCount = 0, thisMonthAmount = 0, prevMonthCount = 0, prevMonthAmount = 0;
    archivedRecords.forEach(r => {
      const d = parseArchiveDate(r); if (!d) return;
      const amt = parseFloat(r.fields?.amount) || 0;
      if (d.getFullYear() === thisYear && d.getMonth() === thisMonth) { thisMonthCount++; thisMonthAmount += amt; }
      else { const prev = new Date(thisYear, thisMonth - 1, 1); if (d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth()) { prevMonthCount++; prevMonthAmount += amt; } }
    });
    const trend = prevMonthCount > 0 ? ((thisMonthCount - prevMonthCount) / prevMonthCount) * 100 : null;
    return { thisMonthCount, thisMonthAmount, prevMonthCount, prevMonthAmount, trend };
  }, [archivedRecords]);

  const qualityMetrics = useMemo(() => {
    const allRecords = [];
    for (const b of batches) for (const r of (b.records || [])) allRecords.push({ batch: b, record: r });
    for (const r of archivedRecords) { if (!allRecords.some(({ record }) => record.id === r.id)) allRecords.push({ batch: { id: r.batchId, uploader: r.uploader || null }, record: r }); }
    const hitlOps = {}; const preprepOps = {};
    for (const { batch, record } of allRecords) {
      const reviewer = record.hitlReview?.reviewer;
      if (reviewer && record.hitlReview?.status === 'approved') {
        if (!hitlOps[reviewer]) hitlOps[reviewer] = { reviewer, approved: 0, reworked: 0 };
        hitlOps[reviewer].approved++;
        if (getQcHistory(record.qcReview).some(h => h.action === 'sent-back' && h.destination === 'hitl')) hitlOps[reviewer].reworked++;
      }
      const uploader = batch?.uploader;
      if (uploader && record.hitlReview) {
        if (!preprepOps[uploader]) preprepOps[uploader] = { reviewer: uploader, produced: 0, reworked: 0 };
        preprepOps[uploader].produced++;
        if (getQcHistory(record.qcReview).some(h => h.action === 'sent-back' && h.destination === 'preprep')) preprepOps[uploader].reworked++;
      }
    }
    const hitlOpsRanked = Object.values(hitlOps).map(o => ({ ...o, rate: o.approved > 0 ? (o.reworked / o.approved) : 0 })).sort((a, b) => b.rate - a.rate).slice(0, 5);
    const preprepOpsRanked = Object.values(preprepOps).map(o => ({ ...o, rate: o.produced > 0 ? (o.reworked / o.produced) : 0 })).sort((a, b) => b.rate - a.rate).slice(0, 5);
    const totalApproved = Object.values(hitlOps).reduce((s, o) => s + o.approved, 0);
    const totalHitlReworked = Object.values(hitlOps).reduce((s, o) => s + o.reworked, 0);
    const hitlReworkRate = totalApproved > 0 ? (totalHitlReworked / totalApproved) : 0;
    const totalProduced = Object.values(preprepOps).reduce((s, o) => s + o.produced, 0);
    const totalPreprepReworked = Object.values(preprepOps).reduce((s, o) => s + o.reworked, 0);
    const preprepReworkRate = totalProduced > 0 ? (totalPreprepReworked / totalProduced) : 0;
    const latencies = [];
    for (const { record } of allRecords) { const history = getQcHistory(record.qcReview); const firstSentBack = history.find(h => h.action === 'sent-back'); if (!firstSentBack) continue; const finalAt = record.qcReview?.reviewedAt || (history[history.length - 1] && history[history.length - 1].at); if (!finalAt) continue; const delta = new Date(finalAt).getTime() - new Date(firstSentBack.at).getTime(); if (delta > 0) latencies.push(delta); }
    const avgLatencyMs = latencies.length > 0 ? latencies.reduce((s, v) => s + v, 0) / latencies.length : null;
    const formatLatency = (ms) => { if (ms == null) return '—'; const minutes = ms / 60000; if (minutes < 60) return `${minutes.toFixed(0)}m`; const hours = minutes / 60; if (hours < 24) return `${hours.toFixed(1)}h`; return `${(hours / 24).toFixed(1)}d`; };
    const totalRejected = allRecords.filter(({ record }) => record.qcReview?.status === 'rejected').length;
    return { hitlOpsRanked, preprepOpsRanked, hitlReworkRate, preprepReworkRate, hitlReworkedCount: totalHitlReworked, preprepReworkedCount: totalPreprepReworked, avgLatencyMs, avgLatencyDisplay: formatLatency(avgLatencyMs), latencySampleSize: latencies.length, totalRejected, totalApproved, totalProduced };
  }, [batches, archivedRecords]);

  const templates = [
    { id: 'donor', name: 'Donor Summary', desc: 'Aggregated giving by donor', icon: User },
    { id: 'date', name: 'Date Range Report', desc: 'Records within a time window', icon: Calendar },
    { id: 'amount', name: 'Amount Analysis', desc: 'Distribution by gift size', icon: DollarSign },
    { id: 'batch', name: 'Batch Audit', desc: 'Batch-level pipeline metrics', icon: Inbox },
    { id: 'crossval', name: 'HITL & QC Review', desc: 'Edits, NCV flags, reviewer activity', icon: AlertCircle },
    { id: 'daf', name: 'Donor Advised Fund', desc: 'DAF / grant attributions', icon: Building2 },
    { id: 'quality', name: 'Operator Quality', desc: 'Per-operator rework rates', icon: Activity },
    { id: 'rejected', name: 'Rejected Records', desc: 'Records rejected by QC', icon: X }
  ];
  const activeTemplate = templates.find(t => t.id === selectedTemplate);

  const buildReportRows = () => {
    switch (selectedTemplate) {
      case 'donor': {
        const groups = {};
        archivedRecords.forEach(r => { const f = r.fields || {}; const donor = f.donorName || '(Unknown)'; if (!groups[donor]) groups[donor] = { donor, address: f.donorAddress || '', count: 0, total: 0, lastDonation: null, paymentMethods: new Set() }; groups[donor].count++; groups[donor].total += parseFloat(f.amount) || 0; groups[donor].paymentMethods.add(r.paymentMethod || 'Unknown'); const d = parseArchiveDate(r); if (d && (!groups[donor].lastDonation || d > groups[donor].lastDonation)) groups[donor].lastDonation = d; });
        return Object.values(groups).sort((a, b) => b.total - a.total).map(g => ({ 'Donor': g.donor, 'Address': g.address, 'Donations': g.count, 'Total Amount': g.total.toFixed(2), 'Avg Gift': (g.total / g.count).toFixed(2), 'Payment Methods': [...g.paymentMethods].join(', '), 'Last Donation': g.lastDonation ? g.lastDonation.toISOString().slice(0, 10) : '' }));
      }
      case 'date': return archivedRecords.map(r => { const f = r.fields || {}; const d = parseArchiveDate(r); return { 'Archive Date': d ? d.toISOString().slice(0, 10) : '', 'Record ID': r.recordId || r.id, 'Donor': f.donorName || '', 'Amount': (parseFloat(f.amount) || 0).toFixed(2), 'Payment Method': r.paymentMethod || 'Unknown', 'Donation Date': f.date || '', 'Check Number': f.chequeNo || '' }; }).sort((a, b) => (b['Archive Date'] || '').localeCompare(a['Archive Date'] || ''));
      case 'amount': return amountBuckets.map(b => { const inBucket = archivedRecords.filter(r => { const amt = parseFloat(r.fields?.amount) || 0; return amt >= b.min && amt < b.max; }); const total = inBucket.reduce((s, r) => s + (parseFloat(r.fields?.amount) || 0), 0); return { 'Range': b.range, 'Count': b.count, 'Total Amount': total.toFixed(2), 'Avg Gift': b.count > 0 ? (total / b.count).toFixed(2) : '0.00', 'Pct of Total': totalDonations > 0 ? ((total / totalDonations) * 100).toFixed(1) + '%' : '0%' }; });
      case 'batch': return batches.map(b => { const archivedInBatch = archivedRecords.filter(r => r.batchId === b.id); const archivedAmount = archivedInBatch.reduce((s, r) => s + (parseFloat(r.fields?.amount) || 0), 0); return { 'Batch ID': b.id, 'Uploaded': b.uploaded || '', 'Uploader': b.uploader || '', 'Status': b.status, 'Records': b.records?.length || 0, 'Pages': b.pages || 0, 'Archived Records': archivedInBatch.length, 'Archived Amount': archivedAmount.toFixed(2), 'Priority': b.priority || '' }; });
      case 'crossval': return archivedRecords.filter(r => r.hitlReview || r.qcReview).map(r => { const f = r.fields || {}; const h = r.hitlReview || {}; const q = r.qcReview || {}; return { 'Record ID': r.recordId || r.id, 'Donor': f.donorName || '', 'Amount': (parseFloat(f.amount) || 0).toFixed(2), 'HITL Status': h.status || '', 'HITL Reviewer': h.reviewer || '', 'HITL Edits': Object.keys(h.edits || {}).length, 'NCV Fields': (h.ncvFields || []).join(', '), 'QC Status': q.status || '', 'QC Reason': getQcReason(q) }; });
      case 'daf': return archivedRecords.filter(r => r.fields?.actualDonor || r.fields?.fundName || r.fields?.grantId).map(r => { const f = r.fields || {}; return { 'Record ID': r.recordId || r.id, 'Check Donor': f.donorName || '', 'Actual Donor': f.actualDonor || '', 'Fund Name': f.fundName || '', 'Grant ID': f.grantId || '', 'Amount': (parseFloat(f.amount) || 0).toFixed(2), 'Donation Date': f.date || '' }; });
      case 'quality': { const rows = []; for (const op of qualityMetrics.hitlOpsRanked) rows.push({ 'Role': 'HITL Operator', 'Operator': op.reviewer, 'Records Approved': op.approved, 'Records Sent Back': op.reworked, 'Rework Rate': `${(op.rate * 100).toFixed(1)}%` }); for (const op of qualityMetrics.preprepOpsRanked) rows.push({ 'Role': 'Pre-Prep Operator', 'Operator': op.reviewer, 'Records Approved': op.produced, 'Records Sent Back': op.reworked, 'Rework Rate': `${(op.rate * 100).toFixed(1)}%` }); rows.push({ 'Role': '— Overall —', 'Operator': '(all)', 'Records Approved': qualityMetrics.totalApproved, 'Records Sent Back': qualityMetrics.hitlReworkedCount, 'Rework Rate': qualityMetrics.totalApproved > 0 ? `${(qualityMetrics.hitlReworkRate * 100).toFixed(1)}%` : 'n/a' }); return rows; }
      case 'rejected': { const out = []; for (const b of batches) for (const r of (b.records || [])) { if (r.qcReview?.status !== 'rejected') continue; out.push({ 'Record ID': r.recordId || r.id, 'Batch ID': b.id, 'Donor': r.extractedRecord?.donor?.name || '', 'Amount': r.extractedRecord?.donation?.amount || '', 'Rejected By': r.qcReview.reviewer || '', 'Rejected At': r.qcReview.reviewedAt || '', 'Reason': getQcReason(r.qcReview) }); } return out; }
      default: return [];
    }
  };

  const generateReportJson = () => {
    const rows = buildReportRows();
    const payload = { reportType: activeTemplate.name, generatedAt: new Date().toISOString(), rowCount: rows.length, summary: { totalArchivedRecords: totalArchived, totalDonationAmount: totalDonations, avgExtractionConfidence: avgConfidence ? Number(avgConfidence.toFixed(1)) : null }, rows };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `report_${selectedTemplate}_${new Date().toISOString().slice(0, 10)}.json`);
  };

  const generateReportXlsx = async () => {
    setGenerating(true);
    try {
      const XLSX = await loadXlsx();
      if (!XLSX) { alert('Could not load XLSX library.'); return; }
      const rows = buildReportRows();
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 'Report Type': activeTemplate.name, 'Generated At': new Date().toISOString(), 'Total Archived Records': totalArchived, 'Total Donation Amount': totalDonations.toFixed(2), 'Row Count': rows.length }]), 'Summary');
      const dataSheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ 'No data': '— archive is empty —' }]);
      if (rows.length > 0) dataSheet['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length + 2, 14) }));
      XLSX.utils.book_append_sheet(wb, dataSheet, 'Data');
      XLSX.writeFile(wb, `report_${selectedTemplate}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) { alert('Could not generate XLSX: ' + (e.message || 'unknown error')); }
    finally { setGenerating(false); }
  };

  const previewRowCount = useMemo(() => buildReportRows().length, [selectedTemplate, archivedRecords, batches]);
  const isArchiveEmpty = totalArchived === 0;

  const exportableBatches = useMemo(() => batches.filter(b => (b.records?.length || 0) > 0).sort((a, b) => { const ta = new Date(a.createdAt || a.id).getTime() || 0; const tb = new Date(b.createdAt || b.id).getTime() || 0; return tb - ta; }).slice(0, 24), [batches]);
  useEffect(() => { if (!exportBatchId && exportableBatches.length > 0) setExportBatchId(exportableBatches[0].id); }, [exportableBatches, exportBatchId]);
  const selectedExportBatch = exportableBatches.find(b => b.id === exportBatchId);

  const exportBatchXlsx = async () => {
    if (!selectedExportBatch) return;
    setExportingBatch(true);
    try {
      const XLSX = await loadXlsx();
      if (!XLSX) return;
      const rows = selectedExportBatch.records?.map(r => {
        const f = r.fields || (r.hitlReview?.lockedFields) || {};
        return { recordId: r.recordId || r.id, paymentMethod: r.paymentMethod || '', archivedAt: r.archivedAt || '', batchId: selectedExportBatch.id, donorName: f.donorName || '', amount: f.amount != null ? String(f.amount) : '', date: f.date || '', chequeNo: f.chequeNo || '' };
      }) || [];
      const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ '_': 'No records' }]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Batch Records');
      XLSX.writeFile(wb, `${selectedExportBatch.id}.xlsx`);
    } finally { setExportingBatch(false); }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="px-6 py-3 flex-shrink-0 relative" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #0b1a36 40%, #0a1020 100%)' }}>
        <PageHeader tone="dark" title="Reports & Analytics" eyebrow="INSIGHTS" description="Live metrics derived from the archive and pipeline · custom report generation" className="mb-0"
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mr-1">Batch Export</div>
              {exportableBatches.length === 0 ? <div className="text-[10px] text-slate-500 italic px-2 py-1  border border-slate-700/50 bg-slate-900/40">No batches yet</div> : (
                <><select value={exportBatchId} onChange={(e) => setExportBatchId(e.target.value)} className="text-[11px] font-mono bg-slate-900/60 border border-slate-700/60 text-slate-200  px-2 py-1.5 max-w-[220px] focus:outline-none focus:ring-1 focus:ring-blue-400">{exportableBatches.map(b => <option key={b.id} value={b.id}>{b.id} · {b.records?.length || 0} recs</option>)}</select><Button variant="success" size="sm" icon={FileSpreadsheet} onClick={exportBatchXlsx} disabled={!selectedExportBatch || exportingBatch}>{exportingBatch ? 'Exporting…' : 'XLSX'}</Button></>
              )}
            </div>
          }
        />
      </div>
      <div className="p-4 md:p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <MetricCard label="Archived Records" value={totalArchived.toLocaleString()} sub={isArchiveEmpty ? 'Awaiting first archive' : `${activeBatches} active batch${activeBatches !== 1 ? 'es' : ''} in pipeline`} icon={Archive} tone="emerald" />
          <MetricCard label="Total Donations" value={isArchiveEmpty ? '—' : `$${(totalDonations / 1000).toFixed(2)}k`} sub={isArchiveEmpty ? 'No archived data' : `Across ${totalArchived.toLocaleString()} records`} icon={DollarSign} tone="navy" />
          <MetricCard label="This Month" value={monthlyMetrics.thisMonthCount.toLocaleString()} sub={monthlyMetrics.trend != null ? `${monthlyMetrics.trend > 0 ? '↑' : '↓'} ${Math.abs(monthlyMetrics.trend).toFixed(0)}% vs last month` : 'No activity this month'} icon={TrendingUp} tone="slate" trend={monthlyMetrics.trend != null ? Number(monthlyMetrics.trend.toFixed(0)) : null} />
          <MetricCard label="Avg Extraction Conf." value={avgConfidence != null ? `${avgConfidence.toFixed(1)}%` : '—'} sub={avgConfidence != null ? `Across ${totalArchived.toLocaleString()} records` : 'No confidence data yet'} icon={Activity} tone="amber" />
        </div>

        {/* Quality & Rework */}
        <div className="bg-white  border border-slate-200 p-5 shadow-sm mb-5">
          <h3 className="text-sm font-bold text-slate-800 mb-1">Quality &amp; Rework</h3>
          <p className="text-[11px] text-slate-500 mb-4">Operator-level rework rates, round-trip latency, and rejection totals</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'HITL Rework Rate', icon: ClipboardCheck, color: 'text-orange-600', value: qualityMetrics.totalApproved > 0 ? `${(qualityMetrics.hitlReworkRate * 100).toFixed(1)}%` : '—', sub: qualityMetrics.totalApproved > 0 ? `${qualityMetrics.hitlReworkedCount} of ${qualityMetrics.totalApproved} HITL approvals sent back` : 'No HITL approvals yet' },
              { label: 'Pre-Prep Rework Rate', icon: Scissors, color: 'text-violet-600', value: qualityMetrics.totalProduced > 0 ? `${(qualityMetrics.preprepReworkRate * 100).toFixed(1)}%` : '—', sub: qualityMetrics.totalProduced > 0 ? `${qualityMetrics.preprepReworkedCount} of ${qualityMetrics.totalProduced} records sent back` : 'No pipeline data yet' },
              { label: 'Avg Round-Trip', icon: Activity, color: 'text-blue-600', value: qualityMetrics.avgLatencyDisplay, sub: qualityMetrics.latencySampleSize > 0 ? `Across ${qualityMetrics.latencySampleSize} rework cycle${qualityMetrics.latencySampleSize === 1 ? '' : 's'}` : 'No completed cycles yet' },
            ].map(s => (
              <div key={s.label} className=" border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3">
                <div className="flex items-center gap-1.5 mb-1"><s.icon size={11} className={s.color} /><div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{s.label}</div></div>
                <div className="text-2xl font-black text-slate-900 tabular-nums leading-tight">{s.value}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{s.sub}</div>
              </div>
            ))}
            <button onClick={() => setRejectedModalOpen(true)} className="text-left  border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 hover:border-red-300 hover:shadow-sm transition-all">
              <div className="flex items-center gap-1.5 mb-1"><X size={11} className="text-red-600" /><div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rejected</div><ExternalLink size={10} className="text-slate-300 ml-auto" /></div>
              <div className="text-2xl font-black text-slate-900 tabular-nums leading-tight">{qualityMetrics.totalRejected.toLocaleString()}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{qualityMetrics.totalRejected > 0 ? (isAdmin ? 'Click to review · admin can restore' : 'Click to review') : 'None rejected'}</div>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[{ title: 'HITL Operators · Rework Rate', items: qualityMetrics.hitlOpsRanked, emptyMsg: 'No HITL approvals yet', countKey: 'approved', reworkKey: 'reworked' }, { title: 'Pre-Prep Operators · Rework Rate', items: qualityMetrics.preprepOpsRanked, emptyMsg: 'No Pre-Prep production data yet', countKey: 'produced', reworkKey: 'reworked' }].map(col => (
              <div key={col.title}>
                <div className="flex items-center justify-between mb-2"><h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">{col.title}</h4><span className="text-[10px] text-slate-400">top 5</span></div>
                {col.items.length === 0 ? <div className="text-[11px] text-slate-400 italic py-3 text-center bg-slate-50  border border-slate-200 border-dashed">{col.emptyMsg}</div> : (
                  <div className="space-y-1.5">{col.items.map(op => { const pct = (op.rate * 100); const tone = pct >= 20 ? 'bg-red-500' : pct >= 10 ? 'bg-amber-500' : 'bg-emerald-500'; return (<div key={op.reviewer}><div className="flex items-center justify-between text-[10px] mb-0.5"><span className="font-semibold text-slate-700 truncate">{op.reviewer}</span><span className="font-bold text-slate-800 tabular-nums ml-1">{pct.toFixed(1)}% <span className="font-normal text-slate-500">({op[col.reworkKey]}/{op[col.countKey]})</span></span></div><div className="h-2  bg-slate-100 overflow-hidden"><div className={`h-full ${tone} transition-all`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}></div></div></div>); })}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline stage breakdown */}
        <div className="bg-white  border border-slate-200 p-5 shadow-sm mb-5">
          <h3 className="text-sm font-bold text-slate-800 mb-3">Pipeline Stage Breakdown</h3>
          {stageBreakdown.total === 0 ? <div className="h-12 flex items-center justify-center text-xs text-slate-400 bg-slate-50/50 border border-dashed border-slate-200 ">No records in the pipeline yet</div> : (
            <><div className="flex h-8  overflow-hidden border border-slate-200">
              {Object.entries(stageBreakdown.counts).map(([stage, count]) => { if (count === 0) return null; const pct = (count / stageBreakdown.total) * 100; const cfg = STAGE_COLORS[stage]; return <div key={stage} className={`${cfg.bg} flex items-center justify-center text-white text-[11px] font-bold`} style={{ width: `${pct}%` }} title={`${cfg.label}: ${count}`}>{pct >= 8 && count}</div>; })}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">{Object.entries(stageBreakdown.counts).map(([stage, count]) => { const cfg = STAGE_COLORS[stage]; return <div key={stage} className="flex items-center gap-2"><span className={`w-2.5 h-2.5  ${cfg.bg}`}></span><div className="flex-1 min-w-0"><div className="text-[10px] text-slate-500 uppercase tracking-wider truncate">{cfg.label}</div><div className="text-sm font-bold text-slate-800 tabular-nums">{count.toLocaleString()}</div></div></div>; })}</div></>
          )}
        </div>

        {/* Storage + Source Distribution */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div className="bg-white  border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4"><div className="w-9 h-9  bg-gradient-to-br from-blue-700 to-blue-900 flex items-center justify-center shadow-md shadow-blue-900/25"><HardDrive size={16} className="text-white" /></div><div><div className="text-xs font-bold text-slate-800 uppercase tracking-wider">AWS S3 Storage</div><div className="text-[10px] text-slate-500">{buckets.length} bucket{buckets.length !== 1 ? 's' : ''} · live</div></div></div>
            <div className="flex items-baseline gap-2"><div className="text-4xl font-black text-slate-800 tracking-tight tabular-nums">{usedDisplay}</div><div className="text-sm text-slate-500">{usedUnit} of {totalQuotaGB} GB</div></div>
            <div className="mt-3 h-2.5 bg-slate-100  overflow-hidden shadow-inner"><div className="h-full bg-gradient-to-r from-blue-700 via-blue-800 to-blue-900 transition-all" style={{ width: `${usedPct}%` }}></div></div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
              {[{ label: 'Check Pages', bytes: usage.recordPdfBytes, color: 'bg-blue-600' }, { label: 'Supporting', bytes: usage.spPdfBytes, color: 'bg-emerald-500' }, { label: 'Metadata', bytes: usage.metadataBytes, color: 'bg-amber-500' }].map(s => (
                <div key={s.label} className="flex items-start gap-1.5 min-w-0"><span className={`w-2 h-2  ${s.color} flex-shrink-0 mt-0.5`}></span><div className="min-w-0"><div className="text-slate-500 truncate">{s.label}</div><div className="font-bold text-slate-700 tabular-nums">{formatBytes(s.bytes)}</div></div></div>
              ))}
            </div>
          </div>
          <div className="bg-white  border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 mb-1">Source Distribution</h3>
            <p className="text-[11px] text-slate-500 mb-3">Archived records by donation source</p>
            {isArchiveEmpty ? <div className="h-[150px] flex items-center justify-center text-xs text-slate-400 bg-slate-50/50 border border-dashed border-slate-200 ">Populates after archiving</div> : (
              <><ResponsiveContainer width="100%" height={150}><PieChart><Pie data={sourceDistribution.filter(d => d.value > 0)} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={2}>{sourceDistribution.filter(d => d.value > 0).map((entry, i) => <Cell key={i} fill={entry.color} />)}</Pie><Tooltip contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 6, color: 'white', fontSize: 10 }} /></PieChart></ResponsiveContainer>
              <div className="space-y-1 mt-2">{sourceDistribution.filter(d => d.value > 0).map(d => (<div key={d.name} className="flex items-center justify-between text-[11px]"><div className="flex items-center gap-1.5"><span className="w-2 h-2 " style={{ background: d.color }}></span><span className="text-slate-700">{d.name}</span></div><span className="font-semibold text-slate-800 tabular-nums">{d.value} · {d.pct.toFixed(0)}%</span></div>))}</div></>
            )}
          </div>
        </div>

        {/* Volume + Amount Distribution */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <div className="md:col-span-2 bg-white  border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 mb-1">Processing Volume — last 30 days</h3>
            <p className="text-[11px] text-slate-500 mb-3">Donation records archived per day</p>
            {!has30dActivity ? <div className="h-[200px] flex items-center justify-center text-xs text-slate-400 bg-slate-50/50 border border-dashed border-slate-200 "><div className="text-center"><TrendingUp size={24} className="mx-auto mb-2 text-slate-300" /><div>No archive activity in the last 30 days</div></div></div> : (
              <ResponsiveContainer width="100%" height={200}><AreaChart data={volumeData}><defs><linearGradient id="volgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#047857" stopOpacity={0.4} /><stop offset="100%" stopColor="#047857" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} /><XAxis dataKey="day" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={Math.floor(volumeData.length / 6)} /><YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 8, color: 'white', fontSize: 11 }} /><Area type="monotone" dataKey="count" stroke="#047857" strokeWidth={2} fill="url(#volgrad)" /></AreaChart></ResponsiveContainer>
            )}
          </div>
          <div className="bg-white  border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 mb-1">Amount Distribution</h3>
            <p className="text-[11px] text-slate-500 mb-3">Records by gift size</p>
            {isArchiveEmpty ? <div className="h-[200px] flex items-center justify-center text-xs text-slate-400 bg-slate-50/50 border border-dashed border-slate-200 "><div className="text-center"><BarChart3 size={24} className="mx-auto mb-2 text-slate-300" /><div>Populates after archiving</div></div></div> : (
              <ResponsiveContainer width="100%" height={200}><BarChart data={amountBuckets}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} /><XAxis dataKey="range" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} angle={-20} textAnchor="end" height={50} /><YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 8, color: 'white', fontSize: 11 }} /><Bar dataKey="count" radius={[4,4,0,0]}>{amountBuckets.map((_, i) => <Cell key={i} fill={`hsl(${220 - i * 4}, 70%, ${35 + i * 5}%)`} />)}</Bar></BarChart></ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Report Builder */}
        <div className="bg-white  border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center gap-2"><SlidersHorizontal size={14} className="text-blue-800" /><h3 className="text-sm font-bold text-slate-800">Report Builder</h3></div>
            <div className="text-[10px] text-slate-500">Pick a template — generates from live archive data</div>
          </div>
          <div className="px-5 pt-4 pb-3 bg-slate-50/40 border-b border-slate-200">
            <div className="text-[10px] font-bold text-slate-500 uppercase mb-2.5 tracking-wider">Templates</div>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr))' }}>
              {templates.map(t => { const Icon = t.icon; const active = selectedTemplate === t.id; return (<button key={t.id} onClick={() => setSelectedTemplate(t.id)} className={`text-center p-2  flex flex-col items-center gap-1.5 transition border min-w-0 ${active ? 'bg-white shadow-md border-blue-400 ring-2 ring-blue-200' : 'bg-white/80 border-slate-200 hover:border-slate-300 hover:bg-white hover:shadow-sm'}`} title={t.desc}><div className={`w-8 h-8  flex items-center justify-center flex-shrink-0 ${active ? 'bg-gradient-to-br from-blue-700 to-blue-900 text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}><Icon size={14} /></div><div className={`text-[10px] font-bold leading-tight w-full ${active ? 'text-blue-950' : 'text-slate-700'}`}>{t.name}</div></button>); })}
            </div>
          </div>
          <div className="relative p-5 bg-gradient-to-br from-blue-50/60 via-white to-white">
            <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
              <div className="min-w-0 flex-1 flex items-start gap-3">
                {(() => { const Icon = activeTemplate.icon; return <div className="w-9 h-9  bg-gradient-to-br from-blue-700 to-blue-900 text-white flex items-center justify-center shadow-md shadow-blue-900/20 flex-shrink-0"><Icon size={16} /></div>; })()}
                <div className="min-w-0 flex-1"><h4 className="text-sm font-bold text-slate-800">{activeTemplate.name}</h4><p className="text-[11px] text-slate-500 mt-0.5">{activeTemplate.desc}</p></div>
              </div>
              <div className="text-[11px] text-slate-500 flex-shrink-0 bg-white/80 border border-slate-200  px-3 py-1.5 shadow-sm">Estimated rows: <span className="font-bold text-slate-700 tabular-nums text-base">{previewRowCount.toLocaleString()}</span>{previewRowCount === 0 && <span className="ml-2 text-amber-700">· no matching data yet</span>}</div>
            </div>
            <div className="flex items-center justify-end pt-3 border-t border-blue-100">
              <div className="flex gap-2">
                <Button variant="secondary" icon={FileJson} onClick={generateReportJson} disabled={previewRowCount === 0}>Download JSON</Button>
                <Button variant="success" icon={FileSpreadsheet} onClick={generateReportXlsx} disabled={previewRowCount === 0 || generating}>{generating ? 'Generating…' : 'Download XLSX'}</Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {rejectedModalOpen && <RejectedRecordsModal batches={batches} archivedRecords={archivedRecords} canRestore={isAdmin} onClose={() => setRejectedModalOpen(false)} onRestore={(batchId, recordId) => restoreRejectedRecord(batchId, recordId, currentUser?.email || currentUser?.username || 'unknown')} />}
    </div>
  );
}
