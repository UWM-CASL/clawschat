import { normalizeWorkspacePath } from '../workspace/workspace-file-system.js';

const MAX_PYTHON_SOURCE_LENGTH = 120_000;
const MAX_PYTHON_CODE_ARGUMENT_LENGTH = 8_000;
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

function createShellErrorResult(command, currentWorkingDirectory, stderr, exitCode = 1) {
  return {
    shellFlavor: 'GNU/Linux-like shell subset',
    command,
    currentWorkingDirectory,
    stdout: '',
    stderr,
    exitCode,
  };
}

export async function executePythonShellCommand(
  commandText,
  args,
  workspaceFileSystem,
  runtimeContext,
  currentWorkingDirectory
) {
  if (!Array.isArray(args) || !args.length) {
    return createShellErrorResult(
      commandText,
      currentWorkingDirectory,
      'python: interactive mode is not supported in this shell subset.',
      2
    );
  }

  const pythonExecutor =
    runtimeContext?.pythonExecutor && typeof runtimeContext.pythonExecutor.execute === 'function'
      ? runtimeContext.pythonExecutor
      : null;
  if (!pythonExecutor) {
    return createShellErrorResult(
      commandText,
      currentWorkingDirectory,
      'python: runtime is unavailable in this browser session.',
      1
    );
  }

  if (args[0] === '-c') {
    if (args.length < 2) {
      return createShellErrorResult(
        commandText,
        currentWorkingDirectory,
        'python: option -c requires a code string.',
        2
      );
    }
    const code = String(args[1] || '');
    if (!code.trim()) {
      return createShellErrorResult(
        commandText,
        currentWorkingDirectory,
        'python: option -c requires a non-empty code string.',
        2
      );
    }
    if (code.length > MAX_PYTHON_CODE_ARGUMENT_LENGTH) {
      return createShellErrorResult(
        commandText,
        currentWorkingDirectory,
        `python: -c code must be ${MAX_PYTHON_CODE_ARGUMENT_LENGTH} characters or fewer. Use write_python_file for larger scripts.`,
        2
      );
    }
    return pythonExecutor.execute({
      argv: ['python', '-c', code, ...args.slice(2)],
      code,
      currentWorkingDirectory,
      mode: 'code',
      workspaceFileSystem,
    });
  }

  if (args[0].startsWith('-')) {
    return createShellErrorResult(
      commandText,
      currentWorkingDirectory,
      `python: unsupported option '${args[0]}'.`,
      2
    );
  }

  let scriptPath;
  try {
    scriptPath = workspaceFileSystem.normalizePath
      ? workspaceFileSystem.normalizePath(args[0])
      : normalizeWorkspacePath(args[0]);
  } catch (error) {
    return createShellErrorResult(
      commandText,
      currentWorkingDirectory,
      `python: ${error instanceof Error ? error.message : String(error)}`,
      1
    );
  }

  try {
    const stat = await workspaceFileSystem.stat(scriptPath);
    if (stat?.kind !== 'file') {
      return createShellErrorResult(
        commandText,
        currentWorkingDirectory,
        `python: '${args[0]}' is not a file.`,
        1
      );
    }
  } catch {
    return createShellErrorResult(
      commandText,
      currentWorkingDirectory,
      `python: can't open file '${args[0]}': No such file or directory.`,
      1
    );
  }

  return pythonExecutor.execute({
    argv: ['python', scriptPath, ...args.slice(1)],
    currentWorkingDirectory,
    mode: 'file',
    path: scriptPath,
    workspaceFileSystem,
  });
}
