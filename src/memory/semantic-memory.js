export const MEMORY_DOMAINS = Object.freeze(['self', 'users', 'people', 'home', 'world']);

export const MEMORY_KINDS = Object.freeze([
  'preference',
  'plan',
  'task',
  'fact',
  'relationship',
  'summary',
]);

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'had',
  'has',
  'have',
  'he',
  'her',
  'here',
  'him',
  'his',
  'i',
  'if',
  'in',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'she',
  'that',
  'the',
  'their',
  'them',
  'there',
  'they',
  'this',
  'to',
  'us',
  'was',
  'we',
  'were',
  'with',
  'you',
  'your',
]);

const VERB_WORDS = new Set([
  'am',
  'are',
  'avoid',
  'be',
  'bring',
  'buy',
  'call',
  'called',
  'can',
  'cannot',
  'do',
  'does',
  'doing',
  'dont',
  'go',
  'going',
  'have',
  'keep',
  'like',
  'likes',
  'live',
  'love',
  'need',
  'prefer',
  'remember',
  'schedule',
  'study',
  'use',
  'used',
  'want',
  'wants',
  'will',
  'work',
]);

const TIME_PATTERN_SPECS = Object.freeze([
  { pattern: /\b(now|today|currently|right now)\b/i, category: 'present', label: 'now' },
  {
    pattern: /\b(tonight|tomorrow|later|soon|next\s+\w+|upcoming|scheduled)\b/i,
    category: 'future',
    label: 'future',
  },
  {
    pattern: /\b(yesterday|last\s+\w+|ago|earlier|previously|before)\b/i,
    category: 'past',
    label: 'past',
  },
]);

const SECTION_HEADINGS = Object.freeze([
  'Summary:',
  'Open threads:',
  'User preferences and constraints:',
  'Files carried forward:',
]);

function coerceString(value) {
  return typeof value === 'string' ? value : String(value ?? '');
}

export function normalizeMemoryDomain(domain) {
  const normalizedDomain = coerceString(domain).trim().toLowerCase();
  return MEMORY_DOMAINS.includes(normalizedDomain) ? normalizedDomain : 'world';
}

export function normalizeMemoryKind(kind) {
  const normalizedKind = coerceString(kind).trim().toLowerCase();
  return MEMORY_KINDS.includes(normalizedKind) ? normalizedKind : 'fact';
}

export function normalizeMemoryIdea(idea) {
  return coerceString(idea)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/[.!?;,:\s]+$/g, '')
    .trim();
}

function slugifySegment(value, fallback = 'topic') {
  const normalized = coerceString(value)
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return normalized || fallback;
}

function uniqueBy(items, createKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = createKey(item);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function tokenizeText(value) {
  return normalizeMemoryIdea(value)
    .toLowerCase()
    .match(/[a-z0-9']+/g)?.map((token) => token.replace(/^'+|'+$/g, ''))?.filter(Boolean) || [];
}

export function getContentTokens(value) {
  return uniqueBy(
    tokenizeText(value).filter((token) => !STOP_WORDS.has(token)),
    (token) => token
  );
}

function capitalizeSentenceStart(value) {
  const text = normalizeMemoryIdea(value);
  if (!text) {
    return '';
  }
  return text.slice(0, 1).toUpperCase() + text.slice(1);
}

function splitIdeas(text) {
  return coerceString(text)
    .replace(/\r\n?/g, '\n')
    .split(/(?:\n+|(?<=[.!?])\s+)/)
    .map((part) => normalizeMemoryIdea(part))
    .filter(Boolean);
}

function isQuestionLike(text) {
  return /\?\s*$/.test(coerceString(text).trim());
}

function hasExplicitMemorySignal(text) {
  return /\b(remember|note that|keep in mind|dont forget|don't forget)\b/i.test(text);
}

function hasPreferenceSignal(text) {
  return /\b(prefer|like|love|hate|dislike|avoid|favorite|do not want|does not want|don't want|never want|please|must|cannot|can't|should not)\b/i.test(
    text
  );
}

function hasPlanSignal(text) {
  return /\b(tonight|tomorrow|later|soon|next\s+\w+|going to|will|scheduled|plan to|plans to|by \d|at \d)\b/i.test(
    text
  );
}

function hasTaskSignal(text) {
  return /\b(need to|needs to|have to|has to|must|todo|to do|follow up|pending|remind)\b/i.test(
    text
  );
}

function hasFactSignal(text) {
  return /\b(is|are|was|were|uses|used|works at|studies at|lives in|my name is|i am|i'm)\b/i.test(
    text
  );
}

function hasRelationshipSignal(text) {
  return /\b(friend|teacher|advisor|roommate|mom|mother|dad|father|partner|wife|husband|child|daughter|son|professor)\b/i.test(
    text
  );
}

function isMemoryWorthyIdea(text) {
  const normalizedText = normalizeMemoryIdea(text);
  if (!normalizedText || normalizedText.length < 8 || isQuestionLike(normalizedText)) {
    return false;
  }
  return (
    hasExplicitMemorySignal(normalizedText) ||
    hasPreferenceSignal(normalizedText) ||
    hasPlanSignal(normalizedText) ||
    hasTaskSignal(normalizedText) ||
    hasFactSignal(normalizedText) ||
    hasRelationshipSignal(normalizedText)
  );
}

function normalizeForComparison(value) {
  return getContentTokens(value).join(' ');
}

function detectNegation(text) {
  return /\b(no|not|never|dont|don't|cannot|can't|without)\b/i.test(text);
}

function extractNamedEntities(text) {
  return uniqueBy(
    coerceString(text).match(/\b(?:[A-Z]{2,}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g) || [],
    (value) => value.toLowerCase()
  );
}

function extractTimeExpressions(text) {
  const matches = [];
  TIME_PATTERN_SPECS.forEach((spec) => {
    const match = coerceString(text).match(spec.pattern);
    if (match?.[0]) {
      matches.push({
        type: 'time',
        value: match[0],
        norm: slugifySegment(match[0], spec.label),
        category: spec.category,
        position: match.index ?? null,
      });
    }
  });
  return matches;
}

function inferSubjectToken(text) {
  const lowerText = coerceString(text).toLowerCase();
  if (/\b(i|my|me|we|our|us)\b/.test(lowerText)) {
    return 'user';
  }
  if (/\b(assistant|agent|model|app|system)\b/.test(lowerText)) {
    return 'assistant';
  }
  const firstEntity = extractNamedEntities(text)[0];
  if (firstEntity) {
    return firstEntity;
  }
  const tokens = tokenizeText(text).filter((token) => !STOP_WORDS.has(token));
  return tokens[0] || 'topic';
}

function inferVerbToken(text) {
  return tokenizeText(text).find((token) => VERB_WORDS.has(token.replace(/'/g, ''))) || '';
}

function inferObjectTokens(text, subjectToken = '', verbToken = '') {
  const blocked = new Set([
    slugifySegment(subjectToken),
    slugifySegment(verbToken),
    'user',
    'assistant',
    'future',
    'past',
    'now',
  ]);
  return uniqueBy(
    getContentTokens(text)
      .filter((token) => !VERB_WORDS.has(token))
      .filter((token) => !blocked.has(slugifySegment(token))),
    (token) => token
  ).slice(0, 3);
}

export function deriveSemanticAnchors(idea) {
  const normalizedIdea = normalizeMemoryIdea(idea);
  if (!normalizedIdea) {
    return [];
  }
  const subject = inferSubjectToken(normalizedIdea);
  const verb = inferVerbToken(normalizedIdea);
  const namedEntities = extractNamedEntities(normalizedIdea);
  const objectTokens = inferObjectTokens(normalizedIdea, subject, verb);
  const anchors = [];

  if (subject) {
    anchors.push({
      type: 'subject',
      value: subject,
      norm: slugifySegment(subject),
      position: null,
    });
  }
  if (verb) {
    anchors.push({
      type: 'verb',
      value: verb,
      norm: slugifySegment(verb),
      position: normalizedIdea.toLowerCase().indexOf(verb.toLowerCase()),
    });
  }
  namedEntities.forEach((entity) => {
    anchors.push({
      type: 'entity',
      value: entity,
      norm: slugifySegment(entity),
      position: normalizedIdea.indexOf(entity),
    });
  });
  objectTokens.forEach((token) => {
    anchors.push({
      type: 'object',
      value: token,
      norm: slugifySegment(token),
      position: normalizedIdea.toLowerCase().indexOf(token.toLowerCase()),
    });
  });
  extractTimeExpressions(normalizedIdea).forEach((anchor) => {
    anchors.push(anchor);
  });
  if (detectNegation(normalizedIdea)) {
    anchors.push({
      type: 'negation',
      value: 'not',
      norm: 'not',
      position: normalizedIdea.toLowerCase().search(/\b(no|not|never|dont|don't|cannot|can't|without)\b/),
    });
  }
  return uniqueBy(anchors, (anchor) => `${anchor.type}:${anchor.norm}`);
}

function buildPreferencePath(domain, subject, idea) {
  if (/\bspelling\b/i.test(idea) && /\bcall(?:ed)? out\b/i.test(idea) && detectNegation(idea)) {
    return `${domain}.${subject}.preferences.spelling.no_callout`;
  }
  const objects = inferObjectTokens(idea, subject).slice(0, 2).map((token) => slugifySegment(token));
  return `${domain}.${subject}.preferences.${objects.join('.') || 'general'}`;
}

function buildPlanPath(domain, subject, idea) {
  const objects = inferObjectTokens(idea, subject)
    .filter((token) => !/\b(today|tomorrow|tonight|later|soon)\b/i.test(token))
    .map((token) => slugifySegment(token))
    .slice(0, 2);
  const timeAnchor = extractTimeExpressions(idea)[0]?.norm || '';
  const detail = [...objects, timeAnchor].filter(Boolean).join('.');
  return `${domain}.${subject}.plans.${detail || 'next'}`;
}

function buildWorldFactPath(domain, idea) {
  const match = coerceString(idea).match(/^\s*([A-Z][A-Za-z0-9.+-]*)\s+is\s+the\s+(.+?)\s+used by\s+([A-Z][A-Za-z0-9.+-]*)\s*$/);
  if (match) {
    const item = slugifySegment(match[1]);
    const category = /\blms\b/i.test(match[2]) ? 'platforms' : slugifySegment(match[2], 'facts');
    const owner = slugifySegment(match[3]);
    return `${domain}.${owner}.${category}.${item}`;
  }
  return '';
}

export function deriveSemanticPaths({ domain, kind, idea, anchors = [] }) {
  const normalizedDomain = normalizeMemoryDomain(domain);
  const normalizedKind = normalizeMemoryKind(kind);
  const normalizedIdea = normalizeMemoryIdea(idea);
  if (!normalizedIdea) {
    return [];
  }
  const subject =
    anchors.find((anchor) => anchor.type === 'subject')?.norm ||
    slugifySegment(inferSubjectToken(normalizedIdea), 'topic');
  const paths = [];

  if (normalizedKind === 'preference') {
    paths.push(buildPreferencePath(normalizedDomain, subject, normalizedIdea));
  } else if (normalizedKind === 'plan' || normalizedKind === 'task') {
    paths.push(buildPlanPath(normalizedDomain, subject, normalizedIdea));
  } else if (normalizedKind === 'fact') {
    const worldFactPath = buildWorldFactPath(normalizedDomain, normalizedIdea);
    if (worldFactPath) {
      paths.push(worldFactPath);
    }
  }

  const detailTokens = uniqueBy(
    anchors
      .filter((anchor) => anchor.type === 'entity' || anchor.type === 'object' || anchor.type === 'time')
      .map((anchor) => anchor.norm)
      .filter(Boolean)
      .filter((segment) => segment !== subject),
    (segment) => segment
  ).slice(0, 3);
  const bucket =
    normalizedKind === 'fact'
      ? 'facts'
      : normalizedKind === 'relationship'
        ? 'relationships'
        : normalizedKind === 'summary'
          ? 'summaries'
          : normalizedKind === 'task'
            ? 'tasks'
            : normalizedKind === 'plan'
              ? 'plans'
              : 'preferences';
  paths.push(`${normalizedDomain}.${subject}.${bucket}.${detailTokens.join('.') || 'general'}`);
  return uniqueBy(
    paths.filter(Boolean).map((path) => path.replace(/\.+/g, '.').replace(/\.$/, '')),
    (path) => path
  );
}

export function parseTemporalRelevance(input = 'now') {
  const normalizedInput = coerceString(input).trim().toLowerCase() || 'now';
  if (normalizedInput === 'now') {
    return {
      raw: 'now',
      valid: true,
      direction: 'present',
      offsetMs: 0,
    };
  }
  const match = normalizedInput.match(/^([+-])(\d+)([hdwmy])$/);
  if (!match) {
    return {
      raw: normalizedInput,
      valid: false,
      direction: 'present',
      offsetMs: 0,
    };
  }
  const sign = match[1] === '+' ? 1 : -1;
  const amount = Number.parseInt(match[2], 10);
  const unit = match[3];
  const unitMs =
    unit === 'h'
      ? 60 * 60 * 1000
      : unit === 'd'
        ? 24 * 60 * 60 * 1000
        : unit === 'w'
          ? 7 * 24 * 60 * 60 * 1000
          : unit === 'm'
            ? 30 * 24 * 60 * 60 * 1000
            : 365 * 24 * 60 * 60 * 1000;
  return {
    raw: normalizedInput,
    valid: true,
    direction: sign > 0 ? 'future' : 'past',
    offsetMs: sign * amount * unitMs,
  };
}

export function inferTemporalRelevanceFromIdea(idea) {
  const normalizedIdea = normalizeMemoryIdea(idea);
  if (!normalizedIdea) {
    return 'now';
  }
  const match = TIME_PATTERN_SPECS.find((spec) => spec.pattern.test(normalizedIdea));
  if (!match) {
    return 'now';
  }
  if (match.category === 'future') {
    return '+1d';
  }
  if (match.category === 'past') {
    return '-1d';
  }
  return 'now';
}

export function classifyMemoryKind(idea, { section = '', sourceType = 'user-message' } = {}) {
  const normalizedIdea = normalizeMemoryIdea(idea);
  const normalizedSection = normalizeMemoryIdea(section).toLowerCase();
  if (normalizedSection === 'user preferences and constraints') {
    return 'preference';
  }
  if (normalizedSection === 'open threads') {
    return hasTaskSignal(normalizedIdea) ? 'task' : 'plan';
  }
  if (normalizedSection === 'summary' && sourceType === 'summary') {
    return 'summary';
  }
  if (hasPreferenceSignal(normalizedIdea)) {
    return 'preference';
  }
  if (hasTaskSignal(normalizedIdea)) {
    return 'task';
  }
  if (hasPlanSignal(normalizedIdea)) {
    return 'plan';
  }
  if (hasRelationshipSignal(normalizedIdea)) {
    return 'relationship';
  }
  if (sourceType === 'summary') {
    return 'summary';
  }
  return 'fact';
}

export function inferMemoryDomain(idea, { kind = 'fact' } = {}) {
  const normalizedIdea = normalizeMemoryIdea(idea);
  const normalizedKind = normalizeMemoryKind(kind);
  if (/\b(assistant|agent|model|app|system|prompt)\b/i.test(normalizedIdea)) {
    return 'self';
  }
  if (normalizedKind === 'preference' || /\b(i|my|me|we|our|us)\b/i.test(normalizedIdea)) {
    return 'users';
  }
  if (/\b(home|house|apartment|room|kitchen|dorm|household)\b/i.test(normalizedIdea)) {
    return 'home';
  }
  if (normalizedKind === 'relationship') {
    return 'people';
  }
  if (/\b(friend|teacher|advisor|roommate|mom|mother|dad|father|partner|wife|husband|child|daughter|son|professor)\b/i.test(
    normalizedIdea
  )) {
    return 'people';
  }
  return 'world';
}

function getMemoryProfile(kind) {
  switch (normalizeMemoryKind(kind)) {
    case 'preference':
      return { strength: 1.45, decayRate: 0.012 };
    case 'plan':
      return { strength: 1.2, decayRate: 0.09 };
    case 'task':
      return { strength: 1.15, decayRate: 0.08 };
    case 'relationship':
      return { strength: 1.1, decayRate: 0.025 };
    case 'summary':
      return { strength: 0.85, decayRate: 0.04 };
    case 'fact':
    default:
      return { strength: 1.0, decayRate: 0.03 };
  }
}

function buildSourceRef(source = {}, sourceType = 'user-message') {
  return {
    sourceType,
    conversationId:
      typeof source?.conversationId === 'string' && source.conversationId.trim()
        ? source.conversationId.trim()
        : '',
    messageId:
      typeof source?.messageId === 'string' && source.messageId.trim() ? source.messageId.trim() : '',
    role: typeof source?.role === 'string' && source.role.trim() ? source.role.trim() : '',
    createdAt: Number.isFinite(source?.createdAt) ? Number(source.createdAt) : Date.now(),
  };
}

function buildMemoryCandidate(idea, { section = '', sourceType = 'user-message', source = {} } = {}) {
  const normalizedIdea = capitalizeSentenceStart(idea);
  if (!normalizedIdea) {
    return null;
  }
  const kind = classifyMemoryKind(normalizedIdea, { section, sourceType });
  const domain = inferMemoryDomain(normalizedIdea, { kind });
  const anchors = deriveSemanticAnchors(normalizedIdea);
  const paths = deriveSemanticPaths({
    domain,
    kind,
    idea: normalizedIdea,
    anchors,
  });
  const profile = getMemoryProfile(kind);
  const timeAnchor = extractTimeExpressions(normalizedIdea)[0];
  return {
    domain,
    kind,
    idea: normalizedIdea,
    normalizedIdea: normalizeForComparison(normalizedIdea) || normalizedIdea.toLowerCase(),
    anchors,
    paths,
    temporalCategory: timeAnchor?.category || 'atemporal',
    strength: profile.strength,
    decayRate: profile.decayRate,
    source: buildSourceRef(source, sourceType),
  };
}

export function extractMemoryCandidatesFromText(text, options = {}) {
  return splitIdeas(text)
    .filter((idea) => isMemoryWorthyIdea(idea))
    .map((idea) => buildMemoryCandidate(idea, options))
    .filter(Boolean);
}

function parseSummarySections(summaryText) {
  const sections = new Map();
  let currentSection = 'Summary';
  sections.set(currentSection, []);
  coerceString(summaryText)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      const matchingHeading = SECTION_HEADINGS.find(
        (heading) => heading.toLowerCase() === trimmed.toLowerCase()
      );
      if (matchingHeading) {
        currentSection = matchingHeading.slice(0, -1);
        if (!sections.has(currentSection)) {
          sections.set(currentSection, []);
        }
        return;
      }
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
      sections.get(currentSection)?.push(trimmed.replace(/^[-*]\s+/, ''));
    });
  return sections;
}

export function extractMemoryCandidatesFromSummary(summaryText, options = {}) {
  const sections = parseSummarySections(summaryText);
  const candidates = [];
  sections.forEach((lines, section) => {
    if (section === 'Files carried forward') {
      return;
    }
    lines.forEach((line) => {
      const candidate = buildMemoryCandidate(line, {
        ...options,
        section,
        sourceType: 'summary',
      });
      if (candidate) {
        candidates.push(candidate);
      }
    });
  });
  return candidates;
}

function createRecordId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `memory-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function memoryKey(candidate) {
  return `${candidate.domain}::${candidate.kind}::${candidate.normalizedIdea}`;
}

function mergeAnchors(existing = [], next = []) {
  return uniqueBy([...existing, ...next], (anchor) => `${anchor.type}:${anchor.norm}`);
}

function mergePaths(existing = [], next = []) {
  return uniqueBy([...existing, ...next], (path) => path);
}

function hasSourceRef(record, sourceRef) {
  return (Array.isArray(record?.sources) ? record.sources : []).some(
    (source) =>
      source?.conversationId === sourceRef.conversationId &&
      source?.messageId === sourceRef.messageId &&
      source?.sourceType === sourceRef.sourceType
  );
}

export function mergeSemanticMemoryRecords(existingRecords = [], candidates = [], now = Date.now()) {
  const nextRecords = existingRecords.map((record) => ({
    ...record,
    anchors: Array.isArray(record.anchors) ? record.anchors.map((anchor) => ({ ...anchor })) : [],
    paths: Array.isArray(record.paths) ? [...record.paths] : [],
    sources: Array.isArray(record.sources) ? record.sources.map((source) => ({ ...source })) : [],
  }));
  const byKey = new Map(nextRecords.map((record) => [memoryKey(record), record]));
  let didChange = false;

  candidates.forEach((candidate) => {
    if (!candidate) {
      return;
    }
    const key = memoryKey(candidate);
    const existing = byKey.get(key);
    if (!existing) {
      const nextRecord = {
        id: createRecordId(),
        domain: candidate.domain,
        kind: candidate.kind,
        idea: candidate.idea,
        normalizedIdea: candidate.normalizedIdea,
        anchors: [...candidate.anchors],
        paths: [...candidate.paths],
        temporalCategory: candidate.temporalCategory,
        strength: candidate.strength,
        decayRate: candidate.decayRate,
        createdAt: now,
        updatedAt: now,
        lastRetrievedAt: null,
        isStale: false,
        sources: [candidate.source],
      };
      nextRecords.push(nextRecord);
      byKey.set(key, nextRecord);
      didChange = true;
      return;
    }
    const sourceAlreadyPresent = hasSourceRef(existing, candidate.source);
    existing.updatedAt = now;
    existing.temporalCategory =
      existing.temporalCategory === 'atemporal' ? candidate.temporalCategory : existing.temporalCategory;
    existing.strength = Math.min(
      4.5,
      Number(existing.strength || 0) + (sourceAlreadyPresent ? 0.02 : 0.22)
    );
    existing.decayRate = Math.min(Number(existing.decayRate || candidate.decayRate), candidate.decayRate);
    existing.anchors = mergeAnchors(existing.anchors, candidate.anchors);
    existing.paths = mergePaths(existing.paths, candidate.paths);
    existing.isStale = false;
    if (!sourceAlreadyPresent) {
      existing.sources = [...existing.sources, candidate.source].slice(-8);
    }
    didChange = true;
  });

  return {
    records: nextRecords,
    didChange,
  };
}

function calculateEffectiveStrength(record, now = Date.now()) {
  const updatedAt = Number.isFinite(record?.updatedAt) ? Number(record.updatedAt) : now;
  const ageDays = Math.max(0, (now - updatedAt) / (24 * 60 * 60 * 1000));
  const decayRate = Number.isFinite(record?.decayRate) ? Number(record.decayRate) : 0.03;
  const baseStrength = Number.isFinite(record?.strength) ? Number(record.strength) : 1;
  return baseStrength * Math.exp(-ageDays * decayRate);
}

function overlapScore(leftTokens, rightTokens) {
  if (!leftTokens.length || !rightTokens.length) {
    return 0;
  }
  const rightSet = new Set(rightTokens);
  const overlapCount = leftTokens.filter((token) => rightSet.has(token)).length;
  return overlapCount / Math.max(leftTokens.length, rightTokens.length);
}

function scoreTemporalFit(record, temporalRelevance) {
  const direction = temporalRelevance?.direction || 'present';
  const category = record?.temporalCategory || 'atemporal';
  if (direction === 'future') {
    return category === 'future' ? 1 : category === 'atemporal' ? 0.45 : 0.15;
  }
  if (direction === 'past') {
    return category === 'past' ? 1 : category === 'atemporal' ? 0.45 : 0.15;
  }
  if (category === 'present') {
    return 1;
  }
  return category === 'atemporal' ? 0.65 : 0.35;
}

export function retrieveSemanticMemories(
  records = [],
  idea,
  { temporalRelevance = 'now', limit = 6, now = Date.now(), conversationId = '' } = {}
) {
  const queryText = normalizeMemoryIdea(idea);
  const queryTokens = getContentTokens(queryText);
  const queryAnchors = deriveSemanticAnchors(queryText);
  const queryAnchorTokens = uniqueBy(
    queryAnchors.map((anchor) => anchor.norm).filter(Boolean),
    (token) => token
  );
  const temporal = parseTemporalRelevance(
    temporalRelevance === 'auto' ? inferTemporalRelevanceFromIdea(queryText) : temporalRelevance
  );
  const normalizedConversationId =
    typeof conversationId === 'string' && conversationId.trim() ? conversationId.trim() : '';

  const matches = records
    .map((record) => {
      const ideaTokens = getContentTokens(record.idea);
      const anchorTokens = uniqueBy(
        (Array.isArray(record.anchors) ? record.anchors : []).map((anchor) => anchor.norm).filter(Boolean),
        (token) => token
      );
      const pathTokens = uniqueBy(
        (Array.isArray(record.paths) ? record.paths : [])
          .flatMap((path) => path.split('.'))
          .map((segment) => segment.trim().toLowerCase())
          .filter(Boolean),
        (token) => token
      );
      const textScore = overlapScore(queryTokens, ideaTokens);
      const anchorScore = overlapScore(queryAnchorTokens, anchorTokens);
      const pathScore = overlapScore(queryTokens, pathTokens);
      const exactScore =
        queryText && record.normalizedIdea === normalizeForComparison(queryText)
          ? 1
          : queryText &&
              (record.idea.toLowerCase().includes(queryText.toLowerCase()) ||
                queryText.toLowerCase().includes(record.idea.toLowerCase()))
            ? 0.55
            : 0;
      const temporalScore = scoreTemporalFit(record, temporal);
      const effectiveStrength = calculateEffectiveStrength(record, now);
      const conversationBias =
        normalizedConversationId &&
        (Array.isArray(record.sources) ? record.sources : []).some(
          (source) => source?.conversationId === normalizedConversationId
        )
          ? 0.18
          : 0;
      const score =
        textScore * 4 +
        anchorScore * 3 +
        pathScore * 1.75 +
        exactScore * 2 +
        temporalScore * 1.4 +
        effectiveStrength +
        conversationBias;
      const stale = effectiveStrength < 0.35;
      return {
        ...record,
        score,
        effectiveStrength,
        temporalScore,
        stale,
      };
    })
    .filter((record) => record.score > 1.2)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.trunc(limit || 6)));

  return {
    query: queryText,
    temporalRelevance: temporal.raw,
    matches,
  };
}

export function buildSemanticMemoryPromptSection(result) {
  const matches = Array.isArray(result?.matches) ? result.matches : [];
  if (!matches.length) {
    return '';
  }
  const lines = ['Relevant semantic memory for this turn:'];
  matches.forEach((match) => {
    const path = Array.isArray(match.paths) && match.paths.length ? match.paths[0] : '';
    const prefix = `[${normalizeMemoryKind(match.kind)}]`;
    if (path) {
      lines.push(`- ${prefix} ${path} :: ${match.idea}`);
      return;
    }
    lines.push(`- ${prefix} ${match.idea}`);
  });
  lines.push(
    'Use retrieved memory only when it materially helps with the current message. If it conflicts with the visible conversation, prefer the visible conversation.'
  );
  return lines.join('\n');
}
