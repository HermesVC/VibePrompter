// Home dashboard - shared data shapes returned by the Tauri backend commands.

export interface ActiveMode {
  id: string;
  name: string;
  iconName?: string | null;
}

export interface ShortcutBinding {
  id: string;
  action: string;
  accelerator: string;
  hasBackend: boolean;
}

export interface CatalogMode {
  id: string;
  name: string;
  iconName: string;
  desc: string;
  sys: string;
  temp: number;
  maxTok: number;
  provider?: string | null;
  enabled: boolean;
  isSystem: boolean;
}

export interface Connection {
  id: string;
  label: string;
  hasKey: boolean;
  isDefault: boolean;
  defaultModel: string;
}

export interface HealthIssue {
  severity: 'warn' | 'error';
  code: string;
  message: string;
}

export interface HealthReport {
  ok: boolean;
  issues: HealthIssue[];
}

export interface HistoryItem {
  id: number;
  mode: string;
  iconName: string;
  provider: string;
  ms: number;
  createdAt: string;
  inputTokens?: number;
  outputTokens?: number;
  costMicros?: number;
}

export interface CostSummary {
  monthMicros: number;
  weekMicros: number;
  totalMicros: number;
  monthRunsPriced: number;
  monthRunsUnpriced: number;
}

export interface CostBreakdown {
  byDay: Array<{ day: string; micros: number; runs: number }>;
  byConnection: Array<{ label: string; micros: number; runs: number }>;
  days: number;
}
