import { supabase } from "./supabase";
import { ETAPAS_INICIAIS } from "../types";
import type { Lead, LeadStatus } from "../types";

/**
 * Registra 1 "cliente chamado" para a meta do dia.
 * Regra: conta quando o lead SAI de "Novo Maps"/"Novo Instagram" para qualquer
 * outra etapa. O crédito vai para o RESPONSÁVEL do lead. Cada lead conta uma
 * única vez (índice único por lead_id), no dia em que saiu da etapa inicial.
 */
export async function registrarChamado(lead: Lead, novoStatus: LeadStatus): Promise<void> {
  if (!ETAPAS_INICIAIS.includes(lead.status)) return; // já tinha saído das iniciais
  if (ETAPAS_INICIAIS.includes(novoStatus)) return; // mover entre as duas iniciais não conta
  const responsavel = lead.responsavel?.trim();
  if (!responsavel) return; // sem responsável não pontua

  try {
    await supabase
      .from("leads_chamados")
      .upsert(
        {
          lead_id: lead.id,
          responsavel,
          de_status: lead.status,
          para_status: novoStatus,
        },
        { onConflict: "lead_id", ignoreDuplicates: true },
      );
  } catch {
    /* meta é acessório: nunca bloquear a movimentação do lead */
  }
}

/** Meta diária configurada (linha única em prospeccao_config). */
export async function carregarMetaDiaria(padrao: number): Promise<number> {
  try {
    const { data } = await supabase.from("prospeccao_config").select("meta_diaria").eq("id", 1).single();
    const n = Number(data?.meta_diaria);
    return Number.isFinite(n) && n > 0 ? n : padrao;
  } catch {
    return padrao;
  }
}

/** Salva a meta diária (só o ADM chama). */
export async function salvarMetaDiaria(meta: number): Promise<void> {
  const { error } = await supabase
    .from("prospeccao_config")
    .upsert({ id: 1, meta_diaria: meta, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw error;
}

/** Chamados por responsável (primeiro nome em minúsculo) a partir de uma data. */
export async function contarChamados(desde: Date | null): Promise<Record<string, number>> {
  const q = supabase.from("leads_chamados").select("lead_id, responsavel");
  const { data } = desde ? await q.gte("created_at", desde.toISOString()) : await q;
  const out: Record<string, Set<string>> = {};
  (data ?? []).forEach((r: { lead_id: string; responsavel: string | null }) => {
    const chave = (r.responsavel ?? "").trim().toLowerCase().split(/\s+/)[0] ?? "";
    if (!chave) return;
    (out[chave] ??= new Set<string>()).add(r.lead_id);
  });
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.size]));
}
