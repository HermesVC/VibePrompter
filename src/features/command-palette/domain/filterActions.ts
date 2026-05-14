import type { QuickAction } from './types';

export function filterActions(actions: QuickAction[], query: string): QuickAction[] {
  const q = query.trim().toLowerCase();
  if (!q) return actions;
  return actions.filter(
    (a) => a.label.toLowerCase().includes(q) || a.hint.toLowerCase().includes(q) || a.id.includes(q)
  );
}
