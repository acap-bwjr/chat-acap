import { api } from './api';

// Cria/abre uma conversa no atendimento a partir de um telefone e navega até "Conversas".
// Dispara o evento 'open-conversation' que o App escuta para trocar de página + abrir a conversa.
export async function startWhatsappConversation(phone?: string | null, name?: string | null): Promise<void> {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 10) {
    alert('Este lead não tem um telefone válido para abrir no WhatsApp.');
    return;
  }
  try {
    const r = await api.post<{ conversationId: string }>('/api/conversations/start', {
      phone: digits,
      name: name || undefined,
    });
    window.dispatchEvent(
      new CustomEvent('open-conversation', { detail: { conversationId: r.conversationId } }),
    );
  } catch (e) {
    alert('Não foi possível abrir a conversa: ' + (e as Error).message);
  }
}
