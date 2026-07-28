import { useCallback, useEffect, useState } from 'react';
import { ChatCircleDots, ArrowDown, ArrowUp, CheckCircle, Clock } from '@phosphor-icons/react';
import { api, type DashboardData } from '../lib/api';
import QuadroVendas from '../components/QuadroVendas';
import { queryPeriodo, rotuloFaixa, type Faixa } from '../lib/periodo';

const HOJE: Faixa = { periodo: 'hoje' };

export default function Dashboard({
  embutido = false,
  faixa = HOJE,
}: {
  embutido?: boolean;
  faixa?: Faixa;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api.get<DashboardData>(`/api/dashboard${queryPeriodo(faixa)}`));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [faixa]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <div className="p-8 text-red-400">{error}</div>;
  if (!data) return <div className="grid h-full place-items-center text-faint">Carregando…</div>;

  return (
    <div className="h-full overflow-y-auto p-8">
      {!embutido && <QuadroVendas />}
      <header className="mb-6">
        {!embutido && <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>}
        <p className="text-sm text-faint">Visão geral dos atendimentos · {rotuloFaixa(faixa).toLowerCase()}</p>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Card label="Novas conversas" value={data.today.newConversations} icon={<ChatCircleDots size={20} />} tone="brand" />
        <Card label="Recebidas" value={data.today.inbound} icon={<ArrowDown size={20} />} tone="cyan" />
        <Card label="Enviadas" value={data.today.outbound} icon={<ArrowUp size={20} />} tone="cyan" />
        <Card label="Em aberto" value={data.byStatus.open} icon={<CheckCircle size={20} />} tone="green" />
        <Card label="Pendentes" value={data.byStatus.pending} icon={<Clock size={20} />} tone="amber" />
      </div>

      <section className="pv-card p-5">
        <h2 className="mb-4 font-semibold text-ink">Por atendente</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                <th className="pb-3 font-medium">Atendente</th>
                <th className="pb-3 text-center font-medium">Em atendimento</th>
                <th className="pb-3 text-center font-medium">Mensagens</th>
              </tr>
            </thead>
            <tbody>
              {data.perAgent.map((a) => (
                <tr key={a.id} className="border-b border-line/60 last:border-0">
                  <td className="flex items-center gap-2.5 py-3 font-medium text-ink">
                    <span
                      className="grid h-8 w-8 place-items-center rounded-full text-xs font-semibold text-white"
                      style={{ background: 'linear-gradient(135deg,#3B82F6,#2DD4BF)' }}
                    >
                      {a.name.charAt(0)}
                    </span>
                    {a.name}
                  </td>
                  <td className="py-3 text-center">
                    <span className="rounded-full bg-brand/15 px-2.5 py-0.5 font-semibold text-brand">
                      {a.emAtendimento}
                    </span>
                  </td>
                  <td className="py-3 text-center text-sub">{a.mensagensHoje}</td>
                </tr>
              ))}
              {data.perAgent.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-faint">
                    Nenhum atendente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <MiniCard label="Total em aberto" value={data.byStatus.open} tone="text-ok" />
        <MiniCard label="Total pendentes" value={data.byStatus.pending} tone="text-amber-400" />
        <MiniCard label="Total resolvidas" value={data.byStatus.resolved} tone="text-sub" />
      </div>
    </div>
  );
}

const TONE: Record<string, string> = {
  brand: 'text-brand',
  cyan: 'text-accent',
  green: 'text-ok',
  amber: 'text-amber-400',
};

function Card({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: keyof typeof TONE | string;
}) {
  return (
    <div className="pv-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-faint">{label}</p>
        <span className={TONE[tone] ?? 'text-brand'}>{icon}</span>
      </div>
      <p className={`text-3xl font-bold ${TONE[tone] ?? 'text-ink'}`}>{value}</p>
    </div>
  );
}

function MiniCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="pv-card p-5">
      <p className="text-xs uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}
