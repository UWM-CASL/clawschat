import { describe, expect, test } from 'vitest';

import { shouldRetryWllamaModelLoad } from '../../src/llm/wllama-load.js';

describe('wllama-load', () => {
  test('retries when the load error reports an invalid GGUF magic number', () => {
    expect(shouldRetryWllamaModelLoad(new Error('Invalid magic number'))).toBe(true);
    expect(shouldRetryWllamaModelLoad('gguf_init_from_file: invalid magic number')).toBe(true);
  });

  test('does not retry unrelated load errors', () => {
    expect(shouldRetryWllamaModelLoad(new Error('Model is not initialized.'))).toBe(false);
    expect(shouldRetryWllamaModelLoad('Network failed')).toBe(false);
  });
});
