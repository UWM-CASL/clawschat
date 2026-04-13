const SEMANTIC_MEMORY_DB_NAME = 'browser-llm-runner-semantic-memory-db';
const SEMANTIC_MEMORY_DB_VERSION = 1;
const SEMANTIC_MEMORY_STORE_NAME = 'semanticMemories';

function openSemanticMemoryDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    const request = indexedDB.open(SEMANTIC_MEMORY_DB_NAME, SEMANTIC_MEMORY_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SEMANTIC_MEMORY_STORE_NAME)) {
        db.createObjectStore(SEMANTIC_MEMORY_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open the semantic memory IndexedDB database.'));
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

function withTransaction(db, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SEMANTIC_MEMORY_STORE_NAME], mode);
    const store = transaction.objectStore(SEMANTIC_MEMORY_STORE_NAME);

    Promise.resolve()
      .then(() => operation(store, transaction))
      .then(resolve)
      .catch(reject);

    transaction.onerror = () => {
      reject(transaction.error || new Error('Semantic memory transaction failed.'));
    };
    transaction.onabort = () => {
      reject(transaction.error || new Error('Semantic memory transaction was aborted.'));
    };
  });
}

export async function loadSemanticMemories() {
  const db = await openSemanticMemoryDb();
  if (!db) {
    return [];
  }
  try {
    const records = await withTransaction(db, 'readonly', (store) =>
      requestToPromise(store.getAll(), 'Failed to read semantic memories from IndexedDB.')
    );
    return Array.isArray(records) ? records : [];
  } finally {
    db.close();
  }
}

export async function replaceSemanticMemories(records = []) {
  const db = await openSemanticMemoryDb();
  if (!db) {
    return;
  }
  try {
    await withTransaction(db, 'readwrite', async (store) => {
      store.clear();
      const normalizedRecords = Array.isArray(records) ? records.filter(Boolean) : [];
      for (const record of normalizedRecords) {
        store.put(record);
      }
    });
  } finally {
    db.close();
  }
}

export async function clearSemanticMemories() {
  const db = await openSemanticMemoryDb();
  if (!db) {
    return;
  }
  try {
    await withTransaction(db, 'readwrite', (store) => {
      store.clear();
    });
  } finally {
    db.close();
  }
}
