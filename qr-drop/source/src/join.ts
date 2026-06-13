import './style.css';
import {
  createGuestPeer,
  waitForChannelOpen,
  watchConnectionState,
  type PeerConnectionBundle,
} from './webrtc/connection';
import {
  decodeSessionDescription,
  encodeSessionDescription,
  parseOfferFromLocation,
} from './webrtc/signaling';
import { renderQrCodeFromText } from './ui/qr-display';
import { createFileTransferPanel, showTransferPanel } from './ui/file-transfer-ui';
import { createStatusBar, showError } from './ui/status';

const app = document.querySelector<HTMLDivElement>('#app')!;

let bundle: PeerConnectionBundle | null = null;

function renderShell(): void {
  app.innerHTML = `
    <main class="page">
      <header class="hero">
        <h1>QR Drop</h1>
        <p class="subtitle">Подключение к сессии</p>
      </header>
      <div id="status-mount"></div>
      <section id="loading-section" class="card">
        <p>Подготовка answer…</p>
      </section>
      <section id="answer-section" class="card hidden">
        <h2>Покажите этот QR на ПК</h2>
        <p class="hint">Или нажмите «Скопировать» и вставьте текст на компьютере.</p>
        <div id="answer-qr"></div>
        <button id="copy-answer" type="button" class="btn btn-secondary">
          Скопировать answer
        </button>
      </section>
      <div id="transfer-mount"></div>
    </main>
  `;
}

async function initGuest(): Promise<void> {
  renderShell();

  const statusMount = document.querySelector('#status-mount')!;
  const { element: statusBar, setState } = createStatusBar();
  statusMount.appendChild(statusBar);

  const loadingSection = document.querySelector('#loading-section')!;
  const answerSection = document.querySelector('#answer-section')!;
  const answerQr = document.querySelector<HTMLElement>('#answer-qr')!;
  const copyBtn = document.querySelector<HTMLButtonElement>('#copy-answer')!;

  const encodedOffer = parseOfferFromLocation();
  if (!encodedOffer) {
    loadingSection.classList.add('hidden');
    setState('failed', 'QR не содержит offer. Отсканируйте код с компьютера.');
    showError(app, 'Откройте страницу через QR-код с компьютера.');
    return;
  }

  setState('gathering');

  try {
    const offer = decodeSessionDescription(encodedOffer);
    if (offer.type !== 'offer') {
      throw new Error('Ожидался offer');
    }

    const result = await createGuestPeer(offer);
    bundle = result.bundle;

    const encodedAnswer = encodeSessionDescription(result.answer);

    loadingSection.classList.add('hidden');
    answerSection.classList.remove('hidden');
    setState('waiting-answer', 'Дождитесь, пока ПК примет answer');

    await renderQrCodeFromText(
      answerQr,
      encodedAnswer,
      'Answer для компьютера',
    );

    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(encodedAnswer);
        copyBtn.textContent = 'Скопировано!';
        setTimeout(() => {
          copyBtn.textContent = 'Скопировать answer';
        }, 2000);
      } catch {
        copyBtn.textContent = 'Не удалось скопировать';
      }
    });

    watchConnectionState(bundle.pc, (state) => {
      if (state === 'connecting') {
        setState('connecting');
      } else if (state === 'connected') {
        setState('connected');
      } else if (state === 'failed') {
        setState('failed', 'Проверьте интернет или попробуйте снова');
      }
    });

    void waitForChannelOpen(bundle.channel)
      .then(() => {
        answerSection.classList.add('hidden');
        setState('connected');

        const transferMount = document.querySelector('#transfer-mount')!;
        const { element: transferPanel } = createFileTransferPanel(bundle!.channel);
        transferMount.appendChild(transferPanel);
        showTransferPanel(transferPanel);
      })
      .catch(() => {
        // channel may stay pending until host applies answer
      });
  } catch (error) {
    loadingSection.classList.add('hidden');
    setState('failed');
    showError(
      app,
      error instanceof Error ? error.message : 'Не удалось подключиться',
    );
  }
}

void initGuest();
