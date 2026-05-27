/**
 * Paste images from clipboard (Ctrl+V) when hovering a registered zone.
 */

/**
 * @param {DataTransfer|null} data
 * @returns {File[]}
 */
export function imageFilesFromClipboardData(data) {
  if (!data) return [];
  const out = [];
  const seen = new Set();

  if (data.items?.length) {
    for (const item of data.items) {
      if (!item.type.startsWith('image/')) continue;
      const f = item.getAsFile();
      if (!f) continue;
      const key = `${item.type}:${f.size}:${f.lastModified}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(f);
    }
    if (out.length) return out;
  }

  if (data.files?.length) {
    for (const f of data.files) {
      if (!f.type.startsWith('image/')) continue;
      const key = `${f.name}:${f.size}:${f.lastModified}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(f);
    }
  }
  return out;
}

/**
 * @param {EventTarget|null} target
 */
function isTextInputTarget(target) {
  if (!(target instanceof Element)) return false;
  return !!target.closest('input, textarea, select, .inline-rename-input, [contenteditable="true"]');
}

/**
 * @param {object} opts
 * @param {HTMLElement|null} opts.photoListEl
 * @param {HTMLElement|null} opts.wallListEl
 * @param {(files: File[]) => void|Promise<void>} opts.onPastePhotos
 * @param {(wallId: string, files: File[]) => void|Promise<void>} opts.onPasteWallItems
 * @param {() => boolean} [opts.canPasteWallItems]
 */
export function bindClipboardImagePaste(opts) {
  const { photoListEl, wallListEl, onPastePhotos, onPasteWallItems, canPasteWallItems = () => true } =
    opts;

  let hoverPhotos = false;
  /** @type {string|null} */
  let hoverWallId = null;

  if (photoListEl) {
    photoListEl.addEventListener('mouseenter', () => {
      hoverPhotos = true;
    });
    photoListEl.addEventListener('mouseleave', (e) => {
      const related = /** @type {Node|null} */ (e.relatedTarget);
      if (related && photoListEl.contains(related)) return;
      hoverPhotos = false;
    });
  }

  if (wallListEl) {
    wallListEl.addEventListener('mouseover', (e) => {
      const block = e.target.closest('.wall-items-block');
      if (!block?.dataset.wallId) return;
      hoverWallId = block.dataset.wallId;
    });
    wallListEl.addEventListener('mouseout', (e) => {
      const block = e.target.closest('.wall-items-block');
      if (!block?.dataset.wallId) return;
      const related = /** @type {Node|null} */ (e.relatedTarget);
      if (related && block.contains(related)) return;
      if (hoverWallId === block.dataset.wallId) hoverWallId = null;
    });
  }

  document.addEventListener('paste', async (e) => {
    if (isTextInputTarget(e.target)) return;

    const files = imageFilesFromClipboardData(e.clipboardData);
    if (!files.length) return;

    if (hoverWallId && canPasteWallItems()) {
      e.preventDefault();
      await onPasteWallItems(hoverWallId, files);
      return;
    }

    if (hoverPhotos) {
      e.preventDefault();
      await onPastePhotos(files);
    }
  });
}
