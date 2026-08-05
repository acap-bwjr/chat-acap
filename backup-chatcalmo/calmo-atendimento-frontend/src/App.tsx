import { useEffect, useState } from 'react';
import { api, getToken, setToken, type User } from './lib/api';
import { resetSocket } from './lib/socket';
import Shell, { type Page } from './components/Shell';
import Login from './pages/Login';
import Inbox from './pages/Inbox';
import AutoMessages from './pages/AutoMessages';
import DashboardGeral from './pages/DashboardGeral';
import Labels from './pages/Labels';
import Templates from './pages/Templates';
import Settings from './pages/Settings';
import ProspDashboard from './prospeccao/pages/Dashboard';
import ProspPipeline from './prospeccao/pages/Pipeline';
import ProspLeads from './prospeccao/pages/Leads';
import ProspCaptacao from './prospeccao/pages/Captacao';
import ProspObjecoes from './prospeccao/pages/Objecoes';
import Recuperacao from './pages/Recuperacao';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>('conversas');
  const [openConvId, setOpenConvId] = useState<string | null>(null);
  // Retorno do OAuth da Nuvemshop (?recuperacao=conectada | erro&motivo=...)
  const [oauthRecuperacao, setOauthRecuperacao] = useState<{ ok: boolean; motivo?: string } | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const r = p.get('recuperacao');
    if (!r) return;
    setOauthRecuperacao({ ok: r === 'conectada', motivo: p.get('motivo') ?? undefined });
    setPage('recuperacao');
    window.history.replaceState({}, '', window.location.pathname); // limpa a URL
  }, []);

  // Botão de WhatsApp na Prospecção → abre a conversa aqui em "Conversas".
  useEffect(() => {
    const h = (e: Event) => {
      const id = (e as CustomEvent<{ conversationId: string }>).detail?.conversationId;
      if (!id) return;
      setPage('conversas');
      setOpenConvId(id);
    };
    window.addEventListener('open-conversation', h);
    return () => window.removeEventListener('open-conversation', h);
  }, []);

  useEffect(() => {
    async function boot() {
      try {
        // Se já tem sessão salva, valida; senão cai na tela de login.
        if (getToken()) {
          const r = await api.get<{ user: User | null }>('/api/auth/me');
          if (r.user) {
            setUser(r.user);
            return;
          }
          setToken(null);
        }
      } catch {
        setToken(null);
      } finally {
        setLoading(false);
      }
    }
    boot();
  }, []);

  function logout() {
    setToken(null);
    resetSocket();
    setUser(null);
  }

  if (loading) {
    return <div className="grid h-full place-items-center text-slate-400">Carregando…</div>;
  }
  if (!user) return <Login onLogin={setUser} />;

  return (
    <Shell user={user} page={page} onNavigate={setPage} onLogout={logout}>
      {page === 'dashboard' && <DashboardGeral isAdmin={user.role === 'admin'} />}
      {page === 'conversas' && (
        <Inbox user={user} openConversationId={openConvId} onConversationOpened={() => setOpenConvId(null)} />
      )}
      {page === 'automaticas' && <AutoMessages />}
      {page === 'etiquetas' && <Labels />}
      {page === 'templates' && <Templates />}
      {page === 'configuracoes' && <Settings user={user} onUserUpdate={setUser} />}
      {page === 'recuperacao' && <Recuperacao user={user} oauth={oauthRecuperacao} />}
      {page.startsWith('prosp-') && (
        <div className="h-full overflow-y-auto bg-base">
          {page === 'prosp-dashboard' && <ProspDashboard isAdmin={user.role === 'admin'} />}
          {page === 'prosp-pipeline' && <ProspPipeline isAdmin={user.role === 'admin'} nomeUsuario={user.name} />}
          {page === 'prosp-leads' && <ProspLeads />}
          {page === 'prosp-captacao' && <ProspCaptacao />}
          {page === 'prosp-objecoes' && <ProspObjecoes />}
        </div>
      )}
    </Shell>
  );
}
