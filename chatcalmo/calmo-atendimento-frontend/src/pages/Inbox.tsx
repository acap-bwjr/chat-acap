import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Paperclip,
  PaperPlaneRight,
  MagnifyingGlass,
  UserPlus,
  X,
  Smiley,
  ArrowBendUpLeft,
  Microphone,
  Stop,
  CaretLeft,
  CaretDown,
  EnvelopeSimple,
  Prohibit,
  Broom,
  Trash,
} from '@phosphor-icons/react';
import {
  api,
  type Agent,
  type CannedReply,
  type ConversationSummary,
  type Label,
  type Message,
  type Team,
  type User,
} from '../lib/api';
import { hojeLocal, formatarDataBr } from '../lib/periodo';
import { getSocket } from '../lib/socket';

type Filter = 'all' | 'mine' | 'unassigned' | 'resolved';

export default function Inbox({
  user,
  openConversationId,
  onConversationOpened,
}: {
  user: User;
  openConversationId?: string | null;
  onConversationOpened?: () => void;
}) {
  const [convs, setConvs] = useState<ConversationSummary[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [teamFilter, setTeamFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState(''); // filtro por atendente (admin)
  const [labelFilter, setLabelFilter] = useState(''); // filtro por etiqueta
  const [periodFilter, setPeriodFilter] = useState(''); // filtro por data
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);

  // Cache de mensagens por conversa (pré-carregado no bootstrap) → troca instantânea.
  const [msgCache, setMsgCache] = useState<Record<string, Message[]>>({});
  const [booting, setBooting] = useState(true);

  const loadSupport = useCallback(async () => {
    const [a, t, l] = await Promise.all([
      api.get<Agent[]>('/api/agents'),
      api.get<Team[]>('/api/teams'),
      api.get<Label[]>('/api/labels'),
    ]);
    setAgents(a);
    setTeams(t);
    setLabels(l);
  }, []);

  const loadConvs = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('tab', filter); // all | mine | unassigned | resolved (regra aplicada no servidor)
    if (teamFilter) params.set('teamId', teamFilter);
    if (agentFilter) params.set('agentId', agentFilter);
    if (labelFilter) params.set('labelId', labelFilter);
    if (periodFilter) params.set('period', periodFilter);
    if (search.trim()) params.set('search', search.trim());
    setConvs(await api.get<ConversationSummary[]>(`/api/conversations?${params.toString()}`));
  }, [filter, teamFilter, agentFilter, labelFilter, periodFilter, search]);

  useEffect(() => {
    loadSupport();
  }, [loadSupport]);
  useEffect(() => {
    loadConvs();
  }, [loadConvs]);

  // Pré-carrega TODAS as conversas + últimas 100 mensagens de cada (uma vez, no login).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.get<{ conversations: ConversationSummary[]; messages: Record<string, Message[]> }>(
          '/api/conversations/bootstrap',
        );
        if (!alive) return;
        // Só alimenta o cache de mensagens. A LISTA é sempre do loadConvs (que aplica
        // aba/filtros); assim o bootstrap não sobrescreve a lista filtrada.
        setMsgCache(r.messages);
      } catch {
        /* se falhar, o chat ainda funciona (busca sob demanda) */
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Socket: mantém a lista e o cache de mensagens sempre frescos.
  useEffect(() => {
    const s = getSocket();
    const onNew = (p: { conversationId: string; message: Message }) => {
      setMsgCache((prev) => {
        const list = prev[p.conversationId];
        if (list === undefined) return prev; // conversa não pré-carregada → busca ao abrir
        if (list.some((x) => x.id === p.message.id)) return prev;
        return { ...prev, [p.conversationId]: [...list, p.message] };
      });
      loadConvs();
    };
    const onReactEvt = (p: { conversationId: string; messageId: string; emoji: string | null }) => {
      setMsgCache((prev) => {
        const list = prev[p.conversationId];
        if (!list) return prev;
        return {
          ...prev,
          [p.conversationId]: list.map((x) => (x.id === p.messageId ? { ...x, reactionEmoji: p.emoji } : x)),
        };
      });
    };
    s.on('message:new', onNew);
    s.on('message:reaction', onReactEvt);
    s.on('conversation:update', loadConvs);
    return () => {
      s.off('message:new', onNew);
      s.off('message:reaction', onReactEvt);
      s.off('conversation:update', loadConvs);
    };
  }, [loadConvs]);

  const active = convs.find((c) => c.id === activeId) ?? null;

  // ESC fecha a conversa aberta e volta para "Selecione uma conversa".
  // Se o lightbox (imagem ampliada) estiver aberto, o ESC fecha só ele (handler próprio).
  useEffect(() => {
    if (!activeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[data-lightbox="true"]')) return; // deixa o lightbox tratar
      setActiveId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeId]);

  // abrir conversa + marcar como lida (zera o contador de não-lidas)
  const selectConv = useCallback(
    (c: ConversationSummary) => {
      setActiveId(c.id);
      if (c.unreadCount > 0) api.post(`/api/conversations/${c.id}/read`).then(loadConvs).catch(() => {});
    },
    [loadConvs],
  );

  // Abre uma conversa vinda da Prospecção (botão WhatsApp). Recarrega a lista antes,
  // pois a conversa pode ter acabado de ser criada e ainda não estar em `convs`.
  useEffect(() => {
    if (!openConversationId) return;
    let cancelled = false;
    (async () => {
      await loadConvs();
      if (cancelled) return;
      setActiveId(openConversationId);
      api.post(`/api/conversations/${openConversationId}/read`).then(loadConvs).catch(() => {});
      onConversationOpened?.();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openConversationId]);

  if (booting) {
    return (
      <div className="grid h-full place-items-center bg-app text-faint">
        <div className="text-center">
          <div className="mb-2 animate-pulse text-lg font-medium text-ink">Carregando conversas…</div>
          <div className="text-xs">Pré-carregando as mensagens para navegação instantânea</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Lista */}
      <section
        className={`${
          activeId ? 'hidden lg:flex' : 'flex'
        } w-full shrink-0 flex-col border-r border-line bg-card lg:w-80`}
      >
        <header className="space-y-2.5 border-b border-line p-3">
          <h2 className="font-semibold text-ink">Conversas</h2>
          <div className="relative">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone…"
              className="pv-input py-1.5 pl-9 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1 text-xs">
            {(['all', 'mine', 'unassigned', 'resolved'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-2.5 py-1 transition ${
                  filter === f ? 'bg-brand-700 text-white' : 'bg-white/5 text-sub hover:bg-white/10'
                }`}
              >
                {{ all: 'Todas', mine: 'Minhas', unassigned: 'Sem dono', resolved: 'Resolvidas' }[f]}
              </button>
            ))}
          </div>
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="pv-input py-1.5 text-xs">
            <option value="">Todos os times</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-1.5">
            {/* Atendente: só faz sentido p/ admin (atendente já só enxerga as dele) */}
            {user.role === 'admin' && (
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="pv-input col-span-2 py-1.5 text-xs"
                title="Filtrar por atendente"
              >
                <option value="">Todos os atendentes</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="pv-input py-1.5 text-xs"
              title="Filtrar por data"
            >
              <option value="">Qualquer data</option>
              <option value="today">Hoje</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
            </select>
            <select
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
              className="pv-input py-1.5 text-xs"
              title="Filtrar por etiqueta"
            >
              <option value="">Todas etiquetas</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          {convs.length === 0 && <p className="p-4 text-sm text-faint">Nenhuma conversa.</p>}
          {convs.map((c) => (
            <ConvItem
              key={c.id}
              conv={c}
              active={c.id === activeId}
              onClick={() => selectConv(c)}
              onChanged={loadConvs}
              onPurge={(id, opts) => {
                setMsgCache((prev) => {
                  const n = { ...prev };
                  delete n[id];
                  return n;
                });
                if (opts?.fechar && activeId === id) setActiveId(null);
              }}
            />
          ))}
        </div>
      </section>

      {active ? (
        <Thread
          key={active.id}
          conv={active}
          user={user}
          agents={agents}
          teams={teams}
          allLabels={labels}
          initialMessages={msgCache[active.id]}
          onChanged={loadConvs}
          onLabelsChanged={loadSupport}
          onBack={() => setActiveId(null)}
        />
      ) : (
        <div className="hidden flex-1 place-items-center text-faint lg:grid">Selecione uma conversa</div>
      )}
    </div>
  );
}

function statusColor(s: string) {
  return s === 'open' ? 'bg-ok' : s === 'pending' ? 'bg-amber-400' : 'bg-white/25';
}

// Data/hora relativa do card da conversa: hoje -> HH:MM, ontem -> "Ontem",
// últimos 7 dias -> dia da semana, mais antigo -> DD/MM.
function formatConvTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Ontem';
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 7) return d.toLocaleDateString('pt-BR', { weekday: 'short' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function ConvItem({
  conv,
  active,
  onClick,
  onChanged,
  onPurge,
}: {
  conv: ConversationSummary;
  active: boolean;
  onClick: () => void;
  onChanged: () => void;
  onPurge: (id: string, opts?: { fechar?: boolean }) => void;
}) {
  const name = conv.contact.name || conv.contact.phone || 'Sem nome';
  const preview = conv.lastMessage?.content ?? (conv.lastMessage ? '[mídia]' : '');
  const unread = conv.unreadCount > 0;
  const [menu, setMenu] = useState(false);
  const bloqueado = Boolean(conv.contact.blocked);

  // fecha o menu ao clicar fora
  useEffect(() => {
    if (!menu) return;
    const fechar = () => setMenu(false);
    window.addEventListener('click', fechar);
    return () => window.removeEventListener('click', fechar);
  }, [menu]);

  async function acao(tipo: 'unread' | 'block' | 'clear' | 'delete') {
    setMenu(false);
    try {
      if (tipo === 'unread') {
        await api.post(`/api/conversations/${conv.id}/unread`);
      } else if (tipo === 'block') {
        await api.post(`/api/conversations/${conv.id}/block`, { blocked: !bloqueado });
      } else if (tipo === 'clear') {
        if (!confirm(`Limpar a conversa com ${name}?\n\nTodas as mensagens serão apagadas (a conversa continua na lista).`)) return;
        await api.del(`/api/conversations/${conv.id}/messages`);
        onPurge(conv.id);
      } else {
        if (!confirm(`Apagar a conversa com ${name}?\n\nA conversa e todas as mensagens serão removidas.`)) return;
        await api.del(`/api/conversations/${conv.id}`);
        onPurge(conv.id, { fechar: true });
      }
      onChanged();
    } catch (err) {
      alert('Não foi possível concluir: ' + (err as Error).message);
    }
  }

  return (
    <div className={`group relative border-b border-line/60 transition hover:bg-cardh ${active ? 'bg-brand/10' : ''}`}>
      {/* Setinha com as ações da conversa (igual ao WhatsApp) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setMenu((v) => !v);
        }}
        title="Ações da conversa"
        className={`absolute right-1.5 top-8 z-20 grid h-6 w-6 place-items-center rounded-full bg-card/90 text-sub shadow transition hover:text-ink ${
          menu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
        }`}
      >
        <CaretDown size={13} weight="bold" />
      </button>
      {menu && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-1.5 top-14 z-30 w-52 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-2xl"
        >
          <MenuItem icon={<EnvelopeSimple size={16} />} label="Marcar como não lida" onClick={() => acao('unread')} />
          <MenuItem
            icon={<Prohibit size={16} />}
            label={bloqueado ? 'Desbloquear' : 'Bloquear'}
            onClick={() => acao('block')}
          />
          <MenuItem icon={<Broom size={16} />} label="Limpar conversa" onClick={() => acao('clear')} perigo />
          <MenuItem icon={<Trash size={16} />} label="Apagar conversa" onClick={() => acao('delete')} perigo />
        </div>
      )}
      <button onClick={onClick} className="flex w-full items-start gap-3 p-3 text-left">
      <div
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
        style={{ background: 'linear-gradient(135deg,#3B82F6,#2DD4BF)' }}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${statusColor(conv.status)}`} />
          <span className={`min-w-0 flex-1 truncate text-ink ${unread ? 'font-bold' : 'font-medium'}`}>{name}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-[11px]">
            {conv.assignee && (
              <span className="max-w-24 truncate font-medium text-brand" title={`Atribuída a ${conv.assignee.name}`}>
                {conv.assignee.name}
              </span>
            )}
            <span className="text-faint">{formatConvTime(conv.lastMessageAt)}</span>
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <p className={`min-w-0 flex-1 truncate text-sm ${unread ? 'font-medium text-ink' : 'text-faint'}`}>{preview}</p>
          {unread && (
            <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-ok px-1.5 text-[10px] font-bold text-white">
              {conv.unreadCount}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {conv.team && <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] text-brand">{conv.team.name}</span>}
          {conv.labels.map((l) => (
            <span key={l.id} className="rounded px-1.5 py-0.5 text-[10px] text-white" style={{ backgroundColor: l.color }}>
              {l.name}
            </span>
          ))}
        </div>
      </div>
      </button>
    </div>
  );
}

/** Item do menu de ações da conversa. */
function MenuItem({
  icon,
  label,
  onClick,
  perigo,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  perigo?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition hover:bg-cardh ${
        perigo ? 'text-red-400' : 'text-sub hover:text-ink'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Thread({
  conv,
  user,
  agents,
  teams,
  allLabels,
  initialMessages,
  onChanged,
  onLabelsChanged,
  onBack,
}: {
  conv: ConversationSummary;
  user: User;
  agents: Agent[];
  teams: Team[];
  allLabels: Label[];
  initialMessages?: Message[];
  onChanged: () => void;
  onLabelsChanged: () => void;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>(() => initialMessages ?? []);
  const [text, setText] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [canned, setCanned] = useState<CannedReply[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recTimerRef = useRef<number | null>(null);
  const recCanceledRef = useRef(false);

  useEffect(() => {
    // Se não veio pré-carregado (conversa nova/fora do preload), busca sob demanda.
    if (initialMessages === undefined) {
      api
        .get<{ messages: Message[] }>(`/api/conversations/${conv.id}`)
        .then((r) => setMessages(r.messages))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.id]);

  useEffect(() => {
    const s = getSocket();
    const onNew = (p: { conversationId: string; message: Message }) => {
      if (p.conversationId !== conv.id) return;
      setMessages((m) => (m.some((x) => x.id === p.message.id) ? m : [...m, p.message]));
    };
    const onReactEvt = (p: { conversationId: string; messageId: string; emoji: string | null }) => {
      if (p.conversationId === conv.id)
        setMessages((m) => m.map((x) => (x.id === p.messageId ? { ...x, reactionEmoji: p.emoji } : x)));
    };
    s.on('message:new', onNew);
    s.on('message:reaction', onReactEvt);
    return () => {
      s.off('message:new', onNew);
      s.off('message:reaction', onReactEvt);
    };
  }, [conv.id]);

  // reagir a uma mensagem do cliente (clicar no mesmo emoji remove) — envia pro WhatsApp
  const onReact = useCallback(async (m: Message, emoji: string) => {
    const novo = m.reactionEmoji === emoji ? '' : emoji;
    const prev = m.reactionEmoji ?? null;
    setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, reactionEmoji: novo || null } : x)));
    try {
      await api.post(`/api/messages/${m.id}/reaction`, { emoji: novo });
    } catch {
      setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, reactionEmoji: prev } : x)));
    }
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // textarea cresce conforme o texto (auto-resize), até um limite.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  // mensagens automáticas do usuário (comando /atalho)
  useEffect(() => {
    api.get<CannedReply[]>('/api/canned-replies').then(setCanned).catch(() => {});
  }, []);
  const slashMatches = text.startsWith('/')
    ? canned.filter((r) => r.shortcut.toLowerCase().startsWith(text.slice(1).toLowerCase())).slice(0, 6)
    : [];
  function selectCanned(r: CannedReply) {
    setText(r.content);
    setTimeout(() => taRef.current?.focus(), 0);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (pendingFile) {
      await sendPending();
      return;
    }
    const content = text.trim();
    if (!content) return;
    setError('');

    // ENVIO OTIMISTA: mostra na hora com id temporário; reconcilia depois.
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const replyId = replyingTo?.id;
    const optimistic: Message = {
      id: tempId,
      conversationId: conv.id,
      direction: 'out',
      senderType: 'agent',
      type: 'text',
      content,
      mediaUrl: null,
      mediaMime: null,
      mediaName: null,
      isPrivate,
      status: 'sending',
      reactionEmoji: null,
      createdAt: new Date().toISOString(),
      agentSender: { id: user.id, name: user.name },
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            content: replyingTo.content,
            type: replyingTo.type,
            direction: replyingTo.direction,
            senderType: replyingTo.senderType,
            mediaUrl: replyingTo.mediaUrl,
          }
        : null,
    };
    setMessages((m) => [...m, optimistic]);
    setText('');
    setReplyingTo(null);

    try {
      const real = await api.post<Message>(`/api/conversations/${conv.id}/messages`, {
        content,
        isPrivate,
        replyToId: replyId,
      });
      // troca o otimista pelo real (dedupe caso o socket já tenha trazido)
      setMessages((m) => {
        const semTmp = m.filter((x) => x.id !== tempId);
        return semTmp.some((x) => x.id === real.id) ? semTmp : [...semTmp, real];
      });
      onChanged();
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== tempId)); // reverte
      setText(content); // devolve o texto pra não perder
      setError((err as Error).message);
    }
  }

  // Coloca um arquivo "na fila" (prévia antes de enviar) — igual ao WhatsApp.
  function queueFile(file: File) {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(file);
    const isMedia = file.type.startsWith('image/') || file.type.startsWith('audio/');
    setPendingPreview(isMedia ? URL.createObjectURL(file) : null);
  }
  function cancelPending() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
  }
  // Colar imagem (Ctrl+V) direto no campo de mensagem.
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of items) {
      if (it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) {
          e.preventDefault();
          queueFile(f);
          return;
        }
      }
    }
  }
  async function sendPending() {
    const file = pendingFile;
    if (!file) return;
    const caption = text.trim();
    setSending(true);
    setError('');
    cancelPending();
    setText('');
    try {
      const fd = new FormData();
      if (caption) fd.append('caption', caption);
      fd.append('file', file);
      await api.post(`/api/conversations/${conv.id}/media`, fd);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  // ===== Gravação de áudio (mensagem de voz) =====
  function pickAudioMime(): string {
    const cands = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'];
    for (const c of cands) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c)) return c;
    }
    return '';
  }
  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickAudioMime();
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mrRef.current = mr;
      chunksRef.current = [];
      recCanceledRef.current = false;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (recTimerRef.current) {
          window.clearInterval(recTimerRef.current);
          recTimerRef.current = null;
        }
        setRecording(false);
        setRecSecs(0);
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        if (!recCanceledRef.current && blob.size > 0) {
          const ext = (mr.mimeType || '').includes('ogg') ? 'ogg' : 'webm';
          queueFile(new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type }));
        }
      };
      mr.start();
      setRecording(true);
      setRecSecs(0);
      recTimerRef.current = window.setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch {
      setError('Não foi possível acessar o microfone (permita o acesso no navegador).');
    }
  }
  function stopRec() {
    recCanceledRef.current = false;
    mrRef.current?.stop();
  }
  function cancelRec() {
    recCanceledRef.current = true;
    mrRef.current?.stop();
  }
  const fmtSecs = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const name = conv.contact.name || conv.contact.phone || 'Sem nome';
  const windowOpen = conv.waWindowUntil && new Date(conv.waWindowUntil) > new Date();

  return (
    <>
      <section className="flex min-w-0 flex-1 flex-col bg-app">
        <header className="flex items-center justify-between border-b border-line bg-card px-4 py-3">
          <div className="flex min-w-0 items-center gap-1">
            <button
              onClick={onBack}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sub transition hover:bg-cardh lg:hidden"
              title="Voltar"
            >
              <CaretLeft size={22} />
            </button>
            <button
              onClick={() => setShowDetails((v) => !v)}
              className="flex min-w-0 items-center gap-3 rounded-lg px-1 py-0.5 text-left transition hover:bg-cardh"
              title="Ver detalhes do contato"
            >
              <div
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg,#3B82F6,#2DD4BF)' }}
              >
                {name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-ink hover:underline">{name}</h3>
                <p className="truncate text-xs text-faint">{conv.contact.phone}</p>
              </div>
            </button>
          </div>
          {conv.status !== 'resolved' ? (
            <button
              onClick={() => api.patch(`/api/conversations/${conv.id}`, { status: 'resolved' }).then(onChanged)}
              className="rounded-lg bg-ok/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-ok"
            >
              Resolver
            </button>
          ) : (
            <button
              onClick={() => api.patch(`/api/conversations/${conv.id}`, { status: 'open' }).then(onChanged)}
              className="pv-btn-ghost py-1.5 text-xs"
            >
              Reabrir
            </button>
          )}
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {messages.map((m) => (
            <Bubble key={m.id} m={m} onReact={onReact} onReply={setReplyingTo} />
          ))}
          <div ref={endRef} />
        </div>

        <form onSubmit={send} className="border-t border-line bg-card p-3">
          {error && <div className="mb-2 rounded bg-red-500/10 px-2 py-1 text-xs text-red-400">{error}</div>}
          {!windowOpen && (
            <div className="mb-2 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-400">
              Janela de 24h fechada — só é possível enviar template (em breve).
            </div>
          )}
          {slashMatches.length > 0 && (
            <div className="mb-2 max-h-52 overflow-y-auto rounded-lg border border-line bg-card shadow-lg">
              {slashMatches.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => selectCanned(r)}
                  className="block w-full border-b border-line/60 px-3 py-2 text-left transition last:border-0 hover:bg-cardh"
                >
                  <div className="font-mono text-xs font-semibold text-brand">/{r.shortcut}</div>
                  <div className="truncate text-sm text-sub">{r.content}</div>
                </button>
              ))}
            </div>
          )}
          {replyingTo && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border-l-2 border-brand bg-cardh px-3 py-2">
              <ArrowBendUpLeft size={15} className="shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-brand">
                  Respondendo {replyingTo.direction === 'in' ? 'ao cliente' : 'à sua mensagem'}
                </div>
                <div className="truncate text-xs text-sub">
                  {replyingTo.content || (replyingTo.mediaUrl ? '[mídia]' : '')}
                </div>
              </div>
              <button type="button" onClick={() => setReplyingTo(null)} className="shrink-0 text-faint transition hover:text-ink">
                <X size={16} />
              </button>
            </div>
          )}
          {pendingFile && (
            <div className="mb-2 flex items-center gap-3 rounded-lg border border-line bg-cardh p-2">
              {pendingFile.type.startsWith('audio/') ? (
                <>
                  <span className="text-xl">🎤</span>
                  <audio controls src={pendingPreview ?? undefined} className="h-9 min-w-0 flex-1" />
                </>
              ) : (
                <>
                  {pendingPreview ? (
                    <img src={pendingPreview} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  ) : (
                    <div className="grid h-16 w-16 place-items-center rounded-lg bg-white/5 text-2xl">📄</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{pendingFile.name || 'imagem colada'}</div>
                    <div className="text-xs text-faint">Escreva uma legenda (opcional) e clique em enviar</div>
                  </div>
                </>
              )}
              <button type="button" onClick={cancelPending} className="shrink-0 text-faint transition hover:text-red-400" title="Cancelar">
                <X size={18} />
              </button>
            </div>
          )}
          <label className="mb-2 flex w-fit items-center gap-1.5 text-xs text-sub">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            Nota interna
          </label>
          {recording ? (
            <div className="flex items-center gap-3 rounded-xl border border-red-400/40 bg-red-500/5 px-3 py-2.5">
              <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-red-500" />
              <span className="flex-1 text-sm font-medium text-ink">Gravando… {fmtSecs(recSecs)}</span>
              <button
                type="button"
                onClick={cancelRec}
                className="shrink-0 rounded-lg px-3 py-1.5 text-xs text-faint transition hover:text-red-400"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={stopRec}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500 text-white transition hover:brightness-110"
                title="Parar e revisar"
              >
                <Stop size={18} weight="fill" />
              </button>
            </div>
          ) : (
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="grid h-10 w-10 place-items-center rounded-xl border border-line text-sub transition hover:bg-cardh"
              title="Anexar"
            >
              <Paperclip size={18} />
            </button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) queueFile(e.target.files[0]);
                e.target.value = '';
              }}
            />
            <EmojiButton onPick={(e) => setText((t) => t + e)} />
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (slashMatches.length > 0) selectCanned(slashMatches[0]);
                  else send(e);
                }
              }}
              rows={1}
              placeholder={pendingFile ? 'Legenda (opcional)…' : isPrivate ? 'Nota interna…' : 'Mensagem…'}
              className={`max-h-40 min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border px-3 py-2.5 text-sm text-ink outline-none transition focus:ring-4 focus:ring-brand/10 ${
                isPrivate ? 'border-amber-400/50 bg-amber-500/5' : 'border-line bg-card focus:border-brand'
              }`}
            />
            {text.trim() || pendingFile ? (
              <button disabled={sending} className="pv-btn h-10 shrink-0 px-4" title="Enviar">
                <PaperPlaneRight size={18} weight="fill" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startRec}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-sub transition hover:bg-cardh"
                title="Gravar áudio"
              >
                <Microphone size={18} />
              </button>
            )}
          </div>
          )}
        </form>
      </section>

      {showDetails && (
        <DetailsPanel
          conv={conv}
          user={user}
          agents={agents}
          teams={teams}
          allLabels={allLabels}
          onChanged={onChanged}
          onLabelsChanged={onLabelsChanged}
          onClose={() => setShowDetails(false)}
        />
      )}
    </>
  );
}

function DetailsPanel({
  conv,
  user,
  agents,
  teams,
  allLabels,
  onChanged,
  onLabelsChanged,
  onClose,
}: {
  conv: ConversationSummary;
  user: User;
  agents: Agent[];
  teams: Team[];
  allLabels: Label[];
  onChanged: () => void;
  onLabelsChanged: () => void;
  onClose: () => void;
}) {
  const [cName, setCName] = useState(conv.contact.name ?? '');
  const [cEmail, setCEmail] = useState(conv.contact.email ?? '');
  const [savingContact, setSavingContact] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    setCName(conv.contact.name ?? '');
    setCEmail(conv.contact.email ?? '');
  }, [conv.contact.id, conv.contact.name, conv.contact.email]);

  async function patchConv(data: Record<string, unknown>) {
    await api.patch(`/api/conversations/${conv.id}`, data);
    onChanged();
  }

  async function saveContact() {
    setSavingContact(true);
    try {
      await api.patch(`/api/contacts/${conv.contact.id}`, { name: cName, email: cEmail });
      onChanged();
    } finally {
      setSavingContact(false);
    }
  }

  // Etiquetas: estado local OTIMISTA (o chip responde na hora) ressincronizado com o
  // servidor sempre que a conversa muda. Evita o efeito "aparece e some" causado por
  // um refresh chegando fora de ordem, e mostra erro em vez de reverter em silêncio.
  const serverLabelIds = conv.labels.map((l) => l.id).join(',');
  const [labelIds, setLabelIds] = useState<string[]>(() => conv.labels.map((l) => l.id));
  useEffect(() => {
    setLabelIds(conv.labels.map((l) => l.id));
  }, [conv.id, serverLabelIds]);
  const activeLabelIds = new Set(labelIds);

  async function salvarLabels(next: string[]) {
    const anterior = labelIds;
    setLabelIds(next); // otimista
    try {
      await api.put(`/api/conversations/${conv.id}/labels`, { labelIds: next });
      onChanged();
    } catch (err) {
      setLabelIds(anterior); // reverte só se o servidor recusou
      alert('Não foi possível salvar a etiqueta: ' + (err as Error).message);
    }
  }

  function toggleLabel(id: string) {
    const next = activeLabelIds.has(id) ? labelIds.filter((x) => x !== id) : [...labelIds, id];
    void salvarLabels(next);
  }

  async function createLabel() {
    const nm = newLabel.trim();
    if (!nm) return;
    try {
      const created = await api.post<Label>('/api/labels', { name: nm });
      setNewLabel('');
      await onLabelsChanged();
      await salvarLabels([...labelIds, created.id]);
    } catch (err) {
      alert('Não foi possível criar a etiqueta: ' + (err as Error).message);
    }
  }

  const H = ({ children }: { children: React.ReactNode }) => (
    <h4 className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-brand/70">{children}</h4>
  );

  return (
    <aside
      className="fixed inset-0 z-40 flex w-full flex-col gap-5 overflow-y-auto border-l border-line bg-card p-4 lg:static lg:z-auto lg:w-72 lg:shrink-0"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">Detalhes</span>
        <button onClick={onClose} className="rounded-lg p-1 text-sub transition hover:bg-cardh hover:text-ink" title="Fechar">
          <X size={18} />
        </button>
      </div>

      <section>
        <H>Contato</H>
        <label className="mb-1 block text-xs text-sub">Nome</label>
        <input value={cName} onChange={(e) => setCName(e.target.value)} className="pv-input mb-2 py-1.5 text-sm" />
        <label className="mb-1 block text-xs text-sub">E-mail</label>
        <input value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="sem e-mail" className="pv-input mb-1 py-1.5 text-sm" />
        <p className="mb-2 text-xs text-faint">Telefone: {conv.contact.phone ?? '—'}</p>
        <button onClick={saveContact} disabled={savingContact} className="pv-btn-ghost w-full py-1.5 text-xs">
          {savingContact ? 'Salvando…' : 'Salvar contato'}
        </button>
      </section>

      <section>
        <H>Atendente</H>
        <select
          value={conv.assignee?.id ?? ''}
          onChange={(e) => patchConv({ assigneeId: e.target.value || null })}
          className="pv-input mb-1 py-1.5 text-sm"
        >
          <option value="">Sem atendente</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.id === user.id ? ' (eu)' : ''}
            </option>
          ))}
        </select>
        {conv.assignee?.id !== user.id && (
          <button onClick={() => patchConv({ assigneeId: user.id })} className="pv-btn-ghost w-full py-1 text-xs">
            <UserPlus size={14} /> Assumir pra mim
          </button>
        )}
      </section>

      <section>
        <H>Registrar venda</H>
        <RegistrarVenda conv={conv} user={user} agents={agents} />
      </section>

      <section>
        <H>Time</H>
        <select
          value={conv.team?.id ?? ''}
          onChange={(e) => patchConv({ teamId: e.target.value || null })}
          className="pv-input py-1.5 text-sm"
        >
          <option value="">Sem time</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </section>

      <section>
        <H>Etiquetas</H>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {allLabels.map((l) => {
            const on = activeLabelIds.has(l.id);
            return (
              <button
                key={l.id}
                onClick={() => toggleLabel(l.id)}
                className={`rounded-full px-2 py-0.5 text-[11px] transition ${on ? 'text-white' : 'text-sub'}`}
                style={on ? { backgroundColor: l.color } : { backgroundColor: 'rgba(255,255,255,0.06)' }}
              >
                {l.name}
              </button>
            );
          })}
          {allLabels.length === 0 && <span className="text-xs text-faint">Nenhuma etiqueta ainda.</span>}
        </div>
        <div className="flex gap-1">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createLabel()}
            placeholder="Nova etiqueta"
            className="pv-input min-w-0 flex-1 py-1 text-xs"
          />
          <button onClick={createLabel} className="pv-btn px-3 py-1 text-xs">
            +
          </button>
        </div>
      </section>
    </aside>
  );
}

// Detecta URLs no texto: com http(s)://, com www. ou domínio "puro" (calmo.com.br/x).
// A lista de TLDs evita falso-positivo em abreviações ("Sr.Fulano", "1.500").
const URL_RE =
  /(?:https?:\/\/|www\.)[^\s]+|[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com\.br|com|net|org|gov|edu|br|io|dev|app|me|co|shop|store|site|online|info|biz|tv|ai|xyz|link)(?:\/[^\s]*)?/gi;

/** Renderiza o texto tornando os links clicáveis (nas mensagens enviadas e recebidas). */
function Linkify({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  const re = new RegExp(URL_RE.source, 'gi');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let url = m[0];
    // não engolir pontuação no fim do link (ex.: "veja calmo.com.br.")
    const trail = url.match(/[.,;:!?)\]}"']+$/);
    const tail = trail ? trail[0] : '';
    if (tail) url = url.slice(0, -tail.length);
    if (!url) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    out.push(
      <a
        key={`${m.index}-${url}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="underline underline-offset-2 break-all hover:opacity-80"
      >
        {url}
      </a>,
    );
    if (tail) out.push(tail);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

function Bubble({
  m,
  onReact,
  onReply,
}: {
  m: Message;
  onReact: (m: Message, emoji: string) => void;
  onReply: (m: Message) => void;
}) {
  if (m.isPrivate) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
        <div className="mb-0.5 text-[10px] font-semibold uppercase text-amber-400/80">
          Nota interna · {m.agentSender?.name ?? ''}
        </div>
        <Linkify text={m.content ?? ''} />
      </div>
    );
  }
  const out = m.direction === 'out';
  const canReact = !out; // WhatsApp só permite reagir a mensagens recebidas
  return (
    <div className={`group flex items-end gap-1 ${out ? 'justify-end' : 'justify-start'}`}>
      {out && <MsgControls m={m} canReact={false} onReply={onReply} onReact={onReact} />}
      <div
        className={`relative max-w-md rounded-2xl px-3 py-2 text-sm ${
          out ? 'rounded-br-sm text-white' : 'rounded-bl-sm border border-line bg-card text-ink'
        }`}
        style={out ? { background: 'linear-gradient(135deg,#3B82F6,#2563EB)' } : undefined}
      >
        {m.replyTo && <QuotedPreview r={m.replyTo} out={out} />}
        <MediaView m={m} />
        {m.content && (
          <p className="whitespace-pre-wrap break-words">
            <Linkify text={m.content} />
          </p>
        )}
        <div className={`mt-1 text-right text-[10px] ${out ? 'text-white/60' : 'text-faint'}`}>
          {m.status === 'sending'
            ? 'enviando…'
            : new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
        {m.reactionEmoji && (
          <span className="absolute -bottom-2.5 right-1 rounded-full border border-line bg-card px-1 text-xs leading-tight shadow">
            {m.reactionEmoji}
          </span>
        )}
      </div>
      {!out && <MsgControls m={m} canReact={true} onReply={onReply} onReact={onReact} />}
    </div>
  );
}

function MsgControls({
  m,
  canReact,
  onReply,
  onReact,
}: {
  m: Message;
  canReact: boolean;
  onReply: (m: Message) => void;
  onReact: (m: Message, emoji: string) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 self-center opacity-0 transition group-hover:opacity-100">
      <button
        type="button"
        onClick={() => onReply(m)}
        title="Responder"
        className="grid h-7 w-7 place-items-center rounded-full border border-line bg-card text-sub transition hover:bg-cardh"
      >
        <ArrowBendUpLeft size={14} />
      </button>
      {canReact && <ReactTrigger m={m} onReact={onReact} />}
    </div>
  );
}

function QuotedPreview({ r, out }: { r: NonNullable<Message['replyTo']>; out: boolean }) {
  const quem = r.direction === 'out' ? 'Você' : 'Cliente';
  const texto = r.content || (r.mediaUrl ? '[mídia]' : '');
  return (
    <div
      className={`mb-1 rounded-lg border-l-2 px-2 py-1 text-xs ${
        out ? 'border-white/70 bg-white/10 text-white/85' : 'border-brand bg-black/5 text-sub'
      }`}
    >
      <div className="font-semibold">{quem}</div>
      <div className="truncate">{texto}</div>
    </div>
  );
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function ReactTrigger({ m, onReact }: { m: Message; onReact: (m: Message, emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid h-7 w-7 place-items-center rounded-full border border-line bg-card text-sub transition hover:bg-cardh"
        title="Reagir"
      >
        <Smiley size={15} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-8 left-0 z-20 flex gap-0.5 rounded-full border border-line bg-card p-1 shadow-lg">
            {QUICK_REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onReact(m, e);
                  setOpen(false);
                }}
                className={`rounded-full px-1 text-lg leading-none transition hover:bg-cardh ${
                  m.reactionEmoji === e ? 'bg-brand/20' : ''
                }`}
                title={m.reactionEmoji === e ? 'Remover reação' : `Reagir ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const EMOJI_LIST = [
  '😀','😁','😂','🤣','😊','😍','😘','😎','🤩','🥳','😇','🙂','😉','😌','😴','🤔','🤨','😐','🙄','😏',
  '😥','😮','😯','😲','😳','🥺','😢','😭','😤','😠','😡','😱','😨','😰','😅','😓','🤗','🤝','👍','👎',
  '👏','🙌','🙏','💪','👌','✌️','👋','❤️','🧡','💛','💚','💙','💜','🖤','💯','🔥','✨','⭐','🎉','✅',
  '❌','⚠️','❓','❗','💬','📎','📷','🎁','☕','🚀',
];

function EmojiButton({ onPick }: { onPick: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid h-10 w-10 place-items-center rounded-xl border border-line text-sub transition hover:bg-cardh"
        title="Emojis"
      >
        <Smiley size={18} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-12 left-0 z-20 grid max-h-56 w-64 grid-cols-8 gap-0.5 overflow-y-auto rounded-xl border border-line bg-card p-2 shadow-xl">
            {EMOJI_LIST.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onPick(e);
                  setOpen(false);
                }}
                className="rounded-lg p-1 text-lg leading-none transition hover:bg-cardh"
              >
                {e}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MediaView({ m }: { m: Message }) {
  const [zoom, setZoom] = useState(false);
  if (!m.mediaUrl) return null;
  if (m.type === 'image')
    return (
      <>
        <img
          src={m.mediaUrl}
          alt=""
          onClick={() => setZoom(true)}
          className="mb-1 max-h-64 cursor-zoom-in rounded-lg"
        />
        {zoom && <Lightbox url={m.mediaUrl} onClose={() => setZoom(false)} />}
      </>
    );
  if (m.type === 'audio') return <audio controls src={m.mediaUrl} className="mb-1 w-56" />;
  if (m.type === 'video') return <video controls src={m.mediaUrl} className="mb-1 max-h-64 rounded-lg" />;
  return (
    <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="mb-1 block underline">
      {m.mediaName ?? 'arquivo'}
    </a>
  );
}

// Popup de imagem em tamanho real (fecha no clique fora, no X ou com ESC).
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div data-lightbox="true" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      <img
        src={url}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain"
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 text-white/80 transition hover:text-white"
        style={{ top: 'calc(env(safe-area-inset-top) + 1rem)' }}
        title="Fechar (ESC)"
      >
        <X size={30} />
      </button>
    </div>
  );
}

/** Bloco "Registrar venda" no painel de detalhes da conversa. */
function RegistrarVenda({
  conv,
  user,
  agents,
}: {
  conv: ConversationSummary;
  user: User;
  agents: Agent[];
}) {
  const [valor, setValor] = useState('');
  // A data começa em "hoje" pelo relógio local e é RECALCULADA na hora de salvar
  // enquanto o vendedor não mexer nela — assim uma aba aberta desde ontem não
  // grava a venda no dia errado.
  const [data, setData] = useState(hojeLocal);
  const [dataTocada, setDataTocada] = useState(false);
  const [vendedor, setVendedor] = useState(conv.assignee?.id ?? user.id);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  const [vendas, setVendas] = useState<{ id: string; amount: number; soldAt: string }[]>([]);

  const carregar = useCallback(() => {
    api
      .get<{ id: string; amount: number; soldAt: string }[]>(`/api/conversations/${conv.id}/sales`)
      .then(setVendas)
      .catch(() => {});
  }, [conv.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvar() {
    const n = Number(String(valor).replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return setMsg('Informe um valor válido.');
    setSalvando(true);
    setMsg('');
    const dia = dataTocada ? data : hojeLocal();
    try {
      await api.post(`/api/conversations/${conv.id}/sales`, { amount: n, soldAt: dia, agentId: vendedor });
      setValor('');
      setData(dia);
      setMsg(
        dia === hojeLocal()
          ? `Venda registrada hoje (${formatarDataBr(dia)}).`
          : `Venda registrada em ${formatarDataBr(dia)} — para vê-la no painel, filtre um período que inclua esse dia.`
      );
      carregar();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const totalConversa = vendas.reduce((s, v) => s + v.amount, 0);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          inputMode="decimal"
          placeholder="Valor (R$)"
          className="pv-input py-1.5 text-xs"
        />
        <input type="date" value={data} onChange={(e) => { setData(e.target.value); setDataTocada(true); }} className="pv-input py-1.5 text-xs" />
      </div>
      <select value={vendedor} onChange={(e) => setVendedor(e.target.value)} className="pv-input py-1.5 text-xs">
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <button onClick={salvar} disabled={salvando} className="pv-btn w-full py-1.5 text-xs">
        {salvando ? 'Registrando…' : 'Registrar venda'}
      </button>
      {msg && <p className={`text-[11px] ${msg === 'Venda registrada!' ? 'text-ok' : 'text-red-400'}`}>{msg}</p>}
      {vendas.length > 0 && (
        <p className="text-[11px] text-faint">
          {vendas.length} venda(s) nesta conversa ·{' '}
          <span className="font-semibold text-ok">
            {totalConversa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        </p>
      )}
    </div>
  );
}
