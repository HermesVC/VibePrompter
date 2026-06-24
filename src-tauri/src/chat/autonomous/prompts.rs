//! Prompt builders for planning, execution, and replanning turns.

use super::plan::{format_plan_for_prompt, AutonomousPlan, PlanStep, PLAN_TAG, STEP_RESULT_TAG};
use crate::workspace::VerifyOutcome;

pub const AUTONOMOUS_PROTOCOL: &str = r#"## Autonomous task mode (active)

You are executing a multi-step plan. The orchestrator runs one step per turn.

**Planning format** (first turn only) — output a JSON array inside this exact tag:
<autonomous-plan>
[
  {"id": 1, "title": "short actionable step", "status": "pending"},
  {"id": 2, "title": "next step", "status": "pending", "verify": {"kind": "file_not_contains", "path": "relative/path", "needle": "bug_text"}}
]
</autonomous-plan>

Verify kinds (optional per step): `file_contains`, `file_not_contains`, `php_lint`, `cargo_check`, `vitest`.
Keep plans to 3–8 concrete steps. Use workspace tools (`read_file`, `apply_patch`, `run_verify`) — not ```file:``` fences for existing files.

**After each step** — end your message with:
<step-result step="N" status="done|failed">
One-line summary of what you did.
</step-result>

Also include (optional, for memory):
<plan-step-summary>
step: N / total
done: what finished
next: next step title or "done"
</plan-step-summary>

If a step fails, set status="failed" and explain briefly. The orchestrator may replan."#;

pub fn planning_user_message(goal: &str) -> String {
    format!(
        "Goal:\n{goal}\n\n\
         Create an execution plan only. Output `<{PLAN_TAG}>` with a JSON array of steps (ids 1..N). \
         Each step must be small enough for one tool-loop turn. \
         Add `verify` on steps where a deterministic check makes sense. \
         Do not execute tools yet — planning turn only."
    )
}

pub fn execution_user_message(plan: &AutonomousPlan, step: &PlanStep) -> String {
    let plan_block = format_plan_for_prompt(plan);
    format!(
        "{plan_block}\n\n\
         Execute **only step {}**: {}\n\
         Use workspace tools as needed. When finished, output `<{STEP_RESULT_TAG} step=\"{}\" status=\"done|failed\">` \
         with a one-line summary.",
        step.id, step.title, step.id
    )
}

pub fn replan_user_message(
    plan: &AutonomousPlan,
    failed_step: &PlanStep,
    verify: Option<&VerifyOutcome>,
) -> String {
    let plan_block = format_plan_for_prompt(plan);
    let verify_note = verify
        .map(|v| format!("\nVerification failed: {}", v.message))
        .unwrap_or_default();
    format!(
        "{plan_block}\n\n\
         Step {} ({}) failed.{verify_note}\n\
         Output an **updated** `<{PLAN_TAG}>` JSON array: mark completed steps done, \
         replace or add steps for the remainder. Keep ids stable when possible.",
        failed_step.id, failed_step.title
    )
}

pub fn completion_user_message(plan: &AutonomousPlan) -> String {
    format!(
        "{}\n\nAll steps are done. Give a brief final report in Russian: what was accomplished.",
        format_plan_for_prompt(plan)
    )
}
