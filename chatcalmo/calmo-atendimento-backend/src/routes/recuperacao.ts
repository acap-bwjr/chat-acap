import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { authGuard } from '../middleware/authGuard.js';

// ============================================================
// Recuperação de carrinho — integração com a Nuvemshop.
// Implementação própria (clean-room), escrita a partir dos requisitos:
//  - guardar as credenciais da loja no servidor (token nunca vai ao browser);
//  - listar os carrinhos abandonados normalizados para o painel;
//  - devolver métricas (quantidade e valor potencial).
// ============================================================

const API = 'https://api.tiendanube.com/v1';
// A Nuvemshop exige um User-Agent identificando a aplicação.
const UA = 'Calmo Recuperacao (contato@calmo.com.br)';

/** Chamada autenticada na API da Nuvemshop. */
async function nuvemshop(storeId: string, token: string, caminho: string): Promise<unknown> {
  const res = await fetch(`${API}/${storeId}/${caminho}`, {
    headers: {
      Authentication: `bearer ${token}`, // a Nuvemshop usa "Authentication", não "Authorization"
      'User-Agent': UA,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const corpo = await res.text().catch(() => '');
    throw new Error(`Nuvemshop ${res.status}: ${corpo.slice(0, 200)}`);
  }
  return res.json();
}

// ---- Normalização: a API traz muitos campos; o painel só precisa destes. ----
type Carrinho = {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  total: number;
  moeda: string;
  itens: { nome: string; quantidade: number }[];
  qtdItens: number;
  criadoEm: string | null;
  atualizadoEm: string | null;
  linkCarrinho: string | null;
  concluido: boolean;
};

const numero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** Pega o primeiro valor não-vazio entre vários caminhos possíveis. */
function primeiro(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function normalizar(c: any): Carrinho {
  const cliente = c?.customer ?? {};
  const endereco = c?.billing_address ?? c?.shipping_address ?? {};
  const produtos: any[] = Array.isArray(c?.products) ? c.products : [];

  return {
    id: String(c?.id ?? c?.token ?? ''),
    nome: primeiro(c?.contact_name, cliente?.name, endereco?.name),
    telefone: primeiro(c?.contact_phone, cliente?.phone, endereco?.phone),
    email: primeiro(c?.contact_email, cliente?.email),
    total: numero(c?.total ?? c?.subtotal),
    moeda: String(c?.currency ?? 'BRL'),
    itens: produtos.map((p) => ({
      nome: String(p?.name ?? p?.title ?? 'Item'),
      quantidade: Number(p?.quantity ?? 1),
    })),
    qtdItens: produtos.reduce((s, p) => s + Number(p?.quantity ?? 1), 0),
    criadoEm: primeiro(c?.created_at),
    atualizadoEm: primeiro(c?.updated_at),
    linkCarrinho: primeiro(c?.abandoned_checkout_url, c?.checkout_url),
    concluido: Boolean(c?.completed_at),
  };
}

// ---- OAuth da Nuvemshop (conexão em 1 clique) ----
const APP_ID = process.env.NUVEMSHOP_APP_ID ?? '';
const CLIENT_SECRET = process.env.NUVEMSHOP_CLIENT_SECRET ?? '';
const OAUTH_AUTORIZAR = (appId: string, state: string) =>
  `https://www.nuvemshop.com.br/apps/${appId}/authorize?state=${encodeURIComponent(state)}`;
const OAUTH_TOKEN = 'https://www.nuvemshop.com.br/apps/authorize/token';

/** URL pública do app (usada para voltar do OAuth). */
const baseApp = () => (process.env.PUBLIC_BASE_URL || 'https://chatcalmo.provai.ia.br').replace(/\/$/, '');

type EstadoOAuth = { accountId: string; proposito: 'nuvemshop_oauth' };

/**
 * Rotas SEM autenticação: o callback do OAuth é uma navegação do navegador
 * vinda da Nuvemshop, então não carrega o header Authorization. A segurança
 * vem do `state` (JWT curto assinado por nós, com o accountId dentro).
 */
export async function recuperacaoOAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/recuperacao/oauth/callback', async (req, reply) => {
    const q = req.query as { code?: string; state?: string; error?: string };
    const voltar = (params: string) => reply.redirect(`${baseApp()}/?recuperacao=${params}`);

    if (q.error) return voltar(`erro&motivo=${encodeURIComponent(q.error)}`);
    if (!q.code || !q.state) return voltar('erro&motivo=faltou_code');

    let estado: EstadoOAuth;
    try {
      estado = jwt.verify(q.state, config.jwtSecret) as EstadoOAuth;
      if (estado.proposito !== 'nuvemshop_oauth') throw new Error('state inválido');
    } catch {
      return voltar('erro&motivo=state_invalido');
    }

    try {
      // Troca o code pelo access_token (o secret nunca sai daqui).
      const res = await fetch(OAUTH_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify({
          client_id: APP_ID,
          client_secret: CLIENT_SECRET,
          grant_type: 'authorization_code',
          code: q.code,
        }),
      });
      const dados: any = await res.json();
      if (!res.ok || !dados?.access_token) {
        return voltar(`erro&motivo=${encodeURIComponent(dados?.error ?? 'falha_token')}`);
      }

      const storeId = String(dados.user_id ?? dados.store_id ?? '');
      const accessToken = String(dados.access_token);

      // Busca o nome da loja (também valida o token recém-obtido).
      let storeName: string | null = null;
      try {
        const info: any = await nuvemshop(storeId, accessToken, 'store');
        storeName = primeiro(info?.name?.pt, info?.name?.es, info?.name?.en, info?.name);
      } catch {
        /* nome é opcional */
      }

      await prisma.lojaNuvemshop.upsert({
        where: { accountId: estado.accountId },
        update: { storeId, accessToken, storeName, ultimoErro: null, updatedAt: new Date() },
        create: { accountId: estado.accountId, storeId, accessToken, storeName },
      });
      return voltar('conectada');
    } catch (e) {
      return voltar(`erro&motivo=${encodeURIComponent((e as Error).message.slice(0, 80))}`);
    }
  });
}

export async function recuperacaoRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authGuard);

  /** Gera o link de autorização da Nuvemshop (só ADM). */
  app.get('/api/recuperacao/oauth/iniciar', async (req, reply) => {
    if (req.auth!.role !== 'admin') return reply.code(403).send({ error: 'somente administradores' });
    if (!APP_ID || !CLIENT_SECRET) {
      return reply.code(400).send({ error: 'App da Nuvemshop ainda não configurado no servidor.' });
    }
    const state = jwt.sign(
      { accountId: req.auth!.accountId, proposito: 'nuvemshop_oauth' } satisfies EstadoOAuth,
      config.jwtSecret,
      { expiresIn: '15m' },
    );
    return { url: OAUTH_AUTORIZAR(APP_ID, state) };
  });

  /** Situação da conexão com a loja (sem expor o token). */
  app.get('/api/recuperacao/loja', async (req) => {
    const loja = await prisma.lojaNuvemshop.findUnique({ where: { accountId: req.auth!.accountId } });
    if (!loja) return { conectada: false };
    return {
      conectada: true,
      storeId: loja.storeId,
      storeName: loja.storeName,
      ultimoErro: loja.ultimoErro,
      conectadaEm: loja.createdAt,
    };
  });

  /** Conecta/atualiza a loja. Valida o token antes de salvar. */
  app.post('/api/recuperacao/loja', async (req, reply) => {
    if (req.auth!.role !== 'admin') return reply.code(403).send({ error: 'somente administradores' });
    const body = z
      .object({ storeId: z.string().trim().min(1), accessToken: z.string().trim().min(10) })
      .parse(req.body);

    // Confere as credenciais buscando os dados da loja.
    let storeName: string | null = null;
    try {
      const info: any = await nuvemshop(body.storeId, body.accessToken, 'store');
      storeName = primeiro(info?.name?.pt, info?.name?.es, info?.name?.en, info?.name);
    } catch (e) {
      return reply.code(400).send({ error: 'Não foi possível conectar: ' + (e as Error).message });
    }

    const accountId = req.auth!.accountId;
    const dados = { storeId: body.storeId, accessToken: body.accessToken, storeName, ultimoErro: null };
    await prisma.lojaNuvemshop.upsert({
      where: { accountId },
      update: { ...dados, updatedAt: new Date() },
      create: { accountId, ...dados },
    });
    return { ok: true, storeName };
  });

  /** Desconecta a loja. */
  app.delete('/api/recuperacao/loja', async (req, reply) => {
    if (req.auth!.role !== 'admin') return reply.code(403).send({ error: 'somente administradores' });
    await prisma.lojaNuvemshop.deleteMany({ where: { accountId: req.auth!.accountId } });
    return { ok: true };
  });

  /**
   * Consulta um PEDIDO pelo número e devolve o rastreio.
   * Usado pela Clara (chave de bot) na triagem "Código de Rastreio".
   */
  app.get('/api/nuvemshop/pedido', async (req, reply) => {
    const q = z.object({ numero: z.string().trim().min(1) }).parse(req.query);
    const loja = await prisma.lojaNuvemshop.findUnique({ where: { accountId: req.auth!.accountId } });
    if (!loja) return reply.code(400).send({ error: 'nenhuma loja conectada' });

    const numero = q.numero.replace(/\D/g, '');
    try {
      const lista = await nuvemshop(loja.storeId, loja.accessToken, `orders?q=${encodeURIComponent(numero)}&per_page=50`);
      const pedidos: any[] = Array.isArray(lista) ? lista : [];
      const pedido = pedidos.find((p) => String(p?.number) === numero) ?? pedidos[0];
      if (!pedido) return { encontrado: false };

      // O rastreio pode estar no pedido ou dentro de fulfillments.
      const fulfillments: any[] = Array.isArray(pedido?.fulfillments) ? pedido.fulfillments : [];
      const doFulfillment = fulfillments.find((f) => f?.tracking_info?.code || f?.tracking_code);
      const codigo = primeiro(
        pedido?.shipping_tracking_number,
        doFulfillment?.tracking_info?.code,
        doFulfillment?.tracking_code,
      );
      const url = primeiro(
        pedido?.shipping_tracking_url,
        doFulfillment?.tracking_info?.url,
        doFulfillment?.tracking_url,
      );

      return {
        encontrado: true,
        numero: String(pedido?.number ?? numero),
        status: primeiro(pedido?.status),
        statusEnvio: primeiro(pedido?.shipping_status, pedido?.fulfillment_status),
        cliente: primeiro(pedido?.customer?.name, pedido?.contact_name),
        codigoRastreio: codigo,
        urlRastreio: url,
      };
    } catch (e) {
      return reply.code(502).send({ error: 'Falha ao consultar o pedido: ' + (e as Error).message });
    }
  });

  /** Carrinhos abandonados + métricas. */
  app.get('/api/recuperacao/carrinhos', async (req, reply) => {
    const loja = await prisma.lojaNuvemshop.findUnique({ where: { accountId: req.auth!.accountId } });
    if (!loja) return reply.code(400).send({ error: 'nenhuma loja conectada' });

    const q = z
      .object({ dias: z.coerce.number().min(1).max(365).optional(), pagina: z.coerce.number().min(1).optional() })
      .parse(req.query);
    const dias = q.dias ?? 30;
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

    try {
      const params = new URLSearchParams({ created_at_min: desde, per_page: '200', page: String(q.pagina ?? 1) });
      const lista = await nuvemshop(loja.storeId, loja.accessToken, `checkouts?${params}`);
      const brutos: any[] = Array.isArray(lista) ? lista : [];

      // Abandonado = ainda não concluído.
      const carrinhos = brutos.map(normalizar).filter((c) => !c.concluido && c.id);
      carrinhos.sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''));

      const valorPotencial = carrinhos.reduce((s, c) => s + c.total, 0);
      const comContato = carrinhos.filter((c) => c.telefone || c.email).length;

      if (loja.ultimoErro) {
        await prisma.lojaNuvemshop.update({ where: { accountId: loja.accountId }, data: { ultimoErro: null } });
      }
      return {
        carrinhos,
        metricas: {
          total: carrinhos.length,
          valorPotencial,
          comContato,
          ticketMedio: carrinhos.length ? valorPotencial / carrinhos.length : 0,
        },
      };
    } catch (e) {
      const msg = (e as Error).message;
      await prisma.lojaNuvemshop.update({ where: { accountId: loja.accountId }, data: { ultimoErro: msg } });
      return reply.code(502).send({ error: 'Falha ao buscar na Nuvemshop: ' + msg });
    }
  });
}
