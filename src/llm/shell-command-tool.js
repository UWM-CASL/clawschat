import { WORKSPACE_ROOT_PATH } from '../workspace/workspace-file-system.js';

const SHELL_FLAVOR = 'GNU/Linux-like shell subset';

const SHELL_COMMANDS = Object.freeze([
  {
    name: 'pwd',
    usage: 'pwd',
    description: 'Print the current working directory.',
  },
  {
    name: 'ls',
    usage: 'ls [-l] [<path>]',
    description: 'List files or directories under /workspace.',
  },
  {
    name: 'cat',
    usage: 'cat <file>',
    description: 'Read a text file.',
  },
  {
    name: 'head',
    usage: 'head -n <count> <file>',
    description: 'Show the first lines of a text file.',
  },
  {
    name: 'tail',
    usage: 'tail -n <count> <file>',
    description: 'Show the last lines of a text file.',
  },
  {
    name: 'wc',
    usage: 'wc [-l|-w|-c] <file>',
    description: 'Count lines, words, or bytes in a text file.',
  },
  {
    name: 'mkdir',
    usage: 'mkdir [-p] <directory>',
    description: 'Create directories under /workspace.',
  },
  {
    name: 'touch',
    usage: 'touch <file>',
    description: 'Create an empty file when it does not exist.',
  },
  {
    name: 'cp',
    usage: 'cp <source> <destination>',
    description: 'Copy one file within /workspace.',
  },
  {
    name: 'mv',
    usage: 'mv <source> <destination>',
    description: 'Move or rename one file within /workspace.',
  },
  {
    name: 'rm',
    usage: 'rm [-r] [-f] <path>',
    description: 'Delete a file or directory within /workspace.',
  },
  {
    name: 'echo',
    usage: 'echo <text>',
    description: 'Print text to stdout.',
  },
]);

function getTextEncoder() {
  return new globalThis.TextEncoder();
}

function createShellResult(command, { exitCode = 0, stdout = '', stderr = '' } = {}) {
  return {
    shellFlavor: SHELL_FLAVOR,
    currentWorkingDirectory: WORKSPACE_ROOT_PATH,
    command: typeof command === 'string' ? command : '',
    exitCode,
    stdout,
    stderr,
  };
}

function createShellError(command, commandName, message, exitCode = 1) {
  const prefix = typeof commandName === 'string' && commandName.trim() ? `${commandName}: ` : '';
  return createShellResult(command, {
    exitCode,
    stderr: `${prefix}${message}`,
  });
}

function toShellText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function countWords(text) {
  const normalized = toShellText(text).trim();
  return normalized ? normalized.split(/\s+/).length : 0;
}

function countLines(text) {
  const matches = toShellText(text).match(/\n/g);
  return matches ? matches.length : 0;
}

function basename(path) {
  const normalized = toShellText(path).replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) {
    return '';
  }
  const segments = normalized.split('/').filter(Boolean);
  return segments.length ? segments[segments.length - 1] : '';
}

function tokenizeShellCommand(command) {
  const text = toShellText(command).trim();
  const tokens = [];
  let current = '';
  let quote = '';
  let escaping = false;

  for (const character of text) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaping = true;
      continue;
    }
    if ((character === '"' || character === "'") && !quote) {
      quote = character;
      continue;
    }
    if (character === quote) {
      quote = '';
      continue;
    }
    if (!quote && /\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += character;
  }

  if (escaping || quote) {
    throw new Error('unterminated escape or quote.');
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function hasUnsupportedShellSyntax(command) {
  const text = toShellText(command);
  return /(^|[^\\])(?:\||&&|\|\||;|`|>|<)|[\r\n]/.test(text) || text.includes('$(');
}

function formatLsEntry(entry) {
  if (entry.kind === 'directory') {
    return `d ${entry.name}`;
  }
  const size = Number.isFinite(entry.size) ? entry.size : 0;
  return `- ${String(size).padStart(8, ' ')} ${entry.name}`;
}

async function safeStat(workspaceFileSystem, path) {
  try {
    return await workspaceFileSystem.stat(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (error?.name === 'NotFoundError' || /not found/i.test(message)) {
      return null;
    }
    throw error;
  }
}

function resolveWorkspacePath(workspaceFileSystem, rawPath) {
  return workspaceFileSystem.normalizePath(rawPath || WORKSPACE_ROOT_PATH);
}

async function resolveOutputPath(workspaceFileSystem, destinationPath, sourcePath) {
  const normalizedDestination = resolveWorkspacePath(workspaceFileSystem, destinationPath);
  const destinationStat = await safeStat(workspaceFileSystem, normalizedDestination);
  if (destinationStat?.kind === 'directory') {
    const sourceName = basename(sourcePath);
    return resolveWorkspacePath(workspaceFileSystem, `${normalizedDestination}/${sourceName}`);
  }
  return normalizedDestination;
}

function parseLineCountArguments(commandName, args) {
  if (!args.length) {
    return {
      count: 10,
      path: null,
    };
  }
  let count = 10;
  const remaining = [...args];
  if (remaining[0] === '-n') {
    if (remaining.length < 3) {
      throw new Error(`${commandName}: -n requires a count and a file path.`);
    }
    count = Number(remaining[1]);
    remaining.splice(0, 2);
  } else if (/^-n\d+$/.test(remaining[0])) {
    count = Number(remaining[0].slice(2));
    remaining.shift();
  }
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`${commandName}: line count must be a non-negative integer.`);
  }
  if (remaining.length !== 1) {
    throw new Error(`${commandName}: expected exactly one file path.`);
  }
  return {
    count,
    path: remaining[0],
  };
}

async function runPwd(commandText, args) {
  if (args.length) {
    return createShellError(commandText, 'pwd', 'this subset does not accept arguments.', 2);
  }
  return createShellResult(commandText, {
    stdout: WORKSPACE_ROOT_PATH,
  });
}

async function runEcho(commandText, args) {
  return createShellResult(commandText, {
    stdout: args.join(' '),
  });
}

async function runLs(commandText, args, workspaceFileSystem) {
  const paths = [];
  let longFormat = false;

  for (const argument of args) {
    if (argument === '--') {
      continue;
    }
    if (argument.startsWith('-') && argument !== '-') {
      for (const flag of argument.slice(1)) {
        if (flag === 'l') {
          longFormat = true;
          continue;
        }
        if (flag === 'a' || flag === '1') {
          continue;
        }
        return createShellError(commandText, 'ls', `unsupported option -${flag}.`, 2);
      }
      continue;
    }
    paths.push(argument);
  }

  const targetPaths = paths.length ? paths : [WORKSPACE_ROOT_PATH];
  const outputs = [];

  for (const rawPath of targetPaths) {
    let normalizedPath;
    try {
      normalizedPath = resolveWorkspacePath(workspaceFileSystem, rawPath);
    } catch (error) {
      return createShellError(commandText, 'ls', error instanceof Error ? error.message : String(error));
    }

    const stat = await safeStat(workspaceFileSystem, normalizedPath);
    if (!stat) {
      return createShellError(commandText, 'ls', `cannot access '${rawPath}': No such file or directory.`, 2);
    }

    let section = '';
    if (stat.kind === 'directory') {
      const entries = await workspaceFileSystem.listDirectory(normalizedPath);
      const lines = longFormat ? entries.map(formatLsEntry) : entries.map((entry) => entry.name);
      section = lines.join('\n');
    } else {
      section = longFormat ? formatLsEntry(stat) : basename(normalizedPath);
    }

    if (targetPaths.length > 1) {
      outputs.push(`${normalizedPath}:\n${section}`.trimEnd());
    } else {
      outputs.push(section);
    }
  }

  return createShellResult(commandText, {
    stdout: outputs.filter(Boolean).join('\n\n'),
  });
}

async function readWorkspaceTextFile(commandName, commandText, rawPath, workspaceFileSystem) {
  let normalizedPath;
  try {
    normalizedPath = resolveWorkspacePath(workspaceFileSystem, rawPath);
  } catch (error) {
    return {
      error: createShellError(
        commandText,
        commandName,
        error instanceof Error ? error.message : String(error)
      ),
    };
  }
  const stat = await safeStat(workspaceFileSystem, normalizedPath);
  if (!stat) {
    return {
      error: createShellError(
        commandText,
        commandName,
        `cannot open '${rawPath}': No such file or directory.`,
        1
      ),
    };
  }
  if (stat.kind !== 'file') {
    return {
      error: createShellError(commandText, commandName, `'${rawPath}' is not a file.`, 1),
    };
  }
  return {
    path: normalizedPath,
    text: await workspaceFileSystem.readTextFile(normalizedPath),
  };
}

async function runCat(commandText, args, workspaceFileSystem) {
  if (!args.length) {
    return createShellError(commandText, 'cat', 'expected at least one file path.', 2);
  }
  const chunks = [];
  for (const rawPath of args) {
    const fileResult = await readWorkspaceTextFile('cat', commandText, rawPath, workspaceFileSystem);
    if (fileResult.error) {
      return fileResult.error;
    }
    chunks.push(fileResult.text);
  }
  return createShellResult(commandText, {
    stdout: chunks.join(''),
  });
}

async function runHead(commandText, args, workspaceFileSystem) {
  let parsedArguments;
  try {
    parsedArguments = parseLineCountArguments('head', args);
  } catch (error) {
    return createShellError(commandText, 'head', error instanceof Error ? error.message : String(error), 2);
  }
  const fileResult = await readWorkspaceTextFile(
    'head',
    commandText,
    parsedArguments.path,
    workspaceFileSystem
  );
  if (fileResult.error) {
    return fileResult.error;
  }
  const lines = fileResult.text.split(/\r?\n/);
  return createShellResult(commandText, {
    stdout: lines.slice(0, parsedArguments.count).join('\n'),
  });
}

async function runTail(commandText, args, workspaceFileSystem) {
  let parsedArguments;
  try {
    parsedArguments = parseLineCountArguments('tail', args);
  } catch (error) {
    return createShellError(commandText, 'tail', error instanceof Error ? error.message : String(error), 2);
  }
  const fileResult = await readWorkspaceTextFile(
    'tail',
    commandText,
    parsedArguments.path,
    workspaceFileSystem
  );
  if (fileResult.error) {
    return fileResult.error;
  }
  const lines = fileResult.text.split(/\r?\n/);
  return createShellResult(commandText, {
    stdout: lines.slice(Math.max(0, lines.length - parsedArguments.count)).join('\n'),
  });
}

async function runWc(commandText, args, workspaceFileSystem) {
  if (!args.length) {
    return createShellError(commandText, 'wc', 'expected one file path.', 2);
  }

  let mode = 'all';
  const remaining = [...args];
  if (remaining[0]?.startsWith('-')) {
    mode = remaining.shift();
  }
  if (remaining.length !== 1) {
    return createShellError(commandText, 'wc', 'expected one file path.', 2);
  }

  const fileResult = await readWorkspaceTextFile('wc', commandText, remaining[0], workspaceFileSystem);
  if (fileResult.error) {
    return fileResult.error;
  }

  const lineCount = countLines(fileResult.text);
  const wordCount = countWords(fileResult.text);
  const byteCount = getTextEncoder().encode(fileResult.text).byteLength;
  let stdout = '';

  if (mode === '-l') {
    stdout = `${lineCount} ${fileResult.path}`;
  } else if (mode === '-w') {
    stdout = `${wordCount} ${fileResult.path}`;
  } else if (mode === '-c') {
    stdout = `${byteCount} ${fileResult.path}`;
  } else if (mode === 'all') {
    stdout = `${lineCount} ${wordCount} ${byteCount} ${fileResult.path}`;
  } else {
    return createShellError(commandText, 'wc', `unsupported option ${mode}.`, 2);
  }

  return createShellResult(commandText, { stdout });
}

async function runMkdir(commandText, args, workspaceFileSystem) {
  if (!args.length) {
    return createShellError(commandText, 'mkdir', 'expected at least one directory path.', 2);
  }
  const directoryArgs = [];
  for (const argument of args) {
    if (argument === '-p') {
      continue;
    }
    if (argument.startsWith('-') && argument !== '-') {
      return createShellError(commandText, 'mkdir', `unsupported option ${argument}.`, 2);
    }
    directoryArgs.push(argument);
  }
  if (!directoryArgs.length) {
    return createShellError(commandText, 'mkdir', 'expected at least one directory path.', 2);
  }
  for (const rawPath of directoryArgs) {
    try {
      await workspaceFileSystem.ensureDirectory(rawPath);
    } catch (error) {
      return createShellError(commandText, 'mkdir', error instanceof Error ? error.message : String(error));
    }
  }
  return createShellResult(commandText);
}

async function runTouch(commandText, args, workspaceFileSystem) {
  if (!args.length) {
    return createShellError(commandText, 'touch', 'expected at least one file path.', 2);
  }
  for (const rawPath of args) {
    let normalizedPath;
    try {
      normalizedPath = resolveWorkspacePath(workspaceFileSystem, rawPath);
    } catch (error) {
      return createShellError(commandText, 'touch', error instanceof Error ? error.message : String(error));
    }
    const stat = await safeStat(workspaceFileSystem, normalizedPath);
    if (stat?.kind === 'directory') {
      return createShellError(commandText, 'touch', `'${rawPath}' is a directory.`, 1);
    }
    if (!stat) {
      await workspaceFileSystem.writeTextFile(normalizedPath, '');
    }
  }
  return createShellResult(commandText);
}

async function runCp(commandText, args, workspaceFileSystem) {
  if (args.length !== 2) {
    return createShellError(commandText, 'cp', 'expected a source path and a destination path.', 2);
  }
  let sourcePath;
  try {
    sourcePath = resolveWorkspacePath(workspaceFileSystem, args[0]);
  } catch (error) {
    return createShellError(commandText, 'cp', error instanceof Error ? error.message : String(error));
  }
  const sourceStat = await safeStat(workspaceFileSystem, sourcePath);
  if (!sourceStat) {
    return createShellError(commandText, 'cp', `cannot stat '${args[0]}': No such file or directory.`, 1);
  }
  if (sourceStat.kind !== 'file') {
    return createShellError(commandText, 'cp', 'only file copies are supported in this subset.', 1);
  }
  const destinationPath = await resolveOutputPath(workspaceFileSystem, args[1], sourcePath);
  const data = await workspaceFileSystem.readFile(sourcePath);
  await workspaceFileSystem.writeFile(destinationPath, data);
  return createShellResult(commandText, {
    stdout: destinationPath,
  });
}

async function runMv(commandText, args, workspaceFileSystem) {
  if (args.length !== 2) {
    return createShellError(commandText, 'mv', 'expected a source path and a destination path.', 2);
  }
  let sourcePath;
  try {
    sourcePath = resolveWorkspacePath(workspaceFileSystem, args[0]);
  } catch (error) {
    return createShellError(commandText, 'mv', error instanceof Error ? error.message : String(error));
  }
  const sourceStat = await safeStat(workspaceFileSystem, sourcePath);
  if (!sourceStat) {
    return createShellError(commandText, 'mv', `cannot stat '${args[0]}': No such file or directory.`, 1);
  }
  if (sourceStat.kind !== 'file') {
    return createShellError(commandText, 'mv', 'only file moves are supported in this subset.', 1);
  }
  const destinationPath = await resolveOutputPath(workspaceFileSystem, args[1], sourcePath);
  const data = await workspaceFileSystem.readFile(sourcePath);
  await workspaceFileSystem.writeFile(destinationPath, data);
  await workspaceFileSystem.deletePath(sourcePath);
  return createShellResult(commandText, {
    stdout: destinationPath,
  });
}

async function runRm(commandText, args, workspaceFileSystem) {
  if (!args.length) {
    return createShellError(commandText, 'rm', 'expected at least one path.', 2);
  }
  let recursive = false;
  let force = false;
  const paths = [];
  for (const argument of args) {
    if (argument.startsWith('-') && argument !== '-') {
      for (const flag of argument.slice(1)) {
        if (flag === 'r' || flag === 'R') {
          recursive = true;
          continue;
        }
        if (flag === 'f') {
          force = true;
          continue;
        }
        return createShellError(commandText, 'rm', `unsupported option -${flag}.`, 2);
      }
      continue;
    }
    paths.push(argument);
  }
  if (!paths.length) {
    return createShellError(commandText, 'rm', 'expected at least one path.', 2);
  }
  for (const rawPath of paths) {
    let normalizedPath;
    try {
      normalizedPath = resolveWorkspacePath(workspaceFileSystem, rawPath);
    } catch (error) {
      return createShellError(commandText, 'rm', error instanceof Error ? error.message : String(error));
    }
    const stat = await safeStat(workspaceFileSystem, normalizedPath);
    if (!stat) {
      if (force) {
        continue;
      }
      return createShellError(commandText, 'rm', `cannot remove '${rawPath}': No such file or directory.`, 1);
    }
    if (stat.kind === 'directory' && !recursive) {
      return createShellError(commandText, 'rm', `cannot remove '${rawPath}': Is a directory.`, 1);
    }
    await workspaceFileSystem.deletePath(normalizedPath, { recursive });
  }
  return createShellResult(commandText);
}

function buildShellCommandUsageResult() {
  return {
    shellFlavor: SHELL_FLAVOR,
    currentWorkingDirectory: WORKSPACE_ROOT_PATH,
    supportedCommands: SHELL_COMMANDS,
    examples: [
      'ls /workspace/<directory>',
      'cat /workspace/<file>',
      'head -n 20 /workspace/<file>',
      'mkdir -p /workspace/<directory>',
      'cp /workspace/<source-file> /workspace/<destination-file>',
    ],
    limitations: [
      'Only one command runs per tool call.',
      'Commands are GNU/Linux-like, but only the documented subset is implemented.',
      'Relative paths resolve from /workspace.',
      'Pipes, redirection, globbing, environment variables, and command substitution are not supported.',
      'Unsupported commands or syntax return stderr text and a non-zero exit code.',
    ],
    placeholders: [
      '<directory> means a directory path under /workspace.',
      '<file> means a file path under /workspace.',
      '<source-file> and <destination-file> are placeholder file paths under /workspace.',
    ],
  };
}

function getValidatedShellToolArguments(argumentsValue = {}) {
  if (argumentsValue === undefined) {
    return {};
  }
  if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) {
    throw new Error('run_shell_command arguments must be an object.');
  }
  const shellArguments = /** @type {{command?: unknown}} */ (argumentsValue);
  const supportedKeys = new Set(['command']);
  const unexpectedKeys = Object.keys(argumentsValue).filter((key) => !supportedKeys.has(key));
  if (unexpectedKeys.length) {
    throw new Error(`run_shell_command does not accept: ${unexpectedKeys.join(', ')}.`);
  }
  if (shellArguments.command === undefined) {
    return {};
  }
  if (typeof shellArguments.command !== 'string' || !shellArguments.command.trim()) {
    throw new Error('run_shell_command command must be a non-empty string.');
  }
  return {
    command: shellArguments.command.trim(),
  };
}

export async function executeShellCommandTool(argumentsValue = {}, runtimeContext = {}) {
  const normalizedArguments = /** @type {{command?: string}} */ (
    getValidatedShellToolArguments(argumentsValue)
  );
  if (!normalizedArguments.command) {
    return buildShellCommandUsageResult();
  }

  const commandText = normalizedArguments.command;
  const workspaceFileSystem = runtimeContext?.workspaceFileSystem;
  if (!workspaceFileSystem) {
    return createShellError(
      commandText,
      'shell',
      'workspace filesystem is unavailable in this browser session.',
      1
    );
  }

  if (hasUnsupportedShellSyntax(commandText)) {
    return createShellError(
      commandText,
      'shell',
      'pipelines, redirection, command chaining, and substitutions are not supported in this subset.',
      2
    );
  }

  let tokens;
  try {
    tokens = tokenizeShellCommand(commandText);
  } catch (error) {
    return createShellError(commandText, 'shell', error instanceof Error ? error.message : String(error), 2);
  }
  if (!tokens.length) {
    return createShellError(commandText, 'shell', 'command is empty.', 2);
  }

  const [commandName, ...args] = tokens;
  if (commandName === 'pwd') {
    return runPwd(commandText, args);
  }
  if (commandName === 'echo') {
    return runEcho(commandText, args);
  }
  if (commandName === 'ls') {
    return runLs(commandText, args, workspaceFileSystem);
  }
  if (commandName === 'cat') {
    return runCat(commandText, args, workspaceFileSystem);
  }
  if (commandName === 'head') {
    return runHead(commandText, args, workspaceFileSystem);
  }
  if (commandName === 'tail') {
    return runTail(commandText, args, workspaceFileSystem);
  }
  if (commandName === 'wc') {
    return runWc(commandText, args, workspaceFileSystem);
  }
  if (commandName === 'mkdir') {
    return runMkdir(commandText, args, workspaceFileSystem);
  }
  if (commandName === 'touch') {
    return runTouch(commandText, args, workspaceFileSystem);
  }
  if (commandName === 'cp') {
    return runCp(commandText, args, workspaceFileSystem);
  }
  if (commandName === 'mv') {
    return runMv(commandText, args, workspaceFileSystem);
  }
  if (commandName === 'rm') {
    return runRm(commandText, args, workspaceFileSystem);
  }

  return createShellError(
    commandText,
    'shell',
    `command '${commandName}' is not available. Call run_shell_command with {} to inspect the supported subset.`,
    127
  );
}
