//! Rolling dialogue memory injected into the chat system prompt.

const SUMMARY_FRACTION: f64 = 0.3;

/// Inject compressed long-term memory (no per-reply tags — compression runs in sliding_window).
pub fn append_memory_to_system(
    system: &mut String,
    session_memory: Option<&str>,
    context_limit_tokens: i64,
) {
    let Some(memory) = session_memory.filter(|s| !s.trim().is_empty()) else {
        return;
    };
    if !system.is_empty() {
        system.push_str("\n\n");
    }
    system.push_str(
        "Long-term conversation memory (compressed summary of earlier turns in this chat):\n",
    );
    system.push_str(&trim_summary_to_budget(memory, context_limit_tokens));
}
pub fn trim_summary_to_budget(summary: &str, context_limit_tokens: i64) -> String {
    let limit = if context_limit_tokens > 0 {
        context_limit_tokens
    } else {
        8192
    };
    let max_chars = ((limit as f64) * SUMMARY_FRACTION * 4.0) as usize;
    trim_chars(summary, max_chars.max(256))
}

fn trim_chars(s: &str, max: usize) -> String {
    let t = s.trim();
    if t.len() <= max {
        return t.to_string();
    }
    let keep = max.saturating_sub(1);
    format!("…{}", &t[t.len().saturating_sub(keep)..])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_long_summary() {
        let long = "a".repeat(5000);
        let out = trim_summary_to_budget(&long, 8192);
        assert!(out.len() <= 8192 * 3 / 10 * 4 + 2);
        assert!(out.starts_with('…'));
    }
}
