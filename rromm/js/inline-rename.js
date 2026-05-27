/**
 * Inline rename via pencil button (Enter / blur — save, Escape — cancel).
 */

/** @type {((save: boolean) => void) | null} */
let cancelActive = null;

/**
 * @param {HTMLElement} labelEl — label button
 * @param {() => string} getValue
 * @param {(name: string) => void} onCommit
 * @param {{ maxLength?: number, onSelect?: () => void }} [opts]
 * @returns {HTMLButtonElement} pencil button to append in the row
 */
export function bindEditableName(labelEl, getValue, onCommit, opts = {}) {
  if (opts.onSelect) {
    labelEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (labelEl.dataset.renaming === '1') return;
      opts.onSelect();
    });
  }

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn-rename';
  editBtn.title = 'Переименовать';
  editBtn.setAttribute('aria-label', 'Переименовать');
  editBtn.textContent = '✎';

  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (labelEl.dataset.renaming === '1') return;
    if (cancelActive) cancelActive(false);
    cancelActive = startInlineRename(labelEl, getValue(), onCommit, opts);
  });

  return editBtn;
}

/**
 * @param {HTMLElement} host
 * @param {string} initialValue
 * @param {(name: string) => void} onCommit
 * @param {{ maxLength?: number }} [opts]
 * @returns {(save: boolean) => void}
 */
export function startInlineRename(host, initialValue, onCommit, opts = {}) {
  host.dataset.renaming = '1';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-rename-input';
  input.value = initialValue;
  if (opts.maxLength) input.maxLength = opts.maxLength;

  const parent = host.parentElement;
  if (!parent) {
    delete host.dataset.renaming;
    return () => {};
  }

  const prevDisplay = host.style.display;
  host.style.display = 'none';
  parent.insertBefore(input, host.nextSibling);

  let done = false;

  const finish = (save) => {
    if (done) return;
    done = true;
    if (cancelActive === finish) cancelActive = null;

    const trimmed = input.value.trim();
    const next = trimmed || initialValue;
    if (save && next !== initialValue) onCommit(next);
    host.textContent = save ? next : initialValue;
    host.style.display = prevDisplay;
    input.remove();
    delete host.dataset.renaming;
  };

  input.focus();
  input.select();

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('click', (e) => e.stopPropagation());

  return finish;
}
