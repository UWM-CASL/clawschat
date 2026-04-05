import { describe, expect, test } from 'vitest';
import { JSDOM } from 'jsdom';
import { createTranscriptNavigationController } from '../../src/app/transcript-navigation.js';

function createHarness({ workspaceView = 'chat', settingsOpen = false, started = true } = {}) {
  const dom = new JSDOM(`
    <a id="workspaceLink" data-skip-scope="workspace"></a>
    <a id="chatLink" data-skip-scope="chat"></a>
    <a id="settingsLink" data-skip-scope="settings"></a>
    <div id="topBar"></div>
    <div id="chatMain"></div>
    <ol id="chatTranscript"></ol>
    <button id="jumpToTopButton"></button>
    <button id="jumpToPreviousUserButton"></button>
    <button id="jumpToNextModelButton"></button>
    <button id="jumpToLatestButton"></button>
    <button id="openSettingsButton"></button>
    <textarea id="messageInput"></textarea>
    <div id="chatTranscriptStart" tabindex="-1"></div>
  `);
  const document = dom.window.document;
  const chatMain = document.getElementById('chatMain');
  if (chatMain) {
    chatMain.scrollBy = () => {};
  }
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;

  const appState = {
    workspaceView,
    settingsPageOpen: settingsOpen,
    hasStartedWorkspace: started,
  };

  return {
    appState,
    controller: createTranscriptNavigationController({
      appState,
      documentRef: document,
      reducedMotionQuery: { matches: false },
      chatMain,
      chatTranscript: document.getElementById('chatTranscript'),
      topBar: document.getElementById('topBar'),
      openSettingsButton: document.getElementById('openSettingsButton'),
      jumpToTopButton: document.getElementById('jumpToTopButton'),
      jumpToPreviousUserButton: document.getElementById('jumpToPreviousUserButton'),
      jumpToNextModelButton: document.getElementById('jumpToNextModelButton'),
      jumpToLatestButton: document.getElementById('jumpToLatestButton'),
      messageInput: document.getElementById('messageInput'),
      skipLinkElements: [
        document.getElementById('workspaceLink'),
        document.getElementById('chatLink'),
        document.getElementById('settingsLink'),
      ],
      routeChat: 'chat',
      hasStartedWorkspace: (state) => Boolean(state.hasStartedWorkspace),
      isSettingsView: (state) => Boolean(state.settingsPageOpen),
      isEngineReady: () => true,
    }),
    document,
  };
}

describe('transcript-navigation', () => {
  test('updates skip-link visibility by workspace scope', () => {
    const harness = createHarness({
      workspaceView: 'chat',
      settingsOpen: false,
      started: true,
    });

    harness.controller.updateSkipLinkVisibility();

    expect(harness.document.getElementById('workspaceLink')?.hidden).toBe(false);
    expect(harness.document.getElementById('chatLink')?.hidden).toBe(false);
    expect(harness.document.getElementById('settingsLink')?.hidden).toBe(true);
  });

  test('switches skip-link visibility when settings are open', () => {
    const harness = createHarness({
      workspaceView: 'chat',
      settingsOpen: true,
      started: true,
    });

    harness.controller.updateSkipLinkVisibility();

    expect(harness.document.getElementById('workspaceLink')?.hidden).toBe(true);
    expect(harness.document.getElementById('chatLink')?.hidden).toBe(false);
    expect(harness.document.getElementById('settingsLink')?.hidden).toBe(false);
  });
});
