import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authGuard } from '../middleware/authGuard.js';
import { emitToAccount } from '../realtime/io.js';

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authGuard);

  // Atualiza dados do contato (nome, e-mail, atributos livres)
  app.patch('/api/contacts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        name: z.string().nullable().optional(),
        email: z.string().email().nullable().optional().or(z.literal('')),
        attributes: z.record(z.any()).optional(),
      })
      .parse(req.body);

    const contact = await prisma.contact.findFirst({
      where: { id, accountId: req.auth!.accountId },
    });
    if (!contact) return reply.code(404).send({ error: 'contato não encontrado' });

    const updated = await prisma.contact.update({
      where: { id },
      data: {
        name: body.name ?? contact.name,
        email: body.email === '' ? null : body.email ?? contact.email,
        attributes: body.attributes ?? (contact.attributes as object) ?? {},
      },
    });
    emitToAccount(req.auth!.accountId, 'conversation:update', { contactId: id });
    return updated;
  });
}
