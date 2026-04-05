export function createModelLoadFeedbackController({
  appState,
  documentRef = document,
  modelLoadProgressWrap,
  modelLoadProgressLabel,
  modelLoadProgressValue,
  modelLoadProgressBar,
  modelLoadProgressSummary,
  modelLoadCurrentFileLabel,
  modelLoadCurrentFileValue,
  modelLoadCurrentFileBar,
  modelLoadError,
  modelLoadErrorSummary,
  modelLoadErrorDetails,
}) {
  const view = documentRef?.defaultView || window;

  function showProgressRegion(show) {
    if (!modelLoadProgressWrap) {
      return;
    }
    modelLoadProgressWrap.classList.toggle('d-none', !show);
  }

  function formatLoadFileLabel(fileName) {
    if (typeof fileName !== 'string' || !fileName.trim()) {
      return '';
    }
    const normalized = fileName.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    return segments[segments.length - 1] || normalized;
  }

  function formatBytes(value) {
    if (!Number.isFinite(value) || value <= 0) {
      return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    const decimals = size >= 100 || unitIndex === 0 ? 0 : 1;
    return `${size.toFixed(decimals)} ${units[unitIndex]}`;
  }

  function setCurrentFileProgressBar({ percent = 0, indeterminate = false, animate = true }) {
    if (!modelLoadCurrentFileBar) {
      return;
    }
    const boundedPercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
    if (!animate) {
      modelLoadCurrentFileBar.classList.add('model-load-bar-no-transition');
    }
    modelLoadCurrentFileBar.classList.toggle('model-load-bar-indeterminate', indeterminate);
    if (indeterminate) {
      modelLoadCurrentFileBar.style.width = '35%';
      modelLoadCurrentFileBar.removeAttribute('aria-valuenow');
    } else {
      modelLoadCurrentFileBar.style.width = `${boundedPercent}%`;
      modelLoadCurrentFileBar.setAttribute('aria-valuenow', `${Math.round(boundedPercent)}`);
    }
    if (!animate) {
      view.requestAnimationFrame(() => {
        modelLoadCurrentFileBar.classList.remove('model-load-bar-no-transition');
      });
    }
  }

  function renderLoadProgressFiles() {
    if (!modelLoadProgressSummary && !modelLoadCurrentFileLabel && !modelLoadCurrentFileValue) {
      return;
    }
    const entries = [...appState.loadProgressFiles.values()].sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
    const completeCount = entries.filter((entry) => entry.isComplete).length;
    const latestEntry = entries[0] || null;
    if (modelLoadProgressSummary) {
      modelLoadProgressSummary.textContent = !entries.length
        ? '0/0 stages complete'
        : `${completeCount}/${entries.length} stages complete`;
    }
    if (!latestEntry) {
      if (modelLoadCurrentFileLabel) {
        modelLoadCurrentFileLabel.textContent = 'Current file';
      }
      if (modelLoadCurrentFileValue) {
        modelLoadCurrentFileValue.textContent = 'Waiting...';
      }
      setCurrentFileProgressBar({ percent: 0, indeterminate: false, animate: false });
      return;
    }

    if (modelLoadCurrentFileLabel) {
      modelLoadCurrentFileLabel.textContent = latestEntry.label || 'Current file';
    }
    if (modelLoadCurrentFileValue) {
      if (latestEntry.hasKnownTotal && latestEntry.totalBytes > 0) {
        modelLoadCurrentFileValue.textContent = `${formatBytes(latestEntry.loadedBytes)} / ${formatBytes(latestEntry.totalBytes)}`;
      } else if (latestEntry.loadedBytes > 0) {
        modelLoadCurrentFileValue.textContent = `${formatBytes(latestEntry.loadedBytes)} downloaded`;
      } else {
        modelLoadCurrentFileValue.textContent = 'Downloading...';
      }
    }
    setCurrentFileProgressBar({
      percent: latestEntry.percent,
      indeterminate: latestEntry.isIndeterminate,
    });
  }

  function resetLoadProgressFiles() {
    appState.maxObservedLoadPercent = 0;
    appState.loadProgressFiles.clear();
    renderLoadProgressFiles();
  }

  function trackLoadFileProgress(file, percent, status, loadedBytes, totalBytes) {
    if (typeof file !== 'string' || !file.trim()) {
      return;
    }
    const key = file.trim();
    const numericPercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
    const statusText = typeof status === 'string' ? status.trim() : '';
    const numericLoadedBytes = Number.isFinite(loadedBytes) && loadedBytes > 0 ? loadedBytes : 0;
    const numericTotalBytes = Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : 0;
    const hasKnownTotal = numericTotalBytes > 0;
    const percentFromBytes = hasKnownTotal ? (numericLoadedBytes / numericTotalBytes) * 100 : null;
    const effectivePercent = Number.isFinite(percentFromBytes) ? percentFromBytes : numericPercent;
    const previous = appState.loadProgressFiles.get(key);
    const isComplete =
      effectivePercent >= 100 ||
      (hasKnownTotal && numericLoadedBytes >= numericTotalBytes) ||
      /complete|ready|loaded|done|cached/i.test(statusText);
    appState.loadProgressFiles.set(key, {
      label: formatLoadFileLabel(key),
      percent: previous ? Math.max(previous.percent, effectivePercent) : effectivePercent,
      status: statusText || previous?.status || '',
      loadedBytes: previous
        ? Math.max(previous.loadedBytes || 0, numericLoadedBytes)
        : numericLoadedBytes,
      totalBytes: hasKnownTotal ? numericTotalBytes : previous?.totalBytes || 0,
      hasKnownTotal: hasKnownTotal || Boolean(previous?.hasKnownTotal),
      isIndeterminate: !hasKnownTotal && !isComplete,
      isComplete: Boolean(previous?.isComplete || isComplete),
      updatedAt: Date.now(),
    });
    renderLoadProgressFiles();
  }

  function clearLoadError() {
    if (modelLoadError) {
      modelLoadError.classList.add('d-none');
    }
    if (modelLoadErrorSummary) {
      modelLoadErrorSummary.textContent = '';
    }
    if (modelLoadErrorDetails) {
      modelLoadErrorDetails.replaceChildren();
    }
  }

  function setLoadProgress({
    percent = 0,
    message = 'Preparing model...',
    file = '',
    status = '',
    loadedBytes = 0,
    totalBytes = 0,
  }) {
    const numericPercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
    const isCompletedMessage =
      /^model ready\.$/i.test(String(message || '').trim()) ||
      /^loaded .+ \((webgpu|wasm|cpu)\)\.$/i.test(String(message || '').trim());
    const normalizedPercent = isCompletedMessage ? 100 : numericPercent;
    const displayPercent = Math.max(appState.maxObservedLoadPercent, normalizedPercent);
    appState.maxObservedLoadPercent = displayPercent;
    if (modelLoadProgressLabel) {
      modelLoadProgressLabel.textContent = message;
    }
    if (modelLoadProgressValue) {
      modelLoadProgressValue.textContent = `${Math.round(displayPercent)}%`;
    }
    if (modelLoadProgressBar) {
      modelLoadProgressBar.style.width = `${displayPercent}%`;
      modelLoadProgressBar.setAttribute('aria-valuenow', `${Math.round(displayPercent)}`);
      modelLoadProgressBar.classList.toggle('progress-bar-animated', displayPercent < 100);
    }
    trackLoadFileProgress(file, normalizedPercent, status || message, loadedBytes, totalBytes);
  }

  function showLoadError(errorMessage) {
    if (!modelLoadError) {
      return;
    }
    const parts = String(errorMessage || 'Unknown initialization error')
      .split(' | ')
      .map((segment) => segment.trim())
      .filter(Boolean);
    const [summary, ...details] = parts;
    if (modelLoadErrorSummary) {
      modelLoadErrorSummary.textContent = summary || 'Failed to initialize the selected model.';
    }
    if (modelLoadErrorDetails) {
      modelLoadErrorDetails.replaceChildren();
      details.forEach((detail) => {
        const item = documentRef.createElement('li');
        item.textContent = detail;
        modelLoadErrorDetails.appendChild(item);
      });
    }
    modelLoadError.classList.remove('d-none');
  }

  return {
    clearLoadError,
    resetLoadProgressFiles,
    setLoadProgress,
    showLoadError,
    showProgressRegion,
  };
}
