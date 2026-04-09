export function createConversationEditors({
  appState,
  conversationSystemPromptModal,
  conversationSystemPromptModalLabel,
  conversationSystemPromptModalHelp,
  conversationSystemPromptComputedLabel,
  conversationSystemPromptInput,
  conversationSystemPromptAppendToggle,
  conversationSystemPromptComputedPreview,
  conversationPromptFields,
  agentPromptFields,
  agentPromptNameInput,
  agentPromptPersonalityInput,
  chatTitle,
  chatTitleInput,
  saveChatTitleBtn,
  cancelChatTitleBtn,
  getActiveConversation,
  getConversationMenuState,
  isUiBusy,
  isChatTitleEditingState,
  setChatTitleEditing,
  normalizeSystemPrompt,
  normalizeConversationPromptMode,
  buildComputedConversationSystemPromptPreview,
  queueConversationStateSave,
  setStatus,
  renderConversationList,
  updateChatTitle,
  normalizeConversationName,
  createConversationSystemPromptModalInstance,
}) {
  function getConversationSystemPromptModalInstance() {
    if (!(conversationSystemPromptModal instanceof HTMLElement)) {
      return null;
    }
    if (!appState.conversationSystemPromptModalInstance) {
      appState.conversationSystemPromptModalInstance =
        typeof createConversationSystemPromptModalInstance === 'function'
          ? createConversationSystemPromptModalInstance(conversationSystemPromptModal)
          : null;
    }
    return appState.conversationSystemPromptModalInstance;
  }

  function getConversationPromptEditorMode() {
    const activeConversation = getActiveConversation();
    return activeConversation?.conversationType === 'agent' || appState.pendingConversationType === 'agent'
      ? 'agent'
      : 'chat';
  }

  function updateConversationSystemPromptModalMode(mode = getConversationPromptEditorMode()) {
    const isAgentMode = mode === 'agent';
    if (conversationSystemPromptModalLabel instanceof HTMLElement) {
      conversationSystemPromptModalLabel.textContent = isAgentMode
        ? 'Edit agent prompt'
        : 'Edit conversation system prompt';
    }
    if (conversationSystemPromptModalHelp instanceof HTMLElement) {
      conversationSystemPromptModalHelp.textContent = isAgentMode
        ? 'Update the agent identity that is folded into the system prompt for automatic and normal agent replies.'
        : 'When enabled, this conversation prompt is appended to the captured default prompt. When disabled, it replaces the captured default prompt for this conversation. Tool instructions are only included for models that support tool calling.';
    }
    if (conversationSystemPromptComputedLabel instanceof HTMLElement) {
      conversationSystemPromptComputedLabel.textContent = isAgentMode
        ? 'Computed prompt for this agent'
        : 'Computed system prompt';
    }
    if (conversationPromptFields instanceof HTMLElement) {
      conversationPromptFields.classList.toggle('d-none', isAgentMode);
    }
    if (agentPromptFields instanceof HTMLElement) {
      agentPromptFields.classList.toggle('d-none', !isAgentMode);
    }
  }

  function updateConversationSystemPromptPreview() {
    if (!(conversationSystemPromptComputedPreview instanceof HTMLTextAreaElement)) {
      return;
    }
    const mode = getConversationPromptEditorMode();
    updateConversationSystemPromptModalMode(mode);
    const normalizedPrompt = normalizeSystemPrompt(
      conversationSystemPromptInput instanceof HTMLTextAreaElement
        ? conversationSystemPromptInput.value
        : '',
    );
    const appendPrompt = normalizeConversationPromptMode(
      conversationSystemPromptAppendToggle instanceof HTMLInputElement
        ? conversationSystemPromptAppendToggle.checked
        : true,
    );
    const normalizedAgentName = normalizeConversationName(
      agentPromptNameInput instanceof HTMLInputElement ? agentPromptNameInput.value : '',
    );
    const normalizedAgentDescription = normalizeSystemPrompt(
      agentPromptPersonalityInput instanceof HTMLTextAreaElement
        ? agentPromptPersonalityInput.value
        : '',
    );
    const computedPrompt =
      typeof buildComputedConversationSystemPromptPreview === 'function'
        ? buildComputedConversationSystemPromptPreview({
            conversationPrompt: normalizedPrompt,
            appendConversationPrompt: appendPrompt,
            conversationType: mode,
            agentName: normalizedAgentName,
            agentDescription: normalizedAgentDescription,
          })
        : '';
    conversationSystemPromptComputedPreview.value =
      computedPrompt || '[No system prompt will be sent.]';
  }

  function updateChatTitleEditorVisibility() {
    if (!chatTitle || !chatTitleInput || !saveChatTitleBtn || !cancelChatTitleBtn) {
      return;
    }
    const activeConversation = getActiveConversation();
    const menuState = getConversationMenuState(activeConversation);
    const canEditTitle = menuState.canEditName;
    const controlsDisabled = isUiBusy();
    const showEditor = canEditTitle && isChatTitleEditingState(appState);
    chatTitle.classList.toggle('d-none', showEditor);
    chatTitleInput.classList.toggle('d-none', !showEditor);
    saveChatTitleBtn.classList.toggle('d-none', !showEditor);
    cancelChatTitleBtn.classList.toggle('d-none', !showEditor);
    chatTitleInput.disabled = !showEditor || controlsDisabled;
    saveChatTitleBtn.disabled = controlsDisabled || !chatTitleInput.value.trim();
    cancelChatTitleBtn.disabled = controlsDisabled;
  }

  function beginConversationSystemPromptEdit({ trigger = null } = {}) {
    if (isUiBusy()) {
      return;
    }
    const activeConversation = getActiveConversation();
    const mode = getConversationPromptEditorMode();
    if (trigger instanceof HTMLElement) {
      appState.lastConversationSystemPromptTrigger = trigger;
    }
    updateConversationSystemPromptModalMode(mode);
    if (
      conversationSystemPromptInput instanceof HTMLTextAreaElement &&
      conversationSystemPromptAppendToggle instanceof HTMLInputElement
    ) {
      conversationSystemPromptInput.value = normalizeSystemPrompt(
        activeConversation
          ? activeConversation.conversationSystemPrompt
          : appState.pendingConversationSystemPrompt,
      );
      conversationSystemPromptAppendToggle.checked = normalizeConversationPromptMode(
        activeConversation
          ? activeConversation.appendConversationSystemPrompt
          : appState.pendingAppendConversationSystemPrompt,
      );
    }
    if (mode === 'agent') {
      const agentNameValue =
        activeConversation?.conversationType === 'agent'
          ? normalizeConversationName(activeConversation?.agent?.name || activeConversation?.name || '')
          : normalizeConversationName(appState.pendingAgentName);
      const agentDescriptionValue =
        activeConversation?.conversationType === 'agent'
          ? normalizeSystemPrompt(activeConversation?.agent?.description)
          : normalizeSystemPrompt(appState.pendingAgentDescription);
      if (agentPromptNameInput instanceof HTMLInputElement) {
        agentPromptNameInput.value = agentNameValue;
      }
      if (agentPromptPersonalityInput instanceof HTMLTextAreaElement) {
        agentPromptPersonalityInput.value = agentDescriptionValue;
      }
    }
    updateConversationSystemPromptPreview();
    const modalInstance = getConversationSystemPromptModalInstance();
    if (modalInstance) {
      modalInstance.show();
    }
  }

  function saveConversationSystemPromptEdit() {
    const activeConversation = getActiveConversation();
    const mode = getConversationPromptEditorMode();
    if (mode === 'agent') {
      const normalizedAgentName = normalizeConversationName(
        agentPromptNameInput instanceof HTMLInputElement ? agentPromptNameInput.value : '',
      );
      const normalizedAgentDescription = normalizeSystemPrompt(
        agentPromptPersonalityInput instanceof HTMLTextAreaElement
          ? agentPromptPersonalityInput.value
          : '',
      );
      if (!normalizedAgentName) {
        setStatus('Agent name cannot be empty.');
        if (agentPromptNameInput instanceof HTMLInputElement) {
          agentPromptNameInput.focus();
          agentPromptNameInput.select();
        }
        return;
      }
      if (activeConversation?.conversationType === 'agent') {
        if (!activeConversation.agent || typeof activeConversation.agent !== 'object') {
          activeConversation.agent = {};
        }
        activeConversation.agent.name = normalizedAgentName;
        activeConversation.agent.description = normalizedAgentDescription;
        activeConversation.name = normalizedAgentName;
        activeConversation.hasGeneratedName = true;
        renderConversationList();
        updateChatTitle();
        queueConversationStateSave();
      } else {
        appState.pendingAgentName = normalizedAgentName;
        appState.pendingAgentDescription = normalizedAgentDescription;
      }
      setStatus('Agent prompt saved.');
      const modalInstance = getConversationSystemPromptModalInstance();
      if (modalInstance) {
        modalInstance.hide();
      }
      return;
    }
    if (
      !(conversationSystemPromptInput instanceof HTMLTextAreaElement) ||
      !(conversationSystemPromptAppendToggle instanceof HTMLInputElement)
    ) {
      return;
    }
    const normalizedPrompt = normalizeSystemPrompt(conversationSystemPromptInput.value);
    const appendPrompt = Boolean(conversationSystemPromptAppendToggle.checked);
    if (activeConversation) {
      activeConversation.conversationSystemPrompt = normalizedPrompt;
      activeConversation.appendConversationSystemPrompt = appendPrompt;
      queueConversationStateSave();
    } else {
      appState.pendingConversationSystemPrompt = normalizedPrompt;
      appState.pendingAppendConversationSystemPrompt = appendPrompt;
    }
    setStatus('Conversation system prompt saved.');
    const modalInstance = getConversationSystemPromptModalInstance();
    if (modalInstance) {
      modalInstance.hide();
    }
  }

  function focusConversationSystemPromptEditor() {
    const mode = getConversationPromptEditorMode();
    if (mode === 'agent' && agentPromptNameInput instanceof HTMLInputElement) {
      agentPromptNameInput.focus();
      agentPromptNameInput.setSelectionRange(
        agentPromptNameInput.value.length,
        agentPromptNameInput.value.length,
      );
      return;
    }
    if (conversationSystemPromptInput instanceof HTMLTextAreaElement) {
      conversationSystemPromptInput.focus();
      conversationSystemPromptInput.setSelectionRange(
        conversationSystemPromptInput.value.length,
        conversationSystemPromptInput.value.length,
      );
    }
  }

  function beginChatTitleEdit({ trigger = null } = {}) {
    if (isUiBusy()) {
      return;
    }
    const activeConversation = getActiveConversation();
    if (!activeConversation?.hasGeneratedName || !chatTitleInput) {
      return;
    }
    if (trigger instanceof HTMLElement) {
      appState.lastConversationTitleTrigger = trigger;
    }
    setChatTitleEditing(appState, true);
    chatTitleInput.value = activeConversation.name;
    updateChatTitleEditorVisibility();
    chatTitleInput.focus();
    chatTitleInput.select();
  }

  function cancelChatTitleEdit({ restoreFocus = true } = {}) {
    if (!isChatTitleEditingState(appState)) {
      return;
    }
    setChatTitleEditing(appState, false);
    updateChatTitle();
    if (restoreFocus && appState.lastConversationTitleTrigger instanceof HTMLElement) {
      appState.lastConversationTitleTrigger.focus();
    }
    appState.lastConversationTitleTrigger = null;
  }

  function saveChatTitleEdit() {
    if (!isChatTitleEditingState(appState) || !chatTitleInput) {
      return;
    }
    const activeConversation = getActiveConversation();
    if (!activeConversation) {
      cancelChatTitleEdit({ restoreFocus: false });
      return;
    }
    const nextName = normalizeConversationName(chatTitleInput.value);
    if (!nextName) {
      setStatus('Conversation title cannot be empty.');
      chatTitleInput.focus();
      chatTitleInput.select();
      return;
    }
    activeConversation.name = nextName;
    activeConversation.hasGeneratedName = true;
    setChatTitleEditing(appState, false);
    renderConversationList();
    updateChatTitle();
    queueConversationStateSave();
    setStatus('Conversation title saved.');
    if (appState.lastConversationTitleTrigger instanceof HTMLElement) {
      appState.lastConversationTitleTrigger.focus();
    }
    appState.lastConversationTitleTrigger = null;
  }

  return {
    updateChatTitleEditorVisibility,
    updateConversationSystemPromptPreview,
    beginConversationSystemPromptEdit,
    saveConversationSystemPromptEdit,
    focusConversationSystemPromptEditor,
    beginChatTitleEdit,
    cancelChatTitleEdit,
    saveChatTitleEdit,
  };
}
