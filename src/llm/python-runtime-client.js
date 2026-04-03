export class PythonRuntimeClient {
  constructor() {
    this.worker = null;
    this.pendingRequests = new Map();
    this.pendingInit = null;
  }

  async initialize() {
    if (this.pendingInit) {
      return this.pendingInit;
    }
    this.#ensureWorker();
    this.pendingInit = this.#sendAndWait('init', {});
    try {
      return await this.pendingInit;
    } finally {
      this.pendingInit = null;
    }
  }

  /**
   * @param {{
   *   argv?: string[];
   *   code?: string;
   *   currentWorkingDirectory?: string;
   *   mode?: string;
   *   path?: string;
   *   workspaceFileSystem?: {
   *     normalizePath: (path: string) => string;
   *     listDirectory: (path: string) => Promise<Array<{ path: string; kind: string }>>;
   *     readFile: (path: string) => Promise<Uint8Array | ArrayBuffer>;
   *     ensureDirectory: (path: string) => Promise<unknown>;
   *     writeFile: (path: string, data: Uint8Array) => Promise<unknown>;
   *     deletePath: (path: string) => Promise<unknown>;
   *   };
   * }} options
   */
  async execute({
    argv = [],
    code = '',
    currentWorkingDirectory = '/workspace',
    mode = 'file',
    path = '',
    workspaceFileSystem,
  } = {}) {
    if (!workspaceFileSystem) {
      throw new Error('Workspace filesystem is unavailable in this browser session.');
    }
    await this.initialize();

    const workspaceSnapshot = await snapshotWorkspaceFileSystem(workspaceFileSystem);
    const payload = {
      argv,
      code,
      currentWorkingDirectory,
      mode,
      path,
      workspaceFiles: workspaceSnapshot.files.map((file) => ({
        path: file.path,
        bytes: file.bytes,
      })),
    };
    const transferList = payload.workspaceFiles.map((file) => file.bytes.buffer);
    const result = await this.#sendAndWait('execute', payload, transferList);
    await applyWorkspaceSnapshot(
      workspaceFileSystem,
      result?.workspaceFiles || [],
      workspaceSnapshot.paths
    );
    return {
      shellFlavor: 'GNU/Linux-like shell subset',
      command: Array.isArray(argv) ? argv.join(' ') : '',
      currentWorkingDirectory,
      exitCode: Number.isFinite(result?.exitCode) ? Number(result.exitCode) : 0,
      stdout: typeof result?.stdout === 'string' ? result.stdout : '',
      stderr: typeof result?.stderr === 'string' ? result.stderr : '',
    };
  }

  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.forEach(({ reject }) => {
      reject(new Error('Python runtime was disposed.'));
    });
    this.pendingRequests.clear();
    this.pendingInit = null;
  }

  #ensureWorker() {
    if (this.worker) {
      return;
    }
    this.worker = new Worker(new URL('../workers/python.worker.js', import.meta.url), {
      type: 'module',
    });
    this.worker.addEventListener('message', (event) => {
      this.#handleWorkerMessage(event.data);
    });
    this.worker.addEventListener('error', (event) => {
      const error =
        event?.error instanceof Error ? event.error : new Error('Python worker failed.');
      this.pendingRequests.forEach(({ reject }) => {
        reject(error);
      });
      this.pendingRequests.clear();
      this.pendingInit = null;
    });
  }

  #sendAndWait(type, payload, transferList = []) {
    return new Promise((resolve, reject) => {
      const requestId =
        globalThis.crypto?.randomUUID?.() || `python-${Date.now()}-${Math.random()}`;
      const timeout = globalThis.setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Python worker ${type} request timed out.`));
      }, 180000);
      this.pendingRequests.set(requestId, { resolve, reject, timeout });
      this.worker.postMessage({ type, payload, requestId }, transferList);
    });
  }

  #handleWorkerMessage(data) {
    if (!data || typeof data !== 'object') {
      return;
    }
    const requestId = typeof data.requestId === 'string' ? data.requestId : '';
    if (!requestId || !this.pendingRequests.has(requestId)) {
      return;
    }
    const entry = this.pendingRequests.get(requestId);
    globalThis.clearTimeout(entry.timeout);
    this.pendingRequests.delete(requestId);
    if (data.type === 'error') {
      entry.reject(new Error(data.payload?.message || 'Python execution failed.'));
      return;
    }
    entry.resolve(data.payload || {});
  }
}

async function snapshotWorkspaceFileSystem(workspaceFileSystem) {
  const visitedPaths = new Set();
  const fileEntries = [];

  async function walk(path) {
    const normalizedPath = workspaceFileSystem.normalizePath(path);
    if (visitedPaths.has(normalizedPath)) {
      return;
    }
    visitedPaths.add(normalizedPath);
    const entries = await workspaceFileSystem.listDirectory(normalizedPath);
    for (const entry of entries) {
      if (entry?.kind === 'directory') {
        await walk(entry.path);
        continue;
      }
      if (entry?.kind !== 'file') {
        continue;
      }
      const bytes = await workspaceFileSystem.readFile(entry.path);
      fileEntries.push({
        path: entry.path,
        bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
      });
    }
  }

  await walk('/workspace');

  return {
    files: fileEntries,
    paths: new Set(fileEntries.map((entry) => entry.path)),
  };
}

async function applyWorkspaceSnapshot(
  workspaceFileSystem,
  workspaceFiles = [],
  previousPaths = new Set()
) {
  const nextPaths = new Set();
  for (const file of workspaceFiles) {
    const normalizedPath = workspaceFileSystem.normalizePath(file.path);
    nextPaths.add(normalizedPath);
    const parentPath = normalizedPath.slice(0, normalizedPath.lastIndexOf('/')) || '/workspace';
    await workspaceFileSystem.ensureDirectory(parentPath);
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes || []);
    await workspaceFileSystem.writeFile(normalizedPath, bytes);
  }

  for (const oldPath of previousPaths) {
    if (nextPaths.has(oldPath)) {
      continue;
    }
    try {
      await workspaceFileSystem.deletePath(oldPath);
    } catch {
      // Ignore stale-path cleanup failures and keep the canonical workspace intact.
    }
  }
}
