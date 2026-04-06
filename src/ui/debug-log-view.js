const DEFAULT_DEBUG_PAGE_SIZE = 20;

const DEBUG_KIND_META = Object.freeze({
  event: {
    label: 'Event',
    badgeClassName: 'text-bg-secondary',
  },
  'raw-model-output': {
    label: 'Raw model output',
    badgeClassName: 'text-bg-warning',
  },
});

function getDebugKindMeta(kind) {
  const normalizedKind = typeof kind === 'string' ? kind.trim().toLowerCase() : '';
  return DEBUG_KIND_META[normalizedKind] || DEBUG_KIND_META.event;
}

function normalizeDebugEntry(entry, index) {
  if (!entry || typeof entry !== 'object') {
    return {
      id: `debug-entry-${index + 1}`,
      createdAt: null,
      kind: 'event',
      message: String(entry || ''),
      details: '',
    };
  }

  const createdAt = Number.isFinite(entry.createdAt) ? Math.trunc(entry.createdAt) : null;
  return {
    id:
      typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `debug-entry-${index + 1}`,
    createdAt,
    kind: typeof entry.kind === 'string' && entry.kind.trim() ? entry.kind.trim() : 'event',
    message: typeof entry.message === 'string' ? entry.message : String(entry.message || ''),
    details: typeof entry.details === 'string' ? entry.details : String(entry.details || ''),
  };
}

function normalizeDebugEntries(entries = []) {
  return Array.isArray(entries) ? entries.map(normalizeDebugEntry) : [];
}

function formatDebugTimestamp(createdAt) {
  if (!Number.isFinite(createdAt)) {
    return 'Unknown time';
  }
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
}

function getDebugEntryIsoTimestamp(createdAt) {
  if (!Number.isFinite(createdAt)) {
    return '';
  }
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function escapeCsvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function buildDebugLogCsv(entries = []) {
  const orderedEntries = normalizeDebugEntries(entries).reverse();
  const header = ['timestamp_iso', 'kind', 'message', 'details'];
  const rows = orderedEntries.map((entry) => [
    getDebugEntryIsoTimestamp(entry.createdAt),
    entry.kind,
    entry.message,
    entry.details,
  ]);
  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

function createToolbar(documentRef, { totalEntries, onExportCsv }) {
  const toolbar = documentRef.createElement('div');
  toolbar.className = 'debug-log-toolbar';

  const summary = documentRef.createElement('p');
  summary.className = 'debug-log-toolbar-summary mb-0';
  summary.textContent =
    totalEntries > 0
      ? `${totalEntries} entr${totalEntries === 1 ? 'y' : 'ies'} available. Newest entries appear first.`
      : 'No debug entries yet.';

  const exportButton = documentRef.createElement('button');
  exportButton.type = 'button';
  exportButton.className = 'btn btn-outline-secondary btn-sm';
  exportButton.textContent = 'Export CSV';
  exportButton.disabled = totalEntries === 0;
  exportButton.addEventListener('click', () => onExportCsv());

  toolbar.append(summary, exportButton);
  return toolbar;
}

function createPaginationSummary(documentRef, { totalEntries, pageIndex, pageSize }) {
  const summary = documentRef.createElement('p');
  summary.className = 'debug-log-pagination-summary mb-0';
  summary.setAttribute('aria-live', 'polite');

  if (totalEntries === 0) {
    summary.textContent = 'Showing 0 entries.';
    return summary;
  }

  const start = pageIndex * pageSize + 1;
  const end = Math.min(totalEntries, start + pageSize - 1);
  summary.textContent = `Showing ${start}-${end} of ${totalEntries}.`;
  return summary;
}

function createPaginationNav(documentRef, { pageIndex, totalPages, listId, onPageChange }) {
  const nav = documentRef.createElement('nav');
  nav.className = 'debug-log-pagination';
  nav.setAttribute('aria-label', 'Debug log pages');

  const newerButton = documentRef.createElement('button');
  newerButton.type = 'button';
  newerButton.className = 'btn btn-outline-secondary btn-sm';
  newerButton.textContent = 'Newer';
  newerButton.disabled = pageIndex <= 0;
  newerButton.setAttribute('aria-controls', listId);
  newerButton.addEventListener('click', () => onPageChange(pageIndex - 1));

  const pageStatus = documentRef.createElement('p');
  pageStatus.className = 'debug-log-page-status mb-0';
  pageStatus.textContent = `Page ${totalPages === 0 ? 0 : pageIndex + 1} of ${totalPages}`;

  const olderButton = documentRef.createElement('button');
  olderButton.type = 'button';
  olderButton.className = 'btn btn-outline-secondary btn-sm';
  olderButton.textContent = 'Older';
  olderButton.disabled = totalPages === 0 || pageIndex >= totalPages - 1;
  olderButton.setAttribute('aria-controls', listId);
  olderButton.addEventListener('click', () => onPageChange(pageIndex + 1));

  nav.append(newerButton, pageStatus, olderButton);
  return nav;
}

function createDebugEntryRow(documentRef, entry) {
  const item = documentRef.createElement('li');
  item.className = 'debug-log-entry';
  item.dataset.debugKind = entry.kind;

  const article = documentRef.createElement('article');
  article.className = 'debug-log-entry-article';

  const meta = documentRef.createElement('div');
  meta.className = 'debug-log-entry-meta';

  const timestamp = documentRef.createElement('time');
  timestamp.className = 'debug-log-entry-time';
  const isoTimestamp = getDebugEntryIsoTimestamp(entry.createdAt);
  if (isoTimestamp) {
    timestamp.dateTime = isoTimestamp;
  }
  timestamp.textContent = formatDebugTimestamp(entry.createdAt);

  const badge = documentRef.createElement('span');
  const metaInfo = getDebugKindMeta(entry.kind);
  badge.className = `badge ${metaInfo.badgeClassName}`;
  badge.textContent = metaInfo.label;

  meta.append(timestamp, badge);
  article.appendChild(meta);

  const normalizedMessage = typeof entry.message === 'string' ? entry.message : '';
  const normalizedDetails = typeof entry.details === 'string' ? entry.details : '';
  if (normalizedMessage.trim() && normalizedMessage !== metaInfo.label) {
    const message = documentRef.createElement('p');
    message.className = 'debug-log-entry-message mb-0';
    message.textContent = normalizedMessage;
    article.appendChild(message);
  }

  if (normalizedDetails || entry.kind === 'raw-model-output') {
    const details = documentRef.createElement('pre');
    details.className = 'debug-log-entry-details mb-0';
    details.textContent = normalizedDetails || '[Empty output]';
    article.appendChild(details);
  }

  item.appendChild(article);
  return item;
}

/**
 * @param {{
 *   container?: HTMLElement | null;
 *   entries?: Array<any>;
 *   pageIndex?: number;
 *   pageSize?: number;
 *   onPageChange?: (pageIndex: number) => void;
 *   onExportCsv?: () => void;
 * }} [options]
 */
export function renderDebugLogView({
  container,
  entries = [],
  pageIndex = 0,
  pageSize = DEFAULT_DEBUG_PAGE_SIZE,
  onPageChange = () => {},
  onExportCsv = () => {},
} = {}) {
  if (!container || container.nodeType !== 1) {
    return {
      pageIndex: 0,
      totalEntries: 0,
      totalPages: 0,
    };
  }

  const documentRef = container.ownerDocument || document;
  const normalizedEntries = normalizeDebugEntries(entries);
  const orderedEntries = normalizedEntries.reverse();
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.max(1, Math.trunc(pageSize)) : DEFAULT_DEBUG_PAGE_SIZE;
  const totalEntries = orderedEntries.length;
  const totalPages = totalEntries > 0 ? Math.ceil(totalEntries / safePageSize) : 0;
  const safePageIndex =
    totalPages > 0
      ? Math.min(Math.max(0, Math.trunc(pageIndex) || 0), totalPages - 1)
      : 0;
  const pageStart = safePageIndex * safePageSize;
  const pageEntries = orderedEntries.slice(pageStart, pageStart + safePageSize);
  const listId = container.id ? `${container.id}List` : 'debugLogList';

  container.replaceChildren();
  container.classList.toggle('debug-log-empty', totalEntries === 0);

  const toolbar = createToolbar(documentRef, { totalEntries, onExportCsv });
  container.appendChild(toolbar);

  const summary = createPaginationSummary(documentRef, {
    totalEntries,
    pageIndex: safePageIndex,
    pageSize: safePageSize,
  });
  container.appendChild(summary);

  if (!totalEntries) {
    const emptyState = documentRef.createElement('p');
    emptyState.className = 'debug-log-empty-state mb-0';
    emptyState.textContent = 'Generation, loading, proxy, and tool diagnostics will appear here.';
    container.appendChild(emptyState);
    return {
      pageIndex: safePageIndex,
      totalEntries,
      totalPages,
    };
  }

  const list = documentRef.createElement('ol');
  list.id = listId;
  list.className = 'debug-log-list list-unstyled mb-0';
  pageEntries.forEach((entry) => {
    list.appendChild(createDebugEntryRow(documentRef, entry));
  });
  container.appendChild(list);

  container.appendChild(
    createPaginationNav(documentRef, {
      pageIndex: safePageIndex,
      totalPages,
      listId,
      onPageChange,
    })
  );

  return {
    pageIndex: safePageIndex,
    totalEntries,
    totalPages,
  };
}
