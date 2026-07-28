import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { parseWebhook } from '../channels/whatsapp.js';
import { parseTemplateStatus } from '../channels/templates.js';
import { ingestInbound } from '../lib/ingest.js';

/**
 * Webhook do WhatsApp Cloud API.
 * GET  = verificação (hub.challenge) que o Meta faz ao cadastrar.
 * POST = mensagens recebidas.
 * A rota carrega o inboxId pra sabermos de qual conta/número é.
 */
export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/webhooks/whatsapp/:inboxId', async (req, reply) => {
    const { inboxId } = req.params as { inboxId: string };
    const q = req.query as Record<string, string>;
    const inbox = await prisma.inbox.findUnique({ where: { id: inboxId } });
    if (
      inbox &&
      q['hub.mode'] === 'subscribe' &&
      q['hub.verify_token'] === inbox.verifyToken
    ) {
      return reply.code(200).send(q['hub.challenge']);
    }
    return reply.code(403).send('forbidden');
  });

  app.post('/api/webhooks/whatsapp/:inboxId', async (req, reply) => {
    const { inboxId } = req.params as { inboxId: string };
    // responde 200 imediatamente (o Meta reentrega se demorar)
    reply.code(200).send('ok');

    const inbox = await prisma.inbox.findUnique({ where: { id: inboxId } });
    if (!inbox) return;

    // Atualização de status de template (aprovado/rejeitado pela Meta).
    for (const s of parseTemplateStatus(req.body)) {
      try {
        const where = s.metaId
          ? { accountId: inbox.accountId, metaTemplateId: s.metaId }
          : s.name
            ? { accountId: inbox.accountId, name: s.name }
            : null;
        if (where) await prisma.template.updateMany({ where, data: { status: s.status } });
      } catch (err) {
        app.log.error({ err }, 'falha ao atualizar status de template');
      }
    }

    const { messages } = parseWebhook(req.body);
    for (const m of messages) {
      try {
        await ingestInbound(inbox, m);
      } catch (err) {
        app.log.error({ err }, 'falha ao processar mensagem recebida');
      }
    }
  });
}
