import { I, PanelHead, PhButton } from '@shared/ui';

const LINKS = [
  { l: 'Documentation', i: <I.text size={14} /> },
  { l: 'Keyboard cheat sheet', i: <I.keyboard size={14} /> },
  { l: 'Report an issue', i: <I.info size={14} /> },
];

export function AboutPanel() {
  return (
    <>
      <PanelHead title="About" />
      <div
        className="rounded-lg p-6 flex gap-4 items-center"
        style={{ background: 'var(--surface)', border: '.5px solid var(--border)' }}
      >
        <span className="ph-mark xl" />
        <div className="flex-1">
          <div className="text-[18px] font-semibold text-fg-strong">PromptHelper</div>
          <div className="text-[12.5px] text-fg-mute mt-0.5">
            A blazing-fast AI command palette for your entire operating system.
          </div>
          <div className="flex gap-2.5 mt-2.5 text-[11.5px] text-fg-mute ph-mono">
            <span>v1.2.0</span>
            <span className="text-fg-dim">·</span>
            <span>build 4421</span>
            <span className="text-fg-dim">·</span>
            <span>x86_64-pc-windows-msvc</span>
          </div>
        </div>
        <PhButton variant="primary" icon={<I.download size={13} />}>
          Check for updates
        </PhButton>
      </div>
      <div className="grid grid-cols-3 gap-2.5 mt-4">
        {LINKS.map((x) => (
          <button
            key={x.l}
            type="button"
            className="p-3.5 rounded-lg text-left cursor-pointer flex items-center gap-2.5 text-fg"
            style={{ background: 'var(--surface)', border: '.5px solid var(--border)' }}
          >
            <span className="text-accent">{x.i}</span>
            <span className="flex-1 text-[13px]">{x.l}</span>
            <I.arrowR size={13} style={{ color: 'var(--fg-mute)' }} />
          </button>
        ))}
      </div>
    </>
  );
}
