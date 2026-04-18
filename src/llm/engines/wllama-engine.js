import { WLLAMA_ENGINE_TYPE } from './engine-types.js';

export function createWllamaEngineDescriptor() {
  return {
    engineType: WLLAMA_ENGINE_TYPE,
    kind: 'worker',
    generationConfigRequiresReinit(currentGenerationConfig = {}, nextGenerationConfig = {}) {
      return currentGenerationConfig?.maxContextTokens !== nextGenerationConfig?.maxContextTokens;
    },
    createWorker() {
      return new Worker(new URL('../../workers/wllama.worker.js', import.meta.url), {
        type: 'module',
      });
    },
  };
}
