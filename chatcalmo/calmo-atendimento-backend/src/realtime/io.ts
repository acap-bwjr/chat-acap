import { Server as SocketServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { config } from '../config.js';
import { verifyToken } from '../lib/auth.js';

let io: SocketServer | null = null;

export function initRealtime(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: config.frontendOrigin, credentials: true },
    path: '/socket.io',
  });

  // Autentica o socket com o mesmo JWT das rotas.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('sem token'));
    try {
      const payload = verifyToken(token);
      // cada atendente entra na "sala" da conta dele → isolamento multi-tenant
      socket.data.accountId = payload.accountId;
      socket.data.userId = payload.userId;
      socket.join(`account:${payload.accountId}`);
      next();
    } catch {
      next(new Error('token inválido'));
    }
  });

  return io;
}

/** Emite um evento para todos os atendentes de uma conta. */
export function emitToAccount(accountId: string, event: string, data: unknown): void {
  io?.to(`account:${accountId}`).emit(event, data);
}
