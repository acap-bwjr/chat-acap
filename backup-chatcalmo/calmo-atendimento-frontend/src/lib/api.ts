// Client HTTP simples com JWT no header.

const TOKEN_KEY = 'provai_chat_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null): void {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, { method, headers, body: payload });
  // Só recarrega em 401 quando havia sessão (token expirado). No login (sem token)
  // o 401 deve propagar pra tela mostrar "e-mail ou senha inválidos".
  if (res.status === 401 && token) {
    setToken(null);
    location.reload();
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  get: <T>(p: string) => req<T>('GET', p),
  post: <T>(p: string, b?: unknown) => req<T>('POST', p, b),
  patch: <T>(p: string, b?: unknown) => req<T>('PATCH', p, b),
  put: <T>(p: string, b?: unknown) => req<T>('PUT', p, b),
  del: <T>(p: string) => req<T>('DELETE', p),
};

// ---------- Tipos ----------
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'agent';
  avatarUrl?: string | null;
}
export interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  blocked?: boolean;
}
export interface Message {
  id: string;
  conversationId: string;
  direction: 'in' | 'out';
  senderType: 'contact' | 'agent' | 'bot' | 'system';
  type: 'text' | 'image' | 'audio' | 'video' | 'file' | 'location' | 'template';
  content: string | null;
  mediaUrl: string | null;
  mediaMime: string | null;
  mediaName: string | null;
  isPrivate: boolean;
  status: string | null;
  reactionEmoji?: string | null;
  createdAt: string;
  agentSender?: { id: string; name: string } | null;
  replyTo?: {
    id: string;
    content: string | null;
    type: string;
    direction: 'in' | 'out';
    senderType: string;
    mediaUrl: string | null;
  } | null;
}
export interface Label {
  id: string;
  name: string;
  color: string;
}
export interface Agent {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'agent';
  available: boolean;
}
export interface Team {
  id: string;
  name: string;
}
export interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phone?: string;
}
export interface CannedReply {
  id: string;
  shortcut: string;
  content: string;
}
export interface Template {
  id: string;
  name: string;
  friendlyName: string | null;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  language: string;
  header: string | null;
  body: string;
  footer: string | null;
  buttons: TemplateButton[];
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  metaTemplateId: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface InboxInfo {
  id: string;
  name: string;
  conectado: boolean;
  status: string;
  phoneNumberId: string | null;
  wabaId: string | null;
  accessTokenMasked: string | null;
  hasAccessToken: boolean;
  verifyToken: string | null;
  displayPhone: string | null;
  verifiedName: string | null;
  lastError: string | null;
  defaultTemplate: string | null;
  defaultLanguage: string | null;
  webhookUrl: string;
}
export interface DashboardData {
  today: { newConversations: number; inbound: number; outbound: number };
  byStatus: { open: number; pending: number; resolved: number };
  perAgent: { id: string; name: string; emAtendimento: number; mensagensHoje: number }[];
}
export interface ConversationSummary {
  id: string;
  status: 'open' | 'pending' | 'resolved';
  contact: Contact;
  assignee: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  labels: Label[];
  lastMessage: Message | null;
  lastMessageAt: string;
  waWindowUntil: string | null;
  unreadCount: number;
}
