import type { ControlMessage, MetaMessage } from '../types';

const CHUNK_SIZE = 64 * 1024;
const MAX_BUFFERED = 256 * 1024;
const CHUNK_MAGIC = 0xc1;

type IncomingTransfer = {
  id: string;
  name: string;
  size: number;
  mime: string;
  chunks: Map<number, ArrayBuffer>;
  total: number;
};

export type TransferProgress = {
  direction: 'send' | 'recv';
  name: string;
  percent: number;
};

function randomTransferId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function idToBytes(id: string): Uint8Array {
  const bytes = new Uint8Array(8);
  for (let i = 0; i < 8; i += 1) {
    bytes[i] = parseInt(id.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToId(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function isControlMessage(value: unknown): value is ControlMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const type = (value as { type?: string }).type;
  return type === 'meta' || type === 'done' || type === 'ack';
}

export class FileTransferManager {
  private incoming = new Map<string, IncomingTransfer>();
  private sending = false;
  private channel: RTCDataChannel;
  private onIncomingComplete: (file: File) => void;
  private onProgress?: (progress: TransferProgress) => void;

  constructor(
    channel: RTCDataChannel,
    onIncomingComplete: (file: File) => void,
    onProgress?: (progress: TransferProgress) => void,
  ) {
    this.channel = channel;
    this.onIncomingComplete = onIncomingComplete;
    this.onProgress = onProgress;
    channel.binaryType = 'arraybuffer';
    channel.addEventListener('message', (event) => {
      void this.handleMessage(event);
    });
  }

  async sendFile(file: File): Promise<void> {
    if (this.sending) {
      throw new Error('Передача уже выполняется');
    }

    if (file.size > 500 * 1024 * 1024) {
      const proceed = window.confirm(
        `Файл «${file.name}» больше 500 МБ. На телефоне это может занять много памяти. Продолжить?`,
      );
      if (!proceed) {
        return;
      }
    }

    this.sending = true;
    const id = randomTransferId();
    const total = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

    const meta: MetaMessage = {
      type: 'meta',
      id,
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
    };

    this.channel.send(JSON.stringify(meta));

    for (let index = 0; index < total; index += 1) {
      await this.waitForBuffer();
      const start = index * CHUNK_SIZE;
      const chunk = await file.slice(start, start + CHUNK_SIZE).arrayBuffer();
      this.channel.send(this.packChunk(id, index, total, chunk));
      this.onProgress?.({
        direction: 'send',
        name: file.name,
        percent: Math.round(((index + 1) / total) * 100),
      });
    }

    const done: ControlMessage = { type: 'done', id };
    this.channel.send(JSON.stringify(done));
    this.sending = false;
  }

  private packChunk(id: string, index: number, total: number, data: ArrayBuffer): ArrayBuffer {
    const idBytes = idToBytes(id);
    const buffer = new ArrayBuffer(1 + 8 + 4 + 4 + data.byteLength);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    bytes[0] = CHUNK_MAGIC;
    bytes.set(idBytes, 1);
    view.setUint32(9, index, false);
    view.setUint32(13, total, false);
    bytes.set(new Uint8Array(data), 17);

    return buffer;
  }

  private unpackChunk(buffer: ArrayBuffer): {
    id: string;
    index: number;
    total: number;
    data: ArrayBuffer;
  } | null {
    if (buffer.byteLength < 17) {
      return null;
    }

    const bytes = new Uint8Array(buffer);
    if (bytes[0] !== CHUNK_MAGIC) {
      return null;
    }

    const view = new DataView(buffer);
    const id = bytesToId(bytes.slice(1, 9));
    const index = view.getUint32(9, false);
    const total = view.getUint32(13, false);
    const data = buffer.slice(17);

    return { id, index, total, data };
  }

  private waitForBuffer(): Promise<void> {
    if (this.channel.bufferedAmount <= MAX_BUFFERED) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const check = () => {
        if (this.channel.bufferedAmount <= MAX_BUFFERED) {
          this.channel.removeEventListener('bufferedamountlow', check);
          resolve();
        }
      };

      this.channel.bufferedAmountLowThreshold = MAX_BUFFERED / 2;
      this.channel.addEventListener('bufferedamountlow', check);
      check();
    });
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    if (typeof event.data === 'string') {
      try {
        const message = JSON.parse(event.data) as unknown;
        if (isControlMessage(message)) {
          await this.handleControl(message);
        }
      } catch {
        // ignore malformed control messages
      }
      return;
    }

    if (event.data instanceof ArrayBuffer) {
      const chunk = this.unpackChunk(event.data);
      if (chunk) {
        this.handleChunk(chunk);
      }
    }
  }

  private async handleControl(message: ControlMessage): Promise<void> {
    if (message.type === 'meta') {
      this.incoming.set(message.id, {
        id: message.id,
        name: message.name,
        size: message.size,
        mime: message.mime,
        chunks: new Map(),
        total: 0,
      });
      return;
    }

    if (message.type === 'done') {
      const transfer = this.incoming.get(message.id);
      if (!transfer || transfer.total === 0) {
        return;
      }

      const parts: ArrayBuffer[] = [];
      for (let i = 0; i < transfer.total; i += 1) {
        const part = transfer.chunks.get(i);
        if (!part) {
          return;
        }
        parts.push(part);
      }

      const blob = new Blob(parts, { type: transfer.mime });
      const file = new File([blob], transfer.name, {
        type: transfer.mime,
        lastModified: Date.now(),
      });

      this.incoming.delete(message.id);
      this.onIncomingComplete(file);
      this.onProgress?.({
        direction: 'recv',
        name: transfer.name,
        percent: 100,
      });
    }
  }

  private handleChunk(chunk: {
    id: string;
    index: number;
    total: number;
    data: ArrayBuffer;
  }): void {
    const transfer = this.incoming.get(chunk.id);
    if (!transfer) {
      return;
    }

    transfer.total = chunk.total;
    transfer.chunks.set(chunk.index, chunk.data);

    const received = transfer.chunks.size;
    this.onProgress?.({
      direction: 'recv',
      name: transfer.name,
      percent: Math.round((received / chunk.total) * 100),
    });

    const ack: ControlMessage = {
      type: 'ack',
      id: chunk.id,
      index: chunk.index,
    };
    this.channel.send(JSON.stringify(ack));
  }
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  URL.revokeObjectURL(url);
}
