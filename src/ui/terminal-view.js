import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

function normalizeTerminalText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function ensureTrailingNewline(text) {
  const normalized = normalizeTerminalText(text);
  if (!normalized) {
    return '';
  }
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

function getEntryFingerprint(entry = {}) {
  return JSON.stringify({
    command: typeof entry.command === 'string' ? entry.command : '',
    currentWorkingDirectory:
      typeof entry.currentWorkingDirectory === 'string' ? entry.currentWorkingDirectory : '',
    stdout: typeof entry.stdout === 'string' ? entry.stdout : '',
    stderr: typeof entry.stderr === 'string' ? entry.stderr : '',
    exitCode: Number.isFinite(entry.exitCode) ? Number(entry.exitCode) : 0,
  });
}

function getSessionFingerprint({
  sessionKey = '',
  entries = [],
  pendingEntry = null,
  currentWorkingDirectory = '/workspace',
} = {}) {
  return JSON.stringify({
    sessionKey,
    entryCount: entries.length,
    lastEntry: entries.length ? getEntryFingerprint(entries[entries.length - 1]) : '',
    pendingEntry: pendingEntry
      ? {
          command: typeof pendingEntry.command === 'string' ? pendingEntry.command : '',
          currentWorkingDirectory:
            typeof pendingEntry.currentWorkingDirectory === 'string'
              ? pendingEntry.currentWorkingDirectory
              : '',
        }
      : null,
    currentWorkingDirectory,
  });
}

/**
 * @param {{
 *   panel?: HTMLElement | null;
 *   host?: HTMLElement | null;
 *   formatPrompt?: (currentWorkingDirectory: string) => string;
 *   windowRef?: { requestAnimationFrame: (callback: (time: number) => void) => number; ResizeObserver?: any };
 * }} options
 */
export function createTerminalView({
  panel,
  host,
  formatPrompt = (currentWorkingDirectory) => `${currentWorkingDirectory || '/workspace'} $ `,
  windowRef = window,
} = {}) {
  if (!(host instanceof HTMLElement)) {
    throw new Error('A terminal host element is required.');
  }

  const terminal = new Terminal({
    allowTransparency: true,
    convertEol: true,
    cursorBlink: true,
    cursorStyle: 'block',
    disableStdin: true,
    fontFamily:
      '"Cascadia Mono", "Fira Code", "JetBrains Mono", Consolas, "Courier New", monospace',
    fontSize: 14,
    lineHeight: 1.25,
    screenReaderMode: true,
    scrollback: 5000,
    theme: {
      background: '#0a1118',
      foreground: '#d7e3f4',
      cursor: '#eaf2ff',
      cursorAccent: '#0a1118',
      selectionBackground: 'rgba(110, 164, 231, 0.28)',
      black: '#0a1118',
      red: '#ff8d8d',
      green: '#a7e38b',
      yellow: '#f1d07a',
      blue: '#8fc4ff',
      magenta: '#d0a8ff',
      cyan: '#85e4e3',
      white: '#d7e3f4',
      brightBlack: '#66768f',
      brightWhite: '#f7fbff',
    },
  });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(host);

  let fitFrameRequested = false;
  let isVisible = !(panel instanceof HTMLElement) || !panel.classList.contains('d-none');
  let lastSessionFingerprint = '';

  function scheduleFit() {
    if (!isVisible || fitFrameRequested) {
      return;
    }
    fitFrameRequested = true;
    windowRef.requestAnimationFrame(() => {
      fitFrameRequested = false;
      fitAddon.fit();
      terminal.scrollToBottom();
    });
  }

  const resizeObserver =
    typeof windowRef.ResizeObserver === 'function'
      ? new windowRef.ResizeObserver(() => {
          scheduleFit();
        })
      : null;
  resizeObserver?.observe(host);

  function setVisible(visible) {
    if (visible === isVisible) {
      return;
    }
    isVisible = visible;
    if (panel instanceof HTMLElement) {
      panel.classList.toggle('d-none', !visible);
    }
    if (visible) {
      scheduleFit();
    }
  }

  function renderSession({
    sessionKey = '',
    entries = [],
    pendingEntry = null,
    currentWorkingDirectory = '/workspace',
  } = {}) {
    const sessionFingerprint = getSessionFingerprint({
      sessionKey,
      entries,
      pendingEntry,
      currentWorkingDirectory,
    });
    if (sessionFingerprint === lastSessionFingerprint) {
      return;
    }
    lastSessionFingerprint = sessionFingerprint;

    terminal.reset();
    const prompt = formatPrompt(currentWorkingDirectory);

    entries.forEach((entry) => {
      const entryPrompt = formatPrompt(entry.currentWorkingDirectory || currentWorkingDirectory);
      terminal.write(entryPrompt);
      terminal.writeln(normalizeTerminalText(entry.command || ''));

      const stdout = ensureTrailingNewline(entry.stdout);
      if (stdout) {
        terminal.write(stdout);
      }

      const stderr = ensureTrailingNewline(entry.stderr);
      if (stderr) {
        terminal.write(`\x1b[31m${stderr}\x1b[39m`);
      }

      const exitCode = Number.isFinite(entry.exitCode) ? Number(entry.exitCode) : 0;
      if (exitCode !== 0) {
        terminal.write(`\x1b[31m# exit ${exitCode}\n\x1b[39m`);
      }
    });

    if (pendingEntry?.command) {
      terminal.write(formatPrompt(pendingEntry.currentWorkingDirectory || currentWorkingDirectory));
      terminal.writeln(normalizeTerminalText(pendingEntry.command));
      terminal.write('\x1b[33m# running...\n\x1b[39m');
    }

    terminal.write(prompt);
    terminal.scrollToBottom();
  }

  function dispose() {
    resizeObserver?.disconnect();
    terminal.dispose();
  }

  return {
    dispose,
    renderSession,
    setVisible,
  };
}
