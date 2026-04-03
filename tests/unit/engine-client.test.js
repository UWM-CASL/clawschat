import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { LLMEngineClient } from '../../src/llm/engine-client.js';

class MockWorker {
  static instances = [];

  constructor() {
    this.listeners = new Map();
    this.messages = [];
    this.terminated = false;
    MockWorker.instances.push(this);
  }

  addEventListener(type, handler) {
    const set = this.listeners.get(type) || new Set();
    set.add(handler);
    this.listeners.set(type, set);
  }

  removeEventListener(type, handler) {
    const set = this.listeners.get(type);
    if (!set) {
      return;
    }
    set.delete(handler);
  }

  postMessage(message) {
    this.messages.push(message);

    if (message.type === 'init') {
      queueMicrotask(() => {
        this.#emit('message', {
          type: 'init-success',
          payload: {
            backend: 'wasm',
            modelId: message.payload?.modelId || 'test-model',
          },
        });
      });
      return;
    }

    if (message.type === 'generate') {
      const requestId = message.payload.requestId;
      queueMicrotask(() => {
        this.#emit('message', {
          type: 'token',
          payload: { requestId, text: 'Hello ' },
        });
      });
      queueMicrotask(() => {
        this.#emit('message', {
          type: 'complete',
          payload: { requestId, text: 'Hello world' },
        });
      });
    }
  }

  terminate() {
    this.terminated = true;
  }

  #emit(type, data) {
    const set = this.listeners.get(type);
    if (!set) {
      return;
    }
    for (const handler of set) {
      handler({ data });
    }
  }
}

describe('LLMEngineClient', () => {
  let originalWorker;

  beforeEach(() => {
    originalWorker = globalThis.Worker;
    MockWorker.instances = [];
    globalThis.Worker = /** @type {any} */ (MockWorker);
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
  });

  test('initializes worker and resolves backend', async () => {
    const client = new LLMEngineClient();
    const onBackendResolved = vi.fn();
    client.onBackendResolved = onBackendResolved;

    const result = await client.initialize({ modelId: 'example/model' });

    expect(result.backend).toBe('wasm');
    expect(result.modelId).toBe('example/model');
    expect(onBackendResolved).toHaveBeenCalledWith('wasm');
    expect(MockWorker.instances).toHaveLength(1);
    expect(MockWorker.instances[0].messages[0].type).toBe('init');
  });

  test('streams tokens and completes generation', async () => {
    const client = new LLMEngineClient();
    await client.initialize({ modelId: 'example/model' });

    const onToken = vi.fn();
    const onError = vi.fn();

    const completed = new Promise((resolve) => {
      client.generate('prompt', {
        onToken,
        onError,
        onComplete: resolve,
      });
    });

    const finalText = await completed;

    expect(onToken).toHaveBeenCalledWith('Hello ');
    expect(onError).not.toHaveBeenCalled();
    expect(finalText).toBe('Hello world');
  });

  test('merges per-request runtime overrides into generate payloads', async () => {
    const client = new LLMEngineClient();
    await client.initialize({
      modelId: 'example/model',
      runtime: { dtype: 'q4f16', enableThinking: true },
    });

    client.generate('prompt', {
      runtime: { enableThinking: false },
      onToken: () => {},
      onComplete: () => {},
      onError: () => {},
    });

    const generateMessage = MockWorker.instances[0].messages.find((message) => message.type === 'generate');
    expect(generateMessage?.payload?.runtime).toEqual({
      dtype: 'q4f16',
      enableThinking: false,
    });
  });

  test('cancelGeneration terminates and reinitializes worker', async () => {
    const client = new LLMEngineClient();
    await client.initialize({ modelId: 'example/model' });

    const firstWorker = client.worker;
    await client.cancelGeneration();

    expect(/** @type {any} */ (firstWorker).terminated).toBe(true);
    expect(client.worker).toBeTruthy();
    expect(client.worker).not.toBe(firstWorker);
    expect(MockWorker.instances).toHaveLength(2);
  });

  test('switching models unloads the previous worker before loading the next model', async () => {
    const client = new LLMEngineClient();
    await client.initialize({ modelId: 'example/model-a' });

    const firstWorker = client.worker;
    await client.initialize({ modelId: 'example/model-b' });

    expect(/** @type {any} */ (firstWorker).terminated).toBe(true);
    expect(client.worker).not.toBe(firstWorker);
    expect(client.loadedModelId).toBe('example/model-b');
    expect(MockWorker.instances).toHaveLength(2);
  });
});
