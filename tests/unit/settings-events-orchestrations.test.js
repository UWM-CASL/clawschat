import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { bindOrchestrationSettingsEvents } from '../../src/app/settings-events-orchestrations.js';

function createHarness() {
  const dom = new JSDOM(
    `
      <form id="orchestrationEditorForm">
        <input id="orchestrationNameInput" type="text" />
        <input id="orchestrationSlashCommandInput" type="text" />
        <button id="orchestrationSaveButton" type="submit">Save orchestration</button>
        <button id="orchestrationResetButton" type="button">Reset draft</button>
      </form>
      <form id="orchestrationImportForm">
        <input id="orchestrationImportInput" type="file" />
        <button id="orchestrationImportButton" type="submit">Import JSON</button>
      </form>
      <button id="exportAllOrchestrationsButton" type="button">Export all</button>
      <div id="customOrchestrationsList">
        <button
          id="customOrchestrationEdit"
          type="button"
          data-custom-orchestration-edit="true"
          data-custom-orchestration-id="outline-energy"
        >
          Edit
        </button>
        <button
          id="customOrchestrationExport"
          type="button"
          data-custom-orchestration-export="true"
          data-custom-orchestration-id="outline-energy"
        >
          Export JSON
        </button>
        <button
          id="customOrchestrationRemove"
          type="button"
          data-custom-orchestration-remove="true"
          data-custom-orchestration-id="outline-energy"
          data-custom-orchestration-name="Outline Energy"
        >
          Remove
        </button>
      </div>
    `,
    { url: 'https://example.test/' }
  );

  const document = dom.window.document;
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.Event = dom.window.Event;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;

  const deps = {
    orchestrationEditorForm: document.getElementById('orchestrationEditorForm'),
    orchestrationNameInput: document.getElementById('orchestrationNameInput'),
    orchestrationSlashCommandInput: document.getElementById('orchestrationSlashCommandInput'),
    orchestrationSaveButton: document.getElementById('orchestrationSaveButton'),
    orchestrationResetButton: document.getElementById('orchestrationResetButton'),
    orchestrationImportForm: document.getElementById('orchestrationImportForm'),
    orchestrationImportInput: document.getElementById('orchestrationImportInput'),
    orchestrationImportButton: document.getElementById('orchestrationImportButton'),
    exportAllOrchestrationsButton: document.getElementById('exportAllOrchestrationsButton'),
    customOrchestrationsList: document.getElementById('customOrchestrationsList'),
    clearCustomOrchestrationFeedback: vi.fn(),
    exportAllCustomOrchestrations: vi.fn(() => [{ id: 'outline-energy' }]),
    exportCustomOrchestration: vi.fn(() => ({ id: 'outline-energy', name: 'Outline Energy' })),
    importCustomOrchestrationFile: vi.fn(async () => [
      { id: 'outline-energy', name: 'Outline Energy' },
    ]),
    loadCustomOrchestrationIntoEditor: vi.fn(() => ({
      id: 'outline-energy',
      name: 'Outline Energy',
    })),
    removeCustomOrchestrationPreference: vi.fn(async () => true),
    resetCustomOrchestrationEditor: vi.fn(),
    saveCustomOrchestrationDraft: vi.fn(async () => ({
      id: 'outline-energy',
      name: 'Outline Energy',
      slashCommandName: 'outline-energy',
    })),
    setCustomOrchestrationFeedback: vi.fn(),
    setStatus: vi.fn(),
  };

  bindOrchestrationSettingsEvents(deps);

  return {
    dom,
    document,
    deps,
    elements: {
      orchestrationEditorForm: document.getElementById('orchestrationEditorForm'),
      orchestrationNameInput: document.getElementById('orchestrationNameInput'),
      orchestrationSlashCommandInput: document.getElementById('orchestrationSlashCommandInput'),
      orchestrationResetButton: document.getElementById('orchestrationResetButton'),
      orchestrationImportForm: document.getElementById('orchestrationImportForm'),
      orchestrationImportInput: document.getElementById('orchestrationImportInput'),
      exportAllOrchestrationsButton: document.getElementById('exportAllOrchestrationsButton'),
      customOrchestrationEdit: document.getElementById('customOrchestrationEdit'),
      customOrchestrationExport: document.getElementById('customOrchestrationExport'),
      customOrchestrationRemove: document.getElementById('customOrchestrationRemove'),
    },
  };
}

describe('settings-events-orchestrations', () => {
  test('auto-fills slash commands, saves drafts, and resets the editor', async () => {
    const harness = createHarness();
    const form = /** @type {HTMLFormElement} */ (harness.elements.orchestrationEditorForm);
    const nameInput = /** @type {HTMLInputElement} */ (harness.elements.orchestrationNameInput);
    const slashInput = /** @type {HTMLInputElement} */ (
      harness.elements.orchestrationSlashCommandInput
    );
    const resetButton = /** @type {HTMLButtonElement} */ (
      harness.elements.orchestrationResetButton
    );

    nameInput.value = 'Outline Energy';
    nameInput.dispatchEvent(new harness.dom.window.Event('input', { bubbles: true }));

    expect(slashInput.value).toBe('outline-energy');
    expect(harness.deps.clearCustomOrchestrationFeedback).toHaveBeenCalledTimes(1);

    form.dispatchEvent(new harness.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(harness.deps.setCustomOrchestrationFeedback).toHaveBeenNthCalledWith(
      1,
      'Saving orchestration...',
      'info'
    );
    expect(harness.deps.saveCustomOrchestrationDraft).toHaveBeenCalledWith({ persist: true });
    expect(harness.deps.setStatus).toHaveBeenCalledWith(
      'Outline Energy saved and available as /outline-energy.'
    );

    resetButton.click();

    expect(harness.deps.resetCustomOrchestrationEditor).toHaveBeenCalledWith({ focus: true });
    expect(harness.deps.setStatus).toHaveBeenLastCalledWith('New orchestration draft ready.');
  });

  test('imports json files and exports the saved collection', async () => {
    const harness = createHarness();
    const form = /** @type {HTMLFormElement} */ (harness.elements.orchestrationImportForm);
    const input = /** @type {HTMLInputElement} */ (harness.elements.orchestrationImportInput);
    const exportAllButton = /** @type {HTMLButtonElement} */ (
      harness.elements.exportAllOrchestrationsButton
    );
    const importedFile = { name: 'outline-energy.json' };

    form.dispatchEvent(new harness.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    expect(harness.deps.setStatus).toHaveBeenCalledWith('Choose a JSON file before importing.');

    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [importedFile],
    });

    form.dispatchEvent(new harness.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(harness.deps.importCustomOrchestrationFile).toHaveBeenCalledWith(importedFile, {
      persist: true,
    });
    expect(harness.deps.setStatus).toHaveBeenCalledWith('Outline Energy imported.');

    exportAllButton.click();

    expect(harness.deps.exportAllCustomOrchestrations).toHaveBeenCalledTimes(1);
    expect(harness.deps.setStatus).toHaveBeenLastCalledWith(
      'Custom orchestrations exported as JSON.'
    );
  });

  test('edit, export, and remove actions dispatch from the saved list', async () => {
    const harness = createHarness();
    const editButton = /** @type {HTMLButtonElement} */ (harness.elements.customOrchestrationEdit);
    const exportButton = /** @type {HTMLButtonElement} */ (
      harness.elements.customOrchestrationExport
    );
    const removeButton = /** @type {HTMLButtonElement} */ (
      harness.elements.customOrchestrationRemove
    );
    globalThis.confirm = vi.fn(() => true);

    editButton.click();
    exportButton.click();
    removeButton.click();
    await Promise.resolve();

    expect(harness.deps.loadCustomOrchestrationIntoEditor).toHaveBeenCalledWith('outline-energy', {
      focus: true,
    });
    expect(harness.deps.exportCustomOrchestration).toHaveBeenCalledWith('outline-energy');
    expect(globalThis.confirm).toHaveBeenCalledWith(
      'Remove Outline Energy from this browser?'
    );
    expect(harness.deps.removeCustomOrchestrationPreference).toHaveBeenCalledWith(
      'outline-energy',
      { persist: true }
    );
    expect(harness.deps.setStatus).toHaveBeenNthCalledWith(
      1,
      'Loaded Outline Energy into the editor.'
    );
    expect(harness.deps.setStatus).toHaveBeenNthCalledWith(
      2,
      'Outline Energy exported as JSON.'
    );
    expect(harness.deps.setStatus).toHaveBeenNthCalledWith(3, 'Outline Energy removed.');
  });
});
