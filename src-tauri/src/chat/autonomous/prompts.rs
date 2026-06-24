//! Prompt builders for planning, execution, and replanning turns.

use super::plan::{format_plan_for_prompt, AutonomousPlan, PlanStep, PLAN_TAG, STEP_RESULT_TAG};
use crate::workspace::{spec_memory::SPEC_COMPLIANCE_TAG, spec_memory::DEFAULT_SPEC_PATH, VerifyOutcome};

pub const AUTONOMOUS_PROTOCOL: &str = r#"## Autonomous task mode (active)

You are executing a multi-step plan. The orchestrator runs one step per turn.

**Planning format** (first turn only) — output a JSON array inside this exact tag:
<autonomous-plan>
[
  {"id": 1, "title": "Inspect workspace and prepare file paths", "status": "pending"},
  {"id": 2, "title": "Core implementation", "status": "pending"},
  {"id": 3, "title": "Polish and verify", "status": "pending"}
]
</autonomous-plan>

Rules:
- **Always 3–8 steps** (never a single catch-all step).
- Simple single-file tasks (one HTML page, one script): split into implementation steps directly — **no separate spec file required**.
- Multi-file / ambiguous tasks: optional step 1 may create `docs/spec.md` with requirements R1..Rn.
- Use `write_file` for **new** files; `apply_patch` for existing files. Prefer tools over markdown file fences.

Verify kinds (optional per step): `file_contains`, `file_not_contains`, `php_lint`, `cargo_check`, `vitest`.

**After each step** — end your message with:
<step-result step="N" status="done|failed">
One-line summary of what you did.
</step-result>

Also include (for memory):
<plan-step-summary>
step: N / total
done: what finished
next: next step title or "done"
</plan-step-summary>

If a spec file exists, implementation steps may include:
<spec-compliance>
R1: met|partial|n/a — note
</spec-compliance>

If a step fails, set status="failed" and explain briefly. The orchestrator may replan."#;

pub fn planning_user_message(goal: &str) -> String {
    format!(
        "Goal:\n{goal}\n\n\
         Create an execution plan only. Output `<{PLAN_TAG}>` with a JSON array of **3–8 steps** (ids 1..N).\n\
         Each step must be small enough for one tool-loop turn. Add `verify` where a deterministic check helps.\n\
         For a simple single-file deliverable, plan implementation steps directly (do not add a spec-only step).\n\
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
            "\nCanonical spec (if relevant): `{p}`. Before `status=\"done\"`, you may include `<{SPEC_COMPLIANCE_TAG}>` for requirements you satisfied.\n"
        ))
        .unwrap_or_default();
    format!(
        "{plan_block}{spec_block}\n\
         Execute **only step {}**: {}\n\
         Do **not** start the next plan step in this turn — one step per orchestrator turn. \
         Use workspace tools (`write_file` for new files). Wait for `[Tool result: …]` before claiming success. \
         If a tool returns ERROR, set step status=\"failed\". \
         When finished, you **must** output `<{STEP_RESULT_TAG} step=\"{}\" status=\"done|failed\">` \
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
         Output an **updated** `<{PLAN_TAG}>` JSON array with **at least 3 steps**: mark completed steps done, \
         replace or add steps for the remainder. Keep ids stable when possible.",
        id = failed_step.id,
        title = failed_step.title,
    )
}

pub fn planning_retry_user_message(goal: &str) -> String {
    format!(
        "Goal:\n{goal}\n\n\
         Your previous reply did not contain a valid multi-step `<{PLAN_TAG}>` JSON array.\n\
         Reply again with **only** the plan tag and a JSON array of **3–8 steps** (ids 1..N). \
         No prose outside the tag."
    )
}

pub fn completion_user_message(plan: &AutonomousPlan) -> String {
    format!(
        "{}\n\nAll steps are done. Give a brief final report in Russian: what was accomplished.",
        format_plan_for_prompt(plan)
    )
}
