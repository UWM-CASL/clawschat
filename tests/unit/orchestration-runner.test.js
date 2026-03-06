import { describe, expect, test, vi } from 'vitest';
import {
  buildOrchestrationPrompt,
  createOrchestrationRunner,
} from '../../src/llm/orchestration-runner.js';

describe('orchestration-runner', () => {
  test('renders placeholders and response format instructions', () => {
    const prompt = buildOrchestrationPrompt(
      {
        prompt: 'Critique {{assistantResponse}} for {{userPrompt}}',
        responseFormat: {
          instructions: 'Return one short paragraph.',
        },
      },
      {
        assistantResponse: 'A rough draft',
        userPrompt: 'the original question',
      },
    );

    expect(prompt).toBe(
      'Critique A rough draft for the original question\n\nResponse format:\nReturn one short paragraph.',
    );
  });

  test('runs steps in order and exposes prior outputs to later steps', async () => {
    const generateText = vi
      .fn()
      .mockResolvedValueOnce('Needs detail')
      .mockResolvedValueOnce('Improved answer');
    const onDebug = vi.fn();
    const runner = createOrchestrationRunner({
      generateText,
      formatStepOutput: (_step, output) => output.trim(),
      onDebug,
    });

    const result = await runner({
      id: 'fix-response',
      steps: [
        {
          stepName: 'Critique',
          prompt: 'Critique {{assistantResponse}}',
          outputKey: 'critique',
        },
        {
          stepName: 'Revise',
          prompt: 'Revise using {{critique}}',
        },
      ],
    }, {
      assistantResponse: 'Draft answer',
    });

    expect(generateText).toHaveBeenNthCalledWith(1, 'Critique Draft answer');
    expect(generateText).toHaveBeenNthCalledWith(2, 'Revise using Needs detail');
    expect(result).toEqual({
      finalPrompt: 'Revise using Needs detail',
      finalOutput: 'Improved answer',
    });
    expect(onDebug).toHaveBeenCalledWith('Orchestration completed: fix-response');
  });

  test('can prepare the final step without executing it', async () => {
    const generateText = vi.fn().mockResolvedValueOnce('Prepared context');
    const runner = createOrchestrationRunner({
      generateText,
    });

    const result = await runner(
      {
        id: 'rename-chat',
        steps: [
          { prompt: 'Summarize {{userPrompt}}', outputKey: 'summary' },
          { prompt: 'Title {{summary}}' },
        ],
      },
      {
        userPrompt: 'Why is the sky blue?',
      },
      {
        runFinalStep: false,
      },
    );

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      finalPrompt: 'Title Prepared context',
      finalOutput: '',
    });
  });
});
