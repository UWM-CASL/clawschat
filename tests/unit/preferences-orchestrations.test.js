import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createOrchestrationPreferencesController } from '../../src/app/preferences-orchestrations.js';

function createHarness({
  appState = {},
  saveCustomOrchestration = vi.fn(async (record) => record),
  removeCustomOrchestration = vi.fn(async () => true),
  downloadFile = vi.fn(),
} = {}) {
  const dom = new JSDOM(
    `
      <p id="orchestrationEditorHeading"></p>
      <form id="orchestrationEditorForm">
        <input id="orchestrationEditorIdInput" type="hidden" />
        <input id="orchestrationNameInput" type="text" />
        <input id="orchestrationSlashCommandInput" type="text" />
        <textarea id="orchestrationDescriptionInput"></textarea>
        <textarea id="orchestrationDefinitionInput"></textarea>
        <button id="orchestrationSaveButton" type="submit">Save orchestration</button>
        <button id="orchestrationResetButton" type="button">Reset draft</button>
      </form>
      <input id="orchestrationImportInput" type="file" />
      <div id="orchestrationImportFeedback"></div>
      <div id="customOrchestrationsList"></div>
      <div id="builtInOrchestrationsList"></div>
    `,
    { url: 'https://example.test/' }
  );

  const document = dom.window.document;
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;
  globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
  globalThis.Blob = dom.window.Blob;

  const normalizedAppState = {
    customOrchestrations: [],
    ...appState,
  };

  return {
    appState: normalizedAppState,
    document,
    downloadFile,
    saveCustomOrchestration,
    removeCustomOrchestration,
    controller: createOrchestrationPreferencesController({
      appState: normalizedAppState,
      documentRef: document,
      orchestrationEditorHeading: document.getElementById('orchestrationEditorHeading'),
      orchestrationEditorIdInput: document.getElementById('orchestrationEditorIdInput'),
      orchestrationNameInput: document.getElementById('orchestrationNameInput'),
      orchestrationSlashCommandInput: document.getElementById('orchestrationSlashCommandInput'),
      orchestrationDescriptionInput: document.getElementById('orchestrationDescriptionInput'),
      orchestrationDefinitionInput: document.getElementById('orchestrationDefinitionInput'),
      orchestrationSaveButton: document.getElementById('orchestrationSaveButton'),
      orchestrationResetButton: document.getElementById('orchestrationResetButton'),
      orchestrationImportInput: document.getElementById('orchestrationImportInput'),
      orchestrationImportFeedback: document.getElementById('orchestrationImportFeedback'),
      customOrchestrationsList: document.getElementById('customOrchestrationsList'),
      builtInOrchestrationsList: document.getElementById('builtInOrchestrationsList'),
      builtInOrchestrations: [
        {
          id: 'rename-chat',
          name: 'Rename Chat',
          description: 'Built-in rename flow.',
          usageLabel: 'App managed',
          definition: {
            id: 'rename-chat',
            steps: [{ prompt: 'Rename {{userInput}}' }],
          },
        },
      ],
      saveCustomOrchestration,
      removeCustomOrchestration,
      downloadFile,
    }),
  };
}

describe('preferences-orchestrations', () => {
  test('saves a draft, renders it, and exports it', async () => {
    const harness = createHarness();
    const nameInput = /** @type {HTMLInputElement} */ (
      harness.document.getElementById('orchestrationNameInput')
    );
    const slashInput = /** @type {HTMLInputElement} */ (
      harness.document.getElementById('orchestrationSlashCommandInput')
    );
    const descriptionInput = /** @type {HTMLTextAreaElement} */ (
      harness.document.getElementById('orchestrationDescriptionInput')
    );
    const definitionInput = /** @type {HTMLTextAreaElement} */ (
      harness.document.getElementById('orchestrationDefinitionInput')
    );

    nameInput.value = 'Outline Energy';
    slashInput.value = 'outline-energy';
    descriptionInput.value = 'Outline the user input.';
    definitionInput.value = JSON.stringify(
      {
        id: 'outline-energy',
        steps: [{ prompt: 'Outline {{userInput}}' }],
      },
      null,
      2
    );

    const savedRecord = await harness.controller.saveCustomOrchestrationDraft({ persist: true });

    expect(harness.saveCustomOrchestration).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Outline Energy',
        slashCommandName: 'outline-energy',
      })
    );
    expect(savedRecord).toMatchObject({
      name: 'Outline Energy',
      slashCommandName: 'outline-energy',
    });
    expect(harness.appState.customOrchestrations).toEqual([
      expect.objectContaining({
        name: 'Outline Energy',
        slashCommandName: 'outline-energy',
      }),
    ]);
    expect(harness.document.getElementById('customOrchestrationsList')?.textContent).toContain(
      'Outline Energy'
    );
    expect(harness.document.getElementById('customOrchestrationsList')?.textContent).toContain(
      '/outline-energy'
    );
    expect(harness.document.getElementById('builtInOrchestrationsList')?.textContent).toContain(
      'Rename Chat'
    );
    expect(
      harness.document
        .getElementById('builtInOrchestrationsList')
        ?.querySelector('button[data-custom-orchestration-edit="true"]')
    ).toBeNull();
    expect(
      harness.document
        .getElementById('builtInOrchestrationsList')
        ?.textContent?.includes('read-only')
    ).toBe(true);

    const exportedRecord = harness.controller.exportCustomOrchestration(savedRecord.id);

    expect(exportedRecord.id).toBe(savedRecord.id);
    expect(harness.downloadFile).toHaveBeenCalledTimes(1);
    expect(harness.downloadFile.mock.calls[0][1]).toBe(
      'browser-llm-runner-orchestration-outline-energy.json'
    );
  });

  test('imports and removes custom orchestrations', async () => {
    const harness = createHarness();
    const importedRecords = await harness.controller.importCustomOrchestrationFile(
      {
        text: async () =>
          JSON.stringify({
            format: 'browser-llm-runner.custom-orchestration',
            schemaVersion: 1,
            orchestration: {
              id: 'rewrite-notes',
              name: 'Rewrite Notes',
              slashCommandName: 'rewrite-notes',
              description: 'Rewrite the user input.',
              definition: {
                id: 'rewrite-notes',
                steps: [{ prompt: 'Rewrite {{userInput}}' }],
              },
            },
          }),
      },
      { persist: true }
    );

    expect(importedRecords).toHaveLength(1);
    expect(harness.appState.customOrchestrations).toEqual([
      expect.objectContaining({
        name: 'Rewrite Notes',
        slashCommandName: 'rewrite-notes',
      }),
    ]);

    await harness.controller.removeCustomOrchestrationPreference('rewrite-notes', {
      persist: true,
    });

    expect(harness.removeCustomOrchestration).toHaveBeenCalledWith('rewrite-notes');
    expect(harness.appState.customOrchestrations).toEqual([]);
  });

  test('exports all saved custom orchestrations as a collection file', async () => {
    const harness = createHarness({
      appState: {
        customOrchestrations: [
          {
            id: 'outline-energy',
            name: 'Outline Energy',
            slashCommandName: 'outline-energy',
            definition: {
              id: 'outline-energy',
              steps: [{ prompt: 'Outline {{userInput}}' }],
            },
          },
        ],
      },
    });

    const exportedRecords = harness.controller.exportAllCustomOrchestrations();

    expect(exportedRecords).toHaveLength(1);
    expect(exportedRecords[0]?.slashCommandName).toBe('outline-energy');
    expect(harness.downloadFile).toHaveBeenCalledTimes(1);
    expect(harness.downloadFile.mock.calls[0][1]).toMatch(
      /^browser-llm-runner-orchestrations-\d{8}-\d{4}\.json$/
    );
  });
});
