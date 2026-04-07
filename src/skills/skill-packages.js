import { strFromU8, unzipSync } from 'fflate';

const MAX_DESCRIPTION_LENGTH = 240;
const FALLBACK_SKILL_NAME = 'Uploaded Skill';

function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clipText(value, maxLength = MAX_DESCRIPTION_LENGTH) {
  const normalized = normalizeWhitespace(value);
  if (!normalized || normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function stripFrontMatter(markdown) {
  const normalized = String(markdown ?? '').replace(/\r\n?/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return normalized;
  }
  const closingIndex = normalized.indexOf('\n---\n', 4);
  if (closingIndex < 0) {
    return normalized;
  }
  return normalized.slice(closingIndex + 5);
}

function stripInlineMarkdown(value) {
  return normalizeWhitespace(value).replace(/[*_`~]+/g, '').trim();
}

function normalizeArchivePath(path) {
  return String(path ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '')
    .trim();
}

function shouldIgnoreArchivePath(path) {
  const normalizedPath = normalizeArchivePath(path);
  if (!normalizedPath) {
    return true;
  }
  const segments = normalizedPath.split('/').filter(Boolean);
  const baseName = segments[segments.length - 1]?.toLowerCase() || '';
  return segments.includes('__MACOSX') || baseName === '.ds_store';
}

function humanizePackageBaseName(packageName) {
  const baseName = String(packageName ?? '')
    .trim()
    .replace(/\.zip$/i, '')
    .replace(/\.[^.]+$/, '')
    .trim();
  if (!baseName) {
    return FALLBACK_SKILL_NAME;
  }
  return baseName
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((segment) =>
      segment ? `${segment.charAt(0).toUpperCase()}${segment.slice(1)}` : segment
    )
    .join(' ');
}

function extractFirstHeading(markdown) {
  const headingMatch = stripFrontMatter(markdown).match(/^\s*#\s+(.+?)\s*$/m);
  return headingMatch ? stripInlineMarkdown(headingMatch[1]) : '';
}

function extractFirstParagraph(markdown) {
  const lines = stripFrontMatter(markdown).split('\n');
  const paragraphs = [];
  let currentParagraph = [];
  let inFence = false;

  for (const rawLine of lines) {
    const trimmedLine = rawLine.trim();
    if (/^(```|~~~)/.test(trimmedLine)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    if (!trimmedLine) {
      if (currentParagraph.length) {
        paragraphs.push(currentParagraph.join(' '));
        currentParagraph = [];
      }
      continue;
    }
    if (
      /^#{1,6}\s/.test(trimmedLine) ||
      /^[-*+]\s/.test(trimmedLine) ||
      /^\d+\.\s/.test(trimmedLine) ||
      /^>/.test(trimmedLine) ||
      /^\|/.test(trimmedLine)
    ) {
      if (currentParagraph.length) {
        paragraphs.push(currentParagraph.join(' '));
        currentParagraph = [];
      }
      continue;
    }
    currentParagraph.push(trimmedLine);
    if (paragraphs.length) {
      break;
    }
  }

  if (!paragraphs.length && currentParagraph.length) {
    paragraphs.push(currentParagraph.join(' '));
  }

  return clipText(stripInlineMarkdown(paragraphs[0] || ''));
}

function decodeSkillMarkdown(bytes) {
  try {
    return String(strFromU8(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0), true) ?? '')
      .replace(/\r\n?/g, '\n')
      .trim();
  } catch {
    throw new Error('SKILL.md could not be decoded as text.');
  }
}

export function normalizeSkillLookupName(value) {
  return normalizeWhitespace(value).toLowerCase();
}

export function extractSkillMetadata(markdown, { fallbackName = FALLBACK_SKILL_NAME } = {}) {
  const normalizedMarkdown = String(markdown ?? '').replace(/\r\n?/g, '\n').trim();
  const extractedName = extractFirstHeading(normalizedMarkdown);
  const name = extractedName || humanizePackageBaseName(fallbackName) || FALLBACK_SKILL_NAME;
  const description = extractFirstParagraph(normalizedMarkdown) || 'Uploaded SKILL.md package.';
  return {
    name,
    description,
  };
}

export function normalizeSkillPackage(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const packageName = normalizeWhitespace(value.packageName) || 'skill.zip';
  const skillMarkdown =
    typeof value.skillMarkdown === 'string' ? value.skillMarkdown.replace(/\r\n?/g, '\n').trim() : '';
  const metadata = extractSkillMetadata(skillMarkdown, {
    fallbackName:
      normalizeWhitespace(value.name) ||
      normalizeWhitespace(value.lookupName) ||
      humanizePackageBaseName(packageName),
  });
  const name = normalizeWhitespace(value.name) || metadata.name || FALLBACK_SKILL_NAME;
  const lookupName = normalizeSkillLookupName(value.lookupName || name);
  const filePaths = Array.isArray(value.filePaths)
    ? [...new Set(value.filePaths.map(normalizeArchivePath).filter(Boolean))]
    : [];
  const skillFileMatches = filePaths.filter(
    (entryPath) => entryPath.split('/').pop()?.toLowerCase() === 'skill.md'
  );
  const skillFilePath = normalizeArchivePath(value.skillFilePath);
  const hasMultipleSkillMarkdown = skillFileMatches.length > 1;
  const hasSkillMarkdown =
    !hasMultipleSkillMarkdown &&
    Boolean(
      skillMarkdown ||
        skillFilePath ||
        skillFileMatches.length === 1 ||
        value.hasSkillMarkdown === true
    );
  const isUsable = hasSkillMarkdown && !hasMultipleSkillMarkdown;
  const enabled = isUsable && value.enabled === true;
  let issue = '';
  if (hasMultipleSkillMarkdown) {
    issue = 'This package contains multiple SKILL.md files.';
  } else if (!hasSkillMarkdown) {
    issue = 'SKILL.md was not found in this package.';
  }
  return {
    id: normalizeWhitespace(value.id),
    packageName,
    name,
    lookupName,
    description: clipText(value.description || metadata.description || 'Uploaded SKILL.md package.'),
    importedAt: Number.isFinite(value.importedAt) ? Number(value.importedAt) : Date.now(),
    hasSkillMarkdown,
    isUsable,
    enabled,
    issue,
    skillFilePath,
    skillMarkdown,
    filePaths,
  };
}

export function normalizeSkillPackages(value) {
  return Array.isArray(value)
    ? value
        .map((skillPackage) => normalizeSkillPackage(skillPackage))
        .filter(Boolean)
        .sort((left, right) => right.importedAt - left.importedAt)
    : [];
}

export function getUsableSkillPackages(skillPackages = []) {
  return normalizeSkillPackages(skillPackages).filter(
    (skillPackage) => skillPackage.isUsable && skillPackage.hasSkillMarkdown
  );
}

export function getEnabledSkillPackages(skillPackages = []) {
  return getUsableSkillPackages(skillPackages).filter((skillPackage) => skillPackage.enabled);
}

export function findEnabledSkillPackageByName(skillPackages = [], name = '') {
  const normalizedLookupName = normalizeSkillLookupName(name);
  if (!normalizedLookupName) {
    return null;
  }
  const matches = getEnabledSkillPackages(skillPackages).filter(
    (skillPackage) => skillPackage.lookupName === normalizedLookupName
  );
  if (!matches.length) {
    return null;
  }
  if (matches.length > 1) {
    return {
      ambiguous: true,
      matches,
    };
  }
  return matches[0];
}

export function parseSkillArchiveBytes(bytes, { packageName = 'skill.zip' } = {}) {
  const normalizedBytes =
    bytes instanceof Uint8Array ? bytes : bytes ? new Uint8Array(bytes) : new Uint8Array(0);
  if (!normalizedBytes.byteLength) {
    throw new Error('The selected skill package is empty.');
  }

  let archiveEntries;
  try {
    archiveEntries = unzipSync(normalizedBytes);
  } catch {
    throw new Error('The selected file is not a readable zip archive.');
  }

  const fileEntries = Object.entries(archiveEntries)
    .map(([entryPath, entryBytes]) => ({
      path: normalizeArchivePath(entryPath),
      bytes: entryBytes instanceof Uint8Array ? entryBytes : new Uint8Array(entryBytes || 0),
    }))
    .filter((entry) => entry.path && !shouldIgnoreArchivePath(entry.path));

  if (!fileEntries.length) {
    throw new Error('The selected skill package does not contain any readable files.');
  }

  const skillEntries = fileEntries.filter(
    (entry) => entry.path.split('/').pop()?.toLowerCase() === 'skill.md'
  );
  if (!skillEntries.length) {
    throw new Error('SKILL.md was not found in this package.');
  }
  if (skillEntries.length > 1) {
    throw new Error('This package contains multiple SKILL.md files.');
  }
  const skillFilePath = skillEntries[0].path;
  const skillMarkdown = decodeSkillMarkdown(skillEntries[0].bytes);

  const metadata = extractSkillMetadata(skillMarkdown, {
    fallbackName: humanizePackageBaseName(packageName),
  });

  return normalizeSkillPackage({
    packageName,
    name: metadata.name,
    lookupName: normalizeSkillLookupName(metadata.name),
    description: metadata.description,
    importedAt: Date.now(),
    hasSkillMarkdown: true,
    isUsable: true,
    enabled: false,
    issue: '',
    skillFilePath,
    skillMarkdown,
    filePaths: fileEntries.map((entry) => entry.path),
  });
}
