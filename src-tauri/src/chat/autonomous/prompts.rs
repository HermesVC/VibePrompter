//! Prompt builders for planning, execution, and replanning turns.

use super::plan::{format_plan_for_prompt, AutonomousPlan, PlanStep, PLAN_TAG, STEP_RESULT_TAG};
use crate::workspace::{spec_memory::SPEC_COMPLIANCE_TAG, spec_memory::DEFAULT_SPEC_PATH, VerifyOutcome};

pub const AUTONOMOUS_PROTOCOL: &str = r#"## Autonomous task mode (active)

You are executing a multi-step plan. The orchestrator runs one step per turn.

**Planning format** (first turn only) — output a JSON array inside this exact tag:
<autonomous-plan>
[
  {"id": 1, "title": "Write technical spec at docs/spec.md (scope, requirements R1..Rn, acceptance criteria)", "status": "pending"},
  {"id": 2, "title": "Implement feature per spec", "status": "pending", "verify": {"kind": "cargo_check"}}
]
</autonomous-plan>

Step 1 must produce or update the canonical spec file (default `docs/spec.md`) with numbered requirements `R1`, `R2`, … and acceptance criteria.
Implementation steps (id ≥ 2) must align with that spec.

Verify kinds (optional per step): `file_contains`, `file_not_contains`, `php_lint`, `cargo_check`, `vitest`.
Keep plans to 3–8 concrete outcome-oriented steps (not micro-edits). Tools: `list_dir`, `read_file`, `write_file` (new files), `apply_patch` (existing), `run_verify`.

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

**Spec compliance** (required on implementation steps after the spec exists):
Before marking a step `done`, `read_file` the spec path and end with:
<spec-compliance>
R1: met|partial|n/a — brief note
R2: met|partial|n/a — brief note
</spec-compliance>

If a step fails, set status="failed" and explain briefly. The orchestrator may replan."#;

pub fn planning_user_message(goal: &str) -> String {
    format!(
        "Goal:\n{goal}\n\n\
         Create an execution plan only. Output `<{PLAN_TAG}>` with a JSON array of steps (ids 1..N).\n\
         **Step 1 must be:** write or update `{DEFAULT_SPEC_PATH}` with numbered requirements (R1..Rn), scope, and acceptance criteria.\n\
         Steps 2..N implement the spec in small outcome-oriented chunks.\n\
         Each step must fit one tool-loop turn. Add `verify` where a deterministic check helps.\n\
         Do not execute tools yet — planning turn only."
    )
}

pub fn execution_user_message(
    plan: &AutonomousPlan,
    step: &PlanStep,
    spec_path: Option<&str>,
) -> String {
    let plan_block = format_plan_for_prompt(plan);
    let spec_block = spec_path
        .map(|p| format!(
            "\nCanonical spec: `{p}`. Before `status=\"done\"`, read this file and include `<{SPEC_COMPLIANCE_TAG}>` mapping relevant R* requirements.\n"
        ))
        .unwrap_or_default();
    format!(
        "{plan_block}{spec_block}\n\
         Execute **only step {}**: {}\n\
         Do **not** start the next plan step in this turn — one step per orchestrator turn. \
         Use workspace tools as needed. Wait for `[Tool result: …]` before claiming success. \
         If a tool returns ERROR, set step status=\"failed\". \
         When finished, output `<{STEP_RESULT_TAG} step=\"{}\" status=\"done|failed\">` \
         (step id must be {}) and `<plan-step-summary>` with `step: {} / {}`.",
        step.id,
        step.title,
        step.id,
        step.id,
        step.id,
        plan.steps.len()
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
         Step {id} ({title}) failed.{verify_note}\n\
         Output an **updated** `<{PLAN_TAG}>` JSON array: mark completed steps done, \
         replace or add steps for the remainder. Keep ids stable when possible. \
         Preserve `{DEFAULT_SPEC_PATH}` unless requirements changed.",
        id = failed_step.id,
        title = failed_step.title,
    )
}

pub fn planning_retry_user_message(goal: &str) -> String {
    format!(
        "Goal:\n{goal}\n\n\
         Your previous reply did not contain a valid `<{PLAN_TAG}>` JSON array.\n\
         Reply again with **only** the plan tag and a JSON array of steps (ids 1..N). \
         Step 1 must create `{DEFAULT_SPEC_PATH}`. No prose outside the tag."
    )
}

pub fn completion_user_message(plan: &AutonomousPlan) -> String {
    format!(
        "{}\n\nAll steps are done. Give a brief final report in Russian: what was accomplished.",
        format_plan_for_prompt(plan)
    )
}
