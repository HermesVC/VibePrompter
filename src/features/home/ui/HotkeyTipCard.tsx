import { I } from '@shared/ui';

/**
 * First-run "try the hotkey" tip. Shows once per install — dismissal is
 * persisted in the settings KV (`hotkey_tip_dismissed`). The card walks
 * the user through the actual core flow that's invisible from the UI:
 * select text anywhere → press the global hotkey → see the result in the
 * floating overlay. Without this, new users land on the dashboard and
 * don't realize the product's main feature isn't on this screen at all.
 */
export function HotkeyTipCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section
      className="rounded-xl p-5 flex flex-col gap-3"
      style={{
        background:
          'linear-gradient(135deg, var(--accent-tint) 0%, var(--surface) 70%)',
        border: '.5px solid var(--accent-tint-2)',
        boxShadow: 'var(--accent-glow)',
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: 'var(--accent-tint-2)',
            color: 'var(--accent)',
          }}
        >
          <I.bolt size={20} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="m-0 text-[15px] font-semibold text-fg-strong">
            Try it now — VibePrompter works from any app
          </h2>
          <p className="m-0 text-[12.5px] text-fg-mute mt-1.5 leading-relaxed">
            Select some text in any window (browser, email, IDE — anything),
            then press a hotkey. A floating overlay near your cursor shows the
            result. Hit <kbd className="ph-mono">Enter</kbd> to paste it back,{' '}
            <kbd className="ph-mono">Esc</kbd> to dismiss.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss tip"
          className="text-[11.5px] px-2 py-1 rounded transition-colors flex-shrink-0"
          style={{
            background: 'transparent',
            border: '.5px solid var(--border)',
            color: 'var(--fg-mute)',
            cursor: 'pointer',
          }}
          title="Don't show this again"
        >
          Got it
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
        <TipHotkey
          accel="Ctrl+Alt+F"
          label="Rewrite"
          hint="Polishes the selection using your active mode."
        />
        <TipHotkey
          accel="Ctrl+Alt+G"
          label="Fix grammar"
          hint="Corrects typos and grammar without changing style."
        />
        <TipHotkey
          accel="Ctrl+Alt+S"
          label="Summarize"
          hint="Bulleted summary of long text. Copies to clipboard."
        />
      </div>
      <div
        className="text-[11.5px] text-fg-mute mt-1 flex items-center gap-2"
        style={{
          paddingTop: 10,
          borderTop: '.5px solid var(--accent-tint-2)',
        }}
      >
        <I.info size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span>
          VibePrompter lives in your <strong className="text-fg-strong">system tray</strong>.
          Closing this window keeps it running. On Windows: right-click the tray icon
          (often hidden under the <kbd className="ph-mono text-[10px]">^</kbd> chevron) →
          <strong className="text-fg-strong"> Taskbar settings</strong> → show the
          VibePrompter icon for one-click access.
        </span>
      </div>
    </section>
  );
}

function TipHotkey({
  accel,
  label,
  hint,
}: {
  accel: string;
  label: string;
  hint: string;
}) {
  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-1"
      style={{
        background: 'var(--surface)',
        border: '.5px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-2">
        <kbd
          className="ph-mono text-[11px] px-2 py-0.5 rounded"
          style={{
            background: 'var(--surface-2)',
            color: 'var(--fg-strong)',
            border: '.5px solid var(--border-strong)',
          }}
        >
          {accel}
        </kbd>
        <span className="text-[12.5px] font-semibold text-fg-strong">{label}</span>
      </div>
      <span className="text-[11px] text-fg-dim leading-snug">{hint}</span>
    </div>
  );
}
