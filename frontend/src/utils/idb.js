// =============================================================================
// PRE-PREP INDEXEDDB PERSISTENCE
// =============================================================================
export const IDB_PREPREP_NAME    = 'sadrmp-preprep';
export const IDB_PREPREP_VERSION = 2;
export const IDB_PREPREP_STORE   = 'intake';
export const IDB_PREPREP_META_STORE = 'meta';

export function openPrePrepDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_PREPREP_NAME, IDB_PREPREP_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_PREPREP_STORE)) {
        db.createObjectStore(IDB_PREPREP_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(IDB_PREPREP_META_STORE)) {
        db.createObjectStore(IDB_PREPREP_META_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror  = (e) => reject(e.target.error);
  });
}

export async function idbSaveIntake(docs) {
  try {
    const db = await openPrePrepDB();
    const tx = db.transaction(IDB_PREPREP_STORE, 'readwrite');
    const store = tx.objectStore(IDB_PREPREP_STORE);
    store.clear();
    docs.forEach(doc => {
      const { pdfDoc: _ignored, ...storable } = doc;
      store.put(storable);
    });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = (e) => rej(e.target.error); });
    db.close();
  } catch (e) { console.warn('IDB preprep save failed:', e); }
}

export async function idbLoadIntake() {
  try {
    const db = await openPrePrepDB();
    const tx = db.transaction(IDB_PREPREP_STORE, 'readonly');
    const docs = await new Promise((res, rej) => {
      const req = tx.objectStore(IDB_PREPREP_STORE).getAll();
      req.onsuccess = (e) => res(e.target.result || []);
      req.onerror   = (e) => rej(e.target.error);
    });
    db.close();
    return docs;
  } catch (e) { console.warn('IDB preprep load failed:', e); return []; }
}

export async function idbClearIntake() {
  try {
    const db = await openPrePrepDB();
    const tx = db.transaction(IDB_PREPREP_STORE, 'readwrite');
    tx.objectStore(IDB_PREPREP_STORE).clear();
    db.close();
  } catch (e) { console.warn('IDB preprep clear failed:', e); }
}

export async function idbSaveMeta(meta) {
  try {
    const db = await openPrePrepDB();
    const tx = db.transaction(IDB_PREPREP_META_STORE, 'readwrite');
    tx.objectStore(IDB_PREPREP_META_STORE).put({ id: 'config', ...meta });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = (e) => rej(e.target.error); });
    db.close();
  } catch (e) { console.warn('IDB preprep meta save failed:', e); }
}

export async function idbLoadMeta() {
  try {
    const db = await openPrePrepDB();
    const tx = db.transaction(IDB_PREPREP_META_STORE, 'readonly');
    const record = await new Promise((res, rej) => {
      const req = tx.objectStore(IDB_PREPREP_META_STORE).get('config');
      req.onsuccess = (e) => res(e.target.result || null);
      req.onerror   = (e) => rej(e.target.error);
    });
    db.close();
    return record;
  } catch (e) { console.warn('IDB preprep meta load failed:', e); return null; }
}

export async function idbClearMeta() {
  try {
    const db = await openPrePrepDB();
    const tx = db.transaction(IDB_PREPREP_META_STORE, 'readwrite');
    tx.objectStore(IDB_PREPREP_META_STORE).clear();
    db.close();
  } catch (e) { console.warn('IDB preprep meta clear failed:', e); }
}
