import { Link } from 'react-router-dom';
import { I, type IconName } from '@shared/ui';

interface ScreenLink {
  to: string;
  label: string;
  hint: string;
  iconName: IconName;
}

const SCREENS: ScreenLink[] = [
  { to: '/palette', label: 'Command Palette', hint: 'The hero surface — Ctrl+Shift+Space anywhere', iconName: 'wand' },
  { to: '/setup', label: 'Onboarding', hint: 'First-time setup — provider · key · preferences', iconName: 'bolt' },
  { to: '/settings', label: 'Settings', hint: 'Eight panels: general, shortcuts, modes, providers, history…', iconName: 'cog' },
  { to: '/tray', label: 'Tray Menu', hint: 'System tray quick toggles and actions', iconName: 'list' },
  { to: '/overlay', label: 'Overlay Mini', hint: 'Inline edit — accept · retry · reject', iconName: 'pen' },
  { to: '/toasts', label: 'Toasts', hint: 'Progress · success · error notifications', iconName: 'bell' },
];

export function HomePage() {
  return (
    <div
      className="ph-root min-h-screen"
      style={{
        background:
          'radial-gradient(60% 45% at 50% 30%, rgba(167,139,250,0.06), transparent 70%), radial-gradient(40% 40% at 80% 80%, rgba(107,138,253,0.05), transparent 70%), var(--bg)',
      }}
    >
      <div className="max-w-[840px] mx-auto px-8 py-16 flex flex-col gap-10">
        <header className="flex items-center gap-4">
          <span className="ph-mark xl" />
          <div>
            <h1
              className="m-0 text-[32px] font-semibold text-fg-strong"
              style={{ letterSpacing: '-0.025em' }}
            >
              PromptHelper
            </h1>
            <p className="m-0 text-fg-mute text-[14px] mt-1">
              An AI command palette for your operating system. Pick a screen.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3">
          {SCREENS.map((s) => {
            const Icon = I[s.iconName];
            return (
              <Link
                key={s.to}
                to={s.to}
                className="rounded-xl p-4 flex items-start gap-3 no-underline transition-[background,border-color,box-shadow] duration-150 hover:shadow-glow"
                style={{
                  background: 'var(--surface)',
                  border: '.5px solid var(--border)',
                  color: 'var(--fg)',
                }}
              >
                <span
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'var(--accent-tint)',
                    color: 'var(--accent)',
                    border: '.5px solid var(--accent-tint-2)',
                  }}
                >
                  <Icon size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-semibold text-fg-strong">{s.label}</div>
                  <div className="text-[12.5px] text-fg-mute mt-0.5">{s.hint}</div>
                </div>
                <I.arrowR size={16} style={{ color: 'var(--fg-mute)', marginTop: 12 }} />
              </Link>
            );
          })}
        </div>

        <footer
          className="text-[11.5px] text-fg-dim ph-mono pt-4"
          style={{ borderTop: '.5px solid var(--divider)' }}
        >
          v1.2.0 · build 4421 · Frontend Clean Architecture
        </footer>
      </div>
    </div>
  );
}
