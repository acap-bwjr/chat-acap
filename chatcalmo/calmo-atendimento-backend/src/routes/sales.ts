import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authGuard } from '../middleware/authGuard.js';

// ============================================================
// Vendas — duas origens:
//  • atendimento: registrada dentro de uma conversa
//  • prospecção : registrada no card do lead do CRM
// O resumo (/api/sales/resumo) devolve os dois + o total geral,
// usado nas duas dashboards.
// ============================================================

/** Converte "YYYY-MM-DD" em Date no fuso de SP (meio-dia evita virada de dia). */
const dataVenda = (s?: string) => (s ? new Date(`${s}T12:00:00-03:00`) : new Date());

function intervalo(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  const r: { gte?: Date; lte?: Date } = {};
  if (from) r.gte = new Date(`${from}T00:00:00-03:00`);
  if (to) r.lte = new Date(`${to}T23:59:59.999-03:00`);
  return r;
}

export async function saleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authGuard);

  /** Registra uma venda a partir de uma CONVERSA (atendimento). */
  app.post('/api/conversations/:id/sales', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        amount: z.number().positive(),
        soldAt: z.string().optional(),
        agentId: z.string().nullable().optional(),
        note: z.string().optional(),
      })
      .parse(req.body);

    const conv = await prisma.conversation.findFirst({
      where: { id, accountId: req.auth!.accountId },
      select: { id: true, contactId: true, assigneeId: true },
    });
    if (!conv) return reply.code(404).send({ error: 'conversa não encontrada' });

    // vendedor: o escolhido > o dono da conversa > quem registrou
    const agentId = body.agentId !== undefined ? body.agentId : conv.assigneeId ?? req.auth!.userId;
    const agente = agentId ? await prisma.user.findUnique({ where: { id: agentId }, select: { name: true } }) : null;

    return prisma.sale.create({
      data: {
        accountId: req.auth!.accountId,
        origem: 'atendimento',
        conversationId: id,
        contactId: conv.contactId,
        agentId,
        agentName: agente?.name ?? null,
        amount: body.amount,
        soldAt: dataVenda(body.soldAt),
        note: body.note?.trim() || null,
      },
    });
  });

  /** Registra uma venda da PROSPECÇÃO (lead do CRM). */
  app.post('/api/sales/prospeccao', async (req) => {
    const body = z
      .object({
        amount: z.number().positive(),
        soldAt: z.string().optional(),
        leadId: z.string().optional(),
        agentName: z.string().optional(), // Victor / Gabriel
        note: z.string().optional(),
      })
      .parse(req.body);

    return prisma.sale.create({
      data: {
        accountId: req.auth!.accountId,
        origem: 'prospeccao',
        leadId: body.leadId ?? null,
        agentName: body.agentName?.trim() || null,
        amount: body.amount,
        soldAt: dataVenda(body.soldAt),
        note: body.note?.trim() || null,
      },
    });
  });

  /** Lista de vendas do período (com cliente e vendedor). */
  app.get('/api/sales', async (req) => {
    const accountId = req.auth!.accountId;
    const q = z
      .object({ from: z.string().optional(), to: z.string().optional(), origem: z.string().optional() })
      .parse(req.query);

    const where: any = { accountId };
    const periodo = intervalo(q.from, q.to);
    if (periodo) where.soldAt = periodo;
    if (q.origem) where.origem = q.origem;

    const sales = await prisma.sale.findMany({ where, orderBy: { soldAt: 'desc' }, take: 500 });
    const contactIds = [...new Set(sales.map((s) => s.contactId).filter(Boolean))] as string[];
    const contacts = contactIds.length
      ? await prisma.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, name: true, phone: true } })
      : [];
    const cmap = new Map(contacts.map((c) => [c.id, c]));

    return sales.map((s) => ({
      id: s.id,
      origem: s.origem,
      amount: s.amount,
      soldAt: s.soldAt,
      note: s.note,
      agentName: s.agentName ?? 'Sem vendedor',
      leadId: s.leadId,
      contactName: s.contactId ? cmap.get(s.contactId)?.name ?? null : null,
      contactPhone: s.contactId ? cmap.get(s.contactId)?.phone ?? null : null,
    }));
  });

  /** Resumo consolidado: atendimento + prospecção + geral (usado nas dashboards). */
  app.get('/api/sales/resumo', async (req) => {
    const accountId = req.auth!.accountId;
    const q = z.object({ from: z.string().optional(), to: z.string().optional() }).parse(req.query);
    const where: any = { accountId };
    const periodo = intervalo(q.from, q.to);
    if (periodo) where.soldAt = periodo;

    const sales = await prisma.sale.findMany({ where, select: { origem: true, amount: true, agentName: true } });

    const zero = () => ({ total: 0, quantidade: 0 });
    const atendimento = zero();
    const prospeccao = zero();
    const porVendedor: Record<string, { total: number; quantidade: number }> = {};

    for (const s of sales) {
      const alvo = s.origem === 'prospeccao' ? prospeccao : atendimento;
      alvo.total += s.amount;
      alvo.quantidade++;
      const nome = s.agentName?.trim() || 'Sem vendedor';
      porVendedor[nome] ??= { total: 0, quantidade: 0 };
      porVendedor[nome].total += s.amount;
      porVendedor[nome].quantidade++;
    }

    const geral = {
      total: atendimento.total + prospeccao.total,
      quantidade: atendimento.quantidade + prospeccao.quantidade,
    };
    return {
      atendimento,
      prospeccao,
      geral,
      ticketMedio: geral.quantidade ? geral.total / geral.quantidade : 0,
      porVendedor: Object.entries(porVendedor)
        .map(([nome, v]) => ({ nome, ...v }))
        .sort((a, b) => b.total - a.total),
    };
  });

  /** Vendas de uma conversa. */
  app.get('/api/conversations/:id/sales', async (req) => {
    const { id } = req.params as { id: string };
    return prisma.sale.findMany({
      where: { conversationId: id, accountId: req.auth!.accountId },
      orderBy: { soldAt: 'desc' },
    });
  });

  /** Vendas de um lead da prospecção. */
  app.get('/api/sales/lead/:leadId', async (req) => {
    const { leadId } = req.params as { leadId: string };
    return prisma.sale.findMany({
      where: { leadId, accountId: req.auth!.accountId },
      orderBy: { soldAt: 'desc' },
    });
  });

  /** Apaga uma venda registrada por engano. */
  app.delete('/api/sales/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = await prisma.sale.deleteMany({ where: { id, accountId: req.auth!.accountId } });
    if (!r.count) return reply.code(404).send({ error: 'venda não encontrada' });
    return { ok: true };
  });
}
