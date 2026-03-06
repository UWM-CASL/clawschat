import { describe, expect, test } from 'vitest';
import {
  addMessageToConversation,
  buildConversationDownloadMarkdown,
  buildConversationDownloadPayload,
  buildPromptForConversationLeaf,
  createConversation,
  findPreferredLeafForVariant,
  getModelVariantState,
  getUserVariantState,
  pruneDescendantsFromMessage,
} from '../../src/state/conversation-model.js';

function completeModelMessage(message, text) {
  message.response = text;
  message.text = text;
  message.isResponseComplete = true;
  return message;
}

describe('conversation-model', () => {
  test('builds prompts from the visible branch and effective system prompt', () => {
    const conversation = createConversation({
      id: 'conversation-1',
      systemPrompt: 'Use simple language.',
    });
    conversation.conversationSystemPrompt = 'Answer as a tutor.';
    conversation.appendConversationSystemPrompt = true;

    const userMessage = addMessageToConversation(conversation, 'user', 'What is gravity?');
    const modelMessage = completeModelMessage(
      addMessageToConversation(conversation, 'model', '', { parentId: userMessage.id }),
      'Gravity pulls objects together.',
    );

    expect(buildPromptForConversationLeaf(conversation)).toEqual([
      {
        role: 'system',
        content: 'Use simple language.\n\nAnswer as a tutor.',
      },
      { role: 'user', content: 'What is gravity?' },
      { role: 'assistant', content: 'Gravity pulls objects together.' },
    ]);

    conversation.appendConversationSystemPrompt = false;

    expect(buildPromptForConversationLeaf(conversation, modelMessage.id)).toEqual([
      {
        role: 'system',
        content: 'Answer as a tutor.',
      },
      { role: 'user', content: 'What is gravity?' },
      { role: 'assistant', content: 'Gravity pulls objects together.' },
    ]);
  });

  test('tracks branch variants and prefers a descendant leaf for the selected variant', () => {
    const conversation = createConversation({ id: 'conversation-1' });
    const rootUser = addMessageToConversation(conversation, 'user', 'Start');
    const rootModel = completeModelMessage(
      addMessageToConversation(conversation, 'model', '', { parentId: rootUser.id }),
      'Root answer',
    );
    const firstBranchUser = addMessageToConversation(conversation, 'user', 'Branch A', {
      parentId: rootModel.id,
    });
    const firstBranchModel = completeModelMessage(
      addMessageToConversation(conversation, 'model', '', { parentId: firstBranchUser.id }),
      'Answer A',
    );
    const secondBranchUser = addMessageToConversation(conversation, 'user', 'Branch B', {
      parentId: rootModel.id,
    });
    const secondBranchModel = completeModelMessage(
      addMessageToConversation(conversation, 'model', '', { parentId: secondBranchUser.id }),
      'Answer B',
    );

    conversation.activeLeafMessageId = firstBranchModel.id;
    conversation.lastSpokenLeafMessageId = secondBranchModel.id;

    const userVariantState = getUserVariantState(conversation, secondBranchUser);
    expect(userVariantState.total).toBe(2);
    expect(userVariantState.index).toBe(1);
    expect(userVariantState.canGoPrev).toBe(true);
    expect(userVariantState.canGoNext).toBe(false);

    const modelVariantState = getModelVariantState(conversation, secondBranchModel);
    expect(modelVariantState.total).toBe(1);
    expect(findPreferredLeafForVariant(conversation, secondBranchUser)).toBe(secondBranchModel.id);
  });

  test('prunes descendants without removing the edited message', () => {
    const conversation = createConversation({ id: 'conversation-1' });
    const userMessage = addMessageToConversation(conversation, 'user', 'Original');
    const modelMessage = completeModelMessage(
      addMessageToConversation(conversation, 'model', '', { parentId: userMessage.id }),
      'First answer',
    );
    const followUpUser = addMessageToConversation(conversation, 'user', 'Follow up', {
      parentId: modelMessage.id,
    });
    const followUpModel = completeModelMessage(
      addMessageToConversation(conversation, 'model', '', { parentId: followUpUser.id }),
      'Second answer',
    );

    conversation.activeLeafMessageId = followUpModel.id;
    conversation.lastSpokenLeafMessageId = followUpModel.id;

    const result = pruneDescendantsFromMessage(conversation, userMessage.id);

    expect(result.removedCount).toBe(3);
    expect(result.removedIds).toEqual([
      modelMessage.id,
      followUpUser.id,
      followUpModel.id,
    ]);
    expect(conversation.messageNodes.map((message) => message.id)).toEqual([userMessage.id]);
    expect(conversation.activeLeafMessageId).toBe(userMessage.id);
    expect(conversation.lastSpokenLeafMessageId).toBe(userMessage.id);
  });

  test('builds export payloads and markdown from the active branch only', () => {
    const conversation = createConversation({
      id: 'conversation-1',
      name: 'Physics Notes',
      systemPrompt: 'Stay accurate.',
      startedAt: Date.UTC(2026, 0, 2, 3, 4, 5),
    });
    conversation.conversationSystemPrompt = 'Use classroom examples.';
    const firstUser = addMessageToConversation(conversation, 'user', 'Explain momentum.');
    const firstModel = completeModelMessage(
      addMessageToConversation(conversation, 'model', '', { parentId: firstUser.id }),
      'Momentum is mass times velocity.',
    );
    const branchUser = addMessageToConversation(conversation, 'user', 'Use a soccer example.', {
      parentId: firstModel.id,
    });
    const branchModel = completeModelMessage(
      addMessageToConversation(conversation, 'model', '', { parentId: branchUser.id }),
      'A fast soccer ball has more momentum than a slow one.',
    );
    addMessageToConversation(conversation, 'user', 'Use a bowling example.', {
      parentId: firstModel.id,
    });

    conversation.activeLeafMessageId = branchModel.id;

    const payload = buildConversationDownloadPayload(conversation, {
      modelId: 'test-model',
      temperature: 0.7,
      exportedAt: '2026-01-02T04:05:06.000Z',
    });

    expect(payload).toEqual({
      conversation: {
        name: 'Physics Notes',
        startedAt: '2026-01-02T03:04:05.000Z',
        startedAtMs: Date.UTC(2026, 0, 2, 3, 4, 5),
        exportedAt: '2026-01-02T04:05:06.000Z',
      },
      model: 'test-model',
      temperature: 0.7,
      systemPrompt: 'Stay accurate.\n\nUse classroom examples.',
      exchanges: [
        {
          heading: 'User prompt 1',
          role: 'user',
          event: 'entered',
          timestamp: expect.any(String),
          timestampMs: expect.any(Number),
          text: 'Explain momentum.',
        },
        {
          heading: 'Model response 1',
          role: 'model',
          event: 'generated',
          timestamp: expect.any(String),
          timestampMs: expect.any(Number),
          text: 'Momentum is mass times velocity.',
        },
        {
          heading: 'User prompt 2',
          role: 'user',
          event: 'entered',
          timestamp: expect.any(String),
          timestampMs: expect.any(Number),
          text: 'Use a soccer example.',
        },
        {
          heading: 'Model response 2',
          role: 'model',
          event: 'generated',
          timestamp: expect.any(String),
          timestampMs: expect.any(Number),
          text: 'A fast soccer ball has more momentum than a slow one.',
        },
      ],
    });

    const markdown = buildConversationDownloadMarkdown(payload);

    expect(markdown).toContain('# Physics Notes');
    expect(markdown).toContain('## System prompt');
    expect(markdown).toContain('> Stay accurate.');
    expect(markdown).toContain('> Use classroom examples.');
    expect(markdown).toContain('## User prompt 2');
    expect(markdown).toContain('> Use a soccer example.');
    expect(markdown).not.toContain('bowling');
  });
});
