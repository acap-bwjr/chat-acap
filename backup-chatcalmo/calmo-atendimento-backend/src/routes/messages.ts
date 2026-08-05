import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authGuard } from '../middleware/authGuard.js';
import { emitToAccount } from '../realtime/io.js';
import { putObject } from '../lib/storage.js';
import { sendText, sendMediaByLink, sendReaction } from '../channels/whatsapp.js';
import { config } from '../config.js';
import type { MessageType } from '@prisma/client';
import { spawn } from 'node:child_process';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Converte áudio (ex.: WebM/Opus gravado pelo Chrome) para OGG/Opus — formato de
// mensagem de voz aceito pela WhatsApp Cloud API. Usa ffmpeg (instalado no container).
async function toOggOpus(input: Buffer): Promise<Buffer> {
  const base = join(tmpdir(), `wa-audio-${Date.now()}-${Math.round(Math.random() * 1e9)}`);
  const inPath = `${base}.in`;
  const outPath = `${base}.ogg`;
  await writeFile(inPath, input);
  try {
    await new Promise<void>((resolve, reject) => {
      // IMPORTANTE: consumir a stderr (senão o pipe enche e o ffmpeg trava/timeout).
      const ff = spawn(
        'ffmpeg',
        ['-y', '-i', inPath, '-vn', '-ac', '1', '-c:a', 'libopus', '-b:a', '32k', '-f', 'ogg', outPath],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );
      let err = '';
      ff.stderr?.on('data', (d) => {
        err += d.toString();
      });
      const killer = setTimeout(() => ff.kill('SIGKILL'), 20_000);
      ff.on('error', (e) => {
        clearTimeout(killer);
        reject(e);
      });
      ff.on('close', (code) => {
        clearTimeout(killer);
        code === 0 ? resolve() : reject(new Error(`ffmpeg código ${code}: ${err.slice(-300)}`));
      });
    });
    return await readFile(outPath);
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}

/** True quando não devemos chamar o WhatsApp de verdade (modo teste). */
function isSandbox(inbox: { phoneNumberId: string | null; accessToken: string | null }): boolean {
  return config.sandbox || !inbox.phoneNumberId || !inbox.accessToken;
}

async function loadConvForSend(accountId: string, conversationId: string) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, accountId },
    include: { contact: true, inbox: true },
  });
}

function mimeToKind(mime: string): { kind: 'image' | 'audio' | 'video' | 'document'; type: MessageType } {
  if (mime.startsWith('image/')) return { kind: 'image', type: 'image' };
  if (mime.startsWith('audio/')) return { kind: 'audio', type: 'audio' };
  if (mime.startsWith('video/')) return { kind: 'video', type: 'video' };
  return { kind: 'document', type: 'file' };
}

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authGuard);

  // Enviar texto OU criar nota privada (não vai pro cliente)
  app.post('/api/conversations/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({ content: z.string().min(1), isPrivate: z.boolean().optional(), replyToId: z.string().optional() })
      .parse(req.body);
    const conv = await loadConvForSend(req.auth!.accountId, id);
    if (!conv) return reply.code(404).send({ error: 'conversa não encontrada' });

    // mensagem citada (responder): pega o wamid da mensagem original
    let replyToWaId: string | undefined;
    if (body.replyToId) {
      const q = await prisma.message.findFirst({
        where: { id: body.replyToId, conversationId: id },
        select: { waMessageId: true },
      });
      replyToWaId = q?.waMessageId ?? undefined;
    }

    let waMessageId: string | undefined;

    if (!body.isPrivate) {
      if (isSandbox(conv.inbox)) {
        waMessageId = `sandbox-${Date.now()}`;
      } else {
        if (!conv.contact.phone) {
          return reply.code(400).send({ error: 'contato sem telefone' });
        }
        const r = await sendText(
          { phoneNumberId: conv.inbox.phoneNumberId!, accessToken: conv.inbox.accessToken!, to: conv.contact.phone },
          body.content,
          replyToWaId,
        );
        if (r.error) return reply.code(502).send({ error: `WhatsApp: ${r.error}` });
        waMessageId = r.waMessageId;
      }
    }

    const message = await prisma.message.create({
      data: {
        conversationId: id,
        direction: 'out',
        senderType: 'agent',
        agentSenderId: req.auth!.isBot ? null : req.auth!.userId,
        type: 'text',
        content: body.content,
        isPrivate: body.isPrivate ?? false,
        waMessageId,
        status: 'sent',
        replyToId: body.replyToId ?? null,
      },
      include: {
        agentSender: { select: { id: true, name: true } },
        replyTo: {
          select: { id: true, content: true, type: true, direction: true, senderType: true, mediaUrl: true },
        },
      },
    });

    await prisma.conversation.update({
      where: { id },
      data: { lastMessageAt: new Date(), status: conv.status === 'pending' ? 'open' : conv.status },
    });
    emitToAccount(req.auth!.accountId, 'message:new', { conversationId: id, message });
    return message;
  });

  // Enviar mídia (multipart): sobe pro MinIO e manda por link
  app.post('/api/conversations/:id/media', async (req, reply) => {
    const { id } = req.params as { id: string };
    const conv = await loadConvForSend(req.auth!.accountId, id);
    if (!conv) return reply.code(404).send({ error: 'conversa não encontrada' });
    if (!conv.inbox.phoneNumberId || !conv.inbox.accessToken || !conv.contact.phone) {
      return reply.code(400).send({ error: 'inbox sem credenciais WhatsApp ou contato sem telefone' });
    }

    const file = await (req as any).file();
    if (!file) return reply.code(400).send({ error: 'arquivo ausente' });
    let buf = await file.toBuffer();
    let mime: string = file.mimetype ?? 'application/octet-stream';
    const caption: string | undefined = (file.fields?.caption?.value as string) || undefined;

    // Áudio de voz: se não estiver num formato aceito pela Meta (ex.: WebM do Chrome),
    // converte pra OGG/Opus (mensagem de voz).
    if (
      mime.startsWith('audio/') &&
      !['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr'].includes(mime)
    ) {
      try {
        buf = await toOggOpus(buf);
        mime = 'audio/ogg';
      } catch (e) {
        return reply.code(500).send({ error: `falha ao converter áudio: ${(e as Error).message}` });
      }
    }

    const ext =
      mime === 'audio/ogg' ? 'ogg' : (file.filename?.split('.').pop() ?? mime.split('/')[1] ?? 'bin').toLowerCase();
    const key = `${req.auth!.accountId}/${id}/out-${Date.now()}.${ext}`;
    const url = await putObject(key, buf, mime);

    const { kind, type } = mimeToKind(mime);
    const r = await sendMediaByLink(
      { phoneNumberId: conv.inbox.phoneNumberId, accessToken: conv.inbox.accessToken, to: conv.contact.phone },
      kind,
      url,
      caption,
    );
    if (r.error) return reply.code(502).send({ error: `WhatsApp: ${r.error}` });

    const message = await prisma.message.create({
      data: {
        conversationId: id,
        direction: 'out',
        senderType: 'agent',
        agentSenderId: req.auth!.isBot ? null : req.auth!.userId,
        type,
        content: caption ?? null,
        mediaUrl: url,
        mediaMime: mime,
        mediaName: file.filename ?? null,
        waMessageId: r.waMessageId,
        status: 'sent',
      },
      include: { agentSender: { select: { id: true, name: true } } },
    });
    await prisma.conversation.update({
      where: { id },
      data: { lastMessageAt: new Date(), status: conv.status === 'pending' ? 'open' : conv.status },
    });
    emitToAccount(req.auth!.accountId, 'message:new', { conversationId: id, message });
    return message;
  });

  // Reagir a uma mensagem do cliente (emoji vazio = remover)
  app.post('/api/messages/:id/reaction', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ emoji: z.string() }).parse(req.body);
    const msg = await prisma.message.findFirst({
      where: { id, conversation: { accountId: req.auth!.accountId } },
      include: { conversation: { include: { contact: true, inbox: true } } },
    });
    if (!msg) return reply.code(404).send({ error: 'mensagem não encontrada' });
    if (msg.direction !== 'in') return reply.code(400).send({ error: 'só dá pra reagir a mensagens do cliente' });

    const conv = msg.conversation;
    if (!isSandbox(conv.inbox)) {
      if (!msg.waMessageId) return reply.code(400).send({ error: 'mensagem sem id do WhatsApp' });
      if (!conv.contact.phone) return reply.code(400).send({ error: 'contato sem telefone' });
      const r = await sendReaction(
        { phoneNumberId: conv.inbox.phoneNumberId!, accessToken: conv.inbox.accessToken!, to: conv.contact.phone },
        msg.waMessageId,
        body.emoji,
      );
      if (r.error) return reply.code(502).send({ error: `WhatsApp: ${r.error}` });
    }

    const emoji = body.emoji.trim() ? body.emoji : null;
    await prisma.message.update({ where: { id }, data: { reactionEmoji: emoji } });
    emitToAccount(req.auth!.accountId, 'message:reaction', { conversationId: conv.id, messageId: id, emoji });
    return { ok: true, emoji };
  });
}
