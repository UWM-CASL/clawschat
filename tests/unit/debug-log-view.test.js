import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildDebugLogCsv, renderDebugLogView } from '../../src/ui/debug-log-view.js';

function buildEntries(count) {
  return Array.from({ length: count }, (_value, index) => ({
    id: `debug-${index + 1}`,
    createdAt: Date.UTC(2026, 3, 6, 12, 0, index),
    kind: 'event',
    message: `Entry ${index + 1}`,
    details: '',
  }));
}

describe('debug-log-view', () => {
  test('renders newest entries first and paginates 20 entries at a time', () => {
    const dom = new JSDOM('<div id="debugLogPanel"></div>');
    const container = dom.window.document.getElementById('debugLogPanel');
    const onPageChange = vi.fn();

    const result = renderDebugLogView({
      container,
      entries: buildEntries(21),
      pageIndex: 0,
      pageSize: 20,
      onPageChange,
    });

    expect(result.totalPages).toBe(2);
    expect(container?.textContent).toContain('Showing 1-20 of 21.');
    const renderedMessages = Array.from(
      container?.querySelectorAll('.debug-log-entry-message') || []
    ).map((node) => node.textContent);
    expect(renderedMessages[0]).toBe('Entry 21');
    expect(renderedMessages.at(-1)).toBe('Entry 2');

    container?.querySelector('.debug-log-pagination button:last-child')?.dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true })
    );
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  test('renders raw model output details and forwards CSV export clicks', () => {
    const dom = new JSDOM('<div id="debugLogPanel"></div>');
    const container = dom.window.document.getElementById('debugLogPanel');
    const onExportCsv = vi.fn();

    renderDebugLogView({
      container,
      entries: [
        {
          id: 'debug-1',
          createdAt: Date.UTC(2026, 3, 6, 12, 0, 0),
          kind: 'raw-model-output',
          message: 'Raw model output captured.',
          details: 'First line\nSecond line',
        },
      ],
      onExportCsv,
    });

    expect(container?.querySelector('.debug-log-entry-details')?.textContent).toBe(
      'First line\nSecond line'
    );

    container?.querySelector('.debug-log-toolbar button')?.dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true })
    );
    expect(onExportCsv).toHaveBeenCalledTimes(1);
  });

  test('builds CSV with newest entries first and escapes embedded quotes', () => {
    const csv = buildDebugLogCsv([
      {
        id: 'debug-1',
        createdAt: Date.UTC(2026, 3, 6, 12, 0, 0),
        kind: 'event',
        message: 'Older entry',
        details: '',
      },
      {
        id: 'debug-2',
        createdAt: Date.UTC(2026, 3, 6, 12, 0, 1),
        kind: 'raw-model-output',
        message: 'Raw model output captured.',
        details: 'He said "hello".',
      },
    ]);

    const rows = csv.split('\r\n');
    expect(rows[0]).toBe('"timestamp_iso","kind","message","details"');
    expect(rows[1]).toContain('"raw-model-output"');
    expect(rows[1]).toContain('"He said ""hello""."');
    expect(rows[2]).toContain('"event"');
  });
});
