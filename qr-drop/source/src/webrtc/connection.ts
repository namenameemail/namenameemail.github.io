import 'webrtc-adapter';

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

export function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const finish = () => {
      pc.removeEventListener('icegatheringstatechange', onChange);
      clearTimeout(timer);
      resolve();
    };

    const onChange = () => {
      if (pc.iceGatheringState === 'complete') {
        finish();
      }
    };

    const timer = setTimeout(finish, ICE_GATHER_TIMEOUT_MS);
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}

export function waitForChannelOpen(channel: RTCDataChannel): Promise<void> {
  if (channel.readyState === 'open') {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Data channel failed to open'));
    };
    const onClose = () => {
      cleanup();
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
  const pc = new RTCPeerConnection({
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 0,
  });

  const channel = pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGathering(pc);

  const local = pc.localDescription;
  if (!local) {
    throw new Error('Failed to create local offer');
  }

  return {
    bundle: { pc, channel },
    offer: local.toJSON(),
  };
}

export async function createGuestPeer(offer: RTCSessionDescriptionInit): Promise<{
  bundle: PeerConnectionBundle;
  answer: RTCSessionDescriptionInit;
}> {
  const pc = new RTCPeerConnection({
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 0,
  });

  const channelPromise = new Promise<RTCDataChannel>((resolve, reject) => {
    pc.ondatachannel = (event) => resolve(event.channel);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        reject(new Error('WebRTC connection failed'));
      }
    };
  });

  await pc.setRemoteDescription(offer);

  const channel = await Promise.race([
    channelPromise,
    new Promise<RTCDataChannel>((_, reject) => {
      setTimeout(() => reject(new Error('Data channel not received')), 5_000);
    }),
  ]);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForIceGathering(pc);

  const local = pc.localDescription;
  if (!local) {
    throw new Error('Failed to create local answer');
  }

  return {
    bundle: { pc, channel },
    answer: local.toJSON(),
  };
}

export async function applyAnswer(
  pc: RTCPeerConnection,
  answer: RTCSessionDescriptionInit,
): Promise<void> {
  await pc.setRemoteDescription(answer);
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
