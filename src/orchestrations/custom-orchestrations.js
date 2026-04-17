import { validateOrchestrationDefinition } from '../llm/orchestration-runner.js';

export const CUSTOM_ORCHESTRATION_FORMAT = 'browser-llm-runner.custom-orchestration';
export const CUSTOM_ORCHESTRATION_COLLECTION_FORMAT =
  'browser-llm-runner.custom-orchestration-collection';
export const CUSTOM_ORCHESTRATION_SCHEMA_VERSION = 1;
export const RESERVED_SLASH_COMMAND_NAMES = new Set(['picard']);

const MAX_ORCHESTRATION_NAME_LENGTH = 80;
const MAX_ORCHESTRATION_DESCRIPTION_LENGTH = 240;

function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clipText(value, maxLength) {
  const normalized = normalizeWhitespace(value);
  if (!normalized || normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

function createValidationError(message) {
  return new Error(String(message || 'Invalid orchestration.'));
}

function humanizeCommandName(commandName) {
  const normalized = normalizeSlashCommandName(commandName);
  if (!normalized) {
    return 'Custom Orchestration';
  }
  return normalized
    .split('-')
    .filter(Boolean)
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(' ');
}

function cloneJsonValue(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw createValidationError('The orchestration definition must be valid JSON data.');
  }
}

function normalizeDefinitionObject(value) {
  const cloned = cloneJsonValue(value);
  if (!cloned || typeof cloned !== 'object' || Array.isArray(cloned)) {
    throw createValidationError('The orchestration definition must be a JSON object.');
  }
  return cloned;
}

function createOrchestrationId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `orchestration-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeImportedTimestamp(value, fallbackValue) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallbackValue;
}

function normalizeRootDescription(value, fallbackValue = '') {
  return (
    clipText(value, MAX_ORCHESTRATION_DESCRIPTION_LENGTH) ||
    clipText(fallbackValue, MAX_ORCHESTRATION_DESCRIPTION_LENGTH)
  );
}

function normalizeRecordInternal(value, { fallbackTimestamp = Date.now() } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createValidationError('Imported orchestration data must be a JSON object.');
  }

  const slashCommandName = normalizeSlashCommandName(
    value.slashCommandName || value.slashCommand || value.command
  );
  if (!slashCommandName) {
    throw createValidationError(
      'Each orchestration must define a slash command using letters, numbers, or hyphens.'
    );
  }
  if (RESERVED_SLASH_COMMAND_NAMES.has(slashCommandName)) {
    throw createValidationError(`/${slashCommandName} is reserved by the app.`);
  }

  const definitionSource =
    value.definition && typeof value.definition === 'object' && !Array.isArray(value.definition)
      ? value.definition
      : value.orchestration && typeof value.orchestration === 'object' && !Array.isArray(value.orchestration)
        ? value.orchestration
        : null;
  if (!definitionSource) {
    throw createValidationError('Each orchestration must include a JSON definition object.');
  }

  const definition = normalizeDefinitionObject(definitionSource);
  const normalizedId =
    normalizeWhitespace(value.id) ||
    normalizeWhitespace(definition.id) ||
    createOrchestrationId();
  definition.id = normalizeWhitespace(definition.id) || normalizedId;
  definition.description =
    normalizeRootDescription(definition.description, value.description) || undefined;

  validateOrchestrationDefinition(definition);

  const name =
    clipText(value.name, MAX_ORCHESTRATION_NAME_LENGTH) ||
    clipText(humanizeCommandName(slashCommandName), MAX_ORCHESTRATION_NAME_LENGTH);

  return {
    id: normalizedId,
    name,
    slashCommandName,
    description: normalizeRootDescription(value.description, definition.description),
    definition,
    importedAt: normalizeImportedTimestamp(value.importedAt, fallbackTimestamp),
    updatedAt: normalizeImportedTimestamp(value.updatedAt, fallbackTimestamp),
  };
}

export function normalizeSlashCommandName(value) {
  return String(value ?? '')
    .trim()
    .replace(/^\/+/, '')
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildSlashCommandLabel(commandName) {
  const normalized = normalizeSlashCommandName(commandName);
  return normalized ? `/${normalized}` : '/';
}

export function formatOrchestrationDefinition(definition) {
  return JSON.stringify(definition || {}, null, 2);
}

export function buildCustomOrchestrationTemplate({
  name = '',
  slashCommandName = '',
  description = '',
} = {}) {
  const normalizedCommandName = normalizeSlashCommandName(slashCommandName) || 'custom-workflow';
  const normalizedName = clipText(name, MAX_ORCHESTRATION_NAME_LENGTH) || humanizeCommandName(normalizedCommandName);
  const normalizedDescription =
    clipText(description, MAX_ORCHESTRATION_DESCRIPTION_LENGTH) ||
    `Run the ${buildSlashCommandLabel(normalizedCommandName)} workflow on the user's input.`;
  return {
    id: normalizedCommandName,
    description: normalizedDescription,
    steps: [
      {
        stepName: `Run ${normalizedName}`,
        prompt: `You are running the ${buildSlashCommandLabel(
          normalizedCommandName
        )} orchestration.\nUse the user input below.\n\nUser input:\n{{userInput}}`,
        responseFormat: {
          type: 'plain_text',
          instructions: 'Return plain text only.',
        },
        outputProcessing: {
          stripThinking: true,
        },
      },
    ],
  };
}

export function normalizeCustomOrchestration(value) {
  try {
    return normalizeRecordInternal(value);
  } catch {
    return null;
  }
}

export function assertValidCustomOrchestration(value) {
  return normalizeRecordInternal(value);
}

export function normalizeCustomOrchestrations(value) {
  return Array.isArray(value)
    ? value
        .map((record) => normalizeCustomOrchestration(record))
        .filter(Boolean)
        .sort((left, right) => right.updatedAt - left.updatedAt)
    : [];
}

export function findCustomOrchestrationBySlashCommand(customOrchestrations = [], commandName = '') {
  const normalizedCommandName = normalizeSlashCommandName(commandName);
  if (!normalizedCommandName) {
    return null;
  }
  return (
    normalizeCustomOrchestrations(customOrchestrations).find(
      (record) => record.slashCommandName === normalizedCommandName
    ) || null
  );
}

export function matchCustomOrchestrationSlashCommand(rawValue, customOrchestrations = []) {
  const normalizedValue = typeof rawValue === 'string' ? rawValue.trim() : '';
  const match = normalizedValue.match(/^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/);
  if (!match) {
    return null;
  }
  const commandName = normalizeSlashCommandName(match[1]);
  const orchestration = findCustomOrchestrationBySlashCommand(customOrchestrations, commandName);
  if (!orchestration) {
    return null;
  }
  return {
    orchestration,
    commandName,
    slashCommand: buildSlashCommandLabel(commandName),
    commandText: normalizedValue,
    userInput: typeof match[2] === 'string' ? match[2].trim() : '',
  };
}

export function buildCustomOrchestrationExportPayload(orchestration, { exportedAt = null } = {}) {
  const normalizedOrchestration = assertValidCustomOrchestration(orchestration);
  return {
    format: CUSTOM_ORCHESTRATION_FORMAT,
    schemaVersion: CUSTOM_ORCHESTRATION_SCHEMA_VERSION,
    exportedAt: exportedAt || new Date().toISOString(),
    orchestration: {
      ...normalizedOrchestration,
      definition: normalizeDefinitionObject(normalizedOrchestration.definition),
    },
  };
}

export function buildCustomOrchestrationCollectionExportPayload(
  customOrchestrations,
  { exportedAt = null } = {}
) {
  const normalizedOrchestrations = normalizeCustomOrchestrations(customOrchestrations);
  return {
    format: CUSTOM_ORCHESTRATION_COLLECTION_FORMAT,
    schemaVersion: CUSTOM_ORCHESTRATION_SCHEMA_VERSION,
    exportedAt: exportedAt || new Date().toISOString(),
    orchestrations: normalizedOrchestrations.map((record) => ({
      ...record,
      definition: normalizeDefinitionObject(record.definition),
    })),
  };
}

function buildTimestampLabel(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}`;
}

export function buildCustomOrchestrationExportFileName(orchestration) {
  const normalizedOrchestration = assertValidCustomOrchestration(orchestration);
  return `browser-llm-runner-orchestration-${normalizedOrchestration.slashCommandName}.json`;
}

export function buildCustomOrchestrationCollectionExportFileName(dateValue = new Date()) {
  return `browser-llm-runner-orchestrations-${buildTimestampLabel(dateValue)}.json`;
}

export function parseCustomOrchestrationImportText(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text || ''));
  } catch {
    throw createValidationError('The selected file is not valid JSON.');
  }

  let importedRecords = [];
  if (parsed?.format === CUSTOM_ORCHESTRATION_FORMAT && parsed?.orchestration) {
    importedRecords = [parsed.orchestration];
  } else if (
    parsed?.format === CUSTOM_ORCHESTRATION_COLLECTION_FORMAT &&
    Array.isArray(parsed?.orchestrations)
  ) {
    importedRecords = parsed.orchestrations;
  } else if (Array.isArray(parsed?.orchestrations)) {
    importedRecords = parsed.orchestrations;
  } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    importedRecords = [parsed];
  }

  if (!importedRecords.length) {
    throw createValidationError('No orchestrations were found in the selected file.');
  }

  const normalizedRecords = importedRecords.map((record) => assertValidCustomOrchestration(record));
  const commandNames = new Set();
  normalizedRecords.forEach((record) => {
    if (commandNames.has(record.slashCommandName)) {
      throw createValidationError(
        `The import file defines /${record.slashCommandName} more than once.`
      );
    }
    commandNames.add(record.slashCommandName);
  });
  return normalizedRecords;
}
