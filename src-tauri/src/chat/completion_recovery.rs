//! Shared context-window recovery for completions (tool follow-up and future unify with run_chat).

use crate::chat::{
    estimate_message_tokens, estimate_system_tokens, plan_sliding_window_with_aggression,
    should_retry_for_context, WindowAggression,
};
use crate::models::{ChatMessage, CompletionParams, CompletionResult};
use crate::utils::{AppError, AppResult};

pub const MAX_COMPLETION_CONTEXT_RETRIES: usize = 2;

pub fn estimate_completion_input_tokens(messages: &[ChatMessage], system: Option<&str>) -> u32 {
    let msg_tokens: u32 = messages.iter().map(estimate_message_tokens).sum();
    msg_tokens.saturating_add(estimate_system_tokens(system, "", ""))
}

/// Run a completion with sliding-window degrade retries when context fails (OOM / empty / overflow).
/// Used by tool follow-up inline; `run_chat` will unify on this in phase 2.
#[allow(dead_code)]
pub async fn run_with_context_recovery<C, Fut>(
    base_messages: Vec<ChatMessage>,
    params: &CompletionParams,
    context_limit: i64,
    reserve_output: u32,
    should_cancel: C,
    mut run_once: impl FnMut(Vec<ChatMessage>, WindowAggression) -> Fut,
) -> AppResult<CompletionResult>
where
    C: Fn() -> bool + Send + Sync + Clone,
    Fut: std::future::Future<Output = AppResult<CompletionResult>>,
{
    let mut aggression = WindowAggression::Normal;
    let mut last_result: AppResult<CompletionResult> =
        Err(AppError::Validation("completion did not run".into()));

    for attempt in 0..=MAX_COMPLETION_CONTEXT_RETRIES {
        if should_cancel() {
            return Err(AppError::Validation("cancelled".into()));
        }
        if attempt > 0 {
            aggression = aggression.next();
            tracing::warn!(
                "completion context recovery attempt {attempt}/{MAX_COMPLETION_CONTEXT_RETRIES} (aggression={aggression:?})"
            );
        }

        let window = plan_sliding_window_with_aggression(
            base_messages.clone(),
            context_limit,
            "",
            reserve_output,
            aggression,
        );
        let active = window.active;
        let input_estimate = estimate_completion_input_tokens(&active, params.system.as_deref());

        last_result = run_once(active, aggression).await;

        let retry = attempt < MAX_COMPLETION_CONTEXT_RETRIES
            && should_retry_for_context(
                last_result.as_ref().map_err(|e| e),
                input_estimate,
                context_limit,
            );
        if !retry {
            break;
        }
    }

    last_result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn estimate_includes_system_chars() {
        let msgs = vec![ChatMessage {
            role: "user".into(),
            content: "hello world".into(),
            images: vec![],
        }];
        let base = estimate_completion_input_tokens(&msgs, None);
        let with_sys = estimate_completion_input_tokens(&msgs, Some("x".repeat(400).as_str()));
        assert!(with_sys > base);
    }
}
