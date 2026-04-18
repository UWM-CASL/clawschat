import {
  DEFAULT_ENGINE_TYPE,
  OPENAI_COMPATIBLE_ENGINE_TYPE,
  TRANSFORMERS_JS_ENGINE_TYPE,
  WLLAMA_ENGINE_TYPE,
  normalizeEngineType,
} from './engine-types.js';
import { createOpenAiCompatibleEngineDescriptor } from './openai-compatible-engine.js';
import { createTransformersJsEngineDescriptor } from './transformers-js-engine.js';
import { createWllamaEngineDescriptor } from './wllama-engine.js';

const ENGINE_DESCRIPTOR_FACTORIES = Object.freeze({
  [OPENAI_COMPATIBLE_ENGINE_TYPE]: createOpenAiCompatibleEngineDescriptor,
  [TRANSFORMERS_JS_ENGINE_TYPE]: createTransformersJsEngineDescriptor,
  [WLLAMA_ENGINE_TYPE]: createWllamaEngineDescriptor,
});

export {
  DEFAULT_ENGINE_TYPE,
  OPENAI_COMPATIBLE_ENGINE_TYPE,
  TRANSFORMERS_JS_ENGINE_TYPE,
  WLLAMA_ENGINE_TYPE,
  normalizeEngineType,
};

export function getEngineDescriptor(engineType = DEFAULT_ENGINE_TYPE) {
  const normalizedEngineType = normalizeEngineType(engineType);
  const createDescriptor =
    ENGINE_DESCRIPTOR_FACTORIES[normalizedEngineType] ||
    ENGINE_DESCRIPTOR_FACTORIES[DEFAULT_ENGINE_TYPE];
  return createDescriptor();
}
