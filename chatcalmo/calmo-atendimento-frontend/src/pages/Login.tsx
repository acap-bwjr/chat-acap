import { useState } from 'react';
import { api, setToken, type User } from '../lib/api';

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await api.post<{ token: string; user: User }>('/api/auth/login', { email, password });
      setToken(r.token);
      onLogin(r.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="relative grid h-full place-items-center overflow-hidden p-6"
      style={{
        background:
          'radial-gradient(ellipse 70% 55% at 82% 8%, rgba(59,130,246,.40), transparent 60%), radial-gradient(ellipse 55% 50% at 98% 62%, rgba(45,212,191,.24), transparent 60%), linear-gradient(158deg, #0B1437 0%, #152c61 46%, #0c1a3c 100%)',
      }}
    >
      {/* ondas */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%]">
        <Wave color="#3B82F6" opacity={0.5} y={170} className="animate-[pvwave_19s_linear_infinite]" />
        <Wave color="#2DD4BF" opacity={0.38} y={205} className="animate-[pvwave_27s_linear_infinite_reverse]" />
        <Wave color="#93C5FD" opacity={0.28} y={235} className="animate-[pvwave_36s_linear_infinite]" />
      </div>

      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-sm rounded-3xl bg-white p-9"
        style={{ boxShadow: '0 30px 70px -20px rgba(8,12,30,.6)' }}
      >
        <div className="mb-5 flex items-center justify-center">
          <img src="/logo-calmo.png" alt="Calmô" className="h-14 w-auto" />
        </div>
        <h1 className="text-center text-lg font-semibold text-slate-800">Atendimento</h1>
        <p className="mb-7 text-center text-sm text-slate-400">Entre para acessar o painel</p>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
            {error}
          </div>
        )}

        <label className="mb-2 block text-sm font-medium text-slate-600">E-mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mb-4 w-full rounded-xl border-[1.5px] border-slate-200 px-4 py-3 text-slate-800 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
        />
        <label className="mb-2 block text-sm font-medium text-slate-600">Senha</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mb-6 w-full rounded-xl border-[1.5px] border-slate-200 px-4 py-3 text-slate-800 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
        />
        <button
          disabled={loading}
          className="w-full rounded-xl py-3.5 font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
          style={{
            background: 'linear-gradient(135deg, #3B82F6, #2DD4BF)',
            boxShadow: '0 12px 28px -8px rgba(59,130,246,.55)',
          }}
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="mt-6 text-center text-xs text-slate-300">Calmô · atendimento</p>
      </form>
    </div>
  );
}

function Wave({
  color,
  opacity,
  y,
  className,
}: {
  color: string;
  opacity: number;
  y: number;
  className?: string;
}) {
  return (
    <div className={`absolute bottom-0 left-0 h-full w-[200%] ${className ?? ''}`} style={{ opacity }}>
      <svg viewBox="0 0 2880 320" preserveAspectRatio="none" className="h-full w-full">
        <path
          fill={color}
          d={`M0,${y} C240,${y - 60} 480,${y - 60} 720,${y} C960,${y + 60} 1200,${y + 60} 1440,${y} C1680,${y - 60} 1920,${y - 60} 2160,${y} C2400,${y + 60} 2640,${y + 60} 2880,${y} L2880,320 L0,320 Z`}
        />
      </svg>
    </div>
  );
}
