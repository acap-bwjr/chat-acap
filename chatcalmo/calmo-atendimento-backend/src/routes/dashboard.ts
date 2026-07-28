import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authGuard } from '../middleware/authGuard.js';

const SP_OFFSET_MS = 3 * 60 * 60 * 1000; // São Paulo = UTC-3

/** Instante UTC real da meia-noite de hoje em São Paulo. */
function startOfTodaySP(): Date {
  const spNow = new Date(Date.now() - SP_OFFSET_MS);
  const wall = Date.UTC(spNow.getUTCFullYear(), spNow.getUTCMonth(), spNow.getUTCDate());
  return new Date(wall + SP_OFFSET_MS);
}

/** Meia-noite (SP) de uma data YYYY-MM-DD, com deslocamento opcional em dias. */
function meiaNoiteSP(iso: string, maisDias = 0): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + maisDias);
  return new Date(wall + SP_OFFSET_MS);
}

/**
 * Janela do dashboard. Sem `from`/`to` = hoje (comportamento antigo).
 * `from=1970-01-01` (ou qualquer data antiga) cobre "todo o período".
 */
function janela(q: unknown): { gte: Date; lt?: Date } {
  const { from, to } = (q ?? {}) as { from?: string; to?: string };
  const inicio = from ? meiaNoiteSP(from) : null;
  const fim = to ? meiaNoiteSP(to, 1) : null; // fim exclusivo: 00:00 do dia seguinte
  if (!inicio) return { gte: startOfTodaySP() };
  return fim ? { gte: inicio, lt: fim } : { gte: inicio };
}

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authGuard);

  app.get('/api/dashboard', async (req) => {
    const accountId = req.auth!.accountId;
    const periodo = janela(req.query);

    const [
      newConversations,
      inboundToday,
      outboundToday,
      byStatus,
      assignedGroups,
      msgGroups,
      agents,
    ] = await Promise.all([
      prisma.conversation.count({ where: { accountId, createdAt: periodo } }),
      prisma.message.count({
        where: { conversation: { accountId }, direction: 'in', createdAt: periodo },
      }),
      prisma.message.count({
        where: {
          conversation: { accountId },
          direction: 'out',
          senderType: 'agent',
          isPrivate: false,
          createdAt: periodo,
        },
      }),
      prisma.conversation.groupBy({
        by: ['status'],
        where: { accountId, createdAt: periodo },
        _count: { _all: true },
      }),
      prisma.conversation.groupBy({
        by: ['assigneeId'],
        where: { accountId, status: { in: ['open', 'pending'] }, assigneeId: { not: null }, createdAt: periodo },
        _count: { _all: true },
      }),
      prisma.message.groupBy({
        by: ['agentSenderId'],
        where: {
          conversation: { accountId },
          direction: 'out',
          senderType: 'agent',
          isPrivate: false,
          createdAt: periodo,
          agentSenderId: { not: null },
        },
        _count: { _all: true },
      }),
      prisma.user.findMany({
        // Só atendentes (role 'agent'). A conta 'admin' é a de login/gestão e
        // não deve aparecer na lista "Por atendente".
        where: { accountId, role: 'agent' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const statusMap = { open: 0, pending: 0, resolved: 0 } as Record<string, number>;
    for (const g of byStatus) statusMap[g.status] = g._count._all;

    const assignedMap = new Map(assignedGroups.map((g) => [g.assigneeId, g._count._all]));
    const msgMap = new Map(msgGroups.map((g) => [g.agentSenderId, g._count._all]));

    const perAgent = agents.map((a) => ({
      id: a.id,
      name: a.name,
      emAtendimento: assignedMap.get(a.id) ?? 0, // conversas abertas/pendentes atribuídas
      mensagensHoje: msgMap.get(a.id) ?? 0, // mensagens enviadas hoje
    }));

    return {
      today: {
        newConversations,
        inbound: inboundToday,
        outbound: outboundToday,
      },
      byStatus: statusMap,
      perAgent,
    };
  });
}
