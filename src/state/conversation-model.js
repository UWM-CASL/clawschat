const TITLE_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'i',
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
  'that',
  'the',
  'this',
  'to',
  'we',
  'with',
  'you',
  'your',
]);

function normalizeTimestamp(value) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

function toIsoTimestamp(value) {
  const normalized = normalizeTimestamp(value);
  return normalized ? new Date(normalized).toISOString() : null;
}

function formatUtcTimestamp(value) {
  const dateFromString = typeof value === 'string' && value ? new Date(value) : null;
  const normalizedTimestamp = normalizeTimestamp(value);
  const dateFromTimestamp = normalizedTimestamp ? new Date(normalizedTimestamp) : null;
  const candidateDate =
    dateFromString instanceof Date && Number.isFinite(dateFromString.valueOf())
      ? dateFromString
      : dateFromTimestamp instanceof Date && Number.isFinite(dateFromTimestamp.valueOf())
        ? dateFromTimestamp
        : null;
  if (!candidateDate) {
    return 'Unknown';
  }
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(candidateDate);
}

function toMarkdownBlockquote(text) {
  const normalizedText = String(text || '');
  if (!normalizedText) {
    return '> ';
  }
  return normalizedText
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
}

export function normalizeSystemPrompt(value) {
  const text = String(value ?? '').trim();
  return text ? text.replace(/\r\n?/g, '\n') : '';
}

export function normalizeConversationPromptMode(value) {
  return value !== false;
}

export function getEffectiveConversationSystemPrompt(conversation) {
  const capturedDefaultPrompt = normalizeSystemPrompt(conversation?.systemPrompt);
  const conversationPrompt = normalizeSystemPrompt(conversation?.conversationSystemPrompt);
  const shouldAppendPrompt = normalizeConversationPromptMode(conversation?.appendConversationSystemPrompt);
  if (!conversationPrompt) {
    return capturedDefaultPrompt;
  }
  if (!shouldAppendPrompt) {
    return conversationPrompt;
  }
  if (!capturedDefaultPrompt) {
    return conversationPrompt;
  }
  return `${capturedDefaultPrompt}\n\n${conversationPrompt}`;
}

/**
 * @param {{
 *   id: string;
 *   name?: string;
 *   untitledPrefix?: string;
 *   systemPrompt?: string;
 *   startedAt?: number;
 * }} [options]
 */
export function createConversation(options) {
  const {
    id,
    name,
    untitledPrefix = 'New Conversation',
    systemPrompt = '',
    startedAt = Date.now(),
  } = options || {};
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('Conversation id is required.');
  }
  return {
    id: id.trim(),
    name: name || untitledPrefix,
    systemPrompt: normalizeSystemPrompt(systemPrompt),
    conversationSystemPrompt: '',
    appendConversationSystemPrompt: true,
    startedAt: normalizeTimestamp(startedAt) || Date.now(),
    messageNodes: [],
    messageNodeCounter: 0,
    activeLeafMessageId: null,
    lastSpokenLeafMessageId: null,
    hasGeneratedName: false,
  };
}

export function normalizeConversationName(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.length <= 64) {
    return trimmed;
  }
  return `${trimmed.slice(0, 61).trimEnd()}...`;
}

export function parseMessageNodeCounterFromId(nodeId) {
  if (typeof nodeId !== 'string') {
    return 0;
  }
  const match = nodeId.match(/-node-(\d+)$/);
  if (!match) {
    return 0;
  }
  const counter = Number.parseInt(match[1], 10);
  return Number.isInteger(counter) && counter > 0 ? counter : 0;
}

function parseMessageSequenceFromNodeId(nodeId) {
  const sequence = parseMessageNodeCounterFromId(nodeId);
  return Number.isInteger(sequence) && sequence > 0 ? sequence : 0;
}

export function getMessageNodeById(conversation, messageId) {
  if (!conversation || !messageId) {
    return null;
  }
  return conversation.messageNodes.find((message) => message.id === messageId) || null;
}

export function getConversationPathMessages(
  conversation,
  leafMessageId = conversation?.activeLeafMessageId,
) {
  if (!conversation || !leafMessageId) {
    return [];
  }
  const byId = new Map(conversation.messageNodes.map((message) => [message.id, message]));
  const path = [];
  let cursor = byId.get(leafMessageId) || null;
  while (cursor) {
    path.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) || null : null;
  }
  return path.reverse();
}

export function isMessageDescendantOf(conversation, messageId, ancestorId) {
  if (!conversation || !messageId || !ancestorId) {
    return false;
  }
  let cursor = getMessageNodeById(conversation, messageId);
  while (cursor) {
    if (cursor.id === ancestorId) {
      return true;
    }
    cursor = cursor.parentId ? getMessageNodeById(conversation, cursor.parentId) : null;
  }
  return false;
}

function getVisibleMessageRoleSequence(conversation, message) {
  if (!conversation || !message?.id) {
    return 0;
  }
  let userPromptCount = 0;
  let modelResponseCount = 0;
  const visiblePath = getConversationPathMessages(conversation);
  for (const pathMessage of visiblePath) {
    if (pathMessage.role === 'user') {
      userPromptCount += 1;
      if (pathMessage.id === message.id) {
        return userPromptCount;
      }
    } else if (pathMessage.role === 'model') {
      modelResponseCount += 1;
      if (pathMessage.id === message.id) {
        return modelResponseCount;
      }
    }
  }
  return 0;
}

export function deriveConversationName(conversation) {
  const pathMessages = getConversationPathMessages(conversation);
  const firstUserMessage = pathMessages.find((message) => message.role === 'user')?.text || '';
  const firstModelMessage = pathMessages.find((message) => message.role === 'model')?.text || '';
  const source = `${firstUserMessage} ${firstModelMessage}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!source) {
    return conversation?.name || '';
  }

  const scoredTokens = new Map();
  source.split(' ').forEach((token) => {
    if (token.length < 3 || TITLE_STOP_WORDS.has(token)) {
      return;
    }
    const existing = scoredTokens.get(token) || { count: 0, order: scoredTokens.size };
    existing.count += 1;
    scoredTokens.set(token, existing);
  });

  const topTokens = [...scoredTokens.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].order - b[1].order)
    .slice(0, 4)
    .map(([token]) => token.charAt(0).toUpperCase() + token.slice(1));

  if (!topTokens.length) {
    return conversation?.name || '';
  }

  return normalizeConversationName(topTokens.join(' '));
}

export function getModelSiblingMessages(conversation, modelMessage) {
  if (!conversation || !modelMessage || modelMessage.role !== 'model' || !modelMessage.parentId) {
    return [];
  }
  const parentMessage = getMessageNodeById(conversation, modelMessage.parentId);
  if (!parentMessage || parentMessage.role !== 'user') {
    return [];
  }
  return (parentMessage.childIds || [])
    .map((childId) => getMessageNodeById(conversation, childId))
    .filter((child) => child?.role === 'model');
}

export function getUserSiblingMessages(conversation, userMessage) {
  if (!conversation || !userMessage || userMessage.role !== 'user') {
    return [];
  }
  if (!userMessage.parentId) {
    return conversation.messageNodes.filter(
      (candidate) => candidate?.role === 'user' && !candidate.parentId,
    );
  }
  const parentMessage = getMessageNodeById(conversation, userMessage.parentId);
  if (!parentMessage || parentMessage.role !== 'model') {
    return [];
  }
  return (parentMessage.childIds || [])
    .map((childId) => getMessageNodeById(conversation, childId))
    .filter((child) => child?.role === 'user');
}

export function getModelVariantState(conversation, modelMessage) {
  const siblings = getModelSiblingMessages(conversation, modelMessage);
  const index = siblings.findIndex((candidate) => candidate.id === modelMessage.id);
  const total = siblings.length;
  return {
    siblings,
    index,
    total,
    hasVariants: total > 1,
    canGoPrev: index > 0,
    canGoNext: index >= 0 && index < total - 1,
  };
}

export function getUserVariantState(conversation, userMessage) {
  const siblings = getUserSiblingMessages(conversation, userMessage);
  const index = siblings.findIndex((candidate) => candidate.id === userMessage.id);
  const total = siblings.length;
  return {
    siblings,
    index,
    total,
    hasVariants: total > 1,
    canGoPrev: index > 0,
    canGoNext: index >= 0 && index < total - 1,
  };
}

export function getConversationCardHeading(conversation, message) {
  if (!conversation || !message) {
    return '';
  }
  const baseLabel = message.role === 'user' ? 'User Prompt' : 'Model Response';
  const sequence = Math.max(getVisibleMessageRoleSequence(conversation, message), 1);
  const variantState =
    message.role === 'user'
      ? getUserVariantState(conversation, message)
      : getModelVariantState(conversation, message);
  const hasBranch = variantState.total > 1;
  const branchIndex = Math.max(variantState.index + 1, 1);
  return hasBranch
    ? `${baseLabel} ${sequence}, Branch ${branchIndex}`
    : `${baseLabel} ${sequence}`;
}

export function addMessageToConversation(conversation, role, text, options = {}) {
  const normalizedRole = role === 'user' ? 'user' : 'model';
  const normalizedText = String(text || '');
  const hasExplicitParentId = Object.prototype.hasOwnProperty.call(options, 'parentId');
  const requestedParentId = hasExplicitParentId
    ? typeof options.parentId === 'string' && options.parentId.trim()
      ? options.parentId.trim()
      : null
    : conversation.activeLeafMessageId;
  const parentId =
    requestedParentId && getMessageNodeById(conversation, requestedParentId) ? requestedParentId : null;
  const message = {
    id: `${conversation.id}-node-${++conversation.messageNodeCounter}`,
    role: normalizedRole,
    speaker: normalizedRole === 'user' ? 'User' : 'Model',
    text: normalizedText,
    createdAt: normalizeTimestamp(options.createdAt) || Date.now(),
    parentId: parentId || null,
    childIds: [],
  };
  if (normalizedRole === 'model') {
    message.thoughts = '';
    message.response = normalizedText;
    message.hasThinking = false;
    message.isThinkingComplete = false;
    message.isResponseComplete = false;
  }
  conversation.messageNodes.push(message);
  if (parentId) {
    const parentMessage = getMessageNodeById(conversation, parentId);
    if (parentMessage && Array.isArray(parentMessage.childIds)) {
      parentMessage.childIds.push(message.id);
    }
  }
  conversation.activeLeafMessageId = message.id;
  return message;
}

export function pruneDescendantsFromMessage(conversation, messageId) {
  if (!conversation || !messageId) {
    return { removedIds: [], removedCount: 0 };
  }
  const rootMessage = getMessageNodeById(conversation, messageId);
  if (!rootMessage) {
    return { removedIds: [], removedCount: 0 };
  }
  const idsToRemove = new Set();
  const stack = Array.isArray(rootMessage.childIds) ? [...rootMessage.childIds] : [];
  while (stack.length) {
    const candidateId = stack.pop();
    if (!candidateId || idsToRemove.has(candidateId)) {
      continue;
    }
    const candidateMessage = getMessageNodeById(conversation, candidateId);
    if (!candidateMessage) {
      continue;
    }
    idsToRemove.add(candidateId);
    (candidateMessage.childIds || []).forEach((childId) => {
      if (!idsToRemove.has(childId)) {
        stack.push(childId);
      }
    });
  }
  if (!idsToRemove.size) {
    return { removedIds: [], removedCount: 0 };
  }
  conversation.messageNodes = conversation.messageNodes.filter((message) => !idsToRemove.has(message.id));
  conversation.messageNodes.forEach((message) => {
    message.childIds = Array.isArray(message.childIds)
      ? message.childIds.filter((childId) => !idsToRemove.has(childId))
      : [];
  });
  rootMessage.childIds = [];
  if (idsToRemove.has(conversation.activeLeafMessageId)) {
    conversation.activeLeafMessageId = rootMessage.id;
  }
  if (idsToRemove.has(conversation.lastSpokenLeafMessageId)) {
    conversation.lastSpokenLeafMessageId = rootMessage.id;
  }
  return {
    removedIds: [...idsToRemove],
    removedCount: idsToRemove.size,
  };
}

export function findPreferredLeafForVariant(conversation, variantMessage) {
  if (!conversation || !variantMessage) {
    return null;
  }
  const activeLeafId = conversation.activeLeafMessageId;
  if (activeLeafId && isMessageDescendantOf(conversation, activeLeafId, variantMessage.id)) {
    return activeLeafId;
  }
  const lastSpokenLeafId = conversation.lastSpokenLeafMessageId;
  if (lastSpokenLeafId && isMessageDescendantOf(conversation, lastSpokenLeafId, variantMessage.id)) {
    return lastSpokenLeafId;
  }

  const stack = [variantMessage.id];
  let preferredLeafId = variantMessage.id;
  let preferredLeafSequence = parseMessageSequenceFromNodeId(preferredLeafId);
  while (stack.length) {
    const currentId = stack.pop();
    const currentMessage = getMessageNodeById(conversation, currentId);
    if (!currentMessage) {
      continue;
    }
    const childIds = Array.isArray(currentMessage.childIds) ? currentMessage.childIds : [];
    if (!childIds.length) {
      const currentSequence = parseMessageSequenceFromNodeId(currentMessage.id);
      if (currentSequence >= preferredLeafSequence) {
        preferredLeafId = currentMessage.id;
        preferredLeafSequence = currentSequence;
      }
      continue;
    }
    childIds.forEach((childId) => {
      stack.push(childId);
    });
  }
  return preferredLeafId;
}

export function buildConversationMessages(messages, systemPrompt = '') {
  const structuredMessages = [];
  const normalizedSystemPrompt = normalizeSystemPrompt(systemPrompt);
  if (normalizedSystemPrompt) {
    structuredMessages.push({
      role: 'system',
      content: normalizedSystemPrompt,
    });
  }
  messages.forEach((message) => {
    if (!message || (message.role !== 'user' && message.role !== 'model')) {
      return;
    }
    const content = String(message.response || message.text || '').trim();
    if (!content) {
      return;
    }
    structuredMessages.push({
      role: message.role === 'user' ? 'user' : 'assistant',
      content,
    });
  });
  return structuredMessages;
}

export function buildPromptForConversationLeaf(
  conversation,
  leafMessageId = conversation?.activeLeafMessageId,
) {
  return buildConversationMessages(
    getConversationPathMessages(conversation, leafMessageId),
    getEffectiveConversationSystemPrompt(conversation),
  );
}

export function buildConversationDownloadPayload(
  conversation,
  { modelId = 'Unknown', temperature = null, exportedAt = new Date().toISOString() } = {},
) {
  const startedAt = normalizeTimestamp(conversation?.startedAt);
  const exchanges = getConversationPathMessages(conversation)
    .filter((message) => message?.role === 'user' || message?.role === 'model')
    .map((message, index) => {
      const exchangeNumber = Math.floor(index / 2) + 1;
      const isUserMessage = message.role === 'user';
      return {
        heading: `${isUserMessage ? 'User prompt' : 'Model response'} ${exchangeNumber}`,
        role: message.role,
        event: isUserMessage ? 'entered' : 'generated',
        timestamp: toIsoTimestamp(message.createdAt),
        timestampMs: normalizeTimestamp(message.createdAt),
        text: isUserMessage ? String(message.text || '') : String(message.response || message.text || ''),
      };
    });
  const payload = {
    conversation: {
      name: String(conversation?.name || ''),
      startedAt: toIsoTimestamp(startedAt),
      startedAtMs: startedAt,
      exportedAt,
    },
    model: modelId,
    temperature,
    exchanges,
  };
  const systemPrompt = getEffectiveConversationSystemPrompt(conversation);
  if (systemPrompt) {
    payload.systemPrompt = systemPrompt;
  }
  return payload;
}

function buildConversationDownloadFileName(conversationName) {
  const normalizedName = String(conversationName || 'conversation').trim() || 'conversation';
  return (
    normalizedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'conversation'
  );
}

export function buildConversationJsonDownloadFileName(conversationName) {
  return `${buildConversationDownloadFileName(conversationName)}.llm.json`;
}

export function buildConversationMarkdownDownloadFileName(conversationName) {
  return `${buildConversationDownloadFileName(conversationName)}.md`;
}

export function buildConversationDownloadMarkdown(payload) {
  const lines = [];
  lines.push(`# ${String(payload?.conversation?.name || 'Conversation')}`);
  lines.push('');
  lines.push(`- Started At: ${formatUtcTimestamp(payload?.conversation?.startedAt)}`);
  lines.push(`- Exported At: ${formatUtcTimestamp(payload?.conversation?.exportedAt)}`);
  lines.push(`- Model: ${String(payload?.model || 'Unknown')}`);
  lines.push(`- Temperature: ${Number.isFinite(payload?.temperature) ? payload.temperature : 'Unknown'}`);
  lines.push('');
  const systemPrompt = normalizeSystemPrompt(payload?.systemPrompt);
  if (systemPrompt) {
    lines.push('## System prompt');
    lines.push('');
    lines.push(toMarkdownBlockquote(systemPrompt));
    lines.push('');
  }
  const exchanges = Array.isArray(payload?.exchanges) ? payload.exchanges : [];
  exchanges.forEach((exchange) => {
    lines.push(`## ${String(exchange?.heading || 'Exchange')}`);
    lines.push(formatUtcTimestamp(exchange?.timestamp));
    lines.push('');
    lines.push(toMarkdownBlockquote(exchange?.text || ''));
    lines.push('');
  });
  return lines.join('\n');
}
