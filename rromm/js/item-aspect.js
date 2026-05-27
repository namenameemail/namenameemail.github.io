/**
 * Wall item size: optional auto width/height from image aspect ratio.
 */

/** @typedef {import('./state.js').WallItem} WallItem */
/** @typedef {import('./state.js').Wall} Wall */

const MIN_SIZE_M = 0.05;

/**
 * @param {WallItem} item
 * @param {number} index — 0-based position in wall.items
 */
export function getItemDisplayName(item, index) {
  const custom = typeof item.name === 'string' ? item.name.trim() : '';
  return custom || `Картинка ${index + 1}`;
}

/**
 * @param {WallItem} item
 */
export function normalizeWallItem(item) {
  if (typeof item.aspectRatio !== 'number' || item.aspectRatio <= 0) {
    item.aspectRatio = item.widthM > 0 && item.heightM > 0
      ? item.widthM / item.heightM
      : 1;
  }
  if (typeof item.rotationDeg !== 'number' || Number.isNaN(item.rotationDeg)) {
    item.rotationDeg = 0;
  }
  if (typeof item.manualWidth !== 'boolean') item.manualWidth = true;
  if (typeof item.manualHeight !== 'boolean') item.manualHeight = true;
  if (!item.manualWidth && !item.manualHeight) item.manualHeight = true;
}

/**
 * @param {WallItem} item
 * @param {Map<string, HTMLImageElement>} imageCache
 */
export function getItemAspectRatio(item, imageCache) {
  const img = imageCache.get(item.src);
  if (img?.naturalWidth > 0 && img.naturalHeight > 0) {
    return img.naturalWidth / img.naturalHeight;
  }
  return item.aspectRatio > 0 ? item.aspectRatio : 1;
}

/**
 * @param {WallItem} item
 * @param {Wall} wall
 * @param {Map<string, HTMLImageElement>} imageCache
 */
export function applyItemAspectSize(item, wall, imageCache) {
  normalizeWallItem(item);
  const ar = getItemAspectRatio(item, imageCache);
  item.aspectRatio = ar;

  if (item.manualWidth && !item.manualHeight) {
    item.heightM = item.widthM / ar;
  } else if (!item.manualWidth && item.manualHeight) {
    item.widthM = item.heightM * ar;
  }
}

/**
 * @param {WallItem} item
 * @param {Wall} wall
 */
export function clampItemToWall(item, wall) {
  item.widthM = Math.max(MIN_SIZE_M, Math.min(item.widthM, wall.widthM));
  item.heightM = Math.max(MIN_SIZE_M, Math.min(item.heightM, wall.heightM));
  item.xM = Math.max(0, Math.min(item.xM, wall.widthM - item.widthM));
  item.yM = Math.max(0, Math.min(item.yM, wall.heightM - item.heightM));
}
