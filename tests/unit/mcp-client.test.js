import { describe, expect, test, vi } from 'vitest';
import { executeMcpServerCommand, inspectMcpServerEndpoint } from '../../src/llm/mcp-client.js';

describe('mcp client', () => {
  test('inspects an MCP endpoint and normalizes server metadata', async () => {
    const fetchRef = vi
      .fn()
      .mockResolvedValueOnce(
        new globalThis.Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 'initialize',
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
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'MCP-Session-Id': 'session-1',
            },
          }
        )
      )
      .mockResolvedValueOnce(new globalThis.Response('', { status: 202 }))
      .mockResolvedValueOnce(
        new globalThis.Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 'tools-list-1',
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
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
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

  test('calls an MCP command and normalizes text content', async () => {
    const fetchRef = vi
      .fn()
      .mockResolvedValueOnce(
        new globalThis.Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 'initialize',
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
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'MCP-Session-Id': 'session-1',
            },
          }
        )
      )
      .mockResolvedValueOnce(new globalThis.Response('', { status: 202 }))
      .mockResolvedValueOnce(
        new globalThis.Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 'tools-call-search_docs',
            result: {
              content: [
                {
                  type: 'text',
                  text: 'Search results.',
                },
              ],
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
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
  });
});
