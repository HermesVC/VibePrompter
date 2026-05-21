import type { ActiveMode, CatalogMode, ShortcutBinding } from './types';

/**
 * Translate the seeded `action` slugs into the labels we want to show next to
 * the kbd chip. Cheaper than threading display names through the DB while the
 * action vocabulary is this small.
 */
export function humanizeAction(action: string): string {
  switch (action) {
    case 'mode_switch':
      return 'Cycle prompt mode';
    case 'open_palette':
      return 'Open command palette';
    case 'rewrite_selection':
      return 'Rewrite selection';
    case 'fix_grammar':
      return 'Fix grammar';
    case 'summarize':
      return 'Quick summarize';
    default:
      return action;
  }
}

/**
 * Return a comma-separated list of action labels that share `accel` with at
 * least one other binding, or null if the row's accelerator is unique. Used
 * to render the "Conflict" badge in the dashboard.
 */
export function conflictsFor(accel: string, all: ShortcutBinding[]): string | null {
  const peers = all.filter((s) => s.accelerator === accel);
  if (peers.length < 2) return null;
  return peers.map((p) => humanizeAction(p.action)).join(', ');
}

/**
 * Compute the mode that the next "Cycle" press will land on. Mirrors the
 * backend's `TrayState::advance` wrap-around so the label stays truthful.
 */
export function nextMode(active: ActiveMode | null, modes: CatalogMode[]): CatalogMode | null {
  if (modes.length === 0) return null;
  if (!active) return modes[0];
  const idx = modes.findIndex((m) => m.id === active.id);
  if (idx < 0) return modes[0];
  return modes[(idx + 1) % modes.length];
}

/**
 * Format micro-USD (1 USD = 1,000,000 micros) as a short dollar string.
 * Sub-cent values become "<$0.01" so users don't see "$0.00" and assume
 * the calculation is broken. Estimates only — see backend pricing.rs.
 */
export function formatCost(micros: number): string {
  if (micros <= 0) return '$0';
  const usd = micros / 1_000_000;
  if (usd < 0.01) return '<$0.01';
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd)}`;
}
