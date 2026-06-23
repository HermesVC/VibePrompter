//! Sliding context window — keep recent turns in the prompt, compress older ones via LLM.

use crate::models::{ChatMessage, CompletionParams};
use crate::providers::{self, HttpConfig};
use crate::storage::repositories::ConnectionRow;
use crate::utils::{AppError, AppResult};

use super::session_summary::trim_summary_to_budget;

const SUMMARY_FRACTION: f64 = 0.3;
const MIN_ACTIVE_TURNS: usize = 2;
const COMPRESS_TURN_MAX_CHARS: usize = 1_200;
const COMPRESS_MAX_TURNS: usize = 24;
const COMPRESS_MAX_BODY_CHARS: usize = 12_000;

const COMPRESS_SYSTEM: &str = "\
You maintain long-term memory for an ongoing chat session.\n\
You will receive PRIOR_MEMORY (may be empty) and EVICTED_TURNS (older messages leaving the active window).\n\
Write UPDATED_MEMORY: one cohesive paragraph (3–8 sentences) merging prior memory with important facts from evicted turns.\n\
Keep: topics, decisions, names, preferences, open tasks. Drop: filler and repetition.\n\
Use the same language as the conversation. Output ONLY the memory text — no markdown, no labels.\n";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowAggression {
    Normal,
    Aggressive,
    Emergency,
}

impl WindowAggression {
    pub fn next(self) -> Self {
        match self {
            Self::Normal => Self::Aggressive,
            Self::Aggressive | Self::Emergency => Self::Emergency,
        }
    }

    fn system_reserve(self) -> u32 {
        match self {
            Self::Normal => 768,
            Self::Aggressive => 1_024,
            Self::Emergency => 1_280,
        }
    }

    fn reserve_multiplier(self) -> f32 {
        match self {
            Self::Normal => 1.0,
            Self::Aggressive => 1.35,
            Self::Emergency => 1.75,
        }
    }

    fn budget_factor(self) -> f32 {
        match self {
            Self::Normal => 1.0,
            Self::Aggressive => 0.82,
            Self::Emergency => 0.65,
        }
    }

    fn min_active_turns(self) -> usize {
        match self {
            Self::Normal => MIN_ACTIVE_TURNS,
            Self::Aggressive | Self::Emergency => 1,
        }
    }
}

pub struct WindowPlan {
    pub active: Vec<ChatMessage>,
    pub evicted: Vec<ChatMessage>,
}

pub fn estimate_message_tokens(m: &ChatMessage) -> u32 {
    let chars = m.content.chars().count();
    let images = m.images.len() as u32;
    ((chars + 3) / 4) as u32 + images * 500
}

fn estimate_summary_tokens(summary: &str) -> u32 {
    let chars = summary.trim().chars().count();
    if chars == 0 {
        return 0;
    }
    ((chars + 3) / 4) as u32
}

/// Split history into messages that fit the model window vs turns to compress into memory.
pub fn plan_sliding_window(
    messages: Vec<ChatMessage>,
    context_limit: i64,
    summary: &str,
    reserve_output: u32,
) -> WindowPlan {
    plan_sliding_window_with_aggression(
        messages,
        context_limit,
        summary,
        reserve_output,
        WindowAggression::Normal,
    )
}

pub fn plan_sliding_window_with_aggression(
    messages: Vec<ChatMessage>,
    context_limit: i64,
    summary: &str,
    reserve_output: u32,
    aggression: WindowAggression,
) -> WindowPlan {
    if messages.is_empty() {
        return WindowPlan {
            active: messages,
            evicted: Vec::new(),
        };
    }

    if aggression == WindowAggression::Emergency && messages.len() > 1 {
        return WindowPlan {
            active: vec![messages.last().expect("non-empty").clone()],
            evicted: messages[..messages.len() - 1].to_vec(),
        };
    }

    let ctx = context_limit.max(8192) as u32;
    let summary_cap = ((ctx as f64) * SUMMARY_FRACTION) as u32;
    let summary_budget = estimate_summary_tokens(summary).min(summary_cap);

    let adjusted_reserve =
        ((reserve_output as f32) * aggression.reserve_multiplier()).ceil() as u32;
    let budget = ((ctx
        .saturating_sub(adjusted_reserve)
        .saturating_sub(aggression.system_reserve())
        .saturating_sub(summary_budget)) as f32
        * aggression.budget_factor()) as u32;

    let mut active_rev: Vec<ChatMessage> = Vec::new();
    let mut used = 0u32;

    for m in messages.iter().rev() {
        let t = estimate_message_tokens(m);
        if !active_rev.is_empty() && used.saturating_add(t) > budget {
            break;
        }
        used = used.saturating_add(t);
        active_rev.push(m.clone());
    }
    active_rev.reverse();

    let min_keep = messages.len().min(aggression.min_active_turns()).max(1);
    if active_rev.len() < min_keep {
        let candidate = messages[messages.len() - min_keep..].to_vec();
        let candidate_tokens: u32 = candidate.iter().map(estimate_message_tokens).sum();
        if candidate_tokens <= budget || active_rev.is_empty() {
            active_rev = candidate;
        }
    }

    let evicted_len = messages.len().saturating_sub(active_rev.len());
    let evicted = if evicted_len > 0 {
        messages[..evicted_len].to_vec()
    } else {
        Vec::new()
    };

    WindowPlan {
        active: active_rev,
        evicted,
    }
}

fn truncate_turn_content(content: &str, max_chars: usize) -> String {
    let t = content.trim();
    if t.chars().count() <= max_chars {
        return t.to_string();
    }
    let truncated: String = t.chars().take(max_chars).collect();
    format!("{truncated}…")
}

fn format_evicted_turns(evicted: &[ChatMessage], context_limit: i64) -> String {
    let budget_chars = ((context_limit.max(8192) as f64) * 0.35 * 4.0) as usize;
    let cap = budget_chars.min(COMPRESS_MAX_BODY_CHARS);

    let start = evicted.len().saturating_sub(COMPRESS_MAX_TURNS);
    let mut out = String::new();
    for m in &evicted[start..] {
        let role = if m.role == "assistant" {
            "Assistant"
        } else {
            "User"
        };
        out.push_str(role);
        out.push_str(": ");
        out.push_str(&truncate_turn_content(&m.content, COMPRESS_TURN_MAX_CHARS));
        out.push_str("\n\n");
        if out.chars().count() > cap {
            let trimmed: String = out.chars().take(cap).collect();
            return format!("{trimmed}…");
        }
    }
    out.trim().to_string()
}

/// Truncated merge when the compression LLM call fails.
pub fn fallback_merge_memory(
    prior_memory: &str,
    evicted: &[ChatMessage],
    context_limit: i64,
) -> String {
    let mut excerpt = String::new();
    for m in evicted.iter().rev().take(8).rev() {
        let role = if m.role == "assistant" {
            "Assistant"
        } else {
            "User"
        };
        let content: String = m.content.chars().take(400).collect();
        excerpt.push_str(role);
        excerpt.push_str(": ");
        excerpt.push_str(content.trim());
        if m.content.chars().count() > 400 {
            excerpt.push('…');
        }
        excerpt.push('\n');
    }
    let prior = prior_memory.trim();
    let merged = if prior.is_empty() {
        excerpt
    } else {
        format!("{prior}\n{excerpt}")
    };
    trim_summary_to_budget(&merged, context_limit)
}

/// Call the same provider to merge evicted turns into rolling memory.
pub async fn compress_evicted_turns(
    conn: &ConnectionRow,
    cfg: &HttpConfig,
    prior_memory: &str,
    evicted: &[ChatMessage],
    context_limit: i64,
) -> AppResult<String> {
    if evicted.is_empty() {
        return Ok(prior_memory.to_string());
    }

    let prior = prior_memory.trim();
    let turns = format_evicted_turns(evicted, context_limit);
    let user_body = format!(
        "PRIOR_MEMORY:\n{}\n\nEVICTED_TURNS:\n{}",
        if prior.is_empty() { "(empty)" } else { prior },
        turns
    );

    let messages = vec![ChatMessage {
        role: "user".into(),
        content: user_body,
        images: Vec::new(),
    }];

    let params = CompletionParams {
        model: None,
        temperature: Some(0.2),
        max_tokens: Some(700),
        system: Some(COMPRESS_SYSTEM.into()),
    };

    let result = providers::complete(conn, messages, params, cfg).await?;
    let merged = result.text.trim();
    if merged.is_empty() {
        return Err(AppError::Validation(
            "memory compression returned empty text".into(),
        ));
    }
    Ok(trim_summary_to_budget(merged, context_limit))
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
    fn evicts_oldest_when_over_budget() {
        let messages: Vec<ChatMessage> =
            (0..8).map(|i| msg("user", &"word ".repeat(400))).collect();
        let plan = plan_sliding_window(messages, 8192, "", 1024);
        assert!(!plan.evicted.is_empty());
        assert!(!plan.active.is_empty());
        assert_eq!(plan.evicted.len() + plan.active.len(), 8);
    }

    #[test]
    fn keeps_all_when_fits() {
        let messages = vec![msg("user", "hi"), msg("assistant", "hello")];
        let plan = plan_sliding_window(messages.clone(), 8192, "", 1024);
        assert!(plan.evicted.is_empty());
        assert_eq!(plan.active.len(), 2);
    }
}
