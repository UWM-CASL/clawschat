import { isEngineReady, isSettingsView } from '../state/app-state.js';

export function bindSettingsEvents({
  appState,
  documentRef = document,
  themeStorageKey,
  storage = globalThis.localStorage,
  settingsTabContainer,
  settingsTabButtons = [],
  openSettingsButton,
  closeSettingsButton,
  themeSelect,
  showThinkingToggle,
  enableToolCallingToggle,
  toolSettingsList,
  mcpServerEndpointForm,
  mcpServerEndpointInput,
  addMcpServerButton,
  mcpServersList,
  renderMathMlToggle,
  enableSingleKeyShortcutsToggle,
  transcriptViewSelect,
  defaultSystemPromptInput,
  conversationLanguageSelect,
  enableModelThinkingToggle,
  modelSelect,
  backendSelect,
  maxOutputTokensInput,
  maxContextTokensInput,
  temperatureInput,
  resetContextTokensButton,
  resetTemperatureButton,
  topKInput,
  topPInput,
  resetTopKButton,
  resetTopPButton,
  colorSchemeQuery,
  setActiveSettingsTab,
  setSettingsPageVisibility,
  getStoredThemePreference,
  applyTheme,
  applyShowThinkingPreference,
  applyToolCallingPreference,
  applyToolEnabledPreference,
  applyMcpServerEnabledPreference,
  applyMcpServerCommandEnabledPreference,
  applyMathRenderingPreference,
  applySingleKeyShortcutPreference,
  applyTranscriptViewPreference,
  applyDefaultSystemPrompt,
  applyConversationLanguagePreference,
  applyConversationThinkingPreference,
  clearMcpServerFeedback,
  importMcpServerEndpoint,
  refreshMathRendering,
  refreshConversationSystemPromptPreview,
  refreshMcpServerPreference,
  removeMcpServerPreference,
  setMcpServerFeedback,
  syncModelSelectionForCurrentEnvironment,
  syncConversationLanguageAndThinkingControls,
  syncGenerationSettingsFromModel,
  getActiveConversation,
  assignConversationModelId,
  queueConversationStateSave,
  reinitializeEngineFromSettings,
  onGenerationSettingInputChanged,
  getModelGenerationLimits,
  normalizeModelId,
  defaultModelId,
  setStatus,
  isAnyModalOpen,
}) {
  if (settingsTabContainer) {
    settingsTabContainer.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) {
        return;
      }
      const tab = target.dataset.settingsTab;
      if (tab && tab === appState.activeSettingsTab) {
        return;
      }
      setActiveSettingsTab(tab, { focus: true });
    });

    settingsTabContainer.addEventListener('keydown', (event) => {
      if (!(event.target instanceof HTMLButtonElement)) {
        return;
      }
      if (
        event.key !== 'ArrowDown' &&
        event.key !== 'ArrowUp' &&
        event.key !== 'Home' &&
        event.key !== 'End'
      ) {
        if (event.key === 'Enter' || event.key === ' ') {
          setActiveSettingsTab(event.target.dataset.settingsTab, { focus: false });
        }
        return;
      }
      const buttons = Array.from(settingsTabButtons).filter(
        (button) => button instanceof HTMLButtonElement
      );
      const currentIndex = buttons.indexOf(event.target);
      if (currentIndex < 0) {
        return;
      }
      event.preventDefault();
      let nextIndex = currentIndex;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        nextIndex = (currentIndex + direction + buttons.length) % buttons.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = buttons.length - 1;
      }
      const nextTab = buttons[nextIndex];
      const nextTabName = nextTab?.dataset?.settingsTab;
      if (typeof nextTabName === 'string') {
        setActiveSettingsTab(nextTabName, { focus: false });
        nextTab.focus();
      }
    });
  }

  if (openSettingsButton) {
    openSettingsButton.addEventListener('click', () => {
      setSettingsPageVisibility(true, { replaceRoute: false });
      if (settingsTabButtons[0] instanceof HTMLButtonElement) {
        settingsTabButtons[0].focus();
      }
    });
  }

  if (closeSettingsButton) {
    closeSettingsButton.addEventListener('click', () => {
      setSettingsPageVisibility(false, { replaceRoute: false });
      if (openSettingsButton instanceof HTMLButtonElement) {
        openSettingsButton.focus();
      }
    });
  }

  if (themeSelect) {
    themeSelect.addEventListener('change', (event) => {
      const value = event.target.value;
      if (value !== 'light' && value !== 'dark' && value !== 'system') {
        return;
      }
      storage.setItem(themeStorageKey, value);
      applyTheme(value);
    });
  }

  if (showThinkingToggle) {
    showThinkingToggle.addEventListener('change', (event) => {
      const value = event.target instanceof HTMLInputElement ? event.target.checked : false;
      applyShowThinkingPreference(value, { persist: true, refresh: true });
    });
  }

  if (enableToolCallingToggle instanceof HTMLInputElement) {
    enableToolCallingToggle.addEventListener('change', (event) => {
      const value = event.target instanceof HTMLInputElement ? event.target.checked : true;
      applyToolCallingPreference(value, { persist: true });
      if (typeof refreshConversationSystemPromptPreview === 'function') {
        refreshConversationSystemPromptPreview();
      }
      setStatus(value ? 'Tool calling enabled.' : 'Tool calling disabled.');
    });
  }

  if (toolSettingsList instanceof HTMLElement) {
    toolSettingsList.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.dataset.toolToggle !== 'true') {
        return;
      }
      const toolName = typeof target.dataset.toolName === 'string' ? target.dataset.toolName : '';
      const toolLabel =
        typeof target.dataset.toolDisplayName === 'string' && target.dataset.toolDisplayName.trim()
          ? target.dataset.toolDisplayName.trim()
          : toolName;
      applyToolEnabledPreference(toolName, target.checked, { persist: true });
      if (typeof refreshConversationSystemPromptPreview === 'function') {
        refreshConversationSystemPromptPreview();
      }
      setStatus(
        target.checked
          ? `${toolLabel} enabled for tool calling.`
          : `${toolLabel} disabled for tool calling.`
      );
    });
  }

  async function handleMcpServerImport() {
    const endpoint =
      mcpServerEndpointInput instanceof HTMLInputElement ? mcpServerEndpointInput.value : '';
    if (addMcpServerButton instanceof HTMLButtonElement) {
      addMcpServerButton.disabled = true;
    }
    if (typeof setMcpServerFeedback === 'function') {
      setMcpServerFeedback('Connecting to MCP server...', 'info');
    }
    try {
      const importedServer = await importMcpServerEndpoint(endpoint, { persist: true });
      if (typeof refreshConversationSystemPromptPreview === 'function') {
        refreshConversationSystemPromptPreview();
      }
      setStatus(
        `${importedServer.displayName} added. Enable the server and any commands you want exposed.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (typeof setMcpServerFeedback === 'function') {
        setMcpServerFeedback(message, 'danger');
      }
      setStatus(message);
    } finally {
      if (addMcpServerButton instanceof HTMLButtonElement) {
        addMcpServerButton.disabled = false;
      }
    }
  }

  if (mcpServerEndpointForm instanceof HTMLElement && mcpServerEndpointForm.tagName === 'FORM') {
    mcpServerEndpointForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void handleMcpServerImport();
    });
  }

  if (mcpServerEndpointInput instanceof HTMLInputElement) {
    mcpServerEndpointInput.addEventListener('input', () => {
      if (typeof clearMcpServerFeedback === 'function') {
        clearMcpServerFeedback();
      }
    });
  }

  if (mcpServersList instanceof HTMLElement) {
    mcpServersList.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      if (target.dataset.mcpServerToggle === 'true') {
        const serverId =
          typeof target.dataset.mcpServerId === 'string' ? target.dataset.mcpServerId : '';
        const serverLabel =
          typeof target.dataset.mcpServerDisplayName === 'string' &&
          target.dataset.mcpServerDisplayName.trim()
            ? target.dataset.mcpServerDisplayName.trim()
            : serverId;
        applyMcpServerEnabledPreference(serverId, target.checked, { persist: true });
        if (typeof refreshConversationSystemPromptPreview === 'function') {
          refreshConversationSystemPromptPreview();
        }
        setStatus(target.checked ? `${serverLabel} enabled.` : `${serverLabel} disabled.`);
        return;
      }
      if (target.dataset.mcpCommandToggle === 'true') {
        const serverId =
          typeof target.dataset.mcpServerId === 'string' ? target.dataset.mcpServerId : '';
        const commandName =
          typeof target.dataset.mcpCommandName === 'string' ? target.dataset.mcpCommandName : '';
        const commandLabel =
          typeof target.dataset.mcpCommandDisplayName === 'string' &&
          target.dataset.mcpCommandDisplayName.trim()
            ? target.dataset.mcpCommandDisplayName.trim()
            : commandName;
        applyMcpServerCommandEnabledPreference(serverId, commandName, target.checked, {
          persist: true,
        });
        if (typeof refreshConversationSystemPromptPreview === 'function') {
          refreshConversationSystemPromptPreview();
        }
        setStatus(
          target.checked
            ? `${commandLabel} enabled for MCP server use.`
            : `${commandLabel} disabled for MCP server use.`
        );
      }
    });

    mcpServersList.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const refreshButton = target.closest('button[data-mcp-server-refresh="true"]');
      if (refreshButton instanceof HTMLButtonElement) {
        const serverId =
          typeof refreshButton.dataset.mcpServerId === 'string'
            ? refreshButton.dataset.mcpServerId
            : '';
        refreshButton.disabled = true;
        if (typeof setMcpServerFeedback === 'function') {
          setMcpServerFeedback('Refreshing MCP server metadata...', 'info');
        }
        void refreshMcpServerPreference(serverId, { persist: true })
          .then(
            (server) => {
              if (typeof refreshConversationSystemPromptPreview === 'function') {
                refreshConversationSystemPromptPreview();
              }
              setStatus(`${server.displayName} metadata refreshed.`);
            },
            (error) => {
              const message = error instanceof Error ? error.message : String(error);
              if (typeof setMcpServerFeedback === 'function') {
                setMcpServerFeedback(message, 'danger');
              }
              setStatus(message);
            }
          )
          .finally(() => {
            refreshButton.disabled = false;
          });
        return;
      }

      const removeButton = target.closest('button[data-mcp-server-remove="true"]');
      if (removeButton instanceof HTMLButtonElement) {
        const serverId =
          typeof removeButton.dataset.mcpServerId === 'string'
            ? removeButton.dataset.mcpServerId
            : '';
        removeMcpServerPreference(serverId, { persist: true });
        if (typeof refreshConversationSystemPromptPreview === 'function') {
          refreshConversationSystemPromptPreview();
        }
        if (typeof clearMcpServerFeedback === 'function') {
          clearMcpServerFeedback();
        }
        setStatus('MCP server removed.');
      }
    });
  }

  if (renderMathMlToggle instanceof HTMLInputElement) {
    renderMathMlToggle.addEventListener('change', (event) => {
      const value = event.target instanceof HTMLInputElement ? event.target.checked : true;
      applyMathRenderingPreference(value, { persist: true });
      if (typeof refreshConversationSystemPromptPreview === 'function') {
        refreshConversationSystemPromptPreview();
      }
      if (typeof refreshMathRendering === 'function') {
        refreshMathRendering();
      }
      setStatus(value ? 'Math rendering enabled.' : 'Math rendering disabled.');
    });
  }

  if (enableSingleKeyShortcutsToggle instanceof HTMLInputElement) {
    enableSingleKeyShortcutsToggle.addEventListener('change', (event) => {
      const value = event.target instanceof HTMLInputElement ? event.target.checked : true;
      applySingleKeyShortcutPreference(value, { persist: true });
      setStatus(
        value
          ? 'Single-key transcript shortcuts enabled.'
          : 'Single-key transcript shortcuts disabled.'
      );
    });
  }

  if (transcriptViewSelect instanceof HTMLSelectElement) {
    transcriptViewSelect.addEventListener('change', (event) => {
      const value = event.target instanceof HTMLSelectElement ? event.target.value : 'standard';
      applyTranscriptViewPreference(value, { persist: true });
      setStatus(
        value === 'compact'
          ? 'Compact transcript view enabled.'
          : 'Standard transcript view enabled.'
      );
    });
  }

  if (defaultSystemPromptInput instanceof HTMLTextAreaElement) {
    defaultSystemPromptInput.addEventListener('change', (event) => {
      const value = event.target instanceof HTMLTextAreaElement ? event.target.value : '';
      applyDefaultSystemPrompt(value, { persist: true });
      if (typeof refreshConversationSystemPromptPreview === 'function') {
        refreshConversationSystemPromptPreview();
      }
    });
  }

  if (conversationLanguageSelect instanceof HTMLSelectElement) {
    conversationLanguageSelect.addEventListener('change', (event) => {
      const value = event.target instanceof HTMLSelectElement ? event.target.value : 'auto';
      applyConversationLanguagePreference(value, { persist: true });
      if (typeof refreshConversationSystemPromptPreview === 'function') {
        refreshConversationSystemPromptPreview();
      }
      setStatus('Response language updated.');
    });
  }

  if (enableModelThinkingToggle instanceof HTMLInputElement) {
    enableModelThinkingToggle.addEventListener('change', (event) => {
      const value = event.target instanceof HTMLInputElement ? event.target.checked : true;
      applyConversationThinkingPreference(value, { persist: true });
      if (typeof refreshConversationSystemPromptPreview === 'function') {
        refreshConversationSystemPromptPreview();
      }
      setStatus(
        value ? 'Model thinking enabled when supported.' : 'Model thinking disabled when supported.'
      );
    });
  }

  colorSchemeQuery.addEventListener('change', () => {
    if (getStoredThemePreference() === 'system') {
      applyTheme('system');
    }
  });

  function handleModelPreferenceChange({ announceFallback = false } = {}) {
    const selectedModel = syncModelSelectionForCurrentEnvironment({ announceFallback });
    syncGenerationSettingsFromModel(selectedModel, true);
    const activeConversation = getActiveConversation();
    if (activeConversation) {
      const { changed } = assignConversationModelId(activeConversation, selectedModel);
      if (changed) {
        queueConversationStateSave();
      }
    }
    if (typeof syncConversationLanguageAndThinkingControls === 'function') {
      syncConversationLanguageAndThinkingControls(activeConversation);
    }
    if (typeof refreshConversationSystemPromptPreview === 'function') {
      refreshConversationSystemPromptPreview();
    }
    void reinitializeEngineFromSettings();
  }

  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      handleModelPreferenceChange();
    });
  }

  if (backendSelect) {
    backendSelect.addEventListener('change', () => {
      handleModelPreferenceChange({ announceFallback: true });
    });
  }

  if (maxOutputTokensInput) {
    maxOutputTokensInput.addEventListener('change', onGenerationSettingInputChanged);
  }

  if (maxContextTokensInput) {
    maxContextTokensInput.addEventListener('change', onGenerationSettingInputChanged);
  }

  if (temperatureInput) {
    temperatureInput.addEventListener('change', onGenerationSettingInputChanged);
  }

  if (resetContextTokensButton instanceof HTMLButtonElement) {
    resetContextTokensButton.addEventListener('click', () => {
      if (!isEngineReady(appState) || !maxContextTokensInput) {
        return;
      }
      const selectedModel = normalizeModelId(modelSelect?.value || defaultModelId);
      const limits = getModelGenerationLimits(selectedModel);
      maxContextTokensInput.value = String(limits.defaultMaxContextTokens);
      onGenerationSettingInputChanged();
    });
  }

  if (resetTemperatureButton instanceof HTMLButtonElement) {
    resetTemperatureButton.addEventListener('click', () => {
      if (!isEngineReady(appState) || !temperatureInput) {
        return;
      }
      const selectedModel = normalizeModelId(modelSelect?.value || defaultModelId);
      const limits = getModelGenerationLimits(selectedModel);
      temperatureInput.value = limits.defaultTemperature.toFixed(1);
      onGenerationSettingInputChanged();
    });
  }

  if (topKInput) {
    topKInput.addEventListener('change', onGenerationSettingInputChanged);
  }

  if (topPInput) {
    topPInput.addEventListener('change', onGenerationSettingInputChanged);
  }

  if (resetTopKButton instanceof HTMLButtonElement) {
    resetTopKButton.addEventListener('click', () => {
      if (!isEngineReady(appState) || !topKInput) {
        return;
      }
      const selectedModel = normalizeModelId(modelSelect?.value || defaultModelId);
      const limits = getModelGenerationLimits(selectedModel);
      topKInput.value = String(limits.defaultTopK);
      onGenerationSettingInputChanged();
    });
  }

  if (resetTopPButton instanceof HTMLButtonElement) {
    resetTopPButton.addEventListener('click', () => {
      if (!isEngineReady(appState) || !topPInput) {
        return;
      }
      const selectedModel = normalizeModelId(modelSelect?.value || defaultModelId);
      const limits = getModelGenerationLimits(selectedModel);
      topPInput.value = limits.defaultTopP.toFixed(2);
      onGenerationSettingInputChanged();
    });
  }

  documentRef.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isSettingsView(appState) || isAnyModalOpen()) {
      return;
    }
    event.preventDefault();
    setSettingsPageVisibility(false, { replaceRoute: false });
    if (openSettingsButton instanceof HTMLButtonElement) {
      openSettingsButton.focus();
    }
  });
}
