import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authGuard } from '../middleware/authGuard.js';
import { emitToAccount } from '../realtime/io.js';

/**
 * Regra de visibilidade das conversas:
 * - atendente (agent): só vê conversas SEM dono ou atribuídas a ELE;
 * - administrador: vê todas, mesmo atribuídas a outros.
 * Aplicada em TODA rota que lê/altera uma conversa (não é só filtro de tela: é segurança).
 */
function visibilidade(auth: { userId: string; role: 'admin' | 'agent' }): Record<string, unknown> {
  return auth.role === 'admin' ? {} : { OR: [{ assigneeId: null }, { assigneeId: auth.userId }] };
}

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authGuard);

  // Inicia (ou reabre) uma conversa a partir de um telefone — usado pela Prospecção (botão WhatsApp).
  // Cria o contato/conversa se ainda não existir e devolve o id p/ o front abrir em Conversas.
  app.post('/api/conversations/start', async (req, reply) => {
    const body = z.object({ phone: z.string().min(6), name: z.string().optional() }).parse(req.body);
    const accountId = req.auth!.accountId;
    const phone = body.phone.replace(/\D/g, ''); // só dígitos (E.164 sem "+")
    if (phone.length < 10) return reply.code(400).send({ error: 'telefone inválido' });

    const inbox = await prisma.inbox.findFirst({ where: { accountId }, orderBy: { createdAt: 'asc' } });
    if (!inbox) return reply.code(400).send({ error: 'nenhum inbox configurado' });

    const contact = await prisma.contact.upsert({
      where: { accountId_phone: { accountId, phone } },
      update: body.name ? { name: body.name } : {},
      create: { accountId, phone, name: body.name ?? null },
    });

    let conversation = await prisma.conversation.findFirst({
      where: { accountId, contactId: contact.id, inboxId: inbox.id, status: { in: ['open', 'pending'] } },
      orderBy: { lastMessageAt: 'desc' },
    });
    let created = false;
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { accountId, inboxId: inbox.id, contactId: contact.id, status: 'pending', lastMessageAt: new Date() },
      });
      created = true;
      emitToAccount(accountId, 'conversation:update', { id: conversation.id });
    }
    return { conversationId: conversation.id, created };
  });

  // Lista de conversas (com filtros básicos)
  app.get('/api/conversations', async (req) => {
    const accountId = req.auth!.accountId;
    const myId = req.auth!.userId;
    const isAdmin = req.auth!.role === 'admin';
    const q = z
      .object({
        tab: z.enum(['all', 'mine', 'unassigned', 'resolved']).optional(),
        agentId: z.string().optional(), // filtro por atendente
        labelId: z.string().optional(), // filtro por etiqueta
        period: z.enum(['today', '7d', '30d']).optional(), // filtro por data
        teamId: z.string().optional(),
        search: z.string().optional(),
      })
      .parse(req.query);

    const and: any[] = [];

    // ---- Visibilidade (regra de negócio + segurança) ----
    // Atendente enxerga apenas conversas SEM dono ou atribuídas a ELE.
    // Administrador enxerga todas, mesmo as atribuídas a outros.
    if (!isAdmin) and.push({ OR: [{ assigneeId: null }, { assigneeId: myId }] });

    // ---- Abas ----
    const tab = q.tab ?? 'all';
    if (tab === 'resolved') {
      and.push({ status: 'resolved' });
    } else {
      and.push({ status: { not: 'resolved' } }); // resolvidas saem das outras abas
      if (tab === 'mine') and.push({ assigneeId: myId });
      else if (tab === 'unassigned') and.push({ assigneeId: null });
      // "Todas": ao ser atribuída a conversa SAI de Todas (vai p/ Minhas do dono).
      // Admin continua vendo tudo em Todas.
      else if (tab === 'all' && !isAdmin) and.push({ assigneeId: null });
    }

    // ---- Filtros ----
    if (q.agentId) and.push({ assigneeId: q.agentId });
    if (q.labelId) and.push({ labels: { some: { labelId: q.labelId } } });
    if (q.teamId) and.push({ teamId: q.teamId });
    if (q.period) {
      const from = new Date();
      if (q.period === 'today') from.setHours(0, 0, 0, 0);
      else if (q.period === '7d') from.setDate(from.getDate() - 7);
      else from.setDate(from.getDate() - 30);
      and.push({ lastMessageAt: { gte: from } });
    }
    if (q.search) {
      and.push({
        contact: {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { phone: { contains: q.search } },
            { email: { contains: q.search, mode: 'insensitive' } },
          ],
        },
      });
    }

    const where: any = { accountId, AND: and };

    const convs = await prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
      include: {
        contact: true,
        assignee: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        labels: { include: { label: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    return convs.map((c) => ({
      id: c.id,
      status: c.status,
      contact: c.contact,
      assignee: c.assignee,
      team: c.team,
      labels: c.labels.map((l) => l.label),
      lastMessage: c.messages[0] ?? null,
      lastMessageAt: c.lastMessageAt,
      waWindowUntil: c.waWindowUntil,
      unreadCount: c.unreadCount,
    }));
  });

  // Marcar conversa como lida (zera o contador de não-lidas)
  app.post('/api/conversations/:id/read', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exists = await prisma.conversation.findFirst({
      where: { id, accountId: req.auth!.accountId, ...visibilidade(req.auth!) },
      select: { id: true, unreadCount: true },
    });
    if (!exists) return reply.code(404).send({ error: 'não encontrada' });
    if (exists.unreadCount !== 0) {
      await prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } });
      emitToAccount(req.auth!.accountId, 'conversation:update', { id, unreadCount: 0 });
    }
    return { ok: true };
  });

  // Marcar como NÃO lida (traz o badge de volta, igual ao WhatsApp)
  app.post('/api/conversations/:id/unread', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exists = await prisma.conversation.findFirst({
      where: { id, accountId: req.auth!.accountId, ...visibilidade(req.auth!) },
      select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'não encontrada' });
    await prisma.conversation.update({ where: { id }, data: { unreadCount: 1 } });
    emitToAccount(req.auth!.accountId, 'conversation:update', { id, unreadCount: 1 });
    return { ok: true };
  });

  // Bloquear / desbloquear o contato (mensagens recebidas passam a ser ignoradas)
  app.post('/api/conversations/:id/block', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ blocked: z.boolean().optional() }).parse(req.body ?? {});
    const conv = await prisma.conversation.findFirst({
      where: { id, accountId: req.auth!.accountId, ...visibilidade(req.auth!) },
      include: { contact: true },
    });
    if (!conv) return reply.code(404).send({ error: 'não encontrada' });
    const blocked = body.blocked ?? !conv.contact.blocked;
    await prisma.contact.update({ where: { id: conv.contactId }, data: { blocked } });
    emitToAccount(req.auth!.accountId, 'conversation:update', { id, blocked });
    return { ok: true, blocked };
  });

  // Limpar conversa: apaga as mensagens e mantém a conversa
  app.delete('/api/conversations/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exists = await prisma.conversation.findFirst({
      where: { id, accountId: req.auth!.accountId, ...visibilidade(req.auth!) },
      select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'não encontrada' });
    await prisma.message.deleteMany({ where: { conversationId: id } });
    await prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } });
    emitToAccount(req.auth!.accountId, 'conversation:update', { id, cleared: true });
    return { ok: true };
  });

  // Apagar conversa (as mensagens saem junto, por cascata)
  app.delete('/api/conversations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exists = await prisma.conversation.findFirst({
      where: { id, accountId: req.auth!.accountId, ...visibilidade(req.auth!) },
      select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'não encontrada' });
    await prisma.conversation.delete({ where: { id } });
    emitToAccount(req.auth!.accountId, 'conversation:update', { id, deleted: true });
    return { ok: true };
  });

  // Detalhe + mensagens
  // Bootstrap: TODAS as conversas + últimas 100 mensagens de cada (pré-carregamento no login)
  app.get('/api/conversations/bootstrap', async (req) => {
    const accountId = req.auth!.accountId;
    const convs = await prisma.conversation.findMany({
      where: { accountId, ...visibilidade(req.auth!) },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        contact: true,
        assignee: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        labels: { include: { label: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    const conversations = convs.map((c) => ({
      id: c.id,
      status: c.status,
      contact: c.contact,
      assignee: c.assignee,
      team: c.team,
      labels: c.labels.map((l) => l.label),
      lastMessage: c.messages[0] ?? null,
      lastMessageAt: c.lastMessageAt,
      waWindowUntil: c.waWindowUntil,
      unreadCount: c.unreadCount,
    }));
    const entries = await Promise.all(
      convs.map(async (c) => {
        const msgs = await prisma.message.findMany({
          where: { conversationId: c.id },
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: {
            agentSender: { select: { id: true, name: true } },
            replyTo: { select: { id: true, content: true, type: true, direction: true, senderType: true, mediaUrl: true } },
          },
        });
        msgs.reverse();
        return [c.id, msgs] as const;
      }),
    );
    return { conversations, messages: Object.fromEntries(entries) };
  });

  app.get('/api/conversations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const conv = await prisma.conversation.findFirst({
      where: { id, accountId: req.auth!.accountId, ...visibilidade(req.auth!) },
      include: {
        contact: true,
        assignee: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        labels: { include: { label: true } },
        inbox: { select: { id: true, name: true } },
      },
    });
    if (!conv) return reply.code(404).send({ error: 'não encontrada' });

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      take: 500,
      include: {
        agentSender: { select: { id: true, name: true } },
        replyTo: {
          select: { id: true, content: true, type: true, direction: true, senderType: true, mediaUrl: true },
        },
      },
    });
    return { conversation: { ...conv, labels: conv.labels.map((l) => l.label) }, messages };
  });

  // Atualiza status / atribuição / time
  app.patch('/api/conversations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        status: z.enum(['open', 'pending', 'resolved']).optional(),
        assigneeId: z.string().nullable().optional(),
        teamId: z.string().nullable().optional(),
        botEstado: z.any().optional(), // estado da triagem (usado pela Cecília)
      })
      .parse(req.body);

    const exists = await prisma.conversation.findFirst({
      where: { id, accountId: req.auth!.accountId, ...visibilidade(req.auth!) },
    });
    if (!exists) return reply.code(404).send({ error: 'não encontrada' });

    const conv = await prisma.conversation.update({
      where: { id },
      data: body,
      include: {
        contact: true,
        assignee: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
    });
    emitToAccount(req.auth!.accountId, 'conversation:update', conv);
    return conv;
  });

  // Etiquetas da conversa (substitui o conjunto)
  app.put('/api/conversations/:id/labels', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ labelIds: z.array(z.string()) }).parse(req.body);
    const exists = await prisma.conversation.findFirst({
      where: { id, accountId: req.auth!.accountId, ...visibilidade(req.auth!) },
    });
    if (!exists) return reply.code(404).send({ error: 'não encontrada' });

    await prisma.conversationLabel.deleteMany({ where: { conversationId: id } });
    if (body.labelIds.length) {
      await prisma.conversationLabel.createMany({
        data: body.labelIds.map((labelId) => ({ conversationId: id, labelId })),
        skipDuplicates: true,
      });
    }
    emitToAccount(req.auth!.accountId, 'conversation:update', { id, labelIds: body.labelIds });
    return { ok: true };
  });
}
