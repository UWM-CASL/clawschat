const { test, expect } = require('@playwright/test');

function installInferenceOnlyMockWorker() {
  const mockWindow = /** @type {any} */ (window);
  const NativeWorker = window.Worker;
  mockWindow.__mockWorkerGeneratePayloads = [];

  function extractPromptText(prompt) {
    if (Array.isArray(prompt)) {
      return prompt
        .map((message) => (typeof message?.content === 'string' ? message.content : ''))
        .filter((content) => content.trim())
        .join('\n');
    }
    return String(prompt || '');
  }

  class BaseMockWorker {
    constructor() {
      this.listeners = new Map();
      this.timer = null;
      this.terminated = false;
    }

    addEventListener(type, handler) {
      const set = this.listeners.get(type) || new Set();
      set.add(handler);
      this.listeners.set(type, set);
    }

    removeEventListener(type, handler) {
      const set = this.listeners.get(type);
      if (!set) {
        return;
      }
      set.delete(handler);
    }

    terminate() {
      this.terminated = true;
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }

    _emit(type, data) {
      const set = this.listeners.get(type);
      if (!set) {
        return;
      }
      for (const handler of set) {
        handler({ data });
      }
    }
  }

  class MockLlmWorker extends BaseMockWorker {
    postMessage(message) {
      if (!message || this.terminated) {
        return;
      }

      if (message.type === 'init') {
        this._emit('message', {
          type: 'status',
          payload: { message: 'Loading model...' },
        });
        this._emit('message', {
          type: 'progress',
          payload: {
            percent: 100,
            message: 'Model ready.',
            file: 'mock-model.onnx',
            status: 'done',
            loadedBytes: 100,
            totalBytes: 100,
          },
        });
        this._emit('message', {
          type: 'init-success',
          payload: {
            backend: 'cpu',
            modelId: message.payload?.modelId || 'mock/model',
          },
        });
        this._emit('message', {
          type: 'status',
          payload: { message: 'Ready (CPU)' },
        });
        return;
      }

      if (message.type === 'generate') {
        const requestId = message.payload?.requestId;
        const promptPayload = message.payload?.prompt;
        mockWindow.__mockWorkerGeneratePayloads.push(promptPayload);
        const promptText = extractPromptText(promptPayload);
        const isLong = /long answer/i.test(promptText);
        const chunks = isLong
          ? [
              'Mock ',
              'streamed ',
              'response ',
              'that ',
              'keeps ',
              'going ',
              'long ',
              'enough ',
              'for ',
              'the ',
              'stop ',
              'flow.',
            ]
          : ['Mock ', 'streamed ', 'response.'];
        let index = 0;
        this.timer = setInterval(
          () => {
            if (this.terminated) {
              clearInterval(this.timer);
              this.timer = null;
              return;
            }
            if (index < chunks.length) {
              this._emit('message', {
                type: 'token',
                payload: { requestId, text: chunks[index] },
              });
              index += 1;
              return;
            }
            clearInterval(this.timer);
            this.timer = null;
            this._emit('message', {
              type: 'complete',
              payload: { requestId, text: chunks.join('') },
            });
            this._emit('message', {
              type: 'status',
              payload: { message: 'Complete (CPU)' },
            });
          },
          isLong ? 300 : 60
        );
        return;
      }

      if (message.type === 'cancel') {
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
        this._emit('message', {
          type: 'canceled',
          payload: { requestId: message.payload?.requestId },
        });
      }
    }
  }

  mockWindow.Worker = /** @type {any} */ (
    class RoutedMockWorker {
      constructor(url, options) {
        const scriptUrl = String(url || '');
        if (
          scriptUrl.includes('llm.worker') ||
          scriptUrl.includes('openai-compatible.worker')
        ) {
          return new MockLlmWorker();
        }
        return new NativeWorker(url, options);
      }
    }
  );
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installInferenceOnlyMockWorker);
  await page.goto('./');
  await page.getByRole('button', { name: 'Start a conversation' }).click();
  await expect(page.locator('#messageInput')).toBeVisible();
});

test('uses the real PDF extraction worker while keeping inference mocked', async ({ page }) => {
  await page.evaluate(async () => {
    const binary = window.atob(
      'JVBERi0xLjEKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAzMDAgMTQ0XSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA2NyA+PgpzdHJlYW0KQlQKL0YxIDI0IFRmCjcyIDEwMCBUZAooSGVsbG8gUERGIGF0dGFjaG1lbnQpIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxMCAwMDAwMCBuIAowMDAwMDAwMDYwIDAwMDAwIG4gCjAwMDAwMDAxMTcgMDAwMDAgbiAKMDAwMDAwMDI0MyAwMDAwMCBuIAowMDAwMDAwMzYwIDAwMDAwIG4gCnRyYWlsZXIKPDwgL1Jvb3QgMSAwIFIgL1NpemUgNiA+PgpzdGFydHhyZWYKNDE4CiUlRU9G'
    );
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const file = new window.File([bytes], 'lesson.pdf', { type: 'application/pdf' });
    const input = /** @type {HTMLInputElement | null} */ (
      document.getElementById('imageAttachmentInput')
    );
    if (!input) {
      throw new Error('Attachment input not found.');
    }
    const transfer = new window.DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  });

  await expect(page.locator('.composer-attachment-card')).toContainText('lesson.pdf');
  await expect(page.locator('#sendButton')).toBeEnabled();

  await page.locator('#messageInput').fill('Summarize the document.');
  await page.locator('#sendButton').click();

  await expect(page.locator('.message-row.model-message')).toHaveCount(1);
  await page.locator('.message-row.user-message .message-file-toggle').click();

  const preview = page.locator('.message-row.user-message .message-file-preview-text');
  await expect(preview).toContainText('Attached PDF: lesson.pdf');
  await expect(preview).toContainText(/Hello\s+PDF\s+attach/);
  await expect(preview).not.toContainText('Mock extracted PDF text.');

  const promptShape = await page.evaluate(() => {
    const payloads = Array.isArray(/** @type {any} */ (window).__mockWorkerGeneratePayloads)
      ? /** @type {any} */ (window).__mockWorkerGeneratePayloads
      : [];
    return payloads[0];
  });
  const userPrompt = promptShape.find((entry) => entry?.role === 'user');
  expect(userPrompt?.content).toMatch(/Hello\s+PDF\s+attach/);
  expect(userPrompt?.content).not.toContain('Mock extracted PDF text.');
});
