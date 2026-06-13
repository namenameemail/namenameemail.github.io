import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string';
import { log, logError, summarizeSdp, warn } from '../debug';
import type { SessionDescriptionPayload } from '../types';

export function encodeSessionDescription(desc: RTCSessionDescriptionInit): string {
  const payload: SessionDescriptionPayload = {
    t: desc.type as 'offer' | 'answer',
    s: desc.sdp ?? '',
  };
  const encoded = compressToEncodedURIComponent(JSON.stringify(payload));
  log('signaling: encoded session', {
    type: desc.type,
    encodedLength: encoded.length,
    ...summarizeSdp(desc),
  });
  return encoded;
}

export function decodeSessionDescription(encoded: string): RTCSessionDescriptionInit {
  const trimmed = encoded.trim();
  log('signaling: decoding session', {
    encodedLength: trimmed.length,
    preview: trimmed.slice(0, 48),
  });

  const json = decompressFromEncodedURIComponent(trimmed);
  if (!json) {
    warn('signaling: lz-string decompression failed', {
      encodedLength: trimmed.length,
      startsWithHash: trimmed.startsWith('#'),
    });
    throw new Error('Не удалось распознать данные сессии');
  }

  let payload: SessionDescriptionPayload;
  try {
    payload = JSON.parse(json) as SessionDescriptionPayload;
  } catch (error) {
    logError('signaling: JSON parse failed', error, { jsonLength: json.length });
    throw new Error('Некорректный формат сессии');
  }

  if (!payload.t || !payload.s) {
    warn('signaling: payload missing fields', {
      hasType: Boolean(payload.t),
      sdpLength: payload.s?.length ?? 0,
    });
    throw new Error('Некорректный формат сессии');
  }

  const desc = { type: payload.t, sdp: payload.s };
  log('signaling: decoded session', summarizeSdp(desc));
  return desc;
}

export function buildJoinUrl(encodedOffer: string): string {
  const origin = window.location.origin;
  const joinPath = import.meta.env.BASE_URL.replace(/\/?$/, '/join.html');
  return `${origin}${joinPath}#o=${encodedOffer}`;
}

export function parseOfferFromLocation(): string | null {
  const hash = window.location.hash.slice(1);
  if (!hash) {
    return null;
  }

  const params = new URLSearchParams(hash);
  return params.get('o');
}

export function parseAnswerInput(raw: string): RTCSessionDescriptionInit {
  const trimmed = raw.trim();

  if (trimmed.startsWith('#')) {
    const params = new URLSearchParams(trimmed.slice(1));
    const answer = params.get('a');
    if (answer) {
      return decodeSessionDescription(answer);
    }
  }

  if (trimmed.includes('#a=')) {
    const hashIndex = trimmed.indexOf('#a=');
    const answer = trimmed.slice(hashIndex + 3);
    return decodeSessionDescription(answer);
  }

  return decodeSessionDescription(trimmed);
}

export function buildAnswerShareText(encodedAnswer: string): string {
  return encodedAnswer;
}
