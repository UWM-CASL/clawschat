import { strToU8, zipSync } from 'fflate';
import { buildDefaultGenerationConfig } from '../config/generation-config.js';
import {
  buildConversationDownloadMarkdown,
  buildConversationDownloadPayload,
  buildConversationJsonDownloadFileName,
  buildConversationMarkdownDownloadFileName,
} from '../state/conversation-model.js';
import { buildConversationStateSnapshot } from '../state/conversation-serialization.js';

function formatArchiveTimestamp(value = Date.now()) {
  const date = new Date(value);
  const iso = Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function sanitizeArchiveSegment(value, fallback = 'item') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function buildArchiveRootDirectory(now = Date.now()) {
  return `browser-llm-runner-export-${formatArchiveTimestamp(now)}`;
}

function decodeBase64ToBytes(base64) {
  const normalized = typeof base64 === 'string' ? base64.trim() : '';
  if (!normalized) {
    return new Uint8Array(0);
  }
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  if (typeof globalThis.Buffer === 'function') {
    return new Uint8Array(globalThis.Buffer.from(normalized, 'base64'));
  }
  return new Uint8Array(0);
}

function buildConversationDirectoryName(conversation, index) {
  const safeName = sanitizeArchiveSegment(conversation?.name, 'conversation');
  const safeId = sanitizeArchiveSegment(conversation?.id, 'conversation');
  return `${String(index + 1).padStart(2, '0')}-${safeName}-${safeId}`;
}

function buildArtifactFileName(artifact, artifactIndex) {
  const fallbackBase = `artifact-${String(artifactIndex + 1).padStart(2, '0')}`;
  const rawName =
    typeof artifact?.filename === 'string' && artifact.filename.trim()
      ? artifact.filename.trim()
      : artifact?.kind === 'text'
        ? `${fallbackBase}.txt`
        : `${fallbackBase}.bin`;
  const segments = rawName
    .split(/[\\/]+/g)
    .map((segment) => {
      const trimmed = String(segment || '').trim();
      if (!trimmed) {
        return '';
      }
      const extensionMatch = trimmed.match(/(\.[A-Za-z0-9_-]+)$/);
      const extension = extensionMatch ? extensionMatch[1].toLowerCase() : '';
      const baseName = extension ? trimmed.slice(0, -extension.length) : trimmed;
      const sanitizedBase = sanitizeArchiveSegment(baseName, 'file');
      return `${sanitizedBase}${extension}`;
    })
    .filter(Boolean);
  return segments.join('/') || sanitizeArchiveSegment(rawName, fallbackBase);
}

function buildConversationExportPayloadForArchive(conversation, dependencies) {
  const {
    getConversationModelId,
    getConversationSystemPromptSuffix,
    getToolCallingContext,
    getStoredGenerationConfigForModel,
    getModelGenerationLimits,
  } = dependencies;
  const modelId = getConversationModelId(conversation);
  const generationConfig =
    getStoredGenerationConfigForModel(modelId) ||
    buildDefaultGenerationConfig(getModelGenerationLimits(modelId));
  return buildConversationDownloadPayload(conversation, {
    modelId,
    temperature: generationConfig.temperature,
    systemPromptSuffix: getConversationSystemPromptSuffix(modelId, conversation),
    toolContext: getToolCallingContext(modelId),
  });
}

export function buildBulkConversationExportEntries(options = {}) {
  const {
    appState,
    getMessageArtifacts = () => [],
    getConversationModelId,
    getConversationSystemPromptSuffix,
    getToolCallingContext,
    getStoredGenerationConfigForModel,
    getModelGenerationLimits,
    now = Date.now(),
  } = options;
  const archiveRoot = buildArchiveRootDirectory(now);
  const archiveFileName = `${archiveRoot}.zip`;
  /** @type {Record<string, Uint8Array>} */
  const entries = {};
  const snapshot = buildConversationStateSnapshot(appState, {
    getMessageArtifacts,
  });
  const conversations = Array.isArray(appState?.conversations) ? appState.conversations : [];
  const artifacts = Array.isArray(snapshot?.artifacts) ? snapshot.artifacts : [];
  const generatedAt = new Date(now).toISOString();

  entries[`${archiveRoot}/storage/conversations.llm.json`] = strToU8(
    JSON.stringify(snapshot, null, 2),
  );

  const manifest = {
    generatedAt,
    conversationCount: conversations.length,
    artifactCount: artifacts.length,
    conversations: [],
  };

  conversations.forEach((conversation, index) => {
    const folderName = buildConversationDirectoryName(conversation, index);
    const basePath = `${archiveRoot}/conversations/${folderName}`;
    const payload = buildConversationExportPayloadForArchive(conversation, {
      getConversationModelId,
      getConversationSystemPromptSuffix,
      getToolCallingContext,
      getStoredGenerationConfigForModel,
      getModelGenerationLimits,
    });
    const jsonFileName = buildConversationJsonDownloadFileName(conversation?.name);
    const markdownFileName = buildConversationMarkdownDownloadFileName(conversation?.name);
    entries[`${basePath}/${jsonFileName}`] = strToU8(JSON.stringify(payload, null, 2));
    entries[`${basePath}/${markdownFileName}`] = strToU8(
      buildConversationDownloadMarkdown(payload),
    );

    const conversationArtifacts = artifacts.filter(
      (artifact) => artifact?.conversationId === conversation?.id,
    );
    const artifactManifest = conversationArtifacts.map((artifact, artifactIndex) => {
      const dataFileName = buildArtifactFileName(artifact, artifactIndex);
      const dataPath = `${basePath}/artifacts/${dataFileName}`;
      entries[dataPath] =
        artifact?.kind === 'binary'
          ? decodeBase64ToBytes(artifact.data)
          : strToU8(typeof artifact?.data === 'string' ? artifact.data : '');
      return {
        id: artifact?.id || '',
        messageId: artifact?.messageId || null,
        kind: artifact?.kind === 'binary' ? 'binary' : 'text',
        mimeType: typeof artifact?.mimeType === 'string' ? artifact.mimeType : '',
        filename: typeof artifact?.filename === 'string' ? artifact.filename : null,
        workspacePath: typeof artifact?.workspacePath === 'string' ? artifact.workspacePath : null,
        hash:
          artifact?.hash && typeof artifact.hash === 'object'
            ? {
                algorithm: artifact.hash.algorithm,
                value: artifact.hash.value,
              }
            : null,
        dataFile: `artifacts/${dataFileName}`,
      };
    });
    entries[`${basePath}/artifacts/manifest.json`] = strToU8(
      JSON.stringify(artifactManifest, null, 2),
    );
    manifest.conversations.push({
      id: conversation?.id || '',
      name: String(conversation?.name || ''),
      folder: `conversations/${folderName}`,
      exports: [jsonFileName, markdownFileName],
      artifactCount: conversationArtifacts.length,
    });
  });

  entries[`${archiveRoot}/manifest.json`] = strToU8(JSON.stringify(manifest, null, 2));

  return {
    archiveFileName,
    archiveRoot,
    entries,
  };
}

export function buildBulkConversationExportZip(options = {}) {
  const { archiveFileName, archiveRoot, entries } = buildBulkConversationExportEntries(options);
  return {
    archiveFileName,
    archiveRoot,
    bytes: zipSync(entries, { level: 0 }),
  };
}
