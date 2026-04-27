import { buildDebugLogCsv, renderDebugLogView } from '../ui/debug-log-view.js';

const DEFAULT_DEBUG_PAGE_SIZE = 20;

function isElementLike(value) {
  return Boolean(value && typeof value === 'object' && value.nodeType === 1);
}

export function normalizeDebugEntryKind(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized === 'raw-model-output' ? normalized : 'event';
}

export function buildDebugEntry(entryInput, { id = 'debug-entry-0', createdAt = Date.now() } = {}) {
  if (entryInput && typeof entryInput === 'object' && !Array.isArray(entryInput)) {
    return {
      id,
      createdAt: Number.isFinite(entryInput.createdAt)
        ? Math.trunc(entryInput.createdAt)
        : createdAt,
      kind: normalizeDebugEntryKind(entryInput.kind),
      message:
        typeof entryInput.message === 'string'
          ? entryInput.message
          : String(entryInput.message || ''),
      details:
        typeof entryInput.details === 'string'
          ? entryInput.details
          : String(entryInput.details || ''),
    };
  }

  return {
    id,
    createdAt,
    kind: 'event',
    message: typeof entryInput === 'string' ? entryInput : String(entryInput || ''),
    details: '',
  };
}

export function buildDebugLogCsvFileName(createdAt = Date.now()) {
  const timestamp = new Date(createdAt)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  return `browser-llm-runner-debug-log-${timestamp}.csv`;
}

/**
 * @param {{
 *   appState: any;
 *   container?: HTMLElement | null;
 *   pageSize?: number;
 *   setStatus?: (message: string) => void;
 *   triggerDownload?: (blob: Blob, fileName: string) => void;
 *   now?: () => number;
 * }} options
 */
export function createDebugLogController({
  appState,
  container = null,
  pageSize = DEFAULT_DEBUG_PAGE_SIZE,
  setStatus = () => {},
  triggerDownload = () => {},
  now = () => Date.now(),
}) {
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.max(1, Math.trunc(pageSize))
      : DEFAULT_DEBUG_PAGE_SIZE;

  function getDebugLogPageCount() {
    if (!Array.isArray(appState?.debugEntries) || !appState.debugEntries.length) {
      return 0;
    }
    return Math.ceil(appState.debugEntries.length / safePageSize);
  }

  function clampPageIndex() {
    const pageCount = getDebugLogPageCount();
    if (!Number.isFinite(appState.debugPageIndex) || appState.debugPageIndex < 0) {
      appState.debugPageIndex = 0;
      return appState.debugPageIndex;
    }
    if (pageCount === 0) {
      appState.debugPageIndex = 0;
      return appState.debugPageIndex;
    }
    appState.debugPageIndex = Math.min(Math.trunc(appState.debugPageIndex), pageCount - 1);
    return appState.debugPageIndex;
  }

  function nextDebugEntry(entryInput) {
    appState.debugEntryCounter += 1;
    return buildDebugEntry(entryInput, {
      id: `debug-entry-${appState.debugEntryCounter}`,
      createdAt: now(),
    });
  }

  function render() {
    if (!isElementLike(container)) {
      return;
    }
    const { pageIndex } = renderDebugLogView({
      container,
      entries: appState.debugEntries,
      pageIndex: clampPageIndex(),
      pageSize: safePageSize,
      onPageChange: (nextPageIndex) => {
        appState.debugPageIndex = nextPageIndex;
        render();
      },
      onExportCsv: exportAsCsv,
    });
    appState.debugPageIndex = pageIndex;
  }

  function append(entryInput) {
    const entry = nextDebugEntry(entryInput);
    appState.debugEntries.push(entry);
    if (appState.debugEntries.length > appState.maxDebugEntries) {
      appState.debugEntries.shift();
    }
    clampPageIndex();
    render();
    return entry;
  }

  function exportAsCsv() {
    if (!Array.isArray(appState.debugEntries) || appState.debugEntries.length === 0) {
      setStatus('No debug log entries to export.');
      return false;
    }
    const csvDocument = `\uFEFF${buildDebugLogCsv(appState.debugEntries)}`;
    const blob = new Blob([csvDocument], { type: 'text/csv;charset=utf-8' });
    triggerDownload(blob, buildDebugLogCsvFileName(now()));
    setStatus('Debug log downloaded as CSV.');
    append('Debug log exported as CSV.');
    return true;
  }

  return {
    append,
    clampPageIndex,
    exportAsCsv,
    getDebugLogPageCount,
    render,
  };
}
