import { TRANSFORMERS_JS_ENGINE_TYPE } from './engine-types.js';

export function createTransformersJsEngineDescriptor() {
  return {
    engineType: TRANSFORMERS_JS_ENGINE_TYPE,
    kind: 'worker',
    createWorker() {
      return new Worker(new URL('../../workers/llm.worker.js', import.meta.url), {
        type: 'module',
      });
    },
  };
}
