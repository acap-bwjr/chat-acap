// Período único do Dashboard Geral — vale para vendas, atendimento e prospecção.
export type Periodo = 'hoje' | '7d' | '30d' | 'tudo' | 'custom';

/** Faixa de datas: um atalho ("hoje", "7d"…) ou um intervalo escolhido a dedo. */
export interface Faixa {
  periodo: Periodo;
  de?: string; // YYYY-MM-DD (só quando periodo === 'custom')
  ate?: string; // YYYY-MM-DD (só quando periodo === 'custom')
}

export const ATALHOS: Exclude<Periodo, 'custom'>[] = ['hoje', '7d', '30d', 'tudo'];

export const PERIODO_CURTO: Record<Periodo, string> = {
  hoje: 'Hoje',
  '7d': '7 dias',
  '30d': '30 dias',
  tudo: 'Tudo',
  custom: 'Personalizado',
};

export const PERIODO_LABEL: Record<Periodo, string> = {
  hoje: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  tudo: 'Todo o período',
  custom: 'Período personalizado',
};

/**
 * Data no formato YYYY-MM-DD pelo relógio LOCAL.
 * Nunca usar `toISOString().slice(0,10)` para isso: aquilo é UTC e, no Brasil
 * (UTC-3), das 21h à meia-noite ele já devolve o dia SEGUINTE — foi assim que
 * venda registrada à noite caía fora do filtro "Hoje".
 */
const iso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Hoje (YYYY-MM-DD) pelo relógio local — usar em todo campo de data de venda. */
export const hojeLocal = (): string => iso(new Date());

/** dd/mm/aaaa a partir de YYYY-MM-DD (sem passar por Date, sem risco de fuso). */
export function formatarDataBr(ymd: string): string {
  const [a, m, d] = ymd.split('-');
  return d && m && a ? `${d}/${m}/${a}` : ymd;
}

/** YYYY-MM-DD -> Date à meia-noite LOCAL (evita o off-by-one do parse UTC). */
function daYmd(ymd?: string): Date | null {
  if (!ymd) return null;
  const [a, m, d] = ymd.split('-').map(Number);
  if (!a || !m || !d) return null;
  return new Date(a, m - 1, d, 0, 0, 0, 0);
}

export const faixaDe = (periodo: Periodo, de?: string, ate?: string): Faixa => ({ periodo, de, ate });

/** 00:00 do primeiro dia da faixa. `tudo` = sem corte. */
export function inicioFaixa(f: Faixa): Date | null {
  if (f.periodo === 'tudo') return null;
  if (f.periodo === 'custom') return daYmd(f.de);
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (f.periodo === '7d') d.setDate(d.getDate() - 6);
  if (f.periodo === '30d') d.setDate(d.getDate() - 29);
  return d;
}

/** 23:59:59.999 do último dia da faixa (só limita no personalizado). */
export function fimFaixa(f: Faixa): Date | null {
  if (f.periodo !== 'custom') return null;
  const d = daYmd(f.ate);
  if (!d) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Intervalo YYYY-MM-DD para mandar às APIs. `tudo` = sem `from`/`to`. */
export function intervalo(f: Faixa): { from?: string; to?: string } {
  if (f.periodo === 'tudo') return {};
  if (f.periodo === 'custom') {
    if (!f.de || !f.ate) return {};
    return { from: f.de, to: f.ate };
  }
  const ini = inicioFaixa(f);
  return ini ? { from: iso(ini), to: hojeLocal() } : {};
}

/** Querystring já pronta ("?from=…&to=…" ou ""). */
export function queryPeriodo(f: Faixa): string {
  const { from, to } = intervalo(f);
  return from ? `?from=${from}&to=${to}` : '';
}

/** Rótulo legível da faixa, para cabeçalhos e PDF. */
export function rotuloFaixa(f: Faixa): string {
  if (f.periodo !== 'custom') return PERIODO_LABEL[f.periodo];
  if (!f.de || !f.ate) return 'Período personalizado';
  return f.de === f.ate
    ? formatarDataBr(f.de)
    : `${formatarDataBr(f.de)} a ${formatarDataBr(f.ate)}`;
}

/** Sufixo do nome do arquivo do relatório. */
export function tagFaixa(f: Faixa): string {
  switch (f.periodo) {
    case 'hoje': return 'hoje';
    case '7d': return '7-dias';
    case '30d': return '30-dias';
    case 'tudo': return 'completo';
    default: return `${f.de ?? ''}_a_${f.ate ?? ''}`;
  }
}
