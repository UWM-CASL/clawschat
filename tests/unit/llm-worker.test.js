import { describe, expect, test, vi } from 'vitest';

globalThis.self = /** @type {any} */ ({
  postMessage: vi.fn(),
  onmessage: null,
});

const { resolvePrompt } = await import('../../src/workers/llm.worker.js');

describe('llm.worker resolvePrompt', () => {
  test('normalizes structured chat messages and drops empty entries', () => {
    const result = resolvePrompt([
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Hello' },
      { role: 'model', content: 'Hi there' },
      { role: 'assistant', content: 'How can I help?' },
      { role: 'assistant', content: '   ' },
      { role: 'invalid', content: 'Unknown role becomes user' },
      null,
      123,
    ]);

    expect(result).toEqual([
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'assistant', content: 'How can I help?' },
      { role: 'user', content: 'Unknown role becomes user' },
    ]);
  });

  test('falls back to a single user message for flat prompts', () => {
    expect(resolvePrompt('Flat prompt')).toEqual([{ role: 'user', content: 'Flat prompt' }]);
  });
});
