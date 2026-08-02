import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { supabase } from "../lib/supabase";
import type { Lead, Interacao, LeadStatus } from "../types";
import { FONTES_OPORTUNIDADE, CATEGORIAS, ATENDENTES_META } from "../types";
import { hojeLocal, formatarDataBr } from "../../lib/periodo";
import StatusBadge from "./StatusBadge";
import InteracaoForm from "./InteracaoForm";

const TIPO_LABELS: Record<string, string> = {
  dm_enviada: "DM Enviada",
  resposta: "Resposta",
  follow_up: "Follow-up",
  nota: "Nota",
};

const TIPO_ACCENT: Record<string, string> = {
  dm_enviada: "text-cyan",
  resposta: "text-amber",
  follow_up: "text-violet-light",
  nota: "text-dim",
};

interface Props {
  leadId: string;
  onClose: () => void;
  onUpdated?: () => void;
}

export default function LeadModal({ leadId, onClose, onUpdated }: Props) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [interacoes, setInteracoes] = useState<Interacao[]>([]);
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(true);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editTexto, setEditTexto] = useState("");

  useEffect(() => {
    fetchLead();
    fetchInteracoes();
  }, [leadId]);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  async function fetchLead() {
    const { data } = await supabase.from("leads").select("*").eq("id", leadId).single();
    if (data) { setLead(data); setNotas(data.notas ?? ""); }
    setLoading(false);
  }

  async function fetchInteracoes() {
    const { data } = await supabase.from("interacoes").select("*").eq("lead_id", leadId).order("created_at", { ascending: false });
    setInteracoes(data ?? []);
  }

  async function updateStatus(status: LeadStatus) {
    await supabase.from("leads").update({ status }).eq("id", leadId);
    setLead((prev) => (prev ? { ...prev, status } : null));
    onUpdated?.();
  }

  async function salvarNotas() {
    await supabase.from("leads").update({ notas }).eq("id", leadId);
    onUpdated?.();
  }

  async function deletarLead() {
    if (!confirm("Tem certeza que quer deletar esse lead?")) return;
    await supabase.from("interacoes").delete().eq("lead_id", leadId);
    await supabase.from("leads").delete().eq("id", leadId);
    onUpdated?.();
    onClose();
  }

  async function deletarInteracao(id: string) {
    if (!confirm("Apagar esta interacao?")) return;
    await supabase.from("interacoes").delete().eq("id", id);
    await fetchInteracoes();
    onUpdated?.();
  }

  function iniciarEdicao(int: Interacao) {
    setEditandoId(int.id);
    setEditTexto(int.conteudo);
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setEditTexto("");
  }

  async function salvarEdicaoInteracao(id: string) {
    const valor = editTexto.trim();
    if (!valor) { cancelarEdicao(); return; }
    await supabase.from("interacoes").update({ conteudo: valor }).eq("id", id);
    cancelarEdicao();
    await fetchInteracoes();
    onUpdated?.();
  }

  async function togglePontoPositivo() {
    if (!lead) return;
    const novo = !lead.ponto_positivo;
    await supabase.from("leads").update({ ponto_positivo: novo }).eq("id", leadId);
    setLead({ ...lead, ponto_positivo: novo });
    onUpdated?.();
  }

  async function salvarResponsavel(resp: string) {
    const valor = resp.trim() || null;
    await supabase.from("leads").update({ responsavel: valor }).eq("id", leadId);
    setLead((prev) => (prev ? { ...prev, responsavel: valor } : null));
    onUpdated?.();
  }

  async function salvarFonte(fonte: string) {
    const valor = fonte || null;
    await supabase.from("leads").update({ fonte_oportunidade: valor }).eq("id", leadId);
    setLead((prev) => (prev ? { ...prev, fonte_oportunidade: valor } : null));
    onUpdated?.();
  }

  async function salvarTelefone(tel: string) {
    const valor = tel.trim() || null;
    await supabase.from("leads").update({ telefone: valor }).eq("id", leadId);
    setLead((prev) => (prev ? { ...prev, telefone: valor } : null));
    onUpdated?.();
  }

  async function salvarEmail(mail: string) {
    const valor = mail.trim() || null;
    await supabase.from("leads").update({ email: valor }).eq("id", leadId);
    setLead((prev) => (prev ? { ...prev, email: valor } : null));
    onUpdated?.();
  }

  async function salvarNome(valor: string, inputEl: HTMLInputElement) {
    const nome = valor.trim();
    if (!nome) {
      inputEl.value = lead?.nome ?? "";
      return;
    }
    if (nome === lead?.nome) return;
    const { error } = await supabase.from("leads").update({ nome }).eq("id", leadId);
    if (error) {
      alert("Erro: " + error.message);
      inputEl.value = lead?.nome ?? "";
      return;
    }
    setLead((prev) => (prev ? { ...prev, nome } : null));
    onUpdated?.();
  }

  async function salvarAnoNascimento(valor: string) {
    const ano_nascimento = valor ? parseInt(valor, 10) : null;
    await supabase.from("leads").update({ ano_nascimento }).eq("id", leadId);
    setLead((prev) => (prev ? { ...prev, ano_nascimento } : null));
    onUpdated?.();
  }

  async function salvarCategoria(valor: string) {
    const categoria = valor || null;
    await supabase.from("leads").update({ categoria }).eq("id", leadId);
    setLead((prev) => (prev ? { ...prev, categoria } : null));
    onUpdated?.();
  }

  return (
    <div
      className="fixed inset-0 bg-base/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-raised border border-edge rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-5 h-5 border-2 border-violet border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !lead ? (
          <div className="p-20 text-center">
            <p className="text-dim text-sm">Lead nao encontrado.</p>
          </div>
        ) : (
          <div className="p-6">
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-5 right-5 text-dim hover:text-bright text-2xl leading-none z-10"
            >
              ×
            </button>

            {/* Header */}
            <div className="flex items-start justify-between mb-5 pr-8">
              <div>
                <h2 className="text-[18px] font-bold text-bright tracking-tight">
                  {lead.nome}
                </h2>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {lead.categoria && <span className="text-muted text-xs">{lead.categoria}</span>}
                  {lead.ano_nascimento != null && (
                    <>
                      {lead.categoria && <span className="text-edge text-xs">/</span>}
                      <span className="text-muted text-xs tabular-nums">{lead.ano_nascimento}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePontoPositivo}
                  title={lead.ponto_positivo ? "Remover ponto positivo" : "Marcar como ponto positivo"}
                  className={`p-1.5 rounded-lg transition-all ${
                    lead.ponto_positivo
                      ? "bg-emerald/20 text-emerald hover:bg-emerald/30"
                      : "text-dim hover:text-emerald hover:bg-emerald/10"
                  }`}
                >
                  <svg className="w-4 h-4" fill={lead.ponto_positivo ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <StatusBadge status={lead.status} onChange={updateStatus} />
                <button
                  onClick={deletarLead}
                  className="text-dim hover:text-rose text-xs p-1.5 rounded-lg hover:bg-rose/10 transition-all"
                  title="Deletar lead"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Dados da oportunidade */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-2 block">Nome do atleta ou responsável</label>
                <input
                  type="text"
                  defaultValue={lead.nome}
                  onBlur={(e) => salvarNome(e.target.value, e.target)}
                  placeholder="Nome completo"
                  className="w-full bg-surface border border-edge-subtle rounded-lg px-3.5 py-2.5 text-xs text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-2 block">Ano de nascimento</label>
                  <input
                    type="number"
                    defaultValue={lead.ano_nascimento ?? ""}
                    onBlur={(e) => salvarAnoNascimento(e.target.value)}
                    placeholder="2015"
                    min="1950"
                    max={new Date().getFullYear()}
                    className="w-full bg-surface border border-edge-subtle rounded-lg px-3.5 py-2.5 text-xs text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-2 block">Categoria</label>
                  <select
                    value={lead.categoria ?? ""}
                    onChange={(e) => salvarCategoria(e.target.value)}
                    className="w-full bg-surface border border-edge-subtle rounded-lg px-3.5 py-2.5 text-xs text-sub focus:outline-none focus:border-violet/30 transition-all"
                  >
                    <option value="">— Selecione —</option>
                    {CATEGORIAS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-2 block">Responsavel</label>
                <select
                  value={lead.responsavel ?? ""}
                  onChange={(e) => salvarResponsavel(e.target.value)}
                  className="w-full bg-surface border border-edge-subtle rounded-lg px-3.5 py-2.5 text-xs text-text focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
                >
                  <option value="">Sem responsável</option>
                  {ATENDENTES_META.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                  {/* mantém visível um responsável antigo fora da lista, se houver */}
                  {lead.responsavel && !ATENDENTES_META.includes(lead.responsavel) && (
                    <option value={lead.responsavel}>{lead.responsavel}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-2 block">Fonte da oportunidade</label>
                <select
                  value={lead.fonte_oportunidade ?? ""}
                  onChange={(e) => salvarFonte(e.target.value)}
                  className="w-full bg-surface border border-edge-subtle rounded-lg px-3.5 py-2.5 text-xs text-sub focus:outline-none focus:border-violet/30 transition-all"
                >
                  <option value="">— Selecione —</option>
                  {FONTES_OPORTUNIDADE.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-2 block">Registrar venda</label>
                <RegistrarVendaLead leadId={lead.id} responsavel={lead.responsavel} />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-2 block">Telefone</label>
                <input
                  type="tel"
                  defaultValue={lead.telefone ?? ""}
                  onBlur={(e) => salvarTelefone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full bg-surface border border-edge-subtle rounded-lg px-3.5 py-2.5 text-xs text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-2 block">Email</label>
                <input
                  type="email"
                  defaultValue={lead.email ?? ""}
                  onBlur={(e) => salvarEmail(e.target.value)}
                  placeholder="loja@email.com"
                  className="w-full bg-surface border border-edge-subtle rounded-lg px-3.5 py-2.5 text-xs text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
                />
              </div>
            </div>

            {/* Notas */}
            <div className="mb-6">
              <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-2 block">Notas</label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                onBlur={salvarNotas}
                placeholder="Adicione notas..."
                rows={2}
                className="w-full bg-surface border border-edge-subtle rounded-lg px-3.5 py-2.5 text-xs text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 resize-none transition-all"
              />
            </div>

            {/* Interacoes */}
            <div>
              <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-3 block">Interacoes</label>
              <InteracaoForm leadId={lead.id} onSaved={() => { fetchLead(); fetchInteracoes(); onUpdated?.(); }} />

              <div className="mt-4 space-y-1 max-h-64 overflow-y-auto">
                {interacoes.map((int) => (
                  <div
                    key={int.id}
                    className="group flex items-start gap-3 py-2.5 border-b border-edge-subtle/40 last:border-0"
                  >
                    <div className="mt-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-edge" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-semibold ${TIPO_ACCENT[int.tipo] ?? "text-dim"}`}>
                          {TIPO_LABELS[int.tipo] ?? int.tipo}
                        </span>
                        <span className="text-[10px] text-dim">
                          {new Date(int.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      {editandoId === int.id ? (
                        <div className="mt-1.5">
                          <textarea
                            value={editTexto}
                            onChange={(e) => setEditTexto(e.target.value)}
                            rows={2}
                            autoFocus
                            className="w-full bg-surface border border-violet/30 rounded-lg px-3 py-2 text-xs text-text focus:outline-none focus:border-violet/50 resize-none transition-all"
                          />
                          <div className="flex gap-2 mt-1.5">
                            <button
                              onClick={() => salvarEdicaoInteracao(int.id)}
                              className="text-[11px] font-semibold text-violet-light hover:text-violet bg-violet/10 hover:bg-violet/20 px-2.5 py-1 rounded transition-all"
                            >
                              Salvar
                            </button>
                            <button
                              onClick={cancelarEdicao}
                              className="text-[11px] text-dim hover:text-sub px-2.5 py-1 rounded transition-all"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-sub mt-0.5 leading-relaxed">{int.conteudo}</p>
                      )}
                    </div>
                    {editandoId !== int.id && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => iniciarEdicao(int)}
                          title="Editar interacao"
                          className="text-dim hover:text-violet-light p-1 rounded hover:bg-violet/10 transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => deletarInteracao(int.id)}
                          title="Apagar interacao"
                          className="text-dim hover:text-rose p-1 rounded hover:bg-rose/10 transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {interacoes.length === 0 && (
                  <p className="text-dim text-xs py-4 text-center">Nenhuma interacao.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


/** Registrar venda no card do lead (origem: prospecção). */
function RegistrarVendaLead({ leadId, responsavel }: { leadId: string; responsavel: string | null }) {
  const [valor, setValor] = useState("");
  // Data começa em "hoje" pelo relógio local (não UTC) e é recalculada na hora
  // de salvar enquanto o vendedor não mexer nela.
  const [data, setData] = useState(hojeLocal);
  const [dataTocada, setDataTocada] = useState(false);
  const [vendedor, setVendedor] = useState(responsavel ?? ATENDENTES_META[0] ?? "");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [vendas, setVendas] = useState<{ id: string; amount: number }[]>([]);

  useEffect(() => {
    api.get<{ id: string; amount: number }[]>(`/api/sales/lead/${leadId}`).then(setVendas).catch(() => {});
  }, [leadId]);

  async function salvar() {
    const n = Number(String(valor).replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return setMsg("Valor inválido");
    setSalvando(true);
    setMsg("");
    try {
      const dia = dataTocada ? data : hojeLocal();
      await api.post("/api/sales/prospeccao", { amount: n, soldAt: dia, leadId, agentName: vendedor });
      setValor("");
      setData(dia);
      setMsg(
        dia === hojeLocal()
          ? `Venda registrada hoje (${formatarDataBr(dia)}).`
          : `Venda registrada em ${formatarDataBr(dia)} — para vê-la no painel, filtre um período que inclua esse dia.`,
      );
      api.get<{ id: string; amount: number }[]>(`/api/sales/lead/${leadId}`).then(setVendas).catch(() => {});
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const total = vendas.reduce((s, v) => s + v.amount, 0);
  const campo =
    "bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-xs text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 transition-all";

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="Valor (R$)" className={campo} />
        <input type="date" value={data} onChange={(e) => { setData(e.target.value); setDataTocada(true); }} className={campo} />
        <select value={vendedor} onChange={(e) => setVendedor(e.target.value)} className={campo}>
          {ATENDENTES_META.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
      <button
        onClick={salvar}
        disabled={salvando}
        className="w-full bg-violet hover:bg-violet-deep disabled:opacity-60 text-white text-xs font-semibold py-2 rounded-lg transition-all"
      >
        {salvando ? "Registrando…" : "Registrar venda"}
      </button>
      {msg && <p className={`text-[11px] ${msg === "Venda registrada!" ? "text-emerald" : "text-rose"}`}>{msg}</p>}
      {vendas.length > 0 && (
        <p className="text-[11px] text-dim">
          {vendas.length} venda(s) neste lead ·{" "}
          <span className="text-emerald font-semibold">
            {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
        </p>
      )}
    </div>
  );
}
