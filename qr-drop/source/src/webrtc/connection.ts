import 'webrtc-adapter';
import {
  attachDataChannelDebug,
  attachPeerConnectionDebug,
  log,
  logError,
  summarizeSdp,
  warn,
} from '../debug';

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export const DATA_CHANNEL_LABEL = 'file-transfer';

export type PeerConnectionBundle = {
  pc: RTCPeerConnection;
  channel: RTCDataChannel;
};

const ICE_GATHER_TIMEOUT_MS = 15_000;

export function waitForIceGathering(
  pc: RTCPeerConnection,
  role: 'host' | 'guest',
): Promise<void> {
  if (pc.iceGatheringState === 'complete') {
    log(`ice gathering ${role}: already complete`, summarizeSdp(pc.localDescription));
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let reason: 'complete' | 'timeout' = 'complete';

    const finish = () => {
      pc.removeEventListener('icegatheringstatechange', onChange);
      clearTimeout(timer);
      const summary = summarizeSdp(pc.localDescription);
      if (reason === 'timeout') {
        warn(`ice gathering ${role}: timed out after ${ICE_GATHER_TIMEOUT_MS}ms`, {
          iceGatheringState: pc.iceGatheringState,
          ...summary,
        });
      } else {
        log(`ice gathering ${role}: complete`, summary);
      }
      resolve();
    };

    const onChange = () => {
      if (pc.iceGatheringState === 'complete') {
        finish();
      }
    };

    const timer = setTimeout(() => {
      reason = 'timeout';
      finish();
    }, ICE_GATHER_TIMEOUT_MS);
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}

export function waitForChannelOpen(
  channel: RTCDataChannel,
  role: 'host' | 'guest',
): Promise<void> {
  if (channel.readyState === 'open') {
    log(`datachannel ${role}: already open`);
    return Promise.resolve();
  }

  log(`datachannel ${role}: waiting for open`, { readyState: channel.readyState });

  return new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      log(`datachannel ${role}: opened`);
      resolve();
    };
    const onError = (event: Event) => {
      cleanup();
      warn(`datachannel ${role}: error while opening`, {
        readyState: channel.readyState,
        eventType: event.type,
      });
      reject(new Error('Data channel failed to open'));
    };
    const onClose = () => {
      cleanup();
      warn(`datachannel ${role}: closed before opening`, { readyState: channel.readyState });
      reject(new Error('Data channel closed before opening'));
    };

    const cleanup = () => {
      channel.removeEventListener('open', onOpen);
      channel.removeEventListener('error', onError);
      channel.removeEventListener('close', onClose);
    };

    channel.addEventListener('open', onOpen);
    channel.addEventListener('error', onError);
    channel.addEventListener('close', onClose);
  });
}

export async function createHostPeer(): Promise<{
  bundle: PeerConnectionBundle;
  offer: RTCSessionDescriptionInit;
}> {
  log('host: creating peer connection', { iceServers: ICE_SERVERS.length });

  const pc = new RTCPeerConnection({
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 0,
  });
  attachPeerConnectionDebug(pc, 'host');

  const channel = pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
  attachDataChannelDebug(channel, 'host');

  try {
    const offer = await pc.createOffer();
    log('host: offer created', summarizeSdp(offer));
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc, 'host');

    const local = pc.localDescription;
    if (!local) {
      throw new Error('Failed to create local offer');
    }

    const serialized = local.toJSON();
    log('host: offer ready', summarizeSdp(serialized));

    return {
      bundle: { pc, channel },
      offer: serialized,
    };
  } catch (error) {
    logError('host: failed to create peer', error);
    throw error;
  }
}

export async function createGuestPeer(offer: RTCSessionDescriptionInit): Promise<{
  bundle: PeerConnectionBundle;
  answer: RTCSessionDescriptionInit;
}> {
  log('guest: creating peer connection', {
    offer: summarizeSdp(offer),
    iceServers: ICE_SERVERS.length,
  });

  const pc = new RTCPeerConnection({
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 0,
  });
  attachPeerConnectionDebug(pc, 'guest');

  const channelPromise = new Promise<RTCDataChannel>((resolve, reject) => {
    pc.ondatachannel = (event) => {
      log('guest: datachannel received', {
        label: event.channel.label,
        readyState: event.channel.readyState,
      });
      attachDataChannelDebug(event.channel, 'guest');
      resolve(event.channel);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        warn('guest: connection failed before datachannel ready', {
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          signalingState: pc.signalingState,
        });
        reject(new Error('WebRTC connection failed'));
      }
    };
  });

  try {
    await pc.setRemoteDescription(offer);
    log('guest: remote offer applied', {
      signalingState: pc.signalingState,
      remoteDescription: summarizeSdp(pc.remoteDescription),
    });

    const channel = await Promise.race([
      channelPromise,
      new Promise<RTCDataChannel>((_, reject) => {
        setTimeout(() => {
          warn('guest: datachannel not received within 5s', {
            connectionState: pc.connectionState,
            signalingState: pc.signalingState,
          });
          reject(new Error('Data channel not received'));
        }, 5_000);
      }),
    ]);

    const answer = await pc.createAnswer();
    log('guest: answer created', summarizeSdp(answer));
    await pc.setLocalDescription(answer);
    await waitForIceGathering(pc, 'guest');

    const local = pc.localDescription;
    if (!local) {
      throw new Error('Failed to create local answer');
    }

    const serialized = local.toJSON();
    log('guest: answer ready', summarizeSdp(serialized));

    return {
      bundle: { pc, channel },
      answer: serialized,
    };
  } catch (error) {
    logError('guest: failed to create peer', error, {
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      signalingState: pc.signalingState,
    });
    throw error;
  }
}

export async function applyAnswer(
  pc: RTCPeerConnection,
  answer: RTCSessionDescriptionInit,
): Promise<void> {
  log('host: applying answer', summarizeSdp(answer));
  try {
    await pc.setRemoteDescription(answer);
    log('host: answer applied', {
      signalingState: pc.signalingState,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      remoteDescription: summarizeSdp(pc.remoteDescription),
    });
  } catch (error) {
    logError('host: failed to apply answer', error, summarizeSdp(answer));
    throw error;
  }
}

export function watchConnectionState(
  pc: RTCPeerConnection,
  onChange: (state: RTCPeerConnectionState) => void,
): () => void {
  const handler = () => onChange(pc.connectionState);
  pc.addEventListener('connectionstatechange', handler);
  handler();
  return () => pc.removeEventListener('connectionstatechange', handler);
}
