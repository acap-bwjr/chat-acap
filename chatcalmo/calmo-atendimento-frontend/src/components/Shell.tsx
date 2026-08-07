import { useState, type ReactNode } from 'react';
import {
  ChartBar,
  ChatCircleDots,
  Lightning,
  Tag,
  FileText,
  Gear,
  SignOut,
  Sun,
  Moon,
  List,
  SquaresFour,
  Kanban,
  Users,
  Star,
} from '@phosphor-icons/react';
import type { User } from '../lib/api';
import { Logo, LogoMark } from './Logo';
import { getTheme, toggleTheme, type Theme } from '../lib/theme';

export type Page =
  | 'dashboard'
  | 'conversas'
  | 'automaticas'
  | 'etiquetas'
  | 'templates'
  | 'configuracoes'
  | 'prosp-dashboard'
  | 'prosp-pipeline'
  | 'prosp-leads'
  | 'prosp-captacao'
  | 'prosp-objecoes'
  | 'recuperacao';

const NAV: { key: Page; label: string; icon: typeof ChartBar }[] = [
  { key: 'conversas', label: 'Conversas', icon: ChatCircleDots },
  { key: 'automaticas', label: 'Msg. automáticas', icon: Lightning },
  { key: 'etiquetas', label: 'Etiquetas', icon: Tag },
  { key: 'templates', label: 'Templates', icon: FileText },
];

// Prospecção (CRM portado do calmo-sistema)
const PROSP_NAV: { key: Page; label: string; icon: typeof ChartBar }[] = [
  { key: 'prosp-pipeline', label: 'Pipeline', icon: Kanban },
  { key: 'prosp-leads', label: 'Leads', icon: Users },
  { key: 'prosp-objecoes', label: 'Objeções', icon: Star },
];

export default function Shell({
  user,
  page,
  onNavigate,
  onLogout,
  children,
}: {
  user: User;
  page: Page;
  onNavigate: (p: Page) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [navOpen, setNavOpen] = useState(false);
  const go = (p: Page) => {
    onNavigate(p);
    setNavOpen(false);
  };

  return (
    <div className="flex h-full">
      {/* backdrop da gaveta (mobile) */}
      {navOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setNavOpen(false)} />}

      <nav
        className={`fixed inset-y-0 left-0 z-50 flex w-[250px] shrink-0 flex-col border-r border-line transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: 'var(--bg-card)', paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* borda gradiente à direita */}
        <span
          className="pointer-events-none absolute right-0 top-0 h-full w-px"
          style={{
            background:
              'linear-gradient(180deg, rgba(34,197,94,.25), transparent 30%, transparent 70%, rgba(45,212,191,.18))',
          }}
        />

        {/* Marca */}
        <div className="border-b border-line p-3">
          <div className="flex h-[132px] items-center justify-center">
            <Logo size={104} />
          </div>
        </div>

        {/* Navegação */}
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
          <p className="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[0.14em] text-brand/70">
            Visão geral
          </p>
          <button onClick={() => go('dashboard')} className={`nav-link ${page === 'dashboard' ? 'active' : ''}`}>
            <ChartBar size={18} weight={page === 'dashboard' ? 'fill' : 'regular'} />
            Dashboard Geral
          </button>

          <p className="px-3 pb-1 pt-4 text-[9px] font-bold uppercase tracking-[0.14em] text-brand/70">
            Atendimento
          </p>
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = page === item.key;
            return (
              <button key={item.key} onClick={() => go(item.key)} className={`nav-link ${active ? 'active' : ''}`}>
                <Icon size={18} weight={active ? 'fill' : 'regular'} />
                {item.label}
              </button>
            );
          })}

          <p className="px-3 pb-1 pt-4 text-[9px] font-bold uppercase tracking-[0.14em] text-brand/70">
            Prospecção
          </p>
          {PROSP_NAV.map((item) => {
            const Icon = item.icon;
            const active = page === item.key;
            return (
              <button key={item.key} onClick={() => go(item.key)} className={`nav-link ${active ? 'active' : ''}`}>
                <Icon size={18} weight={active ? 'fill' : 'regular'} />
                {item.label}
              </button>
            );
          })}


          <p className="px-3 pb-1 pt-4 text-[9px] font-bold uppercase tracking-[0.14em] text-brand/70">
            Sistema
          </p>
          <button
            onClick={() => go('configuracoes')}
            className={`nav-link ${page === 'configuracoes' ? 'active' : ''}`}
          >
            <Gear size={18} weight={page === 'configuracoes' ? 'fill' : 'regular'} />
            Configurações
          </button>
        </div>

        {/* Rodapé: tema + usuário */}
        <div className="border-t border-line p-3">
          <button onClick={() => setTheme(toggleTheme())} className="nav-link w-full" title="Alternar tema">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          </button>
          <div className="mt-2 flex items-center gap-2.5 rounded-lg px-2 py-2">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg,#22C55E,#2DD4BF)' }}
            >
              {user.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink">{user.name}</p>
              <p className="text-[11px] text-faint">{user.role === 'admin' ? 'Administrador' : 'Atendente'}</p>
            </div>
            <button onClick={onLogout} className="text-faint transition hover:text-ink" title="Sair">
              <SignOut size={18} />
            </button>
          </div>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* barra superior só no mobile: abre a gaveta (respeita a safe-area do iPhone) */}
        <div
          className="shrink-0 border-b border-line bg-card lg:hidden"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex h-12 items-center gap-3 px-3">
            <button
              onClick={() => setNavOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-lg text-sub transition hover:bg-cardh"
              title="Menu"
            >
              <List size={22} />
            </button>
            <LogoMark size={48} />
          </div>
        </div>
        <main className="min-h-0 flex-1 overflow-hidden bg-app">{children}</main>
      </div>
    </div>
  );
}
