// Logo da Calmô (wordmark manuscrito + mão). PNG preto transparente;
// no tema escuro é invertido para branco via CSS (.logo-calmo).
export function LogoMark({ size = 36 }: { size?: number }) {
  return <img src="/logo-calmo.png" alt="Calmô" className="logo-calmo" style={{ height: size, width: 'auto' }} />;
}

export function Logo({ size = 36 }: { size?: number }) {
  return <img src="/logo-calmo.png" alt="Calmô" className="logo-calmo" style={{ height: Math.round(size * 1.05), width: 'auto' }} />;
}
