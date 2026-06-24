import type { AutonomousPlanSnapshot, StepStatus } from './autonomousRunApi';

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

/** Parse `step: 2 / 6` from plan-step-summary body. */
export function parsePlanStepNumber(
  summary: string
): { step: number; total?: number } | null {
  const m = summary.match(/step:\s*(\d+)(?:\s*\/\s*(\d+))?/i);
  if (!m) return null;
  return {
    step: parseInt(m[1], 10),
    total: m[2] ? parseInt(m[2], 10) : undefined,
  };
}

/** Parse latest `<step-result step="N"` from streamed assistant text. */
export function parseStreamStepResultId(text: string): number | null {
  const re = /<step-result\s+[^>]*step=["']?(\d+)["']?/gi;
  let last: number | null = null;
  for (const m of text.matchAll(re)) {
    last = parseInt(m[1], 10);
  }
  return last;
}

function stepStatusRank(s: StepStatus): number {
  switch (s) {
    case 'failed':
      return 4;
    case 'done':
      return 3;
    case 'in_progress':
      return 2;
    case 'skipped':
      return 1;
    default:
      return 0;
  }
}

/** Merge streaming plan-step-summary / step-result into the plan strip (live UI sync). */
export function applyStreamPlanProgress(
  plan: AutonomousPlanSnapshot | null,
  streamText: string
): AutonomousPlanSnapshot | null {
  if (!plan?.steps.length) return plan;

  let activeStep: number | null = null;
  const summary = extractPlanStepSummary(streamText);
  if (summary) {
    activeStep = parsePlanStepNumber(summary)?.step ?? null;
  }
  if (activeStep == null) {
    activeStep = parseStreamStepResultId(streamText);
  }
  if (activeStep == null) return plan;

  const stepIds = new Set(plan.steps.map((s) => s.id));
  const maxStepId = Math.max(...plan.steps.map((s) => s.id));
  if (!stepIds.has(activeStep) || activeStep > maxStepId) {
    return plan;
  }

  const steps = plan.steps.map((s) => {
    let status: StepStatus = s.status;
    if (s.id < activeStep!) {
      status = s.status === 'failed' ? 'failed' : 'done';
    } else if (s.id === activeStep) {
      status = 'in_progress';
    } else if (s.status !== 'done' && s.status !== 'failed' && s.status !== 'skipped') {
      status = 'pending';
    }
    if (stepStatusRank(status) < stepStatusRank(s.status)) {
      status = s.status;
    }
    return { ...s, status };
  });

  const done = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  return {
    ...plan,
    progress: `${done}/${plan.steps.length}`,
    currentStepId: activeStep,
    steps,
  };
}
