// =============================================================================
// App.jsx — Orchestration layer only.
//
// This file contains ONLY:
//   1. Imports from all extracted modules
//   2. SalvationArmyApp — the root state container (batches, archivedRecords,
//      extraction jobs, callbacks, SSE connection, persistence)
//   3. SAAppWrapper — thin bridge between JWT auth and SalvationArmyApp
//   4. App — top-level router
//
// All screens, components, utilities, and constants live in their own files
// under src/screens/, src/components/, src/utils/, and src/constants/.
//
// v3.13.42 — enterprise refactor
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

// ─── Auth ────────────────────────────────────────────────────────────────────
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { dataClient } from './lib/axiosInstance.js';
import { toastBus } from './lib/toastBridge.js';
import ProtectedRoute from './components/ProtectedRoute.jsx';

// ─── Constants ───────────────────────────────────────────────────────────────
import { EXTRACTION_TERMINAL } from './constants/appConfig.js';
import { hasFeature } from './constants/features.js';

// ─── Utilities ───────────────────────────────────────────────────────────────
import {
  getAuthToken,
  loadUsersFromStorage, loadTeamsFromStorage, loadCurrentUserIdFromStorage,
  loadDeletedBatchesFromStorage, loadBucketsFromStorage, loadActiveBucketIdFromStorage,
  safeWriteStorage, safeWriteBucketStorage,
  USERS_STORAGE_KEY, TEAMS_STORAGE_KEY, CURRENT_USER_STORAGE_KEY,
  DELETED_BATCHES_STORAGE_KEY, BUCKETS_STORAGE_KEY, ACTIVE_BUCKET_STORAGE_KEY,
  restoreBatch, restoreArchivedRecord, stripArchivedRecordForStorage, persistBatchDurably,
} from './utils/storage.js';
import {
  pgGetRecentBatches, pgGetBatchesByStatusPaged, pgGetBatchSummaries,
  pgGetArchivedRecordsPaged, pgGetBatchDetail, pgFetchBatchPage,
} from './utils/pgApi.js';
import { extractDonationRecord } from './utils/aiExtraction.js';
import { recordRecordExtracted } from './utils/billing.js';
import { getQcDestination, getQcHistory } from './utils/qcUtils.js';
import { makeFreshJob } from './utils/extractionUtils.js';

// ─── Layout components ───────────────────────────────────────────────────────
import Header from './components/layout/Header.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import BrowserShell from './components/layout/BrowserShell.jsx';
import ErrorBoundary from './components/layout/ErrorBoundary.jsx';
import AccessDeniedScreen from './components/shared/AccessDenied.jsx';

// ─── Pages (JWT auth routes) ─────────────────────────────────────────────────
import SALoginPage from './pages/SALoginPage.jsx';
import AdminPage from './pages/AdminPage.jsx';

// ─── Screens (lazy-importable once split into separate chunks) ────────────────
import LoginScreen from './screens/Login/LoginScreen.jsx';
import DashboardScreen from './screens/Dashboard/DashboardScreen.jsx';
import PrePrepScreen from './screens/PrePrep/PrePrepScreen.jsx';
import ImportScreen from './screens/Import/ImportScreen.jsx';
import ExtractionScreen from './screens/Extraction/ExtractionScreen.jsx';
import HITLScreen from './screens/HITL/HITLScreen.jsx';
import QCScreen from './screens/QC/QCScreen.jsx';
import RepositoryScreen from './screens/Repository/RepositoryScreen.jsx';
import ReportsScreen from './screens/Reports/ReportsScreen.jsx';
import BatchManagerScreen from './screens/BatchManager/BatchManagerScreen.jsx';
import UserManagementScreen from './screens/UserManagement/UserManagementScreen.jsx';
import IntegrationsScreen from './screens/Integrations/IntegrationsScreen.jsx';
import BillingScreen from './screens/Billing/BillingScreen.jsx';
import SettingsScreen from './screens/Settings/SettingsScreen.jsx';
import TenantsScreen from './screens/Tenants/TenantsScreen.jsx';
import RolesScreen from './screens/Roles/RolesScreen.jsx';
import PermissionsScreen from './screens/Permissions/PermissionsScreen.jsx';

// =============================================================================
// SalvationArmyApp — root state container
//
// Owns every piece of shared mutable state:
//   • users / teams / currentUserId  — identity (session-scoped)
//   • batches                        — live pipeline (PostgreSQL-backed)
//   • archivedRecords                — digital repository (PostgreSQL-backed)
//   • deletedBatches                 — audit log (localStorage)
//   • buckets                        — S3 registry (localStorage)
//   • extractionJobs                 — in-memory only, resets on refresh
//
// Data flow:
//   PostgreSQL ──────────► batches / archivedRecords  (on mount + 30s poll)
//   SSE /api/data/events ► per-batch updates (real-time multi-user sync)
//   User actions ─────────► setBatches / setArchivedRecords + debounced PATCH to DB
// =============================================================================
function SalvationArmyApp() {
  const { auth: jwtAuth, logout: jwtLogout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Derive route from URL so refresh stays on the current page.
  const route = (pathname === '/' || pathname === '') ? 'dashboard' : pathname.replace(/^\//, '');
  const setRoute = useCallback((r) => navigate(r === 'dashboard' ? '/' : `/${r}`), [navigate]);
  const [collapsed, setCollapsed] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Inject SA favicon + page title at runtime
  useEffect(() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect x="0" y="0" width="64" height="64" rx="10" fill="#b91c1c"/>
      <text x="32" y="42" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
            font-weight="900" font-size="28" text-anchor="middle" fill="white"
            letter-spacing="0.5">SA</text>
    </svg>`;
    const dataUri = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    document.querySelectorAll('link[rel~="icon"]').forEach(el => el.remove());
    const link = document.createElement('link');
    link.rel = 'icon'; link.type = 'image/svg+xml'; link.href = dataUri;
    document.head.appendChild(link);
    document.title = 'Salvation Army · DigiFind · Donation Records Management';
  }, []);

  useEffect(() => { if (route === 'ai') setRoute('repository'); }, [route, setRoute]);

  // ─── Identity ──────────────────────────────────────────────────────────────
  const [users, setUsers] = useState(() => loadUsersFromStorage());
  const [teams, setTeams] = useState(() => loadTeamsFromStorage());
  const [currentUserId, setCurrentUserId] = useState(() => loadCurrentUserIdFromStorage());
  const currentUser = useMemo(() => {
    const fromUsers = users.find(u => u.id === currentUserId) || null;
    if (fromUsers) return fromUsers;
    if (jwtAuth) return { id: jwtAuth.username, name: jwtAuth.username, email: jwtAuth.username + '@sadrm.local', role: jwtAuth.role ?? 'user' };
    return null;
  }, [users, currentUserId, jwtAuth]);
  const defaultAdminUserId = useMemo(
    () => users.find(u => u.id === 'user-admin')?.id || users.find(u => u.role === 'Administrator')?.id || users[0]?.id || null,
    [users]
  );

  const handleAppLogout = useCallback(() => {
    jwtLogout();
    setCurrentUserId(null);
    setRoute('dashboard');
  }, [jwtLogout, setRoute]);

  // ─── Persistent state (PostgreSQL) ─────────────────────────────────────────
  const [dbLoaded, setDbLoaded] = useState(false);
  const [batches, setBatches] = useState([]);
  const [archivedRecords, setArchivedRecords] = useState([]);
  const [persistenceError, setPersistenceError] = useState(null);
  const [lastPersistedAt, setLastPersistedAt] = useState(null);
  const dbSavedIdsRef = useRef(new Set());
  const batchServerVersionRefs = useRef(new Map());
  // SSE connection status — consumed by RepositoryScreen to suspend its 30s archive poll.
  const [sseActive, setSseActive] = useState(false);
  // Per-batchId debounce handles — coalesces rapid SSE events for the same batch.
  const sseDebounceRef = useRef(new Map());
  const [deletedBatches, setDeletedBatches] = useState(() => loadDeletedBatchesFromStorage());
  const [buckets, setBuckets] = useState(() => loadBucketsFromStorage());
  const [activeBucketId, setActiveBucketId] = useState(() => {
    const stored = loadActiveBucketIdFromStorage();
    const initialBuckets = loadBucketsFromStorage();
    if (stored && initialBuckets.some(b => b.id === stored)) return stored;
    return initialBuckets[0]?.id || null;
  });

  // Two-phase batch loading — phase 1: active batches full JSONB, phase 2: summaries
  useEffect(() => {
    let cancelled = false;
    const mergeUniqueBatches = (groups) => {
      const byId = new Map();
      groups.flat().filter(Boolean).forEach(b => {
        const previous = byId.get(b.id);
        if (!previous || !previous._serverUpdatedAt || (b._serverUpdatedAt && b._serverUpdatedAt > previous._serverUpdatedAt)) byId.set(b.id, b);
      });
      return Array.from(byId.values());
    };
    const loadInitialData = async () => {
      try {
        const activeStatuses = ['extraction', 'hitl-review', 'qc-pending'];
        const fullBatchGroups = await Promise.all([
          pgGetRecentBatches(100, 0),
          ...activeStatuses.map(status => pgGetBatchesByStatusPaged(status, 500, 5000)),
        ]);
        if (cancelled) return;
        const fullBatches = mergeUniqueBatches(fullBatchGroups);
        fullBatches.forEach(b => { if (b?._serverUpdatedAt) batchServerVersionRefs.current.set(b.id, b._serverUpdatedAt); });
        setBatches(fullBatches.map(restoreBatch));

        const summaries = await pgGetBatchSummaries(0);
        if (!cancelled && Array.isArray(summaries) && summaries.length > 0) {
          setBatches(prev => {
            const existingIds = new Set(prev.map(b => b.id));
            const fresh = summaries.filter(s => !existingIds.has(s.id));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
        }

        // Load only the first page (100 records) for app-level stats (Dashboard, Reports, BatchManager).
        // RepositoryScreen owns its own server-paginated fetching for full archive browsing.
        const archiveSummary = await pgGetArchivedRecordsPaged((page) => {
          if (cancelled) return;
          page.forEach(r => dbSavedIdsRef.current.add(r.id));
          setArchivedRecords(prev => {
            const existingIds = new Set(prev.map(r => r.id));
            const fresh = page.filter(r => !existingIds.has(r.id)).map(restoreArchivedRecord);
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
        }, 100, 1);
        if (!cancelled && archiveSummary.errors.length > 0) {
          setPersistenceError(`Some archived-record pages failed to load (${archiveSummary.errors.length}). Retry or check backend logs.`);
        }
      } finally {
        if (!cancelled) setDbLoaded(true);
      }
    };
    loadInitialData();
    return () => { cancelled = true; };
  }, []);

  // Archive polling removed: RepositoryScreen manages its own 30-second refresh
  // of the current server page, avoiding the full-corpus load on every tick.

  // SSE — real-time batch updates from other sessions
  useEffect(() => {
    if (!dbLoaded) return;
    const token = getAuthToken();
    if (!token) return;
    const evtSrc = new EventSource(`/api/data/events?token=${encodeURIComponent(token)}`);

    evtSrc.onopen = () => setSseActive(true);

    evtSrc.onmessage = (e) => {
      try {
        const { type, batchId } = JSON.parse(e.data);
        if (type === 'batch-updated' && batchId) {
          // Coalesce rapid-fire events for the same batchId into a single fetch.
          clearTimeout(sseDebounceRef.current.get(batchId));
          sseDebounceRef.current.set(batchId, setTimeout(() => {
            sseDebounceRef.current.delete(batchId);
            pgGetBatchDetail(batchId).then(fresh => {
              if (!fresh) return;
              const restored = restoreBatch(fresh);
              setBatches(prev => {
                const idx = prev.findIndex(b => b.id === batchId);
                if (idx === -1) return [...prev, restored];
                const existing = prev[idx];
                if (existing._summary || (fresh.updatedAt && existing.updatedAt && fresh.updatedAt > existing.updatedAt)) {
                  const next = [...prev]; next[idx] = restored; return next;
                }
                return prev;
              });
            });
          }, 500));
        }
      } catch { /* malformed event */ }
    };

    evtSrc.onerror = () => setSseActive(false);

    return () => {
      evtSrc.close();
      setSseActive(false);
      sseDebounceRef.current.forEach(t => clearTimeout(t));
      sseDebounceRef.current.clear();
    };
  }, [dbLoaded]);

  // Inject global sleek-scrollbar stylesheet once on mount
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const styleId = 'sadrmp-sleek-scrollbar';
    if (document.getElementById(styleId)) return;
    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = `
      *::-webkit-scrollbar { width: 6px !important; height: 6px !important; }
      *::-webkit-scrollbar-track { background: transparent !important; }
      *::-webkit-scrollbar-thumb { background-color: rgba(100, 116, 139, 0.35) !important; border-radius: 8px !important; border: 1px solid transparent !important; background-clip: padding-box !important; transition: background-color 0.15s ease !important; }
      *::-webkit-scrollbar-thumb:hover { background-color: rgba(71, 85, 105, 0.6) !important; }
      *::-webkit-scrollbar-corner { background: transparent !important; }
      *::-webkit-scrollbar-button { display: none !important; width: 0 !important; height: 0 !important; }
      * { scrollbar-width: thin !important; scrollbar-color: rgba(100, 116, 139, 0.35) transparent !important; }
      .scroll-dark::-webkit-scrollbar-thumb { background-color: rgba(226, 232, 240, 0.20) !important; }
      .scroll-dark::-webkit-scrollbar-thumb:hover { background-color: rgba(226, 232, 240, 0.40) !important; }
      .scroll-dark { scrollbar-color: rgba(226, 232, 240, 0.20) transparent !important; }
    `;
    document.head.appendChild(styleEl);
  }, []);

  // Persist identity state
  useEffect(() => { safeWriteStorage(USERS_STORAGE_KEY, users); }, [users]);
  useEffect(() => { safeWriteStorage(TEAMS_STORAGE_KEY, teams); }, [teams]);
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        if (currentUserId) window.localStorage.setItem(CURRENT_USER_STORAGE_KEY, currentUserId);
        else window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
      }
    } catch {}
  }, [currentUserId]);
  useEffect(() => { safeWriteStorage(DELETED_BATCHES_STORAGE_KEY, deletedBatches); }, [deletedBatches]);
  useEffect(() => { safeWriteBucketStorage(BUCKETS_STORAGE_KEY, buckets); }, [buckets]);
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        if (activeBucketId) window.localStorage.setItem(ACTIVE_BUCKET_STORAGE_KEY, activeBucketId);
        else window.localStorage.removeItem(ACTIVE_BUCKET_STORAGE_KEY);
      }
    } catch {}
  }, [activeBucketId]);

  // Debounced dirty-batch save queue
  const batchSaveQueueRef  = useRef(new Map());
  const batchSaveTimerRef  = useRef(null);
  const batchSaveAbortRefs = useRef(new Map());
  const batchRefsPrimedRef = useRef(false);
  const previousBatchRefsRef = useRef(new Map());

  const flushBatchSaveQueue = useCallback(() => {
    clearTimeout(batchSaveTimerRef.current);
    batchSaveTimerRef.current = setTimeout(async () => {
      const entries = Array.from(batchSaveQueueRef.current.values());
      batchSaveQueueRef.current.clear();
      for (const rawBatch of entries) {
        if (!rawBatch || rawBatch._summary) continue;
        try {
          const serverVersion = batchServerVersionRefs.current.get(rawBatch.id) || rawBatch._serverUpdatedAt || null;
          const { result } = await persistBatchDurably(serverVersion ? { ...rawBatch, _serverUpdatedAt: serverVersion } : rawBatch);
          if (result?.updatedAt) batchServerVersionRefs.current.set(rawBatch.id, result.updatedAt);
          setLastPersistedAt(new Date().toLocaleTimeString());
          setPersistenceError(result?.s3SnapshotError ? `Batch ${rawBatch.id} was saved to DB, but S3 workflow snapshot failed: ${result.s3SnapshotError}` : null);
          previousBatchRefsRef.current.set(rawBatch.id, rawBatch);
        } catch (err) {
          if (err?.name === 'AbortError') continue;
          console.error('Batch persistence failed:', err);
          setPersistenceError(err?.message || 'Batch persistence failed. Work may not be saved yet.');
          batchSaveQueueRef.current.set(rawBatch.id, rawBatch);
        }
      }
      if (batchSaveQueueRef.current.size > 0) setTimeout(flushBatchSaveQueue, 5000);
    }, 250);
  }, []);

  useEffect(() => {
    if (!dbLoaded) return;
    const nextRefs = new Map();
    const changedFullBatches = [];
    for (const b of batches) {
      if (!b?.id) continue;
      nextRefs.set(b.id, b);
      if (b._summary) continue;
      const previous = previousBatchRefsRef.current.get(b.id);
      if (batchRefsPrimedRef.current && previous !== b) changedFullBatches.push(b);
    }
    if (!batchRefsPrimedRef.current) {
      previousBatchRefsRef.current = nextRefs;
      batchRefsPrimedRef.current = true;
      return;
    }
    previousBatchRefsRef.current = nextRefs;
    changedFullBatches.forEach(b => batchSaveQueueRef.current.set(b.id, b));
    if (changedFullBatches.length > 0) flushBatchSaveQueue();
  }, [batches, dbLoaded, flushBatchSaveQueue]);

  useEffect(() => () => {
    clearTimeout(batchSaveTimerRef.current);
    batchSaveAbortRefs.current.forEach(controller => controller.abort());
    batchSaveAbortRefs.current.clear();
  }, []);

  // Save newly-archived records to DB
  useEffect(() => {
    if (!dbLoaded) return;
    let cancelled = false;
    const unsavedRecords = archivedRecords.filter(rec => rec?.id && !dbSavedIdsRef.current.has(rec.id));
    if (unsavedRecords.length === 0) return () => { cancelled = true; };
    Promise.all(unsavedRecords.map(stripArchivedRecordForStorage)).then(stripped => {
      if (cancelled) return;
      dataClient.post('/archived-records/bulk', stripped)
        .then(() => {
          stripped.forEach(rec => dbSavedIdsRef.current.add(rec.id));
          setLastPersistedAt(new Date().toLocaleTimeString());
          setPersistenceError(null);
        })
        .catch((err) => {
          console.error('Archived record bulk persistence failed:', err);
          setPersistenceError(err?.message || 'Archived record persistence failed. Refresh is not safe yet.');
        });
    });
    return () => { cancelled = true; };
  }, [archivedRecords, dbLoaded]);

  // ─── Extraction jobs ────────────────────────────────────────────────────────
  const [extractionJobs, setExtractionJobs] = useState({});
  const [globalElapsedMs, setGlobalElapsedMs] = useState(0);
  const [globalLastTickAt, setGlobalLastTickAt] = useState(null);

  // Ensure every batch with status='extraction' has a fresh job slot
  useEffect(() => {
    setExtractionJobs(prev => {
      const next = { ...prev };
      let changed = false;
      for (const b of batches) {
        if (b.status !== 'extraction') continue;
        const existing = next[b.id];
        if (!existing || existing.done) { next[b.id] = makeFreshJob(b); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [batches]);

  const [hitlFocus, setHitlFocus] = useState(null);
  const [aiPanelRequest, setAiPanelRequest] = useState(false);

  // ─── Derived counts for sidebar badges ─────────────────────────────────────
  const extractingCount = batches.filter(b => b.status === 'extraction').length;
  const hitlReviewCount = batches
    .filter(b => {
      if (!b.records || b.records.length === 0) return false;
      if (b.status === 'hitl-review') return true;
      return b.records.some(r => r.qcReview?.status === 'sent-back' && getQcDestination(r.qcReview) === 'hitl' && !r.hitlReview);
    })
    .reduce((s, b) => s + (b.records || []).filter(r => {
      if (r.qcReview?.status === 'sent-back' && getQcDestination(r.qcReview) === 'preprep') return false;
      if (r.qcReview?.status === 'archived' || r.qcReview?.status === 'rejected') return false;
      const hitlDecided = r.hitlReview?.status === 'approved' || r.hitlReview?.status === 'hold';
      if (hitlDecided && r.qcReview?.status !== 'sent-back') return false;
      return true;
    }).length, 0);
  const qcPendingCount = batches.filter(b => b.status === 'qc-pending').reduce((s, b) => s + (b.records || []).filter(r => r.hitlReview && !r.qcReview?.status).length, 0);
  const pendingCounts = { hitl: hitlReviewCount, qc: qcPendingCount, extraction: extractingCount, preprep: 0 };
  pendingCounts.preprep = batches.reduce((s, b) => s + (b.records || []).filter(r => r.qcReview?.status === 'sent-back' && getQcDestination(r.qcReview) === 'preprep').length, 0);
  const reworkCount = batches.reduce((s, b) => s + (b.records || []).filter(r => r.qcReview?.status === 'sent-back' && getQcDestination(r.qcReview) === 'hitl' && !r.hitlReview).length, 0);

  // ─── Callbacks ─────────────────────────────────────────────────────────────

  const archiveRecords = (qcRecords, batchId) => {
    const now = new Date().toISOString();
    const actor = currentUser?.email || currentUser?.username || 'unknown';
    const sourceBatch = batches.find(b => b.id === batchId);
    const bucketId = sourceBatch?.bucketId || null;
    const newArchived = qcRecords.map(qc => {
      const lockedFields = qc.hitlReview?.lockedFields;
      const canonicalFields = lockedFields && Object.keys(lockedFields).length > 0 ? lockedFields : (qc.fields || {});
      return {
        id: `${batchId}:${qc.id}`,
        recordId: qc.recordId || qc.id,
        paymentMethod: qc.paymentMethod || 'Unknown',
        fields: canonicalFields,
        fieldsConf: qc.fieldsConf || {},
        aiFields: qc.fields || {},
        hitlReview: qc.hitlReview || null,
        qcReview: qc.qcReview || null,
        pages: qc.pages || [],
        pageTypeCodes: qc.pageTypeCodes || (qc.pages || []).map(p => p.code),
        filename: qc.filename || '',
        archivedAt: now,
        archivedBy: actor,
        lastModifiedAt: now,
        lastModifiedBy: actor,
        modificationHistory: [{ at: now, by: actor, action: 'archived' }],
        batchId: batchId,
        bucketId: bucketId,
        qcNotes: qc.outreach ? `Resolved via ${qc.outreach.method} outreach` : null,
        // Carry a flag set earlier at HITL/QC through to the archived record — the
        // backend's bulk upsert writes these into the archived_records DB columns,
        // which is what the Repository's "Flagged" tab/filter/count actually reads.
        flagged: !!qc.flagged,
        flagReason: qc.flagged ? (qc.flagReason || null) : null,
        flaggedBy: qc.flagged ? actor : null,
        flaggedAt: qc.flagged ? now : null
      };
    });
    // Replace existing copies of re-archived records instead of prepending duplicates.
    setArchivedRecords(prev => {
      const newIds = new Set(newArchived.map(r => r.id));
      return [...newArchived, ...prev.filter(r => !newIds.has(r.id))];
    });
    Promise.all(newArchived.map(stripArchivedRecordForStorage)).then(stripped => {
      dataClient.post('/archived-records/bulk', stripped)
        .then(() => {
          stripped.forEach(rec => dbSavedIdsRef.current.add(rec.id));
          setLastPersistedAt(new Date().toLocaleTimeString());
          setPersistenceError(null);
        })
        .catch((err) => {
          console.error('Archived record bulk persistence failed:', err);
          setPersistenceError(err?.message || 'Archived record persistence failed. Refresh is not safe yet.');
        });
    });
  };

  const addBatch = async (batch) => {
    const persistResult = await persistBatchDurably(batch);

    // Phase 6: Duplicate file detected — block extraction, show toast, do NOT add to state.
    if (persistResult.duplicate === true || persistResult.shouldBlockExtraction === true) {
      const first = persistResult.duplicates?.[0];
      const existingId = first?.existingBatchId;
      const detail = existingId ? ` Original batch: ${existingId}.` : '';
      toastBus.emit(
        'warning',
        'Duplicate File Detected',
        (persistResult.message || 'This file has already been uploaded.') + detail
      );
      return null;
    }

    const { result } = persistResult;
    if (result?.updatedAt) batchServerVersionRefs.current.set(batch.id, result.updatedAt);
    const savedBatch = result?.updatedAt ? { ...batch, _serverUpdatedAt: result.updatedAt } : batch;
    previousBatchRefsRef.current.set(batch.id, savedBatch);
    setBatches(prev => [savedBatch, ...prev.filter(existing => existing.id !== batch.id)]);
    setExtractionJobs(prev => ({ ...prev, [batch.id]: makeFreshJob(savedBatch) }));
    setLastPersistedAt(new Date().toLocaleTimeString());
    setPersistenceError(result?.s3SnapshotError ? `Batch ${batch.id} was saved to DB, but S3 workflow snapshot failed: ${result.s3SnapshotError}` : null);
    return savedBatch;
  };

  const deleteBatch = useCallback((batchId, reason) => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    const cascadedArchived = archivedRecords.filter(r => r.batchId === batchId);
    const auditEntry = {
      kind: 'batch', id: batchId, uploaded: batch.uploaded || null, uploader: batch.uploader || null,
      bucketId: batch.bucketId || null, recordCount: (batch.records || []).length,
      archivedRecordCount: cascadedArchived.length, deletedFromStage: batch.status || 'unknown',
      deletedAt: new Date().toISOString(), deletedBy: currentUser?.email || 'unknown', deletionReason: reason || ''
    };
    setBatches(prev => prev.filter(b => b.id !== batchId));
    setArchivedRecords(prev => prev.filter(r => r.batchId !== batchId));
    setExtractionJobs(prev => { const next = { ...prev }; delete next[batchId]; return next; });
    setDeletedBatches(prev => [auditEntry, ...prev]);
  }, [batches, archivedRecords, currentUser]);

  const deleteRecord = useCallback((batchId, recordId, reason) => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    const targetRec = (batch.records || []).find(r => r.id === recordId);
    if (!targetRec) return;
    const archivedMatch = archivedRecords.find(ar => ar.batchId === batchId && (ar.id === recordId || ar.recordId === targetRec.recordId));
    const auditEntry = {
      kind: 'record', id: targetRec.recordId || recordId, batchId: batchId,
      pageCount: (targetRec.pages || []).length, wasArchived: !!archivedMatch,
      deletedFromStage: batch.status || 'unknown', deletedAt: new Date().toISOString(),
      deletedBy: currentUser?.email || 'unknown', deletionReason: reason || ''
    };
    setBatches(prev => prev.map(b => b.id !== batchId ? b : { ...b, records: (b.records || []).filter(r => r.id !== recordId) }));
    if (archivedMatch) setArchivedRecords(prev => prev.filter(r => r !== archivedMatch));
    setDeletedBatches(prev => [auditEntry, ...prev]);
  }, [batches, archivedRecords, currentUser]);

  const startExtraction = (batchId) => {
    const now = Date.now();
    setExtractionJobs(prev => {
      const next = { ...prev };
      for (const [id, job] of Object.entries(prev)) {
        if (id !== batchId && job.running && !job.done) next[id] = { ...job, running: false, paused: true, lastTickAt: null };
      }
      const targetJob = prev[batchId];
      if (!targetJob || targetJob.done) return next;
      next[batchId] = { ...targetJob, started: true, running: true, paused: false, lastTickAt: now, startedAt: targetJob.startedAt || now };
      return next;
    });
    setGlobalLastTickAt(now);
  };

  const pauseExtraction = (batchId) => {
    setExtractionJobs(prev => {
      const job = prev[batchId];
      if (!job || !job.running || job.done) return prev;
      return { ...prev, [batchId]: { ...job, running: false, paused: true, lastTickAt: null } };
    });
  };

  const loadBatchDetail = useCallback((batchId) => {
    pgGetBatchDetail(batchId).then(fresh => {
      if (!fresh) return;
      if (fresh?._serverUpdatedAt) batchServerVersionRefs.current.set(batchId, fresh._serverUpdatedAt);
      const restored = restoreBatch(fresh);
      setBatches(prev => prev.map(b => b.id === batchId ? restored : b));
    });
  }, []);

  const updateRecordPairExtraction = (batchId, recordId, extraction) => {
    setBatches(prev => prev.map(b => {
      if (b.id !== batchId) return b;
      const records = (b.records || []).map(r => {
        if (r.id !== recordId) return r;
        return { ...r, extractedRecord: extraction, paymentMethod: extraction.paymentMethod || r.paymentMethod, extractionStatus: 'done' };
      });
      const allSettled = records.every(r => EXTRACTION_TERMINAL.has(r.extractionStatus));
      const nextStatus = (allSettled && b.status === 'extraction') ? 'hitl-review' : b.status;
      return { ...b, records, status: nextStatus };
    }));
  };

  const updateRecordHitlReview = useCallback((batchId, recordId, reviewState) => {
    setBatches(prev => prev.map(b => {
      if (b.id !== batchId) return b;
      const records = (b.records || []).map(r => {
        if (r.id !== recordId) return r;
        const updated = { ...r, hitlReview: reviewState };
        if (r.qcReview?.status === 'sent-back') delete updated.qcReview;
        return updated;
      });
      const isSettledForHitl = (r) => {
        if (r.hitlReview && (r.hitlReview.status === 'approved' || r.hitlReview.status === 'hold')) return true;
        if (r.qcReview?.status === 'sent-back' && getQcDestination(r.qcReview) === 'preprep') return true;
        if (r.qcReview?.status === 'archived' || r.qcReview?.status === 'rejected') return true;
        return false;
      };
      const allSettled = records.every(isSettledForHitl);
      const anyForQc = records.some(r => r.hitlReview && (r.hitlReview.status === 'approved' || r.hitlReview.status === 'hold'));
      const nextStatus = (allSettled && anyForQc && b.status === 'hitl-review') ? 'qc-pending' : b.status;
      return { ...b, records, status: nextStatus };
    }));
  }, []);

  const updateRecordQcReview = useCallback((batchId, recordIds, reviewState) => {
    const idSet = new Set(recordIds);
    const { __appendHistory, ...persistedState } = reviewState;
    setBatches(prev => prev.map(b => {
      if (b.id !== batchId) return b;
      const records = (b.records || []).map(r => {
        if (!idSet.has(r.id)) return r;
        const priorHistory = getQcHistory(r.qcReview);
        const mergedHistory = __appendHistory ? [...priorHistory, __appendHistory] : priorHistory;
        const next = { ...r, qcReview: { ...(r.qcReview || {}), ...persistedState, history: mergedHistory } };
        if (persistedState.status === 'rejected') { next.stage = 'rejected'; }
        else if (persistedState.status === 'archived') { next.stage = 'archived'; }
        return next;
      });
      const allTerminal = records.every(r => r.qcReview?.status === 'archived' || r.qcReview?.status === 'rejected');
      const isSettledForHitl = (r) => {
        if (r.hitlReview && (r.hitlReview.status === 'approved' || r.hitlReview.status === 'hold')) return true;
        if (r.qcReview?.status === 'archived' || r.qcReview?.status === 'rejected') return true;
        return false;
      };
      const allSettledForHitl = records.every(isSettledForHitl);
      const anyForQc = records.some(r => r.hitlReview && (r.hitlReview.status === 'approved' || r.hitlReview.status === 'hold'));
      let nextStatus = b.status;
      if (allTerminal) nextStatus = 'archived';
      else if (allSettledForHitl && anyForQc && b.status === 'hitl-review') nextStatus = 'qc-pending';
      return { ...b, records, status: nextStatus };
    }));
  }, []);

  // Cross-stage flag toggle — replaces the old "send back to upward stage" rework flow.
  // For pipeline-stage records (HITL/QC), this is purely client-side state on
  // batches[].records[]; the existing batch-autosave effect (below) persists it as
  // part of the whole-batch JSONB, same as any other record field. Archived records
  // are flagged separately via pgToggleArchivedRecordFlag against their own dedicated
  // endpoint (Repository/RecordDetailModal calls that directly).
  const updateRecordFlag = useCallback((batchId, recordId, flagged, reason = '') => {
    setBatches(prev => prev.map(b => {
      if (b.id !== batchId) return b;
      const records = (b.records || []).map(r => {
        if (r.id !== recordId) return r;
        return { ...r, flagged, flagReason: flagged ? reason : null };
      });
      return { ...b, records };
    }));
  }, []);

  const restoreRejectedRecord = useCallback((batchId, recordId, reviewer = 'unknown') => {
    const now = new Date().toISOString();
    setBatches(prev => prev.map(b => {
      if (b.id !== batchId) return b;
      const records = (b.records || []).map(r => {
        if (r.id !== recordId) return r;
        if (r.qcReview?.status !== 'rejected') return r;
        const priorHistory = getQcHistory(r.qcReview);
        const restoreEntry = { action: 'restored', destination: null, reason: 'Rejection reversed by admin', flaggedFields: [], flaggedPages: [], boundaryIssue: false, reviewer, at: now };
        const nextStage = r.hitlReview ? 'qc' : 'hitl';
        return { ...r, stage: nextStage, qcReview: { ...r.qcReview, status: null, destination: null, reviewedAt: now, reviewer, history: [...priorHistory, restoreEntry] } };
      });
      const needsHitl = records.some(r => !r.hitlReview && (r.stage === 'hitl' || r.stage === 'preprep') && r.extractedRecord);
      const needsQc = records.some(r => r.hitlReview && r.hitlReview.status === 'approved' && !r.qcReview?.status);
      let nextStatus = b.status;
      if (b.status === 'archived' && (needsHitl || needsQc)) nextStatus = needsHitl ? 'hitl-review' : 'qc-pending';
      else if (needsHitl && b.status !== 'extraction') nextStatus = 'hitl-review';
      else if (needsQc && b.status === 'archived') nextStatus = 'qc-pending';
      return { ...b, records, status: nextStatus };
    }));
  }, []);

  // ─── Extraction ticker refs (avoid re-creating interval on state change) ────
  const batchesRef = useRef(batches);
  const extractionJobsRef = useRef(extractionJobs);
  const globalLastTickAtRef = useRef(globalLastTickAt);
  useEffect(() => { batchesRef.current = batches; }, [batches]);
  useEffect(() => { extractionJobsRef.current = extractionJobs; }, [extractionJobs]);
  useEffect(() => { globalLastTickAtRef.current = globalLastTickAt; }, [globalLastTickAt]);

  // Master pipeline simulation ticker — 900ms interval
  useEffect(() => {
    const TICK_MS = 900;
    const interval = setInterval(() => {
      const tickAt = Date.now();
      setExtractionJobs(prevJobs => {
        const nextJobs = { ...prevJobs };
        let anyChanged = false;
        Object.entries(prevJobs).forEach(([batchId, job]) => {
          const batch = batchesRef.current.find(b => b.id === batchId);
          if (!batch || !job.running || job.done) return;
          const deltaMs = job.lastTickAt ? Math.max(0, tickAt - job.lastTickAt) : 0;
          const newElapsedMs = job.elapsedMs + deltaMs;
          const stepDurations = [3, Math.max(4, Math.ceil(job.totalPages / 8)), Math.max(5, Math.ceil(job.totalPages / 6)), Math.max(3, Math.ceil(job.totalFiles / 6)), Math.max(3, Math.ceil(batch.recordCount / 3)), 2, 2];
          const currentDuration = stepDurations[job.currentStep];
          const newProgress = job.stepProgress + 1;
          const STEP_NAMES = ['Document Ingestion', 'Page Rendering', 'OCR Extraction', 'Field Classification', 'Cross-Validation', 'Confidence Scoring', 'Routing to HITL'];
          const logEntry = { ts: new Date().toLocaleTimeString('en-US', { hour12: false }), step: STEP_NAMES[job.currentStep], message: 'Processing...', kind: 'info' };
          const filesDoneNew = Math.min(job.totalFiles, Math.floor(((job.currentStep + newProgress / currentDuration) / 7) * job.totalFiles));
          const pagesDoneNew = Math.min(job.totalPages, Math.floor(((job.currentStep + newProgress / currentDuration) / 7) * job.totalPages));
          const fieldsExtractedNew = Math.floor(filesDoneNew * 8);
          if (newProgress >= currentDuration) {
            if (job.currentStep >= 6) {
              nextJobs[batchId] = { ...job, running: false, done: true, lastTickAt: null, elapsedMs: newElapsedMs, currentStep: 6, stepProgress: currentDuration, logs: [...job.logs, logEntry, { ts: new Date().toLocaleTimeString('en-US', { hour12: false }), step: 'Complete', message: '✓ Batch ready for HITL Review', kind: 'success' }].slice(-50), filesDone: job.totalFiles, pagesDone: job.totalPages, fieldsExtracted: fieldsExtractedNew };
              setTimeout(() => { setBatches(bs => bs.map(b => b.id !== batchId ? b : { ...b, status: 'hitl-review', progress: 60 })); }, 0);
            } else {
              nextJobs[batchId] = { ...job, lastTickAt: tickAt, elapsedMs: newElapsedMs, currentStep: job.currentStep + 1, stepProgress: 0, logs: [...job.logs, logEntry, { ts: new Date().toLocaleTimeString('en-US', { hour12: false }), step: STEP_NAMES[job.currentStep], message: `✓ ${STEP_NAMES[job.currentStep]} complete`, kind: 'success' }].slice(-50), filesDone: filesDoneNew, pagesDone: pagesDoneNew, fieldsExtracted: fieldsExtractedNew };
            }
          } else {
            nextJobs[batchId] = { ...job, lastTickAt: tickAt, elapsedMs: newElapsedMs, stepProgress: newProgress, logs: [...job.logs, logEntry].slice(-50), filesDone: filesDoneNew, pagesDone: pagesDoneNew, fieldsExtracted: fieldsExtractedNew };
          }
          anyChanged = true;
        });
        return anyChanged ? nextJobs : prevJobs;
      });
      setGlobalElapsedMs(prevElapsed => {
        const anyRunning = Object.values(extractionJobsRef.current).some(j => (j.running && !j.done) || j.realExtractionPhase === 'running');
        if (!anyRunning) { setGlobalLastTickAt(null); return prevElapsed; }
        const lastAt = globalLastTickAtRef.current;
        const delta = lastAt ? Math.max(0, tickAt - lastAt) : 0;
        setGlobalLastTickAt(tickAt);
        return prevElapsed + delta;
      });
    }, TICK_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real AI extraction worker — fires actual API calls for running batches
  const realInFlightRef = useRef(new Set());
  useEffect(() => {
    const startable = batches.filter(b => {
      const job = extractionJobs[b.id];
      if (!job?.running || job?.done) return false;
      if (realInFlightRef.current.has(b.id)) return false;
      // Phase 7: Safety guard — never run extraction for duplicate-blocked batches.
      if (b.duplicate === true || b.shouldBlockExtraction === true || b.status === 'duplicate') return false;
      const allDone = (b.records || []).every(r => r.extractionStatus === 'done');
      if (allDone) return false;
      const hasFiles = (b.records || []).some(r => (r.pages || []).some(p => !!p.file || !!p.pageStored || !!p.fileBase64));
      if (!hasFiles) return false;
      return true;
    });

    for (const batch of startable) {
      realInFlightRef.current.add(batch.id);
      (async () => {
        const records = batch.records || [];
        let realFieldsTotal = 0;
        const realConfidences = [];
        const countRealFields = (raw) => {
          if (!raw) return 0;
          let n = 0;
          for (const v of Object.values(raw.donor || {})) { if (v && v.toString().trim()) n++; }
          for (const v of Object.values(raw.donation || {})) { if (v && v.toString().trim()) n++; }
          if (raw.paymentMethod && raw.paymentMethod !== 'Unknown') n++;
          return n;
        };
        const collectRealConfidences = (raw) => {
          if (!raw) return [];
          const arr = [];
          for (const c of Object.values(raw.donorConf || {})) { if (typeof c === 'number' && c > 0) arr.push(c); }
          for (const c of Object.values(raw.donationConf || {})) { if (typeof c === 'number' && c > 0) arr.push(c); }
          if (typeof raw.paymentMethodConf === 'number' && raw.paymentMethodConf > 0) arr.push(raw.paymentMethodConf);
          return arr;
        };
        for (let i = 0; i < records.length; i++) {
          const rec = records[i];
          if (rec.extractionStatus === 'done') {
            realFieldsTotal += countRealFields(rec.extractedRecord);
            realConfidences.push(...collectRealConfidences(rec.extractedRecord));
            continue;
          }
          const currentJob = extractionJobsRef.current[batch.id];
          if (!currentJob || currentJob.paused || (currentJob.done === false && !currentJob.running)) break;
          if (!rec.pages || rec.pages.length === 0) continue;
          try {
            const pages = await Promise.all((rec.pages || []).map(async p => {
              if (p.file || !p.pageStored) return p;
              const fname = p.filename || p.name || 'page.pdf';
              const data = await pgFetchBatchPage(batch.id, rec.recordId || rec.id, fname);
              // originalUrl = original uploaded PDF (correct for AI extraction).
              // url         = WebP preview (display only — wrong type for Claude document API).
              const fileUrl = data?.originalUrl || data?.url;
              const mimeType = data?.originalUrl ? 'application/pdf' : (data?.mimeType || 'application/pdf');
              if (fileUrl) {
                try {
                  const resp = await fetch(fileUrl);
                  const buf  = await resp.arrayBuffer();
                  return { ...p, file: new File([buf], fname, { type: mimeType }) };
                } catch (e) {
                  console.warn('[Extraction] Failed to fetch page file:', fname, e?.message);
                }
              }
              return p;
            }));
            const result = await extractDonationRecord(pages);
            updateRecordPairExtraction(batch.id, rec.id, result);
            recordRecordExtracted(rec.pages?.length || 0);
            const recFieldsCount = countRealFields(result);
            const recConfs = collectRealConfidences(result);
            realFieldsTotal += recFieldsCount;
            realConfidences.push(...recConfs);
            const avgConf = realConfidences.length > 0 ? Math.round(realConfidences.reduce((s, c) => s + c, 0) / realConfidences.length) : null;
            setExtractionJobs(prev => {
              const j = prev[batch.id];
              if (!j) return prev;
              return { ...prev, [batch.id]: { ...j, realFieldsExtracted: realFieldsTotal, realAvgConfidence: avgConf, realRecordsDone: i + 1, realExtractionPhase: 'running', logs: [...(j.logs || []), { ts: new Date().toLocaleTimeString('en-US', { hour12: false }), step: 'Field Classification', message: `✓ Extracted record ${rec.recordId} — ${recFieldsCount} fields`, kind: 'success' }].slice(-50) } };
            });
          } catch (err) {
            const isNoPrimary = err?.message === 'NO_PRIMARY_PAGES';
            if (!isNoPrimary) console.error('Extraction failed for record', rec.id, err);
            const newStatus = isNoPrimary ? 'skipped' : 'error';
            setBatches(prev => prev.map(b => {
              if (b.id !== batch.id) return b;
              const records = (b.records || []).map(r => r.id === rec.id ? { ...r, extractionStatus: newStatus, extractionError: isNoPrimary ? 'No extractable pages (LF/LB/back pages skipped)' : (err?.message || 'extraction failed') } : r);
              const allSettled = records.every(r => EXTRACTION_TERMINAL.has(r.extractionStatus));
              return { ...b, records, status: (allSettled && b.status === 'extraction') ? 'hitl-review' : b.status };
            }));
            setExtractionJobs(prev => {
              const j = prev[batch.id];
              if (!j) return prev;
              return { ...prev, [batch.id]: { ...j, logs: [...(j.logs || []), { ts: new Date().toLocaleTimeString('en-US', { hour12: false }), step: 'Field Classification', message: isNoPrimary ? `⊘ Skipped record ${rec.recordId}: no extractable pages` : `✗ Failed record ${rec.recordId}: ${err?.message?.slice(0, 60) || 'extraction error'}`, kind: isNoPrimary ? 'skip' : 'error' }].slice(-50) } };
            });
          }
        }
        setExtractionJobs(prev => { const j = prev[batch.id]; if (!j) return prev; return { ...prev, [batch.id]: { ...j, realExtractionPhase: 'done' } }; });
        realInFlightRef.current.delete(batch.id);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches, extractionJobs]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen min-h-0 w-full flex flex-col bg-slate-100 text-slate-800 overflow-hidden" style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        *::-webkit-scrollbar { width: 6px !important; height: 6px !important; }
        *::-webkit-scrollbar-track { background: transparent !important; }
        *::-webkit-scrollbar-thumb { background-color: rgba(100, 116, 139, 0.35) !important; border-radius: 8px !important; border: 1px solid transparent !important; background-clip: padding-box !important; transition: background-color 0.15s ease !important; }
        *::-webkit-scrollbar-thumb:hover { background-color: rgba(71, 85, 105, 0.6) !important; }
        *::-webkit-scrollbar-corner { background: transparent !important; }
        *::-webkit-scrollbar-button { display: none !important; width: 0 !important; height: 0 !important; }
        * { scrollbar-width: thin !important; scrollbar-color: rgba(100, 116, 139, 0.35) transparent !important; }
        .scroll-dark::-webkit-scrollbar-thumb { background-color: rgba(226, 232, 240, 0.20) !important; }
        .scroll-dark::-webkit-scrollbar-thumb:hover { background-color: rgba(226, 232, 240, 0.40) !important; }
        .scroll-dark { scrollbar-color: rgba(226, 232, 240, 0.20) transparent !important; }
      ` }} />

      {!jwtAuth ? (
        <LoginScreen />
      ) : (() => {
        const isBrowserOnly = hasFeature(currentUser, 'repository.browser') && !hasFeature(currentUser, 'repository.full');
        if (isBrowserOnly) {
          return (
            <BrowserShell
              currentUser={currentUser}
              archivedRecords={archivedRecords}
              onLogout={handleAppLogout}
              aiPanelRequest={aiPanelRequest}
              clearAiPanelRequest={() => setAiPanelRequest(false)}
              sseActive={sseActive}
            />
          );
        }
        return (
          <>
            <Header
              currentUser={currentUser}
              allUsers={users}
              onSwitchUser={(uid) => { setCurrentUserId(uid); setRoute('dashboard'); }}
              onLogout={handleAppLogout}
              reworkCount={reworkCount}
              onClickBell={() => { if (reworkCount > 0) setRoute('hitl'); }}
              onMenuClick={() => setSidebarOpen(v => !v)}
            />
            <div className="flex-1 flex overflow-hidden">
              <Sidebar
                route={route}
                setRoute={setRoute}
                collapsed={collapsed}
                setCollapsed={setCollapsed}
                pendingCounts={pendingCounts}
                sidebarOpen={sidebarOpen}
                setSidebarOpen={setSidebarOpen}
              />
              <main className="flex-1 flex flex-col overflow-hidden">
                {persistenceError && (
                  <div className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 shadow-sm">
                    Save failed: {persistenceError} Refresh is not safe until this is resolved.
                    <button className="ml-3 underline" onClick={() => setPersistenceError(null)}>Dismiss</button>
                  </div>
                )}
                {!persistenceError && lastPersistedAt && (
                  <div className="mx-4 mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 shadow-sm">
                    Saved to S3/DB at {lastPersistedAt}
                  </div>
                )}
                <ErrorBoundary key={route}>
                  {(() => {
                    const routePermissionMap = {
                      'pre-prep':    'BATCH_UPDATE',
                      'import':      'BATCH_CREATE',
                      'extraction':  'AI_EXTRACT',
                      'hitl':        'BATCH_UPDATE',
                      'qc':          'BATCH_UPDATE',
                      'repository':  'ARCHIVED_RECORD_READ',
                      'reports':     'REPORT_VIEW',
                      'workflow':    'BATCH_READ',
                      'users':       'USER_READ',
                      'roles':       'ROLE_READ',
                      'permissions': 'PERMISSION_READ',
                      'tenants':     'TENANT_READ',
                      'settings':    'PAGE_SETTINGS',
                    };
                    // Role minimum — some routes require at least admin regardless of permissions
                    const routeMinRoleMap = {
                      'users':       'admin',
                      'roles':       'admin',
                      'permissions': 'admin',
                      'tenants':     'admin',
                    };
                    const ROLE_RANK = { user: 0, client: 1, admin: 2, superadmin: 3 };
                    const callerRank = ROLE_RANK[jwtAuth?.role] ?? 0;
                    const requiredPerm    = routePermissionMap[route];
                    const requiredMinRole = routeMinRoleMap[route];
                    const roleBlocked = requiredMinRole && callerRank < (ROLE_RANK[requiredMinRole] ?? 0);
                    // For role-gated routes, role rank is authoritative — skip permission check
                    const permBlocked = requiredPerm && !requiredMinRole && !jwtAuth?.authorities?.has(requiredPerm);
                    // Role block: show explanation screen (hard policy — role rank can't change mid-session)
                    if (roleBlocked) {
                      return <AccessDeniedScreen currentUser={currentUser} onGoHome={() => setRoute('dashboard')} />;
                    }
                    // Permission block: redirect to dashboard instead of showing a blocking error.
                    // Permissions can be revoked mid-session (DynamicPermissionService + refreshAuth),
                    // so redirecting is better UX than leaving the user stuck on an error screen.
                    if (permBlocked) {
                      return <Navigate to="/" replace />;
                    }
                    return (
                      <>
                        {route === 'dashboard'    && <DashboardScreen setRoute={setRoute} batches={batches} archivedRecords={archivedRecords} pendingCounts={pendingCounts} setAiPanelRequest={setAiPanelRequest} />}
                        {route === 'pre-prep'     && <PrePrepScreen setRoute={setRoute} addBatch={addBatch} batches={batches} updateRecordQcReview={updateRecordQcReview} updateRecordFlag={updateRecordFlag} setBatches={setBatches} loadBatchDetail={loadBatchDetail} />}
                        {route === 'import'       && <ImportScreen batches={batches} addBatch={addBatch} setRoute={setRoute} buckets={buckets} setBuckets={setBuckets} activeBucketId={activeBucketId} setActiveBucketId={setActiveBucketId} />}
                        {route === 'extraction'   && <ExtractionScreen batches={batches} extractionJobs={extractionJobs} startExtraction={startExtraction} pauseExtraction={pauseExtraction} globalElapsedMs={globalElapsedMs} setRoute={setRoute} />}
                        {route === 'hitl'         && <HITLScreen batches={batches} hitlFocus={hitlFocus} clearHitlFocus={() => setHitlFocus(null)} updateRecordPairExtraction={updateRecordPairExtraction} updateRecordHitlReview={updateRecordHitlReview} updateRecordFlag={updateRecordFlag} loadBatchDetail={loadBatchDetail} currentUser={currentUser} />}
                        {route === 'qc'           && <QCScreen batches={batches} archiveRecords={archiveRecords} setRoute={setRoute} setHitlFocus={setHitlFocus} updateRecordQcReview={updateRecordQcReview} updateRecordFlag={updateRecordFlag} loadBatchDetail={loadBatchDetail} currentUser={currentUser} />}
                        {route === 'repository'   && <RepositoryScreen archivedRecords={archivedRecords} setArchivedRecords={setArchivedRecords} aiPanelRequest={aiPanelRequest} clearAiPanelRequest={() => setAiPanelRequest(false)} sseActive={sseActive} />}
                        {route === 'reports'      && <ReportsScreen batches={batches} archivedRecords={archivedRecords} buckets={buckets} restoreRejectedRecord={restoreRejectedRecord} currentUser={currentUser} />}
                        {route === 'workflow'     && <BatchManagerScreen batches={batches} archivedRecords={archivedRecords} deletedBatches={deletedBatches} deleteBatch={deleteBatch} deleteRecord={deleteRecord} setRoute={setRoute} />}
                        {route === 'users'        && <UserManagementScreen />}
                        {route === 'roles'        && <RolesScreen />}
                        {route === 'permissions'  && <PermissionsScreen />}
                        {route === 'tenants'      && <TenantsScreen />}
                        {route === 'integrations' && <IntegrationsScreen buckets={buckets} setBuckets={setBuckets} activeBucketId={activeBucketId} setActiveBucketId={setActiveBucketId} batches={batches} />}
                        {route === 'billing'      && <BillingScreen />}
                        {route === 'settings'     && <SettingsScreen />}
                      </>
                    );
                  })()}
                </ErrorBoundary>
              </main>
            </div>
          </>
        );
      })()}
    </div>
  );
}

// Thin bridge between JWT auth context and SalvationArmyApp
function SAAppWrapper() {
  return (
    <div style={{ display: 'contents' }}>
      <SalvationArmyApp />
    </div>
  );
}

// Top-level router
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<SALoginPage />} />
        <Route path="/admin" element={
          <ProtectedRoute requiredRole="admin">
            <AdminPage />
          </ProtectedRoute>
        } />
        <Route path="/*" element={
          <ProtectedRoute>
            <SAAppWrapper />
          </ProtectedRoute>
        } />
      </Routes>
    </AuthProvider>
  );
}
