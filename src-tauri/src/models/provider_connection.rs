//! User-owned provider connections. Each row is everything we need to make a
//! real API call: base URL, API key, default model, and the protocol kind so
//! we know how to format the request.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionKind {
    /// Any OpenAI-compatible HTTP API. The user supplies `base_url` (e.g.
    /// `https://api.openai.com/v1`, `https://openrouter.ai/api/v1`,
    /// `http://localhost:11434/v1`) and we POST to `{base_url}/chat/completions`.
    Openai,
    /// Native Anthropic Messages API at `{base_url}/v1/messages`.
    Anthropic,
}

impl ConnectionKind {
    pub fn from_db(s: &str) -> Option<Self> {
        match s {
            "openai" => Some(ConnectionKind::Openai),
            "anthropic" => Some(ConnectionKind::Anthropic),
            _ => None,
        }
    }
}

/// Read DTO sent to the frontend. The `api_key` is intentionally redacted —
/// only the last 4 characters are exposed for display purposes. The full key
/// stays server-side, used directly by `ProviderClient`.
#[derive(Debug, Clone, Serialize)]
pub struct ConnectionInfo {
    pub id: String,
    pub label: String,
    pub kind: String,
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    #[serde(rename = "apiKeyTail")]
    pub api_key_tail: String,
    #[serde(rename = "hasKey")]
    pub has_key: bool,
    #[serde(rename = "defaultModel")]
    pub default_model: String,
    #[serde(rename = "isDefault")]
    pub is_default: bool,
    /// JSON-encoded `{ "Header": "value", ... }`. Empty string when none.
    #[serde(rename = "extraHeaders")]
    pub extra_headers: String,
    /// RFC3339 of the last successful call, or empty string if never used.
    #[serde(rename = "lastUsedAt")]
    pub last_used_at: String,
    pub notes: String,
    /// Comma-separated free-text tags (e.g. "work,personal,gpt"). Used by
    /// the Providers panel to filter / group the connection list.
    pub tags: String,
    /// USD per million input tokens. 0 = fall back to embedded pricing table.
    #[serde(rename = "priceInputPerM")]
    pub price_input_per_m: f64,
    /// USD per million output tokens. 0 = fall back to embedded pricing table.
    #[serde(rename = "priceOutputPerM")]
    pub price_output_per_m: f64,
    /// Model context window in tokens. 0 = unknown (hide usage ring).
    #[serde(rename = "contextWindowSize")]
    pub context_window_size: i64,
    /// Chat template id (`openai_messages`, `gemma4`, …). See `list_prompt_formats`.
    #[serde(rename = "promptFormat")]
    pub prompt_format: String,
}

/// Write DTO from the frontend. `apiKey` is optional on update — when absent
/// or empty AND the row already has a key, we preserve the existing one so
/// the user can edit other fields without re-typing their secret.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInput {
    pub id: Option<String>,
    pub label: String,
    pub kind: String,
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub default_model: String,
    #[serde(default)]
    pub is_default: bool,
    /// JSON-encoded `{ "Header": "value" }`. Empty string allowed; the
    /// service validates the JSON shape before persisting.
    #[serde(default)]
    pub extra_headers: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub tags: String,
    #[serde(default)]
    pub price_input_per_m: f64,
    #[serde(default)]
    pub price_output_per_m: f64,
    #[serde(default)]
    pub context_window_size: i64,
    /// `openai_messages` (default) or `gemma4` — see `list_prompt_formats`.
    #[serde(default = "default_prompt_format")]
    pub prompt_format: String,
}

fn default_prompt_format() -> String {
    "openai_messages".to_string()
}

/// Base64 image attached to a user turn (vision / multimodal follow-ups).
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatImage {
    pub mime_type: String,
    pub data_base64: String,
}

/// A single message in a chat completion request — identical shape for both
/// OpenAI-compatible and Anthropic kinds; the client maps it onto each
/// vendor's wire format internally.
#[derive(Debug, Clone, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "system" | "user" | "assistant"
    pub content: String,
    /// Optional images for multimodal turns. Mapped to vendor-specific
    /// content blocks by the provider client.
    #[serde(default)]
    pub images: Vec<ChatImage>,
}

/// Params passed alongside messages to `complete`. All optional — sensible
/// defaults at the client layer.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionParams {
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub temperature: Option<f64>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub system: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct TokenUsage {
    #[serde(rename = "inputTokens")]
    pub input_tokens: u32,
    #[serde(rename = "outputTokens")]
    pub output_tokens: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct CompletionResult {
    pub text: String,
    pub model: String,
    #[serde(rename = "latencyMs")]
    pub latency_ms: u64,
    /// Token usage as reported by the vendor. Zero values mean either the
    /// vendor didn't report it (some OpenAI-compat servers, streaming
    /// responses without `stream_options.include_usage`) or the response
    /// was cancelled before usage arrived.
    #[serde(default)]
    pub usage: TokenUsage,
    /// Resolved context window for this connection, when known. Omitted for
    /// providers that don't expose a limit (most cloud APIs).
    #[serde(
        rename = "contextWindowSize",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub context_window_size: Option<i64>,
    /// Extracted snippet/file body when a scoped chat session is active.
    #[serde(
        rename = "scopedText",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub scoped_text: Option<String>,
    /// Rolling dialogue memory (LLM-compressed earlier turns).
    #[serde(
        rename = "sessionSummary",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub session_summary: Option<String>,
    /// True when older turns were compressed into memory before this reply.
    #[serde(
        rename = "memoryCompressed",
        default,
        skip_serializing_if = "std::ops::Not::not"
    )]
    pub memory_compressed: bool,
    /// Number of messages removed from the active window (compressed into memory).
    #[serde(
        rename = "evictedTurns",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub evicted_turns: Option<u32>,
    /// True when a context overflow was detected and the request was retried with tighter compression.
    #[serde(
        rename = "contextRecovered",
        default,
        skip_serializing_if = "std::ops::Not::not"
    )]
    pub context_recovered: bool,
    /// Stream ended without a clean `[DONE]` / terminal chunk (used for recovery heuristics).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub stream_incomplete: bool,
    /// Vendor finish reason when reported (`stop`, `length`, …).
    #[serde(
        rename = "finishReason",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub finish_reason: Option<String>,
    /// Output hit `max_tokens` / `finish_reason: length` — not the same as context overflow.
    #[serde(
        rename = "outputTruncated",
        default,
        skip_serializing_if = "std::ops::Not::not"
    )]
    pub output_truncated: bool,
    /// Semantic excerpts injected for this reply (compact preview for UI).
    #[serde(
        rename = "retrievedMemory",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub retrieved_memory: Option<String>,
    /// Number of vector chunks used in retrieval for this reply.
    #[serde(
        rename = "vectorChunksUsed",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub vector_chunks_used: Option<u32>,
}
