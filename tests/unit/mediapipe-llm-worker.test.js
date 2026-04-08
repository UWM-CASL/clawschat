import { beforeEach, describe, expect, test, vi } from 'vitest';

const isSimdSupportedMock = vi.fn();
const createFromOptionsMock = vi.fn();

vi.mock('@mediapipe/tasks-genai', () => ({
  FilesetResolver: {
    isSimdSupported: isSimdSupportedMock,
  },
  LlmInference: {
    createFromOptions: createFromOptionsMock,
  },
}));

vi.mock('@mediapipe/tasks-genai/genai_wasm_module_internal.js?url', () => ({
  default: '/mock/genai_wasm_module_internal.js',
}));

vi.mock('@mediapipe/tasks-genai/genai_wasm_module_internal.wasm?url', () => ({
  default: '/mock/genai_wasm_module_internal.wasm',
}));

vi.mock('@mediapipe/tasks-genai/genai_wasm_nosimd_internal.js?url', () => ({
  default: '/mock/genai_wasm_nosimd_internal.js',
}));

vi.mock('@mediapipe/tasks-genai/genai_wasm_nosimd_internal.wasm?url', () => ({
  default: '/mock/genai_wasm_nosimd_internal.wasm',
}));

describe('mediapipe-llm.worker', () => {
  let importTargetHref = '';
  let fetchMock;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    isSimdSupportedMock.mockResolvedValue(true);
    createFromOptionsMock.mockReset();
    importTargetHref = new URL('./fixtures/mediapipe-import-shim-target.js', import.meta.url).href;

    globalThis.self = /** @type {any} */ ({
      postMessage: vi.fn(),
      onmessage: null,
    });

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        gpu: {
          requestAdapter: vi.fn(async () => ({})),
        },
      },
    });

    fetchMock = vi.fn(async () => {
      return new globalThis.Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          'content-length': '3',
        },
      });
    });

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    });
  });

  test('installs a self.import shim before LiteRT initialization', async () => {
    createFromOptionsMock.mockImplementation(async (wasmFileset, options) => {
      const workerSelf = /** @type {any} */ (globalThis.self);

      expect(wasmFileset).toEqual({
        wasmLoaderPath: '/mock/genai_wasm_module_internal.js',
        wasmBinaryPath: '/mock/genai_wasm_module_internal.wasm',
      });
      expect(typeof workerSelf.import).toBe('function');

      const importedModule = await workerSelf.import(importTargetHref);
      expect(importedModule.default).toEqual({
        ok: true,
      });

      expect(options).toMatchObject({
        baseOptions: {
          modelAssetBuffer: expect.any(Object),
        },
        maxTokens: 8192,
        topK: 64,
        temperature: 1,
        randomSeed: 0,
      });

      return {
        close: vi.fn(),
      };
    });

    await import('../../src/workers/mediapipe-llm.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    await workerSelf.onmessage(
      /** @type {any} */ ({
        data: {
          type: 'init',
          payload: {
            modelId: 'litert-community/gemma-4-E4B-it-litert-lm',
            backendPreference: 'webgpu',
            runtime: {
              requiresWebGpu: true,
              modelAssetPath:
                'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/test/gemma-4-E4B-it-web.task',
            },
          },
        },
      })
    );

    expect(createFromOptionsMock).toHaveBeenCalledTimes(1);
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'init-success',
      payload: {
        backend: 'webgpu',
        modelId: 'litert-community/gemma-4-E4B-it-litert-lm',
        engineType: 'mediapipe-genai',
      },
    });
  });

  test('loads classic WASM loader scripts into worker-global scope', async () => {
    const classicLoaderSpecifier = 'https://example.test/genai_wasm_internal.js';
    fetchMock.mockImplementation(async (input) => {
      if (String(input) === classicLoaderSpecifier) {
        return new globalThis.Response(
          `var ModuleFactory = (() => {
  function moduleFactory() {
    return { ready: true };
  }
  return moduleFactory;
})();
if (typeof exports === 'object' && typeof module === 'object') {
  module.exports = ModuleFactory;
  module.exports.default = ModuleFactory;
}
`,
          {
            status: 200,
            headers: {
              'content-type': 'text/javascript',
            },
          }
        );
      }

      return new globalThis.Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          'content-length': '3',
        },
      });
    });

    await import('../../src/workers/mediapipe-llm.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    const importedLoader = await workerSelf.import(classicLoaderSpecifier);

    expect(importedLoader).toEqual({
      default: workerSelf.ModuleFactory,
    });
    expect(typeof workerSelf.ModuleFactory).toBe('function');
    expect(workerSelf.ModuleFactory()).toEqual({
      ready: true,
    });
  });

  test('generates responses without reloading the LiteRT model asset', async () => {
    const closeMock = vi.fn();
    const clearCancelSignalsMock = vi.fn();
    const setOptionsMock = vi.fn();
    const generateResponseMock = vi.fn(async (prompt, progressListener) => {
      expect(prompt).toBe('<|turn>user\nWhat time is it.<turn|>\n<|turn>model\n');
      progressListener?.('It is ', false);
      progressListener?.('It is 11:25 PM.', true);
      return 'It is 11:25 PM.';
    });

    createFromOptionsMock.mockResolvedValue({
      close: closeMock,
      clearCancelSignals: clearCancelSignalsMock,
      setOptions: setOptionsMock,
      generateResponse: generateResponseMock,
    });

    await import('../../src/workers/mediapipe-llm.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    await workerSelf.onmessage(
      /** @type {any} */ ({
        data: {
          type: 'init',
          payload: {
            modelId: 'litert-community/gemma-4-E4B-it-litert-lm',
            backendPreference: 'webgpu',
            generationConfig: {
              maxOutputTokens: 512,
              maxContextTokens: 8192,
              temperature: 0.8,
              topK: 40,
            },
            runtime: {
              requiresWebGpu: true,
              modelAssetPath:
                'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/test/gemma-4-E4B-it-web.task',
            },
          },
        },
      })
    );

    workerSelf.postMessage.mockClear();

    await workerSelf.onmessage(
      /** @type {any} */ ({
        data: {
          type: 'generate',
          payload: {
            requestId: 'request-1',
            prompt: 'What time is it.',
            generationConfig: {
              maxOutputTokens: 64,
              maxContextTokens: 4096,
              temperature: 0.4,
              topK: 20,
            },
            runtime: {},
          },
        },
      })
    );

    expect(setOptionsMock).not.toHaveBeenCalled();
    expect(clearCancelSignalsMock).toHaveBeenCalledTimes(1);
    expect(generateResponseMock).toHaveBeenCalledTimes(1);
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'token',
      payload: {
        requestId: 'request-1',
        text: 'It is ',
      },
    });
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'complete',
      payload: {
        requestId: 'request-1',
        text: 'It is 11:25 PM.',
      },
    });
  });
});
