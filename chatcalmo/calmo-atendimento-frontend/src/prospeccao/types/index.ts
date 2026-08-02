export interface Lead {
  id: string;
  nome: string;
  ano_nascimento: number | null;
  categoria: string | null;
  status: LeadStatus;
  notas: string;
  ponto_positivo: boolean;
  responsavel: string | null;
  fonte_oportunidade: string | null;
  telefone: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

// Categorias por faixa etária (futsal): anual até o Sub-10, depois de 2 em 2 anos.
export const CATEGORIAS = ["Sub-7", "Sub-8", "Sub-9", "Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18", "Adulto/Livre"] as const;

// Fontes de oportunidade (para dropdown)
export const FONTES_OPORTUNIDADE = [
  "Indicação",
  "Instagram",
  "TikTok",
  "Evento/Peneira",
  "Panfletagem",
  "Escola Parceira",
  "Site",
  "WhatsApp",
  "Google Maps",
  "Meta",
  "Outro",
] as const;

export type LeadStatus =
  | "novo"
  | "contato_feito"
  | "respondeu"
  | "avaliacao_agendada"
  | "compareceu"
  | "matriculado"
  | "nao_compareceu"
  | "stand_by"
  | "desistiu"
  | "descartado";

export const LEAD_STATUSES: LeadStatus[] = [
  "novo",
  "contato_feito",
  "respondeu",
  "avaliacao_agendada",
  "compareceu",
  "matriculado",
  "nao_compareceu",
  "stand_by",
  "desistiu",
  "descartado",
];

// Status "quentes" — leads prontos pra avançar (usado em Top Responsáveis e Desempenho do Time)
export const HOT_STATUSES: LeadStatus[] = ["avaliacao_agendada"];

// ---- Metas do dia ----
// Atendentes que têm meta diária e quantos clientes cada um precisa chamar por dia.
export const ATENDENTES_META: string[] = [];
export const META_DIARIA = 50;

// Etapa inicial: sair dela (com responsável) conta como "cliente chamado".
export const ETAPAS_INICIAIS: LeadStatus[] = ["novo"];

export const PIPELINE_STATUSES: LeadStatus[] = [
  "novo",
  "contato_feito",
  "respondeu",
  "avaliacao_agendada",
  "compareceu",
  "matriculado",
  "nao_compareceu",
  "stand_by",
  "desistiu",
];

export interface Interacao {
  id: string;
  lead_id: string;
  tipo: InteracaoTipo;
  conteudo: string;
  created_at: string;
}

export type InteracaoTipo = "dm_enviada" | "resposta" | "follow_up" | "nota";

export const INTERACAO_TIPOS: InteracaoTipo[] = [
  "dm_enviada",
  "resposta",
  "follow_up",
  "nota",
];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  novo: "Novo Contato",
  contato_feito: "Contato Feito",
  respondeu: "Respondeu",
  avaliacao_agendada: "Avaliação Agendada",
  compareceu: "Compareceu à Avaliação",
  matriculado: "Matriculado",
  nao_compareceu: "Não Compareceu",
  stand_by: "Em Espera",
  desistiu: "Desistiu",
  descartado: "Descartado",
};

export const STATUS_COLORS: Record<LeadStatus, { bg: string; text: string; dot: string }> = {
  novo: { bg: "bg-violet/10", text: "text-violet-light", dot: "bg-violet" },
  contato_feito: { bg: "bg-cyan/10", text: "text-cyan", dot: "bg-cyan" },
  respondeu: { bg: "bg-amber/10", text: "text-amber", dot: "bg-amber" },
  avaliacao_agendada: { bg: "bg-rose/10", text: "text-rose", dot: "bg-rose" },
  compareceu: { bg: "bg-orange/10", text: "text-orange", dot: "bg-orange" },
  matriculado: { bg: "bg-emerald/10", text: "text-emerald", dot: "bg-emerald" },
  nao_compareceu: { bg: "bg-stone/10", text: "text-stone", dot: "bg-stone" },
  stand_by: { bg: "bg-muted/10", text: "text-muted", dot: "bg-muted" },
  desistiu: { bg: "bg-orange/10", text: "text-orange", dot: "bg-orange" },
  descartado: { bg: "bg-dim/10", text: "text-dim", dot: "bg-dim" },
};

export const STATUS_HEX: Record<LeadStatus, string> = {
  novo: "#818cf8",
  contato_feito: "#22d3ee",
  respondeu: "#fbbf24",
  avaliacao_agendada: "#fb7185",
  compareceu: "#fb923c",
  matriculado: "#10b981",
  nao_compareceu: "#a8a29e",
  stand_by: "#94a3b8",
  desistiu: "#ef4444",
  descartado: "#52525b",
};
