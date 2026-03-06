import { describe, expect, test, vi } from 'vitest';
import { createAppController } from '../../src/state/app-controller.js';
import {
  addMessageToConversation,
  buildPromptForConversationLeaf,
  createConversation,
  deriveConversationName,
  getMessageNodeById,
  normalizeConversationName,
} from '../../src/state/conversation-model.js';

function createControllerHarness() {
  const state = {
    modelReady: false,
    isGenerating: false,
    isLoadingModel: false,
    isRunningOrchestration: false,
    activeGenerationConfig: {
      maxOutputTokens: 256,
      maxContextTokens: 2048,
      temperature: 0.6,
      topK: 50,
      topP: 0.9,
    },
    activeUserEditMessageId: null,
  };
  const conversations = [];
  const activeConversationId = { value: null };
  const callLog = [];
  const engine = {
    config: {
      modelId: 'test-model',
      generationConfig: state.activeGenerationConfig,
    },
    initialize: vi.fn().mockResolvedValue({ backend: 'wasm' }),
    generate: vi.fn(),
    cancelGeneration: vi.fn().mockResolvedValue(undefined),
  };

  function getActiveConversation() {
    return conversations.find((conversation) => conversation.id === activeConversationId.value) || null;
  }

  const dependencies = {
    state,
    engine,
    runOrchestration: vi.fn(),
    renameOrchestration: { id: 'rename-chat', steps: [{ prompt: 'Title {{userPrompt}}' }] },
    fixOrchestration: { id: 'fix-response', steps: [{ prompt: 'Fix {{assistantResponse}}' }] },
    readEngineConfig: () => ({
      modelId: 'test-model',
      backendPreference: 'auto',
      runtime: {},
      generationConfig: state.activeGenerationConfig,
    }),
    persistInferencePreferences: vi.fn(() => callLog.push('persistInferencePreferences')),
    getActiveConversation,
    findConversationById: (conversationId) =>
      conversations.find((conversation) => conversation.id === conversationId) || null,
    hasSelectedConversationWithHistory: () => Boolean(getActiveConversation()?.messageNodes.length),
    normalizeModelId: (value) => value,
    getThinkingTagsForModel: () => null,
    getSelectedModelId: () => 'test-model',
    addMessageToConversation,
    buildPromptForConversationLeaf,
    getMessageNodeById,
    deriveConversationName,
    normalizeConversationName,
    removeLeafMessageFromConversation: vi.fn(() => true),
    parseThinkingText: (rawText) => ({
      response: String(rawText || ''),
      thoughts: '',
      hasThinking: false,
      isThinkingComplete: false,
    }),
    findMessageElement: () => null,
    addMessageElement: vi.fn(() => ({ nodeName: 'LI' })),
    updateModelMessageElement: vi.fn(),
    renderTranscript: vi.fn(() => callLog.push('renderTranscript')),
    renderConversationList: vi.fn(() => callLog.push('renderConversationList')),
    updateChatTitle: vi.fn(() => callLog.push('updateChatTitle')),
    updateActionButtons: vi.fn(() => callLog.push('updateActionButtons')),
    updateWelcomePanelVisibility: vi.fn(() => callLog.push('updateWelcomePanelVisibility')),
    queueConversationStateSave: vi.fn(() => callLog.push('queueConversationStateSave')),
    scrollTranscriptToBottom: vi.fn(() => callLog.push('scrollTranscriptToBottom')),
    setStatus: vi.fn((message) => callLog.push(`status:${message}`)),
    appendDebug: vi.fn((message) => callLog.push(`debug:${message}`)),
    showProgressRegion: vi.fn((visible) => callLog.push(`progress:${visible}`)),
    clearLoadError: vi.fn(() => callLog.push('clearLoadError')),
    resetLoadProgressFiles: vi.fn(() => callLog.push('resetLoadProgressFiles')),
    setLoadProgress: vi.fn((progress) => callLog.push(`load:${progress.message}`)),
    showLoadError: vi.fn((message) => callLog.push(`loadError:${message}`)),
    applyPendingGenerationSettingsIfReady: vi.fn(() =>
      callLog.push('applyPendingGenerationSettingsIfReady'),
    ),
    markActiveIncompleteModelMessageComplete: vi.fn(() =>
      callLog.push('markActiveIncompleteModelMessageComplete'),
    ),
    scheduleTask: (callback) => callback(),
  };

  return {
    controller: createAppController(dependencies),
    state,
    engine,
    conversations,
    activeConversationId,
    dependencies,
    callLog,
  };
}

describe('app-controller', () => {
  test('initializes the engine and updates loading state', async () => {
    const harness = createControllerHarness();

    await harness.controller.initializeEngine();

    expect(harness.engine.initialize).toHaveBeenCalledWith({
      modelId: 'test-model',
      backendPreference: 'auto',
      runtime: {},
      generationConfig: harness.state.activeGenerationConfig,
    });
    expect(harness.state.modelReady).toBe(true);
    expect(harness.state.isLoadingModel).toBe(false);
    expect(harness.callLog).toContain('status:Loading model...');
    expect(harness.callLog).toContain('load:Model ready.');
    expect(harness.callLog).toContain('updateWelcomePanelVisibility');
    expect(harness.callLog).toContain('updateChatTitle');
  });

  test('stops generation and performs cleanup', async () => {
    const harness = createControllerHarness();
    harness.state.isGenerating = true;

    await harness.controller.stopGeneration();

    expect(harness.engine.cancelGeneration).toHaveBeenCalledTimes(1);
    expect(harness.state.isGenerating).toBe(false);
    expect(harness.state.modelReady).toBe(true);
    expect(harness.callLog).toContain('status:Stopped');
    expect(harness.callLog).toContain('markActiveIncompleteModelMessageComplete');
    expect(harness.callLog).toContain('applyPendingGenerationSettingsIfReady');
  });

  test('runs rename orchestration through the controller and updates the conversation', async () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-1', name: 'New Conversation' });
    const userMessage = addMessageToConversation(conversation, 'user', 'Explain photosynthesis.');
    addMessageToConversation(conversation, 'model', 'Plants convert light into energy.', {
      parentId: userMessage.id,
    }).isResponseComplete = true;
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;
    harness.dependencies.runOrchestration.mockResolvedValue({
      finalPrompt: 'ignored',
      finalOutput: 'Plant Energy Basics',
    });

    await harness.controller.runRenameChatOrchestration(conversation.id, {
      userPrompt: 'Explain photosynthesis.',
      assistantResponse: 'Plants convert light into energy.',
    });

    expect(harness.dependencies.runOrchestration).toHaveBeenCalledWith(
      harness.dependencies.renameOrchestration,
      {
        userPrompt: 'Explain photosynthesis.',
        assistantResponse: 'Plants convert light into energy.',
      },
    );
    expect(conversation.name).toBe('Plant Energy Basics');
    expect(conversation.hasGeneratedName).toBe(true);
    expect(harness.callLog).toContain('renderConversationList');
    expect(harness.callLog).toContain('updateChatTitle');
    expect(harness.state.isRunningOrchestration).toBe(false);
  });
});
