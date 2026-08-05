import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import WhatsappButton from "../components/WhatsappButton";
import InstagramButton from "../components/InstagramButton";
import { formatarTelefone, paraWhatsapp } from "../lib/telefone";

const CAPTACAO_URL = "https://calmo-captacao.btm5u7.easypanel.host";

// ----------------- tipos -----------------
interface LeadMaps {
  id: string;
  empresa: string | null;
  categoria: string | null;
  categoria_negocio: string | null;
  site: string | null;
  telefone: string | null;
  whatsapp: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  avaliacao: number | null;
  reviews: number | null;
  maps_url: string | null;
  place_id: string | null;
  fonte_oportunidade: string | null;
  enviado_crm: boolean | null;
  dados: Record<string, unknown> | null;
  created_at: string;
  job_id: string | null;
}

type Plataforma = "google_maps" | "instagram" | "tiktok";

// Protege o popup: se algo falhar ao renderizar um lead, mostra aviso em vez de tela branca
class PopupBoundary extends Component<{ onClose: () => void; children: ReactNode }, { erro: boolean }> {
  state = { erro: false };
  static getDerivedStateFromError() { return { erro: true }; }
  componentDidCatch(e: unknown) { console.error("Erro ao abrir lead:", e); }
  render() {
    if (this.state.erro) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={this.props.onClose}>
          <div className="bg-modal-bg border border-modal-border rounded-2xl w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-bright font-semibold text-sm">Não foi possível abrir este lead</p>
            <p className="text-dim text-xs mt-1">Atualize a página (Ctrl+Shift+R) e tente de novo.</p>
            <button onClick={this.props.onClose} className="mt-4 px-4 py-2 rounded-lg bg-violet hover:bg-violet-deep text-white text-sm font-semibold transition-all">Fechar</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Chave única do lead no CRM (a tabela leads é centrada em instagram)
const chaveDe = (l: LeadMaps) => `maps:${l.place_id ?? l.id}`;

// Monta a linha do CRM a partir de um lead do Google Maps
/** Responsáveis que podem ser atribuídos ao enviar leads da captação para o CRM. */
const RESPONSAVEIS = ["Victor", "Gabriel"];

function rowParaCRM(lead: LeadMaps, responsavel?: string) {
  return {
    instagram: chaveDe(lead),
    nome_loja: lead.empresa,
    site: lead.site,
    telefone: formatarTelefone(lead.telefone ?? lead.whatsapp),
    whatsapp: paraWhatsapp(lead.whatsapp ?? lead.telefone),
    fonte_oportunidade: "Google Maps",
    plataforma: "google_maps",
    status: "novo_maps", // Google Maps entra na pipeline "Novo Maps"
    ...(responsavel ? { responsavel } : {}),
  };
}

// Envia 1..N leads ao CRM (upsert) e marca como enviado
async function enviarLeadsCRM(leads: LeadMaps[], responsavel?: string) {
  if (!leads.length) return;
  const { error } = await supabase
    .from("leads")
    .upsert(leads.map((l) => rowParaCRM(l, responsavel)), { onConflict: "instagram" });
  if (error) throw error;
  await supabase.from("leads_google_maps").update({ enviado_crm: true }).in("id", leads.map((l) => l.id));
}

// ---- Instagram ----
interface LeadIG {
  id: string;
  username: string | null;
  nome: string | null;
  bio: string | null;
  site: string | null;
  seguidores: number | null;
  seguindo: number | null;
  posts: number | null;
  is_business: boolean | null;
  is_verified: boolean | null;
  is_private: boolean | null;
  foto_url: string | null;
  categoria: string | null;
  telefone: string | null;
  perfil_origem: string | null;
  enviado_crm: boolean | null;
  dados: Record<string, unknown> | null;
  created_at: string;
}

function rowIGParaCRM(lead: LeadIG, responsavel?: string) {
  return {
    instagram: (lead.username ?? "").toLowerCase(),
    nome_loja: lead.nome,
    site: lead.site,
    seguidores: lead.seguidores,
    telefone: formatarTelefone(lead.telefone),
    whatsapp: paraWhatsapp(lead.telefone),
    fonte_oportunidade: "Instagram",
    plataforma: "instagram",
    status: "novo",
    ...(responsavel ? { responsavel } : {}),
  };
}

async function enviarLeadsIG(leads: LeadIG[], responsavel?: string) {
  if (!leads.length) return;
  const { error } = await supabase
    .from("leads")
    .upsert(leads.map((l) => rowIGParaCRM(l, responsavel)), { onConflict: "instagram" });
  if (error) throw error;
  await supabase.from("leads_instagram").update({ enviado_crm: true }).in("id", leads.map((l) => l.id));
}

/** Botão de excluir (lixeira) usado nas linhas das tabelas de captação. */
function BotaoExcluir({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Excluir lead capturado"
      className="inline-flex items-center justify-center rounded-lg px-1.5 py-1 text-rose transition hover:bg-rose/10"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
        <path d="M10 11v6M14 11v6" />
      </svg>
    </button>
  );
}

const NUMBR = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR"));

// ============================================================
export default function Captacao() {
  const [view, setView] = useState<"hub" | Plataforma>("hub");

  return view === "hub" ? (
    <Hub onOpen={setView} />
  ) : view === "google_maps" ? (
    <GoogleMapsScraper onBack={() => setView("hub")} />
  ) : view === "instagram" ? (
    <InstagramScraper onBack={() => setView("hub")} />
  ) : (
    <EmBreve plataforma={view} onBack={() => setView("hub")} />
  );
}

// ----------------- HUB (3 botões) -----------------
function Hub({ onOpen }: { onOpen: (p: Plataforma) => void }) {
  const [counts, setCounts] = useState({ google_maps: 0, instagram: 0, tiktok: 0 });

  useEffect(() => {
    (async () => {
      try {
        const gm = await supabase.from("leads_google_maps").select("id", { count: "exact", head: true });
        const ig = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("plataforma", "instagram");
        const tk = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("plataforma", "tiktok");
        setCounts({ google_maps: gm.count ?? 0, instagram: ig.count ?? 0, tiktok: tk.count ?? 0 });
      } catch { /* banco parcial */ }
    })();
  }, []);

  const total = counts.google_maps + counts.instagram + counts.tiktok;

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-bright tracking-tight">Captação de leads</h1>
        <p className="text-dim text-xs mt-1.5 tracking-wide">
          Escolha uma fonte para buscar novos clientes · {total.toLocaleString("pt-BR")} capturados no total
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SourceButton
          label="Google Maps"
          desc="Busque empresas por segmento e região"
          total={counts.google_maps}
          gradient="linear-gradient(135deg, #4285F4 0%, #34A853 50%, #FBBC05 100%)"
          ativo
          onClick={() => onOpen("google_maps")}
          icon={
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          }
        />
        <SourceButton
          label="Instagram"
          desc="Capture seguidores de um perfil"
          total={counts.instagram}
          gradient="linear-gradient(135deg, #833AB4 0%, #E1306C 50%, #F77737 100%)"
          onClick={() => onOpen("instagram")}
          icon={
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
            </svg>
          }
        />
      </div>
    </div>
  );
}

function SourceButton({
  label, desc, total, gradient, icon, onClick, ativo,
}: {
  label: string; desc: string; total: number; gradient: string;
  icon: React.ReactNode; onClick: () => void; ativo?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden text-left bg-surface/40 border border-edge-subtle rounded-2xl p-6 hover:bg-surface/80 hover:border-violet/30 transition-all hover:-translate-y-0.5"
    >
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: gradient }} aria-hidden />
      <div className="flex items-start justify-between mb-5">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg" style={{ background: gradient }}>
          {icon}
        </div>
        <span className="text-[32px] font-extrabold font-display text-bright tabular-nums leading-none">
          {total.toLocaleString("pt-BR")}
        </span>
      </div>
      <p className="text-[15px] font-bold text-bright">{label}</p>
      <p className="text-dim text-xs mt-1">{desc}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-violet-light group-hover:gap-2 transition-all">
        {ativo ? "Abrir scraper" : "Abrir"}
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
      </span>
    </button>
  );
}

// ----------------- barra de topo (voltar) -----------------
function TopoScraper({ titulo, sub, onBack, gradient, icon, children }: {
  titulo: string; sub: string; onBack: () => void; gradient: string; icon: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mb-7">
      <button onClick={onBack} className="shrink-0 w-9 h-9 rounded-lg bg-surface hover:bg-raised border border-edge-subtle flex items-center justify-center text-sub transition-all" aria-label="Voltar">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
      </button>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: gradient }}>
        {icon}
      </div>
      <div className="mr-auto">
        <h1 className="text-[19px] font-bold text-bright tracking-tight leading-tight">{titulo}</h1>
        <p className="text-dim text-[11px] tracking-wide">{sub}</p>
      </div>
      {children}
    </div>
  );
}

const IconMaps = <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>;
const IconIG = <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>;

// ============================================================
//  GOOGLE MAPS SCRAPER
// ============================================================
function GoogleMapsScraper({ onBack }: { onBack: () => void }) {
  const [segmento, setSegmento] = useState("");
  const [localizacao, setLocalizacao] = useState("");
  const [quantidade, setQuantidade] = useState(20);

  const [rodando, setRodando] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [erro, setErro] = useState("");

  const [leads, setLeads] = useState<LeadMaps[]>([]);
  const [crmKeys, setCrmKeys] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<LeadMaps | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [respLote, setRespLote] = useState(""); // responsável atribuído no envio ao CRM
  const [enviandoLote, setEnviandoLote] = useState(false);
  const [loteMsg, setLoteMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLeads = useCallback(async () => {
    try {
      const [lg, cr] = await Promise.all([
        supabase.from("leads_google_maps").select("*").order("created_at", { ascending: false }).limit(1000),
        supabase.from("leads").select("instagram").like("instagram", "maps:%").limit(10000),
      ]);
      setLeads((lg.data as LeadMaps[]) ?? []);
      setCrmKeys(new Set(((cr.data as { instagram: string }[]) ?? []).map((r) => r.instagram)));
    } catch { /* vazio */ }
  }, []);

  // um lead já está no CRM se sua chave existe na tabela leads (ou marcado localmente)
  const estaNoCRM = useCallback(
    (l: LeadMaps) => crmKeys.has(chaveDe(l)) || !!l.enviado_crm,
    [crmKeys]
  );

  useEffect(() => {
    fetchLeads();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchLeads]);

  async function iniciar() {
    setErro("");
    if (!segmento.trim()) { setErro("Informe o segmento a buscar (ex: lojas de roupa)."); return; }
    setRodando(true);
    setStatusMsg("Iniciando busca…");
    try {
      const r = await fetch(`${CAPTACAO_URL}/api/scraper/google-maps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmento: segmento.trim(), localizacao: localizacao.trim(), quantidade }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao iniciar a busca.");
      setStatusMsg("Buscando empresas… isso pode levar 1–3 min.");
      poll(j.jobId);
    } catch (e) {
      setErro((e as Error).message);
      setRodando(false);
      setStatusMsg("");
    }
  }

  function poll(jobId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${CAPTACAO_URL}/api/scraper/status/${jobId}`);
        const j = await r.json();
        if (j.status === "done") {
          clearInterval(pollRef.current!);
          setRodando(false);
          setStatusMsg(`✓ ${j.total ?? 0} empresas capturadas.`);
          fetchLeads();
        } else if (j.status === "error") {
          clearInterval(pollRef.current!);
          setRodando(false);
          setErro(j.message || "A busca falhou. Tente novamente.");
          setStatusMsg("");
        }
      } catch { /* segue tentando */ }
    }, 4000);
  }

  const filtrados = useMemo(() => {
    const t = busca.toLowerCase();
    if (!t) return leads;
    return leads.filter((m) =>
      (m.empresa ?? "").toLowerCase().includes(t) ||
      (m.categoria ?? m.categoria_negocio ?? "").toLowerCase().includes(t) ||
      (m.cidade ?? "").toLowerCase().includes(t) ||
      (m.telefone ?? "").toLowerCase().includes(t)
    );
  }, [leads, busca]);

  function toggleSel(id: string) {
    setSelecionados((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  // só dá pra selecionar quem AINDA não está no CRM
  const selecionaveis = filtrados.filter((l) => !estaNoCRM(l));
  const todosMarcados = selecionaveis.length > 0 && selecionaveis.every((l) => selecionados.has(l.id));
  function toggleTodos() {
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (selecionaveis.every((l) => n.has(l.id))) selecionaveis.forEach((l) => n.delete(l.id));
      else selecionaveis.forEach((l) => n.add(l.id));
      return n;
    });
  }

  // Exclui leads CAPTURADOS (não mexe nos que já foram para o CRM).
  async function excluirLeads(ids: string[]) {
    if (!ids.length) return;
    const msg = ids.length === 1 ? "Excluir este lead capturado?" : `Excluir ${ids.length} leads capturados?`;
    if (!confirm(`${msg}\n\nIsso remove só da lista de captação — quem já foi enviado ao CRM continua lá.`)) return;
    setLoteMsg("");
    try {
      const { error } = await supabase.from("leads_google_maps").delete().in("id", ids);
      if (error) throw error;
      setSelecionados((prev) => {
        const n = new Set(prev);
        ids.forEach((i) => n.delete(i));
        return n;
      });
      setLoteMsg(`✓ ${ids.length} excluído(s).`);
      fetchLeads();
    } catch (e) {
      setLoteMsg("Erro ao excluir: " + (e as Error).message);
    }
  }

  async function enviarLote() {
    const leadsSel = leads.filter((l) => selecionados.has(l.id) && !estaNoCRM(l));
    if (!leadsSel.length) return;
    setEnviandoLote(true);
    setLoteMsg("");
    try {
      await enviarLeadsCRM(leadsSel, respLote || undefined);
      setLoteMsg(`✓ ${leadsSel.length} enviado(s) ao CRM.`);
      setSelecionados(new Set());
      fetchLeads();
    } catch (e) {
      setLoteMsg("Erro ao enviar ao CRM: " + (e as Error).message);
    } finally {
      setEnviandoLote(false);
    }
  }

  return (
    <div className="p-4 lg:p-8">
      <TopoScraper
        titulo="Google Maps"
        sub={`${leads.length.toLocaleString("pt-BR")} empresas capturadas`}
        onBack={onBack}
        gradient="linear-gradient(135deg, #4285F4 0%, #34A853 50%, #FBBC05 100%)"
        icon={IconMaps}
      />

      {/* Quadro de busca */}
      <section className="bg-raised border border-edge-subtle rounded-xl p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_140px_auto] gap-3 md:items-end">
          <Campo label="Segmento" hint="o que buscar">
            <input value={segmento} onChange={(e) => setSegmento(e.target.value)} placeholder="lojas de roupa"
              className="campo" onKeyDown={(e) => e.key === "Enter" && !rodando && iniciar()} />
          </Campo>
          <Campo label="Localização" hint="cidade / região">
            <input value={localizacao} onChange={(e) => setLocalizacao(e.target.value)} placeholder="Curitiba, PR"
              className="campo" onKeyDown={(e) => e.key === "Enter" && !rodando && iniciar()} />
          </Campo>
          <Campo label="Qtd. de leads">
            <input type="number" min={1} max={1000} value={quantidade}
              onChange={(e) => setQuantidade(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
              className="campo" />
          </Campo>
          <button onClick={iniciar} disabled={rodando}
            className="h-[38px] px-5 rounded-lg bg-violet hover:bg-violet-deep disabled:opacity-60 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 whitespace-nowrap">
            {rodando ? (
              <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Buscando…</>
            ) : (
              <>Buscar leads</>
            )}
          </button>
        </div>
        {(statusMsg || erro) && (
          <p className={`text-xs mt-3 ${erro ? "text-rose" : "text-muted"}`}>{erro || statusMsg}</p>
        )}
      </section>

      {/* Lista de leads capturados */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="text-[15px] font-bold text-bright tracking-tight">Leads encontrados</h2>
        {selecionados.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">{selecionados.size} selecionado(s)</span>
            <select
              value={respLote}
              onChange={(e) => setRespLote(e.target.value)}
              title="Responsável pelos leads enviados ao CRM"
              className="h-[30px] rounded-lg px-2 text-xs bg-surface text-bright border border-edge-subtle outline-none focus:border-violet/50"
            >
              <option value="">Sem responsável</option>
              {RESPONSAVEIS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button onClick={enviarLote} disabled={enviandoLote}
              className="h-[30px] px-3.5 rounded-lg bg-violet hover:bg-violet-deep disabled:opacity-60 text-white text-xs font-semibold transition-all flex items-center gap-1.5">
              {enviandoLote ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : null}
              Enviar ao CRM
            </button>
            <button onClick={() => excluirLeads([...selecionados])}
              className="h-[30px] px-3.5 rounded-lg border border-rose/40 text-rose hover:bg-rose/10 text-xs font-semibold transition-all">
              Excluir selecionados
            </button>
            <button onClick={() => setSelecionados(new Set())} className="text-xs text-dim hover:text-muted">limpar</button>
          </div>
        )}
        {loteMsg && <span className={`text-xs ${loteMsg.startsWith("Erro") ? "text-rose" : "text-emerald"}`}>{loteMsg}</span>}
        <div className="relative flex-1 max-w-xs ml-auto">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar empresa, segmento, cidade…"
            className="w-full bg-surface border border-edge-subtle rounded-lg pl-9 pr-3 py-2 text-xs text-text placeholder:text-dim focus:outline-none focus:border-violet/30 transition-all" />
        </div>
      </div>

      <div className="bg-raised border border-edge-subtle rounded-xl overflow-x-auto">
        <table className="w-full text-xs min-w-[720px]">
          <thead>
            <tr className="border-b border-edge text-dim uppercase tracking-widest text-[10px]">
              <th className="px-5 py-3 w-10">
                <input type="checkbox" checked={todosMarcados} onChange={toggleTodos}
                  className="w-4 h-4 cursor-pointer align-middle" style={{ accentColor: "var(--color-violet)" }} aria-label="Selecionar todos" />
              </th>
              <th className="font-semibold text-left px-5 py-3">Empresa</th>
              <th className="font-semibold text-left px-5 py-3">Segmento</th>
              <th className="font-semibold text-left px-5 py-3">Cidade</th>
              <th className="font-semibold text-left px-5 py-3">Telefone</th>
              <th className="font-semibold text-left px-5 py-3">Avaliação</th>
              <th className="font-semibold text-left px-5 py-3">WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((m, i) => (
              <tr key={m.id} onClick={() => setSel(m)}
                className={`stagger-in border-b border-edge-subtle/60 hover:bg-surface/80 transition-colors cursor-pointer ${selecionados.has(m.id) ? "bg-violet/5" : ""}`}
                style={{ animationDelay: `${Math.min(i, 30) * 12}ms` }}>
                <td className="px-5 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" disabled={estaNoCRM(m)} checked={selecionados.has(m.id) && !estaNoCRM(m)} onChange={() => toggleSel(m.id)}
                    className="w-4 h-4 align-middle disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer" style={{ accentColor: "var(--color-violet)" }}
                    title={estaNoCRM(m) ? "Já está no CRM" : undefined} aria-label={`Selecionar ${m.empresa ?? "lead"}`} />
                </td>
                <td className="px-5 py-3 font-medium text-bright text-[13px]">{m.empresa ?? "—"}</td>
                <td className="px-5 py-3 text-muted">{m.categoria ?? m.categoria_negocio ?? "—"}</td>
                <td className="px-5 py-3 text-muted">{m.cidade ?? "—"}</td>
                <td className="px-5 py-3 text-muted tabular-nums">{m.telefone ?? "—"}</td>
                <td className="px-5 py-3 text-muted tabular-nums">{m.avaliacao != null ? `★ ${m.avaliacao} (${m.reviews ?? 0})` : "—"}</td>
                <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <WhatsappButton phone={m.whatsapp ?? m.telefone} name={m.empresa} externo />
                    <BotaoExcluir onClick={() => excluirLeads([m.id])} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length === 0 && (
          <div className="flex flex-col items-center py-16">
            <p className="text-dim text-xs">Nenhum lead ainda.</p>
            <p className="text-dim/70 text-[11px] mt-1">Faça uma busca acima para capturar empresas do Google Maps.</p>
          </div>
        )}
      </div>

      {sel && (
        <PopupBoundary key={sel.id} onClose={() => setSel(null)}>
          <LeadPopup lead={sel} jaNoCRM={estaNoCRM(sel)} onClose={() => setSel(null)} onEnviado={fetchLeads} />
        </PopupBoundary>
      )}
    </div>
  );
}

function Campo({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] text-dim uppercase tracking-widest font-semibold">{label}{hint && <span className="text-dim/60 normal-case tracking-normal font-normal"> · {hint}</span>}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

// ----------------- POPUP do lead -----------------
function LeadPopup({ lead, jaNoCRM, onClose, onEnviado }: { lead: LeadMaps; jaNoCRM: boolean; onClose: () => void; onEnviado: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(jaNoCRM);
  const [erro, setErro] = useState("");

  async function enviarAoCRM() {
    setEnviando(true);
    setErro("");
    try {
      await enviarLeadsCRM([lead]);
      setEnviado(true);
      onEnviado();
    } catch (e) {
      setErro((e as Error).message || "Não foi possível enviar ao CRM.");
    } finally {
      setEnviando(false);
    }
  }

  // campos "amigáveis" + resto dos dados brutos
  const principais: [string, React.ReactNode][] = [
    ["Segmento", lead.categoria ?? lead.categoria_negocio],
    ["Telefone", lead.telefone],
    ["WhatsApp", lead.whatsapp],
    ["Endereço", lead.endereco],
    ["Cidade", lead.cidade],
    ["Estado", lead.estado],
    ["Avaliação", lead.avaliacao != null ? `★ ${lead.avaliacao} · ${lead.reviews ?? 0} avaliações` : null],
    ["Site", lead.site ? <a href={lead.site.startsWith("http") ? lead.site : `https://${lead.site}`} target="_blank" rel="noreferrer" className="text-violet-light hover:underline">{lead.site}</a> : null],
    ["Google Maps", lead.maps_url ? <a href={lead.maps_url} target="_blank" rel="noreferrer" className="text-violet-light hover:underline">abrir no mapa</a> : null],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-modal-bg border border-modal-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="sticky top-0 bg-modal-bg/95 backdrop-blur border-b border-edge-subtle px-6 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[17px] font-bold text-bright leading-tight truncate">{lead.empresa ?? "Empresa"}</h3>
            <p className="text-dim text-xs mt-0.5">{lead.categoria ?? lead.categoria_negocio ?? "—"}</p>
          </div>
          <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-lg hover:bg-surface flex items-center justify-center text-muted" aria-label="Fechar">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* corpo */}
        <div className="px-6 py-5 space-y-3">
          {principais.filter(([, v]) => v != null && v !== "").map(([k, v]) => (
            <div key={k} className="flex gap-3 text-[13px]">
              <span className="w-28 shrink-0 text-dim">{k}</span>
              <span className="text-text min-w-0 break-words">{v}</span>
            </div>
          ))}
        </div>

        {/* footer */}
        <div className="sticky bottom-0 bg-modal-bg/95 backdrop-blur border-t border-edge-subtle px-6 py-4 flex items-center gap-3">
          {enviado ? (
            <span className="inline-flex items-center gap-2 text-emerald text-sm font-semibold">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              {jaNoCRM ? "Já está no CRM" : "Enviado ao CRM"}
            </span>
          ) : (
            <button onClick={enviarAoCRM} disabled={enviando}
              className="px-5 py-2.5 rounded-lg bg-violet hover:bg-violet-deep disabled:opacity-60 text-white text-sm font-semibold transition-all flex items-center gap-2">
              {enviando ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : null}
              Enviar ao CRM
            </button>
          )}
          {erro && <span className="text-rose text-xs">{erro}</span>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  INSTAGRAM SCRAPER (seguidores de um perfil)
// ============================================================
function InstagramScraper({ onBack }: { onBack: () => void }) {
  const [perfil, setPerfil] = useState("");
  const [quantidade, setQuantidade] = useState(50);
  const [rodando, setRodando] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [erro, setErro] = useState("");

  const [leads, setLeads] = useState<LeadIG[]>([]);
  const [crmKeys, setCrmKeys] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<LeadIG | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [respLote, setRespLote] = useState(""); // responsável atribuído no envio ao CRM
  const [enviandoLote, setEnviandoLote] = useState(false);
  const [loteMsg, setLoteMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLeads = useCallback(async () => {
    try {
      const [li, cr] = await Promise.all([
        supabase.from("leads_instagram").select("*").order("seguidores", { ascending: false }).limit(2000),
        supabase.from("leads").select("instagram").limit(20000),
      ]);
      setLeads((li.data as LeadIG[]) ?? []);
      setCrmKeys(new Set(((cr.data as { instagram: string }[]) ?? []).map((r) => (r.instagram || "").toLowerCase())));
    } catch { /* vazio */ }
  }, []);

  const estaNoCRM = useCallback(
    (l: LeadIG) => crmKeys.has((l.username ?? "").toLowerCase()) || !!l.enviado_crm,
    [crmKeys]
  );

  useEffect(() => {
    fetchLeads();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchLeads]);

  async function iniciar() {
    setErro("");
    if (!perfil.trim()) { setErro("Cole o link ou @ do perfil do Instagram."); return; }
    setRodando(true);
    setStatusMsg("Iniciando… coletando seguidores.");
    try {
      const r = await fetch(`${CAPTACAO_URL}/api/scraper/instagram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfil: perfil.trim(), quantidade }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao iniciar a busca.");
      setStatusMsg("Etapa 1/2 · coletando seguidores…");
      poll(j.jobId);
    } catch (e) {
      setErro((e as Error).message);
      setRodando(false);
      setStatusMsg("");
    }
  }

  function poll(jobId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${CAPTACAO_URL}/api/scraper/status/${jobId}`);
        const j = await r.json();
        if (j.fase === "detalhes") setStatusMsg("Etapa 2/2 · puxando dados dos perfis…");
        if (j.status === "done") {
          clearInterval(pollRef.current!);
          setRodando(false);
          setStatusMsg(`✓ ${j.total ?? 0} perfis capturados.`);
          fetchLeads();
        } else if (j.status === "error") {
          clearInterval(pollRef.current!);
          setRodando(false);
          setErro(j.message || "A busca falhou. Tente novamente.");
          setStatusMsg("");
        }
      } catch { /* segue tentando */ }
    }, 4000);
  }

  const filtrados = useMemo(() => {
    const t = busca.toLowerCase();
    if (!t) return leads;
    return leads.filter((m) =>
      (m.username ?? "").toLowerCase().includes(t) ||
      (m.nome ?? "").toLowerCase().includes(t) ||
      (m.bio ?? "").toLowerCase().includes(t)
    );
  }, [leads, busca]);

  function toggleSel(id: string) {
    setSelecionados((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const selecionaveis = filtrados.filter((l) => !estaNoCRM(l));
  const todosMarcados = selecionaveis.length > 0 && selecionaveis.every((l) => selecionados.has(l.id));
  function toggleTodos() {
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (selecionaveis.every((l) => n.has(l.id))) selecionaveis.forEach((l) => n.delete(l.id));
      else selecionaveis.forEach((l) => n.add(l.id));
      return n;
    });
  }
  // Exclui perfis CAPTURADOS (não mexe nos que já foram para o CRM).
  async function excluirLeads(ids: string[]) {
    if (!ids.length) return;
    const msg = ids.length === 1 ? "Excluir este perfil capturado?" : `Excluir ${ids.length} perfis capturados?`;
    if (!confirm(`${msg}\n\nIsso remove só da lista de captação — quem já foi enviado ao CRM continua lá.`)) return;
    setLoteMsg("");
    try {
      const { error } = await supabase.from("leads_instagram").delete().in("id", ids);
      if (error) throw error;
      setSelecionados((prev) => {
        const n = new Set(prev);
        ids.forEach((i) => n.delete(i));
        return n;
      });
      setLoteMsg(`✓ ${ids.length} excluído(s).`);
      fetchLeads();
    } catch (e) {
      setLoteMsg("Erro ao excluir: " + (e as Error).message);
    }
  }

  async function enviarLote() {
    const leadsSel = leads.filter((l) => selecionados.has(l.id) && !estaNoCRM(l));
    if (!leadsSel.length) return;
    setEnviandoLote(true); setLoteMsg("");
    try {
      await enviarLeadsIG(leadsSel, respLote || undefined);
      setLoteMsg(`✓ ${leadsSel.length} enviado(s) ao CRM.`);
      setSelecionados(new Set());
      fetchLeads();
    } catch (e) {
      setLoteMsg("Erro ao enviar ao CRM: " + (e as Error).message);
    } finally { setEnviandoLote(false); }
  }

  return (
    <div className="p-4 lg:p-8">
      <TopoScraper
        titulo="Instagram"
        sub={`${leads.length.toLocaleString("pt-BR")} perfis capturados`}
        onBack={onBack}
        gradient="linear-gradient(135deg, #833AB4 0%, #E1306C 50%, #F77737 100%)"
        icon={IconIG}
      />

      {/* Quadro de busca */}
      <section className="bg-raised border border-edge-subtle rounded-xl p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_150px_auto] gap-3 md:items-end">
          <Campo label="Perfil do Instagram" hint="link ou @ — buscamos os seguidores dele">
            <input value={perfil} onChange={(e) => setPerfil(e.target.value)} placeholder="@marca ou instagram.com/marca"
              className="campo" onKeyDown={(e) => e.key === "Enter" && !rodando && iniciar()} />
          </Campo>
          <Campo label="Qtd. de seguidores" hint="mín. 50">
            <input type="number" min={50} max={1000} value={quantidade}
              onChange={(e) => setQuantidade(Math.max(50, Math.min(1000, Number(e.target.value) || 50)))}
              className="campo" />
          </Campo>
          <button onClick={iniciar} disabled={rodando}
            className="h-[38px] px-5 rounded-lg bg-violet hover:bg-violet-deep disabled:opacity-60 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 whitespace-nowrap">
            {rodando ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Buscando…</> : <>Buscar seguidores</>}
          </button>
        </div>
        {(statusMsg || erro) && <p className={`text-xs mt-3 ${erro ? "text-rose" : "text-muted"}`}>{erro || statusMsg}</p>}
        <p className="text-[11px] text-dim/70 mt-2">Buscas grandes demoram mais (coleta os seguidores e depois os dados de cada perfil). Comece pequeno.</p>
      </section>

      {/* Lista */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="text-[15px] font-bold text-bright tracking-tight">Perfis encontrados</h2>
        {selecionados.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">{selecionados.size} selecionado(s)</span>
            <select
              value={respLote}
              onChange={(e) => setRespLote(e.target.value)}
              title="Responsável pelos leads enviados ao CRM"
              className="h-[30px] rounded-lg px-2 text-xs bg-surface text-bright border border-edge-subtle outline-none focus:border-violet/50"
            >
              <option value="">Sem responsável</option>
              {RESPONSAVEIS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button onClick={enviarLote} disabled={enviandoLote}
              className="h-[30px] px-3.5 rounded-lg bg-violet hover:bg-violet-deep disabled:opacity-60 text-white text-xs font-semibold transition-all flex items-center gap-1.5">
              {enviandoLote ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : null}
              Enviar ao CRM
            </button>
            <button onClick={() => excluirLeads([...selecionados])}
              className="h-[30px] px-3.5 rounded-lg border border-rose/40 text-rose hover:bg-rose/10 text-xs font-semibold transition-all">
              Excluir selecionados
            </button>
            <button onClick={() => setSelecionados(new Set())} className="text-xs text-dim hover:text-muted">limpar</button>
          </div>
        )}
        {loteMsg && <span className={`text-xs ${loteMsg.startsWith("Erro") ? "text-rose" : "text-emerald"}`}>{loteMsg}</span>}
        <div className="relative flex-1 max-w-xs ml-auto">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar @, nome, bio…"
            className="w-full bg-surface border border-edge-subtle rounded-lg pl-9 pr-3 py-2 text-xs text-text placeholder:text-dim focus:outline-none focus:border-violet/30 transition-all" />
        </div>
      </div>

      <div className="bg-raised border border-edge-subtle rounded-xl overflow-x-auto">
        <table className="w-full text-xs min-w-[720px]">
          <thead>
            <tr className="border-b border-edge text-dim uppercase tracking-widest text-[10px]">
              <th className="px-5 py-3 w-10">
                <input type="checkbox" checked={todosMarcados} onChange={toggleTodos} className="w-4 h-4 cursor-pointer align-middle" style={{ accentColor: "var(--color-violet)" }} aria-label="Selecionar todos" />
              </th>
              <th className="font-semibold text-left px-5 py-3">Perfil</th>
              <th className="font-semibold text-left px-5 py-3">Nome</th>
              <th className="font-semibold text-left px-5 py-3">Seguidores</th>
              <th className="font-semibold text-left px-5 py-3">Instagram</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((m, i) => (
              <tr key={m.id} onClick={() => setSel(m)}
                className={`stagger-in border-b border-edge-subtle/60 hover:bg-surface/80 transition-colors cursor-pointer ${selecionados.has(m.id) ? "bg-violet/5" : ""}`}
                style={{ animationDelay: `${Math.min(i, 30) * 12}ms` }}>
                <td className="px-5 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" disabled={estaNoCRM(m)} checked={selecionados.has(m.id) && !estaNoCRM(m)} onChange={() => toggleSel(m.id)}
                    className="w-4 h-4 align-middle disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer" style={{ accentColor: "var(--color-violet)" }}
                    title={estaNoCRM(m) ? "Já está no CRM" : undefined} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    {m.foto_url
                      ? <img src={m.foto_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                      : <div className="w-7 h-7 rounded-full bg-surface shrink-0" />}
                    <a
                      href={`https://instagram.com/${(m.username ?? "").replace(/^@/, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Abrir perfil no Instagram"
                      className="font-medium text-bright text-[13px] flex items-center gap-1 hover:text-violet-light hover:underline"
                    >
                      @{m.username}
                      {m.is_verified && <svg className="w-3 h-3 text-violet-light" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l2.4 2.4L18 4l.6 3.6L22 9l-1.8 3.2L22 15l-3.4 1.4L18 20l-3.6-.4L12 22l-2.4-2.4L6 20l-.6-3.6L2 15l1.8-3.2L2 9l3.4-1.4L6 4l3.6.4z"/></svg>}
                    </a>
                  </div>
                </td>
                <td className="px-5 py-3 text-muted">{m.nome ?? "—"}</td>
                <td className="px-5 py-3 text-muted tabular-nums">{NUMBR(m.seguidores)}</td>
                <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <InstagramButton username={m.username} />
                    <BotaoExcluir onClick={() => excluirLeads([m.id])} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length === 0 && (
          <div className="flex flex-col items-center py-16">
            <p className="text-dim text-xs">Nenhum perfil ainda.</p>
            <p className="text-dim/70 text-[11px] mt-1">Cole um perfil acima e busque os seguidores dele.</p>
          </div>
        )}
      </div>

      {sel && (
        <PopupBoundary key={sel.id} onClose={() => setSel(null)}>
          <IGLeadPopup lead={sel} jaNoCRM={estaNoCRM(sel)} onClose={() => setSel(null)} onEnviado={fetchLeads} />
        </PopupBoundary>
      )}
    </div>
  );
}

function IGLeadPopup({ lead, jaNoCRM, onClose, onEnviado }: { lead: LeadIG; jaNoCRM: boolean; onClose: () => void; onEnviado: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(jaNoCRM);
  const [erro, setErro] = useState("");

  async function enviarAoCRM() {
    setEnviando(true); setErro("");
    try { await enviarLeadsIG([lead]); setEnviado(true); onEnviado(); }
    catch (e) { setErro((e as Error).message || "Não foi possível enviar ao CRM."); }
    finally { setEnviando(false); }
  }

  const campos: [string, React.ReactNode][] = [
    ["Nome", lead.nome],
    ["Seguidores", lead.seguidores != null ? lead.seguidores.toLocaleString("pt-BR") : null],
    ["Seguindo", lead.seguindo != null ? lead.seguindo.toLocaleString("pt-BR") : null],
    ["Posts", lead.posts != null ? lead.posts.toLocaleString("pt-BR") : null],
    ["Segmento", lead.categoria],
    ["Conta comercial", lead.is_business == null ? null : lead.is_business ? "Sim" : "Não"],
    ["Instagram", lead.username ? <a href={`https://instagram.com/${lead.username}`} target="_blank" rel="noreferrer" className="text-violet-light hover:underline">abrir perfil</a> : null],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-modal-bg border border-modal-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-modal-bg/95 backdrop-blur border-b border-edge-subtle px-6 py-4 flex items-start gap-3">
          {lead.foto_url
            ? <img src={lead.foto_url} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
            : <div className="w-11 h-11 rounded-full bg-surface shrink-0" />}
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-bold text-bright leading-tight truncate">@{lead.username}</h3>
            <p className="text-dim text-xs mt-0.5 truncate">{lead.nome ?? "—"}</p>
          </div>
          <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-lg hover:bg-surface flex items-center justify-center text-muted" aria-label="Fechar">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          {lead.bio && <p className="text-[13px] text-text whitespace-pre-line leading-relaxed border-b border-edge-subtle pb-3">{lead.bio}</p>}
          {campos.filter(([, v]) => v != null && v !== "").map(([k, v]) => (
            <div key={k} className="flex gap-3 text-[13px]">
              <span className="w-32 shrink-0 text-dim">{k}</span>
              <span className="text-text min-w-0 break-words">{v}</span>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 bg-modal-bg/95 backdrop-blur border-t border-edge-subtle px-6 py-4 flex items-center gap-3">
          {enviado ? (
            <span className="inline-flex items-center gap-2 text-emerald text-sm font-semibold">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              {jaNoCRM ? "Já está no CRM" : "Enviado ao CRM"}
            </span>
          ) : (
            <button onClick={enviarAoCRM} disabled={enviando}
              className="px-5 py-2.5 rounded-lg bg-violet hover:bg-violet-deep disabled:opacity-60 text-white text-sm font-semibold transition-all flex items-center gap-2">
              {enviando ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : null}
              Enviar ao CRM
            </button>
          )}
          {erro && <span className="text-rose text-xs">{erro}</span>}
        </div>
      </div>
    </div>
  );
}

// ----------------- placeholder Instagram/TikTok -----------------
function EmBreve({ plataforma, onBack }: { plataforma: Plataforma; onBack: () => void }) {
  const nome = plataforma === "instagram" ? "Instagram" : "TikTok";
  return (
    <div className="p-4 lg:p-8">
      <div className="flex items-center gap-3 mb-7">
        <button onClick={onBack} className="shrink-0 w-9 h-9 rounded-lg bg-surface hover:bg-raised border border-edge-subtle flex items-center justify-center text-sub transition-all" aria-label="Voltar">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <h1 className="text-[19px] font-bold text-bright tracking-tight">{nome}</h1>
      </div>
      <div className="bg-raised border border-edge-subtle rounded-xl py-20 flex flex-col items-center">
        <p className="text-bright font-semibold text-sm">Scraper do {nome} em construção</p>
        <p className="text-dim text-xs mt-1">Estamos montando essa fonte logo depois do Google Maps.</p>
      </div>
    </div>
  );
}
