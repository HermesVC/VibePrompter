//! LLM compression when rolling or vector memory nears its cap (keep ~30% of source).

use crate::models::{ChatMessage, CompletionParams, CompletionResult};
use crate::providers::HttpConfig;
use crate::services::ConnectionService;
use crate::storage::repositories::ConnectionRow;
use crate::utils::{AppError, AppResult};

use super::context_recovery::{is_context_overflow_error, looks_like_context_failure};
use super::memory_facts::{merge_compressed_memory, split_memory_facts};
use super::session_summary::{summary_budget_chars, trim_to_char_budget};

/// Retained size after one compression pass (70% reduction).
pub const MEMORY_KEEP_FRACTION: f64 = 0.30;

/// Trigger LLM compression when usage exceeds this fraction of the cap.
pub const MEMORY_PRESSURE_FRACTION: f64 = 0.85;

/// Internal compress calls may run on large local models (LM Studio) — allow
/// longer than the user-facing chat timeout without changing global settings.
const MIN_COMPRESS_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(90);
const MAX_COMPRESS_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(600);
const RETRY_PAUSE: std::time::Duration = std::time::Duration::from_millis(250);
const MIN_SOURCE_CHARS: usize = 320;
const MAX_COMPRESS_ATTEMPTS: usize = 5;
/// Input size multiplier per retry when the model rejects or drops the compress call.
const INPUT_SHRINK_STEPS: [f64; MAX_COMPRESS_ATTEMPTS] = [1.0, 0.65, 0.42, 0.27, 0.17];

pub fn compression_target_chars(source_char_count: usize) -> usize {
    let target = (source_char_count as f64 * MEMORY_KEEP_FRACTION).ceil() as usize;
    target.max(128)
}

/// After LLM/fallback merge, never let rolling memory grow vs the prior snapshot.
pub fn enforce_memory_shrink(prior: &str, candidate: &str, context_limit: i64) -> String {
    use super::session_summary::{summary_budget_chars, trim_summary_to_budget, trim_to_char_budget};

    let budget = summary_budget_chars(context_limit);
    let capped = trim_summary_to_budget(candidate, context_limit);
    let prior_n = prior.trim().chars().count();
    let cand_n = capped.chars().count();
    if prior_n == 0 || cand_n <= prior_n {
        return capped;
    }
    let target = compression_target_chars(prior_n).min(budget);
    tracing::warn!(
        "rolling memory grew after compression ({} → {} chars); clamping to {}",
        prior_n,
        cand_n,
        target
    );
    trim_to_char_budget(&capped, target.max(256))
}

pub fn session_memory_needs_compression(memory: &str, context_limit: i64) -> bool {
    let budget = summary_budget_chars(context_limit);
    if budget == 0 {
        return false;
    }
    let used = memory.trim().chars().count();
    used >= (budget as f64 * MEMORY_PRESSURE_FRACTION).floor() as usize
}

/// Compress rolling session memory via LLM (~30% of current text).
pub async fn compress_session_memory(
    connections: &ConnectionService,
    conn: &ConnectionRow,
    memory: &str,
    context_limit: i64,
) -> AppResult<String> {
    let trimmed = memory.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    let source_chars = trimmed.chars().count();
    if source_chars < MIN_SOURCE_CHARS {
        return Ok(trimmed.to_string());
    }
    let budget = summary_budget_chars(context_limit);
    let target = compression_target_chars(source_chars).min(budget);
    let compressed =
        compress_text_via_llm(connections, conn, trimmed, target, context_limit).await?;
    Ok(enforce_memory_shrink(
        trimmed,
        &trim_to_char_budget(&compressed, budget),
        context_limit,
    ))
}

/// Fallback when all compression LLM attempts fail — hard trim toward the 30% target.
pub fn fallback_compress_session_memory(memory: &str, context_limit: i64) -> String {
    enforce_memory_shrink(
        memory,
        &fallback_compress_text(memory, context_limit),
        context_limit,
    )
}

/// Fallback for vector / generic text blobs.
pub fn fallback_compress_text(source: &str, context_limit: i64) -> String {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let facts = split_memory_facts(trimmed);
    let budget = summary_budget_chars(context_limit);
    let target = compression_target_chars(facts.narrative.chars().count()).min(budget);
    let narrative = trim_to_char_budget(&facts.narrative, target);
    trim_to_char_budget(
        &merge_compressed_memory(&facts, &narrative, context_limit),
        budget,
    )
}

/// Shared LLM pass with retries when the compress prompt overflows context or returns empty.
pub async fn compress_text_via_llm(
    connections: &ConnectionService,
    conn: &ConnectionRow,
    source: &str,
    target_chars: usize,
    context_limit: i64,
) -> AppResult<String> {
    let system = "You compress long-term memory for an ongoing session.\n\
You receive FULL_MEMORY — narrative memory only. Atomic facts were removed and will be merged back outside the model.\n\
Write a shorter narrative keeping topics, names, preferences, open tasks, and bugs.\n\
Do not invent or restate PLAN_CANONICAL, DECISION, REPO, path, or PLAN_PROGRESS facts.\n\
Drop filler and repetition. Target length: about TARGET characters (~30% of the input).\n\
Use the same language as the source. Output ONLY the compressed memory — no markdown, no labels.\n";
    compress_with_system_preserving_facts(
        connections,
        conn,
        source,
        target_chars,
        context_limit,
        system,
        true,
    )
    .await
}

pub async fn compress_with_system_preserving_facts(
    connections: &ConnectionService,
    conn: &ConnectionRow,
    source: &str,
    target_chars: usize,
    context_limit: i64,
    system: &str,
    wrap_as_full_memory: bool,
) -> AppResult<String> {
    let facts = split_memory_facts(source);
    if facts.atoms.is_empty() {
        return compress_with_system_retries(
            connections,
            conn,
            source,
            target_chars,
            context_limit,
            system,
            wrap_as_full_memory,
        )
        .await;
    }

    let narrative = facts.narrative.trim();
    if narrative.is_empty() {
        return Ok(trim_to_char_budget(
            &merge_compressed_memory(&facts, "", context_limit),
            summary_budget_chars(context_limit),
        ));
    }

    let compressed = compress_with_system_retries(
        connections,
        conn,
        narrative,
        target_chars,
        context_limit,
        system,
        wrap_as_full_memory,
    )
    .await?;
    Ok(trim_to_char_budget(
        &merge_compressed_memory(&facts, &compressed, context_limit),
        summary_budget_chars(context_limit),
    ))
}

/// Like [`compress_text_via_llm`] but caller supplies a custom system prompt and raw user body.
pub async fn compress_with_system_retries(
    connections: &ConnectionService,
    conn: &ConnectionRow,
    source: &str,
    target_chars: usize,
    context_limit: i64,
    system: &str,
    wrap_as_full_memory: bool,
) -> AppResult<String> {
    let source = source.trim();
    if source.is_empty() {
        return Ok(String::new());
    }

    let context_limit = context_limit.max(4096);
    let final_target = target_chars.max(128);
    let total_chars = source.chars().count();
    let mut last_err_msg: Option<String> = None;

    for (attempt, &shrink) in INPUT_SHRINK_STEPS.iter().enumerate() {
        let max_input = compress_input_budget_chars(context_limit, shrink);
        let truncated = truncate_compress_source(source, max_input);
        let input_chars = truncated.chars().count();
        let attempt_target = compression_target_chars(input_chars)
            .min(final_target)
            .max(128);
        let input_estimate = estimate_compress_input_tokens(system, &truncated);

        let user_body = if wrap_as_full_memory {
            if input_chars >= total_chars {
                format!(
                    "FULL_MEMORY ({input_chars} chars, compress to ~{attempt_target}):\n{truncated}"
                )
            } else {
                format!(
                    "FULL_MEMORY ({input_chars} of {total_chars} chars, compress to ~{attempt_target}):\n{truncated}"
                )
            }
        } else {
            truncated.clone()
        };

        let system_prompt = if wrap_as_full_memory {
            system.replace("TARGET", &attempt_target.to_string())
        } else {
            system.to_string()
        };

        let outcome = single_compress_attempt(
            connections,
            conn,
            &user_body,
            attempt_target,
            &system_prompt,
        )
        .await;

        match outcome {
            Ok(result) => {
                if should_retry_compress(Ok(&result), input_estimate, context_limit) {
                    tracing::warn!(
                        "memory compression attempt {} needs retry (input_chars={input_chars}, shrink={shrink:.2})",
                        attempt + 1
                    );
                    last_err_msg = Some("memory compression retryable empty/overflow".to_string());
                } else {
                    let text = result.text.trim();
                    if !text.is_empty() {
                        if attempt > 0 {
                            tracing::info!(
                                "memory compression recovered on attempt {}",
                                attempt + 1
                            );
                        }
                        return Ok(trim_to_char_budget(text, final_target));
                    }
                    last_err_msg = Some("memory compression returned empty text".to_string());
                }
            }
            Err(e) => {
                tracing::warn!(
                    "memory compression attempt {} failed: {e} (input_chars={input_chars})",
                    attempt + 1
                );
                let retry = should_retry_compress(Err(&e), input_estimate, context_limit);
                last_err_msg = Some(e.to_string());
                if !retry {
                    return Err(e);
                }
            }
        }

        if attempt + 1 < MAX_COMPRESS_ATTEMPTS {
            tokio::time::sleep(RETRY_PAUSE).await;
        }
    }

    Err(AppError::Validation(last_err_msg.unwrap_or_else(|| {
        "memory compression exhausted retries".into()
    })))
}

fn should_retry_compress(
    result: Result<&CompletionResult, &AppError>,
    input_estimate: u32,
    context_limit: i64,
) -> bool {
    match result {
        Err(e) => is_compress_retryable_error(e),
        Ok(r) => {
            if r.text.trim().is_empty() {
                return true;
            }
            looks_like_context_failure(r, input_estimate, context_limit)
        }
    }
}

fn is_compress_retryable_error(err: &AppError) -> bool {
    if is_context_overflow_error(err) {
        return true;
    }
    let lower = err.to_string().to_ascii_lowercase();
    lower.contains("timed out")
        || lower.contains("timeout")
        || lower.contains("empty text")
        || lower.contains("retryable")
        || lower.contains("connection reset")
        || lower.contains("broken pipe")
        || lower.contains("unexpected eof")
        || lower.contains("incomplete")
}

fn compress_request_timeout(cfg: &HttpConfig) -> std::time::Duration {
    cfg.timeout
        .max(MIN_COMPRESS_TIMEOUT)
        .min(MAX_COMPRESS_TIMEOUT)
}

fn estimate_compress_input_tokens(system: &str, user_body: &str) -> u32 {
    let chars = system.chars().count() + user_body.chars().count();
    ((chars + 3) / 4) as u32 + 96
}

/// Safe input char budget for an internal compress LLM call (~42% of context, scaled per retry).
pub fn compress_input_budget_chars(context_limit: i64, shrink: f64) -> usize {
    let limit = context_limit.max(4096) as f64;
    let shrink = shrink.clamp(0.1, 1.0);
    let token_budget = (limit * 0.42 * shrink).max(384.0);
    (token_budget * 3.5) as usize
}

/// Keep the tail of the source (recent facts) when input must shrink before send.
pub fn truncate_compress_source(source: &str, max_chars: usize) -> String {
    trim_to_char_budget(source, max_chars.max(256))
}

const TURN_MEMORY_SYSTEM: &str = r#"You extract durable session memory bullets from an assistant turn and tool trace.
Rules:
- Output 0-3 lines only. Each line MUST start with [bug], [decision], [repo], [note], or [code].
- Max 400 characters total. No markdown fences. No full file bodies.
- Record findings, patches applied, and plans — not user chit-chat.
- If nothing worth remembering, output exactly: NONE"#;

/// Optional LLM summary after a tool loop (findings / patches).
pub async fn summarize_turn_for_memory(
    connections: &ConnectionService,
    conn: &ConnectionRow,
    assistant_excerpt: &str,
    tool_trace: &str,
    context_limit: i64,
) -> Option<String> {
    let assistant_excerpt = assistant_excerpt.trim();
    let tool_trace = tool_trace.trim();
    if assistant_excerpt.is_empty() && tool_trace.is_empty() {
        return None;
    }
    let budget = compress_input_budget_chars(context_limit, 0.35).min(2_800);
    let user_body = format!(
        "Assistant excerpt:\n{}\n\nTool trace:\n{}\n",
        truncate_compress_source(assistant_excerpt, budget / 2),
        truncate_compress_source(tool_trace, budget / 2)
    );
    if user_body.trim().chars().count() < 24 {
        return None;
    }
    let messages = vec![ChatMessage {
        role: "user".into(),
        content: user_body,
        images: Vec::new(),
    }];
    let params = CompletionParams {
        model: None,
        temperature: Some(0.15),
        max_tokens: Some(220),
        system: Some(TURN_MEMORY_SYSTEM.into()),
        disable_thinking: Some(true),
        retry: Some(false),
    };
    let cfg = connections.http_config().await;
    let compress_timeout = compress_request_timeout(&cfg);
    let mut compress_cfg = cfg.clone();
    compress_cfg.timeout = compress_timeout.min(std::time::Duration::from_secs(45));
    let result = match tokio::time::timeout(
        compress_cfg.timeout,
        connections.complete_gated_with_cfg(conn, messages, params, &compress_cfg),
    )
    .await
    {
        Ok(Ok(r)) => r,
        Ok(Err(e)) => {
            tracing::warn!("turn memory summarize skipped: {e}");
            return None;
        }
        Err(_) => {
            tracing::warn!("turn memory summarize timed out");
            return None;
        }
    };
    let text = result.text.trim();
    if text.is_empty() || text.eq_ignore_ascii_case("none") {
        None
    } else {
        Some(trim_to_char_budget(text, 420))
    }
}

async fn single_compress_attempt(
    connections: &ConnectionService,
    conn: &ConnectionRow,
    user_content: &str,
    target_chars: usize,
    system: &str,
) -> AppResult<CompletionResult> {
    let messages = vec![ChatMessage {
        role: "user".into(),
        content: user_content.to_string(),
        images: Vec::new(),
    }];

    let max_tokens = ((target_chars / 3) as u32).clamp(96, 900);

    let params = CompletionParams {
        model: None,
        temperature: Some(0.2),
        max_tokens: Some(max_tokens),
        system: Some(system.to_string()),
        disable_thinking: Some(true),
        retry: Some(false),
    };

    let cfg = connections.http_config().await;
    let compress_timeout = compress_request_timeout(&cfg);
    let mut compress_cfg = cfg.clone();
    compress_cfg.timeout = compress_timeout;

    let compress_future =
        connections.complete_gated_with_cfg(conn, messages, params, &compress_cfg);
    match tokio::time::timeout(compress_timeout, compress_future).await {
        Ok(Ok(r)) => Ok(r),
        Ok(Err(e)) => Err(e),
        Err(_) => Err(AppError::Validation("memory compression timed out".into())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enforce_memory_shrink_clamps_growth() {
        let prior = "a".repeat(2000);
        let bloated = format!("{prior}\n{}", "b".repeat(2500));
        let out = enforce_memory_shrink(&prior, &bloated, 8192);
        assert!(out.chars().count() <= prior.chars().count());
    }

    #[test]
    fn compression_target_is_thirty_percent() {
        assert_eq!(compression_target_chars(1000), 300);
        assert_eq!(compression_target_chars(100), 128);
    }

    #[test]
    fn session_pressure_at_eighty_five_percent_of_budget() {
        let budget = summary_budget_chars(8192);
        let almost_full = "x".repeat((budget as f64 * 0.86) as usize);
        assert!(session_memory_needs_compression(&almost_full, 8192));
        let half = "x".repeat(budget / 2);
        assert!(!session_memory_needs_compression(&half, 8192));
    }

    #[test]
    fn input_budget_shrinks_on_retry_steps() {
        let full = compress_input_budget_chars(8192, 1.0);
        let shrunk = compress_input_budget_chars(8192, 0.42);
        assert!(shrunk < full);
        assert!(shrunk >= 256);
    }

    #[test]
    fn truncate_keeps_tail() {
        let src = format!("HEAD-{}-TAIL", "m".repeat(5000));
        let out = truncate_compress_source(&src, 200);
        assert!(out.starts_with('…'));
        assert!(out.contains("TAIL"));
        assert!(!out.contains("HEAD"));
    }

    #[test]
    fn compress_timeout_at_least_ninety_seconds_even_when_http_is_thirty() {
        let cfg = HttpConfig {
            timeout: std::time::Duration::from_secs(30),
            proxy: None,
            log_raw: false,
        };
        assert_eq!(
            compress_request_timeout(&cfg),
            std::time::Duration::from_secs(90)
        );
    }

    #[test]
    fn compress_timeout_respects_higher_user_setting() {
        let cfg = HttpConfig {
            timeout: std::time::Duration::from_secs(180),
            proxy: None,
            log_raw: false,
        };
        assert_eq!(
            compress_request_timeout(&cfg),
            std::time::Duration::from_secs(180)
        );
    }

    #[test]
    fn overflow_errors_are_retryable() {
        assert!(is_compress_retryable_error(&AppError::Validation(
            "prompt is too long".into()
        )));
        assert!(!is_compress_retryable_error(&AppError::Validation(
            "invalid api key".into()
        )));
    }

    #[test]
    fn fallback_compression_keeps_structured_facts_before_trimming_narrative() {
        let source = format!(
            "PLAN_CANONICAL v8\nstep: 8 / 12\nnext: tests\nDECISION: keep local Qwen\n{}",
            "narrative ".repeat(5000)
        );
        let out = fallback_compress_text(&source, 8192);

        assert!(out.contains("PLAN_CANONICAL v8"));
        assert!(out.contains("DECISION: keep local Qwen"));
        assert!(out.contains("## FACTS"));
        assert!(out.chars().count() <= summary_budget_chars(8192));
    }
}
