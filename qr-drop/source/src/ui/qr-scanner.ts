import { Html5Qrcode } from 'html5-qrcode';

export type QrScanResult = {
  data: string;
};

export class QrScanner {
  private scanner: Html5Qrcode | null = null;
  private active = false;
  private containerId: string;

  constructor(containerId: string) {
    this.containerId = containerId;
  }

  async start(onResult: (result: QrScanResult) => void): Promise<void> {
    if (this.active) {
      return;
    }

    this.scanner = new Html5Qrcode(this.containerId);
    this.active = true;

    await this.scanner.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
      },
      (decoded) => {
        onResult({ data: decoded });
      },
      () => {
        // scan errors are expected while searching
      },
    );
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
