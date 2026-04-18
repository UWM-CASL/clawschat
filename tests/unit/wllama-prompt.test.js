import { describe, expect, test } from 'vitest';

import {
  flattenWllamaPromptMessageContent,
  normalizeWllamaPromptMessages,
} from '../../src/llm/wllama-prompt.js';

describe('wllama-prompt', () => {
  test('flattens text and file parts into a text prompt', () => {
    expect(
      flattenWllamaPromptMessageContent([
        { type: 'text', text: 'Question' },
        {
          type: 'file',
          filename: 'notes.txt',
          llmText: 'Context from file',
        },
      ])
    ).toBe('Question\n\nContext from file');
  });

  test('maps tool messages into assistant text for wllama chat prompts', () => {
    expect(
      normalizeWllamaPromptMessages([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
        { role: 'tool', toolName: 'web_lookup', content: 'Fetched page summary' },
      ])
    ).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: '[Tool result: web_lookup]\nFetched page summary',
      },
    ]);
  });

  test('rejects unsupported media parts with an actionable error', () => {
    expect(() =>
      normalizeWllamaPromptMessages([
        {
          role: 'user',
          content: [{ type: 'image', filename: 'diagram.png' }],
        },
      ])
    ).toThrow('The selected model does not support image inputs in this app (diagram.png).');
  });
});
