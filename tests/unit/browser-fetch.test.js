import { describe, expect, test, vi } from 'vitest';
import {
  CORS_PROXY_VALIDATION_TARGET_URL,
  buildCorsProxyRequestUrl,
  createCorsAwareFetch,
  normalizeCorsProxyUrl,
  validateCorsProxyUrl,
} from '../../src/llm/browser-fetch.js';

const APP_LOCATION = {
  href: 'https://app.example/chat',
  origin: 'https://app.example',
};

describe('browser fetch helper', () => {
  test('normalizes path-prefix proxy URLs with a trailing slash and preserves query prefixes', () => {
    expect(normalizeCorsProxyUrl('https://proxy.example')).toBe('https://proxy.example/');
    expect(buildCorsProxyRequestUrl('https://proxy.example', 'https://api.example/data')).toBe(
      'https://proxy.example/https://api.example/data'
    );
    expect(normalizeCorsProxyUrl('https://proxy.example/proxy?url=')).toBe(
      'https://proxy.example/proxy?url='
    );
    expect(
      buildCorsProxyRequestUrl('https://proxy.example/proxy?url=', 'https://api.example/data')
    ).toBe('https://proxy.example/proxy?url=https://api.example/data');
  });

  test('rejects proxy URLs that do not match the supported prefix format', async () => {
    await expect(validateCorsProxyUrl('http://proxy.example')).rejects.toThrow(
      'Use an https CORS proxy URL, or http on localhost.'
    );
    await expect(validateCorsProxyUrl('https://proxy.example/#fragment')).rejects.toThrow(
      'CORS proxy URLs cannot include fragments.'
    );
  });

  test('validates a proxy by sending an MCP initialize probe through it', async () => {
    const fetchRef = vi.fn(async (url, init = {}) => {
      expect(url).toBe(`https://proxy.example/${CORS_PROXY_VALIDATION_TARGET_URL}`);
      expect(init.method).toBe('POST');
      const headers = new globalThis.Headers(init.headers);
      expect(headers.get('accept')).toBe('application/json, text/event-stream');
      expect(headers.get('content-type')).toBe('application/json');
      expect(headers.get('mcp-protocol-version')).toBe('2025-03-26');
      expect(JSON.parse(init.body)).toEqual({
        jsonrpc: '2.0',
        id: 'proxy-validation-initialize',
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'browser-llm-runner-proxy-validation',
            version: '1.0.0',
          },
        },
      });
      return new globalThis.Response(
        '{"error":"invalid_token","error_description":"Missing Authorization header"}',
        {
          status: 401,
          statusText: 'Unauthorized',
          headers: {
            'content-type': 'application/json',
            'www-authenticate':
              'Bearer error="invalid_token", resource_metadata="https://example-server.modelcontextprotocol.io/.well-known/oauth-protected-resource"',
          },
        }
      );
    });

    await expect(
      validateCorsProxyUrl('https://proxy.example', {
        fetchRef,
      })
    ).resolves.toBe('https://proxy.example/');
    expect(fetchRef).toHaveBeenCalledTimes(1);
  });

  test('accepts a direct JSON-RPC initialize response from the probe endpoint', async () => {
    const fetchRef = vi.fn(async () => {
      return new globalThis.Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 'proxy-validation-initialize',
          result: {
            protocolVersion: '2025-03-26',
          },
        }),
        {
          status: 200,
        headers: {
            'content-type': 'application/json',
          },
        },
      );
    });

    await expect(
      validateCorsProxyUrl('https://proxy.example', {
        fetchRef,
      })
    ).resolves.toBe('https://proxy.example/');
    expect(fetchRef).toHaveBeenCalledTimes(1);
  });

  test('includes response metadata when the proxy response body cannot be read', async () => {
    const unreadableResponse = Object.assign(new globalThis.Response('', {
      status: 200,
      statusText: 'OK',
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
    }), {
      text: vi.fn(async () => {
        throw new Error('Body stream unavailable');
      }),
    });
    const fetchRef = vi.fn(async () => unreadableResponse);
    const onDebug = vi.fn();

    await expect(
      validateCorsProxyUrl('https://proxy.example', {
        fetchRef,
        onDebug,
      })
    ).rejects.toThrow(
      'The CORS proxy test response could not be read by the browser (status 200 OK, content-type text/html; charset=utf-8).'
    );
    expect(onDebug).toHaveBeenCalledWith(
      expect.stringContaining('CORS proxy validation response body could not be read')
    );
  });

  test('retries through the configured proxy only after a likely CORS block', async () => {
    const fetchRef = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new TypeError('Failed to fetch');
      })
      .mockImplementationOnce(async (url, init = {}) => {
        expect(url).toBe('https://api.example/data');
        expect(init.mode).toBe('no-cors');
        return new globalThis.Response('', { status: 200 });
      })
      .mockImplementationOnce(async (request) => {
        expect(request).toBeInstanceOf(globalThis.Request);
        expect(request.url).toBe('https://proxy.example/https://api.example/data');
        expect(request.method).toBe('POST');
        expect(request.headers.get('content-type')).toBe('application/json');
        expect(await request.text()).toBe('{"topic":"planets"}');
        return new globalThis.Response('proxied', { status: 200 });
      });

    const wrappedFetch = createCorsAwareFetch({
      fetchRef,
      getProxyUrl: () => 'https://proxy.example/',
      locationRef: APP_LOCATION,
    });

    const response = await wrappedFetch('https://api.example/data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{"topic":"planets"}',
    });

    expect(await response.text()).toBe('proxied');
    expect(fetchRef).toHaveBeenCalledTimes(3);
  });

  test('does not proxy when the direct failure is not plausibly caused by CORS', async () => {
    const fetchRef = vi.fn(async () => {
      throw Object.assign(new Error('The operation was aborted.'), {
        name: 'AbortError',
      });
    });

    const wrappedFetch = createCorsAwareFetch({
      fetchRef,
      getProxyUrl: () => 'https://proxy.example/',
      locationRef: APP_LOCATION,
    });

    await expect(wrappedFetch('https://api.example/data')).rejects.toThrow(
      'The operation was aborted.'
    );
    expect(fetchRef).toHaveBeenCalledTimes(1);
  });

  test('does not proxy requests carrying authorization headers', async () => {
    const fetchRef = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const wrappedFetch = createCorsAwareFetch({
      fetchRef,
      getProxyUrl: () => 'https://proxy.example/',
      locationRef: APP_LOCATION,
    });

    await expect(
      wrappedFetch('https://api.example/data', {
        headers: {
          Authorization: 'Bearer secret',
        },
      })
    ).rejects.toThrow('Failed to fetch');
    expect(fetchRef).toHaveBeenCalledTimes(1);
  });
});
