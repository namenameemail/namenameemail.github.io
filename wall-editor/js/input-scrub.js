/**
 * Drag horizontally on a number input to change its value.
 * Uses window listeners so scrub continues outside the input.
 */

/**
 * @param {HTMLInputElement} input
 * @param {object} opts
 * @param {(value: number) => void} opts.onScrub
 * @param {() => void} [opts.onScrubEnd]
 * @param {number} [opts.pxPerStep] pixels per one step
 */
export function bindInputScrub(input, opts) {
  const { onScrub, onScrubEnd, pxPerStep = 6 } = opts;

  const DRAG_THRESHOLD_PX = 4;

  let dragging = false;
  let pending = false;
  let startX = 0;
  let startValue = 0;
  let step = 0.01;
  /** @type {number|null} */
  let activePointerId = null;

  function readStep() {
    step = parseFloat(input.step) || 0.01;
  }

  function clamp(value) {
    const min = input.min !== '' ? parseFloat(input.min) : -Infinity;
    const max = input.max !== '' ? parseFloat(input.max) : Infinity;
    return Math.min(max, Math.max(min, value));
  }

  function cleanupWindow() {
    window.removeEventListener('pointermove', onWindowMove);
    window.removeEventListener('pointerup', onWindowUp);
    window.removeEventListener('pointercancel', onWindowUp);
    activePointerId = null;
  }

  function endDrag() {
    const wasDragging = dragging;
    pending = false;
    dragging = false;
    input.classList.remove('scrubbing');
    cleanupWindow();
    if (wasDragging) onScrubEnd?.();
  }

  /** @param {PointerEvent} e */
  function onWindowMove(e) {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    if (!pending && !dragging) return;

    if (!dragging && Math.abs(e.clientX - startX) >= DRAG_THRESHOLD_PX) {
      dragging = true;
      input.classList.add('scrubbing');
    }

    if (!dragging) return;

    e.preventDefault();
    const deltaSteps = Math.round((e.clientX - startX) / pxPerStep);
    const value = clamp(startValue + deltaSteps * step);
    input.value = String(value);
    onScrub(value);
  }

  /** @param {PointerEvent} e */
  function onWindowUp(e) {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    endDrag();
  }

  input.addEventListener('pointerdown', (e) => {
    if (input.disabled || e.button !== 0) return;

    e.preventDefault();
    readStep();
    pending = true;
    dragging = false;
    startX = e.clientX;
    startValue = parseFloat(input.value) || 0;
    activePointerId = e.pointerId;

    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', onWindowUp);
    window.addEventListener('pointercancel', onWindowUp);
  });
}
