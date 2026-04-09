import { HEARTBEAT_SPEAKER } from '../state/conversation-model.js';

export function buildAgentHeartbeatText({ userRepliedSinceLastHeartbeat }) {
  if (userRepliedSinceLastHeartbeat) {
    return (
      'Heartbeat: Review the conversation now. ' +
      'If you have something concrete, useful, or newly insightful to do, do it now. Otherwise stay quiet.'
    );
  }
  return (
    'Heartbeat: The user has not replied since the last heartbeat. ' +
    'Do not press the same question again. If you have a fresh angle, a concrete next step, or something genuinely useful to add, do it now. Otherwise stay quiet.'
  );
}

/**
 * @param {any[]} [messages]
 * @param {{ isHeartbeatMessage?: (message: any) => boolean; maxMessages?: number | null }} [options]
 */
export function buildConversationTranscriptForOrchestration(
  messages = [],
  { isHeartbeatMessage = () => false, maxMessages = null } = {}
) {
  const normalizedMessages = Array.isArray(messages)
    ? messages.filter(
        (message) =>
          message &&
          (message.role === 'user' ||
            message.role === 'model' ||
            message.role === 'tool' ||
            message.role === 'summary')
      )
    : [];
  const visibleMessages =
    Number.isInteger(maxMessages) && maxMessages > 0
      ? normalizedMessages.slice(-maxMessages)
      : normalizedMessages;
  return visibleMessages
    .map((message) => {
      if (message.role === 'tool') {
        return `[Tool:${message.toolName || 'unknown'}]\n${String(
          message.toolResult || message.text || ''
        ).trim()}`;
      }
      if (message.role === 'summary') {
        return `[Conversation Summary]\n${String(message.summary || message.text || '').trim()}`;
      }
      const label = isHeartbeatMessage(message)
        ? 'Heartbeat'
        : message.role === 'user'
          ? 'User'
          : 'Model';
      const body =
        message.role === 'model'
          ? String(message.response || message.text || '').trim()
          : String(message.text || '').trim();
      return `[${label}]\n${body}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function estimatePromptContentTokens(content) {
  if (Array.isArray(content)) {
    return content.reduce((total, part) => total + estimatePromptContentTokens(part), 0);
  }
  if (content && typeof content === 'object') {
    if (content.type === 'text' && typeof content.text === 'string') {
      return Math.max(1, Math.ceil(content.text.length / 4));
    }
    if (content.type === 'image' || content.type === 'audio') {
      return 128;
    }
    return estimatePromptContentTokens(Object.values(content));
  }
  const text = String(content || '');
  return text.trim() ? Math.max(1, Math.ceil(text.length / 4)) : 0;
}

export function estimatePromptTokenCount(prompt) {
  if (!Array.isArray(prompt)) {
    return estimatePromptContentTokens(prompt);
  }
  return prompt.reduce(
    (total, message) => total + 6 + estimatePromptContentTokens(message?.content),
    4
  );
}

/**
 * @param {object} options
 * @param {any} options.appState
 * @param {{ cancelGeneration: () => Promise<any> }} options.engine
 * @param {(orchestration: any, inputs: any, options?: any) => Promise<{ finalOutput?: any }>} options.runOrchestration
 * @param {any} options.agentFollowUpOrchestration
 * @param {any} options.summarizeConversationOrchestration
 * @param {() => any} options.getActiveConversation
 * @param {(conversationId: string) => any} options.findConversationById
 * @param {(conversation: any, leafMessageId?: string) => any[]} options.getConversationPathMessages
 * @param {(conversation: any, role: string, text: string, options?: any) => any} options.addMessageToConversation
 * @param {(conversation: any) => any} options.buildPromptForConversation
 * @param {(conversation: any, messageId: string) => any} options.getMessageNodeById
 * @param {(conversation: any) => boolean} options.isAgentConversation
 * @param {(message: any) => boolean} options.isHeartbeatMessage
 * @param {() => boolean} options.isAgentConversationLoaded
 * @param {(conversation?: any) => string} options.getAgentDisplayName
 * @param {(state: any) => boolean} options.isGeneratingResponse
 * @param {(state: any) => boolean} options.isLoadingModelState
 * @param {(state: any) => boolean} options.isBlockingOrchestrationState
 * @param {(state: any, running: boolean, options?: any) => any} options.setOrchestrationRunning
 * @param {() => void} options.queueConversationStateSave
 * @param {(options?: any) => void} options.renderTranscript
 * @param {() => void} options.scrollTranscriptToBottom
 * @param {() => void} options.updateActionButtons
 * @param {(message: string) => void} options.setStatus
 * @param {(message: string) => void} [options.appendDebug]
 * @param {() => void} [options.onScheduleChanged]
 * @param {string} [options.followUpOrchestrationKind]
 * @param {string} [options.summaryOrchestrationKind]
 * @param {number} [options.followUpIntervalMs]
 * @param {number} [options.busyRetryMs]
 * @param {number} [options.summaryTriggerRatio]
 * @param {number} [options.summaryMinMessages]
 * @param {() => number} [options.now]
 * @param {() => AbortController} [options.createAbortController]
 * @param {(callback: () => void, delay?: number) => any} [options.setTimeoutRef]
 * @param {(timerId: any) => void} [options.clearTimeoutRef]
 */
export function createAgentAutomationController({
  appState,
  engine,
  runOrchestration,
  agentFollowUpOrchestration,
  summarizeConversationOrchestration,
  getActiveConversation,
  findConversationById,
  getConversationPathMessages,
  addMessageToConversation,
  buildPromptForConversation,
  getMessageNodeById,
  isAgentConversation,
  isHeartbeatMessage,
  isAgentConversationLoaded,
  getAgentDisplayName,
  isGeneratingResponse,
  isLoadingModelState,
  isBlockingOrchestrationState,
  setOrchestrationRunning,
  queueConversationStateSave,
  renderTranscript,
  scrollTranscriptToBottom,
  updateActionButtons,
  setStatus,
  appendDebug = (_message) => {},
  onScheduleChanged = () => {},
  followUpOrchestrationKind = 'agent-follow-up',
  summaryOrchestrationKind = 'summary',
  followUpIntervalMs = 15 * 60 * 1000,
  busyRetryMs = 30 * 1000,
  summaryTriggerRatio = 0.9,
  summaryMinMessages = 8,
  now = () => Date.now(),
  createAbortController = () => new AbortController(),
  setTimeoutRef = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutRef = globalThis.clearTimeout?.bind(globalThis),
}) {
  let agentFollowUpTimerId = null;
  let activeAgentFollowUpAbortController = null;
  let activeAgentFollowUpConversationId = '';

  function clearAgentFollowUpTimer() {
    if (agentFollowUpTimerId !== null) {
      clearTimeoutRef?.(agentFollowUpTimerId);
      agentFollowUpTimerId = null;
    }
  }

  function isFollowUpRunning(conversation = getActiveConversation()) {
    return (
      Boolean(activeAgentFollowUpAbortController) &&
      Boolean(conversation?.id) &&
      activeAgentFollowUpConversationId === conversation.id
    );
  }

  function getConversationMessagesAfterLatestSummary(
    conversation,
    leafMessageId = conversation?.activeLeafMessageId
  ) {
    const pathMessages = getConversationPathMessages(conversation, leafMessageId);
    const lastSummaryIndex = pathMessages.reduce(
      (latestIndex, message, index) => (message?.role === 'summary' ? index : latestIndex),
      -1
    );
    return {
      pathMessages,
      lastSummary:
        lastSummaryIndex >= 0 && pathMessages[lastSummaryIndex]?.role === 'summary'
          ? pathMessages[lastSummaryIndex]
          : null,
      recentMessages: lastSummaryIndex >= 0 ? pathMessages.slice(lastSummaryIndex + 1) : pathMessages,
    };
  }

  function collectArtifactRefsFromMessages(messages = []) {
    const refs = [];
    const seenKeys = new Set();
    messages.forEach((message) => {
      const messageRefs = Array.isArray(message?.artifactRefs) ? message.artifactRefs : [];
      messageRefs.forEach((ref) => {
        if (!ref || typeof ref !== 'object') {
          return;
        }
        const id = typeof ref.id === 'string' ? ref.id.trim() : '';
        const filename = typeof ref.filename === 'string' ? ref.filename.trim() : '';
        const workspacePath = typeof ref.workspacePath === 'string' ? ref.workspacePath.trim() : '';
        const key = id || `${filename}::${workspacePath}`;
        if (!key || seenKeys.has(key)) {
          return;
        }
        seenKeys.add(key);
        refs.push(ref);
      });
    });
    return refs;
  }

  function formatArtifactRefsForPrompt(artifactRefs = []) {
    const lines = [];
    collectArtifactRefsFromMessages([{ artifactRefs }]).forEach((ref) => {
      const filename = typeof ref.filename === 'string' ? ref.filename.trim() : '';
      const workspacePath = typeof ref.workspacePath === 'string' ? ref.workspacePath.trim() : '';
      if (!filename && !workspacePath) {
        return;
      }
      lines.push(
        workspacePath && filename
          ? `- ${filename} (${workspacePath})`
          : `- ${filename || workspacePath}`
      );
    });
    return lines.join('\n');
  }

  function hasUserReplySinceLatestHeartbeat(messages = []) {
    if (!Array.isArray(messages) || !messages.length) {
      return true;
    }
    let latestHeartbeatIndex = -1;
    messages.forEach((message, index) => {
      if (isHeartbeatMessage(message)) {
        latestHeartbeatIndex = index;
      }
    });
    if (latestHeartbeatIndex < 0) {
      return true;
    }
    return messages
      .slice(latestHeartbeatIndex + 1)
      .some((message) => message?.role === 'user' && !isHeartbeatMessage(message));
  }

  function addAgentHeartbeatMessage(conversation, { userRepliedSinceLastHeartbeat }) {
    const heartbeatText = buildAgentHeartbeatText({ userRepliedSinceLastHeartbeat });
    const heartbeatMessage = addMessageToConversation(conversation, 'user', heartbeatText, {
      parentId: conversation?.activeLeafMessageId || null,
    });
    heartbeatMessage.speaker = HEARTBEAT_SPEAKER;
    if (heartbeatMessage.content && typeof heartbeatMessage.content === 'object') {
      heartbeatMessage.content.llmRepresentation = heartbeatText;
    }
    conversation.activeLeafMessageId = heartbeatMessage.id;
    conversation.lastSpokenLeafMessageId = heartbeatMessage.id;
    return heartbeatMessage;
  }

  function scheduleNextFollowUp(conversation, { from = now(), persist = false } = {}) {
    if (!isAgentConversation(conversation) || !conversation.agent) {
      return null;
    }
    conversation.agent.nextFollowUpAt =
      Math.max(Math.trunc(from), conversation.agent.lastActivityAt || Math.trunc(from)) +
      followUpIntervalMs;
    if (persist) {
      queueConversationStateSave();
    }
    return conversation.agent.nextFollowUpAt;
  }

  function recordActivity(conversation, { timestamp = now(), persist = false } = {}) {
    if (!isAgentConversation(conversation) || !conversation.agent) {
      return;
    }
    conversation.agent.lastActivityAt = Math.trunc(timestamp);
    scheduleNextFollowUp(conversation, { from: conversation.agent.lastActivityAt });
    if (persist) {
      queueConversationStateSave();
    }
  }

  async function cancelActiveFollowUp({ preserveSchedule = true } = {}) {
    clearAgentFollowUpTimer();
    if (!activeAgentFollowUpAbortController) {
      onScheduleChanged();
      return;
    }
    const abortController = activeAgentFollowUpAbortController;
    const conversationId = activeAgentFollowUpConversationId;
    activeAgentFollowUpAbortController = null;
    activeAgentFollowUpConversationId = '';
    if (!abortController.signal.aborted) {
      abortController.abort();
    }
    try {
      await engine.cancelGeneration();
    } catch (error) {
      appendDebug(
        `Agent follow-up cancellation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setOrchestrationRunning(appState, false);
      updateActionButtons();
      if (!preserveSchedule) {
        const conversation = findConversationById(conversationId);
        if (conversation?.agent) {
          conversation.agent.nextFollowUpAt = null;
          queueConversationStateSave();
        }
      }
      onScheduleChanged();
    }
  }

  function refreshState({ forceReschedule = false } = {}) {
    clearAgentFollowUpTimer();
    const activeConversation = getActiveConversation();
    if (
      !isAgentConversationLoaded() ||
      !activeConversation?.agent ||
      activeConversation.agent.paused === true
    ) {
      if (activeAgentFollowUpAbortController) {
        void cancelActiveFollowUp();
      } else {
        onScheduleChanged();
      }
      return;
    }
    if (forceReschedule || !Number.isFinite(activeConversation.agent.nextFollowUpAt)) {
      scheduleNextFollowUp(activeConversation, {
        from:
          activeConversation.agent.lastFollowUpAt ||
          activeConversation.agent.lastActivityAt ||
          now(),
      });
      queueConversationStateSave();
    }
    const nextFollowUpAt = Number(activeConversation.agent.nextFollowUpAt) || 0;
    const delay = Math.max(0, nextFollowUpAt - now());
    if (typeof setTimeoutRef === 'function') {
      agentFollowUpTimerId = setTimeoutRef(() => {
        void runFollowUpOrchestration(activeConversation.id);
      }, delay);
    }
    onScheduleChanged();
  }

  async function runFollowUpOrchestration(conversationId) {
    const conversation = findConversationById(conversationId);
    if (
      !conversation ||
      !isAgentConversation(conversation) ||
      conversation.agent?.paused === true ||
      getActiveConversation()?.id !== conversation.id ||
      !isAgentConversationLoaded()
    ) {
      onScheduleChanged();
      return;
    }
    if (
      isGeneratingResponse(appState) ||
      isLoadingModelState(appState) ||
      isBlockingOrchestrationState(appState)
    ) {
      conversation.agent.nextFollowUpAt = now() + busyRetryMs;
      queueConversationStateSave();
      refreshState();
      return;
    }
    const { lastSummary, recentMessages } = getConversationMessagesAfterLatestSummary(conversation);
    const visibleMessages = recentMessages.filter((message) => message.role !== 'summary');
    const hasConversationContext =
      Boolean(lastSummary) ||
      visibleMessages.some((message) => message.role === 'user' && !isHeartbeatMessage(message));
    if (!hasConversationContext) {
      conversation.agent.nextFollowUpAt = now() + busyRetryMs;
      queueConversationStateSave();
      refreshState();
      return;
    }
    const conversationSummary = lastSummary
      ? String(lastSummary.summary || lastSummary.text || '')
      : '';
    const artifactRefs = collectArtifactRefsFromMessages([
      ...(lastSummary ? [lastSummary] : []),
      ...visibleMessages,
    ]);
    const abortController = createAbortController();
    activeAgentFollowUpAbortController = abortController;
    activeAgentFollowUpConversationId = conversation.id;
    setOrchestrationRunning(appState, true, {
      kind: followUpOrchestrationKind,
      blocksUi: false,
    });
    updateActionButtons();
    appendDebug(`Agent follow-up started for ${conversation.name}.`);
    try {
      const heartbeatMessage = addAgentHeartbeatMessage(conversation, {
        userRepliedSinceLastHeartbeat: hasUserReplySinceLatestHeartbeat(visibleMessages),
      });
      conversation.agent.lastFollowUpAt = heartbeatMessage.createdAt || now();
      scheduleNextFollowUp(conversation, { from: conversation.agent.lastFollowUpAt });
      renderTranscript({ scrollToBottom: false });
      scrollTranscriptToBottom();
      queueConversationStateSave();
      const { finalOutput } = await runOrchestration(
        agentFollowUpOrchestration,
        {
          agentName: getAgentDisplayName(conversation),
          agentDescription:
            typeof conversation.agent?.description === 'string' ? conversation.agent.description : '',
          conversationSummary,
          recentTranscript: buildConversationTranscriptForOrchestration(
            [...visibleMessages, heartbeatMessage],
            {
              isHeartbeatMessage,
              maxMessages: 12,
            }
          ),
          uploadedFiles: formatArtifactRefsForPrompt(artifactRefs),
        },
        {
          signal: abortController.signal,
        }
      );
      const normalizedOutput = String(finalOutput || '').trim();
      if (
        !normalizedOutput ||
        normalizedOutput === '[NO_FOLLOW_UP]' ||
        getActiveConversation()?.id !== conversation.id ||
        conversation.agent?.paused === true
      ) {
        queueConversationStateSave();
        return;
      }
      const followUpMessage = addMessageToConversation(conversation, 'model', normalizedOutput, {
        parentId: conversation.activeLeafMessageId,
        response: normalizedOutput,
      });
      followUpMessage.response = normalizedOutput;
      followUpMessage.text = normalizedOutput;
      followUpMessage.rawStreamText = normalizedOutput;
      followUpMessage.thoughts = '';
      followUpMessage.hasThinking = false;
      followUpMessage.isThinkingComplete = false;
      followUpMessage.isResponseComplete = true;
      conversation.lastSpokenLeafMessageId = followUpMessage.id;
      conversation.agent.lastFollowUpAt = now();
      recordActivity(conversation, { timestamp: conversation.agent.lastFollowUpAt });
      renderTranscript({ scrollToBottom: false });
      scrollTranscriptToBottom();
      queueConversationStateSave();
      setStatus(`${getAgentDisplayName(conversation)} sent a heartbeat follow-up.`);
    } catch (error) {
      if (abortController.signal.aborted) {
        appendDebug('Agent follow-up canceled.');
        return;
      }
      appendDebug(
        `Agent follow-up failed: ${error instanceof Error ? error.message : String(error)}`
      );
      if (conversation.agent) {
        conversation.agent.nextFollowUpAt = now() + busyRetryMs;
        queueConversationStateSave();
      }
    } finally {
      if (activeAgentFollowUpAbortController === abortController) {
        activeAgentFollowUpAbortController = null;
        activeAgentFollowUpConversationId = '';
      }
      setOrchestrationRunning(appState, false);
      updateActionButtons();
      refreshState();
    }
  }

  function insertSummaryNodeBeforeMessage(conversation, targetMessage, summaryText, artifactRefs = []) {
    if (!conversation || !targetMessage?.id || !targetMessage.parentId) {
      return null;
    }
    const previousParent = getMessageNodeById(conversation, targetMessage.parentId);
    if (!previousParent) {
      return null;
    }
    const summaryMessage = addMessageToConversation(conversation, 'summary', summaryText, {
      parentId: previousParent.id,
      artifactRefs,
    });
    previousParent.childIds = (previousParent.childIds || []).filter(
      (childId) => childId !== targetMessage.id
    );
    if (!(previousParent.childIds || []).includes(summaryMessage.id)) {
      previousParent.childIds.push(summaryMessage.id);
    }
    summaryMessage.childIds = [targetMessage.id];
    targetMessage.parentId = summaryMessage.id;
    conversation.activeLeafMessageId = targetMessage.id;
    return summaryMessage;
  }

  async function ensureSummaryBeforeSend(conversation, userMessage) {
    if (
      !conversation ||
      !userMessage ||
      !isAgentConversation(conversation) ||
      !conversation.agent ||
      !userMessage.parentId
    ) {
      return true;
    }
    const estimatedPromptTokens = estimatePromptTokenCount(buildPromptForConversation(conversation));
    const contextLimit = Number(appState.activeGenerationConfig?.maxContextTokens) || 0;
    if (!contextLimit || estimatedPromptTokens < Math.floor(contextLimit * summaryTriggerRatio)) {
      return true;
    }
    const { lastSummary, recentMessages } = getConversationMessagesAfterLatestSummary(
      conversation,
      userMessage.parentId
    );
    const messagesToSummarize = recentMessages.filter((message) => message.role !== 'summary');
    if (messagesToSummarize.length < summaryMinMessages) {
      return true;
    }
    const artifactRefs = collectArtifactRefsFromMessages([
      ...(lastSummary ? [lastSummary] : []),
      ...messagesToSummarize,
    ]);
    setOrchestrationRunning(appState, true, {
      kind: summaryOrchestrationKind,
      blocksUi: true,
    });
    updateActionButtons();
    setStatus('Summarizing earlier conversation context...');
    try {
      const { finalOutput } = await runOrchestration(summarizeConversationOrchestration, {
        previousSummary: lastSummary ? String(lastSummary.summary || lastSummary.text || '') : '',
        recentTranscript: buildConversationTranscriptForOrchestration(messagesToSummarize, {
          isHeartbeatMessage,
        }),
        uploadedFiles: formatArtifactRefsForPrompt(artifactRefs),
      });
      const summaryText = String(finalOutput || '').trim();
      if (!summaryText) {
        return true;
      }
      insertSummaryNodeBeforeMessage(conversation, userMessage, summaryText, artifactRefs);
      queueConversationStateSave();
      renderTranscript({ scrollToBottom: false });
      return true;
    } catch (error) {
      appendDebug(
        `Conversation summary failed: ${error instanceof Error ? error.message : String(error)}`
      );
      setStatus('Conversation summary failed. Continuing without compaction.');
      return true;
    } finally {
      setOrchestrationRunning(appState, false);
      updateActionButtons();
    }
  }

  function togglePauseState() {
    const activeConversation = getActiveConversation();
    if (!isAgentConversation(activeConversation) || !activeConversation?.agent) {
      return;
    }
    activeConversation.agent.paused = activeConversation.agent.paused !== true;
    if (activeConversation.agent.paused) {
      activeConversation.agent.nextFollowUpAt = null;
      void cancelActiveFollowUp({ preserveSchedule: false });
      setStatus(`${getAgentDisplayName(activeConversation)} paused.`);
    } else {
      scheduleNextFollowUp(activeConversation, { from: now() });
      refreshState();
      setStatus(`${getAgentDisplayName(activeConversation)} resumed.`);
    }
    queueConversationStateSave();
    updateActionButtons();
  }

  function handleCompletedModelMessage(conversation, message) {
    if (!conversation || !message || message.role !== 'model') {
      return;
    }
    if (isAgentConversation(conversation)) {
      recordActivity(conversation, { timestamp: now(), persist: true });
      refreshState();
    }
  }

  function handleUserMessageAdded(conversation) {
    if (isAgentConversation(conversation)) {
      recordActivity(conversation, { timestamp: now() });
    }
  }

  function dispose() {
    clearAgentFollowUpTimer();
    if (activeAgentFollowUpAbortController && !activeAgentFollowUpAbortController.signal.aborted) {
      activeAgentFollowUpAbortController.abort();
    }
    activeAgentFollowUpAbortController = null;
    activeAgentFollowUpConversationId = '';
    onScheduleChanged();
  }

  return {
    cancelActiveFollowUp,
    dispose,
    ensureSummaryBeforeSend,
    handleCompletedModelMessage,
    handleUserMessageAdded,
    isFollowUpRunning,
    recordActivity,
    refreshState,
    runFollowUpOrchestration,
    togglePauseState,
  };
}
