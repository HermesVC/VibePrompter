import type { ReactNode } from 'react';

export interface QuickAction {
  id: string;
  label: string;
  hint: string;
  iconName: string;
  kbd: string[];
}

export type PaletteState = 'idle' | 'typing' | 'loading' | 'result';

export interface PaletteContext {
  mode: string;
  modeIcon: ReactNode;
  providerName: string;
  providerColor: string;
  modelName: string;
  avgLatency: string;
}
