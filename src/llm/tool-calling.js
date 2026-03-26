export const TOOL_DEFINITIONS = Object.freeze([]);

export function getEnabledToolNames() {
  return TOOL_DEFINITIONS.filter((tool) => tool?.enabled === true)
    .map((tool) => (typeof tool.name === 'string' ? tool.name.trim() : ''))
    .filter(Boolean);
}

export function buildToolCallingSystemPrompt(enabledToolNames = []) {
  const normalizedToolNames = Array.isArray(enabledToolNames)
    ? enabledToolNames
        .map((toolName) => (typeof toolName === 'string' ? toolName.trim() : ''))
        .filter(Boolean)
    : [];
  const toolList = normalizedToolNames.length ? normalizedToolNames.join(', ') : 'none';
  return [
    'Tool calling is enabled for this conversation.',
    `Enabled tools: ${toolList}.`,
    'If no tools are enabled, answer normally and do not attempt any tool calls.',
    'If you call a tool, respond with exactly one JSON object using this shape: {"toolCalls":[{"toolName":"<tool-name>","arguments":{}}]}.',
    'Do not wrap tool calls in Markdown, and never invent tool names that are not enabled.',
  ].join('\n');
}
