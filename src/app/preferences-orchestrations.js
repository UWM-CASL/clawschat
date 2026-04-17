import {
  assertValidCustomOrchestration,
  buildCustomOrchestrationCollectionExportFileName,
  buildCustomOrchestrationCollectionExportPayload,
  buildCustomOrchestrationExportFileName,
  buildCustomOrchestrationExportPayload,
  buildCustomOrchestrationTemplate,
  buildSlashCommandLabel,
  formatOrchestrationDefinition,
  normalizeCustomOrchestrations,
  normalizeSlashCommandName,
  parseCustomOrchestrationImportText,
} from '../orchestrations/custom-orchestrations.js';

/**
 * @param {{
 *   appState: any;
 *   documentRef?: Document;
 *   orchestrationEditorHeading?: HTMLElement | null;
 *   orchestrationEditorIdInput?: HTMLInputElement | null;
 *   orchestrationNameInput?: HTMLInputElement | null;
 *   orchestrationSlashCommandInput?: HTMLInputElement | null;
 *   orchestrationDescriptionInput?: HTMLTextAreaElement | HTMLInputElement | null;
 *   orchestrationDefinitionInput?: HTMLTextAreaElement | null;
 *   orchestrationSaveButton?: HTMLButtonElement | null;
 *   orchestrationResetButton?: HTMLButtonElement | null;
 *   orchestrationImportInput?: HTMLInputElement | null;
 *   orchestrationImportFeedback?: HTMLElement | null;
 *   customOrchestrationsList?: HTMLElement | null;
 *   builtInOrchestrationsList?: HTMLElement | null;
 *   builtInOrchestrations?: any[];
 *   saveCustomOrchestration?: ((record: any) => Promise<any>) | null;
 *   removeCustomOrchestration?: ((orchestrationId: string) => Promise<boolean>) | null;
 *   downloadFile?: ((blob: Blob, fileName: string) => void) | null;
 * }} options
 */
export function createOrchestrationPreferencesController({
  appState,
  documentRef = document,
  orchestrationEditorHeading = null,
  orchestrationEditorIdInput = null,
  orchestrationNameInput = null,
  orchestrationSlashCommandInput = null,
  orchestrationDescriptionInput = null,
  orchestrationDefinitionInput = null,
  orchestrationSaveButton = null,
  orchestrationResetButton = null,
  orchestrationImportInput = null,
  orchestrationImportFeedback = null,
  customOrchestrationsList = null,
  builtInOrchestrationsList = null,
  builtInOrchestrations = [],
  saveCustomOrchestration = null,
  removeCustomOrchestration = null,
  downloadFile = null,
}) {
  const normalizedBuiltInOrchestrations = Array.isArray(builtInOrchestrations)
    ? builtInOrchestrations
        .filter((record) => record && typeof record === 'object' && record.definition)
        .map((record) => ({
          id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : 'built-in',
          name:
            typeof record.name === 'string' && record.name.trim()
              ? record.name.trim()
              : 'App Orchestration',
          description:
            typeof record.description === 'string' && record.description.trim()
              ? record.description.trim()
              : '',
          usageLabel:
            typeof record.usageLabel === 'string' && record.usageLabel.trim()
              ? record.usageLabel.trim()
              : 'App managed',
          definition: record.definition,
        }))
    : [];

  function getCustomOrchestrations() {
    return normalizeCustomOrchestrations(appState.customOrchestrations);
  }

  function updateEditorHeading(isEditing = false) {
    if (orchestrationEditorHeading instanceof HTMLElement) {
      orchestrationEditorHeading.textContent = isEditing
        ? 'Edit custom orchestration'
        : 'New custom orchestration';
    }
    if (orchestrationSaveButton instanceof HTMLButtonElement) {
      orchestrationSaveButton.textContent = isEditing ? 'Save changes' : 'Save orchestration';
    }
    if (orchestrationResetButton instanceof HTMLButtonElement) {
      orchestrationResetButton.textContent = isEditing ? 'New orchestration' : 'Reset draft';
    }
  }

  function setEditorValues(record = null) {
    const normalizedRecord = record ? assertValidCustomOrchestration(record) : null;
    const isEditing = Boolean(normalizedRecord);
    if (orchestrationEditorIdInput instanceof HTMLInputElement) {
      orchestrationEditorIdInput.value = normalizedRecord?.id || '';
    }
    if (orchestrationNameInput instanceof HTMLInputElement) {
      orchestrationNameInput.value = normalizedRecord?.name || '';
    }
    if (orchestrationSlashCommandInput instanceof HTMLInputElement) {
      orchestrationSlashCommandInput.value = normalizedRecord?.slashCommandName || '';
    }
    if (
      orchestrationDescriptionInput instanceof HTMLTextAreaElement ||
      orchestrationDescriptionInput instanceof HTMLInputElement
    ) {
      orchestrationDescriptionInput.value = normalizedRecord?.description || '';
    }
    if (orchestrationDefinitionInput instanceof HTMLTextAreaElement) {
      orchestrationDefinitionInput.value = formatOrchestrationDefinition(
        normalizedRecord?.definition || buildCustomOrchestrationTemplate()
      );
    }
    updateEditorHeading(isEditing);
  }

  function setCustomOrchestrationFeedback(message = '', variant = 'info') {
    if (!(orchestrationImportFeedback instanceof HTMLElement)) {
      return;
    }
    const normalizedMessage = typeof message === 'string' ? message.trim() : '';
    orchestrationImportFeedback.className = '';
    orchestrationImportFeedback.replaceChildren();
    if (!normalizedMessage) {
      orchestrationImportFeedback.classList.add('d-none');
      orchestrationImportFeedback.removeAttribute('role');
      return;
    }
    orchestrationImportFeedback.classList.remove('d-none');
    orchestrationImportFeedback.setAttribute('role', variant === 'danger' ? 'alert' : 'status');
    orchestrationImportFeedback.classList.add(
      'alert',
      variant === 'danger'
        ? 'alert-danger'
        : variant === 'success'
          ? 'alert-success'
          : 'alert-secondary',
      'py-2',
      'px-3',
      'mb-0'
    );
    orchestrationImportFeedback.textContent = normalizedMessage;
  }

  function clearCustomOrchestrationFeedback() {
    setCustomOrchestrationFeedback('');
  }

  function captureAccordionUiState(container) {
    if (!(container instanceof HTMLElement)) {
      return {
        expandedPanelIds: new Set(),
        focusedElementId: '',
        scrollTop: 0,
      };
    }
    const expandedPanelIds = new Set(
      Array.from(container.querySelectorAll('.accordion-collapse.show'))
        .map((panel) => (panel instanceof HTMLElement ? panel.id : ''))
        .filter(Boolean)
    );
    const activeElement =
      documentRef.activeElement instanceof HTMLElement && container.contains(documentRef.activeElement)
        ? documentRef.activeElement
        : null;
    return {
      expandedPanelIds,
      focusedElementId: activeElement?.id || '',
      scrollTop: container.scrollTop,
    };
  }

  function restoreAccordionUiState(container, { expandedPanelIds, focusedElementId, scrollTop }) {
    if (!(container instanceof HTMLElement)) {
      return;
    }
    expandedPanelIds.forEach((panelId) => {
      const panel = documentRef.getElementById(panelId);
      if (!(panel instanceof HTMLElement)) {
        return;
      }
      panel.classList.add('show');
      const headerButton = container.querySelector(`[data-bs-target="#${panelId}"]`);
      if (headerButton instanceof HTMLElement) {
        headerButton.classList.remove('collapsed');
        headerButton.setAttribute('aria-expanded', 'true');
      }
    });
    container.scrollTop = typeof scrollTop === 'number' ? scrollTop : 0;
    if (focusedElementId) {
      const nextFocusTarget = documentRef.getElementById(focusedElementId);
      if (nextFocusTarget instanceof HTMLElement) {
        nextFocusTarget.focus({ preventScroll: true });
      }
    }
  }

  function buildAccordionPanelId(prefix, id) {
    return `${prefix}-${id.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
  }

  function appendMetadataEntry(list, label, value) {
    if (!(list instanceof HTMLElement)) {
      return;
    }
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    if (!normalizedValue) {
      return;
    }
    const term = documentRef.createElement('dt');
    term.textContent = label;
    list.appendChild(term);
    const description = documentRef.createElement('dd');
    description.textContent = normalizedValue;
    list.appendChild(description);
  }

  function renderDefinitionPreview(definition) {
    const preview = documentRef.createElement('pre');
    preview.className = 'orchestration-definition-preview mb-0';
    preview.textContent = formatOrchestrationDefinition(definition);
    return preview;
  }

  function renderCustomOrchestrations() {
    if (!(customOrchestrationsList instanceof HTMLElement)) {
      return;
    }
    const uiState = captureAccordionUiState(customOrchestrationsList);
    const customOrchestrations = getCustomOrchestrations();
    customOrchestrationsList.replaceChildren();

    if (!customOrchestrations.length) {
      const emptyState = documentRef.createElement('p');
      emptyState.className = 'text-body-secondary mb-0';
      emptyState.textContent = 'No custom orchestrations saved yet.';
      customOrchestrationsList.appendChild(emptyState);
      return;
    }

    customOrchestrations.forEach((record) => {
      const panelId = buildAccordionPanelId('customOrchestrationPanel', record.id);
      const headingId = buildAccordionPanelId('customOrchestrationHeading', record.id);

      const accordionItem = documentRef.createElement('div');
      accordionItem.className = 'accordion-item';

      const header = documentRef.createElement('h4');
      header.className = 'accordion-header';
      header.id = headingId;

      const headerButton = documentRef.createElement('button');
      headerButton.className = 'accordion-button collapsed';
      headerButton.type = 'button';
      headerButton.setAttribute('data-bs-toggle', 'collapse');
      headerButton.setAttribute('data-bs-target', `#${panelId}`);
      headerButton.setAttribute('aria-expanded', 'false');
      headerButton.setAttribute('aria-controls', panelId);

      const headerSummary = documentRef.createElement('span');
      headerSummary.className = 'mcp-server-summary';
      const headerTitle = documentRef.createElement('span');
      headerTitle.textContent = record.name;
      headerSummary.appendChild(headerTitle);
      const headerDescription = documentRef.createElement('small');
      headerDescription.textContent =
        record.description || `${buildSlashCommandLabel(record.slashCommandName)} custom orchestration`;
      headerSummary.appendChild(headerDescription);
      headerButton.appendChild(headerSummary);
      header.appendChild(headerButton);
      accordionItem.appendChild(header);

      const collapse = documentRef.createElement('div');
      collapse.id = panelId;
      collapse.className = 'accordion-collapse collapse';
      collapse.setAttribute('aria-labelledby', headingId);

      const body = documentRef.createElement('div');
      body.className = 'accordion-body d-flex flex-column gap-3';

      const controls = documentRef.createElement('div');
      controls.className = 'd-flex flex-wrap align-items-start justify-content-between gap-3';

      const commandSummary = documentRef.createElement('p');
      commandSummary.className = 'mb-0 text-body-secondary';
      commandSummary.innerHTML = `Slash command: <code>${buildSlashCommandLabel(
        record.slashCommandName
      )}</code>`;
      controls.appendChild(commandSummary);

      const actionGroup = documentRef.createElement('div');
      actionGroup.className = 'd-flex flex-wrap gap-2';

      const editButton = documentRef.createElement('button');
      editButton.type = 'button';
      editButton.className = 'btn btn-outline-primary btn-sm';
      editButton.textContent = 'Edit';
      editButton.dataset.customOrchestrationEdit = 'true';
      editButton.dataset.customOrchestrationId = record.id;
      actionGroup.appendChild(editButton);

      const exportButton = documentRef.createElement('button');
      exportButton.type = 'button';
      exportButton.className = 'btn btn-outline-secondary btn-sm';
      exportButton.textContent = 'Export JSON';
      exportButton.dataset.customOrchestrationExport = 'true';
      exportButton.dataset.customOrchestrationId = record.id;
      actionGroup.appendChild(exportButton);

      const removeButton = documentRef.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn-outline-danger btn-sm';
      removeButton.textContent = 'Remove';
      removeButton.dataset.customOrchestrationRemove = 'true';
      removeButton.dataset.customOrchestrationId = record.id;
      removeButton.dataset.customOrchestrationName = record.name;
      actionGroup.appendChild(removeButton);

      controls.appendChild(actionGroup);
      body.appendChild(controls);

      const metadata = documentRef.createElement('dl');
      metadata.className = 'mcp-server-metadata mb-0';
      appendMetadataEntry(metadata, 'Definition ID', record.definition?.id);
      appendMetadataEntry(metadata, 'Slash command', buildSlashCommandLabel(record.slashCommandName));
      appendMetadataEntry(metadata, 'Description', record.description);
      if (metadata.children.length) {
        body.appendChild(metadata);
      }

      const definitionGroup = documentRef.createElement('div');
      const definitionHeading = documentRef.createElement('p');
      definitionHeading.className = 'form-label mb-1';
      definitionHeading.textContent = 'Definition';
      definitionGroup.appendChild(definitionHeading);
      const definitionHelp = documentRef.createElement('p');
      definitionHelp.className = 'form-text mt-0 mb-2';
      definitionHelp.textContent =
        'Saved exactly as JSON. Use the editor to update it or export it.';
      definitionGroup.appendChild(definitionHelp);
      definitionGroup.appendChild(renderDefinitionPreview(record.definition));
      body.appendChild(definitionGroup);

      collapse.appendChild(body);
      accordionItem.appendChild(collapse);
      customOrchestrationsList.appendChild(accordionItem);
    });

    restoreAccordionUiState(customOrchestrationsList, uiState);
  }

  function renderBuiltInOrchestrations() {
    if (!(builtInOrchestrationsList instanceof HTMLElement)) {
      return;
    }
    const uiState = captureAccordionUiState(builtInOrchestrationsList);
    builtInOrchestrationsList.replaceChildren();

    if (!normalizedBuiltInOrchestrations.length) {
      const emptyState = documentRef.createElement('p');
      emptyState.className = 'text-body-secondary mb-0';
      emptyState.textContent = 'No app orchestrations are registered.';
      builtInOrchestrationsList.appendChild(emptyState);
      return;
    }

    normalizedBuiltInOrchestrations.forEach((record) => {
      const panelId = buildAccordionPanelId('builtInOrchestrationPanel', record.id);
      const headingId = buildAccordionPanelId('builtInOrchestrationHeading', record.id);

      const accordionItem = documentRef.createElement('div');
      accordionItem.className = 'accordion-item';

      const header = documentRef.createElement('h4');
      header.className = 'accordion-header';
      header.id = headingId;

      const headerButton = documentRef.createElement('button');
      headerButton.className = 'accordion-button collapsed';
      headerButton.type = 'button';
      headerButton.setAttribute('data-bs-toggle', 'collapse');
      headerButton.setAttribute('data-bs-target', `#${panelId}`);
      headerButton.setAttribute('aria-expanded', 'false');
      headerButton.setAttribute('aria-controls', panelId);

      const headerSummary = documentRef.createElement('span');
      headerSummary.className = 'mcp-server-summary';
      const headerTitle = documentRef.createElement('span');
      headerTitle.textContent = record.name;
      headerSummary.appendChild(headerTitle);
      const headerDescription = documentRef.createElement('small');
      headerDescription.textContent = record.description || record.usageLabel;
      headerSummary.appendChild(headerDescription);
      headerButton.appendChild(headerSummary);
      header.appendChild(headerButton);
      accordionItem.appendChild(header);

      const collapse = documentRef.createElement('div');
      collapse.id = panelId;
      collapse.className = 'accordion-collapse collapse';
      collapse.setAttribute('aria-labelledby', headingId);

      const body = documentRef.createElement('div');
      body.className = 'accordion-body d-flex flex-column gap-3';

      const note = documentRef.createElement('div');
      note.className = 'alert alert-secondary py-2 px-3 mb-0';
      note.setAttribute('role', 'note');
      note.textContent = `${record.usageLabel} These app-managed orchestrations are read-only.`;
      body.appendChild(note);

      const metadata = documentRef.createElement('dl');
      metadata.className = 'mcp-server-metadata mb-0';
      appendMetadataEntry(metadata, 'Definition ID', record.definition?.id);
      appendMetadataEntry(metadata, 'Usage', record.usageLabel);
      appendMetadataEntry(metadata, 'Description', record.description);
      body.appendChild(metadata);

      const definitionGroup = documentRef.createElement('div');
      const definitionHeading = documentRef.createElement('p');
      definitionHeading.className = 'form-label mb-1';
      definitionHeading.textContent = 'Definition';
      definitionGroup.appendChild(definitionHeading);
      definitionGroup.appendChild(renderDefinitionPreview(record.definition));
      body.appendChild(definitionGroup);

      collapse.appendChild(body);
      accordionItem.appendChild(collapse);
      builtInOrchestrationsList.appendChild(accordionItem);
    });

    restoreAccordionUiState(builtInOrchestrationsList, uiState);
  }

  function applyCustomOrchestrationsPreference(value) {
    appState.customOrchestrations = normalizeCustomOrchestrations(value);
    renderCustomOrchestrations();
  }

  function resetCustomOrchestrationEditor({ focus = false } = {}) {
    setEditorValues(null);
    if (focus && orchestrationNameInput instanceof HTMLInputElement) {
      orchestrationNameInput.focus();
    }
  }

  function loadCustomOrchestrationIntoEditor(orchestrationId, { focus = true } = {}) {
    const normalizedId =
      typeof orchestrationId === 'string' && orchestrationId.trim() ? orchestrationId.trim() : '';
    if (!normalizedId) {
      resetCustomOrchestrationEditor({ focus });
      return null;
    }
    const record = getCustomOrchestrations().find((entry) => entry.id === normalizedId) || null;
    if (!record) {
      throw new Error('The selected orchestration could not be found.');
    }
    setEditorValues(record);
    if (focus && orchestrationNameInput instanceof HTMLInputElement) {
      orchestrationNameInput.focus();
    }
    clearCustomOrchestrationFeedback();
    return record;
  }

  function getEditorDraftValues() {
    const editingId =
      orchestrationEditorIdInput instanceof HTMLInputElement
        ? orchestrationEditorIdInput.value.trim()
        : '';
    const name =
      orchestrationNameInput instanceof HTMLInputElement
        ? orchestrationNameInput.value.trim()
        : '';
    const slashCommandName =
      orchestrationSlashCommandInput instanceof HTMLInputElement
        ? normalizeSlashCommandName(orchestrationSlashCommandInput.value)
        : '';
    const description =
      orchestrationDescriptionInput instanceof HTMLTextAreaElement ||
      orchestrationDescriptionInput instanceof HTMLInputElement
        ? orchestrationDescriptionInput.value.trim()
        : '';
    const definitionText =
      orchestrationDefinitionInput instanceof HTMLTextAreaElement
        ? orchestrationDefinitionInput.value.trim()
        : '';

    if (!name) {
      throw new Error('Enter a name for the orchestration.');
    }
    if (!slashCommandName) {
      throw new Error('Enter a slash command using letters, numbers, or hyphens.');
    }
    if (!definitionText) {
      throw new Error('Enter a JSON definition for the orchestration.');
    }

    let definition;
    try {
      definition = JSON.parse(definitionText);
    } catch {
      throw new Error('The orchestration definition must be valid JSON.');
    }

    const existingRecords = getCustomOrchestrations();
    const duplicateCommandRecord = existingRecords.find(
      (record) => record.slashCommandName === slashCommandName && record.id !== editingId
    );
    if (duplicateCommandRecord) {
      throw new Error(
        `${buildSlashCommandLabel(slashCommandName)} is already used by ${duplicateCommandRecord.name}.`
      );
    }

    const existingRecord = existingRecords.find((record) => record.id === editingId) || null;
    return assertValidCustomOrchestration({
      id: editingId || undefined,
      name,
      slashCommandName,
      description,
      definition,
      importedAt: existingRecord?.importedAt,
      updatedAt: Date.now(),
    });
  }

  async function saveCustomOrchestrationDraft({ persist = true } = {}) {
    const draftRecord = getEditorDraftValues();
    let savedRecord = draftRecord;
    if (persist && typeof saveCustomOrchestration === 'function') {
      savedRecord = await saveCustomOrchestration(draftRecord);
      if (!savedRecord) {
        throw new Error('Custom orchestration storage is unavailable in this browser session.');
      }
    }
    const nextCustomOrchestrations = normalizeCustomOrchestrations([
      ...getCustomOrchestrations().filter((record) => record.id !== savedRecord.id),
      savedRecord,
    ]);
    applyCustomOrchestrationsPreference(nextCustomOrchestrations);
    setEditorValues(savedRecord);
    clearCustomOrchestrationFeedback();
    return savedRecord;
  }

  async function removeCustomOrchestrationPreference(orchestrationId, { persist = true } = {}) {
    const normalizedId =
      typeof orchestrationId === 'string' && orchestrationId.trim() ? orchestrationId.trim() : '';
    if (!normalizedId) {
      return false;
    }
    if (persist && typeof removeCustomOrchestration === 'function') {
      const removed = await removeCustomOrchestration(normalizedId);
      if (!removed) {
        throw new Error('The selected orchestration could not be removed.');
      }
    }
    applyCustomOrchestrationsPreference(
      getCustomOrchestrations().filter((record) => record.id !== normalizedId)
    );
    if (
      orchestrationEditorIdInput instanceof HTMLInputElement &&
      orchestrationEditorIdInput.value.trim() === normalizedId
    ) {
      resetCustomOrchestrationEditor();
    }
    clearCustomOrchestrationFeedback();
    return true;
  }

  async function readFileText(file) {
    if (!file || typeof file !== 'object') {
      throw new Error('Choose a JSON file before importing.');
    }
    if (typeof file.text === 'function') {
      return file.text();
    }
    if (typeof file.arrayBuffer === 'function') {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (typeof globalThis.TextDecoder === 'function') {
        return new globalThis.TextDecoder('utf-8').decode(bytes);
      }
      return String.fromCharCode(...bytes);
    }
    throw new Error('The selected file could not be read.');
  }

  async function importCustomOrchestrationFile(file, { persist = true } = {}) {
    const importedRecords = parseCustomOrchestrationImportText(await readFileText(file));
    const existingRecords = getCustomOrchestrations();

    importedRecords.forEach((record) => {
      const duplicateRecord = existingRecords.find(
        (existingRecord) =>
          existingRecord.id === record.id ||
          existingRecord.slashCommandName === record.slashCommandName
      );
      if (duplicateRecord) {
        throw new Error(
          `${buildSlashCommandLabel(record.slashCommandName)} has already been added in this browser.`
        );
      }
    });

    let savedRecords = importedRecords;
    if (persist && typeof saveCustomOrchestration === 'function') {
      savedRecords = await Promise.all(
        importedRecords.map(async (record) => {
          const savedRecord = await saveCustomOrchestration(record);
          if (!savedRecord) {
            throw new Error('Custom orchestration storage is unavailable in this browser session.');
          }
          return savedRecord;
        })
      );
    }

    applyCustomOrchestrationsPreference([...existingRecords, ...savedRecords]);
    if (orchestrationImportInput instanceof HTMLInputElement) {
      orchestrationImportInput.value = '';
    }
    clearCustomOrchestrationFeedback();
    if (savedRecords.length === 1) {
      setEditorValues(savedRecords[0]);
    }
    return savedRecords;
  }

  function exportCustomOrchestration(orchestrationId) {
    const record = getCustomOrchestrations().find((entry) => entry.id === orchestrationId) || null;
    if (!record) {
      throw new Error('The selected orchestration could not be found.');
    }
    if (typeof downloadFile !== 'function') {
      throw new Error('File download is unavailable.');
    }
    const payload = buildCustomOrchestrationExportPayload(record);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    downloadFile(blob, buildCustomOrchestrationExportFileName(record));
    return record;
  }

  function exportAllCustomOrchestrations() {
    const customOrchestrations = getCustomOrchestrations();
    if (!customOrchestrations.length) {
      throw new Error('No custom orchestrations to export.');
    }
    if (typeof downloadFile !== 'function') {
      throw new Error('File download is unavailable.');
    }
    const payload = buildCustomOrchestrationCollectionExportPayload(customOrchestrations);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    downloadFile(blob, buildCustomOrchestrationCollectionExportFileName(new Date()));
    return customOrchestrations;
  }

  if (!Array.isArray(appState.customOrchestrations)) {
    appState.customOrchestrations = [];
  }
  setEditorValues(null);
  renderCustomOrchestrations();
  renderBuiltInOrchestrations();
  clearCustomOrchestrationFeedback();

  return {
    applyCustomOrchestrationsPreference,
    clearCustomOrchestrationFeedback,
    exportAllCustomOrchestrations,
    exportCustomOrchestration,
    importCustomOrchestrationFile,
    loadCustomOrchestrationIntoEditor,
    removeCustomOrchestrationPreference,
    resetCustomOrchestrationEditor,
    saveCustomOrchestrationDraft,
    setCustomOrchestrationFeedback,
  };
}
