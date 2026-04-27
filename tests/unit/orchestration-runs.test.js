import { describe, expect, test, vi } from 'vitest';
import {
  createOrchestrationRunController,
  formatOrchestrationStepOutput,
  removeGenericThinkingSections,
} from '../../src/app/orchestration-runs.js';

function createHarness({
  activeGenerationConfig = { maxOutputTokens: 128, temperature: 0.4 },
  selectedModelId = 'model-1',
} = {}) {
  const appState = {
    activeGenerationConfig,
  };
  const activeConversation = {
    id: 'conversation-1',
    modelId: selectedModelId,
    languagePreference: 'auto',
  };
  const capturedGenerations = [];
  const engine = {
    cancelGeneration: vi.fn().mockResolvedValue(undefined),
    generate: vi.fn((prompt, options) => {
      capturedGenerations.push({ prompt, options });
      options.onToken?.('draft ');
      options.onComplete?.('final answer ');
    }),
  };
  const dependencies = {
    appState,
    engine,
    defaultModelId: 'default-model',
    getSelectedModelId: vi.fn(() => selectedModelId),
    normalizeModelId: vi.fn((modelId) => String(modelId || 'default-model').trim()),
    getActiveConversation: vi.fn(() => activeConversation),
    getConversationModelId: vi.fn((conversation) => conversation?.modelId || 'default-model'),
    sanitizeGenerationConfigForModel: vi.fn((modelId, config) => ({
      ...config,
      sanitizedFor: modelId,
    })),
    buildConversationRuntimeConfigForPrompt: vi.fn((_conversation, _prompt) => ({
      languagePreference: 'auto',
      thinkingEnabled: true,
    })),
    getThinkingTagsForModel: vi.fn(() => ({ open: '<think>', close: '</think>' })),
    appendDebug: vi.fn(),
  };
  const controller = createOrchestrationRunController(dependencies);

  return {
    activeConversation,
    capturedGenerations,
    controller,
    dependencies,
    engine,
  };
}

describe('orchestration-runs', () => {
  test('formats orchestration step output and strips thinking only when requested', () => {
    expect(formatOrchestrationStepOutput({}, '  Final answer  ', null)).toBe('Final answer');
    expect(
      formatOrchestrationStepOutput(
        { outputProcessing: { stripThinking: true } },
        '<think>scratch</think>Final answer',
        { open: '<think>', close: '</think>' }
      )
    ).toBe('Final answer');
    expect(removeGenericThinkingSections('<think>scratch</think>Final answer')).toBe(
      'Final answer'
    );
  });

  test('requests one engine generation with merged generation and runtime config', async () => {
    const harness = createHarness();

    await expect(
      harness.controller.requestSingleGeneration('Explain photosynthesis.', {
        generationConfig: { maxOutputTokens: 64 },
        runtime: { responseLanguage: 'fr' },
      })
    ).resolves.toBe('final answer');

    expect(harness.dependencies.getActiveConversation).toHaveBeenCalledTimes(1);
    expect(harness.dependencies.sanitizeGenerationConfigForModel).toHaveBeenCalledWith('model-1', {
      maxOutputTokens: 64,
      temperature: 0.4,
    });
    expect(harness.dependencies.buildConversationRuntimeConfigForPrompt).toHaveBeenCalledWith(
      harness.activeConversation,
      'Explain photosynthesis.'
    );
    expect(harness.engine.generate).toHaveBeenCalledTimes(1);
    expect(harness.capturedGenerations[0]).toMatchObject({
      prompt: 'Explain photosynthesis.',
      options: {
        generationConfig: {
          maxOutputTokens: 64,
          temperature: 0.4,
          sanitizedFor: 'model-1',
        },
        runtime: {
          languagePreference: 'auto',
          thinkingEnabled: true,
          responseLanguage: 'fr',
        },
      },
    });
  });

  test('cancels the engine generation when the orchestration signal aborts', async () => {
    const harness = createHarness();
    harness.engine.generate.mockImplementation((_prompt, _options) => {});
    const abortController = new AbortController();

    const request = harness.controller.requestSingleGeneration('Long running step.', {
      signal: abortController.signal,
    });
    abortController.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(harness.engine.cancelGeneration).toHaveBeenCalledTimes(1);
  });

  test('runs prompt steps through the one-shot generation adapter', async () => {
    const harness = createHarness();
    harness.engine.generate.mockImplementation((_prompt, options) => {
      options.onComplete?.('<think>scratch</think>Visible result');
    });

    const result = await harness.controller.runOrchestration(
      {
        id: 'test-run',
        steps: [
          {
            prompt: 'Use {{userInput}}',
            outputProcessing: { stripThinking: true },
          },
        ],
      },
      { userInput: 'the draft' }
    );

    expect(result.finalOutput).toBe('Visible result');
    expect(harness.dependencies.getSelectedModelId).toHaveBeenCalled();
    expect(harness.dependencies.getThinkingTagsForModel).toHaveBeenCalledWith('model-1');
    expect(harness.dependencies.appendDebug).toHaveBeenCalledWith(
      'Orchestration completed: test-run'
    );
  });
});
