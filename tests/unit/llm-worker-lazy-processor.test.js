import { beforeEach, describe, expect, test, vi } from 'vitest';

const processorFactory = vi.fn();

vi.mock('@huggingface/transformers', () => ({
  AutoProcessor: {
    from_pretrained: processorFactory,
  },
}));

describe('llm.worker ensureMultimodalProcessor', () => {
  beforeEach(() => {
    vi.resetModules();
    processorFactory.mockReset();
    globalThis.self = /** @type {any} */ ({
      postMessage: () => {},
      onmessage: null,
    });
  });

  test('loads the multimodal processor lazily and reuses it', async () => {
    const progressCallback = vi.fn();
    const tokenizer = { id: 'processor-tokenizer' };
    processorFactory.mockResolvedValue({
      tokenizer,
    });

    const { ensureMultimodalProcessor } = await import('../../src/workers/llm.worker.js');

    const first = await ensureMultimodalProcessor('test-model', progressCallback);
    const second = await ensureMultimodalProcessor('test-model', progressCallback);

    expect(first).toEqual({ tokenizer });
    expect(second).toBe(first);
    expect(processorFactory).toHaveBeenCalledTimes(1);
    expect(processorFactory).toHaveBeenCalledWith('test-model', {
      progress_callback: progressCallback,
    });
    expect(progressCallback).toHaveBeenCalledWith({
      percent: 10,
      message: 'Loading multimodal processor...',
    });
  });

  test('allows multimodal generation readiness without a tokenizer when the multimodal model is loaded', async () => {
    const { isRuntimeReadyForGeneration } = await import('../../src/workers/llm.worker.js');

    expect(
      isRuntimeReadyForGeneration({
        hasModel: true,
        hasTokenizer: false,
        executionMode: 'multimodal',
        runtime: { multimodalGeneration: true },
      })
    ).toBe(true);
    expect(
      isRuntimeReadyForGeneration({
        hasModel: true,
        hasTokenizer: false,
        executionMode: 'text',
        runtime: { multimodalGeneration: false },
      })
    ).toBe(false);
  });
});
