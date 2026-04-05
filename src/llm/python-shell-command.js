import { normalizeWorkspacePath } from '../workspace/workspace-file-system.js';

const MAX_PYTHON_CODE_ARGUMENT_LENGTH = 8_000;

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
