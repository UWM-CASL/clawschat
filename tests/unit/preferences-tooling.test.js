import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createToolingPreferencesController } from '../../src/app/preferences-tooling.js';

function createHarness({
  availableToolDefinitions = [
    {
      name: 'run_shell_command',
      displayName: 'Run Shell Command',
      description: 'Execute shell commands.',
    },
    {
      name: 'tasklist',
      displayName: 'Task List',
      description: 'Manage a task list.',
    },
    {
      name: 'get_current_date_time',
      displayName: 'Get Date and Time',
      description: 'Read the local clock.',
    },
  ],
  appState = {
    enableToolCalling: true,
    enabledToolNames: ['run_shell_command', 'get_current_date_time'],
    mcpServers: [],
  },
  inspectMcpServerEndpoint = vi.fn(),
} = {}) {
  const dom = new JSDOM(
    `
      <input id="enableToolCallingToggle" type="checkbox" />
      <div id="toolSettingsList"></div>
      <input id="mcpServerEndpointInput" type="url" />
      <div id="mcpServerAddFeedback"></div>
      <div id="mcpServersList"></div>
    `,
    { url: 'https://example.test/' }
  );
  const document = dom.window.document;
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;

  return {
    appState,
    document,
    storage: dom.window.localStorage,
    controller: createToolingPreferencesController({
      appState,
      storage: dom.window.localStorage,
      documentRef: document,
      enableToolCallingStorageKey: 'tool-calling',
      enabledToolsStorageKey: 'enabled-tools',
      mcpServersStorageKey: 'mcp-servers',
      availableToolDefinitions,
      enableToolCallingToggle: document.getElementById('enableToolCallingToggle'),
      toolSettingsList: document.getElementById('toolSettingsList'),
      mcpServerEndpointInput: document.getElementById('mcpServerEndpointInput'),
      mcpServerAddFeedback: document.getElementById('mcpServerAddFeedback'),
      mcpServersList: document.getElementById('mcpServersList'),
      inspectMcpServerEndpoint,
    }),
    inspectMcpServerEndpoint,
  };
}

describe('preferences-tooling', () => {
  test('renders and persists tool-calling preferences', () => {
    const harness = createHarness();

    expect(harness.document.querySelectorAll('[data-tool-toggle="true"]')).toHaveLength(3);
    expect(harness.document.querySelector('[data-tool-name="run_shell_command"]')?.checked).toBe(
      true
    );
    expect(harness.document.querySelector('[data-tool-name="tasklist"]')?.checked).toBe(false);
    expect(
      harness.document.querySelector('[data-tool-name="get_current_date_time"]')?.checked
    ).toBe(true);

    harness.controller.applyToolCallingPreference(false, { persist: true });
    harness.controller.applyToolEnabledPreference('tasklist', true, { persist: true });

    expect(harness.appState.enableToolCalling).toBe(false);
    expect(harness.document.getElementById('enableToolCallingToggle')?.checked).toBe(false);
    expect(harness.storage.getItem('tool-calling')).toBe('false');
    expect(harness.appState.enabledToolNames).toEqual([
      'run_shell_command',
      'tasklist',
      'get_current_date_time',
    ]);
    expect(harness.storage.getItem('enabled-tools')).toBe(
      JSON.stringify(['run_shell_command', 'tasklist', 'get_current_date_time'])
    );
    expect(harness.document.querySelector('[data-tool-name="tasklist"]')?.checked).toBe(true);
  });

  test('imports a new MCP server, persists it, and clears the endpoint input', async () => {
    const inspectMcpServerEndpoint = vi.fn(async (endpoint, options = {}) => ({
      identifier:
        Array.isArray(options.existingIdentifiers) && options.existingIdentifiers.length
          ? 'docs-2'
          : 'docs',
      endpoint,
      displayName: 'Docs',
      description: 'Project documentation lookup.',
      enabled: false,
      commands: [
        {
          name: 'search_docs',
          displayName: 'Search Docs',
          description: 'Search the documentation.',
          enabled: false,
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
    }));
    const harness = createHarness({ inspectMcpServerEndpoint });
    const endpointInput = /** @type {HTMLInputElement | null} */ (
      harness.document.getElementById('mcpServerEndpointInput')
    );
    if (endpointInput) {
      endpointInput.value = 'https://example.test/mcp';
    }

    const importedServer = await harness.controller.importMcpServerEndpoint(
      'https://example.test/mcp',
      {
        persist: true,
      }
    );

    expect(importedServer.identifier).toBe('docs');
    expect(inspectMcpServerEndpoint).toHaveBeenCalledWith('https://example.test/mcp', {
      existingIdentifiers: [],
    });
    expect(harness.appState.mcpServers).toEqual([
      expect.objectContaining({
        identifier: 'docs',
        endpoint: 'https://example.test/mcp',
        commands: [expect.objectContaining({ name: 'search_docs', enabled: false })],
      }),
    ]);
    expect(endpointInput?.value).toBe('');
    expect(harness.storage.getItem('mcp-servers')).toContain('"identifier":"docs"');
    expect(harness.document.getElementById('mcpServersList')?.textContent).toContain('Docs');
    expect(harness.document.getElementById('mcpServersList')?.textContent).toContain('search_docs');
    expect(harness.document.getElementById('mcpServersList')?.textContent).toContain(
      'Required: query. Fields: query (string).'
    );
  });

  test('refresh keeps the existing enabled server and command choices', async () => {
    const inspectMcpServerEndpoint = vi.fn(async (endpoint, options = {}) => ({
      identifier: options.preferredIdentifier || 'docs',
      endpoint,
      displayName: 'Docs v2',
      description: 'Updated documentation lookup.',
      enabled: false,
      commands: [
        {
          name: 'search_docs',
          displayName: 'Search Docs',
          description: 'Updated command metadata.',
          enabled: false,
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
        {
          name: 'list_topics',
          displayName: 'List Topics',
          description: 'List documentation areas.',
          enabled: false,
          inputSchema: null,
        },
      ],
    }));
    const harness = createHarness({
      appState: {
        enableToolCalling: true,
        enabledToolNames: ['run_shell_command'],
        mcpServers: [
          {
            identifier: 'docs',
            endpoint: 'https://example.test/mcp',
            displayName: 'Docs',
            description: 'Project documentation lookup.',
            enabled: true,
            commands: [
              {
                name: 'search_docs',
                displayName: 'Search Docs',
                description: 'Search the documentation.',
                enabled: true,
                inputSchema: null,
              },
              {
                name: 'fetch_doc',
                displayName: 'Fetch Doc',
                description: 'Fetch one page.',
                enabled: false,
                inputSchema: null,
              },
            ],
          },
        ],
      },
      inspectMcpServerEndpoint,
    });
    harness.controller.setMcpServerFeedback('Stale metadata', 'danger');

    const refreshedServer = await harness.controller.refreshMcpServerPreference('docs', {
      persist: true,
    });

    expect(refreshedServer.displayName).toBe('Docs v2');
    expect(inspectMcpServerEndpoint).toHaveBeenCalledWith('https://example.test/mcp', {
      preferredIdentifier: 'docs',
    });
    expect(harness.appState.mcpServers).toEqual([
      expect.objectContaining({
        identifier: 'docs',
        displayName: 'Docs v2',
        enabled: true,
        commands: [
          expect.objectContaining({ name: 'search_docs', enabled: true }),
          expect.objectContaining({ name: 'list_topics', enabled: false }),
        ],
      }),
    ]);
    expect(harness.storage.getItem('mcp-servers')).toContain('"displayName":"Docs v2"');
    expect(harness.document.getElementById('mcpServersList')?.textContent).toContain('Docs v2');
    expect(harness.document.getElementById('mcpServersList')?.textContent).toContain('list_topics');
    expect(harness.document.getElementById('mcpServerAddFeedback')?.classList.contains('d-none')).toBe(
      true
    );
  });
});
