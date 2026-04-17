import {
  assertValidCustomOrchestration,
  normalizeCustomOrchestrations,
} from '../orchestrations/custom-orchestrations.js';

const ORCHESTRATION_DB_NAME = 'browser-llm-runner-orchestrations-db';
const ORCHESTRATION_DB_VERSION = 1;
const ORCHESTRATION_STORE_NAME = 'customOrchestrations';

function openOrchestrationDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    const request = indexedDB.open(ORCHESTRATION_DB_NAME, ORCHESTRATION_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ORCHESTRATION_STORE_NAME)) {
        db.createObjectStore(ORCHESTRATION_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open the custom orchestration database.'));
    };
  });
}

function requestToPromise(request, errorMessage) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error || new Error(errorMessage));
    };
  });
}

function withTransaction(db, storeName, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], mode);
    const store = transaction.objectStore(storeName);

    Promise.resolve()
      .then(() => operation(store, transaction))
      .then(resolve)
      .catch(reject);

    transaction.onerror = () => {
      reject(transaction.error || new Error('Custom orchestration transaction failed.'));
    };
    transaction.onabort = () => {
      reject(transaction.error || new Error('Custom orchestration transaction was aborted.'));
    };
  });
}

export async function loadCustomOrchestrations() {
  const db = await openOrchestrationDb();
  if (!db) {
    return [];
  }
  try {
    const customOrchestrations = await withTransaction(
      db,
      ORCHESTRATION_STORE_NAME,
      'readonly',
      (store) =>
        requestToPromise(
          store.getAll(),
          'Failed to read saved custom orchestrations from IndexedDB.'
        )
    );
    return normalizeCustomOrchestrations(customOrchestrations);
  } finally {
    db.close();
  }
}

export async function saveCustomOrchestration(orchestration) {
  const db = await openOrchestrationDb();
  if (!db) {
    return null;
  }
  try {
    const normalizedRecord = assertValidCustomOrchestration({
      ...orchestration,
      updatedAt: Date.now(),
      importedAt:
        Number.isFinite(orchestration?.importedAt) && orchestration.importedAt > 0
          ? Number(orchestration.importedAt)
          : Date.now(),
    });
    await withTransaction(db, ORCHESTRATION_STORE_NAME, 'readwrite', (store) => {
      store.put(normalizedRecord);
    });
    return normalizedRecord;
  } finally {
    db.close();
  }
}

export async function removeCustomOrchestration(orchestrationId) {
  const normalizedId =
    typeof orchestrationId === 'string' && orchestrationId.trim() ? orchestrationId.trim() : '';
  if (!normalizedId) {
    return false;
  }
  const db = await openOrchestrationDb();
  if (!db) {
    return false;
  }
  try {
    await withTransaction(db, ORCHESTRATION_STORE_NAME, 'readwrite', (store) => {
      store.delete(normalizedId);
    });
    return true;
  } finally {
    db.close();
  }
}
