import { Html5Qrcode } from 'html5-qrcode';
import { log, warn } from '../debug';

export type QrScanResult = {
  data: string;
};

const SCANNER_CONFIG = {
  fps: 10,
  qrbox: { width: 250, height: 250 },
};

export class QrScanner {
  private scanner: Html5Qrcode | null = null;
  private active = false;
  private containerId: string;

  constructor(containerId: string) {
    this.containerId = containerId;
  }

  /** Returns false when no camera is available (paste-only fallback). */
  async start(onResult: (result: QrScanResult) => void): Promise<boolean> {
    if (this.active) {
      return true;
    }

    this.scanner = new Html5Qrcode(this.containerId);

    const configs: Array<string | MediaTrackConstraints> = [
      { facingMode: 'environment' },
      { facingMode: 'user' },
    ];

    try {
      const cameras = await Html5Qrcode.getCameras();
      for (const camera of cameras) {
        configs.push(camera.id);
      }
      log('qr scanner: cameras found', { count: cameras.length });
    } catch (error) {
      warn('qr scanner: could not list cameras', {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    for (const config of configs) {
      try {
        await this.scanner.start(
          config,
          SCANNER_CONFIG,
          (decoded) => {
            onResult({ data: decoded });
          },
          () => {
            // scan errors are expected while searching
          },
        );
        this.active = true;
        log('qr scanner: started', {
          config: typeof config === 'string' ? config : JSON.stringify(config),
        });
        return true;
      } catch (error) {
        warn('qr scanner: camera config failed', {
          config: typeof config === 'string' ? config : JSON.stringify(config),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.scanner = null;
    return false;
  }

  async stop(): Promise<void> {
    if (!this.scanner || !this.active) {
      return;
    }

    await this.scanner.stop();
    await this.scanner.clear();
    this.scanner = null;
    this.active = false;
  }
}

export function createScannerContainer(parent: HTMLElement, id: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'scanner-wrapper';

  const element = document.createElement('div');
  element.id = id;
  element.className = 'scanner';
  wrapper.appendChild(element);

  parent.appendChild(wrapper);
  return wrapper;
}
