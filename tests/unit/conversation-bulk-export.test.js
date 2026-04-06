import { describe, expect, test } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import {
  buildBulkConversationExportEntries,
  buildBulkConversationExportZip,
} from '../../src/app/conversation-bulk-export.js';

function createAppStateFixture() {
  return {
    activeConversationId: 'conversation-1',
    conversationCount: 2,
    conversationIdCounter: 2,
    conversations: [
      {
        id: 'conversation-1',
        name: 'Physics Notes',
        modelId: 'model-a',
        startedAt: Date.UTC(2026, 3, 1, 10, 0, 0),
        activeLeafMessageId: 'model-1',
        lastSpokenLeafMessageId: 'model-1',
        messageNodeCounter: 2,
        messageNodes: [
          {
            id: 'user-1',
            role: 'user',
            speaker: 'User',
            text: 'Summarize this PDF.',
            createdAt: Date.UTC(2026, 3, 1, 10, 0, 0),
            parentId: null,
            childIds: ['model-1'],
            content: {
              parts: [
                { type: 'text', text: 'Summarize this PDF.' },
                {
                  type: 'file',
                  artifactId: 'artifact-text-1',
                  mimeType: 'text/markdown',
                  filename: 'notes.md',
                  text: '# Notes',
                  llmText: '# Notes',
                },
              ],
              llmRepresentation: { type: 'text', text: 'Summarize this PDF.' },
            },
            artifactRefs: [
              {
                id: 'artifact-text-1',
                kind: 'text',
                mimeType: 'text/markdown',
                filename: 'notes.md',
              },
            ],
          },
          {
            id: 'model-1',
            role: 'model',
            speaker: 'Model',
            text: 'Here is the summary.',
            response: 'Here is the summary.',
            createdAt: Date.UTC(2026, 3, 1, 10, 0, 30),
            parentId: 'user-1',
            childIds: [],
            isResponseComplete: true,
            content: {
              parts: [{ type: 'text', text: 'Here is the summary.' }],
              llmRepresentation: { type: 'text', text: 'Here is the summary.' },
            },
            artifactRefs: [],
          },
        ],
      },
      {
        id: 'conversation-2',
        name: 'Lab Photo',
        modelId: 'model-b',
        startedAt: Date.UTC(2026, 3, 2, 11, 0, 0),
        activeLeafMessageId: 'user-2',
        lastSpokenLeafMessageId: 'user-2',
        messageNodeCounter: 1,
        messageNodes: [
          {
            id: 'user-2',
            role: 'user',
            speaker: 'User',
            text: 'Describe this image.',
            createdAt: Date.UTC(2026, 3, 2, 11, 0, 0),
            parentId: null,
            childIds: [],
            content: {
              parts: [
                { type: 'text', text: 'Describe this image.' },
                {
                  type: 'image',
                  artifactId: 'artifact-image-1',
                  mimeType: 'image/png',
                  filename: 'lab.png',
                  base64: 'AQID',
                },
              ],
              llmRepresentation: { type: 'text', text: 'Describe this image.' },
            },
            artifactRefs: [
              {
                id: 'artifact-image-1',
                kind: 'binary',
                mimeType: 'image/png',
                filename: 'lab.png',
              },
            ],
          },
        ],
      },
    ],
  };
}

function createDependencies() {
  return {
    getMessageArtifacts(message, conversationId) {
      return Array.isArray(message?.artifactRefs)
        ? message.artifactRefs.map((artifactRef) => ({
            id: artifactRef.id,
            conversationId,
            messageId: message.id,
            kind: artifactRef.kind,
            mimeType: artifactRef.mimeType,
            encoding: artifactRef.kind === 'binary' ? 'base64' : 'utf-8',
            data: artifactRef.kind === 'binary' ? 'AQID' : '# Notes',
            filename: artifactRef.filename,
            workspacePath: `/workspace/${artifactRef.filename}`,
          }))
        : [];
    },
    getConversationModelId(conversation) {
      return conversation.modelId;
    },
    getConversationSystemPromptSuffix() {
      return '';
    },
    getToolCallingContext() {
      return {
        supported: true,
        enabledTools: ['run_shell_command'],
        exposedToolNames: ['run_shell_command'],
      };
    },
    getStoredGenerationConfigForModel(modelId) {
      return modelId === 'model-b' ? { temperature: 0.4 } : { temperature: 0.7 };
    },
    getModelGenerationLimits() {
      return {
        defaultMaxOutputTokens: 256,
        defaultMaxContextTokens: 1024,
        defaultTemperature: 0.6,
        minTemperature: 0,
        maxTemperature: 2,
        defaultTopK: 40,
        defaultTopP: 0.95,
      };
    },
  };
}

describe('conversation-bulk-export', () => {
  test('builds archive entries for conversations, markdown, and artifacts', () => {
    const result = buildBulkConversationExportEntries({
      appState: createAppStateFixture(),
      now: Date.UTC(2026, 3, 5, 12, 0, 0),
      ...createDependencies(),
    });

    expect(result.archiveFileName).toBe('browser-llm-runner-export-20260405T120000Z.zip');
    const paths = Object.keys(result.entries);
    expect(paths).toContain(
      'browser-llm-runner-export-20260405T120000Z/storage/conversations.llm.json'
    );
    expect(paths.some((path) => path.endsWith('/physics-notes.llm.json'))).toBe(true);
    expect(paths.some((path) => path.endsWith('/physics-notes.md'))).toBe(true);
    expect(paths.some((path) => path.endsWith('/artifacts/notes.md'))).toBe(true);
    expect(paths.some((path) => path.endsWith('/artifacts/lab.png'))).toBe(true);
  });

  test('builds a zip that contains the manifest and conversation exports', () => {
    const result = buildBulkConversationExportZip({
      appState: createAppStateFixture(),
      now: Date.UTC(2026, 3, 5, 12, 0, 0),
      ...createDependencies(),
    });

    const archive = unzipSync(result.bytes);
    const manifest = JSON.parse(
      strFromU8(archive['browser-llm-runner-export-20260405T120000Z/manifest.json'])
    );
    expect(manifest.conversationCount).toBe(2);
    expect(manifest.artifactCount).toBe(2);

    const conversationJsonPath = Object.keys(archive).find((path) =>
      path.endsWith('/physics-notes.llm.json')
    );
    expect(conversationJsonPath).toBeTruthy();
    const conversationJson = JSON.parse(strFromU8(archive[conversationJsonPath]));
    expect(conversationJson.model).toBe('model-a');
    expect(conversationJson.temperature).toBe(0.7);

    const conversationMarkdownPath = Object.keys(archive).find((path) =>
      path.endsWith('/lab-photo.md')
    );
    expect(conversationMarkdownPath).toBeTruthy();
    const markdown = strFromU8(archive[conversationMarkdownPath]);
    expect(markdown).toContain('# Lab Photo');
  });
});
