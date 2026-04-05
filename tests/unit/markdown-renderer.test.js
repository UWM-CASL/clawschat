import { describe, expect, test } from 'vitest';
import {
  loadMarkdownRenderer,
  renderPlainTextMarkdownFallback,
} from '../../src/ui/markdown-renderer.js';

describe('markdown-renderer', () => {
  test('renders a safe plain-text fallback while the parser is unavailable', () => {
    expect(renderPlainTextMarkdownFallback('Hello <world>\nline two\n\nSecond "quote"')).toBe(
      '<p>Hello &lt;world&gt;<br>line two</p><p>Second &quot;quote&quot;</p>'
    );
  });

  test('loads the markdown parser with external link protections', async () => {
    const renderer = await loadMarkdownRenderer({
      linkRel: 'noopener noreferrer nofollow',
    });

    const html = renderer.render('Visit https://example.com');

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('href="https://example.com"');
  });
});
