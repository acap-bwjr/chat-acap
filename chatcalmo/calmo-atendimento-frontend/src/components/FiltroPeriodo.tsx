import { useEffect, useRef, useState } from 'react';
import { CalendarBlank } from '@phosphor-icons/react';
import { ATALHOS, PERIODO_CURTO, hojeLocal, rotuloFaixa, type Faixa } from '../lib/periodo';

// Atalhos (Hoje / 7 dias / 30 dias / Tudo) + intervalo escolhido a dedo.
export default function FiltroPeriodo({
  faixa,
  onChange,
}: {
  faixa: Faixa;
  onChange: (f: Faixa) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [de, setDe] = useState(faixa.de ?? hojeLocal());
  const [ate, setAte] = useState(faixa.ate ?? hojeLocal());
  const [erro, setErro] = useState('');
  const box = useRef<HTMLDivElement>(null);

  // fecha ao clicar fora / apertar ESC
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  function aplicar() {
    if (!de || !ate) return setErro('Preencha as duas datas.');
    if (de > ate) return setErro('A data inicial não pode ser depois da final.');
    setErro('');
    onChange({ periodo: 'custom', de, ate });
    setAberto(false);
  }

  const custom = faixa.periodo === 'custom';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex overflow-hidden rounded-lg border border-line text-[11px]">
        {ATALHOS.map((p) => (
          <button
            key={p}
            onClick={() => onChange({ periodo: p })}
            className={`px-3 py-1.5 font-medium transition ${
              faixa.periodo === p ? 'bg-brand text-white' : 'text-faint hover:bg-cardh hover:text-ink'
            }`}
          >
            {PERIODO_CURTO[p]}
          </button>
        ))}
      </div>

      {/* Fora do grupo acima: aquele div tem overflow-hidden e cortaria o painel */}
      <div className="relative" ref={box}>
        <button
          onClick={() => setAberto((v) => !v)}
          title="Escolher um intervalo de datas"
          className={`flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[11px] font-medium transition ${
            custom ? 'bg-brand text-white' : 'text-faint hover:bg-cardh hover:text-ink'
          }`}
        >
          <CalendarBlank size={13} />
          {custom ? rotuloFaixa(faixa) : 'Personalizado'}
        </button>

        {aberto && (
          <div className="absolute right-0 z-50 mt-1 w-64 rounded-xl border border-line bg-card p-3 shadow-xl">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-faint">De</label>
              <input
                type="date"
                value={de}
                max={ate || undefined}
                onChange={(e) => setDe(e.target.value)}
                className="pv-input mb-2 w-full py-1.5 text-xs"
              />
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-faint">Até</label>
              <input
                type="date"
                value={ate}
                min={de || undefined}
                onChange={(e) => setAte(e.target.value)}
                className="pv-input w-full py-1.5 text-xs"
              />
              {erro && <p className="mt-2 text-[11px] text-red-400">{erro}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={aplicar}
                  className="h-[30px] flex-1 rounded-lg bg-brand text-[11px] font-semibold text-white transition hover:brightness-110"
                >
                  Aplicar
                </button>
                <button
                  onClick={() => setAberto(false)}
                  className="h-[30px] rounded-lg border border-line px-3 text-[11px] font-medium text-faint transition hover:text-ink"
                >
                  Cancelar
                </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
