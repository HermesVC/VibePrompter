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

/// Default multi-step plan when the model returns 0–1 steps or JSON is unusable.
pub fn synthesize_plan_from_goal(goal: &str) -> AutonomousPlan {
    let short = goal
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or(goal)
        .chars()
        .take(160)
        .collect::<String>();
    AutonomousPlan {
        steps: vec![
            PlanStep {
                id: 1,
                title: format!("Осмотр workspace (list_dir) и подготовка путей для задачи"),
                status: StepStatus::Pending,
                verify: None,
                note: None,
            },
            PlanStep {
                id: 2,
                title: format!("Основная реализация: {short}"),
                status: StepStatus::Pending,
                verify: None,
                note: None,
            },
            PlanStep {
                id: 3,
                title: "Стили, полировка и мелкие правки".into(),
                status: StepStatus::Pending,
                verify: None,
                note: None,
            },
            PlanStep {
                id: 4,
                title: "Проверка результата (read_file / run_verify)".into(),
                status: StepStatus::Pending,
                verify: None,
                note: None,
            },
        ],
    }
}

/// Merge replan proposal into the canonical plan — never drop completed steps.
pub fn merge_replanned_plan(
    current: &AutonomousPlan,
    proposed: AutonomousPlan,
    failed_step_id: u32,
) -> AutonomousPlan {
    let mut merged: Vec<PlanStep> = current
        .steps
        .iter()
        .filter(|s| {
            s.id < failed_step_id || matches!(s.status, StepStatus::Done | StepStatus::Skipped)
        })
        .cloned()
        .collect();

    let max_kept_id = merged.iter().map(|s| s.id).max().unwrap_or(0);

    let tail: Vec<PlanStep> = proposed
        .steps
        .iter()
        .filter(|s| s.id >= failed_step_id)
        .cloned()
        .collect();

    let tail = if tail.is_empty() {
        let failed_idx = current
            .steps
            .iter()
            .position(|s| s.id == failed_step_id)
            .unwrap_or(0);
        proposed
            .steps
            .iter()
            .enumerate()
            .filter_map(|(i, s)| (i >= failed_idx).then(|| s.clone()))
            .collect()
    } else {
        tail
    };

    if tail.is_empty() {
        for s in current.steps.iter().filter(|s| s.id >= failed_step_id) {
            if merged.iter().any(|m| m.id == s.id) {
                continue;
            }
            let mut copy = s.clone();
            if copy.id == failed_step_id {
                copy.status = StepStatus::Pending;
            }
            merged.push(copy);
        }
    } else {
        let mut next_id = max_kept_id;
        for mut step in tail {
            next_id += 1;
            step.id = next_id;
            step.status = StepStatus::Pending;
            step.note = None;
            merged.push(step);
        }
    }

    merged.sort_by_key(|s| s.id);
    AutonomousPlan { steps: merged }
}

/// Ensure at least 2 concrete steps — never run with a single catch-all step.
pub fn normalize_plan_for_goal(plan: AutonomousPlan, goal: &str) -> AutonomousPlan {
    if plan.steps.len() >= 2 {
        return plan;
    }
    synthesize_plan_from_goal(goal)
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
    if let Ok(raw) = serde_json::from_str::<Vec<RawPlanStep>>(&body) {
        return steps_from_raw(raw);
    }
    parse_steps_regex_fallback(&body)
}

fn steps_from_raw(raw: Vec<RawPlanStep>) -> Option<Vec<PlanStep>> {
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

/// Fallback when strict JSON fails (unescaped quotes, minor model drift).
fn parse_steps_regex_fallback(body: &str) -> Option<Vec<PlanStep>> {
    let mut steps = Vec::new();
    let re = regex::Regex::new(
        r#"\{\s*"id"\s*:\s*(\d+)\s*,\s*"title"\s*:\s*"((?:\\.|[^"\\])*)""#,
    )
    .ok()?;
    for cap in re.captures_iter(body) {
        let id: u32 = cap.get(1)?.as_str().parse().ok()?;
        let title = cap
            .get(2)?
            .as_str()
            .replace("\\\"", "\"")
            .replace("\\n", "\n");
        if title.trim().is_empty() {
            continue;
        }
        steps.push(PlanStep {
            id,
            title,
            status: StepStatus::Pending,
            verify: None,
            note: None,
        });
    }
    if steps.len() >= 2 {
        Some(steps)
    } else {
        None
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
    let s = s
        .replace('\u{201c}', "\"")
        .replace('\u{201d}', "\"")
        .replace('\u{2018}', "'")
        .replace('\u{2019}', "'");
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
            // Unclosed tag (stream cut-off) — still try to parse partial JSON.
            let partial = text[content_start..].trim();
            if partial.starts_with('[') {
                out.push(partial.to_string());
            }
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

    #[test]
    fn synthesize_plan_has_four_steps() {
        let plan = synthesize_plan_from_goal("neon snake index.html");
        assert_eq!(plan.steps.len(), 4);
    }

    #[test]
    fn normalize_replaces_single_step() {
        let one = AutonomousPlan {
            steps: vec![PlanStep {
                id: 1,
                title: "only".into(),
                status: StepStatus::Pending,
                verify: None,
                note: None,
            }],
        };
        let out = normalize_plan_for_goal(one, "build game");
        assert!(out.steps.len() >= 4);
    }

    #[test]
    fn merge_replan_keeps_completed_steps() {
        let current = AutonomousPlan {
            steps: vec![
                PlanStep {
                    id: 1,
                    title: "A".into(),
                    status: StepStatus::Done,
                    verify: None,
                    note: None,
                },
                PlanStep {
                    id: 2,
                    title: "B".into(),
                    status: StepStatus::Done,
                    verify: None,
                    note: None,
                },
                PlanStep {
                    id: 3,
                    title: "C".into(),
                    status: StepStatus::Failed,
                    verify: None,
                    note: None,
                },
                PlanStep {
                    id: 4,
                    title: "D".into(),
                    status: StepStatus::Pending,
                    verify: None,
                    note: None,
                },
            ],
        };
        let proposed = AutonomousPlan {
            steps: vec![
                PlanStep {
                    id: 1,
                    title: "new A".into(),
                    status: StepStatus::Pending,
                    verify: None,
                    note: None,
                },
                PlanStep {
                    id: 2,
                    title: "retry C".into(),
                    status: StepStatus::Pending,
                    verify: None,
                    note: None,
                },
                PlanStep {
                    id: 3,
                    title: "finish".into(),
                    status: StepStatus::Pending,
                    verify: None,
                    note: None,
                },
            ],
        };
        let merged = merge_replanned_plan(&current, proposed, 3);
        assert_eq!(merged.steps.len(), 4);
        assert_eq!(merged.steps[0].title, "A");
        assert_eq!(merged.steps[0].status, StepStatus::Done);
        assert_eq!(merged.steps[1].title, "B");
        assert_eq!(merged.steps[1].status, StepStatus::Done);
        assert_eq!(merged.steps[2].title, "retry C");
        assert_eq!(merged.steps[2].status, StepStatus::Pending);
    }
}
