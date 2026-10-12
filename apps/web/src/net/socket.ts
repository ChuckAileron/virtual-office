import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@vo/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Conexión Socket.IO autenticada (mismo origen). Sin reconexión: al caer se vuelve al lobby. */
export function createSocket(token: string): GameSocket {
  return io({ auth: { token }, reconnection: false }) as GameSocket;
}
