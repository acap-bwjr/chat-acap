import { useState } from "react";
import { supabase } from "../lib/supabase";
import { LEAD_STATUSES, STATUS_LABELS, FONTES_OPORTUNIDADE, CATEGORIAS, ATENDENTES_META } from "../types";
import type { LeadStatus } from "../types";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function NovoLeadModal({ onClose, onCreated }: Props) {
  const [nome, setNome] = useState("");
  const [anoNascimento, setAnoNascimento] = useState("");
  const [categoria, setCategoria] = useState("");
  const [status, setStatus] = useState<LeadStatus>("novo");
  const [responsavel, setResponsavel] = useState("");
  const [fonteOportunidade, setFonteOportunidade] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!nome.trim()) {
      setErro("Nome é obrigatório");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("leads").insert({
      nome: nome.trim(),
      ano_nascimento: anoNascimento ? parseInt(anoNascimento, 10) : null,
      categoria: categoria || null,
      notas: notas.trim(),
      status,
      responsavel: responsavel.trim() || null,
      fonte_oportunidade: fonteOportunidade || null,
      telefone: telefone.trim() || null,
      email: email.trim() || null,
    });

    setSaving(false);

    if (error) {
      setErro(error.message);
      return;
    }

    onCreated();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-base/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-raised border border-edge rounded-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-[18px] font-bold text-bright tracking-tight">Novo lead</h2>
            <p className="text-dim text-xs mt-1">Adicione manualmente no pipeline</p>
          </div>
          <button onClick={onClose} className="text-dim hover:text-bright text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-1.5 block">Nome do atleta ou responsável *</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
              autoFocus
              className="w-full bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-sm text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-1.5 block">Ano de nascimento</label>
              <input
                type="number"
                value={anoNascimento}
                onChange={(e) => setAnoNascimento(e.target.value)}
                placeholder="2015"
                min="1950"
                max={new Date().getFullYear()}
                className="w-full bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-sm text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-1.5 block">Categoria</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-sm text-sub focus:outline-none focus:border-violet/30 transition-all"
              >
                <option value="">— Selecione —</option>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div>
              <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-1.5 block">Status (etapa)</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as LeadStatus)}
                className="w-full bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-sm text-sub focus:outline-none focus:border-violet/30 transition-all"
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-1.5 block">Responsavel</label>
              <select
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
                className="w-full bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
              >
                <option value="">Sem responsável</option>
                {ATENDENTES_META.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-1.5 block">Fonte</label>
              <select
                value={fonteOportunidade}
                onChange={(e) => setFonteOportunidade(e.target.value)}
                className="w-full bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-sm text-sub focus:outline-none focus:border-violet/30 transition-all"
              >
                <option value="">— Selecione —</option>
                {FONTES_OPORTUNIDADE.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-1.5 block">Telefone</label>
              <input
                type="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="w-full bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-sm text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-1.5 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className="w-full bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-sm text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-1.5 block">Notas</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Opcional..."
              rows={2}
              className="w-full bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-sm text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all resize-none"
            />
          </div>

          {erro && <p className="text-rose text-xs">{erro}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-surface hover:bg-edge text-sub text-sm font-medium px-4 py-2.5 rounded-lg transition-all border border-edge-subtle"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !nome.trim()}
              className="flex-1 bg-violet hover:bg-violet-deep disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-all"
            >
              {saving ? "Salvando..." : "Adicionar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
