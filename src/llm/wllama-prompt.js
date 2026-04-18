function flattenContentPart(part) {
  if (!part || typeof part !== 'object') {
    return '';
  }
  if (part.type === 'text') {
    return typeof part.text === 'string' ? part.text : '';
  }
  if (part.type === 'file') {
    const fileName =
      typeof part.filename === 'string' && part.filename.trim() ? part.filename.trim() : 'file';
    const llmText = typeof part.llmText === 'string' ? part.llmText.trim() : '';
    if (llmText) {
      return llmText;
    }
    return `[File attachment: ${fileName}]`;
  }
  if (part.type === 'image' || part.type === 'audio' || part.type === 'video') {
    const label = part.type === 'image' ? 'image' : part.type === 'audio' ? 'audio' : 'video';
    const fileName =
      typeof part.filename === 'string' && part.filename.trim()
        ? ` (${part.filename.trim()})`
        : '';
    throw new Error(`The selected model does not support ${label} inputs in this app${fileName}.`);
  }
  return '';
}

export function flattenWllamaPromptMessageContent(content) {
  if (typeof content === 'string') {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map(flattenContentPart)
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function normalizePromptMessageRole(message) {
  const role = typeof message?.role === 'string' ? message.role.trim().toLowerCase() : '';
  if (role === 'system' || role === 'user' || role === 'assistant') {
    return role;
  }
  if (role === 'tool') {
    return 'assistant';
  }
  return 'user';
}

export function normalizeWllamaPromptMessages(prompt) {
  return (Array.isArray(prompt) ? prompt : [])
    .map((message) => {
      const content = flattenWllamaPromptMessageContent(message?.content);
      if (!content) {
        return null;
      }
      if (message?.role === 'tool') {
        const toolName =
          typeof message?.toolName === 'string' && message.toolName.trim()
            ? message.toolName.trim()
            : 'tool';
        return {
          role: 'assistant',
          content: `[Tool result: ${toolName}]\n${content}`,
        };
      }
      return {
        role: normalizePromptMessageRole(message),
        content,
      };
    })
    .filter(Boolean);
}
