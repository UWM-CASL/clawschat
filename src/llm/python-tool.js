import { normalizeWorkspacePath } from '../workspace/workspace-file-system.js';

const MAX_PYTHON_SOURCE_LENGTH = 120_000;
const MAX_TERMINAL_PREVIEW_LINES = 8;
const MAX_TERMINAL_PREVIEW_CHARACTERS = 800;

function countSourceLines(source) {
  if (!source) {
    return 0;
  }
  return String(source).split(/\r\n|\r|\n/).length;
}

function buildPythonPreview(source) {
  const normalized = String(source || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  if (!normalized) {
    return '';
  }
  const lines = normalized.split('\n');
  const visibleLines = lines.slice(0, MAX_TERMINAL_PREVIEW_LINES);
  let preview = visibleLines.join('\n');
  const truncatedByLineCount = lines.length > MAX_TERMINAL_PREVIEW_LINES;
  const truncatedByCharacterCount = preview.length > MAX_TERMINAL_PREVIEW_CHARACTERS;
  if (truncatedByCharacterCount) {
    preview = `${preview.slice(0, MAX_TERMINAL_PREVIEW_CHARACTERS).trimEnd()}\n...`;
  } else if (truncatedByLineCount) {
    preview = `${preview}\n...`;
  }
  return preview;
}

function validatePythonFilePath(pathValue) {
  const normalizedPath = normalizeWorkspacePath(pathValue);
  if (!normalizedPath.endsWith('.py')) {
    throw new Error('write_python_file path must end in .py under /workspace.');
  }
  return normalizedPath;
}

function validatePythonSource(sourceValue) {
  if (typeof sourceValue !== 'string') {
    throw new Error('write_python_file source must be a string.');
  }
  if (!sourceValue.trim()) {
    throw new Error('write_python_file source must not be empty.');
  }
  if (sourceValue.length > MAX_PYTHON_SOURCE_LENGTH) {
    throw new Error(
      `write_python_file source must be ${MAX_PYTHON_SOURCE_LENGTH} characters or fewer.`
    );
  }
  return sourceValue;
}

function getParentDirectoryPath(path) {
  const segments = String(path || '')
    .split('/')
    .filter(Boolean);
  if (segments.length <= 1) {
    return '/workspace';
  }
  return `/${segments.slice(0, -1).join('/')}`;
}

export async function executeWritePythonFileTool(argumentsValue = {}, runtimeContext = {}) {
  if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) {
    throw new Error('write_python_file arguments must be an object.');
  }
  const pythonArguments = /** @type {{ path?: unknown; source?: unknown }} */ (argumentsValue);
  const supportedKeys = new Set(['path', 'source']);
  const unexpectedKeys = Object.keys(argumentsValue).filter((key) => !supportedKeys.has(key));
  if (unexpectedKeys.length) {
    throw new Error(`write_python_file does not accept: ${unexpectedKeys.join(', ')}.`);
  }

  const normalizedPath = validatePythonFilePath(pythonArguments.path);
  const source = validatePythonSource(pythonArguments.source);
  const workspaceFileSystem = runtimeContext?.workspaceFileSystem;
  if (!workspaceFileSystem) {
    throw new Error('Workspace filesystem is unavailable in this browser session.');
  }

  const parentDirectoryPath = getParentDirectoryPath(normalizedPath);
  await workspaceFileSystem.ensureDirectory(parentDirectoryPath);
  await workspaceFileSystem.writeTextFile(normalizedPath, source);

  const result = {
    path: normalizedPath,
    bytes: new globalThis.TextEncoder().encode(source).byteLength,
    lines: countSourceLines(source),
    preview: buildPythonPreview(source),
    message: `Python file written to ${normalizedPath}.`,
  };

  if (typeof runtimeContext?.onPythonFileWrite === 'function') {
    runtimeContext.onPythonFileWrite({
      path: normalizedPath,
      preview: result.preview,
      bytes: result.bytes,
      lines: result.lines,
      currentWorkingDirectory: parentDirectoryPath,
    });
  }

  return result;
}
