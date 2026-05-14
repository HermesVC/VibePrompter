/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-2': 'var(--bg-2)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        glass: 'var(--glass)',
        fg: {
          DEFAULT: 'var(--fg)',
          strong: 'var(--fg-strong)',
          mute: 'var(--fg-mute)',
          dim: 'var(--fg-dim)',
        },
        border: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
        divider: 'var(--divider)',
        accent: {
          DEFAULT: 'var(--accent)',
          2: 'var(--accent-2)',
          deep: 'var(--accent-deep)',
          tint: 'var(--accent-tint)',
          'tint-2': 'var(--accent-tint-2)',
        },
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        danger: 'var(--danger)',
        info: 'var(--info)',
        openai: 'var(--openai)',
        anthropic: 'var(--anthropic)',
        gemini: 'var(--gemini)',
        ollama: 'var(--ollama)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        'sm': 'var(--r-sm)',
        'md': 'var(--r-md)',
        'lg': 'var(--r-lg)',
        'xl': 'var(--r-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        glow: 'var(--accent-glow)',
      },
    },
  },
  plugins: [],
};
