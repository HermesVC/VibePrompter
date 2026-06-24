//! Shared token estimates for sliding window, preflight degrade, and output budgeting.

use crate::models::ChatMessage;

/// Safety margin applied only for preflight degrade (not sliding-window eviction).
const PREFLIGHT_SAFETY_FACTOR: f64 = 1.06;
const PREFLIGHT_PROTOCOL_OVERHEAD: u32 = 64;

fn text_tokens(chars: usize, chars_per_token: f64) -> u32 {
    if chars == 0 {
        return 0;
    }
    ((chars as f64 / chars_per_token).ceil() as u32).max(1)
}

/// Estimate tokens for one chat message (mixed Cyrillic/Latin, tools, images).
pub fn estimate_message_tokens(m: &ChatMessage) -> u32 {
    let content = m.content.as_str();
    let chars = content.chars().count();
    let images = m.images.len() as u32;

    let base = if content.contains("[Tool result:") {
        // JSON tool payloads tokenize denser than plain prose.
        text_tokens(chars, 3.0).saturating_add(64)
    } else if content.contains("tool_call")
        || (content.contains("\"name\":") && content.contains("\"arguments\""))
    {
        text_tokens(chars, 3.2).saturating_add(32)
    } else if m.role == "assistant" && content.contains("```") {
        text_tokens(chars, 3.3)
    } else if m.role == "system" {
        text_tokens(chars, 3.6)
    } else {
        // Typical chat mix — slightly tighter than chars/4 to avoid late overflow.
        text_tokens(chars, 3.5)
    };

    base.saturating_add(images.saturating_mul(500))
}

pub fn estimate_system_tokens(system: Option<&str>, memory: &str, retrieved: &str) -> u32 {
    let mut chars = memory.chars().count() + retrieved.chars().count();
    if let Some(s) = system {
        chars += s.chars().count();
    }
    text_tokens(chars, 3.5).saturating_add(32)
}

/// Raw input estimate for UI meters and sliding-window budgeting.
pub fn estimate_chat_input_tokens(
    messages: &[ChatMessage],
    base_system: Option<&str>,
    memory: &str,
    retrieved: &str,
) -> u32 {
    let msg_tokens: u32 = messages.iter().map(estimate_message_tokens).sum();
    msg_tokens.saturating_add(estimate_system_tokens(base_system, memory, retrieved))
}

/// Conservative estimate for preflight degrade — triggers slightly before real overflow.
pub fn preflight_input_tokens(raw_estimate: u32) -> u32 {
    (((raw_estimate as f64) * PREFLIGHT_SAFETY_FACTOR)
        .ceil()
        .max(0.0) as u32)
        .saturating_add(PREFLIGHT_PROTOCOL_OVERHEAD)
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
    fn tool_results_estimate_denser_than_plain_text() {
        let plain = "hello world ".repeat(100);
        let tool = format!("[Tool result: read_file]\n{}", "x".repeat(4000));
        let plain_t = estimate_message_tokens(&msg("assistant", &plain));
        let tool_t = estimate_message_tokens(&msg("assistant", &tool));
        assert!(tool_t > plain_t);
        assert!(tool_t > (4000 / 4) as u32);
    }

    #[test]
    fn preflight_is_conservative_vs_raw() {
        let raw = 7000u32;
        assert!(preflight_input_tokens(raw) > raw);
    }
}
