import type Peer from 'peerjs';
import type { DataConnection, MediaConnection } from 'peerjs';

/**
 * Peer-to-peer rooms over WebRTC. PeerJS's free public broker is used for
 * signaling only — once connected, video and game messages flow directly
 * between the two players. No backend, no cost, no video ever touches a server.
 */

export type NetMessage =
  | { t: 'start'; careta: number }
  | { t: 'score'; v: number; pts: Array<[number, number]> | null }
  | { t: 'ready' }
  | { t: 'bye' }
  | { t: 'ping' };

const HEARTBEAT_MS = 2000;
const HEARTBEAT_TIMEOUT_MS = 7000;

export interface Session {
  send(msg: NetMessage): void;
  onMessage: ((msg: NetMessage) => void) | null;
  onRemoteStream: ((stream: MediaStream) => void) | null;
  onClose: (() => void) | null;
  close(): void;
}

export interface HostHandle {
  link: string;
  /** Resolves when a guest connects (never resolves after cancel()). */
  guest: Promise<Session>;
  cancel(): void;
}

class PeerSession implements Session {
  onMessage: ((msg: NetMessage) => void) | null = null;
  onRemoteStream: ((stream: MediaStream) => void) | null = null;
  onClose: (() => void) | null = null;
  private closed = false;

  private peer: Peer;
  private conn: DataConnection;
  private lastSeen = performance.now();
  private heartbeat: ReturnType<typeof setInterval>;

  constructor(peer: Peer, conn: DataConnection) {
    this.peer = peer;
    this.conn = conn;
    conn.on('data', (data) => {
      this.lastSeen = performance.now();
      const msg = data as NetMessage;
      if (msg.t === 'ping') return;
      this.onMessage?.(msg);
    });
    conn.on('close', () => this.handleClose());
    conn.on('error', () => this.handleClose());
    peer.on('disconnected', () => {
      // Broker connection lost; the P2P link may survive, try to get back.
      if (!this.closed) peer.reconnect();
    });
    // WebRTC can take ~30s to notice an abruptly-gone peer; a heartbeat
    // over the data channel detects it in a few seconds instead.
    this.heartbeat = setInterval(() => {
      this.send({ t: 'ping' });
      if (performance.now() - this.lastSeen > HEARTBEAT_TIMEOUT_MS) this.handleClose();
    }, HEARTBEAT_MS);
  }

  attachCall(call: MediaConnection): void {
    call.on('stream', (stream) => this.onRemoteStream?.(stream));
    call.on('close', () => this.handleClose());
  }

  private handleClose(): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeat);
    this.onClose?.();
    this.peer.destroy();
  }

  send(msg: NetMessage): void {
    if (!this.closed && this.conn.open) this.conn.send(msg);
  }

  close(): void {
    this.closed = true;
    clearInterval(this.heartbeat);
    this.conn.close();
    this.peer.destroy();
  }
}

function randomRoomId(): string {
  return 'caretona-' + Math.random().toString(36).slice(2, 10);
}

export async function hostRoom(localStream: MediaStream): Promise<HostHandle> {
  const { default: Peer } = await import('peerjs');
  const roomId = randomRoomId();
  const peer = new Peer(roomId);

  await new Promise<void>((resolve, reject) => {
    peer.on('open', () => resolve());
    peer.on('error', (err) => reject(err));
  });

  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('join', roomId);
  if (new URLSearchParams(location.search).has('mock')) url.searchParams.set('mock', '1');

  let cancelled = false;
  const guest = new Promise<Session>((resolve) => {
    peer.on('connection', (conn) => {
      if (cancelled) { conn.close(); return; }
      const session = new PeerSession(peer, conn);
      peer.on('call', (call) => {
        call.answer(localStream);
        session.attachCall(call);
      });
      conn.on('open', () => resolve(session));
    });
  });

  return {
    link: url.toString(),
    guest,
    cancel(): void {
      // Destroying the peer frees the room id; late joiners get peer-unavailable.
      cancelled = true;
      peer.destroy();
    },
  };
}

/** Throws Error('cancelled') if the room no longer exists. */
export async function joinRoom(roomId: string, localStream: MediaStream): Promise<Session> {
  const { default: Peer } = await import('peerjs');
  const peer = new Peer();

  await new Promise<void>((resolve, reject) => {
    peer.on('open', () => resolve());
    peer.on('error', (err) => reject(err));
  });

  return new Promise<Session>((resolve, reject) => {
    const conn = peer.connect(roomId, { reliable: true });
    const timeout = setTimeout(() => {
      peer.destroy();
      reject(new Error('cancelled'));
    }, 15000);

    peer.on('error', (err) => {
      if ((err as { type?: string }).type === 'peer-unavailable') {
        clearTimeout(timeout);
        peer.destroy();
        reject(new Error('cancelled'));
      }
    });

    conn.on('open', () => {
      clearTimeout(timeout);
      const session = new PeerSession(peer, conn);
      const call = peer.call(roomId, localStream);
      session.attachCall(call);
      resolve(session);
    });
  });
}
