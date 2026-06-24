//! Query-aware retrieval rules for session memory.

pub fn is_plan_continuation_query(query: &str) -> bool {
    let q = query.to_lowercase();
    let compact = q.split_whitespace().collect::<Vec<_>>().join(" ");
    contains_any(
        &compact,
        &[
            "иди по плану",
            "по плану",
            "следующий пункт",
            "следующий шаг",
            "продолжай план",
            "продолжи план",
            "continue plan",
            "continue the plan",
            "next step",
            "next item",
            "follow the plan",
            "plan step",
        ],
    )
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| haystack.contains(needle))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_russian_and_english_plan_continuations() {
        assert!(is_plan_continuation_query("иди по плану"));
        assert!(is_plan_continuation_query("следующий пункт, пожалуйста"));
        assert!(is_plan_continuation_query("continue the plan"));
        assert!(is_plan_continuation_query("what is the next step?"));
    }

    #[test]
    fn does_not_treat_generic_smalltalk_as_plan_query() {
        assert!(!is_plan_continuation_query("привет, как дела?"));
        assert!(!is_plan_continuation_query("explain this validation error"));
    }
}
