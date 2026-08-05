import { request } from 'undici';
import { putObject } from '../lib/storage.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

// ---------- ENVIO (nós -> cliente) ----------

interface SendCtx {
  phoneNumberId: string;
  accessToken: string;
  to: string; // E.164 sem "+"
}

async function graphPost(ctx: SendCtx, body: unknown): Promise<{ waMessageId?: string; error?: string }> {
  const res = await request(`${GRAPH}/${ctx.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.body.json()) as any;
  if (res.statusCode >= 400) {
    return { error: json?.error?.message ?? `HTTP ${res.statusCode}` };
  }
  return { waMessageId: json?.messages?.[0]?.id };
}

export function sendText(ctx: SendCtx, text: string, replyToWaId?: string) {
  const body: any = {
    messaging_product: 'whatsapp',
    to: ctx.to,
    type: 'text',
    text: { body: text },
  };
  if (replyToWaId) body.context = { message_id: replyToWaId }; // cita a mensagem no WhatsApp
  return graphPost(ctx, body);
}

/** Envia mídia por link público (a mídia já está no MinIO). */
export function sendMediaByLink(
  ctx: SendCtx,
  kind: 'image' | 'audio' | 'video' | 'document',
  link: string,
  caption?: string,
) {
  const media: any = { link };
  if (caption && kind !== 'audio') media.caption = caption;
  return graphPost(ctx, {
    messaging_product: 'whatsapp',
    to: ctx.to,
    type: kind,
    [kind]: media,
  });
}

/** Reage a uma mensagem do cliente (emoji vazio = remove a reação). */
export function sendReaction(ctx: SendCtx, targetWaId: string, emoji: string) {
  return graphPost(ctx, {
    messaging_product: 'whatsapp',
    to: ctx.to,
    type: 'reaction',
    reaction: { message_id: targetWaId, emoji },
  });
}

export function sendTemplate(
  ctx: SendCtx,
  name: string,
  languageCode: string,
  bodyParams: string[],
) {
  const components = bodyParams.length
    ? [{ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: t })) }]
    : [];
  return graphPost(ctx, {
    messaging_product: 'whatsapp',
    to: ctx.to,
    type: 'template',
    template: { name, language: { code: languageCode }, components },
  });
}

/** Verifica as credenciais consultando os dados do número na Graph API. */
export async function verifyNumber(
  phoneNumberId: string,
  accessToken: string,
): Promise<{ ok: boolean; displayPhoneNumber?: string; verifiedName?: string; error?: string }> {
  try {
    const res = await request(`${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = (await res.body.json()) as any;
    if (res.statusCode >= 400) return { ok: false, error: json?.error?.message ?? `HTTP ${res.statusCode}` };
    return { ok: true, displayPhoneNumber: json?.display_phone_number, verifiedName: json?.verified_name };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------- RECEBIMENTO (cliente -> nós) ----------

export interface ParsedInbound {
  waMessageId: string;
  from: string; // telefone do cliente
  contactName?: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'file' | 'location' | 'reaction';
  text?: string;
  mediaId?: string; // id da mídia no Meta (baixar depois)
  mediaMime?: string;
  contextId?: string; // wamid da mensagem citada (quando é uma resposta)
  reactionEmoji?: string; // emoji da reação (vazio = reação removida)
  reactionTargetWaId?: string; // wamid da mensagem que recebeu a reação
}

/** Extrai as mensagens recebidas de um payload de webhook do Meta. */
export function parseWebhook(payload: any): { phoneNumberId?: string; messages: ParsedInbound[] } {
  const out: ParsedInbound[] = [];
  let phoneNumberId: string | undefined;

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      if (!value) continue;
      phoneNumberId = value?.metadata?.phone_number_id ?? phoneNumberId;

      const nameByWa: Record<string, string> = {};
      for (const c of value?.contacts ?? []) {
        if (c?.wa_id) nameByWa[c.wa_id] = c?.profile?.name ?? '';
      }

      for (const m of value?.messages ?? []) {
        const base = {
          waMessageId: m.id as string,
          from: m.from as string,
          contactName: nameByWa[m.from],
          contextId: m.context?.id as string | undefined, // resposta a outra mensagem
        };
        if (m.type === 'text') {
          out.push({ ...base, type: 'text', text: m.text?.body });
        } else if (m.type === 'image') {
          out.push({ ...base, type: 'image', mediaId: m.image?.id, mediaMime: m.image?.mime_type, text: m.image?.caption });
        } else if (m.type === 'audio') {
          out.push({ ...base, type: 'audio', mediaId: m.audio?.id, mediaMime: m.audio?.mime_type });
        } else if (m.type === 'video') {
          out.push({ ...base, type: 'video', mediaId: m.video?.id, mediaMime: m.video?.mime_type, text: m.video?.caption });
        } else if (m.type === 'document') {
          out.push({ ...base, type: 'file', mediaId: m.document?.id, mediaMime: m.document?.mime_type, text: m.document?.filename });
        } else if (m.type === 'location') {
          out.push({ ...base, type: 'location', text: `${m.location?.latitude},${m.location?.longitude}` });
        } else if (m.type === 'reaction') {
          out.push({
            ...base,
            type: 'reaction',
            reactionEmoji: m.reaction?.emoji ?? '',
            reactionTargetWaId: m.reaction?.message_id,
          });
        } else {
          // tipos não suportados viram texto informativo
          out.push({ ...base, type: 'text', text: `[mensagem do tipo ${m.type} não suportada]` });
        }
      }
    }
  }
  return { phoneNumberId, messages: out };
}

/**
 * Baixa a mídia do Meta e sobe pro MinIO, devolvendo a URL pública.
 * O áudio de voz do WhatsApp vem como audio/ogg (codec opus) — normalizamos
 * o content-type pra audio/ogg pra tocar no navegador.
 */
export async function downloadMediaToStorage(
  mediaId: string,
  accessToken: string,
  keyPrefix: string,
): Promise<{ url: string; mime: string } | null> {
  // 1) pega a URL temporária da mídia
  const metaRes = await request(`${GRAPH}/${mediaId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (metaRes.statusCode >= 400) return null;
  const meta = (await metaRes.body.json()) as any;
  const url: string | undefined = meta?.url;
  let mime: string = meta?.mime_type ?? 'application/octet-stream';
  if (!url) return null;

  // 2) baixa o binário (precisa do Bearer também)
  const binRes = await request(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (binRes.statusCode >= 400) return null;
  const buf = Buffer.from(await binRes.body.arrayBuffer());

  if (mime === 'audio/opus') mime = 'audio/ogg';
  const ext = mime.split('/')[1]?.split(';')[0] ?? 'bin';
  const publicUrl = await putObject(`${keyPrefix}/${mediaId}.${ext}`, buf, mime);
  return { url: publicUrl, mime };
}
