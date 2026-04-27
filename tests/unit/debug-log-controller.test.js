import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  buildDebugEntry,
  buildDebugLogCsvFileName,
  createDebugLogController,
  normalizeDebugEntryKind,
} from '../../src/app/debug-log.js';
import { createAppState } from '../../src/state/app-state.js';

function fixedNow() {
  return Date.UTC(2026, 3, 6, 12, 0, 0);
}

describe('debug-log controller', () => {
  test('normalizes entry kinds and builds stable entries', () => {
    expect(normalizeDebugEntryKind(' RAW-MODEL-OUTPUT ')).toBe('raw-model-output');
    expect(normalizeDebugEntryKind('other')).toBe('event');

    expect(
      buildDebugEntry(
        {
          kind: 'raw-model-output',
          message: 'Raw output captured.',
          details: 42,
          createdAt: 12.9,
        },
        { id: 'debug-entry-9', createdAt: fixedNow() }
      )
    ).toEqual({
      id: 'debug-entry-9',
      createdAt: 12,
      kind: 'raw-model-output',
      message: 'Raw output captured.',
      details: '42',
    });

    expect(buildDebugEntry(null, { id: 'debug-entry-10', createdAt: fixedNow() })).toEqual({
      id: 'debug-entry-10',
      createdAt: fixedNow(),
      kind: 'event',
      message: '',
      details: '',
    });
  });

  test('appends entries, trims the oldest entries, and clamps page index', () => {
    const appState = createAppState({ maxDebugEntries: 2 });
    appState.debugPageIndex = 99;
    const controller = createDebugLogController({
      appState,
      pageSize: 1,
      now: fixedNow,
    });

    controller.append('First');
    controller.append('Second');
    controller.append({ kind: 'raw-model-output', message: 'Third', details: 'payload' });

    expect(appState.debugEntryCounter).toBe(3);
    expect(appState.debugEntries.map((entry) => entry.id)).toEqual([
      'debug-entry-2',
      'debug-entry-3',
    ]);
    expect(appState.debugEntries.map((entry) => entry.message)).toEqual(['Second', 'Third']);
    expect(appState.debugEntries.at(-1)?.kind).toBe('raw-model-output');
    expect(appState.debugPageIndex).toBe(0);

    appState.debugPageIndex = 99;
    expect(controller.clampPageIndex()).toBe(1);
    expect(controller.getDebugLogPageCount()).toBe(2);
  });

  test('renders the debug log and responds to pagination callbacks', () => {
    const dom = new JSDOM('<div id="debugLogPanel"></div>');
    const appState = createAppState();
    const controller = createDebugLogController({
      appState,
      container: dom.window.document.getElementById('debugLogPanel'),
      pageSize: 1,
      now: fixedNow,
    });

    controller.append('First');
    controller.append('Second');
    expect(dom.window.document.querySelector('.debug-log-entry-message')?.textContent).toBe(
      'Second'
    );

    dom.window.document
      .querySelector('.debug-log-pagination button:last-child')
      ?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

    expect(appState.debugPageIndex).toBe(1);
    expect(dom.window.document.querySelector('.debug-log-entry-message')?.textContent).toBe(
      'First'
    );
  });

  test('exports CSV only when entries exist', async () => {
    const appState = createAppState();
    const setStatus = vi.fn();
    const triggerDownload = vi.fn();
    const controller = createDebugLogController({
      appState,
      setStatus,
      triggerDownload,
      now: fixedNow,
    });

    expect(controller.exportAsCsv()).toBe(false);
    expect(setStatus).toHaveBeenCalledWith('No debug log entries to export.');
    expect(triggerDownload).not.toHaveBeenCalled();

    controller.append('Ready.');
    expect(controller.exportAsCsv()).toBe(true);

    expect(triggerDownload).toHaveBeenCalledTimes(1);
    const [blob, fileName] = triggerDownload.mock.calls[0];
    expect(fileName).toBe('browser-llm-runner-debug-log-20260406T120000Z.csv');
    await expect(blob.text()).resolves.toContain('"Ready."');
    expect(setStatus).toHaveBeenLastCalledWith('Debug log downloaded as CSV.');
    expect(appState.debugEntries.at(-1)?.message).toBe('Debug log exported as CSV.');
  });

  test('builds timestamped CSV file names', () => {
    expect(buildDebugLogCsvFileName(fixedNow())).toBe(
      'browser-llm-runner-debug-log-20260406T120000Z.csv'
    );
  });
});
