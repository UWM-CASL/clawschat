import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createPreChatWorkspaceController } from '../../src/app/pre-chat-workspace.js';
import { createAppState, WORKSPACE_VIEWS } from '../../src/state/app-state.js';
import {
  addMessageToConversation,
  CONVERSATION_TYPES,
  createConversation,
} from '../../src/state/conversation-model.js';

/**
 * @param {{
 *   id?: string;
 *   name?: string;
 *   conversationType?: string;
 *   hasHistory?: boolean;
 * }} [options]
 */
function createConversationFixture({
  id = 'conversation-1',
  name = 'Physics',
  conversationType = CONVERSATION_TYPES.CHAT,
  hasHistory = true,
} = {}) {
  const conversation = createConversation({
    id,
    name,
    conversationType,
    agent:
      conversationType === CONVERSATION_TYPES.AGENT
        ? {
            name,
            description: 'Patient tutor.',
          }
        : null,
  });
  if (hasHistory) {
    addMessageToConversation(conversation, 'user', 'Hello.');
  }
  return conversation;
}

function createHarness({ activeConversation = null, isUiBusy = false } = {}) {
  const dom = new JSDOM(
    `
      <section id="onboardingStatusRegion">
        <h2 id="onboardingStatusRegionHeading"></h2>
        <p id="onboardingStatusRegionMessage"></p>
      </section>
      <div id="preChatActions" class="d-none"></div>
      <button id="preChatLoadModelBtn" type="button"></button>
      <button id="preChatEditConversationSystemPromptBtn" type="button"></button>
      <textarea id="messageInput"></textarea>
      <h1 id="preChatHeading"></h1>
      <p id="preChatLead"></p>
      <div id="preChatAgentFields" class="d-none"></div>
      <input id="agentNameInput" />
      <textarea id="agentPersonalityInput"></textarea>
      <form id="chatForm" class="is-prechat"></form>
      <div id="taskListTray" data-has-items="true"></div>
    `,
    { url: 'https://example.test/' }
  );
  const document = dom.window.document;
  const appState = createAppState();
  appState.hasStartedChatWorkspace = true;
  appState.workspaceView = WORKSPACE_VIEWS.PRECHAT;
  appState.currentWorkspaceView = WORKSPACE_VIEWS.PRECHAT;
  if (activeConversation) {
    appState.conversations = [activeConversation];
    appState.activeConversationId = activeConversation.id;
  }
  const regionVisibilityChanges = [];
  const setRegionVisibility = vi.fn((region, visible) => {
    regionVisibilityChanges.push({ id: region?.id || '', visible });
    region?.classList.toggle('d-none', !visible);
    if (visible) {
      region?.removeAttribute('aria-hidden');
      region.inert = false;
    } else {
      region?.setAttribute('aria-hidden', 'true');
      region.inert = true;
    }
  });
  const controller = createPreChatWorkspaceController({
    appState,
    onboardingStatusRegion: document.getElementById('onboardingStatusRegion'),
    onboardingStatusRegionHeading: document.getElementById('onboardingStatusRegionHeading'),
    onboardingStatusRegionMessage: document.getElementById('onboardingStatusRegionMessage'),
    preChatActions: document.getElementById('preChatActions'),
    preChatLoadModelBtn: document.getElementById('preChatLoadModelBtn'),
    preChatEditConversationSystemPromptBtn: document.getElementById(
      'preChatEditConversationSystemPromptBtn'
    ),
    messageInput: document.getElementById('messageInput'),
    preChatHeading: document.getElementById('preChatHeading'),
    preChatLead: document.getElementById('preChatLead'),
    preChatAgentFields: document.getElementById('preChatAgentFields'),
    agentNameInput: document.getElementById('agentNameInput'),
    agentPersonalityInput: document.getElementById('agentPersonalityInput'),
    chatForm: document.getElementById('chatForm'),
    taskListTray: document.getElementById('taskListTray'),
    getActiveConversation: () =>
      appState.conversations.find(
        (conversation) => conversation.id === appState.activeConversationId
      ) || null,
    getAgentDisplayName: (conversation = null) =>
      conversation?.agent?.name || appState.pendingAgentName || 'Agent',
    setRegionVisibility,
    isUiBusy: () => isUiBusy,
  });

  return {
    appState,
    controller,
    document,
    regionVisibilityChanges,
    setRegionVisibility,
  };
}

function getElement(document, id) {
  return /** @type {HTMLElement} */ (document.getElementById(id));
}

function getButton(document, id) {
  return /** @type {HTMLButtonElement} */ (document.getElementById(id));
}

function getInput(document, id) {
  return /** @type {HTMLInputElement} */ (document.getElementById(id));
}

function getTextArea(document, id) {
  return /** @type {HTMLTextAreaElement} */ (document.getElementById(id));
}

describe('pre-chat-workspace controller', () => {
  test('updates setup status hints for default, existing, and model-ready pre-chat states', () => {
    const harness = createHarness();

    harness.controller.updatePreChatStatusHint();
    expect(getElement(harness.document, 'onboardingStatusRegionMessage').textContent).toBe(
      'Send your first message to load the selected model.'
    );

    const conversation = createConversationFixture();
    harness.appState.conversations = [conversation];
    harness.appState.activeConversationId = conversation.id;
    harness.controller.updatePreChatStatusHint();
    expect(getElement(harness.document, 'onboardingStatusRegionMessage').textContent).toBe(
      'To see your conversation, load a model first.'
    );

    harness.appState.isPreparingNewConversation = true;
    harness.appState.modelReady = true;
    harness.controller.updatePreChatStatusHint();
    expect(getElement(harness.document, 'onboardingStatusRegionMessage').textContent).toBe(
      'The current model is ready. Send your first message to continue with it, or choose a different model first.'
    );
  });

  test('updates pre-chat action buttons for existing chats and agent conversations', () => {
    const conversation = createConversationFixture();
    const harness = createHarness({ activeConversation: conversation });

    harness.controller.updatePreChatActionButtons();

    expect(getElement(harness.document, 'preChatActions').classList.contains('d-none')).toBe(false);
    expect(getButton(harness.document, 'preChatLoadModelBtn').classList.contains('d-none')).toBe(
      false
    );
    expect(getButton(harness.document, 'preChatLoadModelBtn').disabled).toBe(false);
    expect(
      getButton(harness.document, 'preChatEditConversationSystemPromptBtn').classList.contains(
        'd-none'
      )
    ).toBe(false);

    const agentConversation = createConversationFixture({
      id: 'agent-1',
      name: 'Ada',
      conversationType: CONVERSATION_TYPES.AGENT,
    });
    harness.appState.conversations = [agentConversation];
    harness.appState.activeConversationId = agentConversation.id;
    harness.controller.updatePreChatActionButtons();

    expect(
      getButton(harness.document, 'preChatEditConversationSystemPromptBtn').classList.contains(
        'd-none'
      )
    ).toBe(true);
    expect(getButton(harness.document, 'preChatEditConversationSystemPromptBtn').disabled).toBe(
      true
    );
  });

  test('renders pending agent pre-chat fields and greeting placeholder', () => {
    const harness = createHarness();
    harness.appState.pendingConversationType = /** @type {any} */ (CONVERSATION_TYPES.AGENT);
    harness.appState.pendingAgentName = 'Ada';
    harness.appState.pendingAgentDescription = 'Patient tutor.';

    harness.controller.updatePreChatModeUi();

    expect(getElement(harness.document, 'preChatHeading').textContent).toBe('Create a New Agent');
    expect(getElement(harness.document, 'preChatLead').textContent).toContain('Name your agent');
    expect(getElement(harness.document, 'preChatAgentFields').classList.contains('d-none')).toBe(
      false
    );
    expect(getInput(harness.document, 'agentNameInput').value).toBe('Ada');
    expect(getTextArea(harness.document, 'agentPersonalityInput').value).toBe('Patient tutor.');
    expect(getTextArea(harness.document, 'messageInput').placeholder).toBe('Say hello to Ada...');
  });

  test('renders standard chat pre-chat mode and default placeholder', () => {
    const harness = createHarness();

    harness.controller.updatePreChatModeUi();

    expect(getElement(harness.document, 'preChatHeading').textContent).toBe('Start a New Chat');
    expect(getElement(harness.document, 'preChatLead').textContent).toContain('Choose a model');
    expect(getElement(harness.document, 'preChatAgentFields').classList.contains('d-none')).toBe(
      true
    );
    expect(getTextArea(harness.document, 'messageInput').placeholder).toBe('Type your message...');
  });

  test('updates composer and task tray visibility for workspace state', () => {
    const harness = createHarness();
    harness.appState.workspaceView = WORKSPACE_VIEWS.PRECHAT;
    harness.appState.currentWorkspaceView = WORKSPACE_VIEWS.PRECHAT;

    harness.controller.updateComposerVisibility();

    expect(harness.regionVisibilityChanges).toEqual([
      { id: 'chatForm', visible: true },
      { id: 'taskListTray', visible: false },
    ]);
    expect(getElement(harness.document, 'chatForm').classList.contains('is-prechat')).toBe(false);

    harness.regionVisibilityChanges.length = 0;
    harness.appState.workspaceView = WORKSPACE_VIEWS.CHAT;
    harness.appState.currentWorkspaceView = WORKSPACE_VIEWS.CHAT;
    harness.controller.updateComposerVisibility();

    expect(harness.regionVisibilityChanges).toEqual([
      { id: 'chatForm', visible: true },
      { id: 'taskListTray', visible: true },
    ]);
  });

  test('exposes pre-chat selectors used by the shell', () => {
    const conversation = createConversationFixture();
    const harness = createHarness({ activeConversation: conversation });

    expect(harness.controller.hasConversationHistory(conversation)).toBe(true);
    expect(harness.controller.hasSelectedConversationWithHistory()).toBe(true);
    expect(harness.controller.shouldShowNewConversationButton()).toBe(true);
    expect(harness.controller.getPendingConversationType()).toBe(CONVERSATION_TYPES.CHAT);

    harness.appState.pendingConversationType = /** @type {any} */ (CONVERSATION_TYPES.AGENT);
    expect(harness.controller.isPendingAgentConversation()).toBe(true);
  });
});
