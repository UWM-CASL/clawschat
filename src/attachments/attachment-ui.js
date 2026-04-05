export const FILE_ATTACHMENT_ACCEPT = '.txt,.csv,.md,.html,.htm,.css,.js,.pdf';
export const AUDIO_ATTACHMENT_ACCEPT = 'audio/*,.mp3,.wav,.ogg,.oga,.flac,.aac,.m4a,.webm';
export const IMAGE_AND_FILE_ATTACHMENT_ACCEPT = `image/*,${FILE_ATTACHMENT_ACCEPT}`;

export function formatAttachmentSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '';
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${Math.round(bytes)} B`;
}

export function getAttachmentButtonAcceptValue({
  imageInputSupported = false,
  audioInputSupported = false,
} = {}) {
  const acceptTokens = [];
  if (imageInputSupported) {
    acceptTokens.push('image/*');
  }
  if (audioInputSupported) {
    acceptTokens.push(...AUDIO_ATTACHMENT_ACCEPT.split(','));
  }
  acceptTokens.push(...FILE_ATTACHMENT_ACCEPT.split(','));
  return [...new Set(acceptTokens)].join(',');
}

export function getAttachmentIconClass(attachment) {
  if (attachment?.type === 'image') {
    return 'bi-image';
  }
  if (attachment?.type === 'audio' || String(attachment?.mimeType || '').startsWith('audio/')) {
    return 'bi-file-earmark-music';
  }
  if (attachment?.extension === 'csv' || attachment?.mimeType === 'text/csv') {
    return 'bi-file-earmark-spreadsheet';
  }
  if (attachment?.extension === 'pdf' || attachment?.mimeType === 'application/pdf') {
    return 'bi-file-earmark-pdf';
  }
  if (attachment?.extension === 'md' || attachment?.mimeType === 'text/markdown') {
    return 'bi-file-earmark-richtext';
  }
  return 'bi-file-earmark-text';
}
