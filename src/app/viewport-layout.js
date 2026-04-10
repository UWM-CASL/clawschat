export const PHONE_LAYOUT_MAX_WIDTH = 767.98;

/**
 * @param {{ innerWidth?: number } | null | undefined} windowRef
 */
export function isPhoneViewport(windowRef = window) {
  return Number.isFinite(windowRef?.innerWidth) && windowRef.innerWidth <= PHONE_LAYOUT_MAX_WIDTH;
}

/**
 * @param {{
 *   windowRef?: Window | typeof globalThis;
 *   documentRef?: Document;
 *   appChrome?: HTMLElement | null;
 * }} options
 */
export function createViewportLayoutController({
  windowRef = window,
  documentRef = document,
  appChrome = null,
} = {}) {
  let animationFrameId = null;
  let resizeObserver = null;
  let teardown = null;
  const view = documentRef?.defaultView || globalThis;

  function runInNextFrame(callback) {
    if (typeof windowRef?.cancelAnimationFrame === 'function' && animationFrameId !== null) {
      windowRef.cancelAnimationFrame(animationFrameId);
    }
    if (typeof windowRef?.requestAnimationFrame === 'function') {
      animationFrameId = windowRef.requestAnimationFrame(() => {
        animationFrameId = null;
        callback();
      });
      return;
    }
    callback();
  }

  function applyLayoutVars() {
    const root = documentRef?.documentElement;
    if (!(root instanceof view.HTMLElement)) {
      return;
    }
    const viewportHeight =
      windowRef?.visualViewport?.height || windowRef?.innerHeight || root.clientHeight || 0;
    if (viewportHeight > 0) {
      root.style.setProperty('--app-viewport-height', `${Math.round(viewportHeight)}px`);
    }
    if (appChrome instanceof view.HTMLElement) {
      root.style.setProperty('--app-chrome-height', `${Math.round(appChrome.offsetHeight)}px`);
    }
    documentRef.body?.classList.toggle('phone-layout', isPhoneViewport(windowRef));
  }

  function queueLayoutUpdate() {
    runInNextFrame(applyLayoutVars);
  }

  function start() {
    applyLayoutVars();
    const visualViewport = windowRef?.visualViewport || null;
    windowRef?.addEventListener?.('resize', queueLayoutUpdate);
    windowRef?.addEventListener?.('orientationchange', queueLayoutUpdate);
    visualViewport?.addEventListener?.('resize', queueLayoutUpdate);
    visualViewport?.addEventListener?.('scroll', queueLayoutUpdate);
    if (typeof view.ResizeObserver === 'function' && appChrome instanceof view.HTMLElement) {
      resizeObserver = new view.ResizeObserver(queueLayoutUpdate);
      resizeObserver.observe(appChrome);
    }
    teardown = () => {
      windowRef?.removeEventListener?.('resize', queueLayoutUpdate);
      windowRef?.removeEventListener?.('orientationchange', queueLayoutUpdate);
      visualViewport?.removeEventListener?.('resize', queueLayoutUpdate);
      visualViewport?.removeEventListener?.('scroll', queueLayoutUpdate);
      resizeObserver?.disconnect();
      resizeObserver = null;
      if (typeof windowRef?.cancelAnimationFrame === 'function' && animationFrameId !== null) {
        windowRef.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };
  }

  function stop() {
    teardown?.();
    teardown = null;
  }

  return {
    applyLayoutVars,
    queueLayoutUpdate,
    start,
    stop,
  };
}
