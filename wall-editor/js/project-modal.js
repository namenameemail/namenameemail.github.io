/**
 * Modal dialog for project selection.
 */

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {HTMLElement} opts.listEl
 * @param {HTMLElement} opts.pickerBtn
 * @param {HTMLElement} opts.addBtn
 * @param {HTMLElement} opts.closeBtn
 * @param {() => import('./state.js').AppState} opts.getState
 * @param {(projectId: string) => void} opts.onSelect
 * @param {() => void} opts.onAdd
 * @param {(projectId: string) => void} opts.onDelete
 * @param {() => boolean} opts.canDelete
 */
export function createProjectModal(opts) {
  const {
    root,
    listEl,
    pickerBtn,
    addBtn,
    closeBtn,
    getState,
    onSelect,
    onAdd,
    onDelete,
    canDelete,
  } = opts;

  let listKey = '';

  pickerBtn.textContent = 'проекты';

  function isOpen() {
    return !root.hidden;
  }

  function open() {
    root.hidden = false;
    render();
    pickerBtn.setAttribute('aria-expanded', 'true');
  }

  function close() {
    root.hidden = true;
    pickerBtn.setAttribute('aria-expanded', 'false');
  }

  function toggle() {
    if (isOpen()) close();
    else open();
  }

  function rebuild(projects, activeId) {
    listEl.innerHTML = '';
    const allowDelete = canDelete();

    for (const project of projects) {
      const li = document.createElement('li');
      li.className = 'modal-list-item';
      li.dataset.projectId = project.id;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'modal-list-entry' + (project.id === activeId ? ' active' : '');
      btn.dataset.id = project.id;

      const roomCount = project.rooms.length;
      const roomsLabel =
        roomCount === 0
          ? 'нет комнат'
          : roomCount === 1
            ? '1 комната'
            : `${roomCount} комнат`;

      const label = document.createElement('span');
      label.className = 'modal-list-label';
      label.textContent = project.name;

      const meta = document.createElement('span');
      meta.className = 'modal-list-meta';
      meta.textContent = roomsLabel;

      btn.append(label, meta);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'modal-list-delete';
      delBtn.title = 'Удалить проект';
      delBtn.textContent = '×';
      delBtn.disabled = !allowDelete;

      btn.addEventListener('click', () => {
        onSelect(project.id);
        close();
      });
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onDelete(project.id);
      });

      li.append(btn, delBtn);
      listEl.appendChild(li);
    }
  }

  function render() {
    const state = getState();
    const key = state.projects
      .map((p) => `${p.id}:${p.name}:${p.rooms.length}`)
      .join('|');

    if (key !== listKey) {
      listKey = key;
      rebuild(state.projects, state.activeProjectId);
    } else {
      listEl.querySelectorAll('.modal-list-entry').forEach((el) => {
        el.classList.toggle('active', el.dataset.id === state.activeProjectId);
      });
      const allowDelete = canDelete();
      listEl.querySelectorAll('.modal-list-delete').forEach((el) => {
        el.disabled = !allowDelete;
      });
    }
  }

  function reset() {
    listKey = '';
  }

  pickerBtn.addEventListener('click', toggle);
  closeBtn.addEventListener('click', close);
  addBtn.addEventListener('click', () => {
    onAdd();
    render();
  });

  root.querySelectorAll('[data-modal-close]').forEach((el) => {
    el.addEventListener('click', close);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) close();
  });

  return {
    render,
    reset,
    open,
    close,
  };
}
