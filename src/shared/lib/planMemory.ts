const OPEN = '<plan-step-summary>';
const CLOSE = '</plan-step-summary>';

/** Extract inner text from a model's plan-step summary block. */
export function extractPlanStepSummary(text: string): string | null {
  const start = text.indexOf(OPEN);
  if (start === -1) return null;
  const innerStart = start + OPEN.length;
  const end = text.indexOf(CLOSE, innerStart);
  if (end === -1) return null;
  const inner = text.slice(innerStart, end).trim();
  return inner || null;
}
