import { describe, expect, test, vi } from 'vitest';

import { createSemanticMemoryController } from '../../src/app/semantic-memory.js';

function createConversation(messages) {
  return {
    id: 'conversation-1',
    activeLeafMessageId: messages[messages.length - 1]?.id || null,
    messageNodes: messages,
  };
}

function getConversationPathMessages(conversation, leafMessageId = conversation?.activeLeafMessageId) {
  if (!conversation || !leafMessageId) {
    return [];
  }
  const byId = new Map((conversation.messageNodes || []).map((message) => [message.id, message]));
  const path = [];
  let cursor = byId.get(leafMessageId) || null;
  while (cursor) {
    path.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) || null : null;
  }
  return path.reverse();
}

describe('semantic-memory controller', () => {
  test('builds a prompt section from remembered user memory', async () => {
    const replaceSemanticMemories = vi.fn(async () => {});
    const controller = createSemanticMemoryController({
      loadSemanticMemories: async () => [],
      replaceSemanticMemories,
      clearSemanticMemories: async () => {},
      getConversationPathMessages,
    });
    const conversation = createConversation([
      {
        id: 'user-1',
        role: 'user',
        text: 'I am going to dinner tonight.',
        createdAt: Date.UTC(2026, 3, 10, 12),
        parentId: null,
      },
      {
        id: 'model-1',
        role: 'model',
        text: 'Noted.',
        createdAt: Date.UTC(2026, 3, 10, 12, 1),
        parentId: 'user-1',
      },
    ]);

    await controller.rememberUserMessage(conversation, conversation.messageNodes[0]);

    const promptSection = controller.buildPromptSection({
      ...conversation,
      activeLeafMessageId: 'user-1',
    });

    expect(replaceSemanticMemories).toHaveBeenCalledTimes(1);
    expect(promptSection).toContain('Relevant semantic memory for this turn:');
    expect(promptSection).toContain('users.user.plans.dinner.tonight');
  });

  test('does not build a prompt section until prompt tokens exceed the context limit', async () => {
    const controller = createSemanticMemoryController({
      loadSemanticMemories: async () => [],
      replaceSemanticMemories: async () => {},
      clearSemanticMemories: async () => {},
      getConversationPathMessages,
    });
    const conversation = createConversation([
      {
        id: 'user-1',
        role: 'user',
        text: 'I am allergic to peanuts.',
        createdAt: Date.UTC(2026, 3, 10, 12),
        parentId: null,
      },
      {
        id: 'model-1',
        role: 'model',
        text: 'Noted.',
        createdAt: Date.UTC(2026, 3, 10, 12, 1),
        parentId: 'user-1',
      },
      {
        id: 'user-2',
        role: 'user',
        text: 'What food should I avoid?',
        createdAt: Date.UTC(2026, 3, 10, 12, 2),
        parentId: 'model-1',
      },
    ]);

    await controller.rememberUserMessage(conversation, conversation.messageNodes[0]);

    const belowLimitPromptSection = controller.buildPromptSection(
      conversation,
      conversation.activeLeafMessageId,
      {
        contextLimitTokens: 100,
        promptTokenCount: 100,
      }
    );
    const aboveLimitPromptSection = controller.buildPromptSection(
      conversation,
      conversation.activeLeafMessageId,
      {
        contextLimitTokens: 100,
        promptTokenCount: 101,
      }
    );

    expect(belowLimitPromptSection).toBe('');
    expect(aboveLimitPromptSection).toContain('Relevant semantic memory for this turn:');
    expect(aboveLimitPromptSection).toContain('allergic to peanuts');
  });

  test('forgets conversation-linked memories without dropping unrelated sources', async () => {
    const persistedStates = [];
    const controller = createSemanticMemoryController({
      loadSemanticMemories: async () => [],
      replaceSemanticMemories: async (records) => {
        persistedStates.push(records);
      },
      clearSemanticMemories: async () => {},
      getConversationPathMessages,
    });

    const firstConversation = createConversation([
      {
        id: 'user-1',
        role: 'user',
        text: 'Canvas is the LMS used by UWM.',
        createdAt: Date.UTC(2026, 3, 10, 12),
        parentId: null,
      },
    ]);
    const secondConversation = createConversation([
      {
        id: 'user-2',
        role: 'user',
        text: 'Canvas is the LMS used by UWM.',
        createdAt: Date.UTC(2026, 3, 11, 12),
        parentId: null,
      },
    ]);
    secondConversation.id = 'conversation-2';

    await controller.rememberUserMessage(firstConversation, firstConversation.messageNodes[0]);
    await controller.rememberUserMessage(secondConversation, secondConversation.messageNodes[0]);
    await controller.forgetConversation('conversation-1');

    const records = controller.getRecords();
    expect(records).toHaveLength(1);
    expect(records[0].sources).toEqual([
      expect.objectContaining({
        conversationId: 'conversation-2',
      }),
    ]);
    expect(persistedStates.at(-1)?.[0]?.sources).toEqual([
      expect.objectContaining({
        conversationId: 'conversation-2',
      }),
    ]);
  });

  test('buildPromptSection only returns memory from the active conversation', async () => {
    const controller = createSemanticMemoryController({
      loadSemanticMemories: async () => [],
      replaceSemanticMemories: async () => {},
      clearSemanticMemories: async () => {},
      getConversationPathMessages,
    });

    const firstConversation = createConversation([
      {
        id: 'user-1',
        role: 'user',
        text: 'I am allergic to peanuts.',
        createdAt: Date.UTC(2026, 3, 10, 12),
        parentId: null,
      },
    ]);
    const secondConversation = createConversation([
      {
        id: 'user-2',
        role: 'user',
        text: 'Can you remind me what I said about peanut allergy?',
        createdAt: Date.UTC(2026, 3, 10, 12, 10),
        parentId: null,
      },
    ]);
    secondConversation.id = 'conversation-2';

    await controller.rememberUserMessage(firstConversation, firstConversation.messageNodes[0]);

    const promptSection = controller.buildPromptSection(secondConversation);

    expect(promptSection).toBe('');
  });

  test('remembers structured summary lines as memory candidates', async () => {
    const controller = createSemanticMemoryController({
      loadSemanticMemories: async () => [],
      replaceSemanticMemories: async () => {},
      clearSemanticMemories: async () => {},
      getConversationPathMessages,
    });
    const conversation = createConversation([]);
    const summaryMessage = {
      id: 'summary-1',
      role: 'summary',
      summary: `Summary:
David is finishing a history paper.

User preferences and constraints:
- David does not want spelling corrections called out.`,
      createdAt: Date.UTC(2026, 3, 10, 12),
    };

    await controller.rememberSummary(conversation, summaryMessage);

    const records = controller.getRecords();
    expect(records.map((record) => record.kind)).toEqual(
      expect.arrayContaining(['summary', 'preference'])
    );
  });
});
