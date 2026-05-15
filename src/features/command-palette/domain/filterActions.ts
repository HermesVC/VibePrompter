import type { QuickAction } from './types';

/**
 * Score an action against a query. Higher is better; `null` means no match.
 *
 * Scoring (lightweight, deterministic):
 *  - label starts with the query  → 100
 *  - label contains the query     →  70
 *  - id starts with the query     →  60
 *  - id contains the query        →  40
 *  - hint contains the query      →  30
 *  - subsequence match in label   →  20 (every char of query appears in label in order)
 *
 * Ties are broken by the natural order of the input list (stable sort).
 */
function scoreAction(action: QuickAction, q: string): number | null {
  const label = action.label.toLowerCase();
  const id = action.id.toLowerCase();
  const hint = action.hint.toLowerCase();

  if (label.startsWith(q)) return 100;
  if (label.includes(q)) return 70;
  if (id.startsWith(q)) return 60;
  if (id.includes(q)) return 40;
  if (hint.includes(q)) return 30;
  if (isSubsequence(q, label)) return 20;
  return null;
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++;
  }
  return i === needle.length;
}

export function filterActions(actions: QuickAction[], query: string): QuickAction[] {
  const q = query.trim().toLowerCase();
  if (!q) return actions;
  const scored = actions
    .map((action, index) => ({ action, index, score: scoreAction(action, q) }))
    .filter((entry): entry is { action: QuickAction; index: number; score: number } => entry.score !== null);
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((entry) => entry.action);
}
