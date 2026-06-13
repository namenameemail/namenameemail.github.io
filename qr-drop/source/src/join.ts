import './style.css';
import { log, logError, warn } from './debug';
import {
  createGuestPeer,
  GUEST_CONNECTION_TIMEOUT_MS,
  waitForChannelOpen,
  watchConnectionState,
  watchForHostAnswerApplied,
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
import { APP_VERSION } from './version';

const app = document.querySelector<HTMLDivElement>('#app')!;

let bundle: PeerConnectionBundle | null = null;

function renderShell(): void {
  app.innerHTML = `
    <main class="page">
      <header class="hero">
        <p class="version">v${APP_VERSION}</p>
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
  log('guest page: init', {
    hashLength: window.location.hash.length,
    hasOffer: Boolean(encodedOffer),
    offerLength: encodedOffer?.length ?? 0,
  });

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
    setState('waiting-host');

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

    let hostAnswerApplied = false;

    const stopIceWatch = watchForHostAnswerApplied(bundle.pc, () => {
      hostAnswerApplied = true;
      setState('connecting', 'ПК принял answer, устанавливаем соединение…');
    });

    watchConnectionState(bundle.pc, (state) => {
      log('guest page: connection state', {
        state,
        hostAnswerApplied,
        iceConnectionState: bundle!.pc.iceConnectionState,
        signalingState: bundle!.pc.signalingState,
      });
      if (state === 'connected') {
        setState('connected');
      } else if (state === 'failed' && hostAnswerApplied) {
        warn('guest page: connection failed after host answer', {
          iceConnectionState: bundle!.pc.iceConnectionState,
          iceGatheringState: bundle!.pc.iceGatheringState,
        });
        setState(
          'failed',
          'Разные сети без TURN — попробуйте одну Wi‑Fi или вставьте answer на ПК ещё раз',
        );
      }
    });

    void waitForChannelOpen(bundle.channel, 'guest', GUEST_CONNECTION_TIMEOUT_MS)
      .then(() => {
        stopIceWatch();
        log('guest page: datachannel open, showing transfer panel');
        answerSection.classList.add('hidden');
        setState('connected');

        const transferMount = document.querySelector('#transfer-mount')!;
        const { element: transferPanel } = createFileTransferPanel(bundle!.channel);
        transferMount.appendChild(transferPanel);
        showTransferPanel(transferPanel);
      })
      .catch((error) => {
        stopIceWatch();
        logError('guest page: connection timed out or failed', error, {
          hostAnswerApplied,
          channelState: bundle?.channel.readyState,
          connectionState: bundle?.pc.connectionState,
          iceConnectionState: bundle?.pc.iceConnectionState,
        });
        if (!hostAnswerApplied) {
          setState(
            'failed',
            'ПК ещё не принял answer — нажмите «Скопировать» и вставьте текст на компьютере',
          );
        } else {
          setState(
            'failed',
            'Соединение не установилось — попробуйте одну Wi‑Fi сеть',
          );
        }
        showError(
          app,
          hostAnswerApplied
            ? 'ICE не пробился. Подключите оба устройства к одной Wi‑Fi или проверьте VPN.'
            : 'На компьютере нажмите «Применить answer» после вставки текста с телефона.',
        );
      });
  } catch (error) {
    logError('guest page: init failed', error);
    loadingSection.classList.add('hidden');
    setState('failed');
    showError(
      app,
      error instanceof Error ? error.message : 'Не удалось подключиться',
    );
  }
}

void initGuest();
