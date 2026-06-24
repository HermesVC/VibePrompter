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

/// Extract the best (most steps) plan from all `<autonomous-plan>` blocks in text.
pub fn parse_autonomous_plan(text: &str) -> Option<AutonomousPlan> {
    parse_best_autonomous_plan(text)
}

/// Like [`parse_autonomous_plan`] but considers several assistant turns (planning retries).
pub fn best_autonomous_plan_from_texts(texts: &[&str]) -> Option<AutonomousPlan> {
    texts
        .iter()
        .filter_map(|t| parse_best_autonomous_plan(t))
        .max_by_key(|p| p.steps.len())
}

fn parse_best_autonomous_plan(text: &str) -> Option<AutonomousPlan> {
    let inners = extract_all_tag_inners(text, PLAN_TAG);
    if inners.is_empty() {
        return None;
    }
    inners
        .iter()
        .filter_map(|inner| {
            parse_steps_json(inner).map(|steps| AutonomousPlan { steps })
        })
        .max_by_key(|p| p.steps.len())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawPlanStep {
    id: u32,
    title: String,
    #[serde(default)]
    status: StepStatus,
    #[serde(default)]
    verify: Option<serde_json::Value>,
    #[serde(default)]
    note: Option<String>,
}

fn parse_steps_json(inner: &str) -> Option<Vec<PlanStep>> {
    let body = normalize_plan_json_body(inner);
    let raw: Vec<RawPlanStep> = serde_json::from_str(&body).ok()?;
    let steps: Vec<PlanStep> = raw
        .into_iter()
        .map(|r| PlanStep {
            id: r.id,
            title: r.title,
            status: r.status,
            verify: r
                .verify
                .and_then(|v| serde_json::from_value::<crate::workspace::VerifySpec>(v).ok()),
            note: r.note,
        })
        .collect();
    if steps.is_empty() {
        None
    } else {
        Some(steps)
    }
}

fn normalize_plan_json_body(inner: &str) -> String {
    let mut s = inner.trim().to_string();
    if s.starts_with("```") {
        let lines: Vec<&str> = s.lines().collect();
        if lines.len() >= 2 {
            let start = 1;
            let end = lines.len().saturating_sub(1);
            if lines.last().is_some_and(|l| l.trim() == "```") {
                s = lines[start..end].join("\n");
            }
        }
    }
    fix_trailing_commas(s.trim())
}

fn fix_trailing_commas(json: &str) -> String {
    json.replace(",]", "]").replace(",}", "}")
}

fn extract_all_tag_inners(text: &str, tag: &str) -> Vec<String> {
    let lower = text.to_ascii_lowercase();
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let mut out = Vec::new();
    let mut search_from = 0usize;
    while let Some(rel) = lower[search_from..].find(&open) {
        let content_start = search_from + rel + open.len();
        let Some(close_rel) = lower[content_start..].find(&close) else {
            break;
        };
        let content_end = content_start + close_rel;
        out.push(text[content_start..content_end].trim().to_string());
        search_from = content_end + close.len();
    }
    out
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
    let close_rel = after_open
        .to_ascii_lowercase()
        .find(&format!("</{STEP_RESULT_TAG}>"))?;
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
    fn picks_largest_plan_when_multiple_blocks() {
        let text = r#"<autonomous-plan>[{"id":1,"title":"draft","status":"pending"}]</autonomous-plan>
<autonomous-plan>
[
  {"id": 1, "title": "Design", "status": "pending"},
  {"id": 2, "title": "HTML", "status": "pending"},
  {"id": 3, "title": "CSS", "status": "pending"},
  {"id": 4, "title": "JS", "status": "pending"},
  {"id": 5, "title": "Polish", "status": "pending"},
  {"id": 6, "title": "Verify", "status": "pending"}
]
</autonomous-plan>"#;
        let plan = parse_autonomous_plan(text).expect("plan");
        assert_eq!(plan.steps.len(), 6);
    }

    #[test]
    fn parses_plan_with_trailing_commas_and_fences() {
        let text = r#"<autonomous-plan>
```json
[
  {"id": 1, "title": "A", "status": "pending"},
  {"id": 2, "title": "B", "status": "pending"},
]
```
</autonomous-plan>"#;
        let plan = parse_autonomous_plan(text).expect("plan");
        assert_eq!(plan.steps.len(), 2);
    }

    #[test]
    fn skips_invalid_verify_but_keeps_steps() {
        let text = r#"<autonomous-plan>[
  {"id": 1, "title": "A", "status": "pending", "verify": {"kind": "nope"}},
  {"id": 2, "title": "B", "status": "pending", "verify": {"kind": "file_contains", "path": "a.txt", "needle": "x"}}
]</autonomous-plan>"#;
        let plan = parse_autonomous_plan(text).expect("plan");
        assert_eq!(plan.steps.len(), 2);
        assert!(plan.steps[0].verify.is_none());
        assert!(plan.steps[1].verify.is_some());
    }

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
        assert_eq!(
            plan.steps[1].verify.as_ref().unwrap().kind,
            "file_not_contains"
        );
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
