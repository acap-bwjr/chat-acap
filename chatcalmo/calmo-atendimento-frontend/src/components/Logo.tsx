// Logo da ACAP (brasão colorido, fundo próprio).
export function LogoMark({ size = 36 }: { size?: number }) {
  return <img src="/logo-acap.png" alt="ACAP" className="logo-acap" style={{ height: size, width: 'auto' }} />;
}

export function Logo({ size = 36 }: { size?: number }) {
  return <img src="/logo-acap.png" alt="ACAP" className="logo-acap" style={{ height: Math.round(size * 1.05), width: 'auto' }} />;
}
