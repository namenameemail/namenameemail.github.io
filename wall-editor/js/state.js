/**
 * App state: projects → rooms → photos; walls & items belong to room.
 */

/** @typedef {{x:number,y:number}} PointNorm */
/**
 * @typedef {Object} WallItem
 * @property {string} id
 * @property {string} src
 * @property {number} xM
 * @property {number} yM
 * @property {number} widthM
 * @property {number} heightM
 * @property {number} [rotationDeg] угол поворота по часовой стрелке, градусы
 * @property {number} [aspectRatio] width/height of image
 * @property {boolean} [manualWidth] false = ширина из пропорций
 * @property {boolean} [manualHeight] false = высота из пропорций
 * @property {string} [name] пользовательское имя (иначе «Картинка N»)
 */
/**
 * @typedef {Object} Wall
 * @property {string} id
 * @property {string} name
 * @property {number} widthM
 * @property {number} heightM
 * @property {WallItem[]} items
 */
/**
 * @typedef {Object} Photo
 * @property {string} id
 * @property {string} name
 * @property {string} imageSrc
 * @property {Record<string, PointNorm[]|null|undefined>} cornersByWallId
 * @property {Record<string, boolean>} [wallEnabled] wallId → false если стена выключена на этом фото
 */
/**
 * @typedef {Object} Room
 * @property {string} id
 * @property {string} name
 * @property {Wall[]} walls
 * @property {Photo[]} photos
 * @property {string} activeWallId
 * @property {string|null} activePhotoId
 * @property {string|null} selectedItemId
 * @property {number} wallIdCounter
 * @property {number} photoIdCounter
 */
/**
 * @typedef {Object} Project
 * @property {string} id
 * @property {string} name
 * @property {Room[]} rooms
 * @property {string|null} activeRoomId
 */
/**
 * @typedef {Object} AppState
 * @property {Project[]} projects
 * @property {string|null} activeProjectId
 */

export const STORAGE_KEY = 'room_visualizer_state_v4';

/**
 * @param {number} n
 * @returns {Wall}
 */
export function createWall(n) {
  return {
    id: `wall-${Date.now()}-${n}`,
    name: `Стена ${n}`,
    widthM: 4,
    heightM: 2.7,
    items: [],
  };
}

/**
 * @param {number} n
 * @param {string} imageSrc
 * @returns {Photo}
 */
export function createPhoto(n, imageSrc) {
  return {
    id: `photo-${Date.now()}-${n}`,
    name: `Фото ${n}`,
    imageSrc,
    cornersByWallId: {},
    wallEnabled: {},
  };
}

/**
 * @param {number} n
 * @returns {Room}
 */
export function createRoom(n) {
  const wall = createWall(1);
  return {
    id: `room-${Date.now()}-${n}`,
    name: `Комната ${n}`,
    walls: [wall],
    photos: [],
    activeWallId: wall.id,
    activePhotoId: null,
    selectedItemId: null,
    wallIdCounter: 1,
    photoIdCounter: 0,
  };
}

/**
 * @param {number} n
 * @returns {Project}
 */
export function createProject(n) {
  return {
    id: `project-${Date.now()}-${n}`,
    name: `Проект ${n}`,
    rooms: [],
    activeRoomId: null,
  };
}

/**
 * @param {Photo|null|undefined} photo
 * @param {string} wallId
 * @returns {PointNorm[]|null}
 */
export function getWallCorners(photo, wallId) {
  if (!photo) return null;
  const c = photo.cornersByWallId[wallId];
  return c?.length === 4 ? c : null;
}

/**
 * @param {Photo} photo
 * @param {string} wallId
 * @param {PointNorm[]|null} corners
 */
export function setWallCorners(photo, wallId, corners) {
  if (!photo.cornersByWallId) photo.cornersByWallId = {};
  photo.cornersByWallId[wallId] = corners;
}

/**
 * @param {Photo} photo
 * @param {string} wallId
 */
export function clearWallCorners(photo, wallId) {
  if (photo.cornersByWallId) delete photo.cornersByWallId[wallId];
}

/**
 * @param {Photo|null|undefined} photo
 * @param {string} wallId
 * @returns {boolean}
 */
export function isWallEnabledOnPhoto(photo, wallId) {
  if (!photo) return false;
  return photo.wallEnabled?.[wallId] !== false;
}

/**
 * @param {Photo} photo
 * @param {string} wallId
 * @param {boolean} enabled
 */
export function setWallEnabledOnPhoto(photo, wallId, enabled) {
  if (!photo.wallEnabled) photo.wallEnabled = {};
  if (enabled) delete photo.wallEnabled[wallId];
  else photo.wallEnabled[wallId] = false;
}

/**
 * @param {unknown} raw
 * @returns {AppState}
 */
export function normalizeState(raw) {
  if (raw && typeof raw === 'object' && Array.isArray(/** @type {AppState} */ (raw).projects)) {
    const state = /** @type {AppState} */ (raw);
    return {
      projects: state.projects.map(normalizeProject),
      activeProjectId: state.activeProjectId ?? null,
    };
  }
  return migrateLegacy(/** @type {Record<string, unknown>} */ (raw || {}));
}

/**
 * @param {Project} p
 * @returns {Project}
 */
function normalizeProject(p) {
  return {
    ...p,
    rooms: (p.rooms || []).map(normalizeRoom),
    activeRoomId: p.activeRoomId ?? null,
  };
}

/**
 * @param {Room} r
 * @returns {Room}
 */
function normalizeRoom(r) {
  if (Array.isArray(r.photos)) {
    const walls = (r.walls || []).map(normalizeWall);
    const photos = r.photos.map(normalizePhoto);
    const activeWallId =
      walls.some((w) => w.id === r.activeWallId) ? r.activeWallId : walls[0]?.id;
    const activePhotoId =
      r.activePhotoId && photos.some((p) => p.id === r.activePhotoId)
        ? r.activePhotoId
        : photos[0]?.id ?? null;

    return {
      id: r.id,
      name: r.name || 'Комната',
      walls,
      photos,
      activeWallId,
      activePhotoId,
      selectedItemId: r.selectedItemId ?? null,
      wallIdCounter: r.wallIdCounter ?? walls.length,
      photoIdCounter: r.photoIdCounter ?? photos.length,
    };
  }
  return migrateRoomFromV3(/** @type {Room & {imageSrc?: string|null}} */ (r));
}

/**
 * @param {Room & {imageSrc?: string|null, cornersNorm?: PointNorm[]}} wall
 * @returns {Wall}
 */
function normalizeWall(w) {
  const { cornersNorm, ...rest } = w;
  return {
    id: rest.id,
    name: rest.name || 'Стена',
    widthM: rest.widthM ?? 4,
    heightM: rest.heightM ?? 2.7,
    items: rest.items || [],
  };
}

/**
 * @param {Photo} p
 * @returns {Photo}
 */
function normalizePhoto(p) {
  return {
    id: p.id,
    name: p.name || 'Фото',
    imageSrc: p.imageSrc,
    cornersByWallId: { ...(p.cornersByWallId || {}) },
    wallEnabled: { ...(p.wallEnabled || {}) },
  };
}

/**
 * @param {Room & {imageSrc?: string|null}} room
 * @returns {Room}
 */
function migrateRoomFromV3(room) {
  const walls = (room.walls || []).map((w) => {
    const wall = normalizeWall(/** @type {Wall & {cornersNorm?: PointNorm[]}} */ (w));
    return { wall, corners: w.cornersNorm };
  });

  const photos = [];
  if (room.imageSrc) {
    const photo = createPhoto(1, room.imageSrc);
    photo.name = 'Фото 1';
    for (const { wall, corners } of walls) {
      if (corners?.length === 4) {
        setWallCorners(photo, wall.id, corners);
      }
    }
    photos.push(photo);
  }

  return {
    id: room.id,
    name: room.name || 'Комната',
    walls: walls.map((x) => x.wall),
    photos,
    activeWallId: room.activeWallId || walls[0]?.wall.id,
    activePhotoId: photos[0]?.id ?? null,
    selectedItemId: room.selectedItemId ?? null,
    wallIdCounter: room.wallIdCounter ?? walls.length,
    photoIdCounter: photos.length,
  };
}

/**
 * @param {Record<string, unknown>} data
 * @returns {AppState}
 */
function migrateLegacy(data) {
  let walls = Array.isArray(data.walls)
    ? data.walls.map((w) => normalizeWall(/** @type {Wall} */ (w)))
    : [];
  if (!walls.length) walls = [createWall(1)];

  const activeWallId =
    typeof data.activeWallId === 'string' && walls.some((w) => w.id === data.activeWallId)
      ? data.activeWallId
      : walls[0].id;

  const legacyWalls = Array.isArray(data.walls) ? data.walls : [];
  const photo = typeof data.roomImageSrc === 'string'
    ? createPhoto(1, data.roomImageSrc)
    : null;
  if (photo) {
    photo.name = 'Фото 1';
    legacyWalls.forEach((w, i) => {
      const corners = /** @type {{cornersNorm?: PointNorm[]}} */ (w).cornersNorm;
      if (corners?.length === 4 && walls[i]) {
        setWallCorners(photo, walls[i].id, corners);
      }
    });
  }

  const room = {
    id: 'room-migrated',
    name: 'Комната 1',
    walls,
    photos: photo ? [photo] : [],
    activeWallId,
    activePhotoId: photo?.id ?? null,
    selectedItemId: null,
    wallIdCounter:
      typeof data.wallIdCounter === 'number' ? data.wallIdCounter : walls.length,
    photoIdCounter: photo ? 1 : 0,
  };

  const project = {
    id: 'project-migrated',
    name: 'Проект 1',
    rooms: [room],
    activeRoomId: room.id,
  };

  return {
    projects: [project],
    activeProjectId: project.id,
  };
}

/**
 * @param {AppState} state
 * @returns {Project|null}
 */
export function getActiveProject(state) {
  return state.projects.find((p) => p.id === state.activeProjectId) || null;
}

/**
 * @param {Project|null} project
 * @returns {Room|null}
 */
export function getActiveRoom(project) {
  if (!project) return null;
  return project.rooms.find((r) => r.id === project.activeRoomId) || null;
}

/**
 * @param {Room|null} room
 * @returns {Photo|null}
 */
export function getActivePhoto(room) {
  if (!room?.activePhotoId) return null;
  return room.photos.find((p) => p.id === room.activePhotoId) || null;
}

/**
 * @param {Room|null} room
 * @returns {Wall|null}
 */
export function getActiveWall(room) {
  if (!room) return null;
  return room.walls.find((w) => w.id === room.activeWallId) || null;
}

/**
 * @param {AppState} state
 * @returns {{ project: Project|null, room: Room|null, photo: Photo|null, wall: Wall|null }}
 */
export function getActiveContext(state) {
  const project = getActiveProject(state);
  const room = getActiveRoom(project);
  const photo = getActivePhoto(room);
  const wall = getActiveWall(room);
  return { project, room, photo, wall };
}

/**
 * @param {Room} room
 * @param {Photo|null} photo
 * @returns {(Wall & {cornersNorm: PointNorm[]|null})[]}
 */
export function wallsWithPhotoCorners(room, photo) {
  return room.walls
    .filter((wall) => isWallEnabledOnPhoto(photo, wall.id))
    .map((wall) => ({
      ...wall,
      cornersNorm: getWallCorners(photo, wall.id),
    }));
}
