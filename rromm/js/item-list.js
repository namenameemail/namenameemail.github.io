/**
 * Overlay items: nested under walls in the scene nav tree.
 */

import { bindInputScrub } from './input-scrub.js';
import { bindEditableName } from './inline-rename.js';
import { getItemDisplayName, normalizeWallItem } from './item-aspect.js';
import { wrapThumbWithReorderHandle } from './list-reorder.js';

/** @typedef {import('./state.js').Wall} Wall */
/** @typedef {import('./state.js').WallItem} WallItem */

const VIRTUAL_THRESHOLD = 25;
const VIRTUAL_ROW_PX = 76;
const VIRTUAL_MAX_H = 280;

/**
 * @param {object} opts
 * @param {() => string | null} opts.getSelectedItemId
 * @param {() => string} opts.getActiveWallId
 * @param {(id: string) => void} opts.onSelect
 * @param {(id: string) => void} opts.onDelete
 * @param {(id: string, name: string) => void} opts.onRenameItem
 * @param {(id: string, field: 'xM'|'yM'|'widthM'|'heightM'|'rotationDeg', value: number, save: boolean) => void} opts.onFieldChange
 * @param {(id: string, dim: 'width'|'height', manual: boolean) => void} opts.onManualChange
 * @param {() => void} opts.onScrubEnd
 * @param {(n: number) => number} opts.roundM
 */
export function createItemListRenderer(opts) {
  const {
    getSelectedItemId,
    getActiveWallId,
    onSelect,
    onDelete,
    onRenameItem,
    onFieldChange,
    onManualChange,
    onScrubEnd,
    roundM,
  } = opts;

  function bindFieldInput(input, itemId, field) {
    bindInputScrub(input, {
      onScrub: (v) => onFieldChange(itemId, field, v, false),
      onScrubEnd,
    });
    const commitTyped = () => {
      const value = parseFloat(input.value);
      if (!Number.isNaN(value)) onFieldChange(itemId, field, value, true);
    };
    input.addEventListener('input', () => {
      const value = parseFloat(input.value);
      if (!Number.isNaN(value)) onFieldChange(itemId, field, value, false);
    });
    input.addEventListener('change', commitTyped);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitTyped();
        input.blur();
      }
    });
  }

  /**
   * @param {Wall} wall
   * @param {WallItem} item
   * @param {string} label
   * @param {number} min
   * @param {number} max
   */
  function makeFieldInput(wall, item, field, label, min, max) {
    const lbl = document.createElement('label');
    lbl.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'item-list-size';
    input.dataset.field = field;
    input.min = String(min);
    input.step = '0.01';
    input.max = String(max);
    input.value = String(roundM(item[field]));
    lbl.appendChild(input);
    return { lbl, input };
  }

  /**
   * @param {Wall} wall
   * @param {WallItem} item
   * @param {'widthM'|'heightM'} field
   * @param {'width'|'height'} dim
   * @param {string} label
   */
  function makeSizeField(wall, item, field, dim, label) {
    normalizeWallItem(item);
    const manual = dim === 'width' ? item.manualWidth : item.manualHeight;

    const lbl = document.createElement('label');
    lbl.className = 'item-list-dim';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'item-list-manual';
    cb.dataset.dim = dim;
    cb.checked = manual;
    cb.title = 'Задать вручную (снять — считать по пропорции фото)';

    const tag = document.createElement('span');
    tag.className = 'item-list-dim-label';
    tag.textContent = label;

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'item-list-size';
    input.dataset.field = field;
    input.min = '0.05';
    input.step = '0.01';
    input.max = String(dim === 'width' ? wall.widthM : wall.heightM);
    input.value = String(roundM(item[field]));
    input.disabled = !manual;

    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => {
      onManualChange(item.id, dim, cb.checked);
    });

    lbl.append(cb, tag, input);
    return { lbl, input, cb };
  }

  /**
   * @param {HTMLElement} listEl
   * @param {Wall} wall
   * @param {WallItem} item
   * @param {number} index
   */
  /**
   * @param {boolean} [compact] — без полей X/Y/Ш/В (для виртуального списка)
   */
  function appendItemEntry(listEl, wall, item, index, compact = false) {
    const activeWallId = getActiveWallId();
    const selectedId = getSelectedItemId();
    const wallActive = wall.id === activeWallId;
    normalizeWallItem(item);
    const showSizeFields = !compact && wallActive;
    const showPosFields = showSizeFields && item.id === selectedId;

      const li = document.createElement('div');
      li.className = 'item-list-entry';
      li.dataset.itemId = item.id;
      if (showPosFields) li.classList.add('active');

      const thumb = document.createElement('img');
      thumb.className = 'item-list-thumb';
      thumb.src = item.src;
      thumb.alt = '';
      thumb.draggable = false;

      const body = document.createElement('div');
      body.className = 'item-list-body';

      const title = document.createElement('button');
      title.type = 'button';
      title.className = 'item-list-title';
      title.textContent = getItemDisplayName(item, index);

      const titleRow = document.createElement('div');
      titleRow.className = 'item-list-title-row';
      const renameBtn = bindEditableName(
        title,
        () => getItemDisplayName(item, index),
        (name) => onRenameItem(item.id, name),
        { onSelect: () => onSelect(item.id) },
      );
      titleRow.append(title, renameBtn);
      body.append(titleRow);

      if (showSizeFields) {
        const sizeRow = document.createElement('div');
        sizeRow.className = 'item-list-fields item-list-size-row';
        const { lbl: wLabel, input: wInput } = makeSizeField(
          wall, item, 'widthM', 'width', 'Ш',
        );
        const { lbl: hLabel, input: hInput } = makeSizeField(
          wall, item, 'heightM', 'height', 'В',
        );
        const { lbl: rLabel, input: rInput } = makeFieldInput(
          wall, item, 'rotationDeg', 'У', -180, 180,
        );
        rInput.step = '1';
        sizeRow.append(wLabel, hLabel, rLabel);
        body.appendChild(sizeRow);

        for (const input of [wInput, hInput, rInput]) {
          input.addEventListener('click', (e) => e.stopPropagation());
        }
        bindFieldInput(wInput, item.id, 'widthM');
        bindFieldInput(hInput, item.id, 'heightM');
        bindFieldInput(rInput, item.id, 'rotationDeg');
      }

      if (showPosFields) {
        const posRow = document.createElement('div');
        posRow.className = 'item-list-fields';
        const { lbl: xLabel, input: xInput } = makeFieldInput(
          wall, item, 'xM', 'X', 0, Math.max(0, wall.widthM - item.widthM),
        );
        const { lbl: yLabel, input: yInput } = makeFieldInput(
          wall, item, 'yM', 'Y', 0, Math.max(0, wall.heightM - item.heightM),
        );
        posRow.append(xLabel, yLabel);
        body.insertBefore(posRow, body.querySelector('.item-list-size-row'));

        for (const input of [xInput, yInput]) {
          input.addEventListener('click', (e) => e.stopPropagation());
        }
        bindFieldInput(xInput, item.id, 'xM');
        bindFieldInput(yInput, item.id, 'yM');
      }

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'item-list-delete';
      delBtn.title = 'Удалить';
      delBtn.textContent = '×';

      li.append(wrapThumbWithReorderHandle(thumb), body, delBtn);
      listEl.appendChild(li);

      li.addEventListener('click', (e) => {
        if (e.target.closest('input, button, label, .inline-rename-input, .btn-rename, .list-reorder-handle')) {
          return;
        }
        onSelect(item.id);
      });
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onDelete(item.id);
      });
  }

  /**
   * @param {HTMLElement} container
   * @param {Wall} wall
   */
  function appendWallItems(container, wall) {
    container.innerHTML = '';

    if (wall.items.length <= VIRTUAL_THRESHOLD) {
      for (let i = 0; i < wall.items.length; i++) {
        appendItemEntry(container, wall, wall.items[i], i);
      }
      return;
    }

    const scroll = document.createElement('div');
    scroll.className = 'nav-item-list-virtual-scroll';
    const inner = document.createElement('div');
    inner.className = 'nav-item-list-virtual-inner';
    inner.style.height = `${wall.items.length * VIRTUAL_ROW_PX}px`;
    const viewport = document.createElement('div');
    viewport.className = 'nav-item-list-virtual-viewport';

    const renderSlice = () => {
      const top = scroll.scrollTop;
      const viewH = scroll.clientHeight || VIRTUAL_MAX_H;
      const start = Math.max(0, Math.floor(top / VIRTUAL_ROW_PX) - 1);
      const visible = Math.ceil(viewH / VIRTUAL_ROW_PX) + 3;
      const end = Math.min(wall.items.length, start + visible);
      viewport.style.transform = `translateY(${start * VIRTUAL_ROW_PX}px)`;
      viewport.innerHTML = '';
      const compact = wall.id !== getActiveWallId();
      for (let i = start; i < end; i++) {
        appendItemEntry(viewport, wall, wall.items[i], i, compact);
      }
    };

    scroll.append(inner);
    inner.append(viewport);
    container.appendChild(scroll);
    scroll.addEventListener('scroll', renderSlice);
    renderSlice();
  }

  /**
   * @param {WallItem} item
   */
  function syncItem(item) {
    normalizeWallItem(item);
    const el = document.querySelector(`.item-list-entry[data-item-id="${item.id}"]`);
    if (!el) return;

    for (const field of ['xM', 'yM', 'widthM', 'heightM', 'rotationDeg']) {
      const input = el.querySelector(`input.item-list-size[data-field="${field}"]`);
      if (input) {
        input.value = String(roundM(item[field]));
        if (field === 'widthM') input.disabled = !item.manualWidth;
        if (field === 'heightM') input.disabled = !item.manualHeight;
      }
    }

    const wCb = el.querySelector('input.item-list-manual[data-dim="width"]');
    const hCb = el.querySelector('input.item-list-manual[data-dim="height"]');
    if (wCb) wCb.checked = item.manualWidth;
    if (hCb) hCb.checked = item.manualHeight;
  }

  function updateSelection() {
    const selectedId = getSelectedItemId();
    const activeWallId = getActiveWallId();
    document.querySelectorAll('.item-list-entry').forEach((el) => {
      const wallEntry = el.closest('.wall-list-entry');
      const onActiveWall = wallEntry?.dataset.wallId === activeWallId;
      el.classList.toggle('active', onActiveWall && el.dataset.itemId === selectedId);
    });
  }

  return { appendWallItems, syncItem, updateSelection };
}
