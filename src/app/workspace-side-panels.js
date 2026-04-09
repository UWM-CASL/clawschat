/**
 * @param {{
 *   appState: any;
 *   documentRef?: Document;
 *   terminalPanel?: HTMLElement | null;
 *   terminalHost?: HTMLElement | null;
 *   getActiveConversation: () => any;
 *   getConversationPathMessages: (conversation: any) => any[];
 *   findConversationById: (conversationId: string) => any;
 *   isSettingsView: (state: any) => boolean;
 *   isTerminalOpenForConversation: (state: any, conversationId: string) => boolean;
 *   hasDismissedTerminalForConversation: (state: any, conversationId: string) => boolean;
 *   openTerminalForConversation: (state: any, conversationId: string) => any;
 *   closeTerminal: (state: any, options?: { conversationId?: string | null; dismissed?: boolean }) => any;
 *   clearTerminalDismissal: (state: any, conversationId: string) => any;
 *   appendDebug?: (message: string) => void;
 *   loadTerminalView?: () => Promise<{
 *     createTerminalView: (options?: any) => {
 *       dispose?: () => void;
 *       renderSession: (session?: any) => void;
 *       setVisible: (visible: any) => void;
 *     };
 *   }>;
 * }} options
 */
export function createWorkspaceSidePanelsController({
  appState,
  documentRef = document,
  terminalPanel,
  terminalHost,
  getActiveConversation,
  getConversationPathMessages,
  findConversationById,
  isSettingsView,
  isTerminalOpenForConversation,
  hasDismissedTerminalForConversation,
  openTerminalForConversation,
  closeTerminal,
  clearTerminalDismissal,
  appendDebug = (_message) => {},
  loadTerminalView = () => import('../ui/terminal-view.js'),
}) {
  let terminalView = null;
  let terminalViewLoadPromise = null;

  function parseShellToolResult(message) {
    if (message?.toolResultData && typeof message.toolResultData === 'object') {
      return message.toolResultData;
    }
    const rawResult =
      typeof message?.toolResult === 'string'
        ? message.toolResult
        : typeof message?.text === 'string'
          ? message.text
          : '';
    if (!rawResult.trim()) {
      return null;
    }
    try {
      const parsed = JSON.parse(rawResult);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function parsePythonWriteToolResult(message) {
    if (message?.toolResultData && typeof message.toolResultData === 'object') {
      return message.toolResultData;
    }
    const rawResult =
      typeof message?.toolResult === 'string'
        ? message.toolResult
        : typeof message?.text === 'string'
          ? message.text
          : '';
    if (!rawResult.trim()) {
      return null;
    }
    try {
      const parsed = JSON.parse(rawResult);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function getShellTerminalEntries(conversation) {
    if (!conversation) {
      return [];
    }
    return getConversationPathMessages(conversation)
      .filter(
        (message) =>
          message?.role === 'tool' &&
          (message.toolName === 'run_shell_command' || message.toolName === 'write_python_file')
      )
      .map((message) => {
        if (message.toolName === 'write_python_file') {
          const result = parsePythonWriteToolResult(message);
          const recordedPath =
            typeof message?.toolArguments?.path === 'string' && message.toolArguments.path.trim()
              ? message.toolArguments.path.trim()
              : typeof result?.path === 'string' && result.path.trim()
                ? result.path.trim()
                : '/workspace/script.py';
          const preview = typeof result?.preview === 'string' ? result.preview : '';
          const lineCount = Number.isFinite(result?.lines) ? Number(result.lines) : 0;
          const byteCount = Number.isFinite(result?.bytes) ? Number(result.bytes) : 0;
          return {
            command: `write_python_file ${recordedPath}`,
            currentWorkingDirectory:
              recordedPath.slice(0, recordedPath.lastIndexOf('/')) || '/workspace',
            exitCode: 0,
            stdout: `${typeof result?.message === 'string' ? result.message : `Python file written to ${recordedPath}.`}\n${lineCount ? `${lineCount} line${lineCount === 1 ? '' : 's'}` : '0 lines'}${byteCount ? `, ${byteCount} bytes` : ''}${preview ? `\n${preview}` : ''}`,
            stderr: '',
          };
        }
        const result = parseShellToolResult(message);
        const recordedCommand =
          typeof message?.toolArguments?.cmd === 'string' && message.toolArguments.cmd.trim()
            ? message.toolArguments.cmd.trim()
            : typeof message?.toolArguments?.command === 'string' &&
                message.toolArguments.command.trim()
              ? message.toolArguments.command.trim()
              : '';
        return {
          command:
            recordedCommand ||
            (typeof result?.command === 'string' && result.command.trim()
              ? result.command.trim()
              : ''),
          currentWorkingDirectory:
            typeof result?.currentWorkingDirectory === 'string' &&
            result.currentWorkingDirectory.trim()
              ? result.currentWorkingDirectory.trim()
              : typeof conversation?.currentWorkingDirectory === 'string' &&
                  conversation.currentWorkingDirectory.trim()
                ? conversation.currentWorkingDirectory.trim()
                : '/workspace',
          exitCode: Number.isFinite(result?.exitCode) ? Number(result.exitCode) : 0,
          stdout: typeof result?.stdout === 'string' ? result.stdout : '',
          stderr: typeof result?.stderr === 'string' ? result.stderr : '',
        };
      })
      .filter((entry) => entry.command);
  }

  function getTerminalSessionForConversation(conversation = getActiveConversation()) {
    const entries = getShellTerminalEntries(conversation);
    const pendingEntry =
      appState.pendingShellCommand &&
      conversation?.id &&
      appState.pendingShellCommand.conversationId === conversation.id
        ? appState.pendingShellCommand
        : null;
    const completedEntry =
      appState.completedShellCommand &&
      conversation?.id &&
      appState.completedShellCommand.conversationId === conversation.id
        ? appState.completedShellCommand
        : null;

    if (pendingEntry && entries.length > pendingEntry.historyCount) {
      appState.pendingShellCommand = null;
      return getTerminalSessionForConversation(conversation);
    }
    if (completedEntry && entries.length > completedEntry.historyCount) {
      appState.completedShellCommand = null;
      return getTerminalSessionForConversation(conversation);
    }

    const visibleEntries =
      completedEntry && completedEntry.command && entries.length === completedEntry.historyCount
        ? entries.concat({
            command: completedEntry.command,
            currentWorkingDirectory: completedEntry.currentWorkingDirectory,
            exitCode: completedEntry.exitCode,
            stdout: completedEntry.stdout,
            stderr: completedEntry.stderr,
          })
        : entries;

    const currentWorkingDirectory =
      typeof pendingEntry?.currentWorkingDirectory === 'string' &&
      pendingEntry.currentWorkingDirectory.trim()
        ? pendingEntry.currentWorkingDirectory.trim()
        : typeof visibleEntries[visibleEntries.length - 1]?.currentWorkingDirectory === 'string' &&
            visibleEntries[visibleEntries.length - 1].currentWorkingDirectory.trim()
          ? visibleEntries[visibleEntries.length - 1].currentWorkingDirectory.trim()
          : typeof conversation?.currentWorkingDirectory === 'string' &&
              conversation.currentWorkingDirectory.trim()
            ? conversation.currentWorkingDirectory.trim()
            : '/workspace';

    return {
      currentWorkingDirectory,
      entries: visibleEntries,
      hasVisibleContent: visibleEntries.length > 0 || Boolean(pendingEntry?.command),
      pendingEntry:
        pendingEntry && typeof pendingEntry.command === 'string' && pendingEntry.command.trim()
          ? {
              command: pendingEntry.command.trim(),
              currentWorkingDirectory,
            }
          : null,
      sessionKey: `${conversation?.id || 'none'}:${conversation?.activeLeafMessageId || 'root'}:${
        visibleEntries.length
      }:${pendingEntry?.command || ''}:${completedEntry?.command || ''}`,
    };
  }

  async function ensureTerminalView() {
    if (terminalView) {
      return terminalView;
    }
    if (!terminalViewLoadPromise) {
      terminalViewLoadPromise = loadTerminalView()
        .then(({ createTerminalView }) => {
          terminalView = createTerminalView({
            panel: terminalPanel,
            host: terminalHost,
          });
          return terminalView;
        })
        .catch((error) => {
          terminalViewLoadPromise = null;
          throw error;
        });
    }
    return terminalViewLoadPromise;
  }

  function renderWorkspaceSidePanels() {
    const activeConversation = getActiveConversation();
    const session = getTerminalSessionForConversation(activeConversation);
    const shouldShowTerminal =
      !isSettingsView(appState) &&
      Boolean(activeConversation?.id) &&
      session.hasVisibleContent &&
      (isTerminalOpenForConversation(appState, activeConversation.id) ||
        (!hasDismissedTerminalForConversation(appState, activeConversation.id) &&
          session.entries.length > 0));

    if (
      activeConversation?.id &&
      session.hasVisibleContent &&
      !hasDismissedTerminalForConversation(appState, activeConversation.id)
    ) {
      openTerminalForConversation(appState, activeConversation.id);
    }

    if (!shouldShowTerminal) {
      if (!session.hasVisibleContent) {
        closeTerminal(appState, { conversationId: activeConversation?.id || null });
      }
      documentRef.body.classList.remove('terminal-open');
      terminalView?.setVisible(false);
      return;
    }

    documentRef.body.classList.add('terminal-open');
    void ensureTerminalView()
      .then((loadedTerminalView) => {
        const latestConversation = getActiveConversation();
        const latestSession = getTerminalSessionForConversation(latestConversation);
        const shouldStillShowTerminal =
          !isSettingsView(appState) &&
          Boolean(latestConversation?.id) &&
          latestSession.hasVisibleContent &&
          (isTerminalOpenForConversation(appState, latestConversation.id) ||
            (!hasDismissedTerminalForConversation(appState, latestConversation.id) &&
              latestSession.entries.length > 0));
        if (!shouldStillShowTerminal) {
          loadedTerminalView.setVisible(false);
          return;
        }
        loadedTerminalView.setVisible(true);
        loadedTerminalView.renderSession(latestSession);
      })
      .catch((error) => {
        appendDebug(
          `Terminal view failed to load: ${error instanceof Error ? error.message : String(error)}`
        );
        documentRef.body.classList.remove('terminal-open');
      });
  }

  function handleCloseTerminalPanel() {
    const activeConversation = getActiveConversation();
    closeTerminal(appState, {
      conversationId: activeConversation?.id || null,
      dismissed: true,
    });
    if (appState.activeWorkspaceSidePanel === 'terminal') {
      appState.activeWorkspaceSidePanel = null;
    }
    renderWorkspaceSidePanels();
  }

  function handleShellCommandStart({ command = '', currentWorkingDirectory = '/workspace' } = {}) {
    const activeConversation = getActiveConversation();
    if (!activeConversation?.id || !String(command || '').trim()) {
      return;
    }
    clearTerminalDismissal(appState, activeConversation.id);
    appState.completedShellCommand = null;
    appState.pendingShellCommand = {
      command: String(command || '').trim(),
      conversationId: activeConversation.id,
      currentWorkingDirectory:
        typeof currentWorkingDirectory === 'string' && currentWorkingDirectory.trim()
          ? currentWorkingDirectory.trim()
          : '/workspace',
      historyCount: getShellTerminalEntries(activeConversation).length,
    };
    openTerminalForConversation(appState, activeConversation.id);
    appState.activeWorkspaceSidePanel = 'terminal';
    renderWorkspaceSidePanels();
  }

  function handleShellCommandComplete({
    command = '',
    currentWorkingDirectory = '/workspace',
    exitCode = 0,
    stdout = '',
    stderr = '',
  } = {}) {
    const activeConversation = getActiveConversation();
    const pendingConversationId =
      typeof appState.pendingShellCommand?.conversationId === 'string'
        ? appState.pendingShellCommand.conversationId
        : activeConversation?.id || null;
    if (!pendingConversationId || !String(command || '').trim()) {
      return;
    }
    const pendingConversation = findConversationById(pendingConversationId);
    appState.completedShellCommand = {
      command: String(command || '').trim(),
      conversationId: pendingConversationId,
      currentWorkingDirectory:
        typeof currentWorkingDirectory === 'string' && currentWorkingDirectory.trim()
          ? currentWorkingDirectory.trim()
          : '/workspace',
      exitCode: Number.isFinite(exitCode) ? Number(exitCode) : 0,
      stdout: typeof stdout === 'string' ? stdout : '',
      stderr: typeof stderr === 'string' ? stderr : '',
      historyCount: pendingConversation ? getShellTerminalEntries(pendingConversation).length : 0,
    };
    appState.activeWorkspaceSidePanel = 'terminal';
    renderWorkspaceSidePanels();
  }

  return {
    getShellTerminalEntries,
    getTerminalSessionForConversation,
    handleCloseTerminalPanel,
    handleShellCommandComplete,
    handleShellCommandStart,
    renderWorkspaceSidePanels,
  };
}
