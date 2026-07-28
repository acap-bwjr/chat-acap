import { useState } from 'react';
import { ChatCircleDots, DownloadSimple, Target } from '@phosphor-icons/react';
import QuadroVendas from '../components/QuadroVendas';
import FiltroPeriodo from '../components/FiltroPeriodo';
import DashboardAtendimento from './Dashboard';
import DashboardProspeccao from '../prospeccao/pages/Dashboard';
import { rotuloFaixa, type Faixa } from '../lib/periodo';
import { gerarRelatorioGeral } from '../lib/relatorioGeral';

// Dashboard Geral — uma tela só, um filtro de data só, um relatório só:
//  • vendas consolidadas (atendimento + prospecção + total)
//  • os números do atendimento
//  • o painel completo da prospecção (metas, funil, gráficos)
// O período escolhido aqui vale para os três blocos e para o PDF.
export default function DashboardGeral({ isAdmin = false }: { isAdmin?: boolean }) {
  const [faixa, setFaixa] = useState<Faixa>({ periodo: 'hoje' });
  const [gerando, setGerando] = useState(false);

  async function baixarRelatorio() {
    setGerando(true);
    try {
      await gerarRelatorioGeral(faixa);
    } catch (err) {
      alert('Não foi possível gerar o relatório: ' + (err as Error).message);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-app">
      <div className="p-4 pb-0 sm:p-8 sm:pb-0">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Dashboard Geral</h1>
            <p className="text-sm text-faint">
              Vendas, atendimento e prospecção · <span className="text-sub">{rotuloFaixa(faixa)}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro de data único (atalhos + intervalo personalizado) — vale para tudo abaixo */}
            <FiltroPeriodo faixa={faixa} onChange={setFaixa} />

            {/* Relatório único, do período selecionado */}
            <button
              onClick={baixarRelatorio}
              disabled={gerando}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[11px] font-medium text-faint transition hover:bg-cardh hover:text-ink disabled:opacity-50"
            >
              <DownloadSimple size={13} />
              {gerando ? 'Gerando…' : 'Baixar relatório'}
            </button>
          </div>
        </header>

        {/* Vendas: já soma as duas origens */}
        <QuadroVendas faixa={faixa} />

        {/* ---- Atendimento ---- */}
        <div className="mb-3 flex items-center gap-2">
          <ChatCircleDots size={18} className="text-brand" />
          <h2 className="text-[15px] font-bold text-ink">Atendimento</h2>
        </div>
      </div>

      <div className="[&>div]:!h-auto [&>div]:!overflow-visible">
        <DashboardAtendimento embutido faixa={faixa} />
      </div>

      {/* ---- Prospecção ---- */}
      <div className="px-4 sm:px-8">
        <div className="mb-3 mt-2 flex items-center gap-2 border-t border-line pt-6">
          <Target size={18} className="text-accent" />
          <h2 className="text-[15px] font-bold text-ink">Prospecção</h2>
        </div>
      </div>

      <div className="bg-base [&>div]:!h-auto [&>div]:!overflow-visible">
        <DashboardProspeccao isAdmin={isAdmin} embutido faixa={faixa} />
      </div>
    </div>
  );
}
