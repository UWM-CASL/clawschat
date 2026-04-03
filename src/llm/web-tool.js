const MAX_WEB_INPUT_LENGTH = 2_000;
const MAX_WEB_RESPONSE_PREVIEW_BYTES = 65_536;
const MAX_WEB_CONTENT_LENGTH = 4_000;
const MAX_WEB_TITLE_LENGTH = 200;
const MAX_WEB_DESCRIPTION_LENGTH = 300;
const MAX_WEB_HEADING_COUNT = 8;
const MAX_WEB_HEADING_LENGTH = 160;
const WEB_LOOKUP_RETRY_MESSAGE =
  'Use a direct https URL and retry with a simpler page if the request or extraction fails.';

function collapseWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeMultilineText(value) {
  return String(value || '')
    .split(/\n+/)
    .map((line) => collapseWhitespace(line))
    .filter(Boolean)
    .join('\n\n');
}

function truncateText(value, maxLength) {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue || normalizedValue.length <= maxLength) {
    return {
      text: normalizedValue,
      truncated: false,
    };
  }
  const slice = normalizedValue.slice(0, maxLength);
  const lastWhitespaceIndex = slice.search(/\s+\S*$/);
  const preview =
    lastWhitespaceIndex > Math.floor(maxLength * 0.6) ? slice.slice(0, lastWhitespaceIndex) : slice;
  return {
    text: `${preview.trimEnd()}...`,
    truncated: true,
  };
}

function getFetchRef(runtimeContext = {}) {
  return runtimeContext.fetchRef || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isTextLikeContentType(contentType) {
  const normalizedContentType = String(contentType || '').trim().toLowerCase();
  if (!normalizedContentType) {
    return true;
  }
  return (
    normalizedContentType.startsWith('text/') ||
    normalizedContentType.includes('json') ||
    normalizedContentType.includes('xml') ||
    normalizedContentType.includes('javascript')
  );
}

function getMetaContent(documentRef, selectors = []) {
  for (const selector of selectors) {
    const content = documentRef.querySelector(selector)?.getAttribute('content');
    const normalizedContent = collapseWhitespace(content);
    if (normalizedContent) {
      return normalizedContent;
    }
  }
  return '';
}

function stripHtmlTags(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function getHtmlTagContents(htmlText, tagName) {
  const matches = [];
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  let match;
  while ((match = pattern.exec(htmlText))) {
    const content = collapseWhitespace(stripHtmlTags(match[1]));
    if (content) {
      matches.push(content);
    }
  }
  return matches;
}

function getHtmlMetaContent(htmlText, attributeName, attributeValue) {
  const metaPattern = /<meta\b[^>]*>/gi;
  let match;
  while ((match = metaPattern.exec(htmlText))) {
    const tagText = match[0];
    const attributePattern = new RegExp(
      `\\b${attributeName}\\s*=\\s*(['"])${attributeValue}\\1`,
      'i'
    );
    if (!attributePattern.test(tagText)) {
      continue;
    }
    const contentMatch = tagText.match(/\bcontent\s*=\s*(['"])([\s\S]*?)\1/i);
    if (contentMatch) {
      const content = collapseWhitespace(contentMatch[2]);
      if (content) {
        return content;
      }
    }
  }
  return '';
}

function extractHtmlPreviewWithoutDom(htmlText) {
  const title = truncateText(
    collapseWhitespace(getHtmlTagContents(htmlText, 'title')[0] || ''),
    MAX_WEB_TITLE_LENGTH
  ).text;
  const description = truncateText(
    getHtmlMetaContent(htmlText, 'name', 'description') ||
      getHtmlMetaContent(htmlText, 'property', 'og:description') ||
      getHtmlMetaContent(htmlText, 'name', 'twitter:description'),
    MAX_WEB_DESCRIPTION_LENGTH
  ).text;
  const headings = [];
  const seenHeadings = new Set();
  for (const heading of [
    ...getHtmlTagContents(htmlText, 'h1'),
    ...getHtmlTagContents(htmlText, 'h2'),
    ...getHtmlTagContents(htmlText, 'h3'),
  ]) {
    const normalizedHeading = truncateText(heading, MAX_WEB_HEADING_LENGTH).text;
    if (!normalizedHeading || seenHeadings.has(normalizedHeading)) {
      continue;
    }
    seenHeadings.add(normalizedHeading);
    headings.push(normalizedHeading);
    if (headings.length >= MAX_WEB_HEADING_COUNT) {
      break;
    }
  }
  const candidateBlocks = [
    ...getHtmlTagContents(htmlText, 'h1'),
    ...getHtmlTagContents(htmlText, 'h2'),
    ...getHtmlTagContents(htmlText, 'h3'),
    ...getHtmlTagContents(htmlText, 'p'),
    ...getHtmlTagContents(htmlText, 'li'),
    ...getHtmlTagContents(htmlText, 'blockquote'),
    ...getHtmlTagContents(htmlText, 'pre'),
  ];
  const content = candidateBlocks.length
    ? candidateBlocks.join('\n\n')
    : normalizeMultilineText(stripHtmlTags(htmlText));
  return {
    title,
    description,
    headings,
    content,
  };
}

function collectHeadingPreview(documentRef) {
  const headings = [];
  const seen = new Set();
  for (const element of documentRef.querySelectorAll('h1, h2, h3')) {
    const heading = truncateText(collapseWhitespace(element.textContent), MAX_WEB_HEADING_LENGTH).text;
    if (!heading || seen.has(heading)) {
      continue;
    }
    seen.add(heading);
    headings.push(heading);
    if (headings.length >= MAX_WEB_HEADING_COUNT) {
      break;
    }
  }
  return headings;
}

function collectStructuredText(root) {
  const chunks = [];
  const seen = new Set();
  const blockSelectors = 'h1, h2, h3, p, li, blockquote, pre';
  for (const element of root.querySelectorAll(blockSelectors)) {
    const text = collapseWhitespace(element.textContent);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    chunks.push(text);
    if (chunks.join('\n\n').length >= MAX_WEB_CONTENT_LENGTH * 2) {
      break;
    }
  }
  if (chunks.length) {
    return chunks.join('\n\n');
  }
  return normalizeMultilineText(root.textContent);
}

function extractHtmlPreview(htmlText) {
  if (typeof DOMParser !== 'function') {
    return extractHtmlPreviewWithoutDom(htmlText);
  }
  const parser = new DOMParser();
  const documentRef = parser.parseFromString(htmlText, 'text/html');
  for (const element of Array.from(
    documentRef.querySelectorAll('script, style, noscript, template, svg, canvas, iframe')
  )) {
    element.remove();
  }
  const root =
    documentRef.querySelector('main, article, [role="main"]') ||
    documentRef.body ||
    documentRef.documentElement;
  return {
    title:
      truncateText(
        collapseWhitespace(documentRef.title) ||
          getMetaContent(documentRef, [
            'meta[property="og:title"]',
            'meta[name="twitter:title"]',
          ]),
        MAX_WEB_TITLE_LENGTH
      ).text,
    description:
      truncateText(
        getMetaContent(documentRef, [
          'meta[name="description"]',
          'meta[property="og:description"]',
          'meta[name="twitter:description"]',
        ]),
        MAX_WEB_DESCRIPTION_LENGTH
      ).text,
    headings: collectHeadingPreview(documentRef),
    content: collectStructuredText(root),
  };
}

function extractTextPreview(rawText, contentType) {
  const normalizedContentType = String(contentType || '').toLowerCase();
  if (normalizedContentType.includes('json')) {
    try {
      return JSON.stringify(JSON.parse(rawText), null, 2);
    } catch {
      return normalizeMultilineText(rawText);
    }
  }
  return normalizeMultilineText(rawText);
}

async function readResponseTextPreview(response) {
  const contentType = response.headers?.get?.('content-type') || '';
  if (!isTextLikeContentType(contentType)) {
    throw new Error(
      `web_lookup only supports text-like responses. Received '${contentType || 'unknown'}'.`
    );
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    return {
      text: await response.text(),
      truncated: false,
      contentType,
    };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  let truncated = false;

  try {
    while (totalBytes < MAX_WEB_RESPONSE_PREVIEW_BYTES) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || 0);
      const remainingBytes = MAX_WEB_RESPONSE_PREVIEW_BYTES - totalBytes;
      if (chunk.byteLength > remainingBytes) {
        chunks.push(chunk.slice(0, remainingBytes));
        totalBytes += remainingBytes;
        truncated = true;
        break;
      }
      chunks.push(chunk);
      totalBytes += chunk.byteLength;
    }
    if (!truncated) {
      const tail = await reader.read();
      truncated = !tail.done;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const mergedBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    mergedBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    text: new globalThis.TextDecoder('utf-8').decode(mergedBytes),
    truncated,
    contentType,
  };
}

function containsControlCharacters(value) {
  return Array.from(String(value || '')).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function buildWebLookupFailure(body, message = WEB_LOOKUP_RETRY_MESSAGE) {
  return {
    status: 'failed',
    body: collapseWhitespace(body) || 'Unknown web lookup error.',
    message,
  };
}

function buildWebLookupSuccessBody({ contentType = '', title = '', description = '', content = '' }) {
  const mimeType = collapseWhitespace(contentType) || 'unknown';
  const normalizedTitle = collapseWhitespace(title) || 'Untitled';
  const summaryParts = [collapseWhitespace(description), String(content || '').trim()].filter(Boolean);
  const summary = summaryParts.length
    ? summaryParts.join('\n\n')
    : 'No readable summary was extracted.';
  return [`- MIME type: ${mimeType}`, `- Title: ${normalizedTitle}`, '', '## Summary', summary].join(
    '\n'
  );
}

function getValidatedWebLookupArguments(argumentsValue = {}) {
  if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) {
    throw new Error('web_lookup arguments must be an object.');
  }
  const webLookupArguments = /** @type {{input?: unknown}} */ (argumentsValue);
  const supportedKeys = new Set(['input']);
  const unexpectedKeys = Object.keys(argumentsValue).filter((key) => !supportedKeys.has(key));
  if (unexpectedKeys.length) {
    throw new Error(`web_lookup does not accept: ${unexpectedKeys.join(', ')}.`);
  }
  const input =
    typeof webLookupArguments.input === 'string' ? webLookupArguments.input.trim() : '';
  if (!input) {
    throw new Error('web_lookup input must be a non-empty string.');
  }
  if (input.length > MAX_WEB_INPUT_LENGTH) {
    throw new Error(`web_lookup input must be ${MAX_WEB_INPUT_LENGTH} characters or fewer.`);
  }
  if (containsControlCharacters(input)) {
    throw new Error('web_lookup input cannot contain control characters.');
  }
  if (!isHttpUrl(input)) {
    throw new Error(
      'web_lookup currently supports only direct https URLs. Search queries are not implemented yet.'
    );
  }
  return { input };
}

export async function executeWebLookupTool(argumentsValue = {}, runtimeContext = {}) {
  try {
    const { input } = getValidatedWebLookupArguments(argumentsValue);
    const fetchRef = getFetchRef(runtimeContext);
    if (typeof fetchRef !== 'function') {
      return buildWebLookupFailure('web_lookup is unavailable because fetch is not available in this browser session.');
    }

    const response = await fetchRef(input, {
      method: 'GET',
      body: null,
      headers: {
        Accept: 'text/html, text/plain, application/json, application/xhtml+xml;q=0.9, */*;q=0.1',
      },
    });

    const { text, truncated: responsePreviewTruncated, contentType } =
      await readResponseTextPreview(response);
    const pagePreview = contentType.toLowerCase().includes('html')
      ? extractHtmlPreview(text)
      : {
          title: '',
          description: '',
          headings: [],
          content: extractTextPreview(text, contentType),
        };
    const contentPreview = truncateText(pagePreview.content, MAX_WEB_CONTENT_LENGTH);
    const body = buildWebLookupSuccessBody({
      contentType,
      title: pagePreview.title,
      description: pagePreview.description,
      content: contentPreview.text,
    });
    const notes = [];
    if (responsePreviewTruncated) {
      notes.push(
        `Fetched preview limited to the first ${MAX_WEB_RESPONSE_PREVIEW_BYTES} bytes of the response.`
      );
    }
    if (contentPreview.truncated) {
      notes.push(`Extracted content limited to ${MAX_WEB_CONTENT_LENGTH} characters.`);
    }
    return {
      status: 'successful',
      body,
      ...(notes.length ? { message: notes.join(' ') } : {}),
    };
  } catch (error) {
    return buildWebLookupFailure(error instanceof Error ? error.message : String(error));
  }
}
