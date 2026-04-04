const MCP_JSON_RPC_VERSION = '2.0';
export const MCP_PROTOCOL_VERSION = '2025-03-26';
const MCP_PROTOCOL_HEADER = 'MCP-Protocol-Version';
const MCP_SESSION_HEADER = 'Mcp-Session-Id';
const MCP_ACCEPT_HEADER = 'application/json, text/event-stream';
const DEFAULT_CLIENT_INFO = Object.freeze({
  name: 'browser-llm-runner',
  version: '1.0.0',
});
const AUTH_QUERY_PARAMETER_NAMES = new Set([
  'access_token',
  'api_key',
  'apikey',
  'auth',
  'authorization',
  'bearer',
  'key',
  'token',
]);

export const MCP_AUTH_UNSUPPORTED_MESSAGE =
  'This MCP server requires OAuth or token-based authentication. That is not supported in this app.';

type FetchLike = typeof fetch;

type ClientInfo = {
  name: string;
  version: string;
};

type JsonObject = Record<string, unknown>;

type JsonRpcError = {
  code?: number;
  message?: string;
  data?: unknown;
};

type JsonRpcErrorEnvelope = {
  jsonrpc?: string;
  id?: string | number | null;
  error: JsonRpcError;
};

type JsonRpcSuccessEnvelope<Result = unknown> = {
  jsonrpc?: string;
  id?: string | number | null;
  result: Result;
};

export type McpInitializeResult = {
  protocolVersion?: string;
  capabilities?: unknown;
  instructions?: unknown;
  serverInfo?: {
    name?: unknown;
    version?: unknown;
  };
  [key: string]: unknown;
};

export type McpToolsListResult = {
  tools?: unknown[];
  nextCursor?: unknown;
  [key: string]: unknown;
};

export type McpToolsCallResult = {
  content?: unknown;
  structuredContent?: unknown;
  isError?: unknown;
  [key: string]: unknown;
};

export type McpHttpClientOptions = {
  fetchRef?: FetchLike | null;
  clientInfo?: Partial<ClientInfo> | null;
};

function normalizeInlineText(value: unknown, maxLength = 240): string {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function isLocalHttpUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function assertSupportedMcpEndpoint(endpoint: string): URL {
  const rawEndpoint = typeof endpoint === 'string' ? endpoint.trim() : '';
  if (!rawEndpoint) {
    throw new Error('Enter an MCP server endpoint URL.');
  }
  let url: URL;
  try {
    url = new URL(rawEndpoint);
  } catch {
    throw new Error('Enter a valid MCP server endpoint URL.');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalHttpUrl(url))) {
    throw new Error('Use an https MCP server endpoint, or http on localhost.');
  }
  if (url.username || url.password) {
    throw new Error(MCP_AUTH_UNSUPPORTED_MESSAGE);
  }
  for (const parameterName of url.searchParams.keys()) {
    if (AUTH_QUERY_PARAMETER_NAMES.has(parameterName.toLowerCase())) {
      throw new Error(MCP_AUTH_UNSUPPORTED_MESSAGE);
    }
  }
  return url;
}

function isJsonRpcErrorEnvelope(payload: unknown): payload is JsonRpcErrorEnvelope {
  return Boolean(payload && typeof payload === 'object' && 'error' in payload);
}

function isJsonRpcSuccessEnvelope<Result = unknown>(
  payload: unknown
): payload is JsonRpcSuccessEnvelope<Result> {
  return Boolean(payload && typeof payload === 'object' && 'result' in payload);
}

function parseJsonPayload(rawText: string): unknown {
  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error('The MCP server returned invalid JSON.');
  }
}

function parseEventStreamPayload(rawText: string): unknown {
  const chunks = rawText
    .split(/\r?\n\r?\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  let sawEventData = false;
  for (const chunk of chunks) {
    const dataLines = chunk
      .split(/\r?\n/g)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());
    if (!dataLines.length) {
      continue;
    }
    sawEventData = true;
    const payloadText = dataLines.join('\n').trim();
    if (!payloadText || payloadText === '[DONE]') {
      continue;
    }
    try {
      return JSON.parse(payloadText);
    } catch {
      continue;
    }
  }
  if (sawEventData) {
    throw new Error('The MCP server returned an event stream without valid JSON-RPC data.');
  }
  throw new Error('The MCP server returned invalid event stream data.');
}

function parseResponsePayload(rawText: string, contentType: string): unknown {
  const normalizedType = contentType.toLowerCase();
  if (/text\/event-stream/.test(normalizedType)) {
    return parseEventStreamPayload(rawText);
  }
  if (/application\/json/.test(normalizedType) || /\+json/.test(normalizedType)) {
    return parseJsonPayload(rawText);
  }
  try {
    return parseJsonPayload(rawText);
  } catch {
    return parseEventStreamPayload(rawText);
  }
}

function readSessionId(headers: Headers): string {
  return (
    headers.get(MCP_SESSION_HEADER) ||
    headers.get('mcp-session-id') ||
    headers.get('MCP-Session-Id') ||
    headers.get('x-mcp-session-id') ||
    ''
  );
}

function responseHasAuthChallenge(response: Response): boolean {
  const authHeader =
    response.headers.get('www-authenticate') || response.headers.get('mcp-www-authenticate') || '';
  return (
    response.status === 401 ||
    response.status === 403 ||
    /bearer|oauth|token|basic/i.test(authHeader)
  );
}

function buildFetchError(error: unknown): string {
  const message =
    error instanceof Error && typeof error.message === 'string' ? error.message.trim() : '';
  if (!message) {
    return 'The MCP server could not be reached from the browser.';
  }
  if (
    error instanceof TypeError ||
    /failed to fetch|load failed|networkerror|network request failed/i.test(message)
  ) {
    return 'The MCP server could not be reached from the browser. Check that the endpoint is online and allows browser CORS requests.';
  }
  return message;
}

function formatRpcErrorMessage(error: JsonRpcError | null | undefined): string {
  const message =
    error && typeof error.message === 'string' ? normalizeInlineText(error.message, 240) : '';
  return message || 'MCP request failed.';
}

function isSessionErrorMessage(message: string): boolean {
  return /session/i.test(message);
}

function buildSessionErrorMessage(sentSessionId: boolean): string {
  return sentSessionId
    ? 'The MCP session expired or is no longer valid. Refresh the MCP server and try again.'
    : 'The MCP server requires a session ID for this request.';
}

function buildHttpErrorMessage(
  response: Response,
  payload: unknown,
  sentSessionId: boolean
): string {
  if (responseHasAuthChallenge(response)) {
    return MCP_AUTH_UNSUPPORTED_MESSAGE;
  }
  if (sentSessionId && (response.status === 404 || response.status === 410)) {
    return buildSessionErrorMessage(true);
  }
  if (isJsonRpcErrorEnvelope(payload)) {
    const rpcMessage = formatRpcErrorMessage(payload.error);
    if (isSessionErrorMessage(rpcMessage)) {
      return buildSessionErrorMessage(sentSessionId);
    }
    return rpcMessage;
  }
  return `The MCP server request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ''}).`;
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

export class McpHttpClient {
  endpoint: string;
  fetchRef: FetchLike;
  protocolVersion: string;
  clientInfo: ClientInfo;
  sessionId: string;
  initialized: boolean;
  initializeResult: McpInitializeResult | null;
  initializePromise: Promise<McpInitializeResult> | null;
  requestCount: number;

  constructor(endpoint: string, options: McpHttpClientOptions = {}) {
    const endpointUrl = assertSupportedMcpEndpoint(endpoint);
    const fetchRef =
      typeof options.fetchRef === 'function' ? options.fetchRef : globalThis.fetch?.bind(globalThis);
    if (typeof fetchRef !== 'function') {
      throw new Error('Browser fetch is unavailable for MCP server requests.');
    }
    this.endpoint = endpointUrl.toString();
    this.fetchRef = fetchRef;
    this.protocolVersion = MCP_PROTOCOL_VERSION;
    this.clientInfo = {
      name:
        typeof options.clientInfo?.name === 'string' && options.clientInfo.name.trim()
          ? options.clientInfo.name.trim()
          : DEFAULT_CLIENT_INFO.name,
      version:
        typeof options.clientInfo?.version === 'string' && options.clientInfo.version.trim()
          ? options.clientInfo.version.trim()
          : DEFAULT_CLIENT_INFO.version,
    };
    this.sessionId = '';
    this.initialized = false;
    this.initializeResult = null;
    this.initializePromise = null;
    this.requestCount = 0;
  }

  buildRequestId(method: string): string {
    const normalizedMethod = String(method || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'mcp';
    this.requestCount += 1;
    return `${normalizedMethod}-${this.requestCount}`;
  }

  async request(method: string, params: JsonObject = {}, expectResponse = true): Promise<unknown> {
    const normalizedMethod = typeof method === 'string' ? method.trim() : '';
    if (!normalizedMethod) {
      throw new Error('MCP method is required.');
    }
    const normalizedParams =
      params && typeof params === 'object' && !Array.isArray(params) ? params : {};
    const sentSessionId = Boolean(this.sessionId);
    const headers = new Headers({
      Accept: MCP_ACCEPT_HEADER,
      'Content-Type': 'application/json',
      [MCP_PROTOCOL_HEADER]: this.protocolVersion,
    });
    if (this.sessionId) {
      headers.set(MCP_SESSION_HEADER, this.sessionId);
    }
    const requestPayload: JsonObject = {
      jsonrpc: MCP_JSON_RPC_VERSION,
      method: normalizedMethod,
      params: normalizedParams,
    };
    if (expectResponse) {
      requestPayload.id = this.buildRequestId(normalizedMethod);
    }

    let response: Response;
    try {
      response = await this.fetchRef(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestPayload),
      });
    } catch (error) {
      throw new Error(buildFetchError(error));
    }

    if (responseHasAuthChallenge(response)) {
      throw new Error(MCP_AUTH_UNSUPPORTED_MESSAGE);
    }

    const nextSessionId = readSessionId(response.headers);
    if (nextSessionId) {
      this.sessionId = nextSessionId;
    }

    const rawText = await readResponseText(response);
    const contentType = response.headers.get('content-type') || '';
    let payload: unknown = null;
    if (rawText.trim()) {
      payload = parseResponsePayload(rawText, contentType);
    }

    if (!response.ok) {
      throw new Error(buildHttpErrorMessage(response, payload, sentSessionId));
    }

    if (!expectResponse) {
      if (isJsonRpcErrorEnvelope(payload)) {
        const rpcMessage = formatRpcErrorMessage(payload.error);
        if (isSessionErrorMessage(rpcMessage)) {
          throw new Error(buildSessionErrorMessage(sentSessionId));
        }
        throw new Error(rpcMessage);
      }
      return payload;
    }

    if (!rawText.trim()) {
      throw new Error('The MCP server returned an empty response.');
    }
    if (isJsonRpcErrorEnvelope(payload)) {
      const rpcMessage = formatRpcErrorMessage(payload.error);
      if (isSessionErrorMessage(rpcMessage)) {
        throw new Error(buildSessionErrorMessage(sentSessionId));
      }
      throw new Error(rpcMessage);
    }
    if (!isJsonRpcSuccessEnvelope(payload)) {
      throw new Error('The MCP server did not return a JSON-RPC result.');
    }
    return payload.result;
  }

  async initialize(): Promise<McpInitializeResult> {
    if (this.initialized && this.initializeResult) {
      return this.initializeResult;
    }
    if (this.initializePromise) {
      return this.initializePromise;
    }
    this.initializePromise = (async () => {
      const initializeResult = await this.request(
        'initialize',
        {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: this.clientInfo,
        },
        true
      );
      if (!initializeResult || typeof initializeResult !== 'object') {
        throw new Error('The MCP server did not return initialize metadata.');
      }
      const typedInitializeResult = initializeResult as McpInitializeResult;
      if (
        typeof typedInitializeResult.protocolVersion === 'string' &&
        typedInitializeResult.protocolVersion.trim()
      ) {
        this.protocolVersion = typedInitializeResult.protocolVersion.trim();
      }
      await this.request('notifications/initialized', {}, false);
      this.initializeResult = typedInitializeResult;
      this.initialized = true;
      return typedInitializeResult;
    })();
    try {
      return await this.initializePromise;
    } finally {
      this.initializePromise = null;
    }
  }

  async listTools(): Promise<unknown[]> {
    await this.initialize();
    const tools: unknown[] = [];
    let cursor = '';
    let pageCount = 0;
    while (pageCount < 20) {
      const toolsResult = await this.request('tools/list', cursor ? { cursor } : {}, true);
      if (!toolsResult || typeof toolsResult !== 'object') {
        break;
      }
      const typedToolsResult = toolsResult as McpToolsListResult;
      if (Array.isArray(typedToolsResult.tools)) {
        tools.push(...typedToolsResult.tools);
      }
      cursor =
        typeof typedToolsResult.nextCursor === 'string' && typedToolsResult.nextCursor.trim()
          ? typedToolsResult.nextCursor.trim()
          : '';
      if (!cursor) {
        break;
      }
      pageCount += 1;
    }
    return tools;
  }

  async callTool(name: string, args: JsonObject = {}): Promise<McpToolsCallResult> {
    await this.initialize();
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName) {
      throw new Error('MCP tool name is required.');
    }
    const normalizedArguments =
      args && typeof args === 'object' && !Array.isArray(args) ? args : {};
    const result = await this.request(
      'tools/call',
      {
        name: normalizedName,
        arguments: normalizedArguments,
      },
      true
    );
    return result && typeof result === 'object' ? (result as McpToolsCallResult) : {};
  }
}
