import { createOrchestrationRunner } from '../llm/orchestration-runner.js';
import { parseThinkingText } from '../llm/thinking-parser.js';

export function removeGenericThinkingSections(text) {
  return String(text || '').replace(/<think\b[^>]*>[\s\S]*?(?:<\/think>|$)/gi, '');
}

export function formatOrchestrationStepOutput(step, rawOutput, thinkingTags) {
  const output = String(rawOutput || '').trim();
  if (!output) {
    return '';
  }

  const stripThinking = Boolean(step?.outputProcessing?.stripThinking);
  if (!stripThinking) {
    return output;
  }

  const parsed = parseThinkingText(output, thinkingTags);
  const withoutThinking = parsed.response.trim();
  if (withoutThinking) {
    return withoutThinking;
  }

  return removeGenericThinkingSections(output).trim();
}

/**
 * @param {{
 *   appState: any;
 *   engine: { generate: (prompt: any, options: any) => any; cancelGeneration: () => Promise<any> };
 *   defaultModelId: string;
 *   getSelectedModelId?: () => string;
 *   normalizeModelId: (modelId: string | null | undefined) => string;
 *   getActiveConversation: () => any;
 *   getConversationModelId: (conversation: any) => string;
 *   sanitizeGenerationConfigForModel: (modelId: string, config: any) => any;
 *   buildConversationRuntimeConfigForPrompt: (conversation?: any, prompt?: any) => any;
 *   getThinkingTagsForModel: (modelId: string) => any;
 *   appendDebug?: (entry: any) => any;
 * }} options
 */
export function createOrchestrationRunController({
  appState,
  engine,
  defaultModelId,
  getSelectedModelId = () => defaultModelId,
  normalizeModelId,
  getActiveConversation,
  getConversationModelId,
  sanitizeGenerationConfigForModel,
  buildConversationRuntimeConfigForPrompt,
  getThinkingTagsForModel,
  appendDebug = (_entry) => {},
}) {
  function requestSingleGeneration(prompt, options = {}) {
    return new Promise((resolve, reject) => {
      const signal =
        globalThis.AbortSignal && options.signal instanceof globalThis.AbortSignal
          ? options.signal
          : null;
      const activeConversation = getActiveConversation();
      const selectedModelId = getConversationModelId(activeConversation);
      const requestGenerationConfig = sanitizeGenerationConfigForModel(selectedModelId, {
        ...appState.activeGenerationConfig,
        ...(options.generationConfig && typeof options.generationConfig === 'object'
          ? options.generationConfig
          : {}),
      });
      const requestRuntime = {
        ...buildConversationRuntimeConfigForPrompt(activeConversation, prompt),
        ...(options.runtime && typeof options.runtime === 'object' ? options.runtime : {}),
      };
      let streamedText = '';
      let isSettled = false;

      const settle = (callback) => {
        if (isSettled) {
          return;
        }
        isSettled = true;
        signal?.removeEventListener('abort', handleAbort);
        callback();
      };

      const rejectAsAbort = () => {
        settle(() => {
          const AbortError =
            globalThis.DOMException ||
            class AbortError extends Error {
              constructor(message) {
                super(message);
                this.name = 'AbortError';
              }
            };
          reject(new AbortError('Generation canceled.', 'AbortError'));
        });
      };

      const handleAbort = () => {
        void engine
          .cancelGeneration()
          .catch(() => {})
          .finally(() => {
            rejectAsAbort();
          });
      };

      if (signal?.aborted) {
        rejectAsAbort();
        return;
      }

      signal?.addEventListener('abort', handleAbort, { once: true });
      try {
        engine.generate(prompt, {
          runtime: requestRuntime,
          generationConfig: requestGenerationConfig,
          onToken: (chunk) => {
            streamedText += String(chunk || '');
          },
          onComplete: (finalText) => {
            settle(() => {
              resolve(String(finalText || streamedText).trim());
            });
          },
          onError: (message) => {
            settle(() => {
              reject(new Error(String(message || 'Generation failed.')));
            });
          },
          onCancel: () => {
            rejectAsAbort();
          },
        });
      } catch (error) {
        settle(() => {
          reject(error);
        });
      }
    });
  }

  const runOrchestration = createOrchestrationRunner({
    generateText: requestSingleGeneration,
    formatStepOutput: (step, rawOutput) => {
      const selectedModelId = normalizeModelId(getSelectedModelId() || defaultModelId);
      return formatOrchestrationStepOutput(
        step,
        rawOutput,
        getThinkingTagsForModel(selectedModelId)
      );
    },
    onDebug: appendDebug,
  });

  return {
    requestSingleGeneration,
    runOrchestration,
  };
}
