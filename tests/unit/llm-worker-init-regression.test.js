import { beforeEach, describe, expect, test, vi } from 'vitest';

const pipelineFactory = vi.fn();
const multimodalFactory = vi.fn();

vi.mock('@huggingface/transformers', () => ({
  env: {
    backends: {
      onnx: {
        wasm: {},
      },
    },
  },
  pipeline: pipelineFactory,
  TextStreamer: class TextStreamerMock {},
  InterruptableStoppingCriteria: class InterruptableStoppingCriteriaMock {
    interrupt() {}

    reset() {}
  },
  AutoModelForImageTextToText: {
    from_pretrained: multimodalFactory,
  },
}));

describe('llm.worker init regression', () => {
  beforeEach(() => {
    vi.resetModules();
    pipelineFactory.mockReset();
    pipelineFactory.mockResolvedValue({
      tokenizer: { id: 'tokenizer' },
    });
    multimodalFactory.mockReset();
    globalThis.self = /** @type {any} */ ({
      postMessage: vi.fn(),
      onmessage: null,
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    });
  });

  test('reuses a loaded cpu alias without reinitializing the wasm pipeline', async () => {
    await import('../../src/workers/llm.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    const payload = {
      modelId: 'onnx-community/Llama-3.2-1B-Instruct-ONNX',
      backendPreference: 'cpu',
      runtime: {},
    };

    await workerSelf.onmessage(/** @type {any} */ ({
      data: {
        type: 'init',
        payload,
      },
    }));

    expect(pipelineFactory).toHaveBeenCalledTimes(1);
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'init-success',
      payload: {
        backend: 'cpu',
        modelId: 'onnx-community/Llama-3.2-1B-Instruct-ONNX',
      },
    });

    workerSelf.postMessage.mockClear();

    await workerSelf.onmessage(/** @type {any} */ ({
      data: {
        type: 'init',
        payload,
      },
    }));

    expect(pipelineFactory).toHaveBeenCalledTimes(1);
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'init-success',
      payload: {
        backend: 'cpu',
        modelId: 'onnx-community/Llama-3.2-1B-Instruct-ONNX',
      },
    });
  });
});
