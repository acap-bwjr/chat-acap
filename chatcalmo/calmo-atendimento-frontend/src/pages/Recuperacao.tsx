import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShoppingCartSimple, WhatsappLogo, ArrowClockwise, Plug, MagnifyingGlass } from '@phosphor-icons/react';
import { api, type User } from '../lib/api';
import { supabase } from '../prospeccao/lib/supabase';
import { formatarTelefone, paraWhatsapp as paraWaCRM } from '../prospeccao/lib/telefone';

/** Responsáveis que podem receber os carrinhos enviados ao CRM. */
const RESPONSAVEIS: string[] = [];

// Recuperação de carrinho (Nuvemshop) — implementação própria.
// O token da loja fica no servidor; aqui só consumimos /api/recuperacao/*.

interface Carrinho {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  total: number;
  moeda: string;
  itens: { nome: string; quantidade: number }[];
  qtdItens: number;
  criadoEm: string | null;
  linkCarrinho: string | null;
}
interface Metricas {
  total: number;
  valorPotencial: number;
  comContato: number;
  ticketMedio: number;
}
interface Loja {
  conectada: boolean;
  storeId?: string;
  storeName?: string | null;
  ultimoErro?: string | null;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Só dígitos + DDI 55 quando for número brasileiro (10/11 dígitos). */
function paraWhatsapp(raw?: string | null): string {
  const d = (raw ?? '').replace(/\D/g, '');
  if (d.length < 10) return '';
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

function tempoAtras(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60000))} min atrás`;
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d} dia${d > 1 ? 's' : ''} atrás`;
}

export default function Recuperacao({
  user,
  oauth,
}: {
  user: User;
  oauth?: { ok: boolean; motivo?: string } | null;
}) {
  const [loja, setLoja] = useState<Loja | null>(null);
  const [carrinhos, setCarrinhos] = useState<Carrinho[]>([]);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [dias, setDias] = useState(30);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [respLote, setRespLote] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [loteMsg, setLoteMsg] = useState('');
  const [jaNoCrm, setJaNoCrm] = useState<Set<string>>(new Set());
  const isAdmin = user.role === 'admin';

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const l = await api.get<Loja>('/api/recuperacao/loja');
      setLoja(l);
      if (l.conectada) {
        const r = await api.get<{ carrinhos: Carrinho[]; metricas: Metricas }>(
          `/api/recuperacao/carrinhos?dias=${dias}`,
        );
        setCarrinhos(r.carrinhos);
        setMetricas(r.metricas);
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [dias]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return carrinhos;
    return carrinhos.filter((c) =>
      [c.nome, c.email, c.telefone, ...c.itens.map((i) => i.nome)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(t),
    );
  }, [carrinhos, busca]);

  // Chave única do carrinho no CRM (a tabela leads é centrada na coluna "instagram").
  const chaveCrm = (c: Carrinho) => `carrinho:${c.id}`;

  // Marca quais carrinhos já foram enviados ao CRM.
  useEffect(() => {
    if (!carrinhos.length) return;
    supabase
      .from('leads')
      .select('instagram')
      .like('instagram', 'carrinho:%')
      .limit(10000)
      .then(({ data }) => {
        setJaNoCrm(new Set((data ?? []).map((l: { instagram: string }) => l.instagram)));
      });
  }, [carrinhos]);

  const estaNoCrm = (c: Carrinho) => jaNoCrm.has(chaveCrm(c));

  function alternar(id: string) {
    setSelecionados((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const selecionaveis = filtrados.filter((c) => !estaNoCrm(c));
  const todosMarcados = selecionaveis.length > 0 && selecionaveis.every((c) => selecionados.has(c.id));

  /** Envia os carrinhos selecionados ao CRM, sempre na etapa "Carrinho Abandonado". */
  async function enviarAoCrm() {
    const alvo = filtrados.filter((c) => selecionados.has(c.id) && !estaNoCrm(c));
    if (!alvo.length) return;
    setEnviando(true);
    setLoteMsg('');
    try {
      const linhas = alvo.map((c) => ({
        instagram: chaveCrm(c),
        nome_loja: c.nome,
        telefone: formatarTelefone(c.telefone),
        whatsapp: paraWaCRM(c.telefone),
        email: c.email,
        site: c.linkCarrinho,
        fonte_oportunidade: 'Carrinho Abandonado',
        plataforma: 'nuvemshop',
        status: 'carrinho_abandonado', // sempre nesta etapa
        notas: `Carrinho de ${brl(c.total)} · ${c.qtdItens} item(ns)${c.itens[0] ? ': ' + c.itens.map((i) => `${i.quantidade}x ${i.nome}`).join(', ') : ''}`,
        ...(respLote ? { responsavel: respLote } : {}),
      }));
      const { error } = await supabase.from('leads').upsert(linhas, { onConflict: 'instagram' });
      if (error) throw error;
      setJaNoCrm((prev) => new Set([...prev, ...alvo.map(chaveCrm)]));
      setSelecionados(new Set());
      setLoteMsg(`✓ ${alvo.length} carrinho(s) enviado(s) ao CRM na etapa "Carrinho Abandonado".`);
    } catch (e) {
      setLoteMsg('Erro ao enviar: ' + (e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  function mensagemRecuperacao(c: Carrinho): string {
    const primeiroNome = (c.nome ?? '').split(/\s+/)[0];
    const saudacao = primeiroNome ? `Oi, ${primeiroNome}!` : 'Oi!';
    const item = c.itens[0]?.nome;
    const sobre = item ? ` Vi que você separou ${item}${c.itens.length > 1 ? ' e mais itens' : ''}` : ' Vi que você deixou itens no carrinho';
    const link = c.linkCarrinho ? `\n\nÉ só finalizar por aqui: ${c.linkCarrinho}` : '';
    return `${saudacao} Aqui é da Calmô.${sobre} e não chegou a concluir a compra. Posso te ajudar a finalizar?${link}`;
  }

  if (carregando && !loja) {
    return <div className="grid h-full place-items-center bg-app text-faint">Carregando…</div>;
  }

  // ---------- Sem loja conectada ----------
  if (loja && !loja.conectada) {
    return <TelaConectar isAdmin={isAdmin} onConectado={carregar} />;
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Recuperação de carrinho</h1>
          <p className="text-sm text-faint">
            Carrinhos abandonados da loja{' '}
            <span className="text-sub">{loja?.storeName || loja?.storeId}</span> · últimos {dias} dias
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className="pv-input w-auto py-1.5 text-xs"
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
          <button onClick={carregar} disabled={carregando} className="pv-btn-ghost py-1.5 text-xs">
            <ArrowClockwise size={14} className={carregando ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </header>

      {oauth && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            oauth.ok
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/25 bg-red-500/10 text-red-400'
          }`}
        >
          {oauth.ok ? 'Loja conectada com sucesso!' : `Não foi possível conectar${oauth.motivo ? `: ${oauth.motivo}` : ''}.`}
        </div>
      )}
      {erro && (
        <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {erro}
        </div>
      )}

      {/* Métricas */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Carrinhos abandonados" valor={String(metricas?.total ?? 0)} cor="#3b82f6" />
        <Kpi label="Valor potencial" valor={brl(metricas?.valorPotencial ?? 0)} cor="#10b981" />
        <Kpi label="Com contato" valor={String(metricas?.comContato ?? 0)} cor="#2dd4bf" sub="dá pra chamar" />
        <Kpi label="Ticket médio" valor={brl(metricas?.ticketMedio ?? 0)} cor="#f59e0b" />
      </div>

      {/* Busca + ações em lote */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone, e-mail ou produto…"
            className="pv-input py-2 pl-9 text-sm"
          />
        </div>

        {selecionados.size > 0 && (
          <>
            <span className="text-xs text-sub">{selecionados.size} selecionado(s)</span>
            <select
              value={respLote}
              onChange={(e) => setRespLote(e.target.value)}
              title="Responsável pelos leads enviados ao CRM"
              className="pv-input w-auto py-1.5 text-xs"
            >
              <option value="">Sem responsável</option>
              {RESPONSAVEIS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button onClick={enviarAoCrm} disabled={enviando} className="pv-btn py-1.5 text-xs">
              {enviando ? 'Enviando…' : 'Enviar ao CRM'}
            </button>
            <button onClick={() => setSelecionados(new Set())} className="text-xs text-faint hover:text-sub">
              limpar
            </button>
          </>
        )}
        {loteMsg && (
          <span className={`text-xs ${loteMsg.startsWith('Erro') ? 'text-red-400' : 'text-emerald-400'}`}>{loteMsg}</span>
        )}
      </div>

      {/* Selecionar todos */}
      {selecionaveis.length > 0 && (
        <label className="mb-2 flex w-fit cursor-pointer items-center gap-2 text-xs text-faint">
          <input
            type="checkbox"
            checked={todosMarcados}
            onChange={() =>
              setSelecionados(todosMarcados ? new Set() : new Set(selecionaveis.map((c) => c.id)))
            }
            className="h-4 w-4 cursor-pointer"
            style={{ accentColor: '#3b82f6' }}
          />
          Selecionar todos ({selecionaveis.length})
        </label>
      )}

      {/* Lista */}
      <div className="pv-card overflow-hidden">
        {filtrados.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center text-faint">
            <ShoppingCartSimple size={32} />
            <p className="text-sm">
              {carrinhos.length === 0 ? 'Nenhum carrinho abandonado no período.' : 'Nada encontrado nessa busca.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {filtrados.map((c) => {
              const zap = paraWhatsapp(c.telefone);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 p-4 transition hover:bg-cardh">
                  <input
                    type="checkbox"
                    checked={selecionados.has(c.id) && !estaNoCrm(c)}
                    disabled={estaNoCrm(c)}
                    onChange={() => alternar(c.id)}
                    title={estaNoCrm(c) ? 'Já está no CRM' : 'Selecionar'}
                    className="h-4 w-4 shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                    style={{ accentColor: '#3b82f6' }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-ink">{c.nome || 'Sem nome'}</p>
                      {estaNoCrm(c) && (
                        <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                          no CRM
                        </span>
                      )}
                      <span className="shrink-0 text-[11px] text-faint">{tempoAtras(c.criadoEm)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-faint">
                      {[c.telefone, c.email].filter(Boolean).join(' · ') || 'sem contato'}
                    </p>
                    <p className="mt-1 truncate text-xs text-sub">
                      {c.qtdItens} item{c.qtdItens > 1 ? 's' : ''}
                      {c.itens[0] ? ` · ${c.itens[0].nome}` : ''}
                      {c.itens.length > 1 ? ` +${c.itens.length - 1}` : ''}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-semibold text-ink">{brl(c.total)}</p>
                    {c.linkCarrinho && (
                      <a
                        href={c.linkCarrinho}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-brand hover:underline"
                      >
                        abrir carrinho
                      </a>
                    )}
                  </div>

                  <a
                    href={zap ? `https://wa.me/${zap}?text=${encodeURIComponent(mensagemRecuperacao(c))}` : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={zap ? 'Chamar no WhatsApp com mensagem pronta' : 'Sem telefone'}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${
                      zap ? 'hover:brightness-110' : 'pointer-events-none opacity-40'
                    }`}
                    style={{ background: zap ? 'linear-gradient(135deg,#25D366,#128C7E)' : 'rgba(148,163,184,0.2)' }}
                  >
                    <WhatsappLogo size={15} weight="fill" />
                    Recuperar
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {isAdmin && (
        <div className="mt-4 text-right">
          <button
            onClick={async () => {
              if (!confirm('Desconectar a loja da Nuvemshop?')) return;
              await api.del('/api/recuperacao/loja');
              carregar();
            }}
            className="text-xs text-faint transition hover:text-red-400"
          >
            Desconectar loja
          </button>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, valor, cor, sub }: { label: string; valor: string; cor: string; sub?: string }) {
  return (
    <div className="pv-card p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-faint">{label}</p>
      <p className="mt-1.5 text-xl font-bold tabular-nums" style={{ color: cor }}>
        {valor}
      </p>
      {sub && <p className="text-[10px] text-faint">{sub}</p>}
    </div>
  );
}

/** Tela de conexão da loja (só ADM consegue salvar). */
function TelaConectar({ isAdmin, onConectado }: { isAdmin: boolean; onConectado: () => void }) {
  const [storeId, setStoreId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function conectar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      await api.post('/api/recuperacao/loja', { storeId: storeId.trim(), accessToken: accessToken.trim() });
      onConectado();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Recuperação de carrinho</h1>
        <p className="text-sm text-faint">Conecte a loja da Nuvemshop para ver os carrinhos abandonados</p>
      </header>

      <div className="pv-card max-w-lg p-6">
        <div className="mb-4 flex items-center gap-3">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white"
            style={{ background: 'linear-gradient(135deg,#3B82F6,#2DD4BF)' }}
          >
            <Plug size={22} weight="fill" />
          </span>
          <div>
            <h2 className="font-semibold text-ink">Conectar Nuvemshop</h2>
            <p className="text-xs text-faint">O token fica guardado no servidor e nunca aparece no navegador.</p>
          </div>
        </div>

        {!isAdmin ? (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            A loja ainda não foi conectada. Peça a um administrador para configurar.
          </p>
        ) : (
          <>
            {/* Caminho principal: 1 clique */}
            <button
              onClick={async () => {
                setErro('');
                try {
                  const r = await api.get<{ url: string }>('/api/recuperacao/oauth/iniciar');
                  window.location.href = r.url;
                } catch (err) {
                  setErro((err as Error).message);
                }
              }}
              className="pv-btn mb-4 w-full"
            >
              Conectar com a Nuvemshop
            </button>
            <p className="mb-5 text-[11px] leading-relaxed text-faint">
              Você vai para a Nuvemshop, autoriza o app na sua loja e volta pra cá já conectado — sem copiar token
              nenhum.
            </p>

            <details className="border-t border-line pt-4">
              <summary className="cursor-pointer text-xs text-faint transition hover:text-sub">
                Prefiro informar o token manualmente
              </summary>
              <form onSubmit={conectar} className="pt-4">
                <label className="mb-1.5 block text-sm text-sub">ID da loja (store_id)</label>
                <input
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  placeholder="ex: 1234567"
                  className="pv-input mb-4"
                />
                <label className="mb-1.5 block text-sm text-sub">Access token</label>
                <input
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="token da API da Nuvemshop"
                  className="pv-input mb-4"
                  type="password"
                />
                <button disabled={salvando} className="pv-btn-ghost w-full">
                  {salvando ? 'Conectando…' : 'Salvar token'}
                </button>
              </form>
            </details>

            {erro && (
              <div className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{erro}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
