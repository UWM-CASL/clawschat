const MCP_JSON_RPC_VERSION = '2.0';
const MCP_PROTOCOL_VERSION = '2025-03-26';
const MCP_CLIENT_INFO = Object.freeze({
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
const MAX_SCHEMA_DEPTH = 2;
const MAX_SCHEMA_PROPERTIES = 12;
const MAX_SCHEMA_ENUM_VALUES = 8;
const MAX_CAPABILITY_COUNT = 8;
const MCP_AUTH_UNSUPPORTED_MESSAGE =
  'This MCP server requires OAuth or token-based authentication. That is not supported in this app.';

function normalizeInlineText(value, { maxLength = 240 } = {}) {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeMultilineText(value, { maxLength = 1200 } = {}) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function slugifyIdentifier(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'mcp-server';
}

export function buildUniqueMcpServerIdentifier(value, existingIdentifiers = []) {
  const baseIdentifier = slugifyIdentifier(value);
  const existingIdentifierSet = new Set(
    Array.isArray(existingIdentifiers)
      ? existingIdentifiers
          .map((identifier) =>
            typeof identifier === 'string' ? identifier.trim().toLowerCase() : ''
          )
          .filter(Boolean)
      : []
  );
  if (!existingIdentifierSet.has(baseIdentifier)) {
    return baseIdentifier;
  }
  let suffix = 2;
  while (existingIdentifierSet.has(`${baseIdentifier}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseIdentifier}-${suffix}`;
}

function normalizeCapabilityList(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeInlineText(entry, { maxLength: 80 }))
      .filter(Boolean)
      .slice(0, MAX_CAPABILITY_COUNT);
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  return Object.entries(value)
    .filter(
      ([, entryValue]) => entryValue !== null && entryValue !== undefined && entryValue !== false
    )
    .map(([key]) => normalizeInlineText(key, { maxLength: 80 }))
    .filter(Boolean)
    .slice(0, MAX_CAPABILITY_COUNT);
}

function trimJsonSchema(schema, depth = 0) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return null;
  }
  const trimmed = {};
  if (typeof schema.type === 'string') {
    trimmed.type = schema.type;
  }
  if (typeof schema.title === 'string' && schema.title.trim()) {
    trimmed.title = normalizeInlineText(schema.title, { maxLength: 120 });
  }
  if (typeof schema.description === 'string' && schema.description.trim()) {
    trimmed.description = normalizeInlineText(schema.description, { maxLength: 240 });
  }
  if (Array.isArray(schema.enum) && schema.enum.length) {
    trimmed.enum = schema.enum
      .slice(0, MAX_SCHEMA_ENUM_VALUES)
      .map((entry) =>
        typeof entry === 'string' ? normalizeInlineText(entry, { maxLength: 80 }) : entry
      );
  }
  if (Array.isArray(schema.required) && schema.required.length) {
    trimmed.required = schema.required
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean)
      .slice(0, MAX_SCHEMA_PROPERTIES);
  }
  if (typeof schema.additionalProperties === 'boolean') {
    trimmed.additionalProperties = schema.additionalProperties;
  }
  if (schema.type === 'array' && schema.items && depth < MAX_SCHEMA_DEPTH) {
    trimmed.items = trimJsonSchema(schema.items, depth + 1);
  }
  if (
    schema.properties &&
    typeof schema.properties === 'object' &&
    !Array.isArray(schema.properties) &&
    depth < MAX_SCHEMA_DEPTH
  ) {
    const entries = Object.entries(schema.properties).slice(0, MAX_SCHEMA_PROPERTIES);
    if (entries.length) {
      trimmed.properties = Object.fromEntries(
        entries.map(([key, value]) => [key, trimJsonSchema(value, depth + 1)])
      );
    }
  }
  if (!Object.keys(trimmed).length) {
    return null;
  }
  return trimmed;
}

export function summarizeMcpInputSchema(inputSchema) {
  const schema = trimJsonSchema(inputSchema);
  if (!schema) {
    return 'No documented inputs.';
  }
  if (schema.type === 'object') {
    const properties =
      schema.properties &&
      typeof schema.properties === 'object' &&
      !Array.isArray(schema.properties)
        ? Object.entries(schema.properties)
        : [];
    const required = Array.isArray(schema.required) ? schema.required : [];
    if (!properties.length) {
      return required.length ? `Required: ${required.join(', ')}.` : 'No documented inputs.';
    }
    const propertySummary = properties
      .map(([name, value]) => {
        const propertyType =
          value && typeof value === 'object' && typeof value.type === 'string'
            ? value.type
            : 'value';
        return `${name} (${propertyType})`;
      })
      .join(', ');
    if (required.length) {
      return `Required: ${required.join(', ')}. Fields: ${propertySummary}.`;
    }
    return `Fields: ${propertySummary}.`;
  }
  if (schema.type === 'array') {
    return 'Accepts an array value.';
  }
  if (typeof schema.type === 'string') {
    return `Accepts a ${schema.type} value.`;
  }
  return 'Uses a documented input schema.';
}

function normalizeCommandRecord(command, { enabled = false } = {}) {
  const name = typeof command?.name === 'string' ? command.name.trim() : '';
  if (!name) {
    return null;
  }
  return {
    name,
    displayName:
      typeof command?.displayName === 'string' && command.displayName.trim()
        ? normalizeInlineText(command.displayName, { maxLength: 120 })
        : typeof command?.title === 'string' && command.title.trim()
          ? normalizeInlineText(command.title, { maxLength: 120 })
          : name,
    description: normalizeInlineText(command?.description, { maxLength: 240 }),
    enabled: enabled === true,
    inputSchema: trimJsonSchema(command?.inputSchema),
  };
}

function buildServerDescription({ displayName = '', instructions = '', endpointUrl }) {
  const instructionSummary = normalizeInlineText(String(instructions || '').split(/\n+/)[0], {
    maxLength: 180,
  });
  if (instructionSummary) {
    return instructionSummary;
  }
  if (displayName && endpointUrl?.host) {
    return `MCP server at ${endpointUrl.host}.`;
  }
  if (endpointUrl?.host) {
    return `MCP server at ${endpointUrl.host}.`;
  }
  return 'MCP server.';
}

function normalizeServerRecord(server) {
  const identifier =
    typeof server?.identifier === 'string' && server.identifier.trim()
      ? slugifyIdentifier(server.identifier)
      : '';
  const endpoint = typeof server?.endpoint === 'string' ? server.endpoint.trim() : '';
  if (!identifier || !endpoint) {
    return null;
  }
  const commands = Array.isArray(server?.commands)
    ? server.commands
        .map((command) => normalizeCommandRecord(command, { enabled: command?.enabled === true }))
        .filter(Boolean)
    : [];
  return {
    identifier,
    endpoint,
    displayName:
      typeof server?.displayName === 'string' && server.displayName.trim()
        ? normalizeInlineText(server.displayName, { maxLength: 120 })
        : identifier,
    description: normalizeInlineText(server?.description, { maxLength: 240 }),
    protocolVersion: normalizeInlineText(server?.protocolVersion, { maxLength: 60 }),
    serverVersion: normalizeInlineText(server?.serverVersion, { maxLength: 60 }),
    instructions: normalizeMultilineText(server?.instructions, { maxLength: 1200 }),
    capabilities: normalizeCapabilityList(server?.capabilities),
    enabled: server?.enabled === true,
    commands,
  };
}

export function normalizeMcpServerConfigs(value) {
  return (Array.isArray(value) ? value : []).map(normalizeServerRecord).filter(Boolean);
}

export function getEnabledMcpServerConfigs(servers = []) {
  return normalizeMcpServerConfigs(servers).filter(
    (server) => server.enabled && server.commands.some((command) => command.enabled)
  );
}

export function findMcpServerConfig(
  servers = [],
  selector,
  { enabledOnly = false, requireEnabledCommands = false } = {}
) {
  const normalizedSelector = String(selector || '')
    .trim()
    .toLowerCase();
  if (!normalizedSelector) {
    return null;
  }
  return (
    normalizeMcpServerConfigs(servers).find((server) => {
      if (enabledOnly && !server.enabled) {
        return false;
      }
      if (requireEnabledCommands && !server.commands.some((command) => command.enabled)) {
        return false;
      }
      return (
        server.identifier.toLowerCase() === normalizedSelector ||
        server.displayName.toLowerCase() === normalizedSelector
      );
    }) || null
  );
}

export function findMcpServerCommand(server, commandName, { enabledOnly = false } = {}) {
  const normalizedCommandName = String(commandName || '')
    .trim()
    .toLowerCase();
  if (!normalizedCommandName || !server || !Array.isArray(server.commands)) {
    return null;
  }
  return (
    server.commands.find((command) => {
      if (enabledOnly && !command.enabled) {
        return false;
      }
      return command.name.toLowerCase() === normalizedCommandName;
    }) || null
  );
}

function isLocalHttpUrl(url) {
  const hostname = url.hostname.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function assertSupportedEndpoint(endpoint) {
  const rawEndpoint = typeof endpoint === 'string' ? endpoint.trim() : '';
  if (!rawEndpoint) {
    throw new Error('Enter an MCP server endpoint URL.');
  }
  let url;
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

function buildFetchError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'The MCP server could not be reached from the browser.';
}

function parseEventStreamPayload(text) {
  const chunks = String(text || '')
    .split(/\r?\n\r?\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  for (const chunk of chunks) {
    const dataLines = chunk
      .split(/\r?\n/g)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());
    if (!dataLines.length) {
      continue;
    }
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
  return null;
}

function parseResponsePayload(rawText) {
  const text = String(rawText || '').trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    const eventStreamPayload = parseEventStreamPayload(text);
    if (eventStreamPayload) {
      return eventStreamPayload;
    }
  }
  throw new Error(
    'The endpoint did not return MCP JSON. Check that it is a browser-reachable MCP HTTP endpoint.'
  );
}

function responseHasAuthChallenge(response) {
  const authHeader =
    response.headers.get('www-authenticate') || response.headers.get('mcp-www-authenticate') || '';
  return (
    response.status === 401 ||
    response.status === 403 ||
    /bearer|oauth|token|basic/i.test(authHeader)
  );
}

async function readResponseText(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

async function sendRpcRequest(
  endpoint,
  body,
  {
    fetchRef = globalThis.fetch?.bind(globalThis),
    protocolVersion = MCP_PROTOCOL_VERSION,
    sessionId = '',
    allowEmptyBody = false,
  } = {}
) {
  if (typeof fetchRef !== 'function') {
    throw new Error('Browser fetch is unavailable for MCP server requests.');
  }

  const headers = new globalThis.Headers({
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': protocolVersion,
  });
  if (sessionId) {
    headers.set('MCP-Session-Id', sessionId);
  }

  let response;
  try {
    response = await fetchRef(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: MCP_JSON_RPC_VERSION,
        ...body,
      }),
    });
  } catch (error) {
    throw new Error(buildFetchError(error));
  }

  if (responseHasAuthChallenge(response)) {
    throw new Error(MCP_AUTH_UNSUPPORTED_MESSAGE);
  }

  const nextSessionId =
    response.headers.get('mcp-session-id') ||
    response.headers.get('MCP-Session-Id') ||
    response.headers.get('x-mcp-session-id') ||
    sessionId;

  const rawText = await readResponseText(response);
  if (!response.ok) {
    const payload = parseResponsePayload(rawText);
    const errorMessage =
      payload?.error && typeof payload.error === 'object'
        ? normalizeInlineText(payload.error.message, { maxLength: 240 })
        : '';
    throw new Error(
      errorMessage ||
        `The MCP server request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ''}).`
    );
  }

  if (!rawText.trim()) {
    if (allowEmptyBody) {
      return {
        payload: null,
        sessionId: nextSessionId,
      };
    }
    throw new Error('The MCP server returned an empty response.');
  }

  const payload = parseResponsePayload(rawText);
  if (payload?.error && typeof payload.error === 'object') {
    throw new Error(
      normalizeInlineText(payload.error.message, { maxLength: 240 }) || 'MCP request failed.'
    );
  }

  return {
    payload,
    sessionId: nextSessionId,
  };
}

async function openMcpSession(endpoint, options = {}) {
  const initializeRequest = {
    id: 'initialize',
    method: 'initialize',
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: MCP_CLIENT_INFO,
    },
  };
  const initializeResponse = await sendRpcRequest(endpoint, initializeRequest, options);
  const initializeResult =
    initializeResponse.payload?.result && typeof initializeResponse.payload.result === 'object'
      ? initializeResponse.payload.result
      : null;
  if (!initializeResult) {
    throw new Error('The MCP server did not return initialize metadata.');
  }
  const session = {
    endpoint,
    fetchRef: options.fetchRef,
    protocolVersion:
      typeof initializeResult.protocolVersion === 'string' &&
      initializeResult.protocolVersion.trim()
        ? initializeResult.protocolVersion.trim()
        : MCP_PROTOCOL_VERSION,
    sessionId: initializeResponse.sessionId,
  };
  await sendRpcRequest(
    endpoint,
    {
      method: 'notifications/initialized',
      params: {},
    },
    {
      ...options,
      protocolVersion: session.protocolVersion,
      sessionId: session.sessionId,
      allowEmptyBody: true,
    }
  );
  return {
    session,
    initializeResult,
  };
}

async function listRemoteCommands(session) {
  const tools = [];
  let cursor = null;
  let pageCount = 0;
  while (pageCount < 20) {
    const response = await sendRpcRequest(
      session.endpoint,
      {
        id: `tools-list-${pageCount + 1}`,
        method: 'tools/list',
        params: cursor ? { cursor } : {},
      },
      {
        fetchRef: session.fetchRef,
        protocolVersion: session.protocolVersion,
        sessionId: session.sessionId,
      }
    );
    const result = response.payload?.result;
    if (!result || typeof result !== 'object') {
      break;
    }
    if (Array.isArray(result.tools)) {
      tools.push(...result.tools);
    }
    cursor =
      typeof result.nextCursor === 'string' && result.nextCursor.trim()
        ? result.nextCursor.trim()
        : null;
    if (!cursor) {
      break;
    }
    pageCount += 1;
  }
  return tools;
}

function normalizeInspectionResult(
  endpointUrl,
  initializeResult,
  commands,
  { preferredIdentifier = '', existingIdentifiers = [] } = {}
) {
  const serverInfo =
    initializeResult?.serverInfo && typeof initializeResult.serverInfo === 'object'
      ? initializeResult.serverInfo
      : {};
  const displayName =
    normalizeInlineText(serverInfo.name, { maxLength: 120 }) ||
    normalizeInlineText(endpointUrl.hostname, { maxLength: 120 }) ||
    'MCP server';
  const instructions = normalizeMultilineText(initializeResult?.instructions, { maxLength: 1200 });
  const identifier = preferredIdentifier
    ? slugifyIdentifier(preferredIdentifier)
    : buildUniqueMcpServerIdentifier(displayName, existingIdentifiers);
  return {
    identifier,
    endpoint: endpointUrl.toString(),
    displayName,
    description: buildServerDescription({
      displayName,
      instructions,
      endpointUrl,
    }),
    protocolVersion: normalizeInlineText(initializeResult?.protocolVersion, { maxLength: 60 }),
    serverVersion: normalizeInlineText(serverInfo.version, { maxLength: 60 }),
    instructions,
    capabilities: normalizeCapabilityList(initializeResult?.capabilities),
    enabled: false,
    commands: commands
      .map((command) => normalizeCommandRecord(command, { enabled: false }))
      .filter(Boolean),
  };
}

/**
 * @param {string} endpoint
 * @param {{fetchRef?: typeof fetch; preferredIdentifier?: string; existingIdentifiers?: string[]}} [options]
 */
export async function inspectMcpServerEndpoint(endpoint, options = {}) {
  const { fetchRef, preferredIdentifier = '', existingIdentifiers = [] } = options;
  const endpointUrl = assertSupportedEndpoint(endpoint);
  const { session, initializeResult } = await openMcpSession(endpointUrl.toString(), {
    fetchRef,
  });
  const commands = await listRemoteCommands(session);
  const normalizedResult = normalizeInspectionResult(endpointUrl, initializeResult, commands, {
    preferredIdentifier,
    existingIdentifiers,
  });
  if (!normalizedResult.commands.length) {
    throw new Error('This MCP server did not expose any commands.');
  }
  return normalizedResult;
}

function normalizeToolContentItem(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const normalizedType = typeof item.type === 'string' ? item.type.trim() : '';
  if (normalizedType === 'text') {
    return {
      type: 'text',
      text: normalizeMultilineText(item.text, { maxLength: 16000 }),
    };
  }
  if (normalizedType) {
    const normalizedItem = { type: normalizedType };
    if (typeof item.mimeType === 'string' && item.mimeType.trim()) {
      normalizedItem.mimeType = item.mimeType.trim();
    }
    if (typeof item.text === 'string' && item.text.trim()) {
      normalizedItem.text = normalizeMultilineText(item.text, { maxLength: 8000 });
    }
    return normalizedItem;
  }
  return null;
}

function buildCommandResultBody(content, structuredContent) {
  const textContent = (Array.isArray(content) ? content : [])
    .filter((item) => item?.type === 'text' && typeof item.text === 'string' && item.text.trim())
    .map((item) => item.text.trim());
  if (textContent.length) {
    return textContent.join('\n\n');
  }
  if (structuredContent && typeof structuredContent === 'object') {
    try {
      return JSON.stringify(structuredContent);
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * @param {any} server
 * @param {string} commandName
 * @param {Record<string, any>} [commandArguments]
 * @param {{fetchRef?: typeof fetch}} [options]
 */
export async function executeMcpServerCommand(
  server,
  commandName,
  commandArguments = {},
  options = {}
) {
  const { fetchRef } = options;
  const normalizedServer = normalizeServerRecord(server);
  if (!normalizedServer) {
    throw new Error('MCP server configuration is invalid.');
  }
  const endpointUrl = assertSupportedEndpoint(normalizedServer.endpoint);
  const { session } = await openMcpSession(endpointUrl.toString(), {
    fetchRef,
  });
  const response = await sendRpcRequest(
    session.endpoint,
    {
      id: `tools-call-${String(commandName || '').trim() || 'command'}`,
      method: 'tools/call',
      params: {
        name: String(commandName || '').trim(),
        arguments:
          commandArguments &&
          typeof commandArguments === 'object' &&
          !Array.isArray(commandArguments)
            ? commandArguments
            : {},
      },
    },
    {
      fetchRef,
      protocolVersion: session.protocolVersion,
      sessionId: session.sessionId,
    }
  );
  const result =
    response.payload?.result && typeof response.payload.result === 'object'
      ? response.payload.result
      : {};
  const content = Array.isArray(result.content)
    ? result.content.map(normalizeToolContentItem).filter(Boolean)
    : [];
  const structuredContent =
    result.structuredContent && typeof result.structuredContent === 'object'
      ? result.structuredContent
      : null;
  return {
    status: result.isError === true ? 'failed' : 'success',
    server: normalizedServer.identifier,
    command: String(commandName || '').trim(),
    body: buildCommandResultBody(content, structuredContent),
    structuredContent,
    content,
  };
}

export { MCP_AUTH_UNSUPPORTED_MESSAGE };
