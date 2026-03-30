let pdfExtractionWorker = null;
let pdfExtractionRequestId = 0;
const pendingPdfExtractionRequests = new Map();

function ensurePdfExtractionWorker() {
  if (pdfExtractionWorker) {
    return pdfExtractionWorker;
  }
  pdfExtractionWorker = new Worker(new URL('../workers/pdf-extract.worker.js', import.meta.url), {
    type: 'module',
  });
  pdfExtractionWorker.addEventListener('message', (event) => {
    const data = event.data;
    const requestId = typeof data?.requestId === 'number' ? data.requestId : null;
    if (requestId === null) {
      return;
    }
    const pendingRequest = pendingPdfExtractionRequests.get(requestId);
    if (!pendingRequest) {
      return;
    }
    pendingPdfExtractionRequests.delete(requestId);
    if (data.type === 'pdf-extract-success') {
      pendingRequest.resolve(data.payload);
      return;
    }
    pendingRequest.reject(new Error(data?.payload?.message || 'PDF extraction failed.'));
  });
  pdfExtractionWorker.addEventListener('error', (event) => {
    pendingPdfExtractionRequests.forEach(({ reject }) => {
      reject(new Error(event.message || 'PDF extraction worker failed.'));
    });
    pendingPdfExtractionRequests.clear();
    pdfExtractionWorker = null;
  });
  return pdfExtractionWorker;
}

export function extractPdfText(buffer) {
  const worker = ensurePdfExtractionWorker();
  const requestId = ++pdfExtractionRequestId;
  return new Promise((resolve, reject) => {
    pendingPdfExtractionRequests.set(requestId, { resolve, reject });
    worker.postMessage(
      {
        type: 'pdf-extract',
        requestId,
        payload: {
          buffer,
        },
      },
      [buffer],
    );
  });
}
