import { useEffect, useMemo, useState } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { supabase } from "../lib/supabase";
import { contarChamados, carregarMetaDiaria, salvarMetaDiaria } from "../lib/metas";
import { LEAD_STATUSES, STATUS_LABELS, STATUS_HEX, HOT_STATUSES, ATENDENTES_META, META_DIARIA } from "../types";
import type { Lead, LeadStatus } from "../types";
import FunnelChart from "../components/FunnelChart";
import FonteLogo from "../components/FonteLogo";
import LeadsPorEtapaModal from "../components/LeadsPorEtapaModal";
import MetaCard from "../components/MetaCard";
import QuadroVendas from "../../components/QuadroVendas";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ATALHOS, PERIODO_CURTO, PERIODO_LABEL, inicioFaixa, fimFaixa, rotuloFaixa, type Faixa, type Periodo } from "../../lib/periodo";

// Hook que detecta o tema atual via data-theme no html, atualizando reativamente
function useTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    (document.documentElement.getAttribute("data-theme") as "light" | "dark") || "dark"
  );
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setTheme((document.documentElement.getAttribute("data-theme") as "light" | "dark") || "dark");
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

const ACTIVE_STATUSES: LeadStatus[] = [
  "novo_maps", "novo", "carrinho_abandonado", "dm_enviada", "mensagem_1", "mensagem_2", "mensagem_3", "atendimento_ia",
  "email_a_enviar", "email_enviado",
  "respondeu", "stand_by", "interessado",
];

// Compara pelo PRIMEIRO nome em minúsculo ("Victor", "victor souza" -> "victor").
const primeiroNome = (s: string): string => s.trim().toLowerCase().split(/\s+/)[0] ?? "";

type LastInter = { conteudo: string; created_at: string };
type Atividade7d = { id: string; lead_id: string; conteudo: string; created_at: string; tipo: string };

export default function Dashboard({
  isAdmin = false,
  embutido = false,
  faixa: faixaExterna,
}: {
  isAdmin?: boolean;
  embutido?: boolean;
  faixa?: Faixa;
}) {
  const [todosLeads, setTodosLeads] = useState<Lead[]>([]);
  const [faixaLocal, setFaixaLocal] = useState<Faixa>({ periodo: "hoje" });
  // Quando vem de cima (Dashboard Geral), o filtro/relatório daqui somem: são um só lá em cima.
  const faixa = faixaExterna ?? faixaLocal;
  const controlado = faixaExterna !== undefined;
  const [gerando, setGerando] = useState<Periodo | "">("");
  // Meta do dia: primeiro nome (minúsculo) -> clientes chamados hoje
  const [chamadosHoje, setChamadosHoje] = useState<Record<string, number>>({});
  // Meta diária (editável pelo ADM; guardada em prospeccao_config)
  const [metaDiaria, setMetaDiaria] = useState<number>(META_DIARIA);
  const [editMeta, setEditMeta] = useState(false);
  const [metaInput, setMetaInput] = useState(String(META_DIARIA));
  const [salvandoMeta, setSalvandoMeta] = useState(false);
  const [loading, setLoading] = useState(true);
  // Mapa lead_id -> última interação registrada
  const [interacoesMap, setInteracoesMap] = useState<Record<string, LastInter>>({});
  // Atividades dos últimos 7 dias (popup)
  const [atividades7d, setAtividades7d] = useState<Atividade7d[]>([]);
  const [modalAtividadesOpen, setModalAtividadesOpen] = useState(false);
  // Etapa selecionada para o popup "leads por etapa"
  const [etapaSelecionada, setEtapaSelecionada] = useState<LeadStatus | null>(null);
  const theme = useTheme();
  const isLight = theme === "light";

  // Cores theme-aware pros gráficos do Recharts (que não suportam CSS vars)
  const tickColor = isLight ? "rgba(15, 23, 42, 0.7)" : "rgba(255, 255, 255, 0.5)";
  const tickColorBold = isLight ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.7)";
  const axisLineColor = isLight ? "rgba(15, 23, 42, 0.1)" : "rgba(255, 255, 255, 0.08)";
  const tooltipBg = isLight ? "rgba(255, 255, 255, 0.97)" : "rgba(12, 14, 23, 0.95)";
  const tooltipBorder = isLight ? "rgba(15, 23, 42, 0.12)" : "rgba(255, 255, 255, 0.08)";
  const tooltipLabelColor = isLight ? "rgba(15, 23, 42, 0.6)" : "#71717a";
  const cursorFill = isLight ? "rgba(59, 130, 246, 0.06)" : "rgba(45, 212, 191, 0.06)";

  // Recorte do período — todo o dashboard abaixo usa este subconjunto.
  const leads = useMemo(() => {
    const ini = inicioFaixa(faixa);
    const fim = fimFaixa(faixa);
    if (!ini && !fim) return todosLeads;
    return todosLeads.filter((l) => {
      if (!l.created_at) return false;
      const d = new Date(l.created_at);
      return (!ini || d >= ini) && (!fim || d <= fim);
    });
  }, [todosLeads, faixa]);

  // ---- Relatório PDF ----
  async function toDataUrl(url: string): Promise<string> {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.readAsDataURL(blob);
    });
  }

  async function gerarPdf(p: Periodo) {
    setGerando(p);
    try {
      const ini = inicioFaixa({ periodo: p });
      const base = ini ? todosLeads.filter((l) => l.created_at && new Date(l.created_at) >= ini) : todosLeads;
      const fmtBr = (iso: string | Date) => new Date(iso).toLocaleDateString("pt-BR");

      const totalP = base.length;
      const hotP = base.filter((l) => HOT_STATUSES.includes(l.status)).length;
      const fechouP = base.filter((l) => l.status === "fechou").length;
      const perdidaP = base.filter((l) => l.status === "perdida").length;

      const porEtapa = LEAD_STATUSES.map((s) => ({ s, n: base.filter((l) => l.status === s).length }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n);

      const mapaResp: Record<string, { total: number; hot: number; fechou: number; perdida: number }> = {};
      base.forEach((l) => {
        const k = l.responsavel?.trim();
        if (!k) return;
        mapaResp[k] ??= { total: 0, hot: 0, fechou: 0, perdida: 0 };
        mapaResp[k].total++;
        if (HOT_STATUSES.includes(l.status)) mapaResp[k].hot++;
        if (l.status === "fechou") mapaResp[k].fechou++;
        if (l.status === "perdida") mapaResp[k].perdida++;
      });
      const ranking = Object.entries(mapaResp).sort((a, b) => b[1].total - a[1].total);

      // Clientes chamados no período (leads que saíram de Novo Maps/Novo Instagram)
      const porPessoa = await contarChamados(ini);
      const chamadosTotal = Object.values(porPessoa).reduce((s, v) => s + v, 0);

      const [{ default: pdfMake }, fonts, logo] = await Promise.all([
        import("pdfmake/build/pdfmake"),
        import("pdfmake/build/vfs_fonts"),
        toDataUrl("/logo-calmo.png"),
      ]);
      const vfs = (fonts as any).default ?? (fonts as any).vfs ?? fonts;
      if (typeof (pdfMake as any).addVirtualFileSystem === "function") (pdfMake as any).addVirtualFileSystem(vfs);
      else (pdfMake as any).vfs = vfs;

      const BLUE = "#2563EB";
      const th = (s: string, align = "left") => ({ text: s, bold: true, color: "#ffffff", fontSize: 8, alignment: align });
      const card = (label2: string, value: string | number, color: string) => ({
        stack: [
          { text: String(value), fontSize: 14, bold: true, color },
          { text: label2, fontSize: 7.5, color: "#64748b", margin: [0, 2, 0, 0] },
        ],
        fillColor: "#f1f5f9",
      });
      const sectionTitle = (s: string) => ({ text: s, fontSize: 12, bold: true, color: "#0f172a", margin: [0, 6, 0, 6] });
      const layoutTabela: any = {
        fillColor: (row: number) => (row === 0 ? BLUE : row % 2 === 0 ? "#f8fafc" : null),
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => "#e2e8f0",
        paddingLeft: () => 6,
        paddingRight: () => 6,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      };
      const periodoTxt = ini ? `${fmtBr(ini)} a ${fmtBr(new Date())}` : "Todo o período";

      const dd: any = {
        pageSize: "A4",
        pageMargins: [34, 96, 34, 40],
        header: {
          margin: [34, 18, 34, 0],
          stack: [
            {
              columns: [
                { image: logo, width: 96 },
                {
                  width: "*",
                  stack: [
                    { text: "Relatório de Prospecção", fontSize: 16, bold: true, color: "#0f172a", alignment: "right" },
                    { text: PERIODO_LABEL[p], fontSize: 10, bold: true, color: BLUE, alignment: "right" },
                    { text: `Período: ${periodoTxt}`, fontSize: 8, color: "#64748b", alignment: "right", margin: [0, 2, 0, 0] },
                  ],
                },
              ],
            },
            { canvas: [{ type: "line", x1: 0, y1: 8, x2: 527, y2: 8, lineWidth: 1.5, lineColor: BLUE }] },
          ],
        },
        footer: (cur: number, tot: number) => ({
          margin: [34, 12, 34, 0],
          columns: [
            { text: "Calmô · Prospecção", fontSize: 7, color: "#94a3b8" },
            { text: `Página ${cur} de ${tot}`, fontSize: 7, color: "#94a3b8", alignment: "right" },
          ],
        }),
        content: [
          {
            table: {
              widths: ["*", "*", "*", "*"],
              body: [[
                card("Leads no período", totalP, BLUE),
                card("Em fase quente", hotP, "#f43f5e"),
                card("Fechados", fechouP, "#16a34a"),
                card("Clientes chamados", chamadosTotal, "#0ea5e9"),
              ]],
            },
            layout: { defaultBorder: false, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 8, paddingBottom: () => 8 },
            margin: [0, 2, 0, 14],
          },

          sectionTitle(p === "hoje" ? "Metas do dia — clientes chamados" : "Clientes chamados por atendente"),
          {
            table: {
              headerRows: 1,
              widths: ["*", 70, 70, 70],
              body: [
                [th("Atendente"), th("Chamados", "center"), th(p === "hoje" ? "Meta" : "—", "center"), th("Atingido", "center")],
                ...ATENDENTES_META.map((nome) => {
                  const feitos = porPessoa[primeiroNome(nome)] ?? 0;
                  const pctv = p === "hoje" ? `${Math.min(100, Math.round((feitos / metaDiaria) * 100))}%` : "—";
                  return [
                    { text: nome, fontSize: 8 },
                    { text: String(feitos), fontSize: 8, alignment: "center", bold: true },
                    { text: p === "hoje" ? String(metaDiaria) : "—", fontSize: 8, alignment: "center", color: "#64748b" },
                    { text: pctv, fontSize: 8, alignment: "center", color: feitos >= metaDiaria && p === "hoje" ? "#16a34a" : "#64748b" },
                  ];
                }),
              ],
            },
            layout: layoutTabela,
            margin: [0, 0, 0, 16],
          },

          sectionTitle("Ranking por responsável"),
          ranking.length
            ? {
                table: {
                  headerRows: 1,
                  widths: [22, "*", 56, 56, 56, 56],
                  body: [
                    [th("#"), th("Responsável"), th("Leads", "center"), th("Quentes", "center"), th("Fechou", "center"), th("Perdida", "center")],
                    ...ranking.map(([nome, r], i) => [
                      { text: `${i + 1}º`, fontSize: 8, bold: true, color: "#64748b" },
                      { text: nome, fontSize: 8 },
                      { text: String(r.total), fontSize: 8, alignment: "center" },
                      { text: String(r.hot), fontSize: 8, alignment: "center", color: "#e11d48" },
                      { text: String(r.fechou), fontSize: 8, alignment: "center", color: "#16a34a", bold: true },
                      { text: String(r.perdida), fontSize: 8, alignment: "center", color: "#94a3b8" },
                    ]),
                  ],
                },
                layout: layoutTabela,
                margin: [0, 0, 0, 16],
              }
            : { text: "Nenhum lead com responsável no período.", italics: true, color: "#94a3b8", fontSize: 9, margin: [0, 2, 0, 16] },

          sectionTitle("Leads por etapa"),
          porEtapa.length
            ? {
                table: {
                  headerRows: 1,
                  widths: ["*", 70, 70],
                  body: [
                    [th("Etapa"), th("Leads", "center"), th("% do total", "center")],
                    ...porEtapa.map((e) => [
                      { text: STATUS_LABELS[e.s], fontSize: 8 },
                      { text: String(e.n), fontSize: 8, alignment: "center" },
                      { text: totalP ? `${Math.round((e.n / totalP) * 100)}%` : "0%", fontSize: 8, alignment: "center", color: "#64748b" },
                    ]),
                  ],
                },
                layout: layoutTabela,
              }
            : { text: "Nenhum lead no período.", italics: true, color: "#94a3b8", fontSize: 9 },

          { text: `Perdidos no período: ${perdidaP}`, fontSize: 8, color: "#94a3b8", margin: [0, 12, 0, 0] },
        ],
        defaultStyle: { fontSize: 9, color: "#1e293b" },
      };

      const tag = p === "hoje" ? "hoje" : p === "7d" ? "7-dias" : p === "30d" ? "30-dias" : "completo";
      (pdfMake as any).createPdf(dd).download(`relatorio-prospeccao-${tag}.pdf`);
    } finally {
      setGerando("");
    }
  }

  useEffect(() => {
    supabase.from("leads").select("*").then(({ data }) => {
      setTodosLeads(data ?? []);
      setLoading(false);
    });
    // Meta do dia: clientes chamados HOJE (zera sozinho todo dia, pois filtra por data).
    const inicioHoje = new Date();
    inicioHoje.setHours(0, 0, 0, 0);
    contarChamados(inicioHoje).then(setChamadosHoje);
    carregarMetaDiaria(META_DIARIA).then((m) => {
      setMetaDiaria(m);
      setMetaInput(String(m));
    });
    // Busca as interações recentes e mantém só a última de cada lead
    supabase
      .from("interacoes")
      .select("lead_id, conteudo, created_at")
      .order("created_at", { ascending: false })
      .limit(800)
      .then(({ data }) => {
        const map: Record<string, LastInter> = {};
        (data ?? []).forEach((i: { lead_id: string; conteudo: string; created_at: string }) => {
          if (!map[i.lead_id]) map[i.lead_id] = { conteudo: i.conteudo, created_at: i.created_at };
        });
        setInteracoesMap(map);
      });
    // Atividades dos últimos 7 dias (para o popup)
    const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from("interacoes")
      .select("id, lead_id, conteudo, created_at, tipo")
      .gte("created_at", seteDiasAtras)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setAtividades7d((data ?? []) as Atividade7d[]);
      });
  }, []);

  // === Counts por status ===
  const counts = LEAD_STATUSES.reduce((acc, s) => {
    acc[s] = leads.filter((l) => l.status === s).length;
    return acc;
  }, {} as Record<LeadStatus, number>);

  // === KPIs principais ===
  const total = leads.length;
  const ativos = ACTIVE_STATUSES.reduce((sum, s) => sum + (counts[s] || 0), 0);
  const fechados = counts["fechou"] || 0;
  const perdidos = counts["perdida"] || 0;
  const descartados = counts["descartado"] || 0;
  const hot = HOT_STATUSES.reduce((sum, s) => sum + (counts[s] || 0), 0);

  // Funnel cumulativo: dms = todos que passaram por dm_enviada ou além
  const dmsAlcancadas = ["dm_enviada","mensagem_1","mensagem_2","mensagem_3","atendimento_ia","email_a_enviar","email_enviado","respondeu","interessado","stand_by","fechou","perdida"]
    .reduce((s, k) => s + (counts[k as LeadStatus] || 0), 0);
  const responderam = ["respondeu","interessado","stand_by","fechou","perdida"]
    .reduce((s, k) => s + (counts[k as LeadStatus] || 0), 0);
  const taxaResposta = dmsAlcancadas > 0 ? ((responderam / dmsAlcancadas) * 100) : 0;
  const taxaFechamentoSobreDM = dmsAlcancadas > 0 ? ((fechados / dmsAlcancadas) * 100) : 0;
  const interesseTotal = (counts.interessado || 0) + (counts.fechou || 0) + (counts.perdida || 0);
  const taxaFechamentoSobreInteresse = interesseTotal > 0 ? (fechados / interesseTotal) * 100 : 0;

  // === Metas do dia: placar do time e quem está liderando ===
  const feitosPorAtendente = ATENDENTES_META.map((n) => chamadosHoje[primeiroNome(n)] ?? 0);
  const totalTime = feitosPorAtendente.reduce((a, b) => a + b, 0);
  const metaTime = metaDiaria * ATENDENTES_META.length;
  const pctTime = metaTime > 0 ? Math.min(100, Math.round((totalTime / metaTime) * 100)) : 0;
  const maxFeitos = Math.max(0, ...feitosPorAtendente);

  // === Performance por responsável ===
  const responsaveisMap: Record<string, { total: number; hot: number; fechou: number; perdida: number }> = {};
  leads.forEach((l) => {
    const key = l.responsavel?.trim() || "— Sem responsável";
    if (!responsaveisMap[key]) responsaveisMap[key] = { total: 0, hot: 0, fechou: 0, perdida: 0 };
    responsaveisMap[key].total++;
    if (HOT_STATUSES.includes(l.status)) responsaveisMap[key].hot++;
    if (l.status === "fechou") responsaveisMap[key].fechou++;
    if (l.status === "perdida") responsaveisMap[key].perdida++;
  });
  const responsaveisRanking = Object.entries(responsaveisMap)
    .map(([nome, v]) => ({
      nome, ...v,
      // Win rate: fechados sobre negócios já decididos (fechou + perdida)
      taxa: (v.fechou + v.perdida) > 0 ? (v.fechou / (v.fechou + v.perdida)) * 100 : 0,
    }))
    .sort((a, b) => b.taxa - a.taxa || b.fechou - a.fechou)
    .slice(0, 6);

  // === Fonte da oportunidade ===
  const fonteMap: Record<string, number> = {};
  leads.forEach((l) => {
    const f = l.fonte_oportunidade?.trim() || "Não informada";
    fonteMap[f] = (fonteMap[f] || 0) + 1;
  });
  const fonteData = Object.entries(fonteMap)
    .map(([fonte, count]) => ({ fonte, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 7);

  // === Tendência semanal ===
  const weeklyData = Object.entries(
    leads.reduce((acc, l) => {
      const d = new Date(l.created_at);
      const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
      const k = ws.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([semana, total]) => ({ semana, total })).slice(-12);

  // === Atividade recente (últimos 6 atualizados) ===
  const atividadeRecente = [...leads]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 6);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-violet border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-bright tracking-tight">{embutido ? "Prospecção" : "Dashboard"}</h1>
          <p className="text-dim text-xs mt-1.5 tracking-wide">
            Visão geral da prospecção · <span className="text-muted">{rotuloFaixa(faixa)}</span>
          </p>
        </div>

        {!controlado && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro de período */}
          <div className="flex overflow-hidden rounded-lg border border-edge-subtle text-[11px]">
            {ATALHOS.map((p) => (
              <button
                key={p}
                onClick={() => setFaixaLocal({ periodo: p })}
                className={`px-3 py-1.5 font-medium transition ${
                  faixa.periodo === p ? "bg-violet text-white" : "text-dim hover:text-bright hover:bg-surface"
                }`}
              >
                {PERIODO_CURTO[p]}
              </button>
            ))}
          </div>

          {/* Relatórios em PDF */}
          <span className="ml-1 text-[11px] text-dim">Relatório PDF:</span>
          {(["hoje", "7d", "30d"] as Periodo[]).map((p) => (
            <button
              key={p}
              onClick={() => gerarPdf(p)}
              disabled={!!gerando}
              className="inline-flex items-center gap-1 rounded-lg border border-edge-subtle px-2.5 py-1.5 text-[11px] font-medium text-dim transition hover:bg-surface hover:text-bright disabled:opacity-50"
            >
              <DownloadSimple size={13} />
              {gerando === p ? "Gerando…" : p === "hoje" ? "Hoje" : p === "7d" ? "7 dias" : "30 dias"}
            </button>
          ))}
        </div>
        )}
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPI label="Total de Leads" value={total} color="#3B82F6" sub={`${ativos} ativos`} delay={0} />
        <KPI label="Em Fase Quente" value={hot} color="#f43f5e" sub="Interessado · Reunião · Testando" delay={60} />
        <KPI label="Fechados" value={fechados} color="#10b981" sub={`${perdidos} perdidos · ${descartados} descartados`} delay={120} />
        <KPI label="Conversão DM → Fechou" value={`${taxaFechamentoSobreDM.toFixed(1)}%`} color="#22d3ee" sub={`${taxaResposta.toFixed(0)}% taxa de resposta`} delay={180} />
      </div>

      {!embutido && <QuadroVendas />}

      {/* Metas do dia — clientes chamados por atendente */}
      <section className="bg-raised border border-edge-subtle rounded-xl p-5 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-bright tracking-tight">Metas do dia ⚡</h2>
            <p className="text-dim text-[11px] mt-1">
              Cada lead que sai de <b>Novo Maps</b>/<b>Novo Instagram</b> para outra etapa conta 1 cliente chamado para o responsável · zera todo dia
            </p>
          </div>

          {/* Placar do time */}
          <div className="min-w-[190px]">
            {/* Alterar meta — exclusivo do administrador */}
            {isAdmin && (
              <button
                onClick={() => {
                  setMetaInput(String(metaDiaria));
                  setEditMeta(true);
                }}
                className="mb-2 ml-auto flex items-center gap-1.5 rounded-lg border border-edge-subtle px-2.5 py-1 text-[10px] font-semibold text-dim transition hover:border-violet/40 hover:text-bright"
                title="Alterar a meta diária de cada atendente"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                Alterar meta
              </button>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-dim">Time hoje</span>
              <span className="text-[13px] font-bold tabular-nums text-bright">
                {totalTime}
                <span className="text-dim font-medium"> / {metaTime}</span>
              </span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full" style={{ background: "var(--color-edge)" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${pctTime}%`,
                  background:
                    totalTime >= metaTime
                      ? "linear-gradient(90deg,#10b981,#34d399)"
                      : "linear-gradient(90deg,#3B82F6,#2DD4BF)",
                }}
              />
            </div>
            <p className="mt-1 text-right text-[10px] text-dim">
              {totalTime >= metaTime ? "Time bateu a meta! 🏆" : `${pctTime}% da meta do time`}
            </p>
          </div>
        </div>

        {/* Modal: alterar meta diária (ADM) */}
        {editMeta && isAdmin && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => setEditMeta(false)}
          >
            <div
              className="w-full max-w-xs rounded-2xl border border-modal-border bg-modal-bg p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-[15px] font-bold text-bright">Alterar meta diária</h3>
              <p className="mt-1 text-[11px] text-dim">
                Quantos clientes cada atendente precisa chamar por dia. Vale para todos e passa a valer na hora.
              </p>
              <input
                type="number"
                min={1}
                max={1000}
                value={metaInput}
                autoFocus
                onChange={(e) => setMetaInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (document.getElementById("btn-salvar-meta") as HTMLButtonElement)?.click()}
                className="campo mt-4"
              />
              <div className="mt-4 flex gap-2">
                <button
                  id="btn-salvar-meta"
                  disabled={salvandoMeta}
                  onClick={async () => {
                    const n = Math.max(1, Math.min(1000, Number(metaInput) || 0));
                    if (!n) return;
                    setSalvandoMeta(true);
                    try {
                      await salvarMetaDiaria(n);
                      setMetaDiaria(n);
                      setEditMeta(false);
                    } catch (err) {
                      alert("Não foi possível salvar a meta: " + (err as Error).message);
                    } finally {
                      setSalvandoMeta(false);
                    }
                  }}
                  className="h-[34px] flex-1 rounded-lg bg-violet text-xs font-semibold text-white transition hover:bg-violet-deep disabled:opacity-60"
                >
                  {salvandoMeta ? "Salvando…" : "Salvar"}
                </button>
                <button
                  onClick={() => setEditMeta(false)}
                  className="h-[34px] rounded-lg border border-edge-subtle px-4 text-xs font-medium text-dim transition hover:text-bright"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ATENDENTES_META.map((nome, i) => {
            const feitos = chamadosHoje[primeiroNome(nome)] ?? 0;
            return (
              <MetaCard
                key={nome}
                nome={nome}
                feitos={feitos}
                meta={metaDiaria}
                delay={i * 60}
                lider={feitos > 0 && feitos === maxFeitos}
              />
            );
          })}
        </div>
      </section>

      {/* Atividade recente — logo após os KPIs (em ambos mobile e desktop). Clique abre popup com 7 dias */}
      <button
        type="button"
        onClick={() => setModalAtividadesOpen(true)}
        className="w-full text-left bg-raised border border-edge-subtle rounded-xl p-5 lg:p-6 mb-6 transition-colors hover:border-violet/40 cursor-pointer"
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-semibold text-dim uppercase tracking-widest">Atividade recente</p>
          <span className="text-[9px] text-violet-light uppercase tracking-widest">Ver últimos 7 dias →</span>
        </div>
        <div className="space-y-2.5">
          {atividadeRecente.length === 0 && <p className="text-dim text-xs">Sem leads ainda.</p>}
          {atividadeRecente.map((l) => {
            const inter = interacoesMap[l.id];
            return (
              <div key={l.id} className="flex items-start gap-2 pb-2.5 border-b border-edge-subtle/50 last:border-b-0 last:pb-0">
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: STATUS_HEX[l.status] }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[12px] font-semibold text-bright truncate flex-1 min-w-0">{l.nome_loja || `@${l.instagram}`}</p>
                    <FonteLogo fonte={l.fonte_oportunidade} />
                    <span className="text-[9px] text-dim shrink-0 tabular-nums">
                      {new Date(l.updated_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-[10px] text-dim mt-0.5 truncate">
                    {inter?.conteudo || STATUS_LABELS[l.status]}
                    {" · "}
                    <span className={l.responsavel ? "text-violet-light font-medium" : "text-dim/70 italic"}>
                      {l.responsavel || "sem responsável"}
                    </span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </button>

      {/* Total de Leads por Etapa — quadrinhos */}
      <p className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-3">Total de Leads por Etapa</p>
      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10 gap-2 mb-8">
        {LEAD_STATUSES.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setEtapaSelecionada(s)}
            className="stagger-in bg-raised border border-edge-subtle rounded-lg p-3 text-center hover:border-violet/40 transition-colors cursor-pointer"
            style={{ animationDelay: `${240 + i * 25}ms` }}
          >
            <div className="w-2 h-2 rounded-full mx-auto mb-1.5" style={{ background: STATUS_HEX[s] }} />
            <p className="text-[8px] text-dim uppercase tracking-widest leading-tight min-h-[18px]">{STATUS_LABELS[s]}</p>
            <p className="text-base font-bold mt-1 tabular-nums" style={{ color: STATUS_HEX[s] }}>{counts[s] || 0}</p>
          </button>
        ))}
      </div>

      {/* Funil de conversão */}
      <div className="mb-6">
        <div className="bg-raised border border-edge-subtle rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-semibold text-dim uppercase tracking-widest">Funil de conversão</p>
            <span className="text-[10px] text-dim">
              Conversão fim a fim: <span className="text-bright font-bold">{taxaFechamentoSobreDM.toFixed(1)}%</span>
            </span>
          </div>
          <FunnelChart counts={counts} />
          <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-edge-subtle">
            <MiniMetric label="Taxa de resposta" value={`${taxaResposta.toFixed(1)}%`} />
            <MiniMetric label="Interesse → Fechou" value={`${taxaFechamentoSobreInteresse.toFixed(1)}%`} />
            <MiniMetric label="Stand By" value={`${counts.stand_by || 0}`} sub="aguardando retomar" />
          </div>
        </div>
      </div>

      {/* Responsáveis + Fonte */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-raised border border-edge-subtle rounded-xl p-6">
          <p className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-4">Top responsáveis</p>
          <div className="space-y-2">
            {responsaveisRanking.length === 0 && (
              <p className="text-dim text-xs">Nenhum responsável atribuído ainda.</p>
            )}
            {responsaveisRanking.map((r, i) => (
              <div key={r.nome} className="flex items-center gap-3 text-xs py-1.5">
                <span className="text-dim font-bold w-5 text-right tabular-nums">{i + 1}</span>
                <span className="flex-1 text-bright font-medium truncate">{r.nome}</span>
                <span className="text-dim tabular-nums w-12 text-right">{r.total}</span>
                <span className="text-rose tabular-nums w-10 text-right">{r.hot}🔥</span>
                <span className="text-emerald tabular-nums w-10 text-right">{r.fechou}✓</span>
                <span className="text-emerald font-bold tabular-nums w-12 text-right">{r.taxa.toFixed(0)}%</span>
              </div>
            ))}
            {responsaveisRanking.length > 0 && (
              <div className="flex items-center gap-3 text-[9px] uppercase tracking-widest text-dim/60 pt-2 mt-2 border-t border-edge-subtle">
                <span className="w-5" />
                <span className="flex-1">Nome</span>
                <span className="w-12 text-right">Total</span>
                <span className="w-10 text-right">Quente</span>
                <span className="w-10 text-right">Fechou</span>
                <span className="w-12 text-right">Win %</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-raised border border-edge-subtle rounded-xl p-6">
          <p className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-4">Fonte da oportunidade</p>
          {fonteData.length === 0 ? (
            <p className="text-dim text-xs">Nenhuma fonte registrada.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={fonteData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="fonte" type="category" tick={{ fill: tickColorBold, fontSize: 11, fontFamily: "Sora" }} axisLine={false} tickLine={false} width={120} />
                <Tooltip
                  contentStyle={{ backgroundColor: tooltipBg, backdropFilter: "blur(12px)", border: `1px solid ${tooltipBorder}`, borderRadius: "10px", fontSize: "11px", fontFamily: "Sora" }}
                  itemStyle={{ color: isLight ? "#2563EB" : "#2DD4BF" }}
                  cursor={{ fill: cursorFill }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="url(#fGrad)" />
                <defs>
                  <linearGradient id="fGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#3B82F6" />
                    <stop offset="100%" stopColor="#2DD4BF" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Tendência semanal — linha inteira */}
      <div>
        <div className="bg-raised border border-edge-subtle rounded-xl p-6">
          <p className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-4">Leads novos por semana</p>
          {weeklyData.length === 0 ? (
            <p className="text-dim text-xs">Sem dados ainda.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklyData}>
                <XAxis dataKey="semana" tick={{ fill: tickColor, fontSize: 10, fontFamily: "Sora" }} axisLine={{ stroke: axisLineColor }} tickLine={false} />
                <YAxis tick={{ fill: tickColor, fontSize: 10, fontFamily: "Sora" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: tooltipBg, backdropFilter: "blur(12px)", border: `1px solid ${tooltipBorder}`, borderRadius: "10px", fontSize: "11px", fontFamily: "Sora" }}
                  labelStyle={{ color: tooltipLabelColor }}
                  itemStyle={{ color: isLight ? "#2563EB" : "#2DD4BF" }}
                  cursor={{ fill: cursorFill }}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]} fill="url(#vGrad)" />
                <defs>
                  <linearGradient id="vGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" />
                    <stop offset="100%" stopColor="#2DD4BF" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

      </div>

      {/* Popup — leads de uma etapa */}
      {etapaSelecionada && (
        <LeadsPorEtapaModal
          status={etapaSelecionada}
          leads={leads}
          onClose={() => setEtapaSelecionada(null)}
        />
      )}

      {/* Popup — atividades dos últimos 7 dias */}
      {modalAtividadesOpen && (
        <div
          className="fixed inset-0 bg-base/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setModalAtividadesOpen(false)}
        >
          <div
            className="bg-raised border border-edge rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-raised border-b border-edge-subtle px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-bold text-bright">Atividades dos últimos 7 dias</h2>
                <p className="text-[10px] text-dim mt-0.5">{atividades7d.length} interaç{atividades7d.length === 1 ? "ão" : "ões"}</p>
              </div>
              <button
                onClick={() => setModalAtividadesOpen(false)}
                aria-label="Fechar"
                className="w-8 h-8 rounded-md flex items-center justify-center text-dim hover:text-bright hover:bg-surface/60 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-3">
              {atividades7d.length === 0 && (
                <p className="text-dim text-xs text-center py-8">Sem atividades nos últimos 7 dias.</p>
              )}
              {atividades7d.map((a) => {
                const lead = leads.find((l) => l.id === a.lead_id);
                if (!lead) return null;
                return (
                  <div key={a.id} className="flex items-start gap-2 pb-3 border-b border-edge-subtle/50 last:border-b-0 last:pb-0">
                    <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: STATUS_HEX[lead.status] }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[13px] font-semibold text-bright truncate flex-1 min-w-0">{lead.nome_loja || `@${lead.instagram}`}</p>
                        <FonteLogo fonte={lead.fonte_oportunidade} />
                        <span className="text-[10px] text-dim shrink-0 tabular-nums">
                          {new Date(a.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-[11px] text-sub mt-1 leading-relaxed">{a.conteudo}</p>
                      <p className="text-[10px] mt-0.5">
                        <span className="text-dim">Responsável: </span>
                        <span className={lead.responsavel ? "text-violet-light font-medium" : "text-dim/70 italic"}>
                          {lead.responsavel || "sem responsável"}
                        </span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// === Componentes auxiliares ===
function KPI({ label, value, color, sub, delay }: { label: string; value: number | string; color: string; sub?: string; delay?: number }) {
  return (
    <div className="stagger-in bg-raised border border-edge-subtle rounded-xl p-5" style={{ animationDelay: `${delay || 0}ms` }}>
      <p className="text-[10px] font-semibold text-dim uppercase tracking-widest">{label}</p>
      <p className="text-3xl font-bold mt-2 tabular-nums" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-dim mt-1.5 truncate">{sub}</p>}
    </div>
  );
}

function MiniMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[9px] font-bold text-dim uppercase tracking-widest">{label}</p>
      <p className="text-lg font-bold text-bright tabular-nums mt-1">{value}</p>
      {sub && <p className="text-[10px] text-dim">{sub}</p>}
    </div>
  );
}
