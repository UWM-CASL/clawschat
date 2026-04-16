import { normalizeGenerationLimits } from '../config/generation-config.js';
import { OPENAI_COMPATIBLE_PROVIDER_TYPE } from './openai-compatible.js';

export const REMOTE_MODEL_GENERATION_LIMITS = Object.freeze({
  defaultMaxOutputTokens: 1024,
  maxOutputTokens: 131072,
  defaultMaxContextTokens: 8192,
  maxContextTokens: 131072,
  minTemperature: 0.0,
  maxTemperature: 2.0,
  defaultTemperature: 0.7,
  defaultTopK: 50,
  defaultTopP: 1.0,
  defaultRepetitionPenalty: 1.0,
});
const DEFAULT_REMOTE_MODEL_DETECTED_FEATURES = Object.freeze({
  toolCalling: false,
});
const DEFAULT_REMOTE_MODEL_FEATURES = Object.freeze({
  toolCalling: false,
});
const OPENAI_COMPATIBLE_PROMPT_TOOL_CALLING_PROFILE = Object.freeze({
  format: 'json',
  nameKey: 'name',
  argumentsKey: 'parameters',
});

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTimestamp(value) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

export function buildCloudModelId(providerId, remoteModelId) {
  const normalizedProviderId = normalizeString(providerId);
  const normalizedRemoteModelId = normalizeString(remoteModelId);
  return normalizedProviderId && normalizedRemoteModelId
    ? `cloud:${normalizedProviderId}:${encodeURIComponent(normalizedRemoteModelId)}`
    : '';
}

function normalizeCloudModelFeatures(rawFeatures, defaults = null) {
  const defaultToolCalling = defaults?.toolCalling === true;
  return {
    toolCalling:
      rawFeatures?.toolCalling === true ||
      (rawFeatures?.toolCalling !== false && defaultToolCalling),
  };
}

function normalizeAvailableModelEntry(entry) {
  const id = normalizeString(entry?.id);
  if (!id) {
    return null;
  }
  return {
    id,
    displayName: normalizeString(entry?.displayName) || id,
    detectedFeatures: normalizeCloudModelFeatures(
      entry?.detectedFeatures,
      DEFAULT_REMOTE_MODEL_DETECTED_FEATURES
    ),
  };
}

function normalizeAvailableModels(value) {
  const seenModelIds = new Set();
  return (Array.isArray(value) ? value : [])
    .map(normalizeAvailableModelEntry)
    .filter((entry) => {
      if (!entry || seenModelIds.has(entry.id)) {
        return false;
      }
      seenModelIds.add(entry.id);
      return true;
    });
}

function normalizeSelectedModelEntry(entry, availableModels, provider) {
  const id = normalizeString(entry?.id);
  if (!id) {
    return null;
  }
  const matchingAvailableModel = availableModels.find((model) => model.id === id);
  const displayName =
    normalizeString(entry?.displayName) || matchingAvailableModel?.displayName || id;
  const detectedFeatures = normalizeCloudModelFeatures(
    matchingAvailableModel?.detectedFeatures,
    entry?.detectedFeatures || DEFAULT_REMOTE_MODEL_DETECTED_FEATURES
  );
  return {
    id,
    displayName,
    generation: normalizeGenerationLimits(entry?.generation || REMOTE_MODEL_GENERATION_LIMITS),
    supportsTopK:
      entry?.supportsTopK === true || (entry?.supportsTopK !== false && provider.supportsTopK === true),
    detectedFeatures,
    features: normalizeCloudModelFeatures(
      entry?.features,
      detectedFeatures || DEFAULT_REMOTE_MODEL_FEATURES
    ),
  };
}

function normalizeSelectedModels(value, availableModels, provider) {
  const seenModelIds = new Set();
  return (Array.isArray(value) ? value : [])
    .map((entry) => normalizeSelectedModelEntry(entry, availableModels, provider))
    .filter((entry) => {
      if (!entry || seenModelIds.has(entry.id)) {
        return false;
      }
      seenModelIds.add(entry.id);
      return true;
    });
}

export function normalizeCloudProviderConfig(provider) {
  const id = normalizeString(provider?.id);
  const type = normalizeString(provider?.type) || OPENAI_COMPATIBLE_PROVIDER_TYPE;
  const endpoint = normalizeString(provider?.endpoint);
  if (!id || !endpoint || type !== OPENAI_COMPATIBLE_PROVIDER_TYPE) {
    return null;
  }
  const endpointHost = normalizeString(provider?.endpointHost);
  const displayName = normalizeString(provider?.displayName) || endpointHost || endpoint;
  const normalizedProvider = {
    id,
    type,
    endpoint,
    endpointHost,
    displayName,
    supportsTopK: provider?.supportsTopK === true,
    importedAt: normalizeTimestamp(provider?.importedAt) || Date.now(),
    updatedAt: normalizeTimestamp(provider?.updatedAt) || Date.now(),
    availableModels: [],
    selectedModels: [],
  };
  normalizedProvider.availableModels = normalizeAvailableModels(provider?.availableModels);
  normalizedProvider.selectedModels = normalizeSelectedModels(
    provider?.selectedModels,
    normalizedProvider.availableModels,
    normalizedProvider
  );
  return normalizedProvider;
}

export function normalizeCloudProviderConfigs(value) {
  const seenProviderIds = new Set();
  return (Array.isArray(value) ? value : [])
    .map(normalizeCloudProviderConfig)
    .filter((provider) => {
      if (!provider || seenProviderIds.has(provider.id)) {
        return false;
      }
      seenProviderIds.add(provider.id);
      return true;
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function getCloudProviderById(providers, providerId) {
  const normalizedProviderId = normalizeString(providerId);
  if (!normalizedProviderId) {
    return null;
  }
  return normalizeCloudProviderConfigs(providers).find((provider) => provider.id === normalizedProviderId) || null;
}

export function buildRuntimeModelCatalog(providers) {
  return normalizeCloudProviderConfigs(providers).flatMap((provider) =>
    provider.selectedModels.map((model) => {
      const toolCallingEnabled = model?.features?.toolCalling === true;
      return {
        id: buildCloudModelId(provider.id, model.id),
        label: model.id,
        displayName: model.displayName,
        repositoryUrl: provider.endpoint,
        engine: {
          type: 'openai-compatible',
        },
        generation: model.generation,
        features: {
          streaming: true,
          thinking: false,
          toolCalling: toolCallingEnabled,
          imageInput: false,
          audioInput: false,
          videoInput: false,
        },
        ...(toolCallingEnabled
          ? { toolCalling: OPENAI_COMPATIBLE_PROMPT_TOOL_CALLING_PROFILE }
          : {}),
        runtime: {
          providerId: provider.id,
          providerType: provider.type,
          providerDisplayName: provider.displayName,
          apiBaseUrl: provider.endpoint,
          remoteModelId: model.id,
          supportsTopK: model.supportsTopK === true,
        },
      };
    })
  );
}
