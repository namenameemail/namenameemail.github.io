const PREFIX = '[QR Drop]';

function stamp(): string {
  return new Date().toISOString().slice(11, 23);
}

export function log(step: string, data?: Record<string, unknown>): void {
  if (data) {
    console.log(`${PREFIX} ${stamp()} ${step}`, data);
  } else {
    console.log(`${PREFIX} ${stamp()} ${step}`);
  }
}

export function warn(step: string, data?: Record<string, unknown>): void {
  if (data) {
    console.warn(`${PREFIX} ${stamp()} ${step}`, data);
  } else {
    console.warn(`${PREFIX} ${stamp()} ${step}`);
  }
}

export function logError(step: string, error: unknown, data?: Record<string, unknown>): void {
  const payload: Record<string, unknown> = {
    ...data,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  console.error(`${PREFIX} ${stamp()} ${step}`, payload);
}

export function summarizeSdp(desc: RTCSessionDescriptionInit | null | undefined): Record<string, unknown> {
  if (!desc) {
    return { present: false };
  }

  const sdp = desc.sdp ?? '';
  const candidates = sdp.match(/^a=candidate:/gm) ?? [];
  const relayCandidates = candidates.filter((line) => line.includes(' typ relay '));

  return {
    type: desc.type,
    sdpLength: sdp.length,
    candidateCount: candidates.length,
    relayCandidateCount: relayCandidates.length,
    hasIceUfrag: /a=ice-ufrag:/.test(sdp),
    hasIcePwd: /a=ice-pwd:/.test(sdp),
  };
}

export function attachPeerConnectionDebug(pc: RTCPeerConnection, role: 'host' | 'guest'): () => void {
  const tag = role;

  const snapshot = (): Record<string, unknown> => ({
    connectionState: pc.connectionState,
    iceConnectionState: pc.iceConnectionState,
    iceGatheringState: pc.iceGatheringState,
    signalingState: pc.signalingState,
  });

  log(`peer ${tag}: created`, snapshot());

  const onConnectionStateChange = () => {
    log(`peer ${tag}: connectionstatechange`, snapshot());
  };
  const onIceConnectionStateChange = () => {
    log(`peer ${tag}: iceconnectionstatechange`, snapshot());
  };
  const onIceGatheringStateChange = () => {
    log(`peer ${tag}: icegatheringstatechange`, snapshot());
  };
  const onSignalingStateChange = () => {
    log(`peer ${tag}: signalingstatechange`, snapshot());
  };
  const onIceCandidate = (event: RTCPeerConnectionIceEvent) => {
    if (event.candidate) {
      log(`peer ${tag}: icecandidate`, {
        type: event.candidate.type,
        protocol: event.candidate.protocol,
        address: event.candidate.address,
        port: event.candidate.port,
        relatedAddress: event.candidate.relatedAddress,
        priority: event.candidate.priority,
      });
    } else {
      log(`peer ${tag}: icecandidate (end of candidates)`);
    }
  };
  const onIceCandidateError = (event: Event) => {
    const iceEvent = event as RTCPeerConnectionIceErrorEvent;
    warn(`peer ${tag}: icecandidateerror`, {
      errorCode: iceEvent.errorCode,
      errorText: iceEvent.errorText,
      url: iceEvent.url,
      address: iceEvent.address,
      port: iceEvent.port,
    });
  };

  pc.addEventListener('connectionstatechange', onConnectionStateChange);
  pc.addEventListener('iceconnectionstatechange', onIceConnectionStateChange);
  pc.addEventListener('icegatheringstatechange', onIceGatheringStateChange);
  pc.addEventListener('signalingstatechange', onSignalingStateChange);
  pc.addEventListener('icecandidate', onIceCandidate);
  pc.addEventListener('icecandidateerror', onIceCandidateError);

  return () => {
    pc.removeEventListener('connectionstatechange', onConnectionStateChange);
    pc.removeEventListener('iceconnectionstatechange', onIceConnectionStateChange);
    pc.removeEventListener('icegatheringstatechange', onIceGatheringStateChange);
    pc.removeEventListener('signalingstatechange', onSignalingStateChange);
    pc.removeEventListener('icecandidate', onIceCandidate);
    pc.removeEventListener('icecandidateerror', onIceCandidateError);
  };
}

export function attachDataChannelDebug(channel: RTCDataChannel, role: 'host' | 'guest'): () => void {
  const tag = role;

  log(`datachannel ${tag}: created`, { label: channel.label, readyState: channel.readyState });

  const onOpen = () => log(`datachannel ${tag}: open`);
  const onClose = () => log(`datachannel ${tag}: close`);
  const onError = (event: Event) => {
    warn(`datachannel ${tag}: error`, { eventType: event.type });
  };
  const onBufferedAmountLow = () => {
    log(`datachannel ${tag}: bufferedamountlow`, { bufferedAmount: channel.bufferedAmount });
  };

  channel.addEventListener('open', onOpen);
  channel.addEventListener('close', onClose);
  channel.addEventListener('error', onError);
  channel.addEventListener('bufferedamountlow', onBufferedAmountLow);

  return () => {
    channel.removeEventListener('open', onOpen);
    channel.removeEventListener('close', onClose);
    channel.removeEventListener('error', onError);
    channel.removeEventListener('bufferedamountlow', onBufferedAmountLow);
  };
}
