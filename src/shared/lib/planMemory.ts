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
  streamText: string,
  options?: { minStepId?: number; ignoreRegressions?: boolean }
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

  if (
    options?.ignoreRegressions &&
    options.minStepId != null &&
    activeStep < options.minStepId
  ) {
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

/** Build a degrade/regenerate anchor that preserves orchestrator plan progress. */
export function formatPlanProgressAnchor(
  goal: string,
  plan: AutonomousPlanSnapshot
): string {
  const goalLine = goal.trim().split('\n')[0]?.trim().slice(0, 500) || goal.trim().slice(0, 500);
  const done = plan.steps.filter(
    (s) => s.status === 'done' || s.status === 'skipped'
  );
  const current =
    plan.steps.find((s) => s.status === 'in_progress') ??
    plan.steps.find((s) => s.status === 'pending');

  const lines: string[] = [`Goal: ${goalLine}`, '', '## Plan progress (orchestrator)'];
  lines.push(`Completed: ${done.length}/${plan.steps.length} steps`);

  if (done.length > 0) {
    lines.push('Done (do NOT redo these steps):');
    for (const s of done.slice(0, 16)) {
      lines.push(`- ${s.id}: ${s.title.slice(0, 120)}`);
    }
  }

  if (current) {
    lines.push('');
    lines.push(
      `Current step: ${current.id} / ${plan.steps.length} — ${current.title.slice(0, 160)}`
    );
    lines.push('Execute ONLY this step. Do not restart completed steps.');
    const next = plan.steps.find(
      (s) => s.id > current.id && (s.status === 'pending' || s.status === 'in_progress')
    );
    if (next) {
      lines.push(`Next after current: ${next.id} — ${next.title.slice(0, 120)}`);
    }
  }

  return lines.join('\n').slice(0, 3_200);
}
