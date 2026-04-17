import { normalizeSlashCommandName } from '../orchestrations/custom-orchestrations.js';

/**
 * @param {{
 *   orchestrationEditorForm?: HTMLElement | null;
 *   orchestrationNameInput?: HTMLInputElement | null;
 *   orchestrationSlashCommandInput?: HTMLInputElement | null;
 *   orchestrationSaveButton?: HTMLButtonElement | null;
 *   orchestrationResetButton?: HTMLButtonElement | null;
 *   orchestrationImportForm?: HTMLElement | null;
 *   orchestrationImportInput?: HTMLInputElement | null;
 *   orchestrationImportButton?: HTMLButtonElement | null;
 *   exportAllOrchestrationsButton?: HTMLButtonElement | null;
 *   customOrchestrationsList?: HTMLElement | null;
 *   clearCustomOrchestrationFeedback?: (() => void) | null;
 *   exportAllCustomOrchestrations?: (() => any[]) | null;
 *   exportCustomOrchestration?: ((orchestrationId: string) => any) | null;
 *   importCustomOrchestrationFile?: ((file: File | Blob | { text?: () => Promise<string> }, options?: { persist?: boolean }) => Promise<any[]>) | null;
 *   loadCustomOrchestrationIntoEditor?: ((orchestrationId: string, options?: { focus?: boolean }) => any) | null;
 *   removeCustomOrchestrationPreference?: ((orchestrationId: string, options?: { persist?: boolean }) => Promise<boolean>) | null;
 *   resetCustomOrchestrationEditor?: ((options?: { focus?: boolean }) => void) | null;
 *   saveCustomOrchestrationDraft?: ((options?: { persist?: boolean }) => Promise<any>) | null;
 *   setCustomOrchestrationFeedback?: ((message?: string, variant?: string) => void) | null;
 *   setStatus?: ((message: string) => void) | null;
 * }} options
 */
export function bindOrchestrationSettingsEvents({
  orchestrationEditorForm = null,
  orchestrationNameInput = null,
  orchestrationSlashCommandInput = null,
  orchestrationSaveButton = null,
  orchestrationResetButton = null,
  orchestrationImportForm = null,
  orchestrationImportInput = null,
  orchestrationImportButton = null,
  exportAllOrchestrationsButton = null,
  customOrchestrationsList = null,
  clearCustomOrchestrationFeedback = null,
  exportAllCustomOrchestrations = null,
  exportCustomOrchestration = null,
  importCustomOrchestrationFile = null,
  loadCustomOrchestrationIntoEditor = null,
  removeCustomOrchestrationPreference = null,
  resetCustomOrchestrationEditor = null,
  saveCustomOrchestrationDraft = null,
  setCustomOrchestrationFeedback = null,
  setStatus = () => {},
}) {
  function maybeAutoFillSlashCommand() {
    if (
      !(orchestrationNameInput instanceof HTMLInputElement) ||
      !(orchestrationSlashCommandInput instanceof HTMLInputElement)
    ) {
      return;
    }
    const autoFillState = orchestrationSlashCommandInput.dataset.autoFillState || '';
    const currentValue = orchestrationSlashCommandInput.value.trim();
    if (currentValue && autoFillState !== 'auto') {
      return;
    }
    orchestrationSlashCommandInput.value = normalizeSlashCommandName(orchestrationNameInput.value);
    orchestrationSlashCommandInput.dataset.autoFillState = 'auto';
  }

  if (orchestrationNameInput instanceof HTMLInputElement) {
    orchestrationNameInput.addEventListener('input', () => {
      maybeAutoFillSlashCommand();
      if (typeof clearCustomOrchestrationFeedback === 'function') {
        clearCustomOrchestrationFeedback();
      }
    });
  }

  if (orchestrationSlashCommandInput instanceof HTMLInputElement) {
    orchestrationSlashCommandInput.addEventListener('input', () => {
      orchestrationSlashCommandInput.dataset.autoFillState =
        orchestrationSlashCommandInput.value.trim() ? 'manual' : 'auto';
      if (typeof clearCustomOrchestrationFeedback === 'function') {
        clearCustomOrchestrationFeedback();
      }
    });
  }

  if (orchestrationEditorForm instanceof HTMLElement && orchestrationEditorForm.tagName === 'FORM') {
    orchestrationEditorForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (orchestrationSaveButton instanceof HTMLButtonElement) {
        orchestrationSaveButton.disabled = true;
      }
      if (typeof setCustomOrchestrationFeedback === 'function') {
        setCustomOrchestrationFeedback('Saving orchestration...', 'info');
      }
      void Promise.resolve(
        typeof saveCustomOrchestrationDraft === 'function'
          ? saveCustomOrchestrationDraft({ persist: true })
          : null
      )
        .then(
          (savedRecord) => {
            const label =
              savedRecord && typeof savedRecord === 'object' && savedRecord.name
                ? savedRecord.name
                : 'Orchestration';
            if (typeof setCustomOrchestrationFeedback === 'function') {
              setCustomOrchestrationFeedback(
                `${label} saved. Use /${savedRecord?.slashCommandName || 'command'} to run it.`,
                'success'
              );
            }
            if (savedRecord?.slashCommandName) {
              setStatus(`${label} saved and available as /${savedRecord.slashCommandName}.`);
            } else {
              setStatus(`${label} saved.`);
            }
          },
          (error) => {
            const message = error instanceof Error ? error.message : String(error);
            if (typeof setCustomOrchestrationFeedback === 'function') {
              setCustomOrchestrationFeedback(message, 'danger');
            }
            setStatus(message);
          }
        )
        .finally(() => {
          if (orchestrationSaveButton instanceof HTMLButtonElement) {
            orchestrationSaveButton.disabled = false;
          }
        });
    });
  }

  if (orchestrationResetButton instanceof HTMLButtonElement) {
    orchestrationResetButton.addEventListener('click', () => {
      if (typeof resetCustomOrchestrationEditor === 'function') {
        resetCustomOrchestrationEditor({ focus: true });
      }
      if (
        orchestrationSlashCommandInput instanceof HTMLInputElement &&
        !orchestrationSlashCommandInput.value.trim()
      ) {
        orchestrationSlashCommandInput.dataset.autoFillState = 'auto';
      }
      if (typeof clearCustomOrchestrationFeedback === 'function') {
        clearCustomOrchestrationFeedback();
      }
      setStatus('New orchestration draft ready.');
    });
  }

  if (orchestrationImportInput instanceof HTMLInputElement) {
    orchestrationImportInput.addEventListener('input', () => {
      if (typeof clearCustomOrchestrationFeedback === 'function') {
        clearCustomOrchestrationFeedback();
      }
    });
    orchestrationImportInput.addEventListener('change', () => {
      if (typeof clearCustomOrchestrationFeedback === 'function') {
        clearCustomOrchestrationFeedback();
      }
    });
  }

  if (orchestrationImportForm instanceof HTMLElement && orchestrationImportForm.tagName === 'FORM') {
    orchestrationImportForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const file =
        orchestrationImportInput instanceof HTMLInputElement && orchestrationImportInput.files?.length
          ? orchestrationImportInput.files[0]
          : null;
      if (!file) {
        if (typeof setCustomOrchestrationFeedback === 'function') {
          setCustomOrchestrationFeedback('Choose a JSON file before importing.', 'danger');
        }
        setStatus('Choose a JSON file before importing.');
        return;
      }
      if (orchestrationImportButton instanceof HTMLButtonElement) {
        orchestrationImportButton.disabled = true;
      }
      if (typeof setCustomOrchestrationFeedback === 'function') {
        setCustomOrchestrationFeedback('Importing orchestration file...', 'info');
      }
      void Promise.resolve(
        typeof importCustomOrchestrationFile === 'function'
          ? importCustomOrchestrationFile(file, { persist: true })
          : []
      )
        .then(
          (savedRecords) => {
            const importedCount = Array.isArray(savedRecords) ? savedRecords.length : 0;
            const label =
              importedCount === 1
                ? `${savedRecords[0]?.name || '1 orchestration'} imported.`
                : `${importedCount} orchestrations imported.`;
            if (typeof setCustomOrchestrationFeedback === 'function') {
              setCustomOrchestrationFeedback(label, 'success');
            }
            setStatus(label);
          },
          (error) => {
            const message = error instanceof Error ? error.message : String(error);
            if (typeof setCustomOrchestrationFeedback === 'function') {
              setCustomOrchestrationFeedback(message, 'danger');
            }
            setStatus(message);
          }
        )
        .finally(() => {
          if (orchestrationImportButton instanceof HTMLButtonElement) {
            orchestrationImportButton.disabled = false;
          }
        });
    });
  }

  if (exportAllOrchestrationsButton instanceof HTMLButtonElement) {
    exportAllOrchestrationsButton.addEventListener('click', () => {
      try {
        const exportedRecords =
          typeof exportAllCustomOrchestrations === 'function'
            ? exportAllCustomOrchestrations()
            : [];
        setStatus(
          Array.isArray(exportedRecords) && exportedRecords.length
            ? 'Custom orchestrations exported as JSON.'
            : 'No custom orchestrations to export.'
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (typeof setCustomOrchestrationFeedback === 'function') {
          setCustomOrchestrationFeedback(message, 'danger');
        }
        setStatus(message);
      }
    });
  }

  if (customOrchestrationsList instanceof HTMLElement) {
    customOrchestrationsList.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const editButton = target.closest('button[data-custom-orchestration-edit="true"]');
      if (editButton instanceof HTMLButtonElement) {
        const orchestrationId =
          typeof editButton.dataset.customOrchestrationId === 'string'
            ? editButton.dataset.customOrchestrationId
            : '';
        try {
          const record =
            typeof loadCustomOrchestrationIntoEditor === 'function'
              ? loadCustomOrchestrationIntoEditor(orchestrationId, { focus: true })
              : null;
          if (record?.name) {
            setStatus(`Loaded ${record.name} into the editor.`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (typeof setCustomOrchestrationFeedback === 'function') {
            setCustomOrchestrationFeedback(message, 'danger');
          }
          setStatus(message);
        }
        return;
      }

      const exportButton = target.closest('button[data-custom-orchestration-export="true"]');
      if (exportButton instanceof HTMLButtonElement) {
        const orchestrationId =
          typeof exportButton.dataset.customOrchestrationId === 'string'
            ? exportButton.dataset.customOrchestrationId
            : '';
        try {
          const record =
            typeof exportCustomOrchestration === 'function'
              ? exportCustomOrchestration(orchestrationId)
              : null;
          setStatus(record?.name ? `${record.name} exported as JSON.` : 'Orchestration exported.');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (typeof setCustomOrchestrationFeedback === 'function') {
            setCustomOrchestrationFeedback(message, 'danger');
          }
          setStatus(message);
        }
        return;
      }

      const removeButton = target.closest('button[data-custom-orchestration-remove="true"]');
      if (!(removeButton instanceof HTMLButtonElement)) {
        return;
      }
      const orchestrationId =
        typeof removeButton.dataset.customOrchestrationId === 'string'
          ? removeButton.dataset.customOrchestrationId
          : '';
      const orchestrationName =
        typeof removeButton.dataset.customOrchestrationName === 'string' &&
        removeButton.dataset.customOrchestrationName.trim()
          ? removeButton.dataset.customOrchestrationName.trim()
          : 'Orchestration';
      const confirmed =
        typeof globalThis.confirm === 'function'
          ? globalThis.confirm(`Remove ${orchestrationName} from this browser?`)
          : true;
      if (!confirmed) {
        return;
      }
      removeButton.disabled = true;
      void Promise.resolve(
        typeof removeCustomOrchestrationPreference === 'function'
          ? removeCustomOrchestrationPreference(orchestrationId, { persist: true })
          : false
      )
        .then(
          () => {
            if (typeof clearCustomOrchestrationFeedback === 'function') {
              clearCustomOrchestrationFeedback();
            }
            setStatus(`${orchestrationName} removed.`);
          },
          (error) => {
            const message = error instanceof Error ? error.message : String(error);
            if (typeof setCustomOrchestrationFeedback === 'function') {
              setCustomOrchestrationFeedback(message, 'danger');
            }
            setStatus(message);
          }
        )
        .finally(() => {
          removeButton.disabled = false;
        });
    });
  }
}
