/**
 * Walls (and nested items) in the scene nav tree under the active photo.
 */

import { bindInputScrub } from './input-scrub.js';
import { bindEditableName } from './inline-rename.js';
import { wallColorAt } from './preview-handles.js';

/**
 * @param {object} opts
 * @param {HTMLElement} opts.container
 * @param {HTMLElement} opts.emptyEl
 * @param {() => import('./state.js').Wall[]} opts.getWalls
 * @param {() => string} opts.getActiveWallId
 * @param {() => boolean} opts.hasPhoto
 * @param {(wallId: string) => boolean} opts.isEnabledOnPhoto
 * @param {(wallId: string, enabled: boolean) => void} opts.onToggleEnabled
 * @param {(wallId: string) => void} opts.onSelect
 * @param {(wallId: string, field: 'widthM'|'heightM', value: number, save: boolean) => void} opts.onDimChange
 * @param {(wallId: string) => void} opts.onDelete
 * @param {(wallId: string, name: string) => void} opts.onRenameWall
 * @param {() => void} opts.onScrubEnd
 * @param {() => boolean} opts.canDeleteWall
 * @param {(n: number) => number} opts.roundM
 * @param {ReturnType<import('./item-list.js').createItemListRenderer>} [opts.itemRenderer]
 */
export function createWallList(opts) {
  const {
    container,
    emptyEl,
    getWalls,
    getActiveWallId,
    hasPhoto,
    isEnabledOnPhoto,
    onToggleEnabled,
    onSelect,
    onDimChange,
    onDelete,
    onRenameWall,
    onScrubEnd,
    canDeleteWall,
    roundM,
    itemRenderer,
  } = opts;

  let listKey = '';

  const imageAddPark = document.getElementById('nav-image-add-park');
  const imageAddBtn = document.getElementById('btn-add-image');

  function mountImageAddButton() {
    const toolbar = container.querySelector(
      '.wall-list-entry.active .wall-item-toolbar',
    );
    if (toolbar && imageAddBtn) {
      toolbar.appendChild(imageAddBtn);
      if (imageAddPark) imageAddPark.hidden = true;
    } else if (imageAddPark && imageAddBtn) {
      imageAddPark.appendChild(imageAddBtn);
      imageAddPark.hidden = true;
    }
  }

  function makeDimInput(wall, field, label) {
    const lbl = document.createElement('label');
    lbl.className = 'wall-list-dim';
    lbl.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'wall-list-size';
    input.dataset.field = field;
    input.min = '0.1';
    input.step = '0.1';
    input.value = String(roundM(wall[field]));
    lbl.appendChild(input);

    bindInputScrub(input, {
      onScrub: (v) => onDimChange(wall.id, field, v, false),
      onScrubEnd,
    });
    input.addEventListener('change', () => {
      const value = parseFloat(input.value);
      if (!Number.isNaN(value)) onDimChange(wall.id, field, value, true);
    });
    input.addEventListener('click', (e) => e.stopPropagation());

    return { lbl, input };
  }

  function rebuild(walls) {
    const activeId = getActiveWallId();
    const showEnable = hasPhoto();
    container.innerHTML = '';

    walls.forEach((wall, index) => {
      const enabled = isEnabledOnPhoto(wall.id);
      const li = document.createElement('li');
      li.className = 'wall-list-entry';
      li.dataset.wallId = wall.id;
      if (wall.id === activeId) li.classList.add('active');

      let enableWrap = null;
      if (showEnable) {
        enableWrap = document.createElement('label');
        enableWrap.className = 'wall-list-enable-wrap';
        enableWrap.title = 'Показать на этом фото';

        const enableCb = document.createElement('input');
        enableCb.type = 'checkbox';
        enableCb.className = 'wall-list-enable';
        enableCb.checked = enabled;
        enableCb.addEventListener('click', (e) => e.stopPropagation());
        enableCb.addEventListener('change', () => {
          onToggleEnabled(wall.id, enableCb.checked);
        });

        enableWrap.appendChild(enableCb);
      }

      const head = document.createElement('div');
      head.className = 'wall-list-head';

      const topRow = document.createElement('div');
      topRow.className = 'wall-list-head-top';

      const swatch = document.createElement('span');
      swatch.className = 'wall-list-swatch';
      swatch.style.background = wallColorAt(index);

      const title = document.createElement('button');
      title.type = 'button';
      title.className = 'wall-list-title';
      title.textContent = wall.name;

      const dims = document.createElement('div');
      dims.className = 'wall-list-dims';
      const { lbl: wLabel } = makeDimInput(wall, 'widthM', 'Ш');
      const { lbl: hLabel } = makeDimInput(wall, 'heightM', 'В');
      dims.append(wLabel, hLabel);

      const renameBtn = bindEditableName(
        title,
        () => wall.name,
        (name) => onRenameWall(wall.id, name),
        { onSelect: () => onSelect(wall.id) },
      );

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'wall-list-delete';
      delBtn.title = 'Удалить стену';
      delBtn.textContent = '×';
      delBtn.disabled = !canDeleteWall();
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onDelete(wall.id);
      });

      if (enableWrap) {
        li.classList.add('has-enable-cb');
        topRow.append(enableWrap, swatch, title, dims, renameBtn, delBtn);
      } else {
        topRow.append(swatch, title, dims, renameBtn, delBtn);
      }

      head.appendChild(topRow);
      li.appendChild(head);

      if (itemRenderer && wall.id === activeId) {
        const block = document.createElement('div');
        block.className = 'wall-items-block';

        const toolbar = document.createElement('div');
        toolbar.className = 'wall-item-toolbar';
        block.appendChild(toolbar);

        if (wall.items.length) {
          const itemsHost = document.createElement('div');
          itemsHost.className = 'nav-item-list';
          itemRenderer.appendWallItems(itemsHost, wall);
          block.appendChild(itemsHost);
        }

        li.appendChild(block);
      } else if (itemRenderer && wall.items.length) {
        const itemsHost = document.createElement('div');
        itemsHost.className = 'nav-item-list';
        itemRenderer.appendWallItems(itemsHost, wall);
        li.appendChild(itemsHost);
      }

      container.appendChild(li);

      li.addEventListener('click', (e) => {
        if (e.target.closest('input, button, label, .inline-rename-input, .btn-rename, .nav-item-list')) return;
        onSelect(wall.id);
      });
    });

    mountImageAddButton();
  }

  function wallSignature(walls, activeId) {
    return walls
      .map((w) => {
        const items = w.items
          .map(
            (i) =>
              `${i.id}:${i.name ?? ''}:${i.xM}:${i.yM}:${i.widthM}:${i.heightM}:${i.rotationDeg ?? 0}:${i.manualWidth}:${i.manualHeight}`,
          )
          .join(',');
        return `${w.id}:${w.name}:${w.widthM}:${w.heightM}:${isEnabledOnPhoto(w.id)}:${w.id === activeId}:${items}`;
      })
      .join('|');
  }

  function updateSelection() {
    const activeId = getActiveWallId();
    container.querySelectorAll('.wall-list-entry').forEach((el) => {
      const wallId = el.dataset.wallId;
      const enabled = isEnabledOnPhoto(wallId);
      el.classList.toggle('active', wallId === activeId);
      const cb = el.querySelector('.wall-list-enable');
      if (cb) cb.checked = enabled;
    });
    itemRenderer?.updateSelection();
    mountImageAddButton();
  }

  function syncDims(wall) {
    if (!wall) return;
    const entry = container.querySelector(`.wall-list-entry[data-wall-id="${wall.id}"]`);
    if (!entry) return;
    for (const field of ['widthM', 'heightM']) {
      const input = entry.querySelector(`input[data-field="${field}"]`);
      if (input) input.value = String(roundM(wall[field]));
    }
    const delBtn = entry.querySelector('.wall-list-delete');
    if (delBtn) delBtn.disabled = !canDeleteWall();
  }

  function render() {
    const walls = getWalls();
    const activeId = getActiveWallId();
    const key = `${wallSignature(walls, activeId)}|${hasPhoto()}|${getActiveWallId()}`;

    emptyEl.hidden = walls.length > 0;

    if (key !== listKey) {
      listKey = key;
      if (walls.length) rebuild(walls);
      else container.innerHTML = '';
    } else {
      updateSelection();
      walls.forEach(syncDims);
    }
  }

  function reset() {
    listKey = '';
  }

  return { render, reset, syncDims };
}
