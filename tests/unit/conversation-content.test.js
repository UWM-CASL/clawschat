import { describe, expect, test } from 'vitest';
import {
  buildMessagePromptContent,
  getTextFromMessageContentParts,
  normalizeMessageContentParts,
  setUserMessageText,
} from '../../src/state/conversation-content.js';

describe('conversation-content', () => {
  test('falls back to non-empty text when content parts are empty or blank', () => {
    expect(normalizeMessageContentParts([], 'Hello world')).toEqual([
      { type: 'text', text: 'Hello world' },
    ]);
    expect(normalizeMessageContentParts([{ type: 'text', text: '   ' }], 'Hello world')).toEqual([
      { type: 'text', text: 'Hello world' },
    ]);
  });

  test('joins text parts while ignoring non-text parts', () => {
    expect(
      getTextFromMessageContentParts([
        { type: 'text', text: 'First line' },
        { type: 'image', artifactId: 'image-1', mimeType: 'image/png' },
        { type: 'text', text: 'Second line' },
      ])
    ).toBe('First line\nSecond line');
  });

  test('preserves file parts when user text changes and rebuilds llm text', () => {
    const message = {
      role: 'user',
      text: 'Old text',
      content: {
        parts: [
          { type: 'text', text: 'Old text' },
          {
            type: 'file',
            artifactId: 'file-1',
            filename: 'notes.md',
            mimeType: 'text/markdown',
            llmText: 'Attached file contents',
          },
        ],
      },
    };

    setUserMessageText(message, 'New text');

    expect(message.content.parts).toEqual([
      { type: 'text', text: 'New text' },
      {
        type: 'file',
        artifactId: 'file-1',
        filename: 'notes.md',
        mimeType: 'text/markdown',
        llmText: 'Attached file contents',
      },
    ]);
    expect(message.content.llmRepresentation).toBe('New text\nAttached file contents');
  });

  test('keeps structured media when user text is cleared', () => {
    const message = {
      role: 'user',
      text: 'Describe this image',
      content: {
        parts: [
          { type: 'text', text: 'Describe this image' },
          {
            type: 'image',
            artifactId: 'image-1',
            mimeType: 'image/png',
            base64: 'abc123',
          },
        ],
      },
    };

    setUserMessageText(message, '   ');

    expect(message.content.parts).toEqual([
      {
        type: 'image',
        artifactId: 'image-1',
        mimeType: 'image/png',
        base64: 'abc123',
      },
    ]);
    expect(message.content.llmRepresentation).toEqual([
      {
        type: 'image',
        artifactId: 'image-1',
        mimeType: 'image/png',
        base64: 'abc123',
      },
    ]);
  });

  test('builds llm-facing prompt text from file parts when no explicit representation exists', () => {
    const content = buildMessagePromptContent({
      role: 'user',
      text: 'Summarize the attachment',
      content: {
        parts: [
          { type: 'text', text: 'Summarize the attachment' },
          {
            type: 'file',
            artifactId: 'file-1',
            filename: 'notes.md',
            mimeType: 'text/markdown',
            llmText: 'File body goes here',
          },
        ],
      },
    });

    expect(content).toBe('Summarize the attachment\nFile body goes here');
  });

  test('clones explicit structured llm payloads before returning them', () => {
    const message = {
      role: 'user',
      text: 'Describe this image',
      content: {
        llmRepresentation: [
          { type: 'text', text: 'Describe this image' },
          { type: 'image', artifactId: 'image-1', mimeType: 'image/png', url: 'blob:123' },
        ],
      },
    };

    const content = buildMessagePromptContent(message);

    expect(content).toEqual([
      { type: 'text', text: 'Describe this image' },
      { type: 'image', artifactId: 'image-1', mimeType: 'image/png', url: 'blob:123' },
    ]);
    expect(content).not.toBe(message.content.llmRepresentation);
    content[1].url = 'changed';
    expect(message.content.llmRepresentation[1].url).toBe('blob:123');
  });

  test('uses explicit llm text payloads for non-user messages', () => {
    expect(
      buildMessagePromptContent({
        role: 'model',
        response: 'fallback',
        content: {
          llmRepresentation: { type: 'text', text: '  explicit model text  ' },
        },
      })
    ).toBe('explicit model text');
  });
});
