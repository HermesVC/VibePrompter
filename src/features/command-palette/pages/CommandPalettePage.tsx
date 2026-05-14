import { useState } from 'react';
import type { PaletteState } from '../domain';
import { CommandPalette } from '../ui/CommandPalette';
import { PaletteStateSwitcher } from '../ui/PaletteStateSwitcher';

export function CommandPalettePage() {
  const [state, setState] = useState<PaletteState>('idle');
  return (
    <div
      className="ph-root min-h-screen flex flex-col items-center justify-center p-6 gap-6"
      style={{
        background:
          'radial-gradient(60% 50% at 50% 30%, rgba(167,139,250,0.06), transparent), var(--bg)',
      }}
    >
      <PaletteStateSwitcher state={state} onChange={setState} />
      <CommandPalette key={state} initialState={state} />
    </div>
  );
}
