import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { bindCloudProviderSettingsEvents } from '../../src/app/settings-events-cloud.js';

function createHarness() {
  const dom = new JSDOM(
    `
      <form id="cloudProviderForm">
        <input id="cloudProviderEndpointInput" type="url" />
        <input id="cloudProviderApiKeyInput" type="password" />
        <button id="addCloudProviderButton" type="submit">Add provider</button>
      </form>
      <div id="cloudProvidersList">
        <input
          id="cloudModelToolToggle"
          type="checkbox"
          data-cloud-model-feature="toolCalling"
          data-cloud-provider-id="provider-1"
          data-cloud-remote-model-id="meta-llama/3.1-8b-instruct"
          data-cloud-remote-model-display-name="Llama 3.1 8B"
        />
      </div>
    `,
    { url: 'https://example.test/' }
  );

  const document = dom.window.document;
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.Event = dom.window.Event;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  globalThis.HTMLFormElement = dom.window.HTMLFormElement;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;

  const deps = {
    cloudProviderForm: document.getElementById('cloudProviderForm'),
    cloudProviderEndpointInput: document.getElementById('cloudProviderEndpointInput'),
    cloudProviderApiKeyInput: document.getElementById('cloudProviderApiKeyInput'),
    addCloudProviderButton: document.getElementById('addCloudProviderButton'),
    cloudProvidersList: document.getElementById('cloudProvidersList'),
    addCloudProvider: vi.fn(),
    setCloudProviderFeedback: vi.fn(),
    clearCloudProviderFeedback: vi.fn(),
    refreshCloudProviderPreference: vi.fn(),
    removeCloudProviderPreference: vi.fn(),
    setCloudProviderModelSelected: vi.fn(),
    updateCloudModelFeaturePreference: vi.fn(async () => true),
    updateCloudModelGenerationPreference: vi.fn(),
    resetCloudModelGenerationPreference: vi.fn(),
    setStatus: vi.fn(),
  };

  bindCloudProviderSettingsEvents(deps);

  return {
    dom,
    document,
    deps,
    elements: {
      cloudModelToolToggle: document.getElementById('cloudModelToolToggle'),
    },
  };
}

describe('settings-events-cloud', () => {
  test('persists cloud-model tool toggles and announces status', async () => {
    const harness = createHarness();
    const toggle = /** @type {HTMLInputElement} */ (harness.elements.cloudModelToolToggle);

    toggle.checked = true;
    toggle.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(harness.deps.updateCloudModelFeaturePreference).toHaveBeenCalledWith(
      'provider-1',
      'meta-llama/3.1-8b-instruct',
      'toolCalling',
      true
    );
    expect(harness.deps.setStatus).toHaveBeenCalledWith(
      'Built-in tools enabled for Llama 3.1 8B.'
    );
  });
});
