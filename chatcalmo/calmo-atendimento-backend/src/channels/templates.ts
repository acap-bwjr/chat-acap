import { request } from 'undici';

// Submissão de templates de mensagem à Meta (WhatsApp Cloud API) e parser do
// webhook de mudança de status (message_template_status_update).
const GRAPH = 'https://graph.facebook.com/v21.0';

interface TplButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string | null;
  phone?: string | null;
}

export interface TemplateInput {
  name: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  language: string;
  header?: string | null;
  body: string;
  footer?: string | null;
  buttons?: TplButton[];
}

// Maior índice de variável {{1}}..{{n}} num texto (0 = sem variáveis).
function maxVar(text: string): number {
  let max = 0;
  for (const m of text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    const n = Number(m[1]);
    if (n > max) max = n;
  }
  return max;
}

/**
 * Cria/submete um template na Meta. A Meta valida de forma assíncrona; o status
 * inicial normalmente é PENDING e o resultado final chega via webhook.
 */
export async function submitTemplate(
  wabaId: string,
  accessToken: string,
  tpl: TemplateInput,
): Promise<{ ok: boolean; metaId?: string; status?: string; error?: string }> {
  const components: Record<string, unknown>[] = [];

  if (tpl.header && tpl.header.trim()) {
    const comp: Record<string, unknown> = { type: 'HEADER', format: 'TEXT', text: tpl.header };
    const n = maxVar(tpl.header);
    if (n > 0) comp.example = { header_text: Array.from({ length: n }, (_, i) => `exemplo${i + 1}`) };
    components.push(comp);
  }

  const body: Record<string, unknown> = { type: 'BODY', text: tpl.body };
  const bn = maxVar(tpl.body);
  if (bn > 0) body.example = { body_text: [Array.from({ length: bn }, (_, i) => `exemplo${i + 1}`)] };
  components.push(body);

  if (tpl.footer && tpl.footer.trim()) components.push({ type: 'FOOTER', text: tpl.footer });

  if (tpl.buttons && tpl.buttons.length) {
    components.push({
      type: 'BUTTONS',
      buttons: tpl.buttons.map((b) =>
        b.type === 'URL'
          ? { type: 'URL', text: b.text, url: b.url ?? '' }
          : b.type === 'PHONE_NUMBER'
            ? { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone ?? '' }
            : { type: 'QUICK_REPLY', text: b.text },
      ),
    });
  }

  try {
    const res = await request(`${GRAPH}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tpl.name, language: tpl.language, category: tpl.category, components }),
    });
    const json = (await res.body.json()) as any;
    if (res.statusCode >= 400) {
      return { ok: false, error: json?.error?.error_user_msg ?? json?.error?.message ?? `HTTP ${res.statusCode}` };
    }
    return { ok: true, metaId: json?.id != null ? String(json.id) : undefined, status: json?.status };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface TemplateStatusUpdate {
  metaId?: string;
  name?: string;
  status: 'approved' | 'rejected' | 'pending';
}

/** Extrai eventos message_template_status_update de um payload de webhook. */
export function parseTemplateStatus(payload: any): TemplateStatusUpdate[] {
  const out: TemplateStatusUpdate[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== 'message_template_status_update') continue;
      const v = change?.value ?? {};
      const ev = String(v?.event ?? '').toUpperCase();
      const status = ev === 'APPROVED' ? 'approved' : ev === 'REJECTED' ? 'rejected' : 'pending';
      out.push({
        metaId: v?.message_template_id != null ? String(v.message_template_id) : undefined,
        name: v?.message_template_name,
        status,
      });
    }
  }
  return out;
}
