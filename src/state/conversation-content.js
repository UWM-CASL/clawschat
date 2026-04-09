function normalizeImageContentPart(rawPart) {
  const artifactId = typeof rawPart.artifactId === 'string' ? rawPart.artifactId.trim() : '';
  const mimeType = typeof rawPart.mimeType === 'string' ? rawPart.mimeType.trim() : '';
  const base64 = typeof rawPart.base64 === 'string' ? rawPart.base64.trim() : '';
  const url = typeof rawPart.url === 'string' ? rawPart.url.trim() : '';
  const image = typeof rawPart.image === 'string' ? rawPart.image.trim() : '';
  if (!artifactId && !mimeType && !base64 && !url && !image) {
    return null;
  }
  const normalizedPart = { type: 'image' };
  if (artifactId) {
    normalizedPart.artifactId = artifactId;
  }
  if (mimeType) {
    normalizedPart.mimeType = mimeType;
  }
  if (base64) {
    normalizedPart.base64 = base64;
  }
  if (url) {
    normalizedPart.url = url;
  }
  if (image) {
    normalizedPart.image = image;
  }
  if (typeof rawPart.filename === 'string' && rawPart.filename.trim()) {
    normalizedPart.filename = rawPart.filename.trim();
  }
  if (typeof rawPart.width === 'number' && Number.isFinite(rawPart.width) && rawPart.width > 0) {
    normalizedPart.width = Math.round(rawPart.width);
  }
  if (typeof rawPart.height === 'number' && Number.isFinite(rawPart.height) && rawPart.height > 0) {
    normalizedPart.height = Math.round(rawPart.height);
  }
  if (typeof rawPart.alt === 'string') {
    normalizedPart.alt = rawPart.alt;
  }
  if (typeof rawPart.workspacePath === 'string' && rawPart.workspacePath.trim()) {
    normalizedPart.workspacePath = rawPart.workspacePath.trim();
  }
  return normalizedPart;
}

function normalizeAudioContentPart(rawPart) {
  const artifactId = typeof rawPart.artifactId === 'string' ? rawPart.artifactId.trim() : '';
  const mimeType = typeof rawPart.mimeType === 'string' ? rawPart.mimeType.trim() : '';
  const base64 = typeof rawPart.base64 === 'string' ? rawPart.base64.trim() : '';
  const url = typeof rawPart.url === 'string' ? rawPart.url.trim() : '';
  const samplesBase64 =
    typeof rawPart.samplesBase64 === 'string' ? rawPart.samplesBase64.trim() : '';
  if (!artifactId && !mimeType && !base64 && !url && !samplesBase64) {
    return null;
  }
  const normalizedPart = { type: 'audio' };
  if (artifactId) {
    normalizedPart.artifactId = artifactId;
  }
  if (mimeType) {
    normalizedPart.mimeType = mimeType;
  }
  if (base64) {
    normalizedPart.base64 = base64;
  }
  if (url) {
    normalizedPart.url = url;
  }
  if (samplesBase64) {
    normalizedPart.samplesBase64 = samplesBase64;
  }
  if (typeof rawPart.filename === 'string' && rawPart.filename.trim()) {
    normalizedPart.filename = rawPart.filename.trim();
  }
  if (Number.isFinite(rawPart.size) && rawPart.size >= 0) {
    normalizedPart.size = Math.round(rawPart.size);
  }
  if (Number.isFinite(rawPart.durationSeconds) && rawPart.durationSeconds >= 0) {
    normalizedPart.durationSeconds = rawPart.durationSeconds;
  }
  if (Number.isFinite(rawPart.sampleRate) && rawPart.sampleRate > 0) {
    normalizedPart.sampleRate = Math.round(rawPart.sampleRate);
  }
  if (Number.isFinite(rawPart.sampleCount) && rawPart.sampleCount > 0) {
    normalizedPart.sampleCount = Math.round(rawPart.sampleCount);
  }
  if (typeof rawPart.workspacePath === 'string' && rawPart.workspacePath.trim()) {
    normalizedPart.workspacePath = rawPart.workspacePath.trim();
  }
  return normalizedPart;
}

function normalizeFileContentPart(rawPart) {
  const artifactId = typeof rawPart.artifactId === 'string' ? rawPart.artifactId.trim() : '';
  const mimeType = typeof rawPart.mimeType === 'string' ? rawPart.mimeType.trim() : '';
  const filename = typeof rawPart.filename === 'string' ? rawPart.filename.trim() : '';
  const text = typeof rawPart.text === 'string' ? rawPart.text : '';
  const normalizedText = typeof rawPart.normalizedText === 'string' ? rawPart.normalizedText : '';
  const llmText = typeof rawPart.llmText === 'string' ? rawPart.llmText : '';
  if (
    !artifactId &&
    !mimeType &&
    !filename &&
    !text.trim() &&
    !normalizedText.trim() &&
    !llmText.trim()
  ) {
    return null;
  }
  const normalizedPart = { type: 'file' };
  if (artifactId) {
    normalizedPart.artifactId = artifactId;
  }
  if (mimeType) {
    normalizedPart.mimeType = mimeType;
  }
  if (filename) {
    normalizedPart.filename = filename;
  }
  if (text) {
    normalizedPart.text = text;
  }
  if (normalizedText) {
    normalizedPart.normalizedText = normalizedText;
  }
  if (llmText) {
    normalizedPart.llmText = llmText;
  }
  if (typeof rawPart.normalizedFormat === 'string' && rawPart.normalizedFormat.trim()) {
    normalizedPart.normalizedFormat = rawPart.normalizedFormat.trim().toLowerCase();
  }
  if (Array.isArray(rawPart.conversionWarnings)) {
    const conversionWarnings = rawPart.conversionWarnings
      .filter((warning) => typeof warning === 'string')
      .map((warning) => warning.trim())
      .filter(Boolean);
    if (conversionWarnings.length) {
      normalizedPart.conversionWarnings = conversionWarnings;
    }
  }
  if (rawPart.memoryHint && typeof rawPart.memoryHint === 'object') {
    const ingestible = rawPart.memoryHint.ingestible === true;
    const preferredSource =
      typeof rawPart.memoryHint.preferredSource === 'string'
        ? rawPart.memoryHint.preferredSource.trim()
        : '';
    const documentRole =
      typeof rawPart.memoryHint.documentRole === 'string'
        ? rawPart.memoryHint.documentRole.trim()
        : '';
    if (ingestible || preferredSource || documentRole) {
      normalizedPart.memoryHint = {};
      if (ingestible) {
        normalizedPart.memoryHint.ingestible = true;
      }
      if (preferredSource) {
        normalizedPart.memoryHint.preferredSource = preferredSource;
      }
      if (documentRole) {
        normalizedPart.memoryHint.documentRole = documentRole;
      }
    }
  }
  if (typeof rawPart.extension === 'string' && rawPart.extension.trim()) {
    normalizedPart.extension = rawPart.extension.trim().toLowerCase();
  }
  if (Number.isFinite(rawPart.size) && rawPart.size >= 0) {
    normalizedPart.size = Math.round(rawPart.size);
  }
  if (Number.isFinite(rawPart.pageCount) && rawPart.pageCount > 0) {
    normalizedPart.pageCount = Math.round(rawPart.pageCount);
  }
  if (typeof rawPart.workspacePath === 'string' && rawPart.workspacePath.trim()) {
    normalizedPart.workspacePath = rawPart.workspacePath.trim();
  }
  return normalizedPart;
}

function normalizeMessageContentPart(rawPart) {
  if (!rawPart || typeof rawPart !== 'object') {
    return null;
  }
  if (rawPart.type === 'text') {
    const text = typeof rawPart.text === 'string' ? rawPart.text : '';
    if (!text.trim()) {
      return null;
    }
    return {
      type: 'text',
      text,
    };
  }
  if (rawPart.type === 'image') {
    return normalizeImageContentPart(rawPart);
  }
  if (rawPart.type === 'audio') {
    return normalizeAudioContentPart(rawPart);
  }
  if (rawPart.type === 'file') {
    return normalizeFileContentPart(rawPart);
  }
  return null;
}

export function normalizeMessageContentParts(rawParts, fallbackText = '') {
  const normalizedParts = Array.isArray(rawParts)
    ? rawParts.map(normalizeMessageContentPart).filter(Boolean)
    : [];
  if (normalizedParts.length) {
    return normalizedParts;
  }
  const text = String(fallbackText || '');
  return text.trim()
    ? [
        {
          type: 'text',
          text,
        },
      ]
    : [];
}

export function getTextFromMessageContentParts(parts, fallbackText = '') {
  const normalizedParts = normalizeMessageContentParts(parts, fallbackText);
  const textParts = normalizedParts
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text);
  const joinedText = textParts.join('\n').trim();
  return joinedText || String(fallbackText || '');
}

function buildUserMessageLlmRepresentation(parts, fallbackText = '') {
  const normalizedParts = normalizeMessageContentParts(parts, fallbackText);
  if (!normalizedParts.length) {
    return String(fallbackText || '').trim() ? String(fallbackText || '') : '';
  }

  const llmParts = normalizedParts
    .map((part) => {
      if (part.type === 'text') {
        return {
          type: 'text',
          text: part.text,
        };
      }
      if (part.type === 'image') {
        return { ...part };
      }
      if (part.type === 'audio') {
        return { ...part };
      }
      if (part.type === 'file') {
        const llmText = typeof part.llmText === 'string' ? part.llmText : '';
        if (!llmText.trim()) {
          return null;
        }
        return {
          type: 'text',
          text: llmText,
        };
      }
      return null;
    })
    .filter(Boolean);

  if (!llmParts.length) {
    return getTextFromMessageContentParts(normalizedParts, fallbackText);
  }

  const containsStructuredMedia = llmParts.some(
    (part) => part.type === 'image' || part.type === 'audio'
  );
  if (!containsStructuredMedia) {
    return llmParts
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
      .trim();
  }
  return llmParts;
}

export function setUserMessageText(message, nextText) {
  if (!message || message.role !== 'user') {
    return message;
  }
  const normalizedText = String(nextText || '');
  const normalizedParts = normalizeMessageContentParts(message.content?.parts, normalizedText);
  const nextParts = normalizedParts.filter((part) => part.type !== 'text');
  if (normalizedText.trim()) {
    nextParts.unshift({
      type: 'text',
      text: normalizedText,
    });
  }
  message.text = normalizedText;
  message.content = {
    parts: nextParts,
    llmRepresentation: buildUserMessageLlmRepresentation(nextParts, normalizedText),
  };
  return message;
}

export function buildMessagePromptContent(message) {
  if (!message) {
    return '';
  }
  if (message.role === 'tool') {
    return String(message.toolResult ?? message.text ?? '').trim();
  }
  const explicitLlmRepresentation = message?.content?.llmRepresentation;
  if (message.role !== 'user') {
    if (
      explicitLlmRepresentation &&
      typeof explicitLlmRepresentation === 'object' &&
      explicitLlmRepresentation.type === 'text' &&
      typeof explicitLlmRepresentation.text === 'string'
    ) {
      return explicitLlmRepresentation.text.trim();
    }
    if (typeof explicitLlmRepresentation === 'string' && explicitLlmRepresentation.trim()) {
      return explicitLlmRepresentation.trim();
    }
    return String(message?.response || message?.text || '').trim();
  }
  if (Array.isArray(explicitLlmRepresentation)) {
    const normalizedExplicitParts = normalizeMessageContentParts(explicitLlmRepresentation);
    if (normalizedExplicitParts.length) {
      const containsStructuredMedia = normalizedExplicitParts.some(
        (part) => part.type === 'image' || part.type === 'audio'
      );
      if (containsStructuredMedia) {
        return normalizedExplicitParts.map((part) => ({ ...part }));
      }
      return getTextFromMessageContentParts(normalizedExplicitParts, message.text || '').trim();
    }
  }
  if (
    explicitLlmRepresentation &&
    typeof explicitLlmRepresentation === 'object' &&
    explicitLlmRepresentation.type === 'text' &&
    typeof explicitLlmRepresentation.text === 'string'
  ) {
    return explicitLlmRepresentation.text.trim();
  }
  if (typeof explicitLlmRepresentation === 'string' && explicitLlmRepresentation.trim()) {
    return explicitLlmRepresentation.trim();
  }
  const normalizedParts = normalizeMessageContentParts(message.content?.parts, message.text || '');
  if (!normalizedParts.length) {
    return '';
  }
  const llmRepresentation = buildUserMessageLlmRepresentation(normalizedParts, message.text || '');
  if (Array.isArray(llmRepresentation)) {
    return llmRepresentation.map((part) => ({ ...part }));
  }
  if (typeof llmRepresentation === 'string' && llmRepresentation.trim()) {
    return llmRepresentation.trim();
  }
  const containsStructuredMedia = normalizedParts.some(
    (part) => part.type === 'image' || part.type === 'audio'
  );
  if (!containsStructuredMedia) {
    return getTextFromMessageContentParts(normalizedParts, message.text || '').trim();
  }
  return normalizedParts
    .filter((part) => part.type === 'text' || part.type === 'image' || part.type === 'audio')
    .map((part) => ({ ...part }));
}
