import type { ConnectionState } from '../types';

const STATE_LABELS: Record<ConnectionState, string> = {
  idle: 'Готов к подключению',
  gathering: 'Сбор ICE-кандидатов…',
  'waiting-answer': 'Отсканируйте QR на телефоне, затем покажите answer QR на ПК',
  'waiting-host': 'Покажите QR на ПК или вставьте answer — ждём подтверждения',
  connecting: 'Установка соединения…',
  connected: 'Соединено — можно передавать файлы',
  failed: 'Не удалось установить соединение',
};

export function createStatusBar(): {
  element: HTMLElement;
  setState: (state: ConnectionState, detail?: string) => void;
} {
  const element = document.createElement('div');
  element.className = 'status-bar status-idle';

  const label = document.createElement('span');
  label.className = 'status-label';
  label.textContent = STATE_LABELS.idle;

  const detailEl = document.createElement('span');
  detailEl.className = 'status-detail';

  element.append(label, detailEl);

  const setState = (state: ConnectionState, detail?: string) => {
    element.className = `status-bar status-${state}`;
    label.textContent = STATE_LABELS[state];
    detailEl.textContent = detail ?? '';
  };

  return { element, setState };
}

export function showError(container: HTMLElement, message: string): void {
  const existing = container.querySelector('.error-banner');
  if (existing) {
    existing.remove();
  }

  const banner = document.createElement('div');
  banner.className = 'error-banner';
  banner.textContent = message;
  container.prepend(banner);
}
