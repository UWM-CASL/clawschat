import { describe, expect, test } from 'vitest';
import {
  buildDefaultGenerationConfig,
  sanitizeGenerationConfig,
} from '../../src/config/generation-config.js';

describe('generation-config', () => {
  test('builds a default config from generation limits', () => {
    expect(
      buildDefaultGenerationConfig({
        defaultMaxOutputTokens: 512,
        defaultMaxContextTokens: 4096,
        defaultTemperature: 0.7,
        defaultTopK: 40,
        defaultTopP: 0.85,
      }),
    ).toEqual({
      maxOutputTokens: 512,
      maxContextTokens: 4096,
      temperature: 0.7,
      topK: 40,
      topP: 0.85,
    });
  });

  test('sanitizes and quantizes generation config against limits', () => {
    expect(
      sanitizeGenerationConfig(
        {
          maxOutputTokens: '3000',
          maxContextTokens: '2055',
          temperature: '1.04',
          topK: '52',
          topP: '0.93',
        },
        {
          defaultMaxOutputTokens: 512,
          maxOutputTokens: 4096,
          defaultMaxContextTokens: 8192,
          maxContextTokens: 8192,
          minTemperature: 0.1,
          maxTemperature: 2.0,
          defaultTemperature: 0.6,
          defaultTopK: 50,
          defaultTopP: 0.9,
        },
      ),
    ).toEqual({
      maxOutputTokens: 2056,
      maxContextTokens: 2056,
      temperature: 1,
      topK: 50,
      topP: 0.95,
    });
  });
});
