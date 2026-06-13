import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string';
import type { SessionDescriptionPayload } from '../types';

export function encodeSessionDescription(desc: RTCSessionDescriptionInit): string {
  const payload: SessionDescriptionPayload = {
    t: desc.type as 'offer' | 'answer',
    s: desc.sdp ?? '',
  };
  return compressToEncodedURIComponent(JSON.stringify(payload));
}

export function decodeSessionDescription(encoded: string): RTCSessionDescriptionInit {
  const trimmed = encoded.trim();
  const json = decompressFromEncodedURIComponent(trimmed);
  if (!json) {
    throw new Error('Не удалось распознать данные сессии');
  }

  const payload = JSON.parse(json) as SessionDescriptionPayload;
  if (!payload.t || !payload.s) {
    throw new Error('Некорректный формат сессии');
  }

  return { type: payload.t, sdp: payload.s };
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
