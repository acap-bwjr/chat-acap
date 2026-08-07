import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../lib/prisma.js';
import { hashPassword, signToken, verifyPassword } from '../lib/auth.js';
import { authGuard } from '../middleware/authGuard.js';
import { config } from '../config.js';

const googleClient = new OAuth2Client(config.googleClientId);

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', async (req, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.findFirst({ where: { email: body.email } });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: 'e-mail ou senha inválidos' });
    }
    const token = signToken({ userId: user.id, accountId: user.accountId, role: user.role });
    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl },
    };
  });

  // Login com Google: recebe o credential (ID token) do Google Identity Services,
  // valida a assinatura/audiência direto com a Google e só libera acesso pra quem
  // já é usuário cadastrado (não cria conta nova automaticamente).
  app.post('/api/auth/google', async (req, reply) => {
    const body = z.object({ credential: z.string().min(1) }).parse(req.body);
    if (!config.googleClientId) {
      return reply.code(500).send({ error: 'login com Google não configurado no servidor' });
    }

    let email: string | undefined;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: body.credential,
        audience: config.googleClientId,
      });
      const payload = ticket.getPayload();
      if (payload?.email_verified) email = payload.email;
    } catch {
      return reply.code(401).send({ error: 'token do Google inválido' });
    }
    if (!email) return reply.code(401).send({ error: 'não foi possível confirmar o e-mail do Google' });

    const user = await prisma.user.findFirst({ where: { email } });
    if (!user) return reply.code(403).send({ error: 'essa conta Google não tem acesso ao sistema' });

    const token = signToken({ userId: user.id, accountId: user.accountId, role: user.role });
    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl },
    };
  });

  app.get('/api/auth/me', { preHandler: authGuard }, async (req) => {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    return {
      user: user && { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl },
    };
  });

  // Atualiza o próprio perfil (nome)
  app.patch('/api/auth/me', { preHandler: authGuard }, async (req) => {
    const body = z.object({ name: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.auth!.userId },
      data: { name: body.name },
    });
    return { user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl } };
  });

  // Troca de senha
  app.post('/api/auth/change-password', { preHandler: authGuard }, async (req, reply) => {
    const body = z
      .object({ currentPassword: z.string().min(1), newPassword: z.string().min(6) })
      .parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user || !(await verifyPassword(body.currentPassword, user.passwordHash))) {
      return reply.code(400).send({ error: 'senha atual incorreta' });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.newPassword) },
    });
    return { ok: true };
  });
}
