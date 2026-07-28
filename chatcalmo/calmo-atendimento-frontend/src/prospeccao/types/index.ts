export interface Lead {
  id: string;
  instagram: string;
  nome_loja: string | null;
  site: string | null;
  seguidores: number;
  tem_provador: boolean;
  status: LeadStatus;
  notas: string;
  ponto_positivo: boolean;
  responsavel: string | null;
  pais: Pais;
  fonte_oportunidade: string | null;
  plataforma: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export type Pais = "BR" | "PT";

export const PAISES: Pais[] = ["BR", "PT"];

export const PAIS_LABELS: Record<Pais, string> = {
  BR: "Brasil",
  PT: "Portugal",
};

export const PAIS_FLAG: Record<Pais, string> = {
  BR: "🇧🇷",
  PT: "🇵🇹",
};

// Fontes de oportunidade (para dropdown)
export const FONTES_OPORTUNIDADE = [
  "Instagram",
  "TikTok",
  "Google Maps",
  "Carrinho Abandonado",
  "Indicação",
  "Site",
  "Prospecção Ativa",
  "WhatsApp",
  "Meta",
  "Evento",
  "Outro",
] as const;

export type LeadStatus =
  | "novo_maps"
  | "novo"
  | "carrinho_abandonado"
  | "dm_enviada"
  | "mensagem_1"
  | "mensagem_2"
  | "mensagem_3"
  | "email_a_enviar"
  | "email_enviado"
  | "respondeu"
  | "atendimento_ia"
  | "lead_coletado"
  | "stand_by"
  | "interessado"
  | "fechou"
  | "parou_responder"
  | "perdida"
  | "descartado";

export const LEAD_STATUSES: LeadStatus[] = [
  "novo_maps",
  "novo",
  "carrinho_abandonado",
  "dm_enviada",
  "mensagem_1",
  "mensagem_2",
  "mensagem_3",
  "email_a_enviar",
  "email_enviado",
  "respondeu",
  "atendimento_ia",
  "interessado",
  "stand_by",
  "fechou",
  "parou_responder",
  "perdida",
  "descartado",
];

// Status "quentes" — leads prontos pra avançar (usado em Top Responsáveis e Desempenho do Time)
export const HOT_STATUSES: LeadStatus[] = ["interessado"];

// ---- Metas do dia ----
// Atendentes que têm meta diária e quantos clientes cada um precisa chamar por dia.
export const ATENDENTES_META = ["Victor", "Gabriel"];
export const META_DIARIA = 50;

// Etapas iniciais: sair de uma delas (com responsável) conta como "cliente chamado".
export const ETAPAS_INICIAIS: LeadStatus[] = ["novo_maps", "novo"];

export const PIPELINE_STATUSES: LeadStatus[] = [
  "novo_maps",
  "novo",
  "carrinho_abandonado",
  "dm_enviada",
  "mensagem_1",
  "mensagem_2",
  "mensagem_3",
  "atendimento_ia",
  "email_a_enviar",
  "email_enviado",
  "respondeu",
  "interessado",
  "stand_by",
  "fechou",
  "parou_responder",
  "perdida",
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
  novo_maps: "Novo Maps",
  novo: "Novo Instagram",
  carrinho_abandonado: "Carrinho Abandonado",
  dm_enviada: "DM Enviada",
  mensagem_1: "Mensagem 1",
  mensagem_2: "Mensagem 2",
  mensagem_3: "Não Respondeu",
  email_a_enviar: "Cliente Over",
  email_enviado: "Cliente Slim",
  respondeu: "Respondeu",
  atendimento_ia: "Atendimento com IA",
  lead_coletado: "Lead Coletado",
  stand_by: "Stand By",
  interessado: "Interessado",
  fechou: "Fechou",
  parou_responder: "Parou de Responder",
  perdida: "Perdida",
  descartado: "Descartado",
};

export const STATUS_COLORS: Record<LeadStatus, { bg: string; text: string; dot: string }> = {
  novo_maps: { bg: "bg-emerald/10", text: "text-emerald", dot: "bg-emerald" },
  novo: { bg: "bg-violet/10", text: "text-violet-light", dot: "bg-violet" },
  carrinho_abandonado: { bg: "bg-amber/10", text: "text-amber", dot: "bg-amber" },
  dm_enviada: { bg: "bg-cyan/10", text: "text-cyan", dot: "bg-cyan" },
  mensagem_1: { bg: "bg-cyan/10", text: "text-cyan-light", dot: "bg-cyan-light" },
  mensagem_2: { bg: "bg-cyan/10", text: "text-cyan-light", dot: "bg-cyan-light" },
  mensagem_3: { bg: "bg-violet/10", text: "text-violet-light", dot: "bg-violet-light" },
  email_a_enviar: { bg: "bg-amber/10", text: "text-amber", dot: "bg-amber" },
  email_enviado: { bg: "bg-pink/10", text: "text-pink", dot: "bg-pink" },
  respondeu: { bg: "bg-amber/10", text: "text-amber", dot: "bg-amber" },
  atendimento_ia: { bg: "bg-violet/10", text: "text-violet-light", dot: "bg-violet" },
  lead_coletado: { bg: "bg-pink/10", text: "text-pink", dot: "bg-pink" },
  stand_by: { bg: "bg-muted/10", text: "text-muted", dot: "bg-muted" },
  interessado: { bg: "bg-rose/10", text: "text-rose", dot: "bg-rose" },
  fechou: { bg: "bg-emerald/10", text: "text-emerald", dot: "bg-emerald" },
  parou_responder: { bg: "bg-stone/10", text: "text-stone", dot: "bg-stone" },
  perdida: { bg: "bg-orange/10", text: "text-orange", dot: "bg-orange" },
  descartado: { bg: "bg-dim/10", text: "text-dim", dot: "bg-dim" },
};

export const STATUS_HEX: Record<LeadStatus, string> = {
  novo_maps: "#10b981",
  novo: "#3B82F6",
  carrinho_abandonado: "#f59e0b",
  dm_enviada: "#06b6d4",
  mensagem_1: "#38bdf8",
  mensagem_2: "#60A5FA",
  mensagem_3: "#5EEAD4",
  email_a_enviar: "#fb923c",
  email_enviado: "#d946ef",
  respondeu: "#f59e0b",
  atendimento_ia: "#2DD4BF",
  lead_coletado: "#ec4899",
  stand_by: "#94a3b8",
  interessado: "#f43f5e",
  fechou: "#10b981",
  parou_responder: "#78716c",
  perdida: "#f97316",
  descartado: "#52525b",
};
