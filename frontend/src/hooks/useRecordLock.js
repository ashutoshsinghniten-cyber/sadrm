import { useState, useEffect, useCallback } from 'react';
import { recordLocksApi } from '../lib/api';

export function useRecordLock(batchId, recordId, username) {
  const [locked, setLocked]       = useState(false);
  const [lockedBy, setLockedBy]   = useState(null);
  const [acquiring, setAcquiring] = useState(false);
  const [error, setError]         = useState(null);

  const release = useCallback(async () => {
    if (!batchId || !recordId) return;
    try { await recordLocksApi.release(batchId, recordId); } catch {}
  }, [batchId, recordId]);

  useEffect(() => {
    if (!batchId || !recordId || !username) return;
    let cancelled = false;
    setAcquiring(true);
    setError(null);

    recordLocksApi.acquire(batchId, recordId, username)
      .then(() => {
        if (!cancelled) { setLocked(false); setLockedBy(null); }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.status === 409) {
          const by = err?.response?.data?.lockedBy ?? 'another user';
          setLocked(true);
          setLockedBy(by);
        } else {
          setError(err?.message ?? 'Failed to acquire lock');
        }
      })
      .finally(() => { if (!cancelled) setAcquiring(false); });

    return () => {
      cancelled = true;
      release();
    };
  }, [batchId, recordId, username, release]);

  return { locked, lockedBy, acquiring, error, release };
}
