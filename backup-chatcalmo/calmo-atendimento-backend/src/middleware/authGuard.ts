import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyToken, type AuthTokenPayload } from '../lib/auth.js';
import { config } from '../config.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthTokenPayload;
  }
}

export async function authGuard(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Autenticação da Cecília (n8n) via chave de bot
  const botKey = req.headers['x-bot-key'];
  if (config.cecilia.botKey && typeof botKey === 'string' && botKey === config.cecilia.botKey) {
    req.auth = { userId: 'cecilia', accountId: config.cecilia.accountId, role: 'agent', isBot: true };
    return;
  }

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'não autenticado' });
    return;
  }
  try {
    req.auth = verifyToken(header.slice(7));
  } catch {
    reply.code(401).send({ error: 'token inválido' });
  }
}

export function requireAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
  if (req.auth?.role !== 'admin') {
    reply.code(403).send({ error: 'requer admin' });
    return false;
  }
  return true;
}
