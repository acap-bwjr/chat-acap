// Telefones: exibição no padrão brasileiro e normalização para o link do WhatsApp.

const digitos = (v?: string | null) => (v ?? "").replace(/\D/g, "");

/**
 * Formata para exibição no padrão BR: (11) 91234-5678 / (11) 1234-5678.
 * - Aceita com ou sem o 55 na frente (o 55 é removido da exibição).
 * - Números claramente estrangeiros (outro DDI) são devolvidos como vieram.
 */
export function formatarTelefone(raw?: string | null): string {
  const d = digitos(raw);
  if (!d) return "";

  // Tira o DDI 55 quando o resto tem tamanho de telefone brasileiro (10 ou 11).
  let n = d;
  if (n.startsWith("55") && (n.length === 12 || n.length === 13)) n = n.slice(2);

  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`; // celular
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`; // fixo

  return (raw ?? "").trim(); // estrangeiro/incompleto: mantém o original
}

/**
 * Número pronto para o wa.me (só dígitos, COM código do país).
 * - 10/11 dígitos → assume Brasil e prefixa 55.
 * - Já com 55 (12/13 dígitos) → mantém.
 * - Outros tamanhos (ex.: EUA +1) → mantém como está.
 * Retorna "" quando não dá para montar um número válido.
 */
export function paraWhatsapp(raw?: string | null): string {
  const d = digitos(raw);
  if (d.length < 10) return "";
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}
