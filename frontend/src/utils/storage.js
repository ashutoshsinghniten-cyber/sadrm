import { DEFAULT_USERS, DEFAULT_TEAMS } from '../constants/features.js';

export const BUCKETS_STORAGE_KEY = 'sadrmp.s3.buckets.v1';
export const ACTIVE_BUCKET_STORAGE_KEY = 'sadrmp.s3.activeBucketId.v1';
export const BATCHES_STORAGE_KEY = 'sadrmp.batches.v1';
export const ARCHIVED_RECORDS_STORAGE_KEY = 'sadrmp.archivedRecords.v1';
export const USERS_STORAGE_KEY = 'sadrmp.users.v1';
export const TEAMS_STORAGE_KEY = 'sadrmp.teams.v1';
export const CURRENT_USER_STORAGE_KEY = 'sadrmp.currentUserId.v1';
export const DELETED_BATCHES_STORAGE_KEY = 'sadrmp.deletedBatches.v1';

// =============================================================================
// BUCKET PERSISTENCE EXEMPTION (v3.13.25)
// S3 bucket connections are infrastructure config, not session data.
// =============================================================================
export const safeReadBucketStorage = (key, fallback) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

export const safeWriteBucketStorage = (key, value) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

export const safeReadStorage = (key, fallback) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`Failed to read ${key} from localStorage:`, e);
    return fallback;
  }
};

export const safeWriteStorage = (key, value) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Failed to write ${key} to localStorage:`, e);
  }
};

export const loadBucketsFromStorage = () => {
  const v = safeReadBucketStorage(BUCKETS_STORAGE_KEY, []);
  return Array.isArray(v) ? v : [];
};

export const loadActiveBucketIdFromStorage = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(ACTIVE_BUCKET_STORAGE_KEY) || null;
  } catch {
    return null;
  }
};

export const loadUsersFromStorage = () => {
  const v = safeReadStorage(USERS_STORAGE_KEY, null);
  if (Array.isArray(v) && v.length > 0) return v;
  safeWriteStorage(USERS_STORAGE_KEY, DEFAULT_USERS);
  return DEFAULT_USERS;
};

export const loadTeamsFromStorage = () => {
  const v = safeReadStorage(TEAMS_STORAGE_KEY, null);
  if (Array.isArray(v) && v.length > 0) return v;
  safeWriteStorage(TEAMS_STORAGE_KEY, DEFAULT_TEAMS);
  return DEFAULT_TEAMS;
};

export const loadCurrentUserIdFromStorage = () => {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage?.getItem(CURRENT_USER_STORAGE_KEY) || null;
  } catch { return null; }
};

export const loadDeletedBatchesFromStorage = () => {
  const v = safeReadStorage(DELETED_BATCHES_STORAGE_KEY, []);
  return Array.isArray(v) ? v : [];
};

export { getAuthToken } from './pgApi.js';
export { pageToStorable, pageToStorableLite, stripBatchForStorage, restorePage, restoreBatch, restoreArchivedRecord, stripArchivedRecordForStorage, persistBatchDurably } from './pgApi.js';
