/**
 * Room wall visualizer — projects → rooms → photos → walls → items.
 * Walls belong to room; corner calibration is per photo.
 */

import { createPreviewHandles, resolveWallColor } from './preview-handles.js';
import { convertBoundaryMode, defaultWallBoundary } from './wall-patch.js';
import { createPreviewView } from './preview-view.js';
import { createWallEditor } from './wall-editor.js';
import { PreviewRendererGL } from './preview-renderer-gl.js';
import { exportPreviewJpg } from './export-preview-gl.js';
import { IDENTITY_VIEW } from './gl/gl-shaders.js';
import { createRenderScheduler, createThrottle, debounce } from './render-scheduler.js';
import { createItemListRenderer } from './item-list.js';
import {
  applyItemAspectSize,
  clampItemToWall,
  getItemDisplayName,
  normalizeWallItem,
} from './item-aspect.js';
import { createWallList } from './wall-list.js';
import { createNavPanels } from './nav-panels.js';
import { createRoomTabs } from './room-tabs.js';
import { startInlineRename } from './inline-rename.js';
import { createProjectModal } from './project-modal.js';
import { initPanelSplitters } from './panel-splitters.js';
import {
  createProject,
  createRoom,
  createWall,
  createPhoto,
  normalizeState,
  getActiveContext,
  getWallBoundary,
  getWallCorners,
  setWallBoundary,
  setWallCorners,
  isWallEnabledOnPhoto,
  setWallEnabledOnPhoto,
  wallsWithPhotoCorners,
} from './state.js';
import { bindClipboardImagePaste } from './clipboard-paste.js';
import { bindFileDropZone, FILE_DROP_OVER_CLASS, isRvzFile, rvzFilesFromDataTransfer } from './file-drop.js';
import {
  bindListReorder,
  reorderArrayById,
  REORDER_MIME_ITEM,
  REORDER_MIME_PHOTO,
  REORDER_MIME_WALL,
} from './list-reorder.js';
import { loadPersistedState, savePersistedState } from './storage.js';
import {
  downloadTextFile,
  parseProjectFile,
  projectFileName,
  remapProjectIds,
  serializeProjectFile,
} from './project-file.js';

/** @typedef {import('./state.js').AppState} AppState */
/** @typedef {import('./state.js').Project} Project */
/** @typedef {import('./state.js').Room} Room */
/** @typedef {import('./state.js').Wall} Wall */
/** @typedef {import('./state.js').Photo} Photo */
/** @typedef {import('./state.js').WallItem} WallItem */

const previewCanvas = document.getElementById('preview');
const previewOverlay = document.getElementById('preview-overlay');
const editorCanvas = document.getElementById('wall-editor');
const previewWrap = document.getElementById('preview-wrap');
const navScenePanelEl = document.getElementById('nav-photo-scene');

const projectTitleEl = document.getElementById('project-title');
const btnOpenProjects = document.getElementById('btn-open-projects');
const btnAddProject = document.getElementById('btn-add-project');
const projectModalRoot = document.getElementById('project-modal');
const projectModalList = document.getElementById('project-modal-list');
const btnProjectModalClose = document.getElementById('btn-project-modal-close');
const confirmDeleteModal = document.getElementById('confirm-delete-modal');
const confirmDeleteTitle = document.getElementById('confirm-delete-title');
const confirmDeleteMessage = document.getElementById('confirm-delete-message');
const btnConfirmDeleteClose = document.getElementById('btn-confirm-delete-close');
const btnConfirmDeleteCancel = document.getElementById('btn-confirm-delete-cancel');
const btnConfirmDeleteConfirm = document.getElementById('btn-confirm-delete-confirm');
const roomDeleteModal = document.getElementById('room-delete-modal');
const roomDeleteMessage = document.getElementById('room-delete-message');
const btnRoomDeleteClose = document.getElementById('btn-room-delete-close');
const btnRoomDeleteCancel = document.getElementById('btn-room-delete-cancel');
const btnRoomDeleteConfirm = document.getElementById('btn-room-delete-confirm');
const btnAddRoom = document.getElementById('btn-add-room');
const roomTabsBar = document.getElementById('room-tabs-bar');
const roomContentSection = document.getElementById('room-content-section');
const btnAddPhoto = document.getElementById('btn-add-photo');
const btnAddWall = document.getElementById('btn-add-wall');
const btnAddImage = document.getElementById('btn-add-image');
const btnDownloadJpg = document.getElementById('btn-download-jpg');
const btnDownloadWallJpg = document.getElementById('btn-download-wall-jpg');
const btnExportRvz = document.getElementById('btn-export-rvz');
const importRvzInput = document.getElementById('import-rvz-input');
const btnImportRvz = document.getElementById('btn-import-rvz');
const projectModalDialog = document.getElementById('project-modal-dialog');
const projectModalDropHint = document.getElementById('project-modal-drop-hint');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomReset = document.getElementById('btn-zoom-reset');
const photoImagesInput = document.getElementById('photo-images-input');
const overlayInput = document.getElementById('overlay-input');

/** @type {AppState} */
const appState = {
  projects: [],
  activeProjectId: null,
};

let projectIdCounter = 1;
let roomIdCounter = 1;
let photoIdCounter = 1;
/** @type {HTMLImageElement|null} */
let activePhotoImage = null;
let cleanPreviewMode = false;
let cleanEditorExportMode = false;
let pendingDeleteRoomId = null;
/** @type {((save: boolean) => void) | null} */
let cancelProjectTitleRename = null;
/** @type {{ kind: 'photo'|'wall'|'item'|'project', id: string } | null} */
let pendingConfirmDelete = null;
/** @type {Map<string, HTMLImageElement>} */
const imageCache = new Map();

const previewRenderer = new PreviewRendererGL(previewCanvas, previewOverlay, previewWrap, {
  onContextLost: () => {
    previewRenderer.getTextureCache()?.clear();
  },
  onContextRestored: async () => {
    await cacheAllImages();
    previewRenderer.invalidateAll();
    scheduleRenderNow({ preview: true });
  },
});

function ctx() {
  return getActiveContext(appState);
}

function getWalls() {
  return ctx().room?.walls ?? [];
}

function getPhotos() {
  return ctx().room?.photos ?? [];
}

function getWallsForPreview() {
  const { room, photo } = ctx();
  if (!room) return [];
  return wallsWithPhotoCorners(room, photo);
}

function getActiveWallId() {
  return ctx().room?.activeWallId ?? '';
}

function getSelectedItemId() {
  return ctx().room?.selectedItemId ?? null;
}

function setSelectedItemId(id) {
  const { room } = ctx();
  if (room) room.selectedItemId = id;
}

function getActiveWall() {
  return ctx().wall;
}


function isWallCalibrated(wall) {
  const { photo } = ctx();
  return !!getWallBoundary(photo, wall.id);
}

/**
 * @param {import('./state.js').Photo} photo
 * @param {import('./state.js').Room} room
 */
function photoHasCalibration(photo, room) {
  return room.walls.some(
    (w) => isWallEnabledOnPhoto(photo, w.id) && !!getWallBoundary(photo, w.id),
  );
}

function toggleWallOnPhoto(wallId, enabled) {
  const { photo } = ctx();
  if (!photo) return;

  setWallEnabledOnPhoto(photo, wallId, enabled);
  if (enabled) ensureWallCornersOnPhoto(wallId);
  previewRenderer.invalidateWall(wallId);
  scheduleSave();
  scheduleRender({ preview: true, ui: true });
}

function ensureWallCornersOnPhoto(wallId) {
  const { room, photo } = ctx();
  if (!room || !photo || getWallBoundary(photo, wallId)) return;

  const idx = room.walls.findIndex((w) => w.id === wallId);
  setWallBoundary(photo, wallId, defaultWallBoundary(Math.max(0, idx)));
}

/** Углы по умолчанию для всех стен, включённых на текущем фото. */
function ensureEnabledWallCornersOnPhoto() {
  const { room, photo } = ctx();
  if (!room || !photo) return;
  for (const wall of room.walls) {
    if (isWallEnabledOnPhoto(photo, wall.id)) {
      ensureWallCornersOnPhoto(wall.id);
    }
  }
}

function uid() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function setStatus(_msg) {
  /* статусная строка отключена */
}

function getWallDisplayColor(wallId) {
  const { room } = ctx();
  if (!room) return '#000000';
  const i = room.walls.findIndex((w) => w.id === wallId);
  const wall = i >= 0 ? room.walls[i] : null;
  return resolveWallColor(wall, i >= 0 ? i : 0);
}

function getActiveWallColor() {
  const wall = getActiveWall();
  return wall ? getWallDisplayColor(wall.id) : '#000000';
}

function onWallColorChange(wallId, color) {
  const { room } = ctx();
  const wall = room?.walls.find((w) => w.id === wallId);
  if (!wall) return;

  wall.color = color;
  wallList.reset();
  wallList.render();
  previewRenderer.invalidateWall(wallId);
  scheduleRender({ preview: true, editor: true, ui: true });
  scheduleSave();
}

function updateProjectTitle() {
  const { project } = ctx();
  if (!projectTitleEl) return;
  if (projectTitleEl.dataset.renaming !== '1') {
    projectTitleEl.textContent = project?.name ?? 'Проект';
  }
  projectTitleEl.disabled = !project;
}

projectTitleEl?.addEventListener('dblclick', (e) => {
  e.preventDefault();
  const { project } = ctx();
  if (!project || projectTitleEl.dataset.renaming === '1' || projectTitleEl.disabled) return;
  if (cancelProjectTitleRename) cancelProjectTitleRename(false);
  cancelProjectTitleRename = startInlineRename(projectTitleEl, project.name, (name) => {
    renameProject(project.id, name);
    cancelProjectTitleRename = null;
  });
});

function updateButtons() {
  const { project, room, photo, wall } = ctx();
  const hasPhoto = !!photo?.imageSrc;
  const calibrated = wall && isWallCalibrated(wall);

  btnAddRoom.disabled = !project;
  if (roomTabsBar) roomTabsBar.hidden = !project;
  btnAddPhoto.disabled = !room;
  updateProjectTitle();
  projectModal.render();
  btnAddWall.disabled = !room;
  btnAddImage.disabled = !hasPhoto || !calibrated;
  btnDownloadJpg.disabled = !hasPhoto;
  btnDownloadWallJpg.disabled = !wall;
  btnExportRvz.disabled = !project;
}

async function saveState() {
  try {
    await savePersistedState(appState);
  } catch (e) {
    console.warn('saveState failed', e);
    setStatus('Не удалось сохранить проект (мало места в браузере?)');
  }
}

const scheduleSave = debounce(() => {
  saveState();
}, 450);

function safeFileName(s) {
  return s.replace(/[^\w\u0400-\u04FF.-]+/g, '_');
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function ensureImageCached(src) {
  if (imageCache.has(src)) {
    const cached = imageCache.get(src);
    previewRenderer.getTextureCache()?.ensure(src, cached);
    return cached;
  }
  const img = await loadImage(src);
  imageCache.set(src, img);
  previewRenderer.getTextureCache()?.ensure(src, img);
  return img;
}

async function loadActivePhotoImage() {
  const { photo } = ctx();
  if (!photo?.imageSrc) {
    activePhotoImage = null;
    return;
  }
  activePhotoImage = await loadImage(photo.imageSrc);
}

async function cacheAllImages() {
  for (const project of appState.projects) {
    for (const room of project.rooms) {
      for (const photo of room.photos) {
        if (photo.imageSrc) await ensureImageCached(photo.imageSrc);
      }
      for (const wall of room.walls) {
        for (const item of wall.items) {
          await ensureImageCached(item.src);
        }
      }
    }
  }
}

function refreshIdCounters() {
  const pNums = appState.projects.map((p) =>
    parseInt(p.name.match(/(\d+)/)?.[1] || '0', 10),
  );
  projectIdCounter = Math.max(...pNums, appState.projects.length, 1);

  let maxRoom = 0;
  let maxPhoto = 0;
  for (const p of appState.projects) {
    for (const r of p.rooms) {
      const n = parseInt(r.name.match(/(\d+)/)?.[1] || '0', 10);
      maxRoom = Math.max(maxRoom, n);
      for (const ph of r.photos) {
        const pn = parseInt(ph.name.match(/(\d+)/)?.[1] || '0', 10);
        maxPhoto = Math.max(maxPhoto, pn);
      }
    }
  }
  roomIdCounter = Math.max(maxRoom, 1);
  photoIdCounter = Math.max(maxPhoto, 1);
}

function applyLoadedState(normalized) {
  appState.projects = normalized.projects;
  appState.activeProjectId = normalized.activeProjectId;
  refreshIdCounters();
}

function exportProjectRvz() {
  const { project } = ctx();
  if (!project) return;

  const json = serializeProjectFile(project);
  downloadTextFile(projectFileName(project.name), json);
  setStatus(`Проект «${project.name}» экспортирован`);
}

async function importProjectsFromFiles(files) {
  const file = files.find((f) => isRvzFile(f));
  if (!file) {
    setStatus('Нужен файл проекта (.rvz)');
    return;
  }
  try {
    await importProjectRvz(file);
    scheduleSave();
  } catch (err) {
    console.warn('import rvz failed', err);
    setStatus(err instanceof Error ? err.message : 'Ошибка импорта файла');
  }
}

async function importProjectRvz(file) {
  const text = await file.text();
  const raw = parseProjectFile(text);
  const normalized = normalizeState({
    projects: [raw],
    activeProjectId: raw.id,
  });
  const project = remapProjectIds(normalized.projects[0]);

  appState.projects.push(project);
  appState.activeProjectId = project.id;
  refreshIdCounters();

  imageCache.clear();
  previewRenderer.getTextureCache()?.clear();
  previewRenderer.invalidateAll();
  previewView.resetView();
  resetNavUi();
  wallList.reset();
  wallList.reset();
  projectModal.reset();

  await savePersistedState(appState);
  await switchProject(project.id);
  setStatus(`Импортирован проект «${project.name}»`);
}

function closeConfirmDeleteModal() {
  pendingConfirmDelete = null;
  if (confirmDeleteModal) confirmDeleteModal.hidden = true;
}

/**
 * @param {'photo'|'wall'|'item'|'project'} kind
 * @param {string} title
 * @param {string} message
 * @param {string} id
 */
function openConfirmDeleteModal(kind, title, message, id) {
  pendingConfirmDelete = { kind, id };
  if (confirmDeleteTitle) confirmDeleteTitle.textContent = title;
  if (confirmDeleteMessage) confirmDeleteMessage.textContent = message;
  if (confirmDeleteModal) confirmDeleteModal.hidden = false;
  btnConfirmDeleteConfirm?.focus();
}

function requestDeletePhoto(photoId) {
  const { room } = ctx();
  if (!room || room.photos.length <= 1) return;

  const id = photoId ?? room.activePhotoId;
  const photo = room.photos.find((p) => p.id === id);
  if (!photo) return;

  openConfirmDeleteModal(
    'photo',
    'Удалить фото?',
    `Фото «${photo.name}» будет удалено.`,
    id,
  );
}

function requestDeleteWall(wallId) {
  const { room } = ctx();
  if (!room || room.walls.length <= 1) return;

  const id = wallId ?? room.activeWallId;
  const wall = room.walls.find((w) => w.id === id);
  if (!wall) return;

  openConfirmDeleteModal(
    'wall',
    'Удалить стену?',
    `Стена «${wall.name}» и все её картинки будут удалены.`,
    id,
  );
}

function requestDeleteItem(itemId) {
  const { room } = ctx();
  if (!room) return;

  for (let wi = 0; wi < room.walls.length; wi++) {
    const wall = room.walls[wi];
    const idx = wall.items.findIndex((it) => it.id === itemId);
    if (idx < 0) continue;

    const item = wall.items[idx];
    openConfirmDeleteModal(
      'item',
      'Удалить картинку?',
      `Картинка «${getItemDisplayName(item, idx)}» будет удалена.`,
      itemId,
    );
    return;
  }
}

function closeRoomDeleteModal() {
  pendingDeleteRoomId = null;
  if (roomDeleteModal) roomDeleteModal.hidden = true;
}

function requestDeleteRoom(roomId) {
  const { project } = ctx();
  if (!project || project.rooms.length <= 1) return;

  const id = roomId ?? project.activeRoomId;
  const room = project.rooms.find((r) => r.id === id);
  if (!room) return;

  pendingDeleteRoomId = id;
  if (roomDeleteMessage) {
    roomDeleteMessage.textContent = `Комната «${room.name}» и все её фото, стены и картинки будут удалены.`;
  }
  if (roomDeleteModal) roomDeleteModal.hidden = false;
  btnRoomDeleteConfirm?.focus();
}

async function loadState() {
  try {
    const persisted = await loadPersistedState();
    if (!persisted) return;

    applyLoadedState(normalizeState(persisted));
    await cacheAllImages();
    await loadActivePhotoImage();
  } catch (e) {
    console.warn('loadState failed', e);
  }
}

function renderPreview() {
  previewRenderer.render({
    roomImage: activePhotoImage,
    walls: getWallsForPreview(),
    imageCache,
    getViewMatrix: () => previewView.getViewMatrix() ?? IDENTITY_VIEW,
    drawOverlay: (c) => previewHandles?.drawOverlay(c),
    hideOverlay: cleanPreviewMode,
  });
}

function onBoundaryModeChange(wallId, mode) {
  const { photo } = ctx();
  if (!photo) return;

  const boundary = getWallBoundary(photo, wallId);
  if (!boundary) return;

  const next = convertBoundaryMode(boundary, mode);
  setWallBoundary(photo, wallId, next);
  previewRenderer.invalidateWall(wallId);
  wallList.reset();
  wallList.render();
  scheduleRender({ preview: true, editor: true, ui: true });
  scheduleSave();
}

function onBoundaryChange(wallId, boundary, options = {}) {
  const { save = true } = options;
  const { photo } = ctx();
  if (!photo) return;

  setWallBoundary(photo, wallId, boundary);
  previewRenderer.invalidateWall(wallId);
  if (save) scheduleSave();
  scheduleRender({ preview: true, editor: true, ui: save });
}

function selectWall(wallId) {
  const { room } = ctx();
  if (!room || room.activeWallId === wallId) return;

  room.activeWallId = wallId;
  room.selectedItemId = null;
  ensureWallCornersOnPhoto(wallId);
  wallList.reset();
  scheduleRender({ ui: true, editor: true, preview: true });
  scheduleSave();
}

function syncWallListDims() {
  const wall = getActiveWall();
  if (wall) wallList.syncDims(wall);
}

function selectItem(id) {
  const { room } = ctx();
  if (!room) return;

  const itemWall = room.walls.find((w) => w.items.some((it) => it.id === id));
  if (!itemWall) return;

  if (room.activeWallId !== itemWall.id) {
    selectWall(itemWall.id);
  }

  setSelectedItemId(id);
  wallList.reset();
  updateButtons();
  scheduleRender({ editor: true, ui: true });
}

function deleteItem(itemId) {
  const wall = getActiveWall();
  if (!wall) return;

  wall.items = wall.items.filter((it) => it.id !== itemId);
  if (getSelectedItemId() === itemId) setSelectedItemId(null);
  wallList.reset();
  onWallUpdate(wall);
  scheduleRenderNow({ preview: true, editor: true, ui: true });
}

function onItemFieldChange(itemId, field, value, save) {
  const wall = getActiveWall();
  if (!wall) return;

  const item = wall.items.find((it) => it.id === itemId);
  if (!item) return;

  item[field] = value;
  applyItemAspectSize(item, wall, imageCache);
  clampItemToWall(item, wall);
  if (save) {
    wallList.reset();
  } else {
    itemRenderer.syncItem(item);
  }
  onWallUpdate(wall, { save, invalidateWall: save, renderPreview: save });
  scheduleRender({ preview: save, editor: true, ui: save });
}

function onItemManualChange(itemId, dim, manual) {
  const wall = getActiveWall();
  if (!wall) return;

  const item = wall.items.find((it) => it.id === itemId);
  if (!item) return;

  normalizeWallItem(item);
  if (dim === 'width') item.manualWidth = manual;
  else item.manualHeight = manual;

  if (!item.manualWidth && !item.manualHeight) {
    if (dim === 'width') item.manualHeight = true;
    else item.manualWidth = true;
  }

  applyItemAspectSize(item, wall, imageCache);
  clampItemToWall(item, wall);
  wallList.reset();
  onWallUpdate(wall, { save: true });
  scheduleRender({ preview: true, editor: true, ui: true });
}

function roundM(v) {
  return Math.round(v * 100) / 100;
}

function onWallUpdate(wall, options = {}) {
  const { save = true, invalidateWall = true, renderPreview = true } = options;
  const { room } = ctx();
  if (!room) return;

  const idx = room.walls.findIndex((w) => w.id === wall.id);
  if (idx >= 0) room.walls[idx] = wall;
  if (invalidateWall) previewRenderer.invalidateWall(wall.id);
  if (save) scheduleSave();
  if (renderPreview) scheduleRender({ preview: true });
}

function addWall() {
  const { room } = ctx();
  if (!room) return;

  room.wallIdCounter += 1;
  const wall = createWall(room.wallIdCounter);
  room.walls.push(wall);
  room.activeWallId = wall.id;
  room.selectedItemId = null;
  ensureEnabledWallCornersOnPhoto();
  previewRenderer.invalidateWall(wall.id);
  wallList.reset();
  setStatus(`Добавлена «${wall.name}». Задайте углы на текущем фото.`);
  scheduleRender({ ui: true, preview: true, editor: true });
  scheduleSave();
}

function deleteWall(wallId) {
  const { room } = ctx();
  if (!room || room.walls.length <= 1) return;

  const id = wallId ?? room.activeWallId;
  const idx = room.walls.findIndex((w) => w.id === id);
  if (idx < 0) return;

  const removedId = id;
  room.walls.splice(idx, 1);
  for (const photo of room.photos) {
    if (photo.cornersByWallId) delete photo.cornersByWallId[removedId];
    if (photo.wallEnabled) delete photo.wallEnabled[removedId];
  }
  room.activeWallId = room.walls[Math.min(idx, room.walls.length - 1)].id;
  room.selectedItemId = null;
  wallList.reset();
  previewRenderer.deleteWallFbo(removedId);
  wallList.reset();
  setStatus('Стена удалена');
  scheduleRender({ ui: true });
  scheduleSave();
}

async function switchRoom(roomId, force = false) {
  const { project } = ctx();
  if (!project) return;

  const room = project.rooms.find((r) => r.id === roomId);
  if (!room) return;

  const sameRoom = project.activeRoomId === roomId;
  project.activeRoomId = roomId;

  if (!room.activePhotoId && room.photos[0]) {
    room.activePhotoId = room.photos[0].id;
  }
  ensureEnabledWallCornersOnPhoto();

  // После пустого проекта activeRoomId может совпадать, но фото/превью уже сброшены
  if (sameRoom && !force && activePhotoImage) {
    renderNavUi();
    wallList.render();
    updateButtons();
    scheduleRenderNow({ preview: true, editor: true, ui: true });
    return;
  }

  previewRenderer.invalidateAll();
  previewView.resetView();
  wallList.reset();
  resetNavUi();
  projectModal.reset();
  renderNavUi();
  updateButtons();

  await loadActivePhotoImage();
  scheduleRenderNow({ preview: true, editor: true, ui: true });
  scheduleSave();
}

async function switchPhoto(photoId) {
  const { room } = ctx();
  if (!room || !photoId) return;

  const samePhoto = room.activePhotoId === photoId;
  room.activePhotoId = photoId;
  ensureEnabledWallCornersOnPhoto();

  renderNavUi();
  wallList.render();
  updateButtons();

  if (samePhoto && activePhotoImage) {
    scheduleRenderNow({ preview: true, ui: true, editor: true });
    return;
  }

  previewRenderer.invalidateAll();
  previewView.resetView();
  wallList.reset();
  await loadActivePhotoImage();
  scheduleRenderNow({ preview: true, ui: true, editor: true });
  scheduleSave();
}

async function switchProject(projectId) {
  appState.activeProjectId = projectId;
  const project = appState.projects.find((p) => p.id === projectId);
  if (project && !project.activeRoomId && project.rooms[0]) {
    project.activeRoomId = project.rooms[0].id;
  }
  if (project?.activeRoomId) {
    await switchRoom(project.activeRoomId, true);
  } else {
    activePhotoImage = null;
    previewRenderer.invalidateAll();
    previewView.resetView();
    resetNavUi();
    wallList.reset();
    projectModal.reset();
    renderNavUi();
    wallList.render();
    updateButtons();
    scheduleRenderNow({ preview: true, editor: true, ui: true });
    scheduleSave();
  }
}

function addProject() {
  projectIdCounter += 1;
  const project = createProject(projectIdCounter);
  appState.projects.push(project);
  appState.activeProjectId = project.id;
  activePhotoImage = null;
  previewRenderer.invalidateAll();
  resetNavUi();
  projectModal.reset();
  wallList.reset();
  setStatus(`Проект «${project.name}». Добавьте комнату и фото.`);
  scheduleRenderNow({ ui: true });
  scheduleSave();
}

function requestDeleteProject(projectId) {
  if (appState.projects.length <= 1) return;

  const project = appState.projects.find((p) => p.id === projectId);
  if (!project) return;

  openConfirmDeleteModal(
    'project',
    'Удалить проект?',
    `Проект «${project.name}» и все комнаты, фото, стены и картинки будут удалены.`,
    projectId,
  );
}

function renameProject(projectId, name) {
  const project = appState.projects.find((p) => p.id === projectId);
  if (!project) return;

  const trimmed = name.trim();
  if (!trimmed || trimmed === project.name) return;

  project.name = trimmed;
  projectModal.reset();
  updateProjectTitle();
  projectModal.render();
  scheduleSave();
}

function deleteProject(projectId) {
  if (appState.projects.length <= 1) return;

  const idx = appState.projects.findIndex((p) => p.id === projectId);
  if (idx < 0) return;

  const wasActive = appState.activeProjectId === projectId;
  appState.projects.splice(idx, 1);
  if (wasActive) {
    appState.activeProjectId = appState.projects[Math.min(idx, appState.projects.length - 1)].id;
    resetNavUi();
    projectModal.reset();
    const project = appState.projects.find((p) => p.id === appState.activeProjectId);
    if (project?.activeRoomId) {
      switchProject(appState.activeProjectId);
    } else {
      activePhotoImage = null;
      scheduleRenderNow({ ui: true });
      scheduleSave();
    }
  } else {
    projectModal.reset();
    projectModal.render();
    scheduleSave();
  }
  setStatus('Проект удалён');
}

async function addRoom() {
  const { project } = ctx();
  if (!project) return;

  roomIdCounter += 1;
  const room = createRoom(roomIdCounter);
  project.rooms.push(room);
  project.activeRoomId = room.id;
  await switchRoom(room.id);
  setStatus(`Комната «${room.name}» создана. Добавьте фото.`);
}

async function ensureProjectRoomForPhotos() {
  if (!appState.projects.length) addProject();
  if (!ctx().room) await addRoom();
}

function reorderRoomPhotos(photoId, targetPhotoId, placeAfter) {
  const { room } = ctx();
  if (!room) return;
  const ok = reorderArrayById(room.photos, photoId, targetPhotoId, placeAfter, (p) => p.id);
  if (!ok) return;
  resetNavUi();
  renderNavUi();
  scheduleSave();
}

function reorderRoomWalls(wallId, targetWallId, placeAfter) {
  const { room } = ctx();
  if (!room) return;
  const ok = reorderArrayById(room.walls, wallId, targetWallId, placeAfter, (w) => w.id);
  if (!ok) return;
  wallList.reset();
  renderNavUi();
  scheduleRender({ preview: true, editor: true, ui: true });
  scheduleSave();
}

function reorderWallItems(wallId, itemId, targetItemId, placeAfter) {
  const { room } = ctx();
  if (!room) return;
  const wall = room.walls.find((w) => w.id === wallId);
  if (!wall) return;
  const ok = reorderArrayById(wall.items, itemId, targetItemId, placeAfter, (it) => it.id);
  if (!ok) return;
  wallList.reset();
  onWallUpdate(wall);
  scheduleRender({ preview: true, editor: true, ui: true });
  scheduleSave();
}

async function addPhotosFromFiles(files) {
  const { room } = ctx();
  if (!room || !files.length) return;

  const added = [];
  for (const file of files) {
    const src = await readFileAsDataUrl(file);
    room.photoIdCounter += 1;
    const photo = createPhoto(room.photoIdCounter, src);
    photo.name = file.name.replace(/\.[^.]+$/, '') || photo.name;
    room.photos.push(photo);
    added.push(photo);
    await ensureImageCached(src);

    resetNavUi();
    renderNavUi();
    updateButtons();
  }

  if (added.length) {
    await switchPhoto(added[added.length - 1].id);
    setStatus(
      added.length === 1
        ? `Фото «${added[0].name}» добавлено`
        : `Добавлено фото: ${added.length}`,
    );
  }
}

async function deletePhoto(photoId) {
  const { room } = ctx();
  if (!room || room.photos.length <= 1) return;

  const id = photoId ?? room.activePhotoId;
  const idx = room.photos.findIndex((p) => p.id === id);
  if (idx < 0) return;

  room.photos.splice(idx, 1);
  resetNavUi();
  await switchPhoto(room.photos[Math.min(idx, room.photos.length - 1)].id);
  setStatus('Фото удалено');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {string} */ (reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * @param {File} file
 * @param {Wall} wall
 * @returns {Promise<WallItem|null>}
 */
async function addItemFromFile(file, wall) {
  if (!wall) return null;

  const src = await readFileAsDataUrl(file);
  const img = await ensureImageCached(src);
  const ar =
    img.naturalWidth > 0 && img.naturalHeight > 0
      ? img.naturalWidth / img.naturalHeight
      : 1;

  const defaultW = Math.min(1, wall.widthM * 0.4);
  const defaultH = defaultW / ar;

  const baseName = file.name.replace(/\.[^.]+$/, '').trim();
  const item = {
    id: uid(),
    name: baseName || `Картинка ${wall.items.length + 1}`,
    src,
    xM: (wall.widthM - defaultW) / 2,
    yM: (wall.heightM - defaultH) / 2,
    widthM: defaultW,
    heightM: defaultH,
    rotationDeg: 0,
    aspectRatio: ar,
    manualWidth: true,
    manualHeight: false,
  };
  clampItemToWall(item, wall);
  wall.items.push(item);
  return item;
}

/**
 * @param {File[]} files
 * @param {string} [wallId]
 */
async function addItemsFromFiles(files, wallId) {
  const { room } = ctx();
  if (!files.length || !room) return;

  const targetId = wallId ?? room.activeWallId;
  const wall = room.walls.find((w) => w.id === targetId);
  if (!wall) return;

  if (room.activeWallId !== wall.id) {
    selectWall(wall.id);
  }

  const added = [];
  for (const file of files) {
    const item = await addItemFromFile(file, wall);
    if (item) added.push(item);
  }
  if (!added.length) return;

  wallList.reset();
  selectItem(added[added.length - 1].id);
  onWallUpdate(wall);
  setStatus(
    added.length === 1
      ? 'Картинка добавлена.'
      : `Добавлено картинок: ${added.length}`,
  );
  scheduleRenderNow({ preview: true, editor: true, ui: true });
}

function deleteRoom(roomId) {
  const { project } = ctx();
  if (!project || project.rooms.length <= 1) return;

  const id = roomId ?? project.activeRoomId;
  const idx = project.rooms.findIndex((r) => r.id === id);
  if (idx < 0) return;

  project.rooms.splice(idx, 1);
  project.activeRoomId = project.rooms[Math.min(idx, project.rooms.length - 1)].id;
  resetNavUi();
  switchRoom(project.activeRoomId);
  setStatus('Комната удалена');
}

function flushRender(flags = {}) {
  const { preview = false, editor = false, ui = false } = flags;
  if (ui) {
    renderNavUi();
    projectModal.render();
    wallList.render();
  }
  if (ui || preview || editor) {
    syncWallListDims();
    updateButtons();
    if (previewHandles.dragging) {
      previewCanvas.style.cursor = 'grabbing';
    } else if (previewView.panning) {
      previewCanvas.style.cursor = 'move';
    } else if (previewHandles.hovering) {
      previewCanvas.style.cursor = 'grab';
    } else {
      previewCanvas.style.cursor = 'default';
    }
  }
  if (editor) {
    wallEditor.resizeCanvas();
    wallEditor.draw();
  }
  if (preview) renderPreview();
}

const { schedule: scheduleRender, scheduleNow: scheduleRenderNow } = createRenderScheduler(flushRender);

/** Превью при перетаскивании картинки на стене (~15 кадров/с). */
const scheduleDragPreview = createThrottle(() => {
  const wall = getActiveWall();
  if (wall) previewRenderer.invalidateWall(wall.id);
  scheduleRender({ preview: true, editor: true });
}, 64);

/** После drag/scrub — финальное превью и списки. */
function finishInteractiveEdit() {
  const wall = getActiveWall();
  if (wall) previewRenderer.invalidateWall(wall.id);
  scheduleSave();
  scheduleRender({ preview: true, editor: true, ui: true });
}

function renameRoom(roomId, name) {
  const { project } = ctx();
  const room = project?.rooms.find((r) => r.id === roomId);
  if (!room || room.name === name) return;
  room.name = name;
  resetNavUi();
  renderNavUi();
  scheduleSave();
}

function renamePhoto(photoId, roomId, name) {
  const { project } = ctx();
  const room = project?.rooms.find((r) => r.id === roomId);
  const photo = room?.photos.find((p) => p.id === photoId);
  if (!photo || photo.name === name) return;
  photo.name = name;
  resetNavUi();
  renderNavUi();
  scheduleSave();
}

async function selectPhoto(photoId, roomId) {
  const { project } = ctx();
  if (!project) return;
  if (project.activeRoomId !== roomId) {
    await switchRoom(roomId);
  }
  await switchPhoto(photoId);
}

function renameWall(wallId, name) {
  const { room } = ctx();
  const wall = room?.walls.find((w) => w.id === wallId);
  if (!wall || wall.name === name) return;
  wall.name = name;
  wallList.reset();
  wallList.render();
  scheduleRenderNow({ preview: true });
  scheduleSave();
}

function renameItem(itemId, name) {
  const wall = getActiveWall();
  const item = wall?.items.find((i) => i.id === itemId);
  if (!item || item.name === name) return;
  item.name = name;
  wallList.reset();
  wallList.render();
  scheduleSave();
}

const itemRenderer = createItemListRenderer({
  getSelectedItemId,
  getActiveWallId: () => ctx().room?.activeWallId ?? '',
  onSelect: selectItem,
  onDelete: requestDeleteItem,
  onRenameItem: renameItem,
  onFieldChange: onItemFieldChange,
  onManualChange: onItemManualChange,
  onScrubEnd: finishInteractiveEdit,
  roundM,
});

const wallList = createWallList({
  container: document.getElementById('wall-list'),
  emptyEl: document.getElementById('wall-list-empty'),
  getWalls,
  getActiveWallId: () => ctx().room?.activeWallId ?? '',
  hasPhoto: () => !!ctx().photo,
  isEnabledOnPhoto: (wallId) => isWallEnabledOnPhoto(ctx().photo, wallId),
  onToggleEnabled: toggleWallOnPhoto,
  onSelect: selectWall,
  onDimChange: onWallDimChange,
  onDelete: requestDeleteWall,
  onRenameWall: renameWall,
  onColorChange: onWallColorChange,
  getWallBoundary: (wallId) => getWallBoundary(ctx().photo, wallId),
  onBoundaryModeChange,
  onScrubEnd: finishInteractiveEdit,
  canDeleteWall: () => (ctx().room?.walls.length ?? 0) > 1,
  roundM,
  itemRenderer,
});

const roomTabs = createRoomTabs({
  listEl: document.getElementById('room-tabs-list'),
  getState: () => appState,
  onSelectRoom: (id) => switchRoom(id),
  onDeleteRoom: requestDeleteRoom,
  canDeleteRoom: () => (ctx().project?.rooms.length ?? 0) > 1,
});

const navPanels = createNavPanels({
  photoListEl: document.getElementById('photo-list'),
  roomTitleEl: document.getElementById('room-content-title'),
  scenePanelEl: navScenePanelEl,
  contentSectionEl: roomContentSection,
  getState: () => appState,
  onSelectPhoto: selectPhoto,
  onDeletePhoto: requestDeletePhoto,
  onRenamePhoto: renamePhoto,
  onRenameRoom: renameRoom,
  canDeletePhoto: (room) => room.photos.length > 1,
  hasCalibration: photoHasCalibration,
  onSceneMountChange: () => wallList.render(),
});

function renderNavUi() {
  roomTabs.render();
  navPanels.render();
}

function resetNavUi() {
  roomTabs.reset();
  navPanels.reset();
}

const projectModal = createProjectModal({
  root: projectModalRoot,
  listEl: projectModalList,
  pickerBtn: btnOpenProjects,
  addBtn: btnAddProject,
  closeBtn: btnProjectModalClose,
  dialogEl: projectModalDialog,
  importBtn: btnImportRvz,
  importInput: importRvzInput,
  dropHintEl: projectModalDropHint,
  onImportFiles: importProjectsFromFiles,
  getState: () => appState,
  onSelect: (id) => switchProject(id),
  onAdd: addProject,
  onDelete: requestDeleteProject,
  canDelete: () => appState.projects.length > 1,
});

if (projectModalDialog) {
  bindFileDropZone(projectModalDialog, {
    canAccept: () => true,
    extractFiles: rvzFilesFromDataTransfer,
    onFiles: importProjectsFromFiles,
  });
  projectModalDialog.addEventListener('dragover', () => {
    if (projectModalDropHint && projectModalDialog.classList.contains(FILE_DROP_OVER_CLASS)) {
      projectModalDropHint.hidden = false;
    }
  });
  projectModalDialog.addEventListener('dragleave', (e) => {
    if (!projectModalDropHint) return;
    const related = /** @type {Node|null} */ (e.relatedTarget);
    if (related && projectModalDialog.contains(related)) return;
    projectModalDropHint.hidden = true;
  });
  projectModalDialog.addEventListener('drop', () => {
    if (projectModalDropHint) projectModalDropHint.hidden = true;
  });
  document.addEventListener('dragend', () => {
    if (projectModalDropHint) projectModalDropHint.hidden = true;
  });
}

function onWallDimChange(wallId, field, value, save) {
  const { room } = ctx();
  if (!room) return;

  const wall = room.walls.find((w) => w.id === wallId);
  if (!wall) return;

  wall[field] = Math.max(0.1, value);
  wall.items.forEach((item) => {
    applyItemAspectSize(item, wall, imageCache);
    clampItemToWall(item, wall);
    if (!save) itemRenderer.syncItem(item);
  });
  if (save) {
    wallList.reset();
  } else {
    wallList.syncDims(wall);
  }
  onWallUpdate(wall, { save, invalidateWall: save, renderPreview: save });
  scheduleRender({ preview: save, editor: true, ui: save });
}

/** @type {ReturnType<typeof createPreviewHandles> | null} */
let previewHandles = null;

const previewView = createPreviewView({
  canvas: previewCanvas,
  getBaseLayout: () => previewRenderer.getLayout(),
  getScreenRect: () => previewRenderer.getScreenRect(),
  onChange: () => scheduleRender({ preview: true }),
  isCornerDragging: () => !!previewHandles?.dragging,
});

previewHandles = createPreviewHandles({
  getWalls: getWallsForPreview,
  getWallColor: getWallDisplayColor,
  getActiveWallId,
  onSelectWall: selectWall,
  onBoundaryChange,
  screenToNorm: (x, y) => previewView.screenToNorm(x, y),
  normToScreen: (norm) => previewView.normToScreen(norm),
  getScreenRect: () => previewRenderer.getScreenRect(),
  canvas: previewCanvas,
  setStatus,
  onChange: () => scheduleRender({ preview: true }),
  onDragEnd: finishInteractiveEdit,
});

btnZoomIn?.addEventListener('click', () => previewView.zoomIn());
btnZoomOut?.addEventListener('click', () => previewView.zoomOut());
btnZoomReset?.addEventListener('click', () => {
  previewView.resetView();
  scheduleRender({ preview: true });
});

const wallEditor = createWallEditor({
  canvas: editorCanvas,
  getActiveWall,
  onWallUpdate,
  getSelectedItemId,
  setSelectedItemId: (id) => {
    if (id) selectItem(id);
    else {
      setSelectedItemId(null);
      updateButtons();
      wallList.render();
    }
  },
  onChange: () => {
    scheduleRender({ editor: true });
    scheduleDragPreview();
  },
  onDragEnd: () => {
    scheduleDragPreview.cancel();
    finishInteractiveEdit();
  },
  imageCache,
  getWallColor: getActiveWallColor,
  getPhotoBackground: () => {
    const { photo } = ctx();
    const wall = getActiveWall();
    if (!photo || !wall) return { image: null, corners: null };
    return {
      image: activePhotoImage,
      boundary: getWallBoundary(photo, wall.id),
    };
  },
  getCleanExportPreview: () => cleanEditorExportMode,
});

btnAddRoom.addEventListener('click', async () => {
  if (!appState.projects.length) addProject();
  await addRoom();
});

photoImagesInput.addEventListener('change', async (e) => {
  const files = [...(e.target.files || [])];
  if (!files.length) return;

  await ensureProjectRoomForPhotos();
  await addPhotosFromFiles(files);
  e.target.value = '';
});

btnAddPhoto.addEventListener('click', () => photoImagesInput.click());

overlayInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  await addItemsFromFiles([file], getActiveWall()?.id);
  e.target.value = '';
});

const photoListEl = document.getElementById('photo-list');
const wallListEl = document.getElementById('wall-list');

bindFileDropZone(photoListEl, {
  onFiles: async (files) => {
    await ensureProjectRoomForPhotos();
    await addPhotosFromFiles(files);
  },
});

bindFileDropZone(wallListEl, {
  canAccept: () => !!ctx().photo && (ctx().room?.walls.length ?? 0) > 0,
  getDropTarget: (e) => {
    const block = e.target.closest('.wall-items-block');
    return block ? /** @type {HTMLElement} */ (block) : null;
  },
  onFiles: (files, dropTarget) => {
    const wallId = dropTarget.dataset.wallId;
    if (!wallId) return;
    return addItemsFromFiles(files, wallId);
  },
});

bindListReorder(photoListEl, {
  mime: REORDER_MIME_PHOTO,
  itemSelector: '.photo-nav-entry:not(.photo-nav-add)',
  markerSelector: '.photo-nav-row',
  handleSelector: '.list-reorder-handle',
  getItemId: (el) => el.dataset.photoId ?? null,
  onReorder: reorderRoomPhotos,
});

bindListReorder(wallListEl, {
  mime: REORDER_MIME_WALL,
  itemSelector: '.wall-list-entry',
  handleSelector: '.list-reorder-handle-wrap--wall',
  skipTargetSelector: '.item-list-entry',
  getItemId: (el) => el.dataset.wallId ?? null,
  onReorder: reorderRoomWalls,
});

bindListReorder(wallListEl, {
  mime: REORDER_MIME_ITEM,
  itemSelector: '.item-list-entry',
  handleSelector: '.list-reorder-handle',
  getItemId: (el) => el.dataset.itemId ?? null,
  onReorder: (itemId, targetItemId, placeAfter) => {
    const entry = wallListEl.querySelector(`.item-list-entry[data-item-id="${itemId}"]`);
    const wallId = entry?.closest('.wall-items-block')?.dataset.wallId;
    if (!wallId) return;
    reorderWallItems(wallId, itemId, targetItemId, placeAfter);
  },
});

bindClipboardImagePaste({
  photoListEl,
  wallListEl,
  onPastePhotos: async (files) => {
    await ensureProjectRoomForPhotos();
    await addPhotosFromFiles(files);
  },
  onPasteWallItems: (wallId, files) => addItemsFromFiles(files, wallId),
  canPasteWallItems: () => !!ctx().photo,
});

btnAddWall.addEventListener('click', addWall);
btnAddImage.addEventListener('click', () => overlayInput.click());
btnExportRvz.addEventListener('click', exportProjectRvz);

function setCleanPreviewMode(enabled) {
  if (cleanPreviewMode === enabled) return;
  cleanPreviewMode = enabled;
  scheduleRender({ preview: true });
}

function setCleanEditorExportMode(enabled) {
  if (cleanEditorExportMode === enabled) return;
  cleanEditorExportMode = enabled;
  scheduleRender({ editor: true });
}

btnDownloadJpg.addEventListener('mouseenter', () => setCleanPreviewMode(true));
btnDownloadJpg.addEventListener('mouseleave', () => setCleanPreviewMode(false));
btnDownloadJpg.addEventListener('focus', () => setCleanPreviewMode(true));
btnDownloadJpg.addEventListener('blur', () => setCleanPreviewMode(false));

btnDownloadWallJpg?.addEventListener('mouseenter', () => setCleanEditorExportMode(true));
btnDownloadWallJpg?.addEventListener('mouseleave', () => setCleanEditorExportMode(false));
btnDownloadWallJpg?.addEventListener('focus', () => setCleanEditorExportMode(true));
btnDownloadWallJpg?.addEventListener('blur', () => setCleanEditorExportMode(false));

btnConfirmDeleteClose?.addEventListener('click', closeConfirmDeleteModal);
btnConfirmDeleteCancel?.addEventListener('click', closeConfirmDeleteModal);
confirmDeleteModal
  ?.querySelector('[data-confirm-delete-cancel]')
  ?.addEventListener('click', closeConfirmDeleteModal);
btnConfirmDeleteConfirm?.addEventListener('click', () => {
  const pending = pendingConfirmDelete;
  closeConfirmDeleteModal();
  if (!pending) return;
  if (pending.kind === 'photo') deletePhoto(pending.id);
  else if (pending.kind === 'wall') deleteWall(pending.id);
  else if (pending.kind === 'item') deleteItem(pending.id);
  else if (pending.kind === 'project') deleteProject(pending.id);
});

btnRoomDeleteClose?.addEventListener('click', closeRoomDeleteModal);
btnRoomDeleteCancel?.addEventListener('click', closeRoomDeleteModal);
roomDeleteModal
  ?.querySelector('[data-room-delete-cancel]')
  ?.addEventListener('click', closeRoomDeleteModal);
btnRoomDeleteConfirm?.addEventListener('click', () => {
  const id = pendingDeleteRoomId;
  closeRoomDeleteModal();
  if (id) deleteRoom(id);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (confirmDeleteModal && !confirmDeleteModal.hidden) closeConfirmDeleteModal();
  else if (roomDeleteModal && !roomDeleteModal.hidden) closeRoomDeleteModal();
});

btnDownloadJpg.addEventListener('click', async () => {
  const { project, room, photo } = ctx();
  if (!activePhotoImage || !room || !photo) return;

  const blob = await exportPreviewJpg({
    roomImage: activePhotoImage,
    walls: room.walls,
    photo,
    isWallEnabled: isWallEnabledOnPhoto,
    getBoundary: getWallBoundary,
    imageCache,
    quality: 0.92,
  });

  if (!blob) {
    setStatus('Не удалось экспортировать JPG');
    return;
  }

  const filename = `${safeFileName(project?.name || 'project')}-${safeFileName(room.name)}-${safeFileName(photo.name)}.jpg`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('JPG сохранён');
});

btnDownloadWallJpg.addEventListener('click', async () => {
  const { project, room, wall } = ctx();
  if (!room || !wall) return;

  const blob = await wallEditor.exportJpg(0.92);
  if (!blob) {
    setStatus('Не удалось экспортировать стену в JPG');
    return;
  }

  const filename = `${safeFileName(project?.name || 'project')}-${safeFileName(room.name)}-${safeFileName(wall.name)}.jpg`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('JPG стены сохранён');
});

function onLayoutResize() {
  previewRenderer.invalidateAll();
  scheduleRender({ preview: true, editor: true });
}

window.addEventListener('resize', onLayoutResize);

if (typeof ResizeObserver !== 'undefined') {
  const editorWrap = document.querySelector('.editor-wrap');
  const previewStack = previewWrap?.querySelector('.preview-canvas-stack');
  const layoutObserver = new ResizeObserver((entries) => {
    let preview = false;
    let editor = false;
    for (const entry of entries) {
      if (entry.target === previewWrap || entry.target === previewStack) {
        preview = true;
      } else editor = true;
    }
    if (preview) previewRenderer.invalidateAll();
    scheduleRender({ preview: preview || undefined, editor: editor || undefined });
  });
  layoutObserver.observe(previewWrap);
  if (previewStack) layoutObserver.observe(previewStack);
  if (editorWrap) layoutObserver.observe(editorWrap);
}

initPanelSplitters();

(async function init() {
  await loadState();

  if (!appState.projects.length) {
    addProject();
    scheduleSave();
  }

  if (!appState.activeProjectId) {
    appState.activeProjectId = appState.projects[0].id;
  }

  const project = appState.projects.find((p) => p.id === appState.activeProjectId);
  if (project && !project.activeRoomId && project.rooms[0]) {
    project.activeRoomId = project.rooms[0].id;
  }

  const { room } = ctx();
  if (room && !room.activePhotoId && room.photos[0]) {
    room.activePhotoId = room.photos[0].id;
  }

  if (room?.activePhotoId) {
    await loadActivePhotoImage();
  }

  scheduleRenderNow({ preview: true, editor: true, ui: true });

  if (room?.photos.length) {
    setStatus('Проект загружен. Стены общие для всех фото комнаты.');
  } else if (room) {
    setStatus('Добавьте фото в комнату.');
  }
})();
