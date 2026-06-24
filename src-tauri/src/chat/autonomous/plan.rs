//! Structured plan parsing and mutation for autonomous runs.

use serde::{Deserialize, Serialize};

pub const PLAN_TAG: &str = "autonomous-plan";
pub const STEP_RESULT_TAG: &str = "step-result";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum StepStatus {
    #[default]
    Pending,
    InProgress,
    Done,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanStep {
    pub id: u32,
    pub title: String,
    #[serde(default)]
    pub status: StepStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verify: Option<crate::workspace::VerifySpec>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutonomousPlan {
    pub steps: Vec<PlanStep>,
}

impl AutonomousPlan {
    pub fn next_pending(&self) -> Option<&PlanStep> {
        self.steps
            .iter()
            .find(|s| matches!(s.status, StepStatus::Pending))
    }

    pub fn step_mut(&mut self, id: u32) -> Option<&mut PlanStep> {
        self.steps.iter_mut().find(|s| s.id == id)
    }

    pub fn mark(&mut self, id: u32, status: StepStatus, note: Option<String>) {
        if let Some(step) = self.step_mut(id) {
            step.status = status;
            if note.is_some() {
                step.note = note;
            }
        }
    }

    pub fn all_terminal(&self) -> bool {
        self.steps.iter().all(|s| {
            matches!(
                s.status,
                StepStatus::Done | StepStatus::Failed | StepStatus::Skipped
            )
        })
    }

    pub fn all_done(&self) -> bool {
        !self.steps.is_empty()
            && self
                .steps
                .iter()
                .all(|s| matches!(s.status, StepStatus::Done | StepStatus::Skipped))
    }

    pub fn progress_label(&self) -> String {
        let done = self
            .steps
            .iter()
            .filter(|s| matches!(s.status, StepStatus::Done | StepStatus::Skipped))
            .count();
        format!("{done}/{}", self.steps.len())
    }
}

/// Extract JSON array from `<autonomous-plan>...</autonomous-plan>`.
pub fn parse_autonomous_plan(text: &str) -> Option<AutonomousPlan> {
    let inner = extract_tag(text, PLAN_TAG)?;
    let steps: Vec<PlanStep> = serde_json::from_str(inner.trim()).ok()?;
    if steps.is_empty() {
        return None;
    }
    Some(AutonomousPlan { steps })
}

/// Serialize plan for re-injection into prompts.
pub fn format_plan_for_prompt(plan: &AutonomousPlan) -> String {
    let json = serde_json::to_string_pretty(&plan.steps).unwrap_or_else(|_| "[]".into());
    format!("<{PLAN_TAG}>\n{json}\n</{PLAN_TAG}>")
}

#[derive(Debug, Clone)]
pub struct StepResultTag {
    pub step_id: u32,
    pub status: StepStatus,
    pub summary: String,
}

/// All `<step-result>` blocks in assistant text (last wins per step when applied).
pub fn parse_all_step_results(text: &str) -> Vec<StepResultTag> {
    let lower = text.to_ascii_lowercase();
    let open_tag = format!("<{STEP_RESULT_TAG}");
    let mut out = Vec::new();
    let mut start = 0usize;
    while let Some(rel) = lower[start..].find(&open_tag) {
        let at = start + rel;
        if let Some(r) = parse_step_result(&text[at..]) {
            out.push(r);
        }
        start = at + open_tag.len();
    }
    out
}

/// Parse `<step-result step="N" status="done|failed">...</step-result>`.
pub fn parse_step_result(text: &str) -> Option<StepResultTag> {
    let lower = text.to_ascii_lowercase();
    let open = lower.find(&format!("<{STEP_RESULT_TAG}"))?;
    let after_open = &text[open..];
    let close_rel = after_open.to_ascii_lowercase().find(&format!("</{STEP_RESULT_TAG}>"))?;
    let block = &after_open[..close_rel];
    let header_end = block.find('>')?;
    let header = block[..header_end].trim();
    let body = block[header_end + 1..].trim();

    let step_id = attribute_u32(header, "step")?;
    let status_raw = attribute_str(header, "status")?;
    let status = match status_raw.to_ascii_lowercase().as_str() {
        "done" | "complete" | "completed" => StepStatus::Done,
        "failed" | "fail" | "error" => StepStatus::Failed,
        "skipped" | "skip" => StepStatus::Skipped,
        _ => return None,
    };

    Some(StepResultTag {
        step_id,
        status,
        summary: body.to_string(),
    })
}

fn extract_tag<'a>(text: &'a str, tag: &str) -> Option<&'a str> {
    let lower = text.to_ascii_lowercase();
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = lower.find(&open)? + open.len();
    let end = lower[start..].find(&close)? + start;
    Some(text[start..end].trim())
}

fn attribute_str(header: &str, key: &str) -> Option<String> {
    for part in header.split_whitespace().skip(1) {
        let Some((k, v)) = part.split_once('=') else {
            continue;
        };
        if k.eq_ignore_ascii_case(key) {
            return Some(v.trim_matches('"').trim_matches('\'').to_string());
        }
    }
    None
}

fn attribute_u32(header: &str, key: &str) -> Option<u32> {
    attribute_str(header, key)?.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plan_json() {
        let text = r#"Here is the plan:
<autonomous-plan>
[
  {"id": 1, "title": "Read file", "status": "pending"},
  {"id": 2, "title": "Patch bug", "status": "pending", "verify": {"kind": "file_not_contains", "path": "a.php", "needle": "bug"}}
]
</autonomous-plan>"#;
        let plan = parse_autonomous_plan(text).expect("plan");
        assert_eq!(plan.steps.len(), 2);
        assert_eq!(plan.steps[1].verify.as_ref().unwrap().kind, "file_not_contains");
    }

    #[test]
    fn parses_step_result() {
        let text = r#"<step-result step="2" status="done">
Patched foreach line.
</step-result>"#;
        let r = parse_step_result(text).expect("tag");
        assert_eq!(r.step_id, 2);
        assert_eq!(r.status, StepStatus::Done);
    }

    #[test]
    fn parses_multiple_step_results() {
        let text = r#"<step-result step="1" status="done">ok</step-result>
<step-result step="2" status="done">ok2</step-result>"#;
        let all = parse_all_step_results(text);
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].step_id, 1);
        assert_eq!(all[1].step_id, 2);
    }
}
