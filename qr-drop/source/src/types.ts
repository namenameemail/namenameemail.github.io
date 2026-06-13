export type SessionDescriptionPayload = {
  t: 'offer' | 'answer';
  s: string;
};

export type ConnectionState =
  | 'idle'
  | 'gathering'
  | 'waiting-answer'
  | 'connecting'
  | 'connected'
  | 'failed';

export type MetaMessage = {
  type: 'meta';
  id: string;
  name: string;
  size: number;
  mime: string;
};

export type DoneMessage = {
  type: 'done';
  id: string;
};

export type AckMessage = {
  type: 'ack';
  id: string;
  index: number;
};

export type ControlMessage = MetaMessage | DoneMessage | AckMessage;
