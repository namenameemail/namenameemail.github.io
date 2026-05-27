/**
 * Persist app state in IndexedDB (with one-time migration from localStorage).
 */

import { STORAGE_KEY, normalizeState } from './state.js';

const DB_NAME = 'room_visualizer';
const DB_VERSION = 1;
const STORE = 'kv';
const STATE_RECORD_KEY = 'app';

/** @type {Promise<IDBDatabase>|null} */
let dbPromise = null;

const LEGACY_LOCAL_KEYS = [
  STORAGE_KEY,
  'room_visualizer_state_v3',
  'room_visualizer_state_v2',
  'room_visualizer_state_v1',
];

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('IndexedDB is not available'));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));

      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = /** @type {IDBOpenDBRequest} */ (event.target).result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
    });
  }

  return dbPromise;
}

/**
 * @param {string} key
 * @returns {Promise<unknown>}
 */
async function idbGet(key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {string} key
 * @param {unknown} value
 */
async function idbPut(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * @returns {string|null}
 */
function readLegacyLocalStorage() {
  for (const key of LEGACY_LOCAL_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw) return raw;
  }
  return null;
}

function clearLegacyLocalStorage() {
  for (const key of LEGACY_LOCAL_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch (_) {}
  }
}

/**
 * @param {unknown} raw
 * @returns {raw is import('./state.js').AppState}
 */
function isPersistedShape(raw) {
  return !!raw && typeof raw === 'object' && Array.isArray(/** @type {{projects?: unknown}} */ (raw).projects);
}

/**
 * @param {import('./state.js').AppState} state
 */
function hasProjects(state) {
  return state.projects.length > 0;
}

/**
 * @param {string} raw
 * @returns {import('./state.js').AppState|null}
 */
function parseLegacy(raw) {
  try {
    return normalizeState(JSON.parse(raw));
  } catch (e) {
    console.warn('Legacy state parse failed', e);
    return null;
  }
}

/**
 * @returns {Promise<import('./state.js').AppState|null>}
 */
export async function loadPersistedState() {
  /** @type {import('./state.js').AppState|null} */
  let fromIdb = null;

  try {
    const raw = await idbGet(STATE_RECORD_KEY);
    if (isPersistedShape(raw)) {
      fromIdb = normalizeState(raw);
    } else if (raw != null) {
      console.warn('IndexedDB state ignored: invalid shape', raw);
    }
  } catch (e) {
    console.warn('IndexedDB load failed, trying localStorage', e);
  }

  const legacyRaw = readLegacyLocalStorage();
  const fromLegacy = legacyRaw ? parseLegacy(legacyRaw) : null;

  if (fromIdb && hasProjects(fromIdb)) {
    return fromIdb;
  }

  if (fromLegacy && hasProjects(fromLegacy)) {
    try {
      await savePersistedState(fromLegacy);
      if (fromIdb && !hasProjects(fromIdb)) {
        console.warn('Recovered project from localStorage (IndexedDB was empty)');
      }
      clearLegacyLocalStorage();
    } catch (e) {
      console.warn('Could not persist recovered state to IndexedDB', e);
    }
    return fromLegacy;
  }

  if (fromIdb) return fromIdb;

  return fromLegacy;
}

/**
 * @param {import('./state.js').AppState} state
 */
export async function savePersistedState(state) {
  if (!hasProjects(state)) {
    console.warn('savePersistedState skipped: no projects in state');
    return;
  }

  try {
    await idbPut(STATE_RECORD_KEY, state);
  } catch (e) {
    console.warn('IndexedDB save failed, falling back to localStorage', e);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e2) {
      console.warn('localStorage fallback save failed', e2);
      throw e2;
    }
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {
    /* backup copy optional */
  }
}