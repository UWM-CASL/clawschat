import { describe, expect, test } from 'vitest';

import {
  buildSemanticMemoryPromptSection,
  extractMemoryCandidatesFromSummary,
  extractMemoryCandidatesFromText,
  mergeSemanticMemoryRecords,
  parseTemporalRelevance,
  retrieveSemanticMemories,
} from '../../src/memory/semantic-memory.js';

describe('semantic-memory', () => {
  test('extracts a preference memory with a stable path', () => {
    const [candidate] = extractMemoryCandidatesFromText(
      'David does not want spelling corrections called out.'
    );

    expect(candidate).toMatchObject({
      domain: 'users',
      kind: 'preference',
      temporalCategory: 'atemporal',
    });
    expect(candidate.paths).toContain('users.david.preferences.spelling.no_callout');
  });

  test('extracts a future plan memory with a dinner path', () => {
    const [candidate] = extractMemoryCandidatesFromText('I am going to dinner tonight.');

    expect(candidate).toMatchObject({
      domain: 'users',
      kind: 'plan',
      temporalCategory: 'future',
    });
    expect(candidate.paths).toContain('users.user.plans.dinner.tonight');
  });

  test('extracts a world fact path for Canvas at UWM', () => {
    const [candidate] = extractMemoryCandidatesFromText('Canvas is the LMS used by UWM.');

    expect(candidate).toMatchObject({
      domain: 'world',
      kind: 'fact',
    });
    expect(candidate.paths).toContain('world.uwm.platforms.canvas');
  });

  test('parses explicit temporal relevance values', () => {
    expect(parseTemporalRelevance('now')).toMatchObject({
      valid: true,
      direction: 'present',
      offsetMs: 0,
    });
    expect(parseTemporalRelevance('+6h')).toMatchObject({
      valid: true,
      direction: 'future',
    });
    expect(parseTemporalRelevance('-2d')).toMatchObject({
      valid: true,
      direction: 'past',
    });
    expect(parseTemporalRelevance('tomorrow')).toMatchObject({
      valid: false,
      direction: 'present',
    });
  });

  test('retrieves the most relevant plan for a dinner query', () => {
    const { records } = mergeSemanticMemoryRecords(
      [],
      [
        ...extractMemoryCandidatesFromText('I am going to dinner tonight.'),
        ...extractMemoryCandidatesFromText('Canvas is the LMS used by UWM.'),
      ],
      Date.UTC(2026, 3, 10)
    );

    const result = retrieveSemanticMemories(records, 'dinner plans', {
      temporalRelevance: 'now',
      now: Date.UTC(2026, 3, 10, 12),
    });

    expect(result.matches[0]).toMatchObject({
      kind: 'plan',
      idea: 'I am going to dinner tonight',
    });
  });

  test('keeps records isolated per conversation when the ideas match', () => {
    const firstConversationCandidates = extractMemoryCandidatesFromText('I prefer oat milk.', {
      source: {
        conversationId: 'conversation-1',
        messageId: 'user-1',
        role: 'user',
        createdAt: Date.UTC(2026, 3, 10, 12),
      },
    });
    const secondConversationCandidates = extractMemoryCandidatesFromText('I prefer oat milk.', {
      source: {
        conversationId: 'conversation-2',
        messageId: 'user-2',
        role: 'user',
        createdAt: Date.UTC(2026, 3, 10, 12, 1),
      },
    });

    const { records } = mergeSemanticMemoryRecords(
      [],
      [...firstConversationCandidates, ...secondConversationCandidates],
      Date.UTC(2026, 3, 10, 12, 2)
    );

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.conversationId)).toEqual(
      expect.arrayContaining(['conversation-1', 'conversation-2'])
    );
  });

  test('does not retrieve semantic memory from a different conversation', () => {
    const { records } = mergeSemanticMemoryRecords(
      [],
      extractMemoryCandidatesFromText('I am allergic to peanuts.', {
        source: {
          conversationId: 'conversation-1',
          messageId: 'user-1',
          role: 'user',
          createdAt: Date.UTC(2026, 3, 10, 12),
        },
      }),
      Date.UTC(2026, 3, 10, 12, 10)
    );

    const wrongConversationResult = retrieveSemanticMemories(records, 'peanut allergy', {
      conversationId: 'conversation-2',
      temporalRelevance: 'now',
      now: Date.UTC(2026, 3, 10, 12, 20),
    });
    const rightConversationResult = retrieveSemanticMemories(records, 'peanut allergy', {
      conversationId: 'conversation-1',
      temporalRelevance: 'now',
      now: Date.UTC(2026, 3, 10, 12, 20),
    });

    expect(wrongConversationResult.matches).toHaveLength(0);
    expect(rightConversationResult.matches[0]).toMatchObject({
      conversationId: 'conversation-1',
      idea: 'I am allergic to peanuts',
    });
  });

  test('extracts multiple summary memories from structured headings', () => {
    const candidates = extractMemoryCandidatesFromSummary(`Summary:
David is finishing a history paper.

Open threads:
- Follow up on the library citation rule.

User preferences and constraints:
- David does not want spelling corrections called out.
`);

    expect(candidates.map((candidate) => candidate.kind)).toEqual(
      expect.arrayContaining(['summary', 'task', 'preference'])
    );
  });

  test('builds a compact prompt section from retrieved matches', () => {
    const { records } = mergeSemanticMemoryRecords(
      [],
      extractMemoryCandidatesFromText('Canvas is the LMS used by UWM.'),
      Date.UTC(2026, 3, 10)
    );
    const result = retrieveSemanticMemories(records, 'Canvas at UWM', {
      temporalRelevance: 'now',
      now: Date.UTC(2026, 3, 10, 12),
    });

    expect(buildSemanticMemoryPromptSection(result)).toContain(
      '[fact] world.uwm.platforms.canvas :: Canvas is the LMS used by UWM'
    );
  });
});
