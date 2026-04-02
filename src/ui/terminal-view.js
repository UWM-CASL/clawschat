import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

function normalizeTerminalText(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function ensureTrailingNewline(text) {
  const normalized = normalizeTerminalText(text);
  if (!normalized) {
    return '';
  }
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

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

  const resizeObserver =
    typeof windowRef.ResizeObserver === 'function'
      ? new windowRef.ResizeObserver(() => {
          if (panel instanceof HTMLElement && !panel.classList.contains('d-none')) {
            fitAddon.fit();
          }
        })
      : null;
  resizeObserver?.observe(host);

  let lastSerializedSession = '';

  function setVisible(visible) {
    if (panel instanceof HTMLElement) {
      panel.classList.toggle('d-none', !visible);
    }
    if (visible) {
      windowRef.requestAnimationFrame(() => {
        fitAddon.fit();
        terminal.scrollToBottom();
      });
    }
  }

  function renderSession({ entries = [], pendingEntry = null, currentWorkingDirectory = '/workspace' } = {}) {
    const serializableSession = JSON.stringify({
      entries,
      pendingEntry,
      currentWorkingDirectory,
    });
    if (serializableSession === lastSerializedSession) {
      return;
    }
    lastSerializedSession = serializableSession;

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
    });

    if (pendingEntry?.command) {
      terminal.write(formatPrompt(pendingEntry.currentWorkingDirectory || currentWorkingDirectory));
      terminal.writeln(normalizeTerminalText(pendingEntry.command));
    }

    terminal.write(prompt);
    terminal.scrollToBottom();
    fitAddon.fit();
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
