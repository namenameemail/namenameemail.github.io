/**
 * Custom project file format (.rvz) — JSON envelope with embedded assets.
 *
 * @example
 * {
 *   "format": "room-visualizer",
 *   "version": 1,
 *   "kind": "project",
 *   "exportedAt": "2026-05-20T12:00:00.000Z",
 *   "project": { ... }
 * }
 */

/** @typedef {import('./state.js').AppState} AppState */
/** @typedef {import('./state.js').Project} Project */

export const RVZ_FORMAT = 'room-visualizer';
export const RVZ_VERSION = 1;
export const RVZ_EXTENSION = '.rvz';
export const RVZ_MIME = 'application/vnd.room-visualizer+rvz';

/**
 * @param {string} prefix
 */
function newEntityId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Deep clone project and assign fresh ids (safe import alongside existing data).
 * @param {Project} project
 * @returns {Project}
 */
export function remapProjectIds(project) {
  const p = structuredClone(project);
  p.id = newEntityId('project');

  for (const room of p.rooms) {
    const wallIdMap = new Map();

    room.id = newEntityId('room');

    const itemIdMap = new Map();

    for (const wall of room.walls) {
      const oldWallId = wall.id;
      const newWallId = newEntityId('wall');
      wallIdMap.set(oldWallId, newWallId);
      wall.id = newWallId;

      for (const item of wall.items) {
        const oldItemId = item.id;
        item.id = newEntityId('item');
        itemIdMap.set(oldItemId, item.id);
      }
    }

    if (room.activeWallId && wallIdMap.has(room.activeWallId)) {
      room.activeWallId = wallIdMap.get(room.activeWallId);
    } else {
      room.activeWallId = room.walls[0]?.id ?? '';
    }

    if (room.selectedItemId && itemIdMap.has(room.selectedItemId)) {
      room.selectedItemId = itemIdMap.get(room.selectedItemId);
    } else {
      room.selectedItemId = null;
    }

    const photoIdMap = new Map();
    for (const photo of room.photos) {
      const oldPhotoId = photo.id;
      const newPhotoId = newEntityId('photo');
      photoIdMap.set(oldPhotoId, newPhotoId);
      photo.id = newPhotoId;

      const corners = {};
      for (const [oldWid, pts] of Object.entries(photo.cornersByWallId || {})) {
        if (wallIdMap.has(oldWid)) corners[wallIdMap.get(oldWid)] = pts;
      }
      photo.cornersByWallId = corners;

      const enabled = {};
      for (const [oldWid, val] of Object.entries(photo.wallEnabled || {})) {
        if (wallIdMap.has(oldWid)) enabled[wallIdMap.get(oldWid)] = val;
      }
      photo.wallEnabled = enabled;
    }

    if (room.activePhotoId && photoIdMap.has(room.activePhotoId)) {
      room.activePhotoId = photoIdMap.get(room.activePhotoId);
    } else {
      room.activePhotoId = room.photos[0]?.id ?? null;
    }
  }

  if (p.activeRoomId && p.rooms.some((r) => r.id === p.activeRoomId)) {
    /* keep */
  } else {
    p.activeRoomId = p.rooms[0]?.id ?? null;
  }

  return p;
}

/**
 * @param {Project} project
 * @returns {string}
 */
export function serializeProjectFile(project) {
  const envelope = {
    format: RVZ_FORMAT,
    version: RVZ_VERSION,
    kind: 'project',
    exportedAt: new Date().toISOString(),
    project: structuredClone(project),
  };
  return `RVZ${RVZ_VERSION}\n${JSON.stringify(envelope)}`;
}

/**
 * @param {unknown} raw
 * @returns {Project}
 */
export function parseProjectFile(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('RVZ')) {
      const nl = trimmed.indexOf('\n');
      data = JSON.parse(nl >= 0 ? trimmed.slice(nl + 1) : trimmed.slice(3));
    } else {
      data = JSON.parse(trimmed);
    }
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Файл пуст или повреждён');
  }

  const envelope = /** @type {Record<string, unknown>} */ (data);

  if (envelope.format !== RVZ_FORMAT) {
    throw new Error('Неизвестный формат файла (ожидается room-visualizer)');
  }

  const version = Number(envelope.version);
  if (!Number.isFinite(version) || version > RVZ_VERSION) {
    throw new Error(`Версия файла ${envelope.version} не поддерживается`);
  }

  if (envelope.kind !== 'project' || !envelope.project) {
    throw new Error('Ожидается файл проекта (kind: project)');
  }

  return /** @type {Project} */ (envelope.project);
}

/**
 * @param {string} filename
 * @param {string} contents
 */
export function downloadTextFile(filename, contents) {
  const blob = new Blob([contents], { type: `${RVZ_MIME};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {string} name
 */
export function projectFileName(name) {
  const safe = name.replace(/[^\w\u0400-\u04FF.-]+/g, '_').replace(/^_|_$/g, '') || 'project';
  return `${safe}${RVZ_EXTENSION}`;
}
