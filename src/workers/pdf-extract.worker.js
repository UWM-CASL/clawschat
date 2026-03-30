import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

// Run pdf.js in fake-worker mode inside this dedicated extraction worker.
// This avoids nested worker configuration and the runtime workerSrc error.
if (!globalThis.pdfjsWorker?.WorkerMessageHandler) {
  globalThis.pdfjsWorker = {
    ...(globalThis.pdfjsWorker || {}),
    WorkerMessageHandler,
  };
}
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url,
).toString();

const LINE_VERTICAL_TOLERANCE = 3;

function normalizePdfText(value) {
  return String(value || '')
    .replaceAll('\0', '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function compareTextItems(a, b) {
  const ay = Number.isFinite(a?.transform?.[5]) ? a.transform[5] : 0;
  const by = Number.isFinite(b?.transform?.[5]) ? b.transform[5] : 0;
  if (Math.abs(by - ay) > LINE_VERTICAL_TOLERANCE) {
    return by - ay;
  }
  const ax = Number.isFinite(a?.transform?.[4]) ? a.transform[4] : 0;
  const bx = Number.isFinite(b?.transform?.[4]) ? b.transform[4] : 0;
  return ax - bx;
}

function buildPageText(items) {
  const sortedItems = [...items].sort(compareTextItems);
  const lines = [];

  sortedItems.forEach((item) => {
    const value = normalizePdfText(item?.str || '');
    if (!value) {
      return;
    }
    const y = Number.isFinite(item?.transform?.[5]) ? item.transform[5] : null;
    const x = Number.isFinite(item?.transform?.[4]) ? item.transform[4] : null;
    const lastLine = lines.at(-1) || null;
    if (lastLine && y !== null && lastLine.y !== null && Math.abs(lastLine.y - y) <= LINE_VERTICAL_TOLERANCE) {
      if (
        x !== null &&
        lastLine.lastX !== null &&
        x > lastLine.lastX + 12 &&
        !lastLine.text.endsWith(' ') &&
        !value.startsWith(' ')
      ) {
        lastLine.text += ' ';
      }
      lastLine.text += value;
      lastLine.lastX = x;
      return;
    }
    lines.push({
      y,
      lastX: x,
      text: value,
    });
  });

  return normalizePdfText(lines.map((line) => line.text.trim()).filter(Boolean).join('\n'));
}

async function extractPdf(buffer) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
  });

  const pdf = await loadingTask.promise;
  const pageCount = Number.isFinite(pdf.numPages) ? pdf.numPages : 0;
  const pages = [];
  const warnings = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items = Array.isArray(textContent?.items) ? textContent.items : [];
    const text = buildPageText(items);
    if (!text) {
      warnings.push(`Page ${pageNumber} has no extractable text. OCR is not available in this app.`);
    }
    pages.push({
      pageNumber,
      text,
    });
  }

  await loadingTask.destroy();

  if (!pages.some((page) => page.text)) {
    throw new Error('This PDF appears image-only or has no extractable text. OCR is not available yet.');
  }

  return {
    pageCount,
    pages,
    warnings,
  };
}

self.addEventListener('message', async (event) => {
  const data = event.data;
  if (data?.type !== 'pdf-extract') {
    return;
  }
  const requestId = typeof data?.requestId === 'number' ? data.requestId : null;
  try {
    const result = await extractPdf(data?.payload?.buffer);
    self.postMessage({
      type: 'pdf-extract-success',
      requestId,
      payload: result,
    });
  } catch (error) {
    self.postMessage({
      type: 'pdf-extract-error',
      requestId,
      payload: {
        message: error instanceof Error ? error.message : 'PDF extraction failed.',
      },
    });
  }
});
