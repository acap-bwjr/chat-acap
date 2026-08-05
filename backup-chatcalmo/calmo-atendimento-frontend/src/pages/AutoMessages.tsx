import { useEffect, useState } from 'react';
import { Lightning, PencilSimple, Trash } from '@phosphor-icons/react';
import { api, type CannedReply } from '../lib/api';

// Mensagens automáticas (respostas rápidas) — EXCLUSIVAS por usuário.
export default function AutoMessages() {
  const [items, setItems] = useState<CannedReply[]>([]);
  const [shortcut, setShortcut] = useState('');
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState<CannedReply | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setItems(await api.get<CannedReply[]>('/api/canned-replies'));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function reset() {
    setEditing(null);
    setShortcut('');
    setContent('');
    setError('');
  }
  function startEdit(r: CannedReply) {
    setEditing(r);
    setShortcut(r.shortcut);
    setContent(r.content);
    setError('');
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!shortcut.trim() || !content.trim()) return;
    try {
      if (editing) await api.patch(`/api/canned-replies/${editing.id}`, { shortcut: shortcut.trim(), content });
      else await api.post('/api/canned-replies', { shortcut: shortcut.trim(), content });
      reset();
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function remove(r: CannedReply) {
    if (!confirm(`Excluir a mensagem "${r.shortcut}"?`)) return;
    await api.del(`/api/canned-replies/${r.id}`);
    if (editing?.id === r.id) reset();
    load();
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Mensagens automáticas</h1>
        <p className="text-sm text-faint">
          Suas mensagens prontas para agilizar o atendimento — <b>só você</b> vê e usa as suas. No chat, digite{' '}
          <span className="font-mono text-brand">/atalho</span> no campo de mensagem e escolha na lista que aparece.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        {/* Form */}
        <form onSubmit={save} className="pv-card h-fit p-5">
          <h2 className="mb-4 font-semibold text-ink">{editing ? 'Editar mensagem' : 'Nova mensagem'}</h2>
          {error && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
          <label className="mb-1.5 block text-sm text-sub">Atalho (nome curto)</label>
          <input
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            placeholder="ex: saudacao"
            className="pv-input mb-4"
          />
          <label className="mb-1.5 block text-sm text-sub">Mensagem</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            placeholder="Olá! Seja bem-vindo(a) à Calmô. Como posso te ajudar?"
            className="pv-input mb-4 resize-none"
          />
          <div className="flex gap-2">
            <button className="pv-btn flex-1">{editing ? 'Salvar' : 'Criar'}</button>
            {editing && (
              <button type="button" onClick={reset} className="pv-btn-ghost">
                Cancelar
              </button>
            )}
          </div>
        </form>

        {/* Lista */}
        <div className="pv-card p-5">
          <h2 className="mb-4 font-semibold text-ink">Minhas mensagens ({items.length})</h2>
          {loading ? (
            <div className="h-24 animate-pulse rounded-xl bg-white/5" />
          ) : items.length === 0 ? (
            <div className="grid place-items-center gap-2 py-10 text-center text-faint">
              <Lightning size={32} />
              <p className="text-sm">Você ainda não tem mensagens automáticas.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((r) => (
                <li key={r.id} className="rounded-xl border border-line p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-brand">/{r.shortcut}</span>
                    <span className="flex gap-1">
                      <button onClick={() => startEdit(r)} className="rounded p-1 text-sub hover:text-brand" title="Editar">
                        <PencilSimple size={16} />
                      </button>
                      <button onClick={() => remove(r)} className="rounded p-1 text-sub hover:text-red-400" title="Excluir">
                        <Trash size={16} />
                      </button>
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-sub">{r.content}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
