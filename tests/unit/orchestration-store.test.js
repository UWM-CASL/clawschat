import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  loadCustomOrchestrations,
  removeCustomOrchestration,
  saveCustomOrchestration,
} from '../../src/state/orchestration-store.js';

function createFakeIndexedDb() {
  const stores = new Map();

  function ensureStore(name) {
    if (!stores.has(name)) {
      stores.set(name, new Map());
    }
    return stores.get(name);
  }

  function createRequest(executor) {
    const request = {
      onsuccess: null,
      onerror: null,
      result: undefined,
      error: null,
    };
    setTimeout(() => {
      try {
        request.result = executor();
        request.onsuccess?.();
      } catch (error) {
        request.error = error;
        request.onerror?.();
      }
    }, 0);
    return request;
  }

  function makeDb() {
    return {
      objectStoreNames: {
        contains(name) {
          return stores.has(name);
        },
      },
      createObjectStore(name) {
        ensureStore(name);
      },
      transaction(storeNames) {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        names.forEach((name) => ensureStore(name));
        return {
          error: null,
          onerror: null,
          onabort: null,
          objectStore(name) {
            const store = ensureStore(name);
            return {
              getAll() {
                return createRequest(() => [...store.values()]);
              },
              put(value) {
                store.set(value.id, value);
              },
              delete(key) {
                store.delete(key);
              },
            };
          },
        };
      },
      close() {},
    };
  }

  return {
    open() {
      const request = {
        result: null,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      };

      setTimeout(() => {
        const db = makeDb();
        request.result = db;
        request.onupgradeneeded?.();
        request.onsuccess?.();
      }, 0);

      return request;
    },
  };
}

describe('orchestration-store', () => {
  let originalIndexedDb;

  beforeEach(() => {
    originalIndexedDb = globalThis.indexedDB;
  });

  afterEach(() => {
    globalThis.indexedDB = originalIndexedDb;
  });

  test('returns empty or falsey results when indexedDB is unavailable', async () => {
    globalThis.indexedDB = undefined;

    await expect(loadCustomOrchestrations()).resolves.toEqual([]);
    await expect(
      saveCustomOrchestration({
        name: 'Outline Energy',
        slashCommandName: 'outline-energy',
        definition: {
          id: 'outline-energy',
          steps: [{ prompt: 'Outline {{userInput}}' }],
        },
      })
    ).resolves.toBeNull();
    await expect(removeCustomOrchestration('outline-energy')).resolves.toBe(false);
  });

  test('saves, loads, and removes custom orchestrations from the dedicated store', async () => {
    globalThis.indexedDB = /** @type {any} */ (createFakeIndexedDb());

    const savedOrchestration = await saveCustomOrchestration({
      id: 'outline-energy',
      name: 'Outline Energy',
      slashCommandName: 'outline-energy',
      description: 'Outline the user input.',
      importedAt: 1710000000000,
      updatedAt: 1710000000000,
      definition: {
        id: 'outline-energy',
        steps: [{ prompt: 'Outline {{userInput}}' }],
      },
    });

    expect(savedOrchestration?.id).toBe('outline-energy');
    await expect(loadCustomOrchestrations()).resolves.toEqual([
      expect.objectContaining({
        id: 'outline-energy',
        name: 'Outline Energy',
        slashCommandName: 'outline-energy',
      }),
    ]);

    await expect(removeCustomOrchestration('outline-energy')).resolves.toBe(true);
    await expect(loadCustomOrchestrations()).resolves.toEqual([]);
  });
});
