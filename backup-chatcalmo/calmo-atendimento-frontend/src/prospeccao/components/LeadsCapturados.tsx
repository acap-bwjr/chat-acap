import type { Lead } from "../types";

interface Props {
  leads: Lead[];
}

// Conta leads por plataforma de captura (coluna `plataforma`: 'instagram' | 'tiktok').
// É o marcador que os scrapers (instagram.py / tiktok.py) gravam ao exportar pro CRM.
export default function LeadsCapturados({ leads }: Props) {
  const plataformaDe = (l: Lead) => (l.plataforma ?? "").trim().toLowerCase();
  const instagram = leads.filter((l) => plataformaDe(l) === "instagram").length;
  const tiktok = leads.filter((l) => plataformaDe(l) === "tiktok").length;

  return (
    <section className="bg-base border-t border-edge-subtle px-4 lg:px-8 py-6 lg:py-8">
      <header className="flex items-end justify-between mb-5 pb-3 border-b border-edge-subtle">
        <div>
          <p className="text-[9px] text-dim uppercase tracking-[0.3em] mb-0.5">Prospecção</p>
          <h3 className="text-[15px] font-bold text-bright tracking-tight uppercase">
            Leads capturados
          </h3>
        </div>
        <p className="text-[9px] text-dim uppercase tracking-[0.3em] tabular-nums">
          {(instagram + tiktok).toLocaleString("pt-BR")} no total
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
        <CaptureCard
          plataforma="Instagram"
          total={instagram}
          gradient="linear-gradient(135deg, #833AB4 0%, #E1306C 50%, #F77737 100%)"
          icon={<InstagramIcon />}
        />
        <CaptureCard
          plataforma="TikTok"
          total={tiktok}
          gradient="linear-gradient(135deg, #25F4EE 0%, #000000 50%, #FE2C55 100%)"
          icon={<TikTokIcon />}
        />
      </div>
    </section>
  );
}

function CaptureCard({
  plataforma,
  total,
  gradient,
  icon,
}: {
  plataforma: string;
  total: number;
  gradient: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="relative overflow-hidden bg-surface/40 border border-edge-subtle rounded-xl px-5 py-5 lg:px-6 lg:py-6 flex items-center gap-5 hover:bg-surface/70 transition-colors">
      {/* Faixa de marca à esquerda */}
      <span
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: gradient }}
        aria-hidden
      />
      <div
        className="shrink-0 w-12 h-12 lg:w-14 lg:h-14 rounded-xl flex items-center justify-center text-white"
        style={{ background: gradient }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-dim uppercase tracking-[0.25em] font-medium">
          Leads capturados
        </p>
        <p className="text-[15px] lg:text-[16px] font-bold text-bright leading-tight">
          {plataforma}
        </p>
      </div>
      <p className="font-display text-[34px] lg:text-[42px] font-extrabold text-bright tabular-nums leading-none shrink-0">
        {total.toLocaleString("pt-BR")}
      </p>
    </article>
  );
}

function InstagramIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.6 5.82s.51.5 0 0A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.34-1.48z" />
    </svg>
  );
}
