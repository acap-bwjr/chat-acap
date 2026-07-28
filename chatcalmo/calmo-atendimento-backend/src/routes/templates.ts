import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authGuard } from '../middleware/authGuard.js';
import { config } from '../config.js';
import { submitTemplate, type TemplateInput } from '../channels/templates.js';

const buttonSchema = z.object({
  type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']),
  text: z.string(),
  url: z.string().optional(),
  phone: z.string().optional(),
});

const bodySchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9_]+$/, 'use minúsculas, números e _'),
  friendlyName: z.string().optional().nullable(),
  category: z.enum(['UTILITY', 'MARKETING', 'AUTHENTICATION']).default('UTILITY'),
  language: z.string().default('pt_BR'),
  header: z.string().optional().nullable(),
  body: z.string().min(1),
  footer: z.string().optional().nullable(),
  buttons: z.array(buttonSchema).optional().default([]),
  status: z.enum(['draft', 'pending', 'approved', 'rejected']).optional(),
});

export async function templateRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authGuard);

  app.get('/api/templates', async (req) => {
    return prisma.template.findMany({
      where: { accountId: req.auth!.accountId },
      orderBy: { updatedAt: 'desc' },
    });
  });

  app.post('/api/templates', async (req, reply) => {
    const b = bodySchema.parse(req.body);
    const exists = await prisma.template.findUnique({
      where: { accountId_name: { accountId: req.auth!.accountId, name: b.name } },
    });
    if (exists) return reply.code(409).send({ error: 'já existe um template com esse nome' });
    return prisma.template.create({
      data: {
        accountId: req.auth!.accountId,
        name: b.name,
        friendlyName: b.friendlyName ?? null,
        category: b.category,
        language: b.language,
        header: b.header ?? null,
        body: b.body,
        footer: b.footer ?? null,
        buttons: b.buttons,
        status: b.status ?? 'draft',
      },
    });
  });

  app.patch('/api/templates/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = bodySchema.partial().parse(req.body);
    const exists = await prisma.template.findFirst({
      where: { id, accountId: req.auth!.accountId },
    });
    if (!exists) return reply.code(404).send({ error: 'template não encontrado' });
    return prisma.template.update({
      where: { id },
      data: {
        ...b,
        friendlyName: b.friendlyName === undefined ? undefined : b.friendlyName ?? null,
        header: b.header === undefined ? undefined : b.header ?? null,
        footer: b.footer === undefined ? undefined : b.footer ?? null,
      },
    });
  });

  // Envia o template para validação na Meta (usa o WABA + token da inbox conectada).
  app.post('/api/templates/:id/submit', async (req, reply) => {
    const { id } = req.params as { id: string };
    const tpl = await prisma.template.findFirst({ where: { id, accountId: req.auth!.accountId } });
    if (!tpl) return reply.code(404).send({ error: 'template não encontrado' });

    if (config.sandbox) {
      return reply.code(400).send({ error: 'WhatsApp em modo sandbox — desative WA_SANDBOX para enviar à Meta.' });
    }

    const inbox = await prisma.inbox.findFirst({
      where: { accountId: req.auth!.accountId },
      orderBy: { createdAt: 'asc' },
    });
    if (!inbox?.wabaId || !inbox?.accessToken) {
      return reply.code(400).send({ error: 'Conecte o WhatsApp (WABA + token) antes de enviar templates.' });
    }

    const input: TemplateInput = {
      name: tpl.name,
      category: tpl.category as TemplateInput['category'],
      language: tpl.language,
      header: tpl.header,
      body: tpl.body,
      footer: tpl.footer,
      buttons: (tpl.buttons as unknown as TemplateInput['buttons']) ?? [],
    };
    const r = await submitTemplate(inbox.wabaId, inbox.accessToken, input);
    if (!r.ok) return reply.code(400).send({ error: r.error ?? 'falha ao enviar à Meta' });

    const updated = await prisma.template.update({
      where: { id: tpl.id },
      data: { status: 'pending', metaTemplateId: r.metaId ?? null },
    });
    return { ok: true, template: updated };
  });

  app.delete('/api/templates/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = await prisma.template.deleteMany({ where: { id, accountId: req.auth!.accountId } });
    if (r.count === 0) return reply.code(404).send({ error: 'template não encontrado' });
    return { ok: true };
  });
}
