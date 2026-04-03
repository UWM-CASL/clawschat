import { loadPyodide } from 'pyodide';

const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/';
let pyodide = null;
let activeStdoutLines = null;
let activeStderrLines = null;

async function ensurePyodide() {
  if (pyodide) {
    return pyodide;
  }
  pyodide = await loadPyodide({
    fullStdLib: false,
    indexURL: PYODIDE_INDEX_URL,
    stdout: (output) => {
      if (Array.isArray(activeStdoutLines)) {
        activeStdoutLines.push(String(output || ''));
      }
    },
    stderr: (output) => {
      if (Array.isArray(activeStderrLines)) {
        activeStderrLines.push(String(output || ''));
      }
    },
  });
  return pyodide;
}

function resetWorkspaceDirectory(pyodideInstance) {
  const { FS } = pyodideInstance;
  try {
    FS.rmdir('/workspace');
  } catch {
    // Ignore reset errors; the recursive cleanup below handles populated trees.
  }
  removeTree(FS, '/workspace');
  try {
    FS.mkdirTree('/workspace');
  } catch {
    // Directory may already exist after cleanup.
  }
}

function removeTree(FS, path) {
  let stat;
  try {
    stat = FS.stat(path);
  } catch {
    return;
  }
  if (FS.isDir(stat.mode)) {
    const names = FS.readdir(path).filter((name) => name !== '.' && name !== '..');
    names.forEach((name) => {
      removeTree(FS, path === '/' ? `/${name}` : `${path}/${name}`);
    });
    if (path !== '/workspace') {
      try {
        FS.rmdir(path);
      } catch {
        // Ignore cleanup errors for nested paths.
      }
    }
    return;
  }
  try {
    FS.unlink(path);
  } catch {
    // Ignore cleanup errors for nested files.
  }
}

function ensureParentDirectories(FS, filePath) {
  const segments = String(filePath || '')
    .split('/')
    .filter(Boolean);
  let currentPath = '';
  for (const segment of segments.slice(0, -1)) {
    currentPath = `${currentPath}/${segment}`;
    try {
      FS.mkdir(currentPath);
    } catch {
      // Directory may already exist.
    }
  }
}

function writeWorkspaceFiles(pyodideInstance, workspaceFiles = []) {
  const { FS } = pyodideInstance;
  resetWorkspaceDirectory(pyodideInstance);
  for (const file of workspaceFiles) {
    if (!file?.path) {
      continue;
    }
    ensureParentDirectories(FS, file.path);
    FS.writeFile(
      file.path,
      file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes || []),
      {
        encoding: 'binary',
      }
    );
  }
}

function readWorkspaceFiles(pyodideInstance) {
  const { FS } = pyodideInstance;
  const collectedFiles = [];

  function walk(path) {
    const stat = FS.stat(path);
    if (FS.isDir(stat.mode)) {
      FS.readdir(path)
        .filter((name) => name !== '.' && name !== '..')
        .forEach((name) => {
          walk(`${path}/${name}`);
        });
      return;
    }
    collectedFiles.push({
      path,
      bytes: FS.readFile(path, { encoding: 'binary' }),
    });
  }

  walk('/workspace');
  return collectedFiles;
}

async function runPythonCommand(pyodideInstance, payload) {
  const stdoutLines = [];
  const stderrLines = [];
  activeStdoutLines = stdoutLines;
  activeStderrLines = stderrLines;

  const globals = pyodideInstance.toPy({
    argv: Array.isArray(payload?.argv) ? payload.argv : [],
    code: typeof payload?.code === 'string' ? payload.code : '',
    current_working_directory:
      typeof payload?.currentWorkingDirectory === 'string' && payload.currentWorkingDirectory
        ? payload.currentWorkingDirectory
        : '/workspace',
    mode: payload?.mode === 'code' ? 'code' : 'file',
    path: typeof payload?.path === 'string' ? payload.path : '',
  });

  let exitCode = 0;
  try {
    exitCode = await pyodideInstance.runPythonAsync(
      `
import os
import sys
import traceback

argv = list(argv)
mode = str(mode)
path = str(path)
code = str(code)
os.chdir(str(current_working_directory))
sys.argv = argv
namespace = {"__name__": "__main__"}
if mode == "file":
    namespace["__file__"] = path

exit_code = 0
try:
    if mode == "code":
        exec(compile(code, "<string>", "exec"), namespace, namespace)
    else:
        with open(path, "r", encoding="utf-8") as handle:
            source = handle.read()
        exec(compile(source, path, "exec"), namespace, namespace)
except SystemExit as exc:
    code = exc.code
    if isinstance(code, int):
        exit_code = code
    elif code in (None, False):
        exit_code = 0
    else:
        print(code, file=sys.stderr)
        exit_code = 1
except Exception:
    traceback.print_exc()
    exit_code = 1

exit_code
      `,
      { globals }
    );
  } finally {
    activeStdoutLines = null;
    activeStderrLines = null;
    globals.destroy();
  }

  return {
    exitCode: Number.isFinite(exitCode) ? Number(exitCode) : 1,
    stderr: stderrLines.join(''),
    stdout: stdoutLines.join(''),
    workspaceFiles: readWorkspaceFiles(pyodideInstance),
  };
}

self.addEventListener('message', async (event) => {
  const data = event.data || {};
  const requestId = typeof data.requestId === 'string' ? data.requestId : '';
  if (!requestId) {
    return;
  }
  try {
    if (data.type === 'init') {
      await ensurePyodide();
      self.postMessage({
        requestId,
        type: 'success',
        payload: {
          ready: true,
        },
      });
      return;
    }
    if (data.type !== 'execute') {
      throw new Error(`Unsupported python worker message: ${data.type}`);
    }
    const pyodideInstance = await ensurePyodide();
    writeWorkspaceFiles(pyodideInstance, data.payload?.workspaceFiles || []);
    const result = await runPythonCommand(pyodideInstance, data.payload || {});
    const transferList = result.workspaceFiles.map((file) => file.bytes.buffer);
    self.postMessage(
      {
        requestId,
        type: 'success',
        payload: result,
      },
      transferList
    );
  } catch (error) {
    self.postMessage({
      requestId,
      type: 'error',
      payload: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});
