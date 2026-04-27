import {
  hasConversationHistory as selectHasConversationHistory,
  hasSelectedConversationWithHistory as selectHasSelectedConversationWithHistory,
  hasStartedWorkspace,
  isEngineReady,
  isLoadingModelState,
  isSettingsView,
  shouldDisableComposerForPreChatConversationSelection as selectShouldDisableComposerForPreChatConversationSelection,
  shouldShowNewConversationButton as selectShouldShowNewConversationButton,
} from '../state/app-state.js';
import {
  CONVERSATION_TYPES,
  isAgentConversation,
  normalizeConversationName,
  normalizeConversationType,
  normalizeSystemPrompt,
} from '../state/conversation-model.js';
import { applyStatusRegion } from './status-region.js';

export const PRE_CHAT_STATUS_HINT_DEFAULT = 'Send your first message to load the selected model.';
export const PRE_CHAT_STATUS_HINT_EXISTING_CONVERSATION =
  'To see your conversation, load a model first.';
export const PRE_CHAT_STATUS_HINT_MODEL_READY =
  'The current model is ready. Send your first message to continue with it, or choose a different model first.';

function isElementOfType(value, typeName) {
  const view = value?.ownerDocument?.defaultView || globalThis;
  const TypeCtor = view?.[typeName];
  return typeof TypeCtor === 'function' && value instanceof TypeCtor;
}

/**
 * @param {{
 *   appState: any;
 *   onboardingStatusRegion?: any;
 *   onboardingStatusRegionHeading?: any;
 *   onboardingStatusRegionMessage?: any;
 *   preChatActions?: any;
 *   preChatLoadModelBtn?: any;
 *   preChatEditConversationSystemPromptBtn?: any;
 *   messageInput?: any;
 *   preChatHeading?: any;
 *   preChatLead?: any;
 *   preChatAgentFields?: any;
 *   agentNameInput?: any;
 *   agentPersonalityInput?: any;
 *   chatForm?: any;
 *   taskListTray?: any;
 *   getActiveConversation?: () => any;
 *   getAgentDisplayName?: (conversation?: any) => string;
 *   setRegionVisibility?: (region: any, visible: boolean) => void;
 *   isUiBusy?: () => boolean;
 * }} options
 */
export function createPreChatWorkspaceController({
  appState,
  onboardingStatusRegion = null,
  onboardingStatusRegionHeading = null,
  onboardingStatusRegionMessage = null,
  preChatActions = null,
  preChatLoadModelBtn = null,
  preChatEditConversationSystemPromptBtn = null,
  messageInput = null,
  preChatHeading = null,
  preChatLead = null,
  preChatAgentFields = null,
  agentNameInput = null,
  agentPersonalityInput = null,
  chatForm = null,
  taskListTray = null,
  getActiveConversation = () => null,
  getAgentDisplayName = () => 'Agent',
  setRegionVisibility = (_region, _visible) => {},
  isUiBusy = () => false,
}) {
  function hasConversationHistory(conversation) {
    return selectHasConversationHistory(conversation);
  }

  function hasSelectedConversationWithHistory() {
    return selectHasSelectedConversationWithHistory(appState);
  }

  function shouldDisableComposerForPreChatConversationSelection() {
    return selectShouldDisableComposerForPreChatConversationSelection(appState);
  }

  function shouldShowNewConversationButton() {
    return selectShouldShowNewConversationButton(appState);
  }

  function getPendingConversationType() {
    return normalizeConversationType(appState.pendingConversationType);
  }

  function isPendingAgentConversation() {
    return getPendingConversationType() === CONVERSATION_TYPES.AGENT;
  }

  function updatePreChatStatusHint() {
    if (!isElementOfType(onboardingStatusRegion, 'HTMLElement')) {
      return;
    }
    if (hasStartedWorkspace(appState) && !isLoadingModelState(appState)) {
      applyStatusRegion(
        onboardingStatusRegion,
        onboardingStatusRegionHeading,
        onboardingStatusRegionMessage,
        appState.isPreparingNewConversation && isEngineReady(appState)
          ? PRE_CHAT_STATUS_HINT_MODEL_READY
          : hasSelectedConversationWithHistory()
            ? PRE_CHAT_STATUS_HINT_EXISTING_CONVERSATION
            : PRE_CHAT_STATUS_HINT_DEFAULT,
        'Setup status'
      );
    }
  }

  function updatePreChatActionButtons() {
    const activeConversation = getActiveConversation();
    const hasExistingConversation = hasConversationHistory(activeConversation);
    const isPreChatAvailable = hasStartedWorkspace(appState) && !isSettingsView(appState);
    const canShowPreChatActions =
      isPreChatAvailable && !isEngineReady(appState) && Boolean(activeConversation);
    const isBusy = isUiBusy();
    const isAgentDraft = !activeConversation && isPendingAgentConversation();
    const isAgentPreChatConversation = isAgentDraft || isAgentConversation(activeConversation);

    if (isElementOfType(preChatActions, 'HTMLElement')) {
      preChatActions.classList.toggle('d-none', !canShowPreChatActions);
    }
    if (isElementOfType(preChatLoadModelBtn, 'HTMLButtonElement')) {
      preChatLoadModelBtn.classList.toggle('d-none', !hasExistingConversation);
      preChatLoadModelBtn.disabled = !canShowPreChatActions || !hasExistingConversation || isBusy;
    }
    if (isElementOfType(preChatEditConversationSystemPromptBtn, 'HTMLButtonElement')) {
      preChatEditConversationSystemPromptBtn.classList.toggle('d-none', isAgentPreChatConversation);
      preChatEditConversationSystemPromptBtn.disabled =
        !isPreChatAvailable || isBusy || isAgentPreChatConversation;
    }
  }

  function updateMessageInputPlaceholder() {
    if (!isElementOfType(messageInput, 'HTMLTextAreaElement')) {
      return;
    }
    const activeConversation = getActiveConversation();
    if (!activeConversation && isPendingAgentConversation()) {
      messageInput.placeholder = `Say hello to ${getAgentDisplayName(null)}...`;
      return;
    }
    if (isAgentConversation(activeConversation) && !hasConversationHistory(activeConversation)) {
      messageInput.placeholder = `Say hello to ${getAgentDisplayName(activeConversation)}...`;
      return;
    }
    messageInput.placeholder = 'Type your message...';
  }

  function updatePreChatModeUi() {
    const activeConversation = getActiveConversation();
    const isAgentDraft = !activeConversation && isPendingAgentConversation();
    const isAgentPreChatConversation = isAgentDraft || isAgentConversation(activeConversation);
    const agentNameValue = isAgentConversation(activeConversation)
      ? normalizeConversationName(activeConversation?.agent?.name || activeConversation?.name || '')
      : appState.pendingAgentName;
    const agentDescriptionValue = isAgentConversation(activeConversation)
      ? normalizeSystemPrompt(activeConversation?.agent?.description)
      : appState.pendingAgentDescription;
    if (isElementOfType(preChatHeading, 'HTMLElement')) {
      preChatHeading.textContent = isAgentPreChatConversation
        ? 'Create a New Agent'
        : 'Start a New Chat';
    }
    if (isElementOfType(preChatLead, 'HTMLElement')) {
      preChatLead.textContent = isAgentPreChatConversation
        ? 'Name your agent, describe its personality, choose a model, then say hello below to begin.'
        : 'Choose a model, then send your first message below to begin.';
    }
    if (isElementOfType(preChatAgentFields, 'HTMLElement')) {
      preChatAgentFields.classList.toggle('d-none', !isAgentPreChatConversation);
    }
    if (
      isElementOfType(agentNameInput, 'HTMLInputElement') &&
      agentNameInput.value !== agentNameValue
    ) {
      agentNameInput.value = agentNameValue;
    }
    if (
      isElementOfType(agentPersonalityInput, 'HTMLTextAreaElement') &&
      agentPersonalityInput.value !== agentDescriptionValue
    ) {
      agentPersonalityInput.value = agentDescriptionValue;
    }
    updateMessageInputPlaceholder();
  }

  function updateComposerVisibility() {
    const showComposer = hasStartedWorkspace(appState) && !isSettingsView(appState);
    setRegionVisibility(chatForm, showComposer);
    if (isElementOfType(taskListTray, 'HTMLElement')) {
      const showTaskTray =
        showComposer &&
        appState.workspaceView === 'chat' &&
        taskListTray.dataset.hasItems === 'true';
      setRegionVisibility(taskListTray, showTaskTray);
    }
    if (isElementOfType(chatForm, 'HTMLElement')) {
      chatForm.classList.remove('is-prechat');
    }
    if (isElementOfType(messageInput, 'HTMLTextAreaElement')) {
      messageInput.disabled = shouldDisableComposerForPreChatConversationSelection();
    }
    updatePreChatModeUi();
  }

  return {
    getPendingConversationType,
    hasConversationHistory,
    hasSelectedConversationWithHistory,
    isPendingAgentConversation,
    shouldDisableComposerForPreChatConversationSelection,
    shouldShowNewConversationButton,
    updateComposerVisibility,
    updateMessageInputPlaceholder,
    updatePreChatActionButtons,
    updatePreChatModeUi,
    updatePreChatStatusHint,
  };
}
