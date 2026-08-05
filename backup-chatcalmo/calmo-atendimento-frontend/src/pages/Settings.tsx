import { useEffect, useState } from 'react';
import { WhatsappLogo, Play, Check, Copy, CheckCircle } from '@phosphor-icons/react';
import { api, type InboxInfo, type User } from '../lib/api';
import WaWizard from '../components/WaWizard';

export default function Settings({
  user,
  onUserUpdate,
}: {
  user: User;
  onUserUpdate: (u: User) => void;
}) {
  return (
    <div className="h-full overflow-y-auto p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Configurações</h1>
        <p className="text-sm text-faint">Seu perfil, segurança e conexão do WhatsApp</p>
      </header>

      <div className="max-w-3xl space-y-6">
        <Profile user={user} onUserUpdate={onUserUpdate} />
        <Password />
        <Connector />
      </div>
    </div>
  );
}

function Feedback({ msg }: { msg: { type: 'ok' | 'err'; text: string } | null }) {
  if (!msg) return null;
  return (
    <div className={`mb-3 rounded-lg px-3 py-2 text-sm ${msg.type === 'ok' ? 'bg-ok/10 text-ok' : 'bg-red-500/10 text-red-400'}`}>
      {msg.text}
    </div>
  );
}

function Profile({ user, onUserUpdate }: { user: User; onUserUpdate: (u: User) => void }) {
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const r = await api.patch<{ user: User }>('/api/auth/me', { name });
      onUserUpdate(r.user);
      setMsg({ type: 'ok', text: 'Perfil atualizado.' });
    } catch (err) {
      setMsg({ type: 'err', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="pv-card p-6">
      <h2 className="mb-4 font-semibold text-ink">Perfil</h2>
      <Feedback msg={msg} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-sub">Nome</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="pv-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-sub">E-mail</label>
          <input value={user.email} disabled className="pv-input opacity-60" />
        </div>
      </div>
      <p className="mt-2 text-xs text-faint">Perfil: {user.role === 'admin' ? 'Administrador' : 'Atendente'}</p>
      <div className="mt-4">
        <button disabled={saving} className="pv-btn">
          {saving ? 'Salvando…' : 'Salvar perfil'}
        </button>
      </div>
    </form>
  );
}

function Password() {
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [conf, setConf] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (nw.length < 6) return setMsg({ type: 'err', text: 'A nova senha precisa ter ao menos 6 caracteres.' });
    if (nw !== conf) return setMsg({ type: 'err', text: 'A confirmação não bate com a nova senha.' });
    setSaving(true);
    try {
      await api.post('/api/auth/change-password', { currentPassword: cur, newPassword: nw });
      setCur('');
      setNw('');
      setConf('');
      setMsg({ type: 'ok', text: 'Senha alterada com sucesso.' });
    } catch (err) {
      setMsg({ type: 'err', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="pv-card p-6">
      <h2 className="mb-4 font-semibold text-ink">Trocar senha</h2>
      <Feedback msg={msg} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs text-sub">Senha atual</label>
          <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} className="pv-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-sub">Nova senha</label>
          <input type="password" value={nw} onChange={(e) => setNw(e.target.value)} className="pv-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-sub">Confirmar</label>
          <input type="password" value={conf} onChange={(e) => setConf(e.target.value)} className="pv-input" />
        </div>
      </div>
      <div className="mt-4">
        <button disabled={saving} className="pv-btn">
          {saving ? 'Salvando…' : 'Alterar senha'}
        </button>
      </div>
    </form>
  );
}

// ===== Conector WhatsApp (só conexão; templates ficam no menu lateral) =====
function Connector() {
  const [config, setConfig] = useState<InboxInfo | null>(null);
  const [wizard, setWizard] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const carregar = () => {
    api
      .get<InboxInfo>('/api/inbox')
      .then(setConfig)
      .catch(() => setConfig(null))
      .finally(() => setCarregando(false));
  };
  useEffect(carregar, []);

  const conectado = config?.conectado;
  const statusInfo = conectado
    ? { txt: 'Conectado', cor: '#10B981' }
    : config?.status === 'error'
    ? { txt: 'Erro', cor: '#EF4444' }
    : { txt: 'Desconectado', cor: '#94A3B8' };

  return (
    <div className="pv-card p-5">
      {/* Cabeçalho do card */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ background: 'linear-gradient(135deg,#25D366,#128C7E)' }}
          >
            <WhatsappLogo size={24} weight="fill" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-ink">WhatsApp Business — API Oficial</h2>
            <p className="text-xs text-faint">Conecte a API oficial da Meta pra enviar e receber mensagens</p>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
          style={{ background: `${statusInfo.cor}22`, color: statusInfo.cor }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: statusInfo.cor }} />
          {statusInfo.txt}
        </span>
      </div>

      <div className="mt-4">
        {carregando ? (
          <div className="h-32 animate-pulse rounded-2xl bg-white/5" />
        ) : (
          <ConexaoTab
            config={config}
            onConectar={() => setWizard(true)}
            onDesconectar={async () => {
              await api.post('/api/inbox/disconnect');
              carregar();
            }}
          />
        )}
      </div>

      {wizard && (
        <WaWizard
          onClose={() => setWizard(false)}
          onConectado={() => {
            setWizard(false);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function ConexaoTab({
  config,
  onConectar,
  onDesconectar,
}: {
  config: InboxInfo | null;
  onConectar: () => void;
  onDesconectar: () => void;
}) {
  if (!config?.conectado) {
    return (
      <>
        {config?.status === 'error' && config.lastError && (
          <div className="mb-3 rounded-2xl border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-400">
            Última tentativa falhou: {config.lastError}
          </div>
        )}
        <div
          className="flex flex-col items-start justify-between gap-4 rounded-2xl p-5 sm:flex-row sm:items-center"
          style={{ background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.25)' }}
        >
          <div className="flex items-start gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: 'linear-gradient(135deg,#25D366,#128C7E)' }}
            >
              <WhatsappLogo size={20} weight="fill" />
            </span>
            <div>
              <div className="font-semibold text-ink">Conectar o WhatsApp Business</div>
              <div className="text-sm text-faint">
                Cole o Phone Number ID, o WABA ID e o token permanente do seu painel Meta. Leva ~2 minutos.
              </div>
            </div>
          </div>
          <button
            onClick={onConectar}
            className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#3B82F6,#2563EB)' }}
          >
            <Play size={15} weight="fill" />
            Conectar WhatsApp
          </button>
        </div>
      </>
    );
  }
  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)' }}>
      <div className="mb-3 flex items-center gap-2">
        <Check size={18} weight="bold" className="text-ok" />
        <span className="font-semibold text-ink">Conectado — {config.displayPhone || config.verifiedName}</span>
      </div>
      <div className="text-sm text-faint">
        Template padrão: <strong className="text-sub">{config.defaultTemplate || 'nenhum'}</strong> ·{' '}
        {config.defaultLanguage}
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={onConectar} className="pv-btn-ghost">
          Reconfigurar
        </button>
        <button
          onClick={onDesconectar}
          className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/15"
        >
          Desconectar
        </button>
      </div>
    </div>
  );
}
