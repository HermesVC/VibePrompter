//! Plan step summaries — extract brief progress notes for vector memory.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlanCanonical {
    pub step: String,
    pub last_done: String,
    pub next: String,
    pub source: String,
}

/// Extract inner text from `<plan-step-summary>...</plan-step-summary>`.
pub fn extract_plan_step_summary(text: &str) -> Option<String> {
    extract_tag(text, "plan-step-summary")
}

pub fn canonical_from_step_summary(inner: &str) -> Option<PlanCanonical> {
    let step = value_for_key(inner, "step")?;
    let last_done = value_for_key(inner, "done").unwrap_or_else(|| "unknown".into());
    let next = value_for_key(inner, "next").unwrap_or_else(|| "unknown".into());
    Some(PlanCanonical {
        step,
        last_done,
        next,
        source: "plan-step-summary".into(),
    })
}

pub fn canonical_from_plan_markdown(content: &str) -> Option<PlanCanonical> {
    let step = value_for_key(content, "Current step")
        .or_else(|| derive_step_from_checklist(content))
        .unwrap_or_else(|| "unknown".into());
    let last_done = value_for_key(content, "Last completed").unwrap_or_else(|| "none".into());
    let next = first_unchecked_step(content).unwrap_or_else(|| "done".into());

    if step == "unknown" && last_done == "none" && next == "done" {
        return None;
    }

    Some(PlanCanonical {
        step,
        last_done,
        next,
        source: "PLAN.md".into(),
    })
}

pub fn format_plan_canonical(canonical: &PlanCanonical, version: u32, updated_at: &str) -> String {
    let version = version.max(1);
    format!(
        "PLAN_CANONICAL v{version}\nstep: {}\nlast_done: {}\nnext: {}\nsource: {}\nupdated_at: {}",
        one_line(&canonical.step),
        one_line(&canonical.last_done),
        one_line(&canonical.next),
        one_line(&canonical.source),
        one_line(updated_at)
    )
}

pub fn plan_canonical_version(content: &str) -> Option<u32> {
    let first = content.lines().next()?.trim();
    let rest = first.strip_prefix("PLAN_CANONICAL v")?;
    rest.split_whitespace().next()?.parse().ok()
}

pub fn is_plan_markdown_path(path: &str) -> bool {
    let norm = path.replace('\\', "/").to_ascii_lowercase();
    norm.rsplit('/').next().unwrap_or(norm.as_str()) == "plan.md"
}

/// Normalize for embedding / retrieval (stable prefix for classifiers).
pub fn format_plan_step_for_memory(inner: &str) -> String {
    let body = inner
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    if body.is_empty() {
        return String::new();
    }
    format!("PLAN_PROGRESS:\n{body}")
}

fn extract_tag(text: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = text.find(&open)? + open.len();
    let end = text[start..].find(&close)? + start;
    let inner = text[start..end].trim();
    if inner.is_empty() {
        None
    } else {
        Some(inner.to_string())
    }
}

fn value_for_key(text: &str, key: &str) -> Option<String> {
    let key = key.to_ascii_lowercase();
    for line in text.lines() {
        let trimmed = line
            .trim()
            .trim_start_matches(|c: char| matches!(c, '-' | '*' | '`'))
            .trim();
        if let Some((candidate, value)) = trimmed.split_once(':') {
            if candidate.trim().eq_ignore_ascii_case(&key) {
                let value = value.trim().trim_matches('`').trim();
                if !value.is_empty() {
                    return Some(value.to_string());
                }
            }
        }
    }
    None
}

fn derive_step_from_checklist(content: &str) -> Option<String> {
    let mut total = 0usize;
    let mut done = 0usize;
    for line in content.lines() {
        let t = line.trim_start();
        if t.starts_with("- [ ]") || t.starts_with("- [x]") || t.starts_with("- [X]") {
            total += 1;
            if t.starts_with("- [x]") || t.starts_with("- [X]") {
                done += 1;
            }
        }
    }
    if total == 0 {
        None
    } else {
        Some(format!("{done} / {total}"))
    }
}

fn first_unchecked_step(content: &str) -> Option<String> {
    for line in content.lines() {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix("- [ ]") {
            let clean = rest.trim();
            if !clean.is_empty() {
                return Some(clean.to_string());
            }
        }
    }
    None
}

fn one_line(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_plan_step_tag() {
        let text = "code...\n\n<plan-step-summary>\nstep: 1 / 3\ndone: added service\nwhy: step 1\nnext: step 2\n</plan-step-summary>";
        let inner = extract_plan_step_summary(text).expect("tag");
        assert!(inner.contains("step: 1 / 3"));
        let mem = format_plan_step_for_memory(&inner);
        assert!(mem.starts_with("PLAN_PROGRESS:"));
    }

    #[test]
    fn rejects_missing_empty_or_unclosed_plan_step_tags() {
        assert_eq!(extract_plan_step_summary("no tag"), None);
        assert_eq!(
            extract_plan_step_summary("<plan-step-summary>   </plan-step-summary>"),
            None
        );
        assert_eq!(
            extract_plan_step_summary("<plan-step-summary>step: 1"),
            None
        );
    }

    #[test]
    fn extracts_first_complete_block_and_ignores_later_blocks() {
        let text = "<plan-step-summary>step: 1\nnext: 2</plan-step-summary>\nnoise\n<plan-step-summary>step: 2</plan-step-summary>";
        let inner = extract_plan_step_summary(text).expect("tag");

        assert!(inner.contains("step: 1"));
        assert!(!inner.contains("step: 2"));
    }

    #[test]
    fn format_plan_step_for_memory_trims_lines_and_drops_blank_lines() {
        let mem = format_plan_step_for_memory("\n  step: 4 / 9\n\n done: x  \n\t next: y\n");

        assert_eq!(mem, "PLAN_PROGRESS:\nstep: 4 / 9\ndone: x\nnext: y");
    }

    #[test]
    fn builds_canonical_from_step_summary() {
        let c = canonical_from_step_summary(
            "step: 2 / 5\ndone: service layer\nwhy: durable state\nnext: validation",
        )
        .expect("canonical");

        assert_eq!(c.step, "2 / 5");
        assert_eq!(c.last_done, "service layer");
        assert_eq!(c.next, "validation");
        assert_eq!(c.source, "plan-step-summary");
    }

    #[test]
    fn builds_canonical_from_plan_status_and_first_unchecked_step() {
        let c = canonical_from_plan_markdown(
            "# Plan\n\n## Steps\n- [x] 1. service\n- [ ] 2. validation\n\n## Status\nCurrent step: 2 / 2\nLast completed: service",
        )
        .expect("canonical");

        assert_eq!(c.step, "2 / 2");
        assert_eq!(c.last_done, "service");
        assert_eq!(c.next, "2. validation");
        assert_eq!(c.source, "PLAN.md");
    }

    #[test]
    fn canonical_format_is_machine_readable_and_versioned() {
        let c = PlanCanonical {
            step: "3 / 7".into(),
            last_done: "  wrote   parser ".into(),
            next: "tests".into(),
            source: "PLAN.md".into(),
        };
        let out = format_plan_canonical(&c, 4, "turn");

        assert!(out.starts_with("PLAN_CANONICAL v4\n"));
        assert_eq!(plan_canonical_version(&out), Some(4));
        assert!(out.contains("last_done: wrote parser"));
    }

    #[test]
    fn detects_only_plan_md_as_canonical_source() {
        assert!(is_plan_markdown_path("PLAN.md"));
        assert!(is_plan_markdown_path("docs\\PLAN.md"));
        assert!(!is_plan_markdown_path("docs/planning-notes.md"));
    }
}
