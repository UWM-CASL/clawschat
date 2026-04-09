import { describe, expect, test, vi } from 'vitest';
import {
  buildConversationTranscriptForOrchestration,
  createAgentAutomationController,
  estimatePromptTokenCount,
} from '../../src/app/agent-automation.js';
import {
  addMessageToConversation,
  buildPromptForConversationLeaf,
  createConversation,
  getConversationPathMessages,
  getMessageNodeById,
  isAgentConversation,
  isHeartbeatMessage,
} from '../../src/state/conversation-model.js';

function completeModelMessage(message, text) {
  message.response = text;
  message.text = text;
  message.isResponseComplete = true;
  return message;
}

function createHarness() {
  const appState = {
    workspaceView: 'chat',
    activeGenerationConfig: {
      maxContextTokens: 4096,
    },
    isGenerating: false,
    isLoadingModel: false,
    isBlockingOrchestration: false,
    isRunningOrchestration: false,
    activeOrchestrationKind: 'none',
  };
  const nowRef = { value: 1000 };
  const conversations = [];
  const activeConversationId = { value: null };
  const scheduledTimeouts = [];
  const clearedTimeouts = [];

  const dependencies = {
    appState,
    engine: {
      cancelGeneration: vi.fn().mockResolvedValue(undefined),
    },
    runOrchestration: vi.fn(),
    queueConversationStateSave: vi.fn(),
    renderTranscript: vi.fn(),
    scrollTranscriptToBottom: vi.fn(),
    updateActionButtons: vi.fn(),
    setStatus: vi.fn(),
    appendDebug: vi.fn(),
    setOrchestrationRunning: vi.fn((state, running, options = {}) => {
      state.isRunningOrchestration = running;
      state.activeOrchestrationKind = running ? options.kind || 'none' : 'none';
      state.isBlockingOrchestration = running && options.blocksUi === true;
    }),
    setTimeoutRef: vi.fn((callback, delay = 0) => {
      const timer = { callback, delay, cleared: false };
      scheduledTimeouts.push(timer);
      return timer;
    }),
    clearTimeoutRef: vi.fn((timer) => {
      if (timer) {
        timer.cleared = true;
        clearedTimeouts.push(timer);
      }
    }),
    onScheduleChanged: vi.fn(),
  };

  function getActiveConversation() {
    return (
      conversations.find((conversation) => conversation.id === activeConversationId.value) || null
    );
  }

  const controller = createAgentAutomationController({
    appState,
    engine: dependencies.engine,
    runOrchestration: dependencies.runOrchestration,
    agentFollowUpOrchestration: { id: 'agent-follow-up' },
    summarizeConversationOrchestration: { id: 'summary' },
    getActiveConversation,
    findConversationById: (conversationId) =>
      conversations.find((conversation) => conversation.id === conversationId) || null,
    getConversationPathMessages,
    addMessageToConversation,
    buildPromptForConversation: (conversation) => buildPromptForConversationLeaf(conversation),
    getMessageNodeById,
    isAgentConversation,
    isHeartbeatMessage,
    isAgentConversationLoaded: () =>
      appState.workspaceView === 'chat' && isAgentConversation(getActiveConversation()),
    getAgentDisplayName: (conversation = getActiveConversation()) =>
      conversation?.agent?.name || conversation?.name || 'Agent',
    isGeneratingResponse: (state) => state.isGenerating === true,
    isLoadingModelState: (state) => state.isLoadingModel === true,
    isBlockingOrchestrationState: (state) => state.isBlockingOrchestration === true,
    setOrchestrationRunning: dependencies.setOrchestrationRunning,
    queueConversationStateSave: dependencies.queueConversationStateSave,
    renderTranscript: dependencies.renderTranscript,
    scrollTranscriptToBottom: dependencies.scrollTranscriptToBottom,
    updateActionButtons: dependencies.updateActionButtons,
    setStatus: dependencies.setStatus,
    appendDebug: dependencies.appendDebug,
    onScheduleChanged: dependencies.onScheduleChanged,
    followUpOrchestrationKind: 'agent-follow-up',
    summaryOrchestrationKind: 'summary',
    followUpIntervalMs: 15 * 60 * 1000,
    busyRetryMs: 30 * 1000,
    summaryTriggerRatio: 0.9,
    summaryMinMessages: 8,
    now: () => nowRef.value,
    setTimeoutRef: dependencies.setTimeoutRef,
    clearTimeoutRef: dependencies.clearTimeoutRef,
  });

  return {
    appState,
    conversations,
    activeConversationId,
    nowRef,
    scheduledTimeouts,
    clearedTimeouts,
    controller,
    dependencies,
    getActiveConversation,
  };
}

describe('agent-automation', () => {
  test('builds orchestration transcript labels for tools, summaries, and heartbeat turns', () => {
    const transcript = buildConversationTranscriptForOrchestration(
      [
        { role: 'user', text: 'Start here.' },
        { role: 'tool', toolName: 'tasklist', toolResult: '{"items":[]}' },
        { role: 'summary', summary: 'Earlier work was compacted.' },
        { role: 'user', text: 'Heartbeat text', speaker: 'Heartbeat' },
      ],
      {
        isHeartbeatMessage: (message) => message?.speaker === 'Heartbeat',
      }
    );

    expect(transcript).toContain('[User]\nStart here.');
    expect(transcript).toContain('[Tool:tasklist]\n{"items":[]}');
    expect(transcript).toContain('[Conversation Summary]\nEarlier work was compacted.');
    expect(transcript).toContain('[Heartbeat]\nHeartbeat text');
  });

  test('estimates prompt tokens for structured text and media content', () => {
    expect(
      estimatePromptTokenCount([
        { role: 'user', content: '12345678' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'abcd' },
            { type: 'image', artifactId: 'image-1' },
          ],
        },
      ])
    ).toBe(147);
  });

  test('schedules the next follow-up for the active agent conversation', () => {
    const harness = createHarness();
    const conversation = createConversation({
      id: 'conversation-agent',
      name: 'Agent Thread',
      conversationType: 'agent',
      agent: {
        name: 'Agent Thread',
        description: 'Helpful.',
        paused: false,
        lastActivityAt: 1000,
        lastFollowUpAt: null,
        nextFollowUpAt: null,
      },
    });
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;

    harness.controller.refreshState();

    expect(conversation.agent.nextFollowUpAt).toBe(901000);
    expect(harness.dependencies.queueConversationStateSave).toHaveBeenCalledTimes(1);
    expect(harness.scheduledTimeouts).toHaveLength(1);
    expect(harness.scheduledTimeouts[0].delay).toBe(900000);
    expect(harness.dependencies.onScheduleChanged).toHaveBeenCalled();
  });

  test('runs the agent follow-up orchestration and appends a heartbeat plus response', async () => {
    const harness = createHarness();
    const conversation = createConversation({
      id: 'conversation-agent',
      name: 'Research Partner',
      conversationType: 'agent',
      agent: {
        name: 'Research Partner',
        description: 'Helpful and proactive.',
        paused: false,
        lastActivityAt: 1000,
        lastFollowUpAt: null,
        nextFollowUpAt: 2000,
      },
    });
    const firstUser = addMessageToConversation(conversation, 'user', 'Check in later.');
    completeModelMessage(
      addMessageToConversation(conversation, 'model', '', { parentId: firstUser.id }),
      'I will keep an eye on it.'
    );
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.dependencies.runOrchestration.mockResolvedValue({
      finalOutput: 'Here is a useful follow-up.',
    });

    await harness.controller.runFollowUpOrchestration(conversation.id);

    const pathMessages = getConversationPathMessages(conversation);
    expect(pathMessages.map((message) => message.role)).toEqual(['user', 'model', 'user', 'model']);
    expect(pathMessages[2].speaker).toBe('Heartbeat');
    expect(pathMessages[2].text).toContain('Heartbeat:');
    expect(pathMessages[3].text).toBe('Here is a useful follow-up.');
    expect(pathMessages[3].isResponseComplete).toBe(true);
    expect(conversation.lastSpokenLeafMessageId).toBe(pathMessages[3].id);
    expect(harness.dependencies.setStatus).toHaveBeenCalledWith(
      'Research Partner sent a heartbeat follow-up.'
    );
    expect(harness.dependencies.setOrchestrationRunning).toHaveBeenNthCalledWith(
      1,
      harness.appState,
      true,
      { kind: 'agent-follow-up', blocksUi: false }
    );
    expect(harness.dependencies.runOrchestration).toHaveBeenCalledWith(
      { id: 'agent-follow-up' },
      expect.objectContaining({
        agentName: 'Research Partner',
        conversationSummary: '',
        recentTranscript: expect.stringContaining('[Heartbeat]'),
      }),
      expect.objectContaining({
        signal: expect.any(Object),
      })
    );
  });

  test('summarizes older agent context before send when the prompt is near the context limit', async () => {
    const harness = createHarness();
    harness.appState.activeGenerationConfig.maxContextTokens = 120;
    const conversation = createConversation({
      id: 'conversation-summary',
      name: 'Agent Thread',
      conversationType: 'agent',
      agent: {
        name: 'Agent Thread',
        description: 'Summarizes context.',
        paused: false,
        lastActivityAt: 1000,
        lastFollowUpAt: null,
        nextFollowUpAt: 2000,
      },
    });

    let parentId = null;
    for (let index = 0; index < 4; index += 1) {
      const userMessage = addMessageToConversation(
        conversation,
        'user',
        `User message ${index} `.repeat(12),
        { parentId }
      );
      const modelMessage = completeModelMessage(
        addMessageToConversation(conversation, 'model', '', { parentId: userMessage.id }),
        `Model response ${index} `.repeat(12)
      );
      parentId = modelMessage.id;
    }
    const pendingUserMessage = addMessageToConversation(
      conversation,
      'user',
      'Newest user request '.repeat(8),
      { parentId }
    );
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.dependencies.runOrchestration.mockResolvedValue({
      finalOutput: 'Summary of older context.',
    });

    const didContinue = await harness.controller.ensureSummaryBeforeSend(
      conversation,
      pendingUserMessage
    );

    expect(didContinue).toBe(true);
    const summaryMessage = getMessageNodeById(conversation, pendingUserMessage.parentId);
    expect(summaryMessage?.role).toBe('summary');
    expect(summaryMessage?.summary).toBe('Summary of older context.');
    expect(summaryMessage?.childIds).toEqual([pendingUserMessage.id]);
    expect(harness.dependencies.runOrchestration).toHaveBeenCalledWith(
      { id: 'summary' },
      expect.objectContaining({
        previousSummary: '',
        recentTranscript: expect.stringContaining('[User]'),
      })
    );
    expect(harness.dependencies.renderTranscript).toHaveBeenCalledWith({ scrollToBottom: false });
  });
});
