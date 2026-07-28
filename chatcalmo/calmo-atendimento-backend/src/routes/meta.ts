import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authGuard } from '../middleware/authGuard.js';

export async function metaRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authGuard);

  app.get('/api/agents', async (req) => {
    const users = await prisma.user.findMany({
      where: { accountId: req.auth!.accountId },
      select: { id: true, name: true, email: true, role: true, available: true },
      orderBy: { name: 'asc' },
    });
    return users;
  });

  app.get('/api/teams', async (req) => {
    return prisma.team.findMany({
      where: { accountId: req.auth!.accountId },
      orderBy: { name: 'asc' },
    });
  });

  app.get('/api/labels', async (req) => {
    return prisma.label.findMany({
      where: { accountId: req.auth!.accountId },
      orderBy: { name: 'asc' },
    });
  });

  // Criar etiqueta (agente ou admin — igual Chatwoot pós-ajuste)
  app.post('/api/labels', async (req) => {
    const body = z.object({ name: z.string().min(1), color: z.string().optional() }).parse(req.body);
    return prisma.label.create({
      data: { accountId: req.auth!.accountId, name: body.name, color: body.color ?? '#6b7280' },
    });
  });

  app.patch('/api/labels/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ name: z.string().min(1).optional(), color: z.string().optional() }).parse(req.body);
    const exists = await prisma.label.findFirst({ where: { id, accountId: req.auth!.accountId } });
    if (!exists) return reply.code(404).send({ error: 'etiqueta não encontrada' });
    return prisma.label.update({ where: { id }, data: body });
  });

  app.delete('/api/labels/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.label.deleteMany({ where: { id, accountId: req.auth!.accountId } });
    return { ok: true };
  });

  // ===== Mensagens automáticas (respostas rápidas) — EXCLUSIVAS por usuário =====
  app.get('/api/canned-replies', async (req) => {
    return prisma.cannedReply.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { shortcut: 'asc' },
    });
  });

  app.post('/api/canned-replies', async (req, reply) => {
    const body = z.object({ shortcut: z.string().min(1), content: z.string().min(1) }).parse(req.body);
    const exists = await prisma.cannedReply.findUnique({
      where: { userId_shortcut: { userId: req.auth!.userId, shortcut: body.shortcut } },
    });
    if (exists) return reply.code(409).send({ error: 'você já tem um atalho com esse nome' });
    return prisma.cannedReply.create({
      data: {
        accountId: req.auth!.accountId,
        userId: req.auth!.userId,
        shortcut: body.shortcut,
        content: body.content,
      },
    });
  });

  app.patch('/api/canned-replies/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({ shortcut: z.string().min(1).optional(), content: z.string().min(1).optional() })
      .parse(req.body);
    const exists = await prisma.cannedReply.findFirst({ where: { id, userId: req.auth!.userId } });
    if (!exists) return reply.code(404).send({ error: 'atalho não encontrado' });
    return prisma.cannedReply.update({ where: { id }, data: body });
  });

  app.delete('/api/canned-replies/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.cannedReply.deleteMany({ where: { id, userId: req.auth!.userId } });
    return { ok: true };
  });
}
