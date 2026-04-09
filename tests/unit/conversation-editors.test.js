import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createConversationEditors } from '../../src/app/conversation-editors.js';

function createHarness() {
  const dom = new JSDOM(
    `
      <div>
        <h1 id="chatTitle"></h1>
        <input id="chatTitleInput" class="d-none" />
        <button id="saveChatTitleBtn" class="d-none"></button>
        <button id="cancelChatTitleBtn" class="d-none"></button>
        <div id="conversationSystemPromptModal"></div>
        <h2 id="conversationSystemPromptModalLabel"></h2>
        <p id="conversationSystemPromptModalHelp"></p>
        <div id="conversationPromptFields"></div>
        <div id="agentPromptFields" class="d-none"></div>
        <textarea id="conversationSystemPromptInput"></textarea>
        <input id="conversationSystemPromptAppendToggle" type="checkbox" />
        <input id="agentPromptNameInput" />
        <textarea id="agentPromptPersonalityInput"></textarea>
        <label id="conversationSystemPromptComputedLabel"></label>
        <textarea id="conversationSystemPromptComputedPreview"></textarea>
      </div>
    `,
    { url: 'https://example.test/' },
  );
  const document = dom.window.document;
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;
  globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;

  const activeConversation = {
    id: 'conversation-1',
    name: 'Generated title',
    hasGeneratedName: true,
    conversationType: 'chat',
    conversationSystemPrompt: '  Be concise.  ',
    appendConversationSystemPrompt: true,
  };
  const appState = {
    isChatTitleEditing: false,
    lastConversationTitleTrigger: null,
    lastConversationSystemPromptTrigger: null,
    pendingConversationSystemPrompt: '  Draft prompt.  ',
    pendingAppendConversationSystemPrompt: false,
    conversationSystemPromptModalInstance: {
      show: vi.fn(),
      hide: vi.fn(),
    },
  };

  return {
    dom,
    document,
    appState,
    activeConversation,
    elements: {
      chatTitle: document.getElementById('chatTitle'),
      chatTitleInput: document.getElementById('chatTitleInput'),
      saveChatTitleBtn: document.getElementById('saveChatTitleBtn'),
      cancelChatTitleBtn: document.getElementById('cancelChatTitleBtn'),
      conversationSystemPromptModalLabel: document.getElementById(
        'conversationSystemPromptModalLabel',
      ),
      conversationSystemPromptModalHelp: document.getElementById('conversationSystemPromptModalHelp'),
      conversationSystemPromptComputedLabel: document.getElementById(
        'conversationSystemPromptComputedLabel',
      ),
      conversationPromptFields: document.getElementById('conversationPromptFields'),
      agentPromptFields: document.getElementById('agentPromptFields'),
      conversationSystemPromptInput: document.getElementById('conversationSystemPromptInput'),
      conversationSystemPromptAppendToggle: document.getElementById(
        'conversationSystemPromptAppendToggle',
      ),
      agentPromptNameInput: document.getElementById('agentPromptNameInput'),
      agentPromptPersonalityInput: document.getElementById('agentPromptPersonalityInput'),
      conversationSystemPromptComputedPreview: document.getElementById(
        'conversationSystemPromptComputedPreview',
      ),
    },
    deps: {
      appState,
      conversationSystemPromptModal: document.getElementById('conversationSystemPromptModal'),
      conversationSystemPromptModalLabel: document.getElementById(
        'conversationSystemPromptModalLabel',
      ),
      conversationSystemPromptModalHelp: document.getElementById('conversationSystemPromptModalHelp'),
      conversationSystemPromptComputedLabel: document.getElementById(
        'conversationSystemPromptComputedLabel',
      ),
      conversationSystemPromptInput: document.getElementById('conversationSystemPromptInput'),
      conversationSystemPromptAppendToggle: document.getElementById(
        'conversationSystemPromptAppendToggle',
      ),
      conversationPromptFields: document.getElementById('conversationPromptFields'),
      agentPromptFields: document.getElementById('agentPromptFields'),
      agentPromptNameInput: document.getElementById('agentPromptNameInput'),
      agentPromptPersonalityInput: document.getElementById('agentPromptPersonalityInput'),
      conversationSystemPromptComputedPreview: document.getElementById(
        'conversationSystemPromptComputedPreview',
      ),
      chatTitle: document.getElementById('chatTitle'),
      chatTitleInput: document.getElementById('chatTitleInput'),
      saveChatTitleBtn: document.getElementById('saveChatTitleBtn'),
      cancelChatTitleBtn: document.getElementById('cancelChatTitleBtn'),
      getActiveConversation: vi.fn(() => activeConversation),
      getConversationMenuState: vi.fn(() => ({ canEditName: true })),
      isUiBusy: vi.fn(() => false),
      isChatTitleEditingState: vi.fn((state) => Boolean(state.isChatTitleEditing)),
      setChatTitleEditing: vi.fn((state, value) => {
        state.isChatTitleEditing = value;
      }),
      normalizeSystemPrompt: vi.fn((value) => String(value || '').trim()),
      normalizeConversationPromptMode: vi.fn((value) => value !== false),
      buildComputedConversationSystemPromptPreview: vi.fn(
        ({
          conversationPrompt = '',
          appendConversationPrompt = true,
          conversationType = 'chat',
          agentName = '',
          agentDescription = '',
        }) =>
          `computed:${conversationType}|prompt:${conversationPrompt}|append:${appendConversationPrompt}|agent:${agentName}|personality:${agentDescription}`,
      ),
      queueConversationStateSave: vi.fn(),
      setStatus: vi.fn(),
      renderConversationList: vi.fn(),
      updateChatTitle: vi.fn(),
      normalizeConversationName: vi.fn((value) => String(value || '').trim()),
      createConversationSystemPromptModalInstance: vi.fn(
        () => appState.conversationSystemPromptModalInstance,
      ),
    },
  };
}

describe('conversation-editors', () => {
  test('shows the chat title editor for generated titles', () => {
    const harness = createHarness();
    const editors = createConversationEditors(harness.deps);

    editors.beginChatTitleEdit();

    expect(harness.appState.isChatTitleEditing).toBe(true);
    expect(harness.elements.chatTitle.classList.contains('d-none')).toBe(true);
    expect(harness.elements.chatTitleInput.classList.contains('d-none')).toBe(false);
    expect(harness.elements.chatTitleInput.value).toBe('Generated title');
  });

  test('saves the conversation system prompt and hides the modal', () => {
    const harness = createHarness();
    const editors = createConversationEditors(harness.deps);
    harness.elements.conversationSystemPromptInput.value = '  New prompt  ';
    harness.elements.conversationSystemPromptAppendToggle.checked = false;

    editors.saveConversationSystemPromptEdit();

    expect(harness.activeConversation.conversationSystemPrompt).toBe('New prompt');
    expect(harness.activeConversation.appendConversationSystemPrompt).toBe(false);
    expect(harness.deps.queueConversationStateSave).toHaveBeenCalledTimes(1);
    expect(harness.deps.setStatus).toHaveBeenCalledWith('Conversation system prompt saved.');
    expect(harness.appState.conversationSystemPromptModalInstance.hide).toHaveBeenCalledTimes(1);
  });

  test('edits the pre-chat draft system prompt when no conversation exists yet', () => {
    const harness = createHarness();
    harness.deps.getActiveConversation.mockReturnValue(null);
    const editors = createConversationEditors(harness.deps);

    editors.beginConversationSystemPromptEdit();
    expect(harness.elements.conversationSystemPromptInput.value).toBe('Draft prompt.');
    expect(harness.elements.conversationSystemPromptAppendToggle.checked).toBe(false);
    expect(harness.elements.conversationSystemPromptComputedPreview.value).toBe(
      'computed:chat|prompt:Draft prompt.|append:false|agent:|personality:',
    );

    harness.elements.conversationSystemPromptInput.value = '  Fresh chat context  ';
    harness.elements.conversationSystemPromptAppendToggle.checked = true;
    editors.updateConversationSystemPromptPreview();
    expect(harness.elements.conversationSystemPromptComputedPreview.value).toBe(
      'computed:chat|prompt:Fresh chat context|append:true|agent:|personality:',
    );
    editors.saveConversationSystemPromptEdit();

    expect(harness.appState.pendingConversationSystemPrompt).toBe('Fresh chat context');
    expect(harness.appState.pendingAppendConversationSystemPrompt).toBe(true);
    expect(harness.deps.queueConversationStateSave).not.toHaveBeenCalled();
    expect(harness.deps.setStatus).toHaveBeenCalledWith('Conversation system prompt saved.');
  });

  test('edits agent prompt fields and keeps the computed preview in agent mode', () => {
    const harness = createHarness();
    harness.activeConversation.conversationType = 'agent';
    harness.activeConversation.name = 'Research Partner';
    harness.activeConversation.agent = {
      name: 'Research Partner',
      description: 'Curious and proactive.',
    };
    const editors = createConversationEditors(harness.deps);

    editors.beginConversationSystemPromptEdit();

    expect(harness.elements.conversationSystemPromptModalLabel.textContent).toBe('Edit agent prompt');
    expect(harness.elements.conversationPromptFields.classList.contains('d-none')).toBe(true);
    expect(harness.elements.agentPromptFields.classList.contains('d-none')).toBe(false);
    expect(harness.elements.agentPromptNameInput.value).toBe('Research Partner');
    expect(harness.elements.agentPromptPersonalityInput.value).toBe('Curious and proactive.');
    expect(harness.elements.conversationSystemPromptComputedPreview.value).toBe(
      'computed:agent|prompt:Be concise.|append:true|agent:Research Partner|personality:Curious and proactive.',
    );

    harness.elements.agentPromptNameInput.value = '  Project Coach  ';
    harness.elements.agentPromptPersonalityInput.value = '  Calm, practical, and reflective.  ';
    editors.updateConversationSystemPromptPreview();
    editors.saveConversationSystemPromptEdit();

    expect(harness.activeConversation.name).toBe('Project Coach');
    expect(harness.activeConversation.agent).toEqual({
      name: 'Project Coach',
      description: 'Calm, practical, and reflective.',
    });
    expect(harness.deps.renderConversationList).toHaveBeenCalledTimes(1);
    expect(harness.deps.updateChatTitle).toHaveBeenCalledTimes(1);
    expect(harness.deps.queueConversationStateSave).toHaveBeenCalledTimes(1);
    expect(harness.deps.setStatus).toHaveBeenCalledWith('Agent prompt saved.');
  });
});
