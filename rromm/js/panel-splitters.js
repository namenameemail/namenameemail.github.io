/**
 * Draggable splitters between main layout panels (sidebar, preview, editor).
 */

const STORAGE_KEY = 'rv-panel-layout';

/** @typedef {{ sidebarWidth?: number, previewHeight?: number }} PanelLayout */

/**
 * @returns {PanelLayout | null}
 */
function loadLayout() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {PanelLayout} layout
 */
function saveLayout(layout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* ignore quota */
  }
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {HTMLElement} splitter
 * @param {object} opts
 * @param {'col'|'row'} opts.cursor
 * @param {() => void} opts.onDragStart
 * @param {(e: PointerEvent) => void} opts.onDragMove
 * @param {() => void} opts.onDragEnd
 */
function bindSplitter(splitter, opts) {
  const { cursor, onDragStart, onDragMove, onDragEnd } = opts;

  splitter.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    splitter.setPointerCapture(e.pointerId);
    document.body.classList.add('is-panel-resizing');
    document.body.dataset.resizeCursor = cursor;
    onDragStart();

    const move = (ev) => {
      if (ev.buttons === 0) {
        finish(ev);
        return;
      }
      onDragMove(ev);
    };

    const finish = (ev) => {
      splitter.releasePointerCapture(ev.pointerId);
      splitter.removeEventListener('pointermove', move);
      splitter.removeEventListener('pointerup', finish);
      splitter.removeEventListener('pointercancel', finish);
      document.body.classList.remove('is-panel-resizing');
      delete document.body.dataset.resizeCursor;
      onDragEnd();
      window.dispatchEvent(new Event('resize'));
    };

    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', finish);
    splitter.addEventListener('pointercancel', finish);
  });
}

export function initPanelSplitters() {
  const saved = loadLayout() ?? {};
  /** @type {PanelLayout} */
  const layout = { ...saved };

  const sidebar = document.getElementById('app-sidebar');
  const splitterSidebar = document.getElementById('splitter-sidebar');
  const workspace = document.getElementById('workspace');
  const panelPreview = document.getElementById('panel-preview');
  const splitterPreview = document.getElementById('splitter-preview-editor');

  const root = document.documentElement;

  function applySidebarWidth(px) {
    const max = Math.min(480, Math.floor((document.querySelector('.app-body')?.clientWidth ?? 800) * 0.55));
    const w = clamp(px, 180, max);
    root.style.setProperty('--sidebar-width', `${w}px`);
    layout.sidebarWidth = w;
    return w;
  }

  function applyPreviewHeight(px) {
    if (!workspace || !panelPreview) return px;
    const max = workspace.clientHeight - 80 - 4;
    const h = clamp(px, 120, max);
    root.style.setProperty('--preview-panel-height', `${h}px`);
    layout.previewHeight = h;
    return h;
  }

  if (saved.sidebarWidth) applySidebarWidth(saved.sidebarWidth);
  if (saved.previewHeight) applyPreviewHeight(saved.previewHeight);

  if (splitterSidebar && sidebar) {
    /** @type {number | null} */
    let startX = null;
    let startW = 0;

    bindSplitter(splitterSidebar, {
      cursor: 'col',
      onDragStart: () => {
        startX = null;
        startW = sidebar.offsetWidth;
      },
      onDragMove: (e) => {
        if (startX === null) startX = e.clientX;
        applySidebarWidth(startW + (e.clientX - startX));
      },
      onDragEnd: () => saveLayout(layout),
    });
  }

  if (splitterPreview && panelPreview && workspace) {
    /** @type {number | null} */
    let startY = null;
    let startH = 0;

    bindSplitter(splitterPreview, {
      cursor: 'row',
      onDragStart: () => {
        startY = null;
        startH = panelPreview.offsetHeight;
      },
      onDragMove: (e) => {
        if (startY === null) startY = e.clientY;
        applyPreviewHeight(startH + (e.clientY - startY));
      },
      onDragEnd: () => saveLayout(layout),
    });
  }

  window.addEventListener('resize', () => {
    if (layout.previewHeight) applyPreviewHeight(layout.previewHeight);
    if (layout.sidebarWidth) applySidebarWidth(layout.sidebarWidth);
  });
}
