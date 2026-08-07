import { useEffect, useRef, useState } from 'react';
import { api, setToken, type LoginResponse, type User } from '../lib/api';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    async function handleGoogleCredential(response: { credential: string }) {
      setError('');
      setLoading(true);
      try {
        const r = await api.post<LoginResponse>('/api/auth/google', { credential: response.credential });
        setToken(r.token);
        onLogin(r.user);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    function setup() {
      const google = (window as any).google;
      if (!google || !googleBtnRef.current) return;
      google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential });
      google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'filled_black',
        size: 'large',
        width: 320,
        text: 'signin_with',
      });
    }

    if ((window as any).google) {
      setup();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = setup;
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, [onLogin]);

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
          'radial-gradient(ellipse 70% 55% at 82% 8%, rgba(34,197,94,.35), transparent 60%), radial-gradient(ellipse 55% 50% at 98% 62%, rgba(45,212,191,.20), transparent 60%), linear-gradient(158deg, #000000 0%, #0a0a0a 46%, #000000 100%)',
      }}
    >
      {/* ondas */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%]">
        <Wave color="#22C55E" opacity={0.5} y={170} className="animate-[pvwave_19s_linear_infinite]" />
        <Wave color="#2DD4BF" opacity={0.38} y={205} className="animate-[pvwave_27s_linear_infinite_reverse]" />
        <Wave color="#4ADE80" opacity={0.28} y={235} className="animate-[pvwave_36s_linear_infinite]" />
      </div>

      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-sm rounded-3xl border border-white/10 bg-black p-9"
        style={{ boxShadow: '0 30px 70px -20px rgba(0,0,0,.8)' }}
      >
        <div className="mb-5 flex items-center justify-center">
          <img src="/logo-acap.png" alt="ACAP" className="h-36 w-auto rounded-lg" />
        </div>
        <h1 className="text-center text-lg font-semibold text-white">Atendimento</h1>
        <p className="mb-7 text-center text-sm text-white/50">Entre para acessar o painel</p>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            {error}
          </div>
        )}

        <label className="mb-2 block text-sm font-medium text-white/70">E-mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mb-4 w-full rounded-xl border-[1.5px] border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
        />
        <label className="mb-2 block text-sm font-medium text-white/70">Senha</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mb-6 w-full rounded-xl border-[1.5px] border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
        />
        <button
          disabled={loading}
          className="w-full rounded-xl py-3.5 font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
          style={{
            background: 'linear-gradient(135deg, #16A34A, #15803D)',
            boxShadow: '0 12px 28px -8px rgba(21,128,61,.55)',
          }}
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>

        {GOOGLE_CLIENT_ID && (
          <>
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-white/30">ou</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            <div ref={googleBtnRef} className="flex justify-center" />
          </>
        )}

        <p className="mt-6 text-center text-xs text-white/30">ACAP · atendimento</p>
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
