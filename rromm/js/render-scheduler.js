/**
 * Coalesce redraws into one requestAnimationFrame per frame.
 */

/**
 * @typedef {{ preview?: boolean, editor?: boolean, ui?: boolean }} RenderFlags
 */

/**
 * @param {() => void} flush
 */
export function createRenderScheduler(flush) {
  /** @type {RenderFlags | null} */
  let pending = null;
  let rafId = 0;

  function schedule(flags = {}) {
    pending = {
      preview: false,
      editor: false,
      ui: false,
      ...pending,
      ...flags,
    };
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      const f = pending;
      pending = null;
      flush(f || {});
    });
  }

  function scheduleNow(flags = {}) {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    pending = null;
    flush({ preview: true, editor: true, ui: true, ...flags });
  }

  return { schedule, scheduleNow };
}

/**
 * @param {() => void} fn
 * @param {number} [ms]
 */
export function debounce(fn, ms = 400) {
  let t = 0;
  return () => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

/**
 * Throttle: не чаще ms; последний вызов в серии выполняется по таймеру.
 * @param {() => void} fn
 * @param {number} [ms]
 */
export function createThrottle(fn, ms = 64) {
  let lastRun = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let trailing = null;

  function run() {
    lastRun = Date.now();
    trailing = null;
    fn();
  }

  function cancel() {
    if (trailing) {
      clearTimeout(trailing);
      trailing = null;
    }
  }

  function throttled() {
    const now = Date.now();
    const wait = ms - (now - lastRun);
    if (wait <= 0) {
      cancel();
      run();
      return;
    }
    if (!trailing) trailing = setTimeout(run, wait);
  }

  throttled.cancel = cancel;
  return throttled;
}
