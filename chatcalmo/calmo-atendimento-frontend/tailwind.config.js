/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      colors: {
        // tokens semânticos (seguem as variáveis CSS → tema dark/light)
        app: 'var(--bg-dark)',
        card: 'var(--bg-card)',
        cardh: 'var(--bg-card-hover)',
        line: 'var(--border-color)',
        ink: 'var(--text-white)',
        sub: 'var(--text-gray)',
        faint: 'var(--text-muted)',
        // marca ACAP
        brand: {
          DEFAULT: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        accent: {
          DEFAULT: '#2dd4bf',
        },
        ok: '#10b981',

        // ===== Prospecção (CRM portado do calmo-sistema) — tokens Tailwind v4 → v3 =====
        // Sólidos: tripla RGB p/ suportar modificador de opacidade (ex.: bg-violet/10).
        base: 'rgb(var(--color-base-rgb) / <alpha-value>)',
        raised: 'rgb(var(--color-raised-rgb) / <alpha-value>)',
        surface: 'rgb(var(--color-surface-rgb) / <alpha-value>)',
        panel: 'rgb(var(--color-panel-rgb) / <alpha-value>)',
        bright: 'rgb(var(--color-bright-rgb) / <alpha-value>)',
        emerald: 'rgb(var(--color-emerald-rgb) / <alpha-value>)',
        amber: 'rgb(var(--color-amber-rgb) / <alpha-value>)',
        rose: 'rgb(var(--color-rose-rgb) / <alpha-value>)',
        violet: {
          DEFAULT: 'rgb(var(--color-violet-rgb) / <alpha-value>)',
          light: 'rgb(var(--color-violet-light-rgb) / <alpha-value>)',
          deep: 'rgb(var(--color-violet-deep-rgb) / <alpha-value>)',
          wash: 'var(--color-violet-wash)',
        },
        cyan: {
          DEFAULT: 'rgb(var(--color-cyan-rgb) / <alpha-value>)',
          light: 'rgb(var(--color-cyan-light-rgb) / <alpha-value>)',
        },
        // Alpha embutido: var() direto (usados sobretudo sem modificador).
        dim: 'var(--color-dim)',
        muted: 'var(--color-muted)',
        text: 'var(--color-text)',
        edge: 'var(--color-edge)',
        'edge-subtle': 'var(--color-edge-subtle)',
        sidebar: 'var(--color-sidebar)',
        'card-glass': 'var(--color-card-glass)',
        'card-border': 'var(--color-card-border)',
        'modal-bg': 'var(--color-modal-bg)',
        'modal-border': 'var(--color-modal-border)',
        'active-bg': 'var(--color-active-bg)',
        'active-glow': 'var(--color-active-glow)',
      },
    },
  },
  plugins: [],
};
