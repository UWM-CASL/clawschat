import { beforeAll, describe, expect, test } from 'vitest';

let resolvePrompt;
let buildMultimodalChatTemplateOptions;

beforeAll(async () => {
  globalThis.self = /** @type {any} */ ({
    postMessage: () => {},
    onmessage: null,
  });
  ({ resolvePrompt, buildMultimodalChatTemplateOptions } = await import(
    '../../src/workers/llm.worker.js'
  ));
});

describe('llm.worker resolvePrompt', () => {
  test('preserves tool roles in structured prompts', () => {
    expect(
      resolvePrompt([
        { role: 'system', content: 'Use tools when needed.' },
        { role: 'user', content: 'What time is it?' },
        { role: 'assistant', content: '{"name":"get_current_date_time","parameters":{}}' },
        { role: 'tool', content: '{"iso":"2026-03-26T06:00:00.000Z"}' },
      ])
    ).toEqual([
      { role: 'system', content: 'Use tools when needed.' },
      { role: 'user', content: 'What time is it?' },
      { role: 'assistant', content: '{"name":"get_current_date_time","parameters":{}}' },
      { role: 'tool', content: '{"iso":"2026-03-26T06:00:00.000Z"}' },
    ]);
  });

  test('preserves structured audio parts in multimodal prompts', () => {
    expect(
      resolvePrompt([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Transcribe this.' },
            {
              type: 'audio',
              mimeType: 'audio/mpeg',
              samplesBase64: 'abcd',
              sampleRate: 16000,
              sampleCount: 4,
            },
          ],
        },
      ])
    ).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Transcribe this.' },
          {
            type: 'audio',
            mimeType: 'audio/mpeg',
            samplesBase64: 'abcd',
            sampleRate: 16000,
            sampleCount: 4,
          },
        ],
      },
    ]);
  });
});

describe('llm.worker multimodal chat template options', () => {
  test('forwards the thinking flag when runtime thinking is enabled', () => {
    expect(buildMultimodalChatTemplateOptions({ enableThinking: true })).toEqual({
      add_generation_prompt: true,
      enable_thinking: true,
    });
  });

  test('omits the thinking flag when runtime thinking is disabled', () => {
    expect(buildMultimodalChatTemplateOptions({ enableThinking: false })).toEqual({
      add_generation_prompt: true,
    });
  });
});
