import {
  buildSemanticMemoryPromptSection,
  extractMemoryCandidatesFromSummary,
  extractMemoryCandidatesFromText,
  getContentTokens,
  mergeSemanticMemoryRecords,
  retrieveSemanticMemories,
} from '../memory/semantic-memory.js';

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? 'Unknown error');
}

function findLatestUserMessage(pathMessages = []) {
  for (let index = pathMessages.length - 1; index >= 0; index -= 1) {
    const message = pathMessages[index];
    if (message?.role === 'user' && typeof message.text === 'string' && message.text.trim()) {
      return message;
    }
  }
  return null;
}

function buildSourceOptions(conversation, message, sourceType = 'user-message') {
  return {
    sourceType,
    source: {
      conversationId: conversation?.id || '',
      messageId: message?.id || '',
      role: message?.role || '',
      createdAt: Number.isFinite(message?.createdAt) ? Number(message.createdAt) : Date.now(),
    },
  };
}

/**
 * @param {{
 *   loadSemanticMemories?: () => Promise<any[]>;
 *   replaceSemanticMemories?: (records: any[]) => Promise<void>;
 *   clearSemanticMemories?: () => Promise<void>;
 *   getConversationPathMessages?: (conversation: any, leafMessageId?: string) => any[];
 *   onDebug?: (message: string | { kind?: string; message?: string; details?: string; createdAt?: number }) => void;
 * }} dependencies
 */
export function createSemanticMemoryController(dependencies = {}) {
  const loadSemanticMemories =
    typeof dependencies.loadSemanticMemories === 'function'
      ? dependencies.loadSemanticMemories
      : async () => [];
  const replaceSemanticMemories =
    typeof dependencies.replaceSemanticMemories === 'function'
      ? dependencies.replaceSemanticMemories
      : async (_records) => {};
  const clearSemanticMemories =
    typeof dependencies.clearSemanticMemories === 'function'
      ? dependencies.clearSemanticMemories
      : async () => {};
  const getConversationPathMessages =
    typeof dependencies.getConversationPathMessages === 'function'
      ? dependencies.getConversationPathMessages
      : (_conversation, _leafMessageId) => [];
  const onDebug = typeof dependencies.onDebug === 'function' ? dependencies.onDebug : () => {};

  let records = [];

  async function persistRecords() {
    await replaceSemanticMemories(records);
  }

  async function restore() {
    const loadedRecords = await loadSemanticMemories();
    records = Array.isArray(loadedRecords) ? loadedRecords : [];
    return records;
  }

  function getRecords() {
    return records.map((record) => ({
      ...record,
      anchors: Array.isArray(record.anchors) ? record.anchors.map((anchor) => ({ ...anchor })) : [],
      paths: Array.isArray(record.paths) ? [...record.paths] : [],
      sources: Array.isArray(record.sources) ? record.sources.map((source) => ({ ...source })) : [],
    }));
  }

  async function rememberFromCandidates(candidates, debugLabel = 'semantic memory') {
    const { records: nextRecords, didChange } = mergeSemanticMemoryRecords(records, candidates);
    records = nextRecords;
    if (!didChange) {
      return [];
    }
    try {
      await persistRecords();
    } catch (error) {
      onDebug({
        kind: 'semantic-memory',
        message: `${debugLabel} persistence failed.`,
        details: toErrorMessage(error),
      });
    }
    return candidates;
  }

  async function rememberUserMessage(conversation, userMessage) {
    if (!conversation || userMessage?.role !== 'user') {
      return [];
    }
    const candidates = extractMemoryCandidatesFromText(userMessage.text || '', buildSourceOptions(conversation, userMessage));
    return rememberFromCandidates(candidates, 'User memory');
  }

  async function rememberSummary(conversation, summaryMessage) {
    if (!conversation || summaryMessage?.role !== 'summary') {
      return [];
    }
    const candidates = extractMemoryCandidatesFromSummary(
      summaryMessage.summary || summaryMessage.text || '',
      buildSourceOptions(conversation, summaryMessage, 'summary')
    );
    return rememberFromCandidates(candidates, 'Summary memory');
  }

  function buildPromptSection(conversation, leafMessageId = conversation?.activeLeafMessageId) {
    if (!conversation) {
      return '';
    }
    const pathMessages = getConversationPathMessages(conversation, leafMessageId);
    const latestUserMessage = findLatestUserMessage(pathMessages);
    const queryText = latestUserMessage?.text || '';
    if (!getContentTokens(queryText).length) {
      return '';
    }
    const result = retrieveSemanticMemories(records, queryText, {
      temporalRelevance: 'auto',
      limit: 6,
      conversationId: conversation.id,
    });
    return buildSemanticMemoryPromptSection(result);
  }

  async function forgetConversation(conversationId) {
    const normalizedConversationId =
      typeof conversationId === 'string' && conversationId.trim() ? conversationId.trim() : '';
    if (!normalizedConversationId) {
      return false;
    }
    let didChange = false;
    const nextRecords = records
      .map((record) => {
        const nextSources = (Array.isArray(record.sources) ? record.sources : []).filter(
          (source) => source?.conversationId !== normalizedConversationId
        );
        if (nextSources.length !== (Array.isArray(record.sources) ? record.sources.length : 0)) {
          didChange = true;
        }
        if (!nextSources.length) {
          return null;
        }
        return {
          ...record,
          conversationId:
            (Array.isArray(nextSources) ? nextSources : []).find(
              (source) => typeof source?.conversationId === 'string' && source.conversationId.trim()
            )?.conversationId || '',
          sources: nextSources,
        };
      })
      .filter(Boolean);
    if (!didChange) {
      return false;
    }
    records = nextRecords;
    try {
      await persistRecords();
    } catch (error) {
      onDebug({
        kind: 'semantic-memory',
        message: 'Conversation memory cleanup failed.',
        details: toErrorMessage(error),
      });
    }
    return true;
  }

  async function clear() {
    records = [];
    try {
      await clearSemanticMemories();
    } catch (error) {
      onDebug({
        kind: 'semantic-memory',
        message: 'Clearing semantic memory failed.',
        details: toErrorMessage(error),
      });
    }
  }

  return {
    buildPromptSection,
    clear,
    forgetConversation,
    getRecords,
    rememberSummary,
    rememberUserMessage,
    restore,
  };
}
