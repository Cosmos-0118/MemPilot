export const DB_NAME = 'MemPilotDB';
export const DB_VERSION = 1;

export const STORES = {
  tabLedger: 'tabLedger',
} as const;

export interface LedgerEntry {
  id?: number;
  timestamp: number;
  action: 'discard' | 'freeze';
  source: 'native' | 'mempilot';
  tabId: number;
  url: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export const initDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORES.tabLedger)) {
        const store = db.createObjectStore(STORES.tabLedger, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('tabId', 'tabId', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });

  return dbPromise;
};

export const addLedgerEntry = async (entry: Omit<LedgerEntry, 'id'>): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.tabLedger, 'readwrite');
    const store = transaction.objectStore(STORES.tabLedger);
    const request = store.add(entry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getLedgerEntries = async (limit = 100): Promise<LedgerEntry[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.tabLedger, 'readonly');
    const store = transaction.objectStore(STORES.tabLedger);
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev'); // descending

    const results: LedgerEntry[] = [];
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = () => reject(request.error);
  });
};
