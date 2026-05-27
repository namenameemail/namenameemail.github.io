/**
 * Drag-and-drop reordering for nav list rows (via grip handle).
 */

export const LIST_REORDER_CLASS = 'list-reorder-handle';

export const REORDER_MIME_PHOTO = 'application/x-roomviz-reorder-photo';
export const REORDER_MIME_WALL = 'application/x-roomviz-reorder-wall';
export const REORDER_MIME_ITEM = 'application/x-roomviz-reorder-item';

/**
 * @param {unknown[]} arr
 * @param {string} draggedId
 * @param {string} targetId
 * @param {boolean} placeAfter
 * @param {(item: unknown) => string} getId
 */
export function reorderArrayById(arr, draggedId, targetId, placeAfter, getId) {
  const from = arr.findIndex((x) => getId(x) === draggedId);
  let to = arr.findIndex((x) => getId(x) === targetId);
  if (from < 0 || to < 0 || from === to) return false;
  if (placeAfter) to += 1;
  if (from < to) to -= 1;
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  return true;
}

/**
 * @param {DataTransfer|null} dt
 * @param {string} mime
 */
function hasReorderType(dt, mime) {
  return !!dt && [...dt.types].includes(mime);
}

/**
 * @param {HTMLElement} host
 * @param {object} opts
 * @param {string} opts.mime
 * @param {string} opts.itemSelector
 * @param {string} opts.handleSelector
 * @param {(el: Element) => string|null} opts.getItemId
 * @param {(draggedId: string, targetId: string, placeAfter: boolean) => void} opts.onReorder
 * @param {(el: Element) => boolean} [opts.canDrag]
 * @param {string} [opts.skipTargetSelector] — ignore drops on nested rows (e.g. items inside wall)
 * @param {string} [opts.markerSelector] — element that shows insert line (default: same as item)
 */
export function bindListReorder(host, opts) {
  if (!host) return;

  const {
    mime,
    itemSelector,
    handleSelector,
    getItemId,
    onReorder,
    canDrag,
    skipTargetSelector,
    markerSelector,
  } = opts;

  /** @type {string|null} */
  let draggedId = null;
  /** @type {HTMLElement|null} */
  let draggedEl = null;
  /** @type {HTMLElement|null} */
  let markerEl = null;

  /**
   * @param {HTMLElement} item
   * @returns {HTMLElement}
   */
  function markerFor(item) {
    if (!markerSelector) return item;
    const inner = item.querySelector(markerSelector);
    return inner ? /** @type {HTMLElement} */ (inner) : item;
  }

  function clearMarker() {
    if (markerEl) {
      markerEl.classList.remove('list-reorder-before', 'list-reorder-after');
      markerEl = null;
    }
  }

  function cleanup() {
    draggedEl?.classList.remove('list-reorder-dragging');
    draggedId = null;
    draggedEl = null;
    clearMarker();
  }

  /**
   * @param {DragEvent} e
   * @returns {HTMLElement|null}
   */
  function targetItem(e) {
    if (skipTargetSelector && e.target.closest(skipTargetSelector)) return null;
    const el = e.target.closest(itemSelector);
    if (!el || !host.contains(el)) return null;
    return /** @type {HTMLElement} */ (el);
  }

  host.addEventListener(
    'dragstart',
    (e) => {
      if (!e.target.closest(handleSelector)) return;
      const item = targetItem(e);
      if (!item || (canDrag && !canDrag(item))) return;
      const id = getItemId(item);
      if (!id) return;

      draggedId = id;
      draggedEl = item;
      item.classList.add('list-reorder-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(mime, id);
      e.dataTransfer.setData('text/plain', id);
    },
    true,
  );

  host.addEventListener(
    'dragover',
    (e) => {
      if (!draggedId && !hasReorderType(e.dataTransfer, mime)) return;
      const item = targetItem(e);
      if (!item || item === draggedEl) {
        clearMarker();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      const rect = item.getBoundingClientRect();
      const after = e.clientY >= rect.top + rect.height / 2;
      const marker = markerFor(item);
      if (markerEl !== marker) clearMarker();
      markerEl = marker;
      marker.classList.toggle('list-reorder-before', !after);
      marker.classList.toggle('list-reorder-after', after);
    },
    true,
  );

  host.addEventListener(
    'dragleave',
    (e) => {
      if (!markerEl) return;
      const related = /** @type {Node|null} */ (e.relatedTarget);
      if (related && markerEl.contains(related)) return;
      clearMarker();
    },
    true,
  );

  host.addEventListener(
    'drop',
    (e) => {
      if (!hasReorderType(e.dataTransfer, mime) && !draggedId) return;
      const item = targetItem(e);
      const fromId = draggedId || e.dataTransfer.getData(mime);
      clearMarker();
      if (!item || !fromId) {
        cleanup();
        return;
      }
      const toId = getItemId(item);
      if (!toId || fromId === toId) {
        cleanup();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const rect = item.getBoundingClientRect();
      const placeAfter = e.clientY >= rect.top + rect.height / 2;
      onReorder(fromId, toId, placeAfter);
      cleanup();
    },
    true,
  );

  host.addEventListener('dragend', cleanup, true);
}

/**
 * @returns {HTMLSpanElement}
 */
export function createReorderHandle(title = 'Перетащить для смены порядка') {
  const handle = document.createElement('span');
  handle.className = LIST_REORDER_CLASS;
  handle.draggable = true;
  handle.title = title;
  handle.setAttribute('aria-hidden', 'true');
  handle.textContent = '⋮⋮';
  return handle;
}

/**
 * Wrap thumbnail so the reorder handle covers the full preview.
 * @param {HTMLElement} thumb
 * @returns {HTMLDivElement}
 */
export function wrapThumbWithReorderHandle(thumb) {
  const wrap = document.createElement('div');
  wrap.className = 'list-reorder-thumb-wrap';
  const handle = createReorderHandle();
  wrap.append(thumb, handle);
  return wrap;
}

/**
 * Wall row: wide drag hit area, compact ⋮⋮ glyph.
 * @returns {HTMLSpanElement}
 */
export function createWallReorderHandle(title = 'Перетащить для смены порядка') {
  const wrap = document.createElement('span');
  wrap.className = 'list-reorder-handle-wrap list-reorder-handle-wrap--wall';
  wrap.draggable = true;
  wrap.title = title;
  const grip = document.createElement('span');
  grip.className = 'list-reorder-handle-grip';
  grip.setAttribute('aria-hidden', 'true');
  grip.textContent = '⋮⋮';
  wrap.appendChild(grip);
  return wrap;
}
