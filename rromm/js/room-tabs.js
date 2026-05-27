/**
 * Horizontal room tabs (top bar): select, delete, add.
 */

/** @typedef {import('./state.js').Room} Room */
/** @typedef {import('./state.js').Project} Project */

/**
 * @param {object} opts
 * @param {HTMLElement} opts.listEl
 * @param {() => import('./state.js').AppState} opts.getState
 * @param {(roomId: string) => void} opts.onSelectRoom
 * @param {(roomId: string) => void} opts.onDeleteRoom
 * @param {() => boolean} opts.canDeleteRoom
 */
export function createRoomTabs(opts) {
  const { listEl, getState, onSelectRoom, onDeleteRoom, canDeleteRoom } = opts;

  let listKey = '';

  function tabsSignature(project, rooms) {
    return `${project?.id ?? ''}|${project?.activeRoomId ?? ''}|${canDeleteRoom()}|${rooms
      .map((r) => `${r.id}:${r.name}`)
      .join('|')}`;
  }

  /**
   * @param {Project|null} project
   * @param {Room[]} rooms
   */
  function rebuild(project, rooms) {
    listEl.innerHTML = '';
    if (!project) return;

    const allowDelete = canDeleteRoom();

    for (const room of rooms) {
      const li = document.createElement('li');
      li.className = 'room-tab-item';
      li.dataset.roomId = room.id;
      if (room.id === project.activeRoomId) li.classList.add('active');

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'room-tab-btn';
      btn.textContent = room.name;

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'room-tab-delete';
      delBtn.title = 'Удалить комнату';
      delBtn.textContent = '×';
      delBtn.disabled = !allowDelete;

      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onDeleteRoom(room.id);
      });

      btn.addEventListener('click', (e) => {
        onSelectRoom(room.id);
      });

      li.append(btn, delBtn);
      listEl.appendChild(li);
    }
  }

  /**
   * @param {Project|null} project
   */
  function updateSelection(project) {
    listEl.querySelectorAll('.room-tab-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.roomId === project?.activeRoomId);
    });
    const allowDelete = canDeleteRoom();
    listEl.querySelectorAll('.room-tab-delete').forEach((el) => {
      el.disabled = !allowDelete;
    });
  }

  function render() {
    const state = getState();
    const project = state.projects.find((p) => p.id === state.activeProjectId);
    const rooms = project?.rooms ?? [];
    const key = tabsSignature(project, rooms);

    if (key === listKey) {
      updateSelection(project);
      return;
    }
    listKey = key;
    rebuild(project, rooms);
  }

  function reset() {
    listKey = '';
  }

  return { render, reset };
}
