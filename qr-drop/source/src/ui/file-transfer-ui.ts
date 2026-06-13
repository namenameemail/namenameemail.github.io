import {
  downloadFile,
  FileTransferManager,
  type TransferProgress,
} from '../webrtc/transfer';

export function createFileTransferPanel(
  channel: RTCDataChannel,
): {
  element: HTMLElement;
  manager: FileTransferManager;
} {
  const element = document.createElement('section');
  element.className = 'transfer-panel hidden';

  const heading = document.createElement('h2');
  heading.textContent = 'Передача файлов';

  const pickButton = document.createElement('button');
  pickButton.type = 'button';
  pickButton.className = 'btn btn-primary';
  pickButton.textContent = 'Выбрать файл';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.hidden = true;

  const progressWrap = document.createElement('div');
  progressWrap.className = 'progress-wrap hidden';

  const progressLabel = document.createElement('span');
  progressLabel.className = 'progress-label';

  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  const progressFill = document.createElement('div');
  progressFill.className = 'progress-fill';
  progressBar.appendChild(progressFill);

  progressWrap.append(progressLabel, progressBar);

  const receivedList = document.createElement('div');
  receivedList.className = 'received-list';

  const receivedHeading = document.createElement('h3');
  receivedHeading.textContent = 'Полученные файлы';
  receivedList.appendChild(receivedHeading);

  const receivedItems = document.createElement('div');
  receivedItems.className = 'received-items';
  receivedList.appendChild(receivedItems);

  element.append(heading, pickButton, fileInput, progressWrap, receivedList);

  const updateProgress = (progress: TransferProgress) => {
    progressWrap.classList.remove('hidden');
    const verb = progress.direction === 'send' ? 'Отправка' : 'Получение';
    progressLabel.textContent = `${verb}: ${progress.name} — ${progress.percent}%`;
    progressFill.style.width = `${progress.percent}%`;

    if (progress.percent >= 100) {
      setTimeout(() => progressWrap.classList.add('hidden'), 1500);
    }
  };

  const manager = new FileTransferManager(
    channel,
    (file) => {
      const item = document.createElement('div');
      item.className = 'received-item';

      const info = document.createElement('span');
      info.textContent = `${file.name} (${formatBytes(file.size)})`;

      const downloadBtn = document.createElement('button');
      downloadBtn.type = 'button';
      downloadBtn.className = 'btn btn-secondary';
      downloadBtn.textContent = 'Скачать';
      downloadBtn.addEventListener('click', () => downloadFile(file));

      item.append(info, downloadBtn);
      receivedItems.appendChild(item);
    },
    updateProgress,
  );

  pickButton.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }

    void manager.sendFile(file).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Ошибка отправки';
      alert(message);
    });

    fileInput.value = '';
  });

  return { element, manager };
}

export function showTransferPanel(panel: HTMLElement): void {
  panel.classList.remove('hidden');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
