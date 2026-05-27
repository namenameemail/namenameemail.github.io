/**
 * Drag-and-drop image files onto a host element (optional delegated target).
 */

export const FILE_DROP_OVER_CLASS = 'file-drop-over';

/**
 * During dragover browsers usually hide file list — only types are available.
 * @param {DataTransfer|null} dt
 */
export function dataTransferHasFiles(dt) {
  if (!dt) return false;
  const types = [...dt.types];
  if (types.includes('Files')) return true;
  return types.some(
    (t) => t === 'application/x-moz-file' || t.startsWith('image/'),
  );
}

/**
 * @param {File} file
 */
function isImageFile(file) {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|bmp|avif|svg)$/i.test(file.name);
}

/**
 * @param {DataTransfer|null} dt
 * @returns {File[]}
 */
/**
 * @param {File} file
 */
export function isRvzFile(file) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith('.rvz') ||
    file.type === 'application/json' ||
    (file.type === '' && name.endsWith('.json'))
  );
}

/**
 * @param {DataTransfer|null} dt
 * @returns {File[]}
 */
export function rvzFilesFromDataTransfer(dt) {
  if (!dt) return [];
  const out = [];
  const seen = new Set();
  if (dt.items?.length) {
    for (const item of dt.items) {
      if (item.kind !== 'file') continue;
      const f = item.getAsFile();
      if (!f || !isRvzFile(f)) continue;
      const key = `${f.name}:${f.size}:${f.lastModified}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(f);
    }
    if (out.length) return out;
  }
  if (dt.files?.length) {
    for (const f of dt.files) {
      if (!isRvzFile(f)) continue;
      const key = `${f.name}:${f.size}:${f.lastModified}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(f);
    }
  }
  return out;
}

export function imageFilesFromDataTransfer(dt) {
  if (!dt) return [];
  const out = [];
  const seen = new Set();

  if (dt.items?.length) {
    for (const item of dt.items) {
      if (item.kind !== 'file') continue;
      const f = item.getAsFile();
      if (!f || !isImageFile(f)) continue;
      const key = `${f.name}:${f.size}:${f.lastModified}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(f);
    }
    if (out.length) return out;
  }

  if (dt.files?.length) {
    for (const f of dt.files) {
      if (!isImageFile(f)) continue;
      const key = `${f.name}:${f.size}:${f.lastModified}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(f);
    }
  }
  return out;
}

/**
 * @param {HTMLElement} host
 * @param {object} opts
 * @param {(files: File[], dropTarget: HTMLElement) => void|Promise<void>} opts.onFiles
 * @param {() => boolean} [opts.canAccept]
 * @param {(e: DragEvent) => HTMLElement|null} [opts.getDropTarget]
 * @param {(dt: DataTransfer|null) => File[]} [opts.extractFiles]
 */
export function bindFileDropZone(host, opts) {
  if (!host) return;

  const {
    onFiles,
    canAccept = () => true,
    getDropTarget,
    extractFiles = imageFilesFromDataTransfer,
  } = opts;

  /** @type {HTMLElement|null} */
  let highlightEl = null;

  function setHighlight(el) {
    if (highlightEl === el) return;
    highlightEl?.classList.remove(FILE_DROP_OVER_CLASS);
    highlightEl = el;
    highlightEl?.classList.add(FILE_DROP_OVER_CLASS);
  }

  function clearHighlight() {
    setHighlight(null);
  }

  /**
   * @param {DragEvent} e
   */
  function dropTargetFor(e) {
    if (getDropTarget) return getDropTarget(e);
    return host;
  }

  /**
   * @param {DragEvent} e
   */
  function tryActivate(e) {
    if (!dataTransferHasFiles(e.dataTransfer) || !canAccept()) {
      clearHighlight();
      return false;
    }
    const target = dropTargetFor(e);
    if (!target) {
      clearHighlight();
      return false;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    setHighlight(target);
    return true;
  }

  host.addEventListener(
    'dragenter',
    (e) => {
      tryActivate(e);
    },
    true,
  );

  host.addEventListener(
    'dragover',
    (e) => {
      tryActivate(e);
    },
    true,
  );

  host.addEventListener('dragleave', (e) => {
    if (!highlightEl) return;
    const related = /** @type {Node|null} */ (e.relatedTarget);
    if (related && highlightEl.contains(related)) return;
    if (related && host.contains(related)) return;
    clearHighlight();
  });

  host.addEventListener(
    'drop',
    async (e) => {
      const target = dropTargetFor(e);
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      clearHighlight();
      const files = extractFiles(e.dataTransfer);
      if (!files.length || !canAccept()) return;
      await onFiles(files, target);
    },
    true,
  );

  document.addEventListener('dragend', clearHighlight);
}
