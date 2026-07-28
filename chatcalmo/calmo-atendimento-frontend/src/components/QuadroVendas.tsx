import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ATALHOS, PERIODO_CURTO, intervalo, type Faixa, type Periodo } from '../lib/periodo';

// Quadro de vendas consolidado — usado nas DUAS dashboards (atendimento e prospecção).
// Mostra o que veio do atendimento, o que veio da prospecção e o total geral.

interface Bloco {
  total: number;
  quantidade: number;
}
interface Resumo {
  atendimento: Bloco;
  prospeccao: Bloco;
  geral: Bloco;
  ticketMedio: number;
  porVendedor: { nome: string; total: number; quantidade: number }[];
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// `periodo` controlado (Dashboard Geral) esconde o filtro próprio: quem manda é o de cima.
export default function QuadroVendas({
  faixa: faixaExterna,
  periodoInicial = '30d',
}: {
  faixa?: Faixa;
  periodoInicial?: Exclude<Periodo, 'custom'>;
}) {
  const [faixaLocal, setFaixaLocal] = useState<Faixa>({ periodo: periodoInicial });
  const faixa = faixaExterna ?? faixaLocal;
  const controlado = faixaExterna !== undefined;
  const [r, setR] = useState<Resumo | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { from, to } = intervalo(faixa);
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      setR(await api.get<Resumo>(`/api/sales/resumo${qs.toString() ? `?${qs}` : ''}`));
    } catch {
      setR(null);
    } finally {
      setCarregando(false);
    }
  }, [faixa]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <section className="pv-card mb-6 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-ink">Vendas 💰</h2>
          <p className="mt-0.5 text-[11px] text-faint">Registradas no atendimento e na prospecção</p>
        </div>
        {!controlado && (
          <div className="flex overflow-hidden rounded-lg border border-line text-[11px]">
            {ATALHOS.map((p) => (
              <button
                key={p}
                onClick={() => setFaixaLocal({ periodo: p })}
                className={`px-3 py-1.5 font-medium transition ${
                  faixa.periodo === p ? 'bg-brand text-white' : 'text-faint hover:bg-cardh hover:text-ink'
                }`}
              >
                {PERIODO_CURTO[p]}
              </button>
            ))}
          </div>
        )}
      </div>

      {carregando ? (
        <div className="h-20 animate-pulse rounded-xl bg-white/5" />
      ) : !r ? (
        <p className="text-xs text-faint">Não foi possível carregar as vendas.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Bloco titulo="Atendimento" valor={r.atendimento.total} qtd={r.atendimento.quantidade} cor="#3b82f6" />
            <Bloco titulo="Prospecção" valor={r.prospeccao.total} qtd={r.prospeccao.quantidade} cor="#f59e0b" />
            <Bloco titulo="Total geral" valor={r.geral.total} qtd={r.geral.quantidade} cor="#10b981" destaque />
          </div>

          {r.geral.quantidade > 0 && (
            <p className="mt-3 text-[11px] text-faint">
              Ticket médio: <span className="font-semibold text-sub">{brl(r.ticketMedio)}</span>
            </p>
          )}

          {r.porVendedor.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-faint">Por vendedor</p>
              <ul className="space-y-1.5">
                {r.porVendedor.map((v) => (
                  <li key={v.nome} className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-sub">{v.nome}</span>
                    <span className="shrink-0 tabular-nums">
                      <span className="font-semibold text-ink">{brl(v.total)}</span>
                      <span className="ml-2 text-faint">
                        {v.quantidade} venda{v.quantidade > 1 ? 's' : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Bloco({
  titulo,
  valor,
  qtd,
  cor,
  destaque,
}: {
  titulo: string;
  valor: number;
  qtd: number;
  cor: string;
  destaque?: boolean;
}) {
  return (
    <div
      className="rounded-xl border p-3.5"
      style={{
        borderColor: destaque ? `${cor}55` : 'var(--border-color)',
        background: destaque ? `${cor}0f` : 'transparent',
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-faint">{titulo}</p>
      <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: cor }}>
        {brl(valor)}
      </p>
      <p className="text-[10px] text-faint">
        {qtd} venda{qtd === 1 ? '' : 's'}
      </p>
    </div>
  );
}
