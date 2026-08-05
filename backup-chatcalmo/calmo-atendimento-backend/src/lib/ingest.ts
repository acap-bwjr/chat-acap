import { prisma } from './prisma.js';
import { emitToAccount } from '../realtime/io.js';
import { downloadMediaToStorage, type ParsedInbound } from '../channels/whatsapp.js';
import type { MessageType } from '@prisma/client';
import { config } from '../config.js';

const WINDOW_MS = 24 * 60 * 60 * 1000;

const TYPE_MAP: Record<Exclude<ParsedInbound['type'], 'reaction'>, MessageType> = {
  text: 'text',
  image: 'image',
  audio: 'audio',
  video: 'video',
  file: 'file',
  location: 'location',
};

/** Reação (emoji) do cliente numa mensagem: aplica o emoji na própria mensagem-alvo. */
async function applyReaction(accountId: string, msg: ParsedInbound): Promise<void> {
  if (!msg.reactionTargetWaId) return;
  const target = await prisma.message.findUnique({
    where: { waMessageId: msg.reactionTargetWaId },
    select: { id: true, conversationId: true },
  });
  if (!target) return; // mensagem reagida não está no nosso sistema
  const emoji = msg.reactionEmoji && msg.reactionEmoji.trim() ? msg.reactionEmoji : null; // vazio = removeu
  await prisma.message.update({ where: { id: target.id }, data: { reactionEmoji: emoji } });
  emitToAccount(accountId, 'message:reaction', {
    conversationId: target.conversationId,
    messageId: target.id,
    emoji,
  });
}

/**
 * Processa UMA mensagem recebida do WhatsApp:
 * acha/cria contato + conversa, baixa mídia, grava a mensagem e avisa o front.
 * Idempotente por waMessageId (o Meta reentrega webhooks).
 */
export async function ingestInbound(inbox: {
  id: string;
  accountId: string;
  accessToken: string | null;
}, msg: ParsedInbound): Promise<void> {
  // reação (emoji): não é uma mensagem nova — aplica na mensagem-alvo e sai
  if (msg.type === 'reaction') {
    await applyReaction(inbox.accountId, msg);
    return;
  }

  // dedupe: se já gravamos essa mensagem, ignora
  const dup = await prisma.message.findUnique({ where: { waMessageId: msg.waMessageId } });
  if (dup) return;

  // contato (por telefone dentro da conta)
  const contact = await prisma.contact.upsert({
    where: { accountId_phone: { accountId: inbox.accountId, phone: msg.from } },
    update: msg.contactName ? { name: msg.contactName } : {},
    create: { accountId: inbox.accountId, phone: msg.from, name: msg.contactName ?? null },
  });

  // Contato bloqueado: descarta a mensagem recebida (não cria conversa nem notifica).
  if (contact.blocked) return;

  // conversa: reusa a conversa aberta/pendente mais recente, senão cria
  let conversation = await prisma.conversation.findFirst({
    where: {
      accountId: inbox.accountId,
      contactId: contact.id,
      inboxId: inbox.id,
      status: { in: ['open', 'pending'] },
    },
    orderBy: { lastMessageAt: 'desc' },
  });
  const windowUntil = new Date(Date.now() + WINDOW_MS);
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        accountId: inbox.accountId,
        inboxId: inbox.id,
        contactId: contact.id,
        status: 'pending',
        lastMessageAt: new Date(),
        waWindowUntil: windowUntil,
      },
    });
  }

  // mídia -> MinIO
  let mediaUrl: string | null = null;
  let mediaMime: string | null = msg.mediaMime ?? null;
  if (msg.mediaId && inbox.accessToken) {
    const stored = await downloadMediaToStorage(
      msg.mediaId,
      inbox.accessToken,
      `${inbox.accountId}/${conversation.id}`,
    );
    if (stored) {
      mediaUrl = stored.url;
      mediaMime = stored.mime;
    }
  }

  // resposta/citação: acha a mensagem citada pelo wamid
  let replyToId: string | null = null;
  if (msg.contextId) {
    const quoted = await prisma.message.findUnique({
      where: { waMessageId: msg.contextId },
      select: { id: true },
    });
    replyToId = quoted?.id ?? null;
  }

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'in',
      senderType: 'contact',
      type: TYPE_MAP[msg.type],
      content: msg.text ?? null,
      mediaUrl,
      mediaMime,
      waMessageId: msg.waMessageId,
      status: 'delivered',
      replyToId,
    },
    include: {
      replyTo: {
        select: { id: true, content: true, type: true, direction: true, senderType: true, mediaUrl: true },
      },
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), waWindowUntil: windowUntil, unreadCount: { increment: 1 } },
  });

  emitToAccount(inbox.accountId, 'message:new', {
    conversationId: conversation.id,
    message,
    contact,
  });

  // Dispara a Cecília (n8n) — fire-and-forget, nunca bloqueia o recebimento.
  // Só para conversas SEM atendente humano: assim que alguém assume, o bot cala.
  if (config.cecilia.webhookUrl && !conversation.assigneeId) {
    fetch(config.cecilia.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event: 'message_created',
        messageType: 'incoming',
        conversationId: conversation.id,
        accountId: inbox.accountId,
        content: message.content,
        type: message.type,
        mediaUrl: message.mediaUrl,
        contact: { id: contact.id, name: contact.name, phone: contact.phone },
      }),
    }).catch(() => {});
  }
}
