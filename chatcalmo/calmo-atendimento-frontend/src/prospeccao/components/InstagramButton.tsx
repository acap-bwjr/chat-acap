// Botão que abre o perfil do lead no Instagram (nova aba).
// `compact` = só o ícone; senão mostra ícone + "Instagram".
export default function InstagramButton({
  username,
  compact,
}: {
  username?: string | null;
  compact?: boolean;
}) {
  const user = (username || '').replace(/^@/, '').trim();
  if (!user) return <span className="text-dim">—</span>;

  return (
    <a
      href={`https://instagram.com/${user}`}
      target="_blank"
      rel="noreferrer"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      title={`Abrir @${user} no Instagram`}
      className={`inline-flex items-center gap-1.5 rounded-lg font-semibold text-white transition hover:brightness-110 ${
        compact ? 'px-1.5 py-1' : 'px-2.5 py-1.5 text-xs'
      }`}
      style={{ background: 'linear-gradient(135deg, #833AB4 0%, #E1306C 50%, #F77737 100%)' }}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
      {!compact && 'Instagram'}
    </a>
  );
}
