import { describe, expect, test, vi } from 'vitest';
import { McpHttpClient } from '../../src/llm/mcp-http-client';
import { executeMcpServerCommand, inspectMcpServerEndpoint } from '../../src/llm/mcp-client.js';

function createJsonResponse(payload, init = {}) {
  return new globalThis.Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    ...init,
  });
}

function createSseResponse(payload, init = {}) {
  return new globalThis.Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      ...(init.headers || {}),
    },
    ...init,
  });
}

describe('mcp client', () => {
  test('inspects an MCP endpoint and performs the streamable HTTP handshake', async () => {
    const fetchRef = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            jsonrpc: '2.0',
            id: 'initialize-1',
            result: {
              protocolVersion: '2025-03-26',
              serverInfo: {
                name: 'Docs Server',
                version: '2.1.0',
              },
              instructions: 'Search project documentation.',
              capabilities: {
                tools: {},
                resources: {},
              },
            },
          },
          {
            headers: {
              'Mcp-Session-Id': 'session-1',
            },
          }
        )
      )
      .mockResolvedValueOnce(new globalThis.Response('', { status: 202 }))
      .mockResolvedValueOnce(
        createJsonResponse({
          jsonrpc: '2.0',
          id: 'tools-list-2',
          result: {
            tools: [
              {
                name: 'search_docs',
                description: 'Search documentation pages.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                    },
                  },
                  required: ['query'],
                },
              },
            ],
          },
        })
      );

    const server = await inspectMcpServerEndpoint('https://example.com/mcp', {
      fetchRef,
    });

    expect(server).toEqual({
      identifier: 'docs-server',
      endpoint: 'https://example.com/mcp',
      displayName: 'Docs Server',
      description: 'Search project documentation.',
      protocolVersion: '2025-03-26',
      serverVersion: '2.1.0',
      instructions: 'Search project documentation.',
      capabilities: ['tools', 'resources'],
      enabled: false,
      commands: [
        {
          name: 'search_docs',
          displayName: 'search_docs',
          description: 'Search documentation pages.',
          enabled: false,
          inputSchema: {
            type: 'object',
            required: ['query'],
            properties: {
              query: {
                type: 'string',
              },
            },
          },
        },
      ],
    });

    expect(fetchRef).toHaveBeenCalledTimes(3);
    expect(fetchRef.mock.calls[0][1].method).toBe('POST');
    expect(fetchRef.mock.calls[0][1].headers.get('Accept')).toBe(
      'application/json, text/event-stream'
    );
    expect(JSON.parse(fetchRef.mock.calls[0][1].body)).toMatchObject({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: {
          name: 'browser-llm-runner',
          version: '1.0.0',
        },
      },
    });
    expect(JSON.parse(fetchRef.mock.calls[1][1].body)).toMatchObject({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    });
    expect(fetchRef.mock.calls[1][1].headers.get('Mcp-Session-Id')).toBe('session-1');
    expect(JSON.parse(fetchRef.mock.calls[2][1].body)).toMatchObject({
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
    });
    expect(fetchRef.mock.calls[2][1].headers.get('Mcp-Session-Id')).toBe('session-1');
  });

  test('rejects MCP endpoints that require authentication', async () => {
    const fetchRef = vi.fn(async () => {
      return new globalThis.Response('', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Bearer realm="example"',
        },
      });
    });

    await expect(
      inspectMcpServerEndpoint('https://example.com/mcp', {
        fetchRef,
      })
    ).rejects.toThrow(
      'This MCP server requires OAuth or token-based authentication. That is not supported in this app.'
    );
  });

  test('supports event-stream responses for tools/list', async () => {
    const fetchRef = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            jsonrpc: '2.0',
            id: 'initialize-1',
            result: {
              protocolVersion: '2025-03-26',
              serverInfo: {
                name: 'Docs Server',
              },
            },
          },
          {
            headers: {
              'Mcp-Session-Id': 'session-1',
            },
          }
        )
      )
      .mockResolvedValueOnce(new globalThis.Response('', { status: 202 }))
      .mockResolvedValueOnce(
        createSseResponse({
          jsonrpc: '2.0',
          id: 'tools-list-2',
          result: {
            tools: [
              {
                name: 'search_docs',
                inputSchema: {
                  type: 'object',
                },
              },
            ],
          },
        })
      );

    const client = new McpHttpClient('https://example.com/mcp', {
      fetchRef,
    });

    await expect(client.listTools()).resolves.toEqual([
      {
        name: 'search_docs',
        inputSchema: {
          type: 'object',
        },
      },
    ]);
    expect(fetchRef.mock.calls[2][1].headers.get('Mcp-Session-Id')).toBe('session-1');
  });

  test('reports expired sessions clearly', async () => {
    const fetchRef = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            jsonrpc: '2.0',
            id: 'initialize-1',
            result: {
              protocolVersion: '2025-03-26',
              serverInfo: {
                name: 'Docs Server',
              },
            },
          },
          {
            headers: {
              'Mcp-Session-Id': 'session-1',
            },
          }
        )
      )
      .mockResolvedValueOnce(new globalThis.Response('', { status: 202 }))
      .mockResolvedValueOnce(
        new globalThis.Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 'tools-list-2',
            error: {
              message: 'Session expired.',
            },
          }),
          {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );

    const client = new McpHttpClient('https://example.com/mcp', {
      fetchRef,
    });

    await expect(client.listTools()).rejects.toThrow(
      'The MCP session expired or is no longer valid. Refresh the MCP server and try again.'
    );
  });

  test('reports non-JSON error pages with the HTTP status and content type', async () => {
    const onDebug = vi.fn();
    const fetchRef = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            jsonrpc: '2.0',
            id: 'initialize-1',
            result: {
              protocolVersion: '2025-03-26',
              serverInfo: {
                name: 'Docs Server',
              },
            },
          },
          {
            headers: {
              'Mcp-Session-Id': 'session-1',
            },
          }
        )
      )
      .mockResolvedValueOnce(new globalThis.Response('', { status: 202 }))
      .mockResolvedValueOnce(
        new globalThis.Response('<!doctype html><title>Bad gateway</title>', {
          status: 502,
          statusText: 'Bad Gateway',
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
          },
        })
      );

    const client = new McpHttpClient('https://example.com/mcp', {
      fetchRef,
      onDebug,
    });

    await expect(client.listTools()).rejects.toThrow(
      'The MCP server request failed (502 Bad Gateway) and returned text/html; charset=utf-8 data instead of JSON-RPC.'
    );
    expect(onDebug).toHaveBeenCalledWith(
      expect.stringContaining('response parse failed on error body')
    );
  });

  test('calls an MCP command and normalizes event-stream text content', async () => {
    const fetchRef = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            jsonrpc: '2.0',
            id: 'initialize-1',
            result: {
              protocolVersion: '2025-03-26',
              serverInfo: {
                name: 'Docs Server',
                version: '2.1.0',
              },
              capabilities: {
                tools: {},
              },
            },
          },
          {
            headers: {
              'Mcp-Session-Id': 'session-1',
            },
          }
        )
      )
      .mockResolvedValueOnce(new globalThis.Response('', { status: 202 }))
      .mockResolvedValueOnce(
        createSseResponse({
          jsonrpc: '2.0',
          id: 'tools-call-2',
          result: {
            content: [
              {
                type: 'text',
                text: 'Search results.',
              },
            ],
          },
        })
      );

    const result = await executeMcpServerCommand(
      {
        identifier: 'docs-server',
        endpoint: 'https://example.com/mcp',
      },
      'search_docs',
      {
        query: 'routing',
      },
      {
        fetchRef,
      }
    );

    expect(result).toEqual({
      status: 'success',
      server: 'docs-server',
      command: 'search_docs',
      body: 'Search results.',
      structuredContent: null,
      content: [
        {
          type: 'text',
          text: 'Search results.',
        },
      ],
    });
    expect(JSON.parse(fetchRef.mock.calls[2][1].body)).toMatchObject({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'search_docs',
        arguments: {
          query: 'routing',
        },
      },
    });
    expect(fetchRef.mock.calls[2][1].headers.get('Mcp-Session-Id')).toBe('session-1');
  });
});
