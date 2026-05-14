import type { PaletteState } from '../domain';

interface Props {
  state: PaletteState;
  onChange: (s: PaletteState) => void;
}

const STATES: { id: PaletteState; label: string }[] = [
  { id: 'idle', label: 'Idle' },
  { id: 'typing', label: 'Typing' },
  { id: 'loading', label: 'Streaming' },
  { id: 'result', label: 'Result' },
];

export function PaletteStateSwitcher({ state, onChange }: Props) {
  return (
    <div className="inline-flex p-0.5 bg-surface-2 rounded-md border-[0.5px] border-border">
      {STATES.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onChange(s.id)}
          className="px-3 py-1 border-0 cursor-pointer rounded text-[11.5px] font-medium"
          style={{
            background: state === s.id ? 'var(--surface)' : 'transparent',
            color: state === s.id ? 'var(--fg)' : 'var(--fg-mute)',
            boxShadow: state === s.id ? 'var(--shadow-sm)' : 'none',
          }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
