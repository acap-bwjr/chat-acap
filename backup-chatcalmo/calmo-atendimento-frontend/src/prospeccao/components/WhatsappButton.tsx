import { WhatsappLogo } from '@phosphor-icons/react';
import { startWhatsappConversation } from '../../lib/openConversation';
import { paraWhatsapp } from '../lib/telefone';

// Botão de WhatsApp — abre (ou cria) a conversa em "Conversas" com o telefone do lead.
// `compact` = só o ícone (usado no card do Pipeline); senão mostra ícone + "WhatsApp" (tabelas).
export default function WhatsappButton({
  phone,
  name,
  compact,
  externo,
}: {
  phone?: string | null;
  name?: string | null;
  compact?: boolean;
  /** true = abre o WhatsApp externo (app/WhatsApp Web via wa.me) em vez da conversa interna. */
  externo?: boolean;
}) {
  // Número com DDI para o wa.me (10/11 dígitos = Brasil → prefixa 55).
  const digits = paraWhatsapp(phone);
  const disabled = !digits;

  const classe = `inline-flex items-center gap-1.5 rounded-lg font-semibold text-white transition disabled:cursor-not-allowed ${
    compact ? 'px-1.5 py-1' : 'px-2.5 py-1.5 text-xs'
  }`;
  const estilo = disabled
    ? { background: 'rgba(148,163,184,0.14)', color: 'var(--color-dim)' }
    : { background: 'linear-gradient(135deg,#25D366,#128C7E)' };
  const icone = <WhatsappLogo size={15} weight="fill" />;

  // Modo externo: link direto pro WhatsApp (abre o app no celular ou o WhatsApp Web).
  if (externo) {
    if (disabled) {
      return (
        <span className={classe} style={estilo} title="Sem telefone disponível">
          {icone}
          {!compact && 'WhatsApp'}
        </span>
      );
    }
    return (
      <a
        href={`https://wa.me/${digits}`}
        target="_blank"
        rel="noopener noreferrer"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        title="Abrir conversa no WhatsApp (app / WhatsApp Web)"
        className={`${classe} hover:brightness-110`}
        style={estilo}
      >
        {icone}
        {!compact && 'WhatsApp'}
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => e.stopPropagation()} // não iniciar o drag do card
      onClick={(e) => {
        e.stopPropagation();
        startWhatsappConversation(digits, name);
      }}
      title={disabled ? 'Sem telefone disponível' : 'Abrir conversa no WhatsApp'}
      className={`inline-flex items-center gap-1.5 rounded-lg font-semibold text-white transition disabled:cursor-not-allowed ${
        compact ? 'px-1.5 py-1' : 'px-2.5 py-1.5 text-xs'
      }`}
      style={
        disabled
          ? { background: 'rgba(148,163,184,0.14)', color: 'var(--color-dim)' }
          : { background: 'linear-gradient(135deg,#25D366,#128C7E)' }
      }
    >
      <WhatsappLogo size={compact ? 15 : 15} weight="fill" />
      {!compact && 'WhatsApp'}
    </button>
  );
}
