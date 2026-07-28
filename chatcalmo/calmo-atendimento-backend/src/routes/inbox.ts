import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authGuard } from '../middleware/authGuard.js';
import { config } from '../config.js';
import { verifyNumber } from '../channels/whatsapp.js';

function mask(token: string | null): string | null {
  if (!token) return null;
  if (token.length <= 8) return '••••';
  return `${token.slice(0, 4)}••••${token.slice(-4)}`;
}

async function firstInbox(accountId: string) {
  return prisma.inbox.findFirst({ where: { accountId }, orderBy: { createdAt: 'asc' } });
}

export async function inboxRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authGuard);

  // Estado do conector
  app.get('/api/inbox', async (req, reply) => {
    const inbox = await firstInbox(req.auth!.accountId);
    if (!inbox) return reply.code(404).send({ error: 'inbox não encontrada' });
    return {
      id: inbox.id,
      name: inbox.name,
      conectado: inbox.waStatus === 'connected',
      status: inbox.waStatus,
      phoneNumberId: inbox.phoneNumberId,
      wabaId: inbox.wabaId,
      accessTokenMasked: mask(inbox.accessToken),
      hasAccessToken: !!inbox.accessToken,
      verifyToken: inbox.verifyToken,
      displayPhone: inbox.displayPhone,
      verifiedName: inbox.verifiedName,
      lastError: inbox.lastError,
      defaultTemplate: inbox.defaultTemplate,
      defaultLanguage: inbox.defaultLanguage,
      webhookUrl: `${config.publicBaseUrl.replace(/\/$/, '')}/api/webhooks/whatsapp/${inbox.id}`,
    };
  });

  // Conectar (valida direto na Meta e salva) — espelha conectarWa do recuperador
  app.post('/api/inbox/connect', async (req, reply) => {
    const body = z
      .object({
        phone_number_id: z.string().min(1),
        waba_id: z.string().optional().default(''),
        access_token: z.string().min(1),
        default_template: z.string().optional(),
        default_language: z.string().optional().default('pt_BR'),
      })
      .parse(req.body);

    const inbox = await firstInbox(req.auth!.accountId);
    if (!inbox) return reply.code(404).send({ error: 'inbox não encontrada' });

    const r = await verifyNumber(body.phone_number_id, body.access_token);
    if (!r.ok) {
      await prisma.inbox.update({
        where: { id: inbox.id },
        data: { waStatus: 'error', lastError: r.error ?? 'falha ao validar' },
      });
      return { ok: false, error: r.error ?? 'Não foi possível conectar' };
    }

    await prisma.inbox.update({
      where: { id: inbox.id },
      data: {
        phoneNumberId: body.phone_number_id,
        wabaId: body.waba_id || null,
        accessToken: body.access_token,
        defaultTemplate: body.default_template || null,
        defaultLanguage: body.default_language,
        displayPhone: r.displayPhoneNumber ?? null,
        verifiedName: r.verifiedName ?? null,
        waStatus: 'connected',
        lastError: null,
      },
    });
    return { ok: true, display_phone: r.displayPhoneNumber, verified_name: r.verifiedName };
  });

  // Desconectar
  app.post('/api/inbox/disconnect', async (req, reply) => {
    const inbox = await firstInbox(req.auth!.accountId);
    if (!inbox) return reply.code(404).send({ error: 'inbox não encontrada' });
    await prisma.inbox.update({
      where: { id: inbox.id },
      data: { waStatus: 'disconnected' },
    });
    return { ok: true };
  });

  // Define template padrão do conector
  app.post('/api/inbox/default-template', async (req, reply) => {
    const body = z.object({ name: z.string(), language: z.string().optional() }).parse(req.body);
    const inbox = await firstInbox(req.auth!.accountId);
    if (!inbox) return reply.code(404).send({ error: 'inbox não encontrada' });
    await prisma.inbox.update({
      where: { id: inbox.id },
      data: { defaultTemplate: body.name, defaultLanguage: body.language ?? inbox.defaultLanguage },
    });
    return { ok: true };
  });
}
