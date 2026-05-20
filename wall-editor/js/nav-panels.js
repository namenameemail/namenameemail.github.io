/**
 * Left sidebar: active room photos + walls/items.
 */

import { bindEditableName } from './inline-rename.js';
import { startInlineRename } from './inline-rename.js';

/** @typedef {import('./state.js').Room} Room */
/** @typedef {import('./state.js').Photo} Photo */
/** @typedef {import('./state.js').Project} Project */

/**
 * @param {object} opts
 * @param {HTMLElement} opts.photoListEl
 * @param {HTMLElement} opts.roomTitleEl
 * @param {HTMLElement} opts.scenePanelEl
 * @param {HTMLElement} opts.contentSectionEl
 * @param {() => import('./state.js').AppState} opts.getState
 * @param {(photoId: string, roomId: string) => void} opts.onSelectPhoto
 * @param {(photoId: string) => void} opts.onDeletePhoto
 * @param {(photoId: string, roomId: string, name: string) => void} opts.onRenamePhoto
 * @param {(roomId: string, name: string) => void} opts.onRenameRoom
 * @param {(room: Room) => boolean} opts.canDeletePhoto
 * @param {(photo: Photo, room: Room) => boolean} opts.hasCalibration
 * @param {() => void} [opts.onSceneMountChange]
 */
export function createNavPanels(opts) {
  const {
    photoListEl,
    roomTitleEl,
    scenePanelEl,
    contentSectionEl,
    getState,
    onSelectPhoto,
    onDeletePhoto,
    onRenamePhoto,
    onRenameRoom,
    canDeletePhoto,
    hasCalibration,
    onSceneMountChange,
  } = opts;

  let listKey = '';
  /** @type {((save: boolean) => void) | null} */
  let cancelRoomRename = null;
  const photoAddPark = document.getElementById('nav-photo-add-park');
  const photoAddBtn = document.getElementById('btn-add-photo');

  roomTitleEl?.addEventListener('dblclick', (e) => {
    e.preventDefault();
    const state = getState();
    const project = state.projects.find((p) => p.id === state.activeProjectId);
    const room = project?.rooms.find((r) => r.id === project.activeRoomId);
    if (!room || roomTitleEl.dataset.renaming === '1') return;
    if (cancelRoomRename) cancelRoomRename(false);
    cancelRoomRename = startInlineRename(roomTitleEl, room.name, (name) => {
      onRenameRoom(room.id, name);
      cancelRoomRename = null;
    });
  });

  function appendPhotoAddRow() {
    if (!photoAddBtn) return;
    if (photoAddPark) photoAddPark.appendChild(photoAddBtn);
    const li = document.createElement('li');
    li.className = 'photo-nav-entry photo-nav-add';
    li.appendChild(photoAddBtn);
    photoListEl.appendChild(li);
  }

  function setContentVisible(visible) {
    if (contentSectionEl) contentSectionEl.hidden = !visible;
    if (scenePanelEl) scenePanelEl.hidden = !visible;
    onSceneMountChange?.();
  }

  /**
   * @param {HTMLElement} photoListEl
   * @param {Room} room
   */
  function appendPhotos(photoListEl, room) {
    const allowDeletePhoto = canDeletePhoto(room);

    for (const photo of room.photos) {
      const li = document.createElement('li');
      li.className = 'photo-nav-entry';
      li.dataset.photoId = photo.id;
      if (photo.id === room.activePhotoId) li.classList.add('active');

      const row = document.createElement('div');
      row.className = 'photo-nav-row';

      const thumb = document.createElement('img');
      thumb.className = 'photo-nav-thumb';
      thumb.alt = '';
      thumb.draggable = false;
      thumb.loading = 'lazy';
      if (photo.imageSrc) {
        thumb.src = photo.imageSrc;
      } else {
        thumb.classList.add('photo-nav-thumb--empty');
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-entry nav-entry-photo' + (hasCalibration(photo, room) ? ' has-image' : '');
      btn.textContent = photo.name;

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'room-nav-delete';
      delBtn.title = 'Удалить фото';
      delBtn.textContent = '×';
      delBtn.disabled = !allowDeletePhoto;

      const renameBtn = bindEditableName(
        btn,
        () => photo.name,
        (name) => onRenamePhoto(photo.id, room.id, name),
        { onSelect: () => onSelectPhoto(photo.id, room.id) },
      );
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onDeletePhoto(photo.id);
      });
      row.append(thumb, btn, renameBtn, delBtn);
      li.appendChild(row);

      row.addEventListener('click', (e) => {
        if (e.target.closest('button, .inline-rename-input, .btn-rename')) return;
        onSelectPhoto(photo.id, room.id);
      });
      li.addEventListener('click', (e) => {
        if (e.target.closest('button, .inline-rename-input, .btn-rename')) return;
        onSelectPhoto(photo.id, room.id);
      });

      photoListEl.appendChild(li);
    }
  }

  /**
   * @param {Room|null} room
   */
  function contentSignature(room) {
    if (!room) return '';
    const photos = room.photos
      .map((p) => `${p.id}:${p.name}:${p.imageSrc ? '1' : '0'}:${hasCalibration(p, room)}`)
      .join(';');
    const walls = room.walls
      .map((w) => `${w.id}:${w.name}:${w.items.length}`)
      .join(';');
    return `${room.id}:${room.name}:${photos}:${walls}:${room.activePhotoId ?? ''}:${room.activeWallId ?? ''}:${room.selectedItemId ?? ''}`;
  }

  /**
   * @param {Room|null} room
   */
  function rebuild(room) {
    photoListEl.innerHTML = '';

    if (!room) {
      setContentVisible(false);
      if (roomTitleEl) roomTitleEl.textContent = '';
      if (photoAddPark && photoAddBtn) photoAddPark.appendChild(photoAddBtn);
      return;
    }

    setContentVisible(true);
    if (roomTitleEl && roomTitleEl.dataset.renaming !== '1') {
      roomTitleEl.textContent = room.name;
    }

    if (room.photos.length) {
      appendPhotos(photoListEl, room);
    }
    appendPhotoAddRow();
  }

  /**
   * @param {Room|null} room
   */
  function updateSelection(room) {
    if (!room) return;

    if (roomTitleEl && roomTitleEl.dataset.renaming !== '1') {
      roomTitleEl.textContent = room.name;
    }

    photoListEl.querySelectorAll('.photo-nav-entry').forEach((photoEl) => {
      photoEl.classList.toggle('active', photoEl.dataset.photoId === room.activePhotoId);
    });

    photoListEl.querySelectorAll('.photo-nav-entry .room-nav-delete').forEach((el) => {
      el.disabled = !canDeletePhoto(room);
    });
  }

  function render() {
    const state = getState();
    const project = state.projects.find((p) => p.id === state.activeProjectId);
    const room = project?.rooms.find((r) => r.id === project?.activeRoomId) ?? null;
    const key = `${project?.id ?? ''}|${contentSignature(room)}|${room ? canDeletePhoto(room) : false}`;

    if (key === listKey) {
      updateSelection(room);
      return;
    }
    listKey = key;
    rebuild(room);
  }

  function reset() {
    listKey = '';
  }

  return { render, reset };
}
