//! Plan step summaries — extract brief progress notes for vector memory.

/// Extract inner text from `<plan-step-summary>...</plan-step-summary>`.
pub fn extract_plan_step_summary(text: &str) -> Option<String> {
    extract_tag(text, "plan-step-summary")
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
}
