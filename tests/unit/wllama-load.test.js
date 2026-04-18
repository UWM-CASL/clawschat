import { describe, expect, test } from 'vitest';

import {
  expandWllamaModelUrls,
  shouldRetryWllamaModelLoad,
} from '../../src/llm/wllama-load.js';

describe('wllama-load', () => {
  test('retries when the load error reports an invalid GGUF magic number', () => {
    expect(shouldRetryWllamaModelLoad(new Error('Invalid magic number'))).toBe(true);
    expect(shouldRetryWllamaModelLoad('gguf_init_from_file: invalid magic number')).toBe(true);
  });

  test('does not retry unrelated load errors', () => {
    expect(shouldRetryWllamaModelLoad(new Error('Model is not initialized.'))).toBe(false);
    expect(shouldRetryWllamaModelLoad('Network failed')).toBe(false);
  });

  test('expands split gguf urls into every shard url', () => {
    expect(
      expandWllamaModelUrls(
        'https://example.com/model-00001-of-00003.gguf?download=1'
      )
    ).toEqual([
      'https://example.com/model-00001-of-00003.gguf?download=1',
      'https://example.com/model-00002-of-00003.gguf?download=1',
      'https://example.com/model-00003-of-00003.gguf?download=1',
    ]);
  });

  test('keeps single-file gguf urls unchanged', () => {
    expect(expandWllamaModelUrls('https://example.com/model.gguf')).toEqual([
      'https://example.com/model.gguf',
    ]);
  });
});
