import { useEffect, useState } from 'react';
import { Plus, PencilSimple, Trash, X } from '@phosphor-icons/react';
import { api, type Template, type TemplateButton } from '../lib/api';

type Draft = {
  id?: string;
  friendlyName: string;
  name: string;
  category: Template['category'];
  language: string;
  header: string;
  body: string;
  footer: string;
  buttons: TemplateButton[];
  status: Template['status'];
};

const EMPTY: Draft = {
  friendlyName: '',
  name: '',
  category: 'UTILITY',
  language: 'pt_BR',
  header: '',
  body: '',
  footer: '',
  buttons: [],
  status: 'draft',
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

const STATUS_STYLE: Record<Template['status'], string> = {
  draft: 'bg-white/10 text-sub',
  pending: 'bg-amber-500/15 text-amber-400',
  approved: 'bg-ok/15 text-ok',
  rejected: 'bg-red-500/15 text-red-400',
};
const STATUS_LABEL: Record<Template['status'], string> = {
  draft: 'Rascunho',
  pending: 'Em análise',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
};

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setTemplates(await api.get<Template[]>('/api/templates'));
  }
  useEffect(() => {
    load();
  }, []);

  function edit(t: Template) {
    setError('');
    setDraft({
      id: t.id,
      friendlyName: t.friendlyName ?? '',
      name: t.name,
      category: t.category,
      language: t.language,
      header: t.header ?? '',
      body: t.body,
      footer: t.footer ?? '',
      buttons: t.buttons ?? [],
      status: t.status,
    });
  }

  async function save() {
    if (!draft) return;
    setError('');
    const payload = {
      name: draft.name || slug(draft.friendlyName),
      friendlyName: draft.friendlyName || null,
      category: draft.category,
      language: draft.language,
      header: draft.header || null,
      body: draft.body,
      footer: draft.footer || null,
      buttons: draft.buttons,
      status: draft.status,
    };
    try {
      if (draft.id) await api.patch(`/api/templates/${draft.id}`, payload);
      else await api.post('/api/templates', payload);
      setDraft(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(t: Template) {
    if (!confirm(`Excluir o template "${t.friendlyName || t.name}"?`)) return;
    await api.del(`/api/templates/${t.id}`);
    if (draft?.id === t.id) setDraft(null);
    load();
  }

  // Envia o template para validação na Meta.
  async function submit(t: Template) {
    setError('');
    setBusy(t.id);
    try {
      await api.post(`/api/templates/${t.id}/submit`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Templates</h1>
          <p className="text-sm text-faint">
            Mensagens prontas para WhatsApp (use {'{{1}}'}, {'{{2}}'} para variáveis)
          </p>
        </div>
        <button onClick={() => { setError(''); setDraft({ ...EMPTY }); }} className="pv-btn">
          <Plus size={17} weight="bold" /> Novo template
        </button>
      </header>

      {error && !draft && (
        <div className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          {templates.length === 0 && (
            <div className="pv-card p-8 text-center text-faint">
              Nenhum template ainda. Clique em “Novo template”.
            </div>
          )}
          {templates.map((t) => (
            <div key={t.id} className="pv-card p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-ink">{t.friendlyName || t.name}</h3>
                  <p className="font-mono text-xs text-faint">{t.name}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-sub">{t.category}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${STATUS_STYLE[t.status]}`}>
                    {STATUS_LABEL[t.status]}
                  </span>
                </div>
              </div>
              <p className="line-clamp-2 whitespace-pre-wrap text-sm text-sub">{t.body}</p>
              <div className="mt-3 flex items-center gap-1.5">
                <button onClick={() => edit(t)} className="rounded-lg p-1.5 text-sub transition hover:bg-cardh hover:text-brand" title="Editar">
                  <PencilSimple size={17} />
                </button>
                <button onClick={() => remove(t)} className="rounded-lg p-1.5 text-sub transition hover:bg-cardh hover:text-red-400" title="Excluir">
                  <Trash size={17} />
                </button>
                {(t.status === 'draft' || t.status === 'rejected') && (
                  <button
                    onClick={() => submit(t)}
                    disabled={busy === t.id}
                    className="ml-auto rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
                    title="Enviar para validação da Meta"
                  >
                    {busy === t.id ? 'Enviando…' : t.status === 'rejected' ? 'Reenviar' : 'Enviar p/ aprovação'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {draft ? (
          <Editor draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setDraft(null)} error={error} />
        ) : (
          <div className="hidden rounded-2xl border-2 border-dashed border-line lg:grid lg:place-items-center lg:text-faint">
            Selecione um template para editar ou crie um novo
          </div>
        )}
      </div>
    </div>
  );
}

function Editor({
  draft,
  setDraft,
  onSave,
  onCancel,
  error,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  error: string;
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  function addButton() {
    if (draft.buttons.length >= 3) return;
    set({ buttons: [...draft.buttons, { type: 'QUICK_REPLY', text: '' }] });
  }
  function updateButton(i: number, patch: Partial<TemplateButton>) {
    set({ buttons: draft.buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) });
  }
  function removeButton(i: number) {
    set({ buttons: draft.buttons.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="pv-card p-5">
      <h2 className="mb-4 font-semibold text-ink">{draft.id ? 'Editar template' : 'Novo template'}</h2>
      {error && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

      <div className="space-y-3">
        <Field label="Nome amigável">
          <input
            value={draft.friendlyName}
            onChange={(e) => set({ friendlyName: e.target.value, name: draft.id ? draft.name : slug(e.target.value) })}
            placeholder="Ex: Reativação de atendimento"
            className="pv-input"
          />
        </Field>
        <Field label="Nome técnico (enviado à Meta)">
          <input value={draft.name} onChange={(e) => set({ name: slug(e.target.value) })} placeholder="reativacao_atendimento" className="pv-input font-mono" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria">
            <select value={draft.category} onChange={(e) => set({ category: e.target.value as Draft['category'] })} className="pv-input">
              <option value="UTILITY">Utilidade</option>
              <option value="MARKETING">Marketing</option>
              <option value="AUTHENTICATION">Autenticação</option>
            </select>
          </Field>
          <Field label="Idioma">
            <input value={draft.language} onChange={(e) => set({ language: e.target.value })} className="pv-input" />
          </Field>
        </div>
        <Field label="Cabeçalho (opcional)">
          <input value={draft.header} onChange={(e) => set({ header: e.target.value })} className="pv-input" />
        </Field>
        <Field label="Corpo *">
          <textarea
            value={draft.body}
            onChange={(e) => set({ body: e.target.value })}
            rows={4}
            placeholder="Olá {{1}}! Seu atendimento ficou em aberto…"
            className="pv-input resize-none"
          />
        </Field>
        <Field label="Rodapé (opcional)">
          <input value={draft.footer} onChange={(e) => set({ footer: e.target.value })} className="pv-input" />
        </Field>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs text-sub">Botões (até 3)</label>
            <button onClick={addButton} className="text-xs font-medium text-brand hover:underline">
              + adicionar
            </button>
          </div>
          <div className="space-y-2">
            {draft.buttons.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <select value={b.type} onChange={(e) => updateButton(i, { type: e.target.value as TemplateButton['type'] })} className="pv-input w-auto py-1.5 text-xs">
                  <option value="QUICK_REPLY">Resposta rápida</option>
                  <option value="URL">Link</option>
                  <option value="PHONE_NUMBER">Telefone</option>
                </select>
                <input value={b.text} onChange={(e) => updateButton(i, { text: e.target.value })} placeholder="Texto do botão" className="pv-input min-w-0 flex-1 py-1.5 text-xs" />
                {b.type === 'URL' && (
                  <input value={b.url ?? ''} onChange={(e) => updateButton(i, { url: e.target.value })} placeholder="https://" className="pv-input min-w-0 flex-1 py-1.5 text-xs" />
                )}
                <button onClick={() => removeButton(i)} className="text-faint transition hover:text-red-400">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <Preview draft={draft} />

        <div className="flex gap-2 pt-2">
          <button onClick={onSave} className="pv-btn flex-1">
            {draft.id ? 'Salvar alterações' : 'Criar template'}
          </button>
          <button onClick={onCancel} className="pv-btn-ghost">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-sub">{label}</label>
      {children}
    </div>
  );
}

function Preview({ draft }: { draft: Draft }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-sub">Prévia</label>
      <div className="rounded-xl bg-[#0b141a] p-4">
        <div className="max-w-[85%] rounded-lg rounded-tl-sm bg-[#e7ffdb] p-3 shadow-sm">
          {draft.header && <p className="mb-1 font-semibold text-slate-800">{draft.header}</p>}
          <p className="whitespace-pre-wrap text-sm text-slate-700">{draft.body || 'Corpo da mensagem…'}</p>
          {draft.footer && <p className="mt-1 text-xs text-slate-400">{draft.footer}</p>}
          {draft.buttons.length > 0 && (
            <div className="mt-2 space-y-1 border-t border-slate-200 pt-2">
              {draft.buttons.map((b, i) => (
                <div key={i} className="text-center text-sm font-medium text-sky-600">
                  {b.type === 'URL' ? '🔗 ' : b.type === 'PHONE_NUMBER' ? '📞 ' : ''}
                  {b.text || 'Botão'}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
