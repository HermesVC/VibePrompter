//! Detect context-window failures and decide when to retry with tighter compression.

use crate::models::CompletionResult;
use crate::utils::AppError;

const OVERFLOW_HINTS: &[&str] = &[
    "context length",
    "context_length",
    "maximum context",
    "max context",
    "max_context",
    "context window",
    "context_window",
    "token limit",
    "tokens exceed",
    "exceeds the model",
    "exceeds maximum",
    "too many tokens",
    "prompt is too long",
    "prompt too long",
    "input length",
    "input is too large",
    "request too large",
    "n_ctx",
    "num_ctx",
    "context size",
    "payload too large",
    "reduce the length",
    "maximum sequence length",
    "max sequence length",
    "context length exceeded",
    "exceeds context",
];

/// True when a vendor / transport message likely means the prompt exceeded the model window.
pub fn is_context_overflow_message(msg: &str) -> bool {
    let lower = msg.to_ascii_lowercase();
    if OVERFLOW_HINTS.iter().any(|hint| lower.contains(hint)) {
        return true;
    }
    // HTTP 413 as a status token, not a substring of unrelated numbers.
    lower.contains("413 payload") || lower.contains("status 413") || lower.starts_with("413 ")
}

pub fn is_context_overflow_error(err: &AppError) -> bool {
    is_context_overflow_message(&err.to_string())
}

/// Heuristic for silent cut-offs (LM Studio OOM, abrupt stream end, empty body).
pub fn looks_like_context_failure(
    result: &CompletionResult,
    input_estimate: u32,
    context_limit: i64,
) -> bool {
    if result.output_truncated {
        return false;
    }
    let limit = context_limit.max(8192) as f64;
    let estimate = input_estimate as f64;

    if result.stream_incomplete && estimate > limit * 0.55 {
        return true;
    }

    let body = result.text.trim();
    if body.is_empty() && estimate > limit * 0.45 {
        return true;
    }

    if body.len() < 24 && estimate > limit * 0.7 {
        return true;
    }

    if result.usage.input_tokens > 0 {
        let used = result.usage.input_tokens as f64;
        if used > limit * 0.88 {
            return true;
        }
    } else if estimate > limit * 0.92 {
        return true;
    }

    false
}

pub fn should_retry_for_context(
    result: Result<&CompletionResult, &AppError>,
    input_estimate: u32,
    context_limit: i64,
) -> bool {
    match result {
        Err(e) => is_context_overflow_error(e),
        Ok(r) => looks_like_context_failure(r, input_estimate, context_limit),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::TokenUsage;

    fn result(text: &str, input: u32, incomplete: bool) -> CompletionResult {
        CompletionResult {
            text: text.into(),
            model: "test".into(),
            latency_ms: 0,
            usage: TokenUsage {
                input_tokens: input,
                output_tokens: 0,
            },
            context_window_size: None,
            scoped_text: None,
            session_summary: None,
            memory_compressed: false,
            evicted_turns: None,
            context_recovered: false,
            stream_incomplete: incomplete,
            finish_reason: None,
            output_truncated: false,
            retrieved_memory: None,
            vector_chunks_used: None,
        }
    }

    #[test]
    fn detects_vendor_overflow_phrases() {
        assert!(is_context_overflow_message(
            "400 · This model's maximum context length is 8192 tokens"
        ));
        assert!(is_context_overflow_message("prompt is too long"));
        assert!(!is_context_overflow_message("connection refused"));
        assert!(!is_context_overflow_message("request took too long"));
    }

    #[test]
    fn detects_empty_reply_near_limit() {
        assert!(looks_like_context_failure(
            &result("", 7500, false),
            7500,
            8192
        ));
    }

    #[test]
    fn detects_incomplete_stream() {
        assert!(looks_like_context_failure(
            &result("partial", 6000, true),
            6000,
            8192
        ));
    }
}
