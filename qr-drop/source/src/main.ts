import './style.css';
import { log, logError, warn } from './debug';
import {
  applyAnswer,
  createHostPeer,
  waitForChannelOpen,
  watchConnectionState,
  type PeerConnectionBundle,
} from './webrtc/connection';
import {
  buildJoinUrl,
  encodeSessionDescription,
  parseAnswerInput,
} from './webrtc/signaling';
import { renderQrCode } from './ui/qr-display';
import { createScannerContainer, QrScanner } from './ui/qr-scanner';
import { createFileTransferPanel, showTransferPanel } from './ui/file-transfer-ui';
import { createStatusBar, showError } from './ui/status';
import { APP_VERSION } from './version';

const app = document.querySelector<HTMLDivElement>('#app')!;

let bundle: PeerConnectionBundle | null = null;
let scanner: QrScanner | null = null;
let answerApplied = false;

function renderShell(): void {
  app.innerHTML = `
    <main class="page">
      <header class="hero">
        <p class="version">v${APP_VERSION}</p>
        <h1>QR Drop</h1>
        <p class="subtitle">Serverless P2P передача файлов через QR</p>
      </header>
      <div id="status-mount"></div>
      <section id="host-controls" class="card">
        <button id="create-session" type="button" class="btn btn-primary btn-large">
          Создать сессию
        </button>
      </section>
      <section id="offer-section" class="card hidden">
        <h2>1. Отсканируйте этот QR на телефоне</h2>
        <div id="offer-qr"></div>
      </section>
      <section id="answer-section" class="card hidden">
        <h2>2. Покажите answer QR с телефона</h2>
        <p class="hint">Сканируйте камерой ниже или вставьте текст answer в поле.</p>
        <div id="scanner-mount"></div>
        <textarea
          id="answer-paste"
          class="paste-input"
          rows="4"
          placeholder="Вставьте answer с телефона…"
        ></textarea>
        <button id="apply-answer" type="button" class="btn btn-secondary">
          Применить answer
        </button>
      </section>
      <div id="transfer-mount"></div>
    </main>
  `;
}

async function startSession(): Promise<void> {
  const statusMount = document.querySelector('#status-mount')!;
  const { element: statusBar, setState } = createStatusBar();
  statusMount.appendChild(statusBar);

  const createBtn = document.querySelector<HTMLButtonElement>('#create-session')!;
  const hostControls = document.querySelector('#host-controls')!;
  const offerSection = document.querySelector('#offer-section')!;
  const answerSection = document.querySelector('#answer-section')!;
  const offerQr = document.querySelector<HTMLElement>('#offer-qr')!;
  const scannerMount = document.querySelector('#scanner-mount')!;
  const pasteInput = document.querySelector<HTMLTextAreaElement>('#answer-paste')!;
  const applyBtn = document.querySelector<HTMLButtonElement>('#apply-answer')!;

  createBtn.disabled = true;
  setState('gathering');
  log('host page: starting session');

  try {
    const result = await createHostPeer();
    bundle = result.bundle;

    const encodedOffer = encodeSessionDescription(result.offer);
    const joinUrl = buildJoinUrl(encodedOffer);
    log('host page: join url ready', { joinUrlLength: joinUrl.length });

    await renderQrCode(offerQr, joinUrl, 'Ссылка для телефона');

    hostControls.classList.add('hidden');
    offerSection.classList.remove('hidden');
    answerSection.classList.remove('hidden');
    setState('waiting-answer');

    createScannerContainer(scannerMount as HTMLElement, 'host-scanner');
    scanner = new QrScanner('host-scanner');
    const scannerReady = await scanner.start((scan) => {
      void handleAnswer(scan.data, setState);
    });

    const answerHint = answerSection.querySelector('.hint');
    if (!scannerReady) {
      warn('host page: no camera, using paste-only mode');
      scannerMount.classList.add('hidden');
      answerHint?.classList.add('hint-emphasis');
      if (answerHint) {
        answerHint.textContent =
          'Камера недоступна — нажмите «Скопировать answer» на телефоне и вставьте текст ниже.';
      }
      scanner = null;
    }

    watchConnectionState(bundle.pc, (state) => {
      log('host page: connection state', {
        state,
        iceConnectionState: bundle!.pc.iceConnectionState,
        signalingState: bundle!.pc.signalingState,
      });
      if (state === 'connected') {
        setState('connected');
      } else if (state === 'failed') {
        warn('host page: connection failed', {
          iceConnectionState: bundle!.pc.iceConnectionState,
          iceGatheringState: bundle!.pc.iceGatheringState,
        });
        setState('failed', 'Попробуйте одну Wi‑Fi сеть или повторите сессию');
      } else if (state === 'connecting') {
        setState('connecting');
      }
    });

    applyBtn.addEventListener('click', () => {
      void handleAnswer(pasteInput.value, setState);
    });
  } catch (error) {
    logError('host page: session creation failed', error);
    createBtn.disabled = false;
    setState('failed');
    showError(
      app,
      error instanceof Error ? error.message : 'Не удалось создать сессию',
    );
  }
}

async function handleAnswer(
  raw: string,
  setState: (state: import('./types').ConnectionState, detail?: string) => void,
): Promise<void> {
  if (!bundle || answerApplied) {
    return;
  }

  try {
    log('host page: parsing answer input', { inputLength: raw.trim().length });
    const answer = parseAnswerInput(raw);
    if (answer.type !== 'answer') {
      throw new Error('Ожидался answer, получен другой тип');
    }

    answerApplied = true;
    setState('connecting');

    await applyAnswer(bundle.pc, answer);
    await waitForChannelOpen(bundle.channel, 'host');

    if (scanner) {
      await scanner.stop();
      scanner = null;
    }

    document.querySelector('#answer-section')?.classList.add('hidden');
    setState('connected');

    const transferMount = document.querySelector('#transfer-mount')!;
    const { element: transferPanel } = createFileTransferPanel(bundle.channel);
    transferMount.appendChild(transferPanel);
    showTransferPanel(transferPanel);
    log('host page: connected, transfer panel shown');
  } catch (error) {
    logError('host page: failed to apply answer', error, {
      connectionState: bundle?.pc.connectionState,
      iceConnectionState: bundle?.pc.iceConnectionState,
      channelState: bundle?.channel.readyState,
    });
    answerApplied = false;
    setState('waiting-answer');
    showError(
      app,
      error instanceof Error ? error.message : 'Не удалось применить answer',
    );
  }
}

renderShell();
document.querySelector('#create-session')?.addEventListener('click', () => {
  void startSession();
});
