function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderPlainTextMarkdownFallback(content) {
  const normalizedContent = String(content || '');
  if (!normalizedContent) {
    return '';
  }
  return normalizedContent
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export async function loadMarkdownRenderer({ linkRel = '' } = {}) {
  const { default: MarkdownIt } = await import('markdown-it');
  const markdown = new MarkdownIt({
    html: false,
    breaks: true,
    linkify: true,
  });
  const defaultLinkRenderer =
    markdown.renderer.rules.link_open ||
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    token.attrSet('target', '_blank');
    if (typeof linkRel === 'string' && linkRel.trim()) {
      token.attrSet('rel', linkRel.trim());
    }
    return defaultLinkRenderer(tokens, idx, options, env, self);
  };
  return {
    render(content) {
      return markdown.render(String(content || ''));
    },
  };
}
