//! Context degrade ladder — preflight and progressive payload reduction before/at failure.

use crate::models::ChatMessage;

use super::sliding_window::WindowAggression;

pub const PREFLIGHT_THRESHOLD: f64 = 0.88;

const TOOL_SUMMARY_PER_BLOCK: usize = 800;
const TOOL_SUMMARY_TOTAL: usize = 4_000;

/// Progressive degrade levels (cumulative effects from level 3 upward).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
#[repr(u8)]
pub enum DegradeLevel {
    Normal = 0,
    Aggressive = 1,
    Emergency = 2,
    NoRetrieved = 3,
    ToolSummaryOnly = 4,
    SingleTurn = 5,
    Anchor = 6,
}

impl DegradeLevel {
    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            0 => Some(Self::Normal),
            1 => Some(Self::Aggressive),
            2 => Some(Self::Emergency),
            3 => Some(Self::NoRetrieved),
            4 => Some(Self::ToolSummaryOnly),
            5 => Some(Self::SingleTurn),
            6 => Some(Self::Anchor),
            _ => None,
        }
    }

    pub fn as_u8(self) -> u8 {
        self as u8
    }

    pub fn next(self) -> Option<Self> {
        Self::from_u8(self.as_u8() + 1)
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Normal => "normal window",
            Self::Aggressive => "aggressive window",
            Self::Emergency => "emergency window",
            Self::NoRetrieved => "without retrieved memory",
            Self::ToolSummaryOnly => "tool results summarized",
            Self::SingleTurn => "single-turn context",
            Self::Anchor => "anchor mode",
        }
    }

    pub fn window_aggression(self) -> WindowAggression {
        match self {
            Self::Normal => WindowAggression::Normal,
            Self::Aggressive => WindowAggression::Aggressive,
            Self::Emergency
            | Self::NoRetrieved
            | Self::ToolSummaryOnly
            | Self::SingleTurn
            | Self::Anchor => WindowAggression::Emergency,
        }
    }

    pub fn omit_retrieved(self) -> bool {
        self >= Self::NoRetrieved
    }

    pub fn tool_summary_only(self) -> bool {
        self >= Self::ToolSummaryOnly
    }

    pub fn single_turn(self) -> bool {
        self >= Self::SingleTurn
    }

    pub fn anchor_mode(self) -> bool {
        self >= Self::Anchor
    }
}

pub fn preflight_needs_degrade(input_estimate: u32, context_limit: i64) -> bool {
    let limit = context_limit.max(8192) as f64;
    let adjusted = super::token_budget::preflight_input_tokens(input_estimate) as f64;
    adjusted > limit * PREFLIGHT_THRESHOLD
}

/// Apply level-specific transforms before sliding-window planning.
pub fn apply_message_degrade(
    messages: Vec<ChatMessage>,
    level: DegradeLevel,
    anchor_hint: Option<&str>,
) -> Vec<ChatMessage> {
    let mut msgs = messages;
    if level.tool_summary_only() {
        msgs = summarize_tool_blocks_in_messages(msgs);
    }
    if level.single_turn() {
        msgs = last_user_message(msgs);
        if level.anchor_mode() {
            if let Some(anchor) = anchor_hint.filter(|s| !s.trim().is_empty()) {
                prepend_anchor(&mut msgs, anchor);
            }
        }
    }
    msgs
}

fn last_user_message(messages: Vec<ChatMessage>) -> Vec<ChatMessage> {
    messages
        .into_iter()
        .rev()
        .find(|m| m.role == "user" && (!m.content.trim().is_empty() || !m.images.is_empty()))
        .into_iter()
        .collect()
}

fn prepend_anchor(messages: &mut Vec<ChatMessage>, anchor: &str) {
    if let Some(m) = messages.last_mut() {
        if !m.content.contains("## Task anchor") {
            m.content = format!("## Task anchor\n{anchor}\n\n---\n\n{}", m.content);
        }
    }
}

fn summarize_tool_blocks_in_messages(messages: Vec<ChatMessage>) -> Vec<ChatMessage> {
    messages
        .into_iter()
        .map(|mut m| {
            if m.content.contains("[Tool result:") {
                m.content = collapse_tool_results(&m.content);
            }
            m
        })
        .collect()
}

fn collapse_tool_results(content: &str) -> String {
    let marker = "[Tool result:";
    if !content.contains(marker) {
        return content.to_string();
    }
    let mut out = String::new();
    let mut rest = content;
    let mut total_tool_chars = 0usize;
    while let Some(idx) = rest.find(marker) {
        out.push_str(&rest[..idx]);
        rest = &rest[idx..];
        let end = rest
            .find("\n\n[Tool result:")
            .map(|i| i + 2)
            .or_else(|| rest.find("\n\n---"))
            .unwrap_or(rest.len());
        let block = &rest[..end.min(rest.len())];
        let summary = truncate_block(block, TOOL_SUMMARY_PER_BLOCK);
        total_tool_chars += summary.chars().count();
        if total_tool_chars > TOOL_SUMMARY_TOTAL {
            out.push_str("[Tool results summarized — use read_file for details]");
            return out;
        }
        out.push_str(&summary);
        if end < rest.len() {
            out.push_str("\n\n");
        }
        rest = &rest[end..];
    }
    out.push_str(rest);
    out
}

fn truncate_block(block: &str, max_chars: usize) -> String {
    if block.chars().count() <= max_chars {
        return block.to_string();
    }
    let head: String = block.chars().take(max_chars).collect();
    format!("{head}… [truncated]")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(role: &str, content: &str) -> ChatMessage {
        ChatMessage {
            role: role.into(),
            content: content.into(),
            images: Vec::new(),
        }
    }

    #[test]
    fn preflight_triggers_near_limit() {
        assert!(preflight_needs_degrade(7200, 8192));
        assert!(!preflight_needs_degrade(4000, 8192));
    }

    #[test]
    fn single_turn_keeps_last_user_only() {
        let messages = vec![
            msg("user", "first"),
            msg("assistant", "reply"),
            msg("user", "last goal"),
        ];
        let out = apply_message_degrade(messages, DegradeLevel::SingleTurn, None);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].content, "last goal");
    }

    #[test]
    fn anchor_prepends_task_block() {
        let messages = vec![msg("user", "execute step 2")];
        let out = apply_message_degrade(messages, DegradeLevel::Anchor, Some("Goal: build app"));
        assert!(out[0].content.contains("## Task anchor"));
        assert!(out[0].content.contains("Goal: build app"));
    }

    #[test]
    fn tool_summary_truncates_large_blocks() {
        let huge = "x".repeat(20_000);
        let content = format!("[Tool result: read_file]\n{huge}");
        let collapsed = collapse_tool_results(&content);
        assert!(collapsed.chars().count() < 2_000);
    }

    #[test]
    fn tool_summary_caps_total_across_multiple_blocks() {
        let block = format!("[Tool result: read_file]\n{}", "y".repeat(5_000));
        let content = (0..8)
            .map(|_| block.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");
        let collapsed = collapse_tool_results(&content);
        assert!(
            collapsed.chars().count() < 6_000,
            "collapsed len={}",
            collapsed.chars().count()
        );
        assert!(collapsed.contains("summarized"));
        assert!(!collapsed.contains(&"y".repeat(5_000)));
    }

    #[test]
    fn anchor_skipped_without_explicit_hint() {
        let messages = vec![msg("user", "execute step 2")];
        let out = apply_message_degrade(messages, DegradeLevel::Anchor, None);
        assert!(!out[0].content.contains("## Task anchor"));
        assert_eq!(out[0].content, "execute step 2");
    }

    #[test]
    fn tool_summary_only_never_expands_tool_payload() {
        let tool = format!(
            "[Tool result: read_file]\n{}\n\n[Tool result: read_file]\n{}",
            "alpha ".repeat(2_000),
            "beta ".repeat(2_000)
        );
        let messages = vec![msg("assistant", "before"), msg("user", &tool)];
        let original_chars: usize = messages.iter().map(|m| m.content.chars().count()).sum();
        let out = apply_message_degrade(messages, DegradeLevel::ToolSummaryOnly, None);
        let degraded_chars: usize = out.iter().map(|m| m.content.chars().count()).sum();
        assert!(
            degraded_chars < original_chars,
            "degraded={degraded_chars} original={original_chars}"
        );
    }

    #[test]
    fn degrade_single_turn_drops_prior_secret_even_when_anchor_exists() {
        let messages = vec![
            msg("user", "SECRET_SHOULD_NOT_SURVIVE"),
            msg("assistant", "ok"),
            msg("user", "continue current step"),
        ];
        let out = apply_message_degrade(messages, DegradeLevel::Anchor, Some("Goal: ship"));
        assert_eq!(out.len(), 1);
        assert!(!out[0].content.contains("SECRET_SHOULD_NOT_SURVIVE"));
        assert!(out[0].content.contains("Goal: ship"));
        assert!(out[0].content.contains("continue current step"));
    }

    #[test]
    fn degrade_level_progression() {
        assert_eq!(DegradeLevel::Normal.next(), Some(DegradeLevel::Aggressive));
        assert_eq!(DegradeLevel::Anchor.next(), None);
    }
}
