export function createTranscriptNavigationController({
  appState,
  documentRef = document,
  reducedMotionQuery,
  chatMain,
  chatTranscript,
  topBar,
  openSettingsButton,
  jumpToTopButton,
  jumpToPreviousUserButton,
  jumpToNextModelButton,
  jumpToLatestButton,
  messageInput,
  skipLinkElements = [],
  transcriptBottomThresholdPx = 24,
  routeChat = 'chat',
  hasStartedWorkspace,
  isSettingsView,
  isEngineReady,
}) {
  function getPreferredScrollBehavior() {
    return reducedMotionQuery?.matches ? 'auto' : 'smooth';
  }

  function scrollTranscriptToBottom() {
    if (!chatMain) {
      return;
    }
    chatMain.scrollTop = chatMain.scrollHeight;
    updateTranscriptNavigationButtonVisibility();
  }

  function getElementClearanceFromTop(element, containerRect) {
    if (!(element instanceof HTMLElement) || element.classList.contains('d-none')) {
      return 0;
    }
    const rect = element.getBoundingClientRect();
    return rect.bottom > containerRect.top ? Math.max(0, rect.bottom - containerRect.top) : 0;
  }

  function getElementClearanceFromBottom(element, containerRect) {
    if (!(element instanceof HTMLElement) || element.classList.contains('d-none')) {
      return 0;
    }
    const rect = element.getBoundingClientRect();
    return rect.top < containerRect.bottom ? Math.max(0, containerRect.bottom - rect.top) : 0;
  }

  function scrollElementIntoAccessibleView(element, { align = 'start' } = {}) {
    if (!(chatMain instanceof HTMLElement) || !(element instanceof HTMLElement)) {
      return;
    }
    const containerRect = chatMain.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const topClearance =
      Math.max(
        getElementClearanceFromTop(topBar, containerRect),
        getElementClearanceFromTop(jumpToTopButton, containerRect)
      ) + 16;
    const bottomClearance =
      Math.max(
        getElementClearanceFromBottom(jumpToLatestButton, containerRect),
        getElementClearanceFromBottom(openSettingsButton, containerRect)
      ) + 16;
    let delta = 0;
    if (align === 'end') {
      delta = elementRect.bottom - (containerRect.bottom - bottomClearance);
    } else if (align === 'center') {
      const visibleHeight = Math.max(
        0,
        containerRect.height - topClearance - bottomClearance - elementRect.height
      );
      delta =
        elementRect.top - (containerRect.top + topClearance + Math.max(0, visibleHeight / 2));
    } else {
      delta = elementRect.top - (containerRect.top + topClearance);
    }
    chatMain.scrollBy({
      top: delta,
      behavior: getPreferredScrollBehavior(),
    });
  }

  function ensureModelVariantControlsVisible(messageId) {
    if (!chatTranscript || !chatMain || !messageId) {
      return;
    }
    const messageItem = chatTranscript.querySelector(`[data-message-id="${messageId}"]`);
    if (!(messageItem instanceof HTMLElement)) {
      return;
    }
    const variantNav = messageItem.querySelector('.response-variant-nav');
    const responseActions = messageItem.querySelector('.response-actions');
    const target =
      variantNav instanceof HTMLElement
        ? variantNav
        : responseActions instanceof HTMLElement
          ? responseActions
          : messageItem;
    target.scrollIntoView({
      behavior: getPreferredScrollBehavior(),
      block: 'nearest',
      inline: 'nearest',
    });
    updateTranscriptNavigationButtonVisibility();
  }

  function isTranscriptNearBottom() {
    if (!chatMain) {
      return true;
    }
    const distanceToBottom = chatMain.scrollHeight - (chatMain.scrollTop + chatMain.clientHeight);
    return distanceToBottom <= transcriptBottomThresholdPx;
  }

  function isTranscriptNearTop() {
    if (!chatMain) {
      return true;
    }
    return chatMain.scrollTop <= transcriptBottomThresholdPx;
  }

  function getTranscriptMessageRows(role = null) {
    if (!chatTranscript) {
      return [];
    }
    return Array.from(chatTranscript.querySelectorAll('.message-row')).filter((item) => {
      if (!(item instanceof HTMLElement)) {
        return false;
      }
      if (role === 'user') {
        return item.classList.contains('user-message');
      }
      if (role === 'model') {
        return item.classList.contains('model-message');
      }
      return true;
    });
  }

  function findTranscriptStepTarget(role, direction) {
    if (!(chatMain instanceof HTMLElement)) {
      return null;
    }
    const rows = getTranscriptMessageRows(role);
    if (!rows.length) {
      return null;
    }
    const containerRect = chatMain.getBoundingClientRect();
    const referenceLine =
      containerRect.top + Math.max(getElementClearanceFromTop(topBar, containerRect), 16) + 24;
    if (direction < 0) {
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        const rect = rows[index].getBoundingClientRect();
        if (rect.top < referenceLine - 4) {
          return rows[index];
        }
      }
      return rows[0];
    }
    for (let index = 0; index < rows.length; index += 1) {
      const rect = rows[index].getBoundingClientRect();
      if (rect.top > referenceLine + 4) {
        return rows[index];
      }
    }
    return rows[rows.length - 1];
  }

  function hasTranscriptStepTarget(role, direction) {
    if (!(chatMain instanceof HTMLElement)) {
      return false;
    }
    const rows = getTranscriptMessageRows(role);
    if (!rows.length) {
      return false;
    }
    const containerRect = chatMain.getBoundingClientRect();
    const referenceLine =
      containerRect.top + Math.max(getElementClearanceFromTop(topBar, containerRect), 16) + 24;
    if (direction < 0) {
      return rows.some((row) => row.getBoundingClientRect().top < referenceLine - 4);
    }
    return rows.some((row) => row.getBoundingClientRect().top > referenceLine + 4);
  }

  function focusTranscriptBoundary(boundary, { align = 'start' } = {}) {
    if (!(boundary instanceof HTMLElement)) {
      return;
    }
    boundary.focus({ preventScroll: true });
    scrollElementIntoAccessibleView(boundary, { align });
  }

  function updateSkipLinkVisibility() {
    skipLinkElements.forEach((link) => {
      if (!(link instanceof HTMLElement)) {
        return;
      }
      const scope = String(link.dataset.skipScope || 'always')
        .trim()
        .toLowerCase();
      let visible = true;
      if (scope === 'workspace') {
        visible = hasStartedWorkspace(appState) && !isSettingsView(appState);
      } else if (scope === 'chat') {
        visible = appState.workspaceView === routeChat;
      } else if (scope === 'settings') {
        visible = isSettingsView(appState);
      }
      link.hidden = !visible;
    });
  }

  function focusSkipTarget(targetId) {
    const target = documentRef.getElementById(targetId);
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    if (target === messageInput && target instanceof HTMLTextAreaElement) {
      target.focus();
      scrollElementIntoAccessibleView(target, { align: 'end' });
      return true;
    }
    target.focus({ preventScroll: true });
    scrollElementIntoAccessibleView(target, {
      align: targetId === 'chatTranscriptStart' ? 'start' : 'center',
    });
    return true;
  }

  function stepTranscriptNavigation(role, direction) {
    const target = findTranscriptStepTarget(role, direction);
    if (!(target instanceof HTMLElement)) {
      return;
    }
    scrollElementIntoAccessibleView(target, { align: 'start' });
  }

  function updateTranscriptNavigationButtonVisibility() {
    if (
      !(jumpToTopButton instanceof HTMLButtonElement) ||
      !(jumpToPreviousUserButton instanceof HTMLButtonElement) ||
      !(jumpToNextModelButton instanceof HTMLButtonElement) ||
      !(jumpToLatestButton instanceof HTMLButtonElement)
    ) {
      return;
    }
    const hasTranscriptItems = Boolean(chatTranscript?.children.length);
    const engineReady = isEngineReady(appState);
    jumpToTopButton.setAttribute(
      'aria-disabled',
      !engineReady || !hasTranscriptItems || isTranscriptNearTop() ? 'true' : 'false'
    );
    jumpToPreviousUserButton.setAttribute(
      'aria-disabled',
      !engineReady || !hasTranscriptItems || !hasTranscriptStepTarget('user', -1)
        ? 'true'
        : 'false'
    );
    jumpToNextModelButton.setAttribute(
      'aria-disabled',
      !engineReady || !hasTranscriptItems || !hasTranscriptStepTarget('model', 1)
        ? 'true'
        : 'false'
    );
    jumpToLatestButton.setAttribute(
      'aria-disabled',
      !engineReady || !hasTranscriptItems || isTranscriptNearBottom() ? 'true' : 'false'
    );
  }

  return {
    ensureModelVariantControlsVisible,
    focusSkipTarget,
    focusTranscriptBoundary,
    scrollTranscriptToBottom,
    stepTranscriptNavigation,
    updateSkipLinkVisibility,
    updateTranscriptNavigationButtonVisibility,
  };
}
