import { describe, expect, test } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import {
  findEnabledSkillPackageByName,
  parseSkillArchiveBytes,
  getEnabledSkillPackages,
} from '../../src/skills/skill-packages.js';

function buildZip(entries) {
  return zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([path, text]) => [path, strToU8(String(text ?? ''))])
    ),
    { level: 0 }
  );
}

describe('skill-packages', () => {
  test('parses a skill package with one SKILL.md and extra files into a usable disabled skill', () => {
    const skillPackage = parseSkillArchiveBytes(
      buildZip({
        'lesson-planner/SKILL.md': '# Lesson Planner\n\nPlan lessons with objectives and checks.',
        'lesson-planner/README.md': 'extra file',
      }),
      { packageName: 'lesson-planner.zip' }
    );

    expect(skillPackage).toMatchObject({
      packageName: 'lesson-planner.zip',
      name: 'Lesson Planner',
      lookupName: 'lesson planner',
      description: 'Plan lessons with objectives and checks.',
      hasSkillMarkdown: true,
      isUsable: true,
      enabled: false,
      skillFilePath: 'lesson-planner/SKILL.md',
      filePaths: ['lesson-planner/SKILL.md', 'lesson-planner/README.md'],
    });
  });

  test('fails when the zip does not include a SKILL.md file', () => {
    expect(() =>
      parseSkillArchiveBytes(
        buildZip({
          'lesson-planner/README.md': 'extra file',
        }),
        { packageName: 'lesson-planner.zip' }
      )
    ).toThrow('SKILL.md was not found in this package.');
  });

  test('finds an enabled skill by name case-insensitively', () => {
    const disabledSkill = parseSkillArchiveBytes(
      buildZip({
        'lesson-planner/SKILL.md': '# Lesson Planner\n\nPlan lessons with objectives.',
      }),
      { packageName: 'lesson-planner.zip' }
    );
    const enabledSkill = {
      ...disabledSkill,
      enabled: true,
    };

    expect(getEnabledSkillPackages([disabledSkill, enabledSkill])).toHaveLength(1);
    expect(findEnabledSkillPackageByName([disabledSkill, enabledSkill], 'lesson planner')).toMatchObject({
      name: 'Lesson Planner',
      lookupName: 'lesson planner',
    });
  });
});
