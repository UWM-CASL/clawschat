function toMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || '');
}

export function shouldRetryWllamaModelLoad(error) {
  return /\binvalid magic number\b/i.test(toMessage(error));
}
