import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  copyTextToClipboard,
  createMessageCopyController,
  getModelTurnMessages,
} from '../../src/app/message-copy.js';

function createConversation() {
  const messages = [
    { id: 'user-1', role: 'user', text: 'Question' },
    { id: 'model-1', role: 'model', response: 'Answer', thoughts: 'Hidden reasoning' },
    { id: 'tool-1', role: 'tool', toolResult: 'Tool result' },
    { id: 'model-2', role: 'model', response: 'Final answer' },
    { id: 'user-2', role: 'user', text: 'Next question' },
    { id: 'model-3', role: 'model', response: 'Next answer' },
  ];
  return {
    id: 'conversation-1',
    messageNodes: messages,
    pathMessages: messages,
  };
}

function createHarness({ clipboardResult = undefined } = {}) {
  const dom = new JSDOM(
    `
      <article data-message-id="model-1">
        <div class="response-content">
          <mjx-assistive-mml><math><mi>x</mi></math></mjx-assistive-mml>
        </div>
      </article>
    `,
    { url: 'https://example.test/' }
  );
  const conversation = createConversation();
  const clipboardWriteText =
    clipboardResult instanceof Error
      ? vi.fn().mockRejectedValue(clipboardResult)
      : vi.fn().mockResolvedValue(clipboardResult);
  const navigatorRef =
    clipboardResult === null
      ? {}
      : {
          clipboard: {
            writeText: clipboardWriteText,
          },
        };
  const setStatus = vi.fn();
  const typesetMathInElement = vi.fn(async () => {});
  const extractMathMlFromElement = vi.fn(() => '<math><mi>x</mi></math>');
  const controller = createMessageCopyController({
    documentRef: dom.window.document,
    navigatorRef,
    getActiveConversation: vi.fn(() => conversation),
    getMessageNodeById: vi.fn(
      (_conversation, messageId) =>
        conversation.messageNodes.find((message) => message.id === messageId) || null
    ),
    getConversationPathMessages: vi.fn(() => conversation.pathMessages),
    findMessageElement: vi.fn((messageId) =>
      dom.window.document.querySelector(`[data-message-id="${messageId}"]`)
    ),
    typesetMathInElement,
    extractMathMlFromElement,
    setStatus,
  });

  return {
    controller,
    conversation,
    clipboardWriteText,
    dom,
    extractMathMlFromElement,
    navigatorRef,
    setStatus,
    typesetMathInElement,
  };
}

describe('message-copy', () => {
  test('collects model turn messages until the next user turn', () => {
    const conversation = createConversation();

    expect(
      getModelTurnMessages(
        conversation,
        'model-1',
        (activeConversation) => activeConversation.pathMessages
      ).map((message) => message.id)
    ).toEqual(['model-1', 'tool-1', 'model-2']);
  });

  test('copies a folded model response including tool results and continuation text', async () => {
    const harness = createHarness();

    await harness.controller.handleMessageCopyAction('model-1', 'response');

    expect(harness.clipboardWriteText).toHaveBeenCalledWith(
      'Answer\n\nTool result\n\nFinal answer'
    );
    expect(harness.setStatus).toHaveBeenCalledWith('Copied to clipboard.');
  });

  test('copies model thoughts only when requested', async () => {
    const harness = createHarness();

    await harness.controller.handleMessageCopyAction('model-1', 'thoughts');

    expect(harness.clipboardWriteText).toHaveBeenCalledWith('Hidden reasoning');
    expect(harness.setStatus).toHaveBeenCalledWith('Copied to clipboard.');
  });

  test('typesets and copies rendered MathML', async () => {
    const harness = createHarness();

    await harness.controller.handleMessageCopyAction('model-1', 'mathml');

    const responseElement = harness.dom.window.document.querySelector('.response-content');
    expect(harness.typesetMathInElement).toHaveBeenCalledWith(responseElement);
    expect(harness.extractMathMlFromElement).toHaveBeenCalledWith(responseElement);
    expect(harness.clipboardWriteText).toHaveBeenCalledWith('<math><mi>x</mi></math>');
    expect(harness.setStatus).toHaveBeenCalledWith('MathML copied to clipboard.');
  });

  test('announces empty copy states', async () => {
    const harness = createHarness();

    await harness.controller.handleMessageCopyAction('user-1', 'response');
    await harness.controller.handleMessageCopyAction('model-3', 'mathml');

    expect(harness.setStatus).toHaveBeenNthCalledWith(1, 'Nothing available to copy.');
    expect(harness.setStatus).toHaveBeenNthCalledWith(2, 'No rendered MathML available to copy.');
  });

  test('falls back to document copy command when clipboard API is unavailable', async () => {
    const dom = new JSDOM('<body></body>', { url: 'https://example.test/' });
    const execCommand = vi.fn(() => true);
    dom.window.document.execCommand = execCommand;

    const didCopy = await copyTextToClipboard('Fallback text', {
      documentRef: dom.window.document,
      navigatorRef: {},
    });

    expect(didCopy).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(dom.window.document.querySelector('textarea')).toBeNull();
  });

  test('reports copy failure when both clipboard paths fail', async () => {
    const dom = new JSDOM('<body></body>', { url: 'https://example.test/' });
    dom.window.document.execCommand = vi.fn(() => false);

    const didCopy = await copyTextToClipboard('Fallback text', {
      documentRef: dom.window.document,
      navigatorRef: {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error('blocked')),
        },
      },
    });

    expect(didCopy).toBe(false);
  });
});
