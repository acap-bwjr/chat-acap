import { useEffect, useState } from 'react';
import { PencilSimple, Trash } from '@phosphor-icons/react';
import { api, type Label } from '../lib/api';

const COLORS = ['#3b82f6', '#2dd4bf', '#e11d48', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#64748b'];

export default function Labels() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [editing, setEditing] = useState<Label | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setLabels(await api.get<Label[]>('/api/labels'));
  }
  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return;
    try {
      if (editing) await api.patch(`/api/labels/${editing.id}`, { name: name.trim(), color });
      else await api.post('/api/labels', { name: name.trim(), color });
      cancel();
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function startEdit(l: Label) {
    setEditing(l);
    setName(l.name);
    setColor(l.color);
  }
  function cancel() {
    setEditing(null);
    setName('');
    setColor(COLORS[0]);
  }

  async function remove(l: Label) {
    if (!confirm(`Excluir a etiqueta "${l.name}"?`)) return;
    await api.del(`/api/labels/${l.id}`);
    if (editing?.id === l.id) cancel();
    load();
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Etiquetas</h1>
        <p className="text-sm text-faint">Crie, edite e exclua etiquetas para organizar as conversas</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <form onSubmit={submit} className="pv-card h-fit p-5">
          <h2 className="mb-4 font-semibold text-ink">{editing ? 'Editar etiqueta' : 'Nova etiqueta'}</h2>
          {error && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
          <label className="mb-1.5 block text-sm text-sub">Nome</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="pv-input mb-4" />
          <label className="mb-2 block text-sm text-sub">Cor</label>
          <div className="mb-5 flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full transition ${color === c ? 'ring-2 ring-offset-2 ring-offset-card ring-white/40' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button className="pv-btn flex-1">{editing ? 'Salvar' : 'Criar'}</button>
            {editing && (
              <button type="button" onClick={cancel} className="pv-btn-ghost">
                Cancelar
              </button>
            )}
          </div>
        </form>

        <div className="pv-card p-5">
          <h2 className="mb-4 font-semibold text-ink">Etiquetas ({labels.length})</h2>
          {labels.length === 0 && <p className="text-sm text-faint">Nenhuma etiqueta ainda.</p>}
          <ul className="space-y-2">
            {labels.map((l) => (
              <li key={l.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5">
                <span className="inline-flex items-center gap-2.5">
                  <span className="h-4 w-4 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="font-medium text-ink">{l.name}</span>
                </span>
                <span className="flex gap-1.5">
                  <button onClick={() => startEdit(l)} className="rounded-lg p-1.5 text-sub transition hover:bg-cardh hover:text-brand" title="Editar">
                    <PencilSimple size={17} />
                  </button>
                  <button onClick={() => remove(l)} className="rounded-lg p-1.5 text-sub transition hover:bg-cardh hover:text-red-400" title="Excluir">
                    <Trash size={17} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
