import { describe, expect, test } from 'vitest';
import {
  buildToolCallingSystemPrompt,
  executeToolCall,
  getToolDisplayName,
  getEnabledToolDefinitions,
  sniffToolCalls,
} from '../../src/llm/tool-calling.js';

describe('tool-calling prompt builder', () => {
  test('builds the Llama json tool-calling prompt', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'json',
        nameKey: 'name',
        argumentsKey: 'parameters',
      },
      ['get_current_date_time'],
      [
        {
          name: 'get_current_date_time',
          description: 'Returns the current local date and time.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
      ]
    );

    expect(prompt).toContain('Enabled tools: get_current_date_time.');
    expect(prompt).toContain('After you receive a tool result, use it to answer the user naturally.');
    expect(prompt).toContain('Available tool definitions:');
    expect(prompt).toContain('Parameters schema: {"type":"object","properties":{},"additionalProperties":false}');
    expect(prompt).toContain(
      'Use this shape: {"name":"<tool-name>","parameters":{...}}.'
    );
  });

  test('builds the Qwen tagged-json tool-calling prompt', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'tagged-json',
        nameKey: 'name',
        argumentsKey: 'arguments',
        openTag: '<tool_call>',
        closeTag: '</tool_call>',
      },
      ['lookup_fact']
    );

    expect(prompt).toContain('Wrap the JSON object in <tool_call> and </tool_call>.');
    expect(prompt).toContain(
      'Use this JSON shape inside the tags: {"name":"<tool-name>","arguments":{...}}.'
    );
  });

  test('adds a terminal-use instruction for get_user_location', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'json',
        nameKey: 'name',
        argumentsKey: 'parameters',
      },
      ['get_user_location']
    );

    expect(prompt).toContain(
      'For get_user_location: a result with source "browser_geolocation" or "approximate_browser_signals" is a completed lookup.'
    );
    expect(prompt).toContain(
      'For get_user_location: if the result includes shouldRetry false, do not call get_user_location again and answer using the returned location data.'
    );
  });

  test('builds the LFM function-style tool-calling prompt', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'special-token-call',
        callOpen: '<|tool_call_start|>[',
        callClose: ']<|tool_call_end|>',
      },
      ['get_weather']
    );

    expect(prompt).toContain('Wrap the call in <|tool_call_start|>[ and ]<|tool_call_end|>.');
    expect(prompt).toContain(
      'Use this shape inside the wrapper: tool_name(arg1="value1", arg2="value2").'
    );
  });

  test('returns a friendly tool display name', () => {
    expect(getToolDisplayName('get_current_date_time')).toBe('Get Date and Time');
    expect(getToolDisplayName('get_user_location')).toBe('Get User Location');
    expect(getToolDisplayName('lookup_fact')).toBe('Lookup Fact');
  });

  test('includes the user location tool definition', () => {
    expect(getEnabledToolDefinitions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'get_user_location',
          displayName: 'Get User Location',
        }),
      ])
    );
  });

  test('lists none when no tools are enabled', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'json',
        nameKey: 'name',
        argumentsKey: 'arguments',
      },
      []
    );

    expect(prompt).toContain('Enabled tools: none.');
  });

  test('sniffs plain json tool calls', () => {
    expect(
      sniffToolCalls('{"name":"get_weather","parameters":{"location":"Milwaukee, WI"}}', {
        format: 'json',
        nameKey: 'name',
        argumentsKey: 'parameters',
      })
    ).toEqual([
      {
        name: 'get_weather',
        arguments: { location: 'Milwaukee, WI' },
        rawText: '{"name":"get_weather","parameters":{"location":"Milwaukee, WI"}}',
        format: 'json',
      },
    ]);
  });

  test('sniffs tagged json tool calls', () => {
    expect(
      sniffToolCalls('<tool_call>\n{"name":"lookup_fact","arguments":{"topic":"stars"}}\n</tool_call>', {
        format: 'tagged-json',
        nameKey: 'name',
        argumentsKey: 'arguments',
        openTag: '<tool_call>',
        closeTag: '</tool_call>',
      })
    ).toEqual([
      {
        name: 'lookup_fact',
        arguments: { topic: 'stars' },
        rawText: '{"name":"lookup_fact","arguments":{"topic":"stars"}}',
        format: 'tagged-json',
      },
    ]);
  });

  test('sniffs special-token function calls', () => {
    expect(
      sniffToolCalls('<|tool_call_start|>[get_weather(location="Milwaukee, WI", unit="fahrenheit")]<|tool_call_end|>', {
        format: 'special-token-call',
        callOpen: '<|tool_call_start|>[',
        callClose: ']<|tool_call_end|>',
      })
    ).toEqual([
      {
        name: 'get_weather',
        arguments: { location: 'Milwaukee, WI', unit: 'fahrenheit' },
        rawText:
          '<|tool_call_start|>[get_weather(location="Milwaukee, WI", unit="fahrenheit")]<|tool_call_end|>',
        format: 'special-token-call',
      },
    ]);
  });

  test('executes get_current_date_time without arguments', async () => {
    const result = await executeToolCall({
      name: 'get_current_date_time',
      arguments: {},
    });

    expect(result.toolName).toBe('get_current_date_time');
    expect(result.arguments).toEqual({});
    expect(result.result).toMatchObject({
      iso: expect.any(String),
      unixMs: expect.any(Number),
      localDate: expect.any(String),
      localTime: expect.any(String),
      timeZone: expect.any(String),
    });
    expect(JSON.parse(result.resultText)).toMatchObject({
      iso: expect.any(String),
      unixMs: expect.any(Number),
    });
  });

  test('executes get_user_location with precise coordinates when geolocation succeeds', async () => {
    const result = await executeToolCall(
      {
        name: 'get_user_location',
        arguments: {
          timeoutMs: 5000,
        },
      },
      {
        navigatorRef: {
          language: 'en-US',
          languages: ['en-US'],
          permissions: {
            query: async () => ({ state: 'granted' }),
          },
          geolocation: {
            getCurrentPosition: (success, _error, options) => {
              expect(options).toMatchObject({
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0,
              });
              success({
                coords: {
                  latitude: 43.0389,
                  longitude: -87.9065,
                  accuracy: 25,
                },
              });
            },
          },
        },
        fetchRef: async () => ({
          ok: true,
          json: async () => ({
            display_name: 'Milwaukee, Wisconsin, United States',
            address: {
              city: 'Milwaukee',
              state: 'Wisconsin',
              country: 'United States',
              country_code: 'us',
              postcode: '53202',
            },
          }),
        }),
      }
    );

    expect(result.toolName).toBe('get_user_location');
    expect(result.result).toEqual({
      source: 'browser_geolocation',
      status: 'completed',
      shouldRetry: false,
      confidenceLevel: 'high',
      permissionState: 'granted',
      coordinates: {
        latitude: 43.0389,
        longitude: -87.9065,
        accuracyMeters: 25,
      },
      formattedLocation: 'Milwaukee, Wisconsin, United States',
      resolvedLocation: {
        provider: 'OpenStreetMap Nominatim',
        attribution: '© OpenStreetMap contributors',
        formattedLocation: 'Milwaukee, Wisconsin, United States',
        displayName: 'Milwaukee, Wisconsin, United States',
        locality: 'Milwaukee',
        state: 'Wisconsin',
        country: 'United States',
        countryCode: 'US',
        postcode: '53202',
      },
      approximateLocation: null,
      summary: 'User location: Milwaukee, Wisconsin, United States.',
    });
  });

  test('falls back to an approximate location when geolocation permission is denied', async () => {
    const result = await executeToolCall(
      {
        name: 'get_user_location',
        arguments: {},
      },
      {
        navigatorRef: {
          language: 'en-US',
          languages: ['en-US'],
          permissions: {
            query: async () => ({ state: 'denied' }),
          },
          geolocation: {
            getCurrentPosition: (_success, error) => {
              error({
                code: 1,
              });
            },
          },
        },
      }
    );

    expect(result.toolName).toBe('get_user_location');
    expect(result.result.source).toBe('approximate_browser_signals');
    expect(result.result.status).toBe('completed');
    expect(result.result.shouldRetry).toBe(false);
    expect(result.result.confidenceLevel).toBe('low');
    expect(result.result.permissionState).toBe('denied');
    expect(result.result.coordinates).toBeNull();
    expect(result.result.approximateLocation).toMatchObject({
      locale: 'en-US',
      regionCode: 'US',
    });
    expect(result.result.approximateLocation.timeZone).toEqual(expect.any(String));
    expect(result.result.summary).toEqual(expect.stringContaining('Approximate user location:'));
  });

  test('keeps coordinates when reverse geocoding is unavailable', async () => {
    const result = await executeToolCall(
      {
        name: 'get_user_location',
        arguments: {},
      },
      {
        navigatorRef: {
          language: 'en-US',
          languages: ['en-US'],
          permissions: {
            query: async () => ({ state: 'granted' }),
          },
          geolocation: {
            getCurrentPosition: (success) => {
              success({
                coords: {
                  latitude: 43.044035,
                  longitude: -87.9149,
                  accuracy: 100,
                },
              });
            },
          },
        },
        fetchRef: async () => ({
          ok: false,
        }),
      }
    );

    expect(result.result.formattedLocation).toBeNull();
    expect(result.result.resolvedLocation).toBeNull();
    expect(result.result.summary).toBe('Precise user coordinates: 43.044035, -87.9149.');
    expect(result.result.shouldRetry).toBe(false);
  });

  test('marks a successful location lookup as granted even if the permissions api still says prompt', async () => {
    const result = await executeToolCall(
      {
        name: 'get_user_location',
        arguments: {},
      },
      {
        navigatorRef: {
          language: 'en-US',
          languages: ['en-US'],
          permissions: {
            query: async () => ({ state: 'prompt' }),
          },
          geolocation: {
            getCurrentPosition: (success) => {
              success({
                coords: {
                  latitude: 43.044035,
                  longitude: -87.9149,
                  accuracy: 100,
                },
              });
            },
          },
        },
        fetchRef: async () => ({
          ok: true,
          json: async () => ({
            display_name: 'Milwaukee, Wisconsin, United States',
            address: {
              city: 'Milwaukee',
              state: 'Wisconsin',
              country: 'United States',
              country_code: 'us',
            },
          }),
        }),
      }
    );

    expect(result.result.permissionState).toBe('granted');
    expect(result.result.shouldRetry).toBe(false);
  });
});
