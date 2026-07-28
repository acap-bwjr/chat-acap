// Relatório único do Dashboard Geral: vendas + atendimento + prospecção
// no mesmo PDF, sempre no período selecionado lá em cima.
import { api } from './api';
import { inicioFaixa, fimFaixa, queryPeriodo, rotuloFaixa, tagFaixa, type Faixa } from './periodo';
import { supabase } from '../prospeccao/lib/supabase';
import { contarChamados, carregarMetaDiaria } from '../prospeccao/lib/metas';
import {
  LEAD_STATUSES,
  STATUS_LABELS,
  HOT_STATUSES,
  ATENDENTES_META,
  META_DIARIA,
} from '../prospeccao/types';
import type { Lead, LeadStatus } from '../prospeccao/types';

interface Bloco {
  total: number;
  quantidade: number;
}
interface ResumoVendas {
  atendimento: Bloco;
  prospeccao: Bloco;
  geral: Bloco;
  ticketMedio: number;
  porVendedor: { nome: string; total: number; quantidade: number }[];
}
interface DadosAtendimento {
  today: { newConversations: number; inbound: number; outbound: number };
  byStatus: Record<string, number>;
  perAgent: { id: string; name: string; emAtendimento: number; mensagensHoje: number }[];
}

const BLUE = '#2563EB';
const primeiroNome = (s: string) => s.trim().toLowerCase().split(/\s+/)[0] ?? '';
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBr = (d: string | Date) => new Date(d).toLocaleDateString('pt-BR');

async function toDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.readAsDataURL(blob);
  });
}

export async function gerarRelatorioGeral(f: Faixa): Promise<void> {
  const p = f.periodo;
  const ini = inicioFaixa(f);
  const fim = fimFaixa(f);
  const qs = queryPeriodo(f);

  // Tudo em paralelo: se uma parte falhar, o relatório sai com o resto.
  const [leadsRes, chamados, metaDiaria, vendas, atendimento, pdfMakeMod, fonts, logo] =
    await Promise.all([
      supabase.from('leads').select('*'),
      contarChamados(ini).catch(() => ({} as Record<string, number>)),
      carregarMetaDiaria(META_DIARIA).catch(() => META_DIARIA),
      api.get<ResumoVendas>(`/api/sales/resumo${qs}`).catch(() => null),
      api.get<DadosAtendimento>(`/api/dashboard${qs}`).catch(() => null),
      // O pdfmake vem por import() sob demanda (~1,8 MB). Se o chunk não baixar,
      // avisa em português em vez de morrer com o erro cru do navegador.
      import('pdfmake/build/pdfmake').catch(() => {
        throw new Error('não foi possível carregar o gerador de PDF. Atualize a página (Ctrl+F5) e tente de novo.');
      }),
      import('pdfmake/build/vfs_fonts').catch(() => {
        throw new Error('não foi possível carregar as fontes do PDF. Atualize a página (Ctrl+F5) e tente de novo.');
      }),
      toDataUrl('/logo-calmo.png').catch(() => ''),
    ]);

  const todosLeads = (leadsRes.data ?? []) as Lead[];
  const base = !ini && !fim
    ? todosLeads
    : todosLeads.filter((l) => {
        if (!l.created_at) return false;
        const d = new Date(l.created_at);
        return (!ini || d >= ini) && (!fim || d <= fim);
      });

  // ---- prospecção ----
  const totalP = base.length;
  const hotP = base.filter((l) => HOT_STATUSES.includes(l.status)).length;
  const fechouP = base.filter((l) => l.status === 'fechou').length;
  const perdidaP = base.filter((l) => l.status === 'perdida').length;
  const chamadosTotal = Object.values(chamados).reduce((s, v) => s + v, 0);

  const porEtapa = LEAD_STATUSES.map((s: LeadStatus) => ({
    s,
    n: base.filter((l) => l.status === s).length,
  }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);

  const mapaResp: Record<string, { total: number; hot: number; fechou: number; perdida: number }> = {};
  base.forEach((l) => {
    const k = l.responsavel?.trim();
    if (!k) return;
    mapaResp[k] ??= { total: 0, hot: 0, fechou: 0, perdida: 0 };
    mapaResp[k].total++;
    if (HOT_STATUSES.includes(l.status)) mapaResp[k].hot++;
    if (l.status === 'fechou') mapaResp[k].fechou++;
    if (l.status === 'perdida') mapaResp[k].perdida++;
  });
  const ranking = Object.entries(mapaResp).sort((a, b) => b[1].total - a[1].total);

  // ---- pdfmake ----
  const pdfMake = (pdfMakeMod as any).default ?? pdfMakeMod;
  const vfs = (fonts as any).default ?? (fonts as any).vfs ?? fonts;
  if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(vfs);
  else pdfMake.vfs = vfs;

  const th = (s: string, align = 'left') => ({
    text: s, bold: true, color: '#ffffff', fontSize: 8, alignment: align,
  });
  const card = (label: string, value: string | number, color: string) => ({
    stack: [
      { text: String(value), fontSize: 14, bold: true, color },
      { text: label, fontSize: 7.5, color: '#64748b', margin: [0, 2, 0, 0] },
    ],
    fillColor: '#f1f5f9',
  });
  const sectionTitle = (s: string) => ({
    text: s, fontSize: 12, bold: true, color: '#0f172a', margin: [0, 6, 0, 6],
  });
  const layoutCards: any = {
    defaultBorder: false,
    paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 8, paddingBottom: () => 8,
  };
  const layoutTabela: any = {
    fillColor: (row: number) => (row === 0 ? BLUE : row % 2 === 0 ? '#f8fafc' : null),
    hLineWidth: () => 0.5,
    vLineWidth: () => 0,
    hLineColor: () => '#e2e8f0',
    paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4,
  };
  const vazio = (txt: string) => ({
    text: txt, italics: true, color: '#94a3b8', fontSize: 9, margin: [0, 2, 0, 16],
  });

  const periodoTxt = ini ? `${fmtBr(ini)} a ${fmtBr(fim ?? new Date())}` : 'Todo o período';

  const content: any[] = [];

  // ===== 1. Vendas =====
  content.push(sectionTitle('Vendas'));
  if (vendas) {
    content.push({
      table: {
        widths: ['*', '*', '*', '*'],
        body: [[
          card('Atendimento', brl(vendas.atendimento.total), '#3b82f6'),
          card('Prospecção', brl(vendas.prospeccao.total), '#f59e0b'),
          card('Total geral', brl(vendas.geral.total), '#16a34a'),
          card('Ticket médio', brl(vendas.ticketMedio || 0), '#0ea5e9'),
        ]],
      },
      layout: layoutCards,
      margin: [0, 2, 0, 8],
    });
    content.push({
      text:
        `${vendas.geral.quantidade} venda(s) no período · ` +
        `${vendas.atendimento.quantidade} do atendimento · ${vendas.prospeccao.quantidade} da prospecção`,
      fontSize: 8, color: '#64748b', margin: [0, 0, 0, 10],
    });
    if (vendas.porVendedor.length) {
      content.push({
        table: {
          headerRows: 1,
          widths: ['*', 90, 70],
          body: [
            [th('Vendedor'), th('Valor', 'right'), th('Vendas', 'center')],
            ...vendas.porVendedor.map((v) => [
              { text: v.nome, fontSize: 8 },
              { text: brl(v.total), fontSize: 8, alignment: 'right', bold: true },
              { text: String(v.quantidade), fontSize: 8, alignment: 'center', color: '#64748b' },
            ]),
          ],
        },
        layout: layoutTabela,
        margin: [0, 0, 0, 16],
      });
    } else {
      content.push(vazio('Nenhuma venda registrada no período.'));
    }
  } else {
    content.push(vazio('Não foi possível carregar as vendas.'));
  }

  // ===== 2. Atendimento =====
  content.push(sectionTitle('Atendimento'));
  if (atendimento) {
    content.push({
      table: {
        widths: ['*', '*', '*', '*', '*'],
        body: [[
          card('Novas conversas', atendimento.today.newConversations, BLUE),
          card('Recebidas', atendimento.today.inbound, '#0ea5e9'),
          card('Enviadas', atendimento.today.outbound, '#8b5cf6'),
          card('Em aberto', atendimento.byStatus.open ?? 0, '#16a34a'),
          card('Resolvidas', atendimento.byStatus.resolved ?? 0, '#64748b'),
        ]],
      },
      layout: layoutCards,
      margin: [0, 2, 0, 12],
    });
    const agentes = atendimento.perAgent.filter((a) => a.emAtendimento > 0 || a.mensagensHoje > 0);
    content.push(
      agentes.length
        ? {
            table: {
              headerRows: 1,
              widths: ['*', 90, 90],
              body: [
                [th('Atendente'), th('Em atendimento', 'center'), th('Mensagens', 'center')],
                ...agentes.map((a) => [
                  { text: a.name, fontSize: 8 },
                  { text: String(a.emAtendimento), fontSize: 8, alignment: 'center', bold: true },
                  { text: String(a.mensagensHoje), fontSize: 8, alignment: 'center', color: '#64748b' },
                ]),
              ],
            },
            layout: layoutTabela,
            margin: [0, 0, 0, 16],
          }
        : vazio('Nenhuma atividade de atendente no período.')
    );
  } else {
    content.push(vazio('Não foi possível carregar o atendimento.'));
  }

  // ===== 3. Prospecção =====
  content.push({ text: '', pageBreak: 'before' });
  content.push(sectionTitle('Prospecção'));
  content.push({
    table: {
      widths: ['*', '*', '*', '*'],
      body: [[
        card('Leads no período', totalP, BLUE),
        card('Em fase quente', hotP, '#f43f5e'),
        card('Fechados', fechouP, '#16a34a'),
        card('Clientes chamados', chamadosTotal, '#0ea5e9'),
      ]],
    },
    layout: layoutCards,
    margin: [0, 2, 0, 14],
  });

  content.push(sectionTitle(p === 'hoje' ? 'Metas do dia — clientes chamados' : 'Clientes chamados por atendente'));
  content.push({
    table: {
      headerRows: 1,
      widths: ['*', 70, 70, 70],
      body: [
        [th('Atendente'), th('Chamados', 'center'), th(p === 'hoje' ? 'Meta' : '—', 'center'), th('Atingido', 'center')],
        ...ATENDENTES_META.map((nome: string) => {
          const feitos = chamados[primeiroNome(nome)] ?? 0;
          const pct = p === 'hoje' ? `${Math.min(100, Math.round((feitos / metaDiaria) * 100))}%` : '—';
          return [
            { text: nome, fontSize: 8 },
            { text: String(feitos), fontSize: 8, alignment: 'center', bold: true },
            { text: p === 'hoje' ? String(metaDiaria) : '—', fontSize: 8, alignment: 'center', color: '#64748b' },
            { text: pct, fontSize: 8, alignment: 'center', color: feitos >= metaDiaria && p === 'hoje' ? '#16a34a' : '#64748b' },
          ];
        }),
      ],
    },
    layout: layoutTabela,
    margin: [0, 0, 0, 16],
  });

  content.push(sectionTitle('Ranking por responsável'));
  content.push(
    ranking.length
      ? {
          table: {
            headerRows: 1,
            widths: [22, '*', 56, 56, 56, 56],
            body: [
              [th('#'), th('Responsável'), th('Leads', 'center'), th('Quentes', 'center'), th('Fechou', 'center'), th('Perdida', 'center')],
              ...ranking.map(([nome, r], i) => [
                { text: `${i + 1}º`, fontSize: 8, bold: true, color: '#64748b' },
                { text: nome, fontSize: 8 },
                { text: String(r.total), fontSize: 8, alignment: 'center' },
                { text: String(r.hot), fontSize: 8, alignment: 'center', color: '#e11d48' },
                { text: String(r.fechou), fontSize: 8, alignment: 'center', color: '#16a34a', bold: true },
                { text: String(r.perdida), fontSize: 8, alignment: 'center', color: '#94a3b8' },
              ]),
            ],
          },
          layout: layoutTabela,
          margin: [0, 0, 0, 16],
        }
      : vazio('Nenhum lead com responsável no período.')
  );

  content.push(sectionTitle('Leads por etapa'));
  content.push(
    porEtapa.length
      ? {
          table: {
            headerRows: 1,
            widths: ['*', 70, 70],
            body: [
              [th('Etapa'), th('Leads', 'center'), th('% do total', 'center')],
              ...porEtapa.map((e) => [
                { text: STATUS_LABELS[e.s], fontSize: 8 },
                { text: String(e.n), fontSize: 8, alignment: 'center' },
                { text: totalP ? `${Math.round((e.n / totalP) * 100)}%` : '0%', fontSize: 8, alignment: 'center', color: '#64748b' },
              ]),
            ],
          },
          layout: layoutTabela,
        }
      : vazio('Nenhum lead no período.')
  );
  content.push({ text: `Perdidos no período: ${perdidaP}`, fontSize: 8, color: '#94a3b8', margin: [0, 12, 0, 0] });

  const dd: any = {
    pageSize: 'A4',
    pageMargins: [34, 96, 34, 40],
    header: {
      margin: [34, 18, 34, 0],
      stack: [
        {
          columns: [
            logo ? { image: logo, width: 96 } : { text: 'Calmô', fontSize: 16, bold: true, color: '#0f172a' },
            {
              width: '*',
              stack: [
                { text: 'Relatório Geral', fontSize: 16, bold: true, color: '#0f172a', alignment: 'right' },
                { text: rotuloFaixa(f), fontSize: 10, bold: true, color: BLUE, alignment: 'right' },
                { text: `Período: ${periodoTxt}`, fontSize: 8, color: '#64748b', alignment: 'right', margin: [0, 2, 0, 0] },
              ],
            },
          ],
        },
        { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 527, y2: 8, lineWidth: 1.5, lineColor: BLUE }] },
      ],
    },
    footer: (cur: number, tot: number) => ({
      margin: [34, 12, 34, 0],
      columns: [
        { text: 'Calmô · Atendimento e Prospecção', fontSize: 7, color: '#94a3b8' },
        { text: `Página ${cur} de ${tot}`, fontSize: 7, color: '#94a3b8', alignment: 'right' },
      ],
    }),
    content,
    defaultStyle: { fontSize: 9, color: '#1e293b' },
  };

  // download() é assíncrono no pdfmake 0.3: sem await, uma falha viraria
  // rejeição silenciosa e o usuário só veria "não baixou nada".
  await pdfMake.createPdf(dd).download(`relatorio-geral-${tagFaixa(f)}.pdf`);
}
