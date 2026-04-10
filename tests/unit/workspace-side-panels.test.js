import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createWorkspaceSidePanelsController } from '../../src/app/workspace-side-panels.js';

function createHarness({
  activeConversation = { id: 'conversation-1', activeLeafMessageId: 'leaf-1' },
  conversationsById = new Map(),
  pathMessagesByConversationId = new Map(),
} = {}) {
  const dom = new JSDOM(`
    <body>
      <div id="terminalPanel"></div>
      <div id="terminalHost"></div>
    </body>
  `);
  const document = dom.window.document;
  globalThis.document = document;
  globalThis.window = dom.window;

  const terminalView = {
    dispose: vi.fn(),
    renderSession: vi.fn(),
    setVisible: vi.fn(),
  };

  const appState = {
    pendingShellCommand: null,
    completedShellCommand: null,
    terminalOpenConversationId: null,
    terminalDismissedConversationIds: new Set(),
    activeWorkspaceSidePanel: null,
  };

  const getConversationPathMessages = vi.fn(
    (conversation) => pathMessagesByConversationId.get(conversation?.id) || []
  );
  const findConversationById = vi.fn((conversationId) => conversationsById.get(conversationId) || null);
  const isSettingsView = vi.fn(() => false);
  const isTerminalOpenForConversation = vi.fn(
    (state, conversationId) => state.terminalOpenConversationId === conversationId
  );
  const hasDismissedTerminalForConversation = vi.fn(
    (state, conversationId) => state.terminalDismissedConversationIds.has(conversationId)
  );
  const openTerminalForConversation = vi.fn((state, conversationId) => {
    state.terminalOpenConversationId = conversationId;
    state.terminalDismissedConversationIds.delete(conversationId);
  });
  const closeTerminal = vi.fn((state, { conversationId = null, dismissed = false } = {}) => {
    if (dismissed && conversationId) {
      state.terminalDismissedConversationIds.add(conversationId);
    }
    if (!conversationId || state.terminalOpenConversationId === conversationId) {
      state.terminalOpenConversationId = null;
    }
  });
  const clearTerminalDismissal = vi.fn((state, conversationId) =>
    state.terminalDismissedConversationIds.delete(conversationId)
  );
  const appendDebug = vi.fn();
  const loadTerminalView = vi.fn(async () => ({
    createTerminalView: () => terminalView,
  }));

  return {
    appState,
    terminalView,
    findConversationById,
    controller: createWorkspaceSidePanelsController({
      appState,
      documentRef: document,
      terminalPanel: document.getElementById('terminalPanel'),
      terminalHost: document.getElementById('terminalHost'),
      getActiveConversation: vi.fn(() => activeConversation),
      getConversationPathMessages,
      findConversationById,
      isSettingsView,
      isTerminalOpenForConversation,
      hasDismissedTerminalForConversation,
      openTerminalForConversation,
      closeTerminal,
      clearTerminalDismissal,
      appendDebug,
      loadTerminalView,
    }),
  };
}

describe('workspace-side-panels', () => {
  test('uses the pending shell command conversation id when computing completion history', () => {
    const targetConversation = {
      id: 'conversation-2',
      activeLeafMessageId: 'leaf-2',
      currentWorkingDirectory: '/workspace',
    };
    const harness = createHarness({
      activeConversation: { id: 'conversation-1', activeLeafMessageId: 'leaf-1' },
      conversationsById: new Map([['conversation-2', targetConversation]]),
      pathMessagesByConversationId: new Map([
        [
          'conversation-2',
          [
            {
              role: 'tool',
              toolName: 'run_shell_command',
              toolArguments: { shell: 'pwd' },
              toolResultData: {
                command: 'pwd',
                currentWorkingDirectory: '/workspace',
                exitCode: 0,
                stdout: '/workspace',
                stderr: '',
              },
            },
          ],
        ],
      ]),
    });
    harness.appState.pendingShellCommand = {
      command: 'ls',
      conversationId: 'conversation-2',
      currentWorkingDirectory: '/workspace',
      historyCount: 1,
    };

    harness.controller.handleShellCommandComplete({
      command: 'ls',
      currentWorkingDirectory: '/workspace',
      stdout: 'notes.md',
    });

    expect(harness.findConversationById).toHaveBeenCalledWith('conversation-2');
    expect(harness.appState.completedShellCommand).toMatchObject({
      command: 'ls',
      conversationId: 'conversation-2',
      historyCount: 1,
      stdout: 'notes.md',
    });
  });

  test('dismisses the terminal panel for the active conversation', () => {
    const activeConversation = { id: 'conversation-1', activeLeafMessageId: 'leaf-1' };
    const harness = createHarness({
      activeConversation,
      conversationsById: new Map([[activeConversation.id, activeConversation]]),
    });
    harness.appState.terminalOpenConversationId = activeConversation.id;
    harness.appState.activeWorkspaceSidePanel = 'terminal';

    harness.controller.handleCloseTerminalPanel();

    expect(harness.appState.terminalOpenConversationId).toBeNull();
    expect(harness.appState.terminalDismissedConversationIds.has(activeConversation.id)).toBe(true);
    expect(harness.appState.activeWorkspaceSidePanel).toBeNull();
  });
});
