/** Rolling dialogue summary — `<vp-summary>` block from assistant replies. */

export const SESSION_SUMMARY_MAX_FRACTION = 0.3;

export const SESSION_MEMORY_HINT =
  'При переполнении контекста старые реплики сжимаются в память диалога через LLM. При ~85% лимита вся выжимка сжимается до ~30% объёма (коэф. 70%).';

export function extractVpSummary(text: string): { body: string; summary: string | null } {
  const open = '<vp-summary>';
  const close = '</vp-summary>';
  const start = text.indexOf(open);
  if (start < 0) return { body: text.trim(), summary: null };
  const innerStart = start + open.length;
  const end = text.indexOf(close, innerStart);
  if (end < 0) return { body: text.trim(), summary: null };
  const summary = text.slice(innerStart, end).trim();
  const before = text.slice(0, start).trimEnd();
  const after = text.slice(end + close.length).trim();
  const body = [before, after].filter(Boolean).join('\n').trim();
  return { body, summary: summary || null };
}

export function trimSummaryToBudget(summary: string, contextLimitTokens: number): string {
  const limit = contextLimitTokens > 0 ? contextLimitTokens : 8192;
  const maxChars = Math.max(256, Math.floor(limit * SESSION_SUMMARY_MAX_FRACTION * 4));
  const t = summary.trim();
  if (t.length <= maxChars) return t;
  return `…${t.slice(t.length - (maxChars - 1))}`;
}

export function stripVpSummaryForDisplay(text: string): string {
  return extractVpSummary(text).body;
}
