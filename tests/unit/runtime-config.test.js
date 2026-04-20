import { describe, expect, test } from 'vitest';

import { promptContainsMultimodalInputs, shouldUseMultimodalGenerationForPrompt } from '../../src/llm/runtime-config.js';

describe('runtime-config', () => {
  test('detects multimodal prompt parts', () => {
    expect(
      promptContainsMultimodalInputs([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image.' },
            { type: 'image', image: 'data:image/png;base64,abc' },
          ],
        },
      ])
    ).toBe(true);
    expect(
      promptContainsMultimodalInputs([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Just text.' }],
        },
      ])
    ).toBe(false);
  });

  test('uses the lighter text path by default when a multimodal model receives text only', () => {
    expect(
      shouldUseMultimodalGenerationForPrompt(
        { multimodalGeneration: true },
        [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ]
      )
    ).toBe(false);
  });

  test('keeps opted-in models on the multimodal path even for text-only prompts', () => {
    expect(
      shouldUseMultimodalGenerationForPrompt(
        { multimodalGeneration: true, preferMultimodalForText: true },
        [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ]
      )
    ).toBe(true);
  });
});
