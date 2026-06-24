//! Sliding context window — keep recent turns in the prompt, compress older ones via LLM.

use crate::models::ChatMessage;
use crate::services::ConnectionService;
use crate::storage::repositories::ConnectionRow;
use crate::utils::AppResult;

use super::session_summary::{summary_budget_chars, trim_summary_to_budget, SUMMARY_FRACTION};
const MIN_ACTIVE_TURNS: usize = 2;
const COMPRESS_TURN_MAX_CHARS: usize = 1_200;
const COMPRESS_MAX_TURNS: usize = 24;
const COMPRESS_MAX_BODY_CHARS: usize = 12_000;

const COMPRESS_SYSTEM: &str = "\
You maintain long-term memory for an ongoing chat session.\n\
You will receive PRIOR_MEMORY (may be empty) and EVICTED_TURNS (older messages leaving the active window).\n\
Merge them into UPDATED_MEMORY: one cohesive paragraph keeping essential facts.\n\
Target length: about 30% of the combined input (roughly 70% compression). Drop filler and repetition.\n\
Keep: topics, decisions, names, preferences, open tasks, plan progress. Use the same language as the conversation.\n\
Output ONLY the memory text — no markdown, no labels.\n";

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
        } else {
            let mut trimmed = candidate;
            shrink_oversized_active(&mut trimmed, budget);
            active_rev = trimmed;
        }
    }

    shrink_oversized_active(&mut active_rev, budget);

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

/// Conservative per-message cap so a single scope attachment cannot blow the context.
fn shrink_oversized_active(active: &mut Vec<ChatMessage>, budget_tokens: u32) {
    let max_chars = ((budget_tokens.max(2048) / 2) as usize).saturating_mul(3);
    for m in active.iter_mut() {
        if m.content.chars().count() > max_chars {
            m.content = truncate_turn_content(&m.content, max_chars);
        }
    }
    let mut total: u32 = active.iter().map(estimate_message_tokens).sum();
    while total > budget_tokens && active.len() > 1 {
        let idx = active.len().saturating_sub(2);
        let current = active[idx].content.chars().count();
        let shrink_to = (current / 2).max(2_000).min(current);
        active[idx].content = truncate_turn_content(&active[idx].content, shrink_to);
        total = active.iter().map(estimate_message_tokens).sum();
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
    use super::memory_compress::compression_target_chars;
    use super::memory_facts::{collect_session_facts, merge_compressed_memory};
    use super::session_summary::{summary_budget_chars, trim_to_char_budget};

    let facts = collect_session_facts(prior_memory.trim(), evicted);
    let budget = summary_budget_chars(context_limit);
    let target = compression_target_chars(facts.narrative.chars().count()).min(budget);
    let narrative = trim_to_char_budget(&facts.narrative, target);
    trim_summary_to_budget(
        &merge_compressed_memory(&facts, &narrative, context_limit),
        context_limit,
    )
}

/// Call the same provider to merge evicted turns into rolling memory.
pub async fn compress_evicted_turns(
    connections: &ConnectionService,
    conn: &ConnectionRow,
    prior_memory: &str,
    evicted: &[ChatMessage],
    context_limit: i64,
) -> AppResult<String> {
    if evicted.is_empty() {
        return Ok(prior_memory.to_string());
    }

    let prior = prior_memory.trim();
    let turns = format_evicted_turns(evicted, context_limit);
    let combined_chars = prior.chars().count() + turns.chars().count();
    let target_chars = super::memory_compress::compression_target_chars(combined_chars)
        .min(summary_budget_chars(context_limit));
    let user_body = format!(
        "PRIOR_MEMORY:\n{}\n\nEVICTED_TURNS:\n{}\n\nTARGET_LENGTH: ~{target_chars} characters (~30% of combined input)",
        if prior.is_empty() { "(empty)" } else { prior },
        turns
    );

    let facts = super::memory_facts::collect_session_facts(prior, evicted);
    let compressed = super::memory_compress::compress_with_system_retries(
        connections,
        conn,
        &user_body,
        target_chars,
        context_limit,
        COMPRESS_SYSTEM,
        false,
    )
    .await?;
    Ok(trim_summary_to_budget(
        &super::memory_facts::merge_compressed_memory(&facts, &compressed, context_limit),
        context_limit,
    ))
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
            (0..8).map(|_| msg("user", &"word ".repeat(400))).collect();
        let plan =
            plan_sliding_window_with_aggression(messages, 8192, "", 1024, WindowAggression::Normal);
        assert!(!plan.evicted.is_empty());
        assert!(!plan.active.is_empty());
        assert_eq!(plan.evicted.len() + plan.active.len(), 8);
    }

    #[test]
    fn keeps_all_when_fits() {
        let messages = vec![msg("user", "hi"), msg("assistant", "hello")];
        let plan = plan_sliding_window_with_aggression(
            messages.clone(),
            8192,
            "",
            1024,
            WindowAggression::Normal,
        );
        assert!(plan.evicted.is_empty());
        assert_eq!(plan.active.len(), 2);
    }

    #[test]
    fn fallback_merge_preserves_decision_from_oldest_evicted() {
        let evicted = vec![
            msg("user", "DECISION: secret code VIBE-7749"),
            msg("assistant", "accepted"),
            msg("user", &"filler ".repeat(300)),
        ];
        let out = fallback_merge_memory("", &evicted, 8192);
        assert!(out.contains("VIBE-7749"));
        assert!(out.contains("## FACTS"));
    }
}
