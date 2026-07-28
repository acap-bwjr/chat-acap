import { useEffect, useState } from 'react';
import { X, WhatsappLogo, Copy, Check, CheckCircle } from '@phosphor-icons/react';
import { api, type InboxInfo } from '../lib/api';

// Assistente de conexão MANUAL do WhatsApp Business (API oficial da Meta / Cloud API).
// O admin cola Phone Number ID + WABA ID + token permanente do painel da Meta.
// Feito do zero para conectar o próprio número do Calmo (sem Embedded Signup / Tech Provider).
export default function WaWizard({ onClose, onConectado }: { onClose: () => void; onConectado: () => void }) {
  const [phoneId, setPhoneId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [token, setToken] = useState('');
  const [template, setTemplate] = useState('');
  const [conectando, setConectando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [info, setInfo] = useState<InboxInfo | null>(null);
  const [ajuda, setAjuda] = useState(false);

  useEffect(() => {
    api
      .get<InboxInfo>('/api/inbox')
      .then((i) => {
        setInfo(i);
        if (i.phoneNumberId) setPhoneId(i.phoneNumberId);
        if (i.wabaId) setWabaId(i.wabaId);
        if (i.defaultTemplate) setTemplate(i.defaultTemplate);
      })
      .catch(() => {});
  }, []);

  const podeConectar = !!(phoneId.trim() && wabaId.trim() && token.trim());

  const conectar = async () => {
    setErro(null);
    setConectando(true);
    try {
      const r = await api.post<{ ok: boolean; display_phone?: string; verified_name?: string; error?: string }>(
        '/api/inbox/connect',
        {
          phone_number_id: phoneId.trim(),
          waba_id: wabaId.trim(),
          access_token: token.trim(),
          default_template: template.trim() || undefined,
          default_language: 'pt_BR',
        },
      );
      if (!r.ok) throw new Error(r.error || 'Não foi possível conectar');
      setSucesso(r.display_phone || r.verified_name || 'conectado');
      setInfo(await api.get<InboxInfo>('/api/inbox').catch(() => info));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setConectando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center p-0 lg:items-center lg:p-6"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full overflow-auto rounded-t-2xl border border-line bg-card lg:max-w-lg lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-card px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
              style={{ background: 'linear-gradient(135deg,#25D366,#128C7E)' }}
            >
              <WhatsappLogo size={20} weight="fill" />
            </span>
            <h2 className="text-base font-bold text-ink">Conectar WhatsApp Business</h2>
          </div>
          <button onClick={onClose} className="text-faint transition hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {sucesso ? (
          <div className="px-6 py-8 text-center">
            <div className="mb-2 flex justify-center">
              <CheckCircle size={44} weight="fill" className="text-ok" />
            </div>
            <div className="text-lg font-semibold text-ink">Conectado!</div>
            <div className="mt-1 text-sm text-faint">Número: {sucesso}</div>
            {info?.webhookUrl && <WebhookBox info={info} />}
            <p className="mt-3 text-[12px] text-faint">
              Para <b>receber</b> mensagens, cadastre o webhook acima no seu App Meta.
            </p>
            <button
              onClick={onConectado}
              className="mt-5 w-full rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white"
            >
              Concluir
            </button>
          </div>
        ) : (
          <div className="px-6 py-5">
            <p className="text-sm text-sub">
              Conecte a <b>API oficial da Meta</b> colando 3 dados do seu painel. Você pega uma vez e cola aqui.
            </p>

            <button
              onClick={() => setAjuda(!ajuda)}
              className="mt-3 text-sm font-medium text-brand hover:underline"
            >
              {ajuda ? '▾' : '▸'} Onde encontro esses dados?
            </button>
            {ajuda && (
              <div className="mt-2 space-y-1.5 rounded-xl border border-line bg-app p-3 text-[13px] text-sub">
                <p>
                  <b>Phone Number ID</b> e <b>WABA ID</b>: em{' '}
                  <A href="https://developers.facebook.com/apps">developers.facebook.com</A> → seu App →{' '}
                  <b>WhatsApp → Configuração da API</b>.
                </p>
                <p>
                  <b>Token permanente</b>: <b>Configurações do Negócio → Usuários do sistema</b> → gerar token com{' '}
                  <Code>whatsapp_business_messaging</Code> e <Code>whatsapp_business_management</Code> (validade{' '}
                  <b>Nunca</b>).
                </p>
              </div>
            )}

            <div className="mt-4 space-y-3">
              <Campo label="Phone Number ID" value={phoneId} onChange={setPhoneId} placeholder="ex.: 123456789012345" />
              <Campo
                label="WABA ID (ID da conta do WhatsApp Business)"
                value={wabaId}
                onChange={setWabaId}
                placeholder="ex.: 987654321098765"
              />
              <Campo label="Access Token permanente" value={token} onChange={setToken} placeholder="EAAG..." password />
              <Campo
                label="Template padrão (opcional)"
                value={template}
                onChange={setTemplate}
                placeholder="ex.: reativacao_atendimento"
              />
            </div>

            {info?.webhookUrl && <WebhookBox info={info} />}

            {erro && <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{erro}</div>}

            <div className="mt-5 flex items-center justify-end gap-3">
              <button onClick={onClose} className="pv-btn-ghost">
                Cancelar
              </button>
              <button
                onClick={conectar}
                disabled={conectando || !podeConectar}
                className="rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {conectando ? 'Testando…' : 'Testar e conectar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WebhookBox({ info }: { info: InboxInfo }) {
  return (
    <div className="mt-4 rounded-xl border border-line bg-app p-3 text-left">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
        Webhook — cole no App Meta → WhatsApp → Configuração
      </div>
      <Copyable label="Callback URL" value={info.webhookUrl} />
      {info.verifyToken && <Copyable label="Verify Token" value={info.verifyToken} />}
    </div>
  );
}

function Copyable({ label, value }: { label: string; value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="mt-1.5">
      <div className="text-[11px] text-faint">{label}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-white/5 px-2 py-1 font-mono text-[12px] text-sub">
          {value}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(value);
            setOk(true);
            setTimeout(() => setOk(false), 1200);
          }}
          className="shrink-0 text-faint hover:text-ink"
          title="Copiar"
        >
          {ok ? <Check size={15} className="text-ok" /> : <Copy size={15} />}
        </button>
      </div>
    </div>
  );
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">
      {children}
    </a>
  );
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[12px] text-ink">{children}</code>;
}
function Campo({
  label,
  value,
  onChange,
  placeholder,
  password,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  password?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-faint">{label}</label>
      <input
        type={password ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pv-input py-2 text-sm"
      />
    </div>
  );
}
