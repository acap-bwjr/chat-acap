// Níveis da "bateria" — quanto mais chama, mais carrega e muda de cor/título.
const NIVEIS = [
  { cor: "#f43f5e", rgb: "244,63,94", rotulo: "Bora começar!", emoji: "🔋" },
  { cor: "#fb923c", rgb: "251,146,60", rotulo: "Aquecendo", emoji: "⚡" },
  { cor: "#fbbf24", rgb: "251,191,36", rotulo: "Na metade!", emoji: "🔥" },
  { cor: "#3B82F6", rgb: "59,130,246", rotulo: "Reta final!", emoji: "🚀" },
  { cor: "#10b981", rgb: "16,185,129", rotulo: "META BATIDA!", emoji: "🏆" },
];

/** Card da meta diária: bateria que carrega conforme o atendente chama clientes. */
export default function MetaCard({
  nome,
  feitos,
  meta,
  delay,
  lider,
}: {
  nome: string;
  feitos: number;
  meta: number;
  delay?: number;
  lider?: boolean;
}) {
  const pct = meta > 0 ? Math.min(100, Math.round((feitos / meta) * 100)) : 0;
  const batida = feitos >= meta;
  const faltam = Math.max(0, meta - feitos);
  const nivel = batida ? 4 : pct >= 75 ? 3 : pct >= 50 ? 2 : pct >= 25 ? 1 : 0;
  const nv = NIVEIS[nivel];

  return (
    <div
      className={`stagger-in relative overflow-hidden rounded-xl border p-4 ${batida ? "meta-batida" : ""}`}
      style={{
        animationDelay: `${delay || 0}ms`,
        background: "var(--color-surface)",
        borderColor: batida ? `rgba(${nv.rgb},0.5)` : "var(--color-edge-subtle)",
        ["--meta-glow" as string]: `rgba(${nv.rgb},0.45)`,
      }}
    >
      {/* Nome + selo de nível */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-bright">
          {lider && <span title="Liderando hoje">👑</span>}
          <span className="truncate">{nome}</span>
        </span>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide"
          style={{ color: nv.cor, background: `rgba(${nv.rgb},0.14)` }}
        >
          {nv.emoji} {batida ? "META" : `NÍVEL ${nivel + 1}`}
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* ---- Bateria ---- */}
        <div className="flex shrink-0 flex-col items-center">
          <div className="h-[5px] w-5 rounded-t-[3px]" style={{ background: `rgba(${nv.rgb},0.55)` }} />
          <div
            className="relative h-[92px] w-[46px] overflow-hidden rounded-[10px] border-2"
            style={{ borderColor: `rgba(${nv.rgb},0.5)`, background: "var(--color-base)" }}
          >
            <div
              className="meta-fill absolute inset-x-0 bottom-0"
              style={{
                height: `${pct}%`,
                background: `linear-gradient(180deg, rgba(${nv.rgb},0.95), rgba(${nv.rgb},0.6))`,
                boxShadow: `0 0 18px rgba(${nv.rgb},0.6)`,
              }}
            />
            {/* divisórias das células */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(180deg, transparent 0, transparent 16px, rgba(0,0,0,0.30) 16px, rgba(0,0,0,0.30) 18px)",
              }}
            />
            {/* brilho subindo enquanto carrega */}
            {!batida && pct > 0 && (
              <div
                className="meta-shine pointer-events-none absolute inset-x-0 h-8"
                style={{ background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.25), transparent)" }}
              />
            )}
            <span
              className="absolute inset-0 grid place-items-center text-[13px] font-extrabold text-white"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}
            >
              {pct}%
            </span>
          </div>
        </div>

        {/* ---- Números ---- */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1">
            <span
              key={feitos}
              className={`text-[30px] font-extrabold leading-none tabular-nums ${batida ? "meta-pop" : ""}`}
              style={{ color: nv.cor }}
            >
              {feitos}
            </span>
            <span className="text-[14px] font-medium text-dim">/ {meta}</span>
          </div>

          <p className="mt-1.5 text-[11px] font-bold tracking-wide" style={{ color: nv.cor }}>
            {nv.rotulo}
          </p>
          <p className="mt-0.5 text-[10px] text-dim">
            {batida
              ? feitos > meta
                ? `+${feitos - meta} acima da meta 🎉`
                : "cravou na meta 🎉"
              : `faltam ${faltam} cliente${faltam > 1 ? "s" : ""}`}
          </p>

          {/* marcos 25 / 50 / 75 / 100 */}
          <div className="mt-2.5 flex gap-1">
            {[25, 50, 75, 100].map((m) => (
              <span
                key={m}
                className="h-1.5 flex-1 rounded-full transition-all duration-500"
                style={{ background: pct >= m ? nv.cor : "var(--color-edge)" }}
                title={`${m}% da meta`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
