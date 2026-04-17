import { describe, expect, test } from 'vitest';
import {
  assertValidCustomOrchestration,
  buildCustomOrchestrationCollectionExportPayload,
  buildCustomOrchestrationTemplate,
  buildSlashCommandLabel,
  matchCustomOrchestrationSlashCommand,
  normalizeSlashCommandName,
  parseCustomOrchestrationImportText,
} from '../../src/orchestrations/custom-orchestrations.js';

describe('custom orchestrations', () => {
  test('normalizes slash command names and labels', () => {
    expect(normalizeSlashCommandName('/Study Guide')).toBe('study-guide');
    expect(normalizeSlashCommandName('review_notes')).toBe('review-notes');
    expect(buildSlashCommandLabel('study-guide')).toBe('/study-guide');
  });

  test('builds a starter template that uses slash-command input', () => {
    expect(
      buildCustomOrchestrationTemplate({
        name: 'Study Guide',
        slashCommandName: 'study-guide',
      })
    ).toEqual(
      expect.objectContaining({
        id: 'study-guide',
        steps: [
          expect.objectContaining({
            prompt: expect.stringContaining('{{userInput}}'),
          }),
        ],
      })
    );
  });

  test('validates a saved custom orchestration record', () => {
    const record = assertValidCustomOrchestration({
      id: 'outline-energy',
      name: 'Outline Energy',
      slashCommandName: 'outline-energy',
      description: 'Outline the user input.',
      definition: {
        id: 'outline-energy',
        steps: [
          {
            prompt: 'Outline the following.\n\n{{userInput}}',
          },
        ],
      },
    });

    expect(record).toMatchObject({
      id: 'outline-energy',
      slashCommandName: 'outline-energy',
      description: 'Outline the user input.',
    });
  });

  test('matches saved slash commands from composer input', () => {
    const match = matchCustomOrchestrationSlashCommand('/outline-energy solar power', [
      {
        id: 'outline-energy',
        name: 'Outline Energy',
        slashCommandName: 'outline-energy',
        definition: {
          id: 'outline-energy',
          steps: [{ prompt: 'Outline {{userInput}}' }],
        },
      },
    ]);

    expect(match).toMatchObject({
      commandName: 'outline-energy',
      slashCommand: '/outline-energy',
      commandText: '/outline-energy solar power',
      userInput: 'solar power',
    });
  });

  test('parses exported collection files', () => {
    const payload = buildCustomOrchestrationCollectionExportPayload([
      {
        id: 'outline-energy',
        name: 'Outline Energy',
        slashCommandName: 'outline-energy',
        updatedAt: 10,
        definition: {
          id: 'outline-energy',
          steps: [{ prompt: 'Outline {{userInput}}' }],
        },
      },
      {
        id: 'rewrite-notes',
        name: 'Rewrite Notes',
        slashCommandName: 'rewrite-notes',
        updatedAt: 20,
        definition: {
          id: 'rewrite-notes',
          steps: [{ prompt: 'Rewrite {{userInput}}' }],
        },
      },
    ]);

    const importedRecords = parseCustomOrchestrationImportText(JSON.stringify(payload));

    expect(importedRecords).toHaveLength(2);
    expect(importedRecords.map((record) => record.slashCommandName)).toEqual([
      'rewrite-notes',
      'outline-energy',
    ]);
  });

  test('rejects reserved slash commands during import', () => {
    expect(() =>
      parseCustomOrchestrationImportText(
        JSON.stringify({
          slashCommandName: 'picard',
          definition: {
            id: 'custom-picard',
            steps: [{ prompt: 'Test {{userInput}}' }],
          },
        })
      )
    ).toThrow('/picard is reserved by the app.');
  });
});
