//! LM Studio native API helpers.
//!
//! OpenAI-compatible calls go to `{origin}/v1/*`, but context length lives on
//! the native REST API (`/api/v1/models`). We only probe local LM Studio URLs —
//! cloud OpenAI-compat endpoints are never touched.

use serde_json::Value;

use super::HttpConfig;

/// True when the base URL points at a local LM Studio server.
pub fn is_lm_studio_url(base_url: &str) -> bool {
    let u = base_url.to_lowercase();
    u.contains("localhost:1234") || u.contains("127.0.0.1:1234")
}

/// Strip a trailing `/v1` OpenAI-compat suffix to get the server origin.
fn origin_from_base(base_url: &str) -> Option<String> {
    let mut base = base_url.trim().trim_end_matches('/').to_string();
    if base.ends_with("/v1") {
        base.truncate(base.len() - 3);
        base = base.trim_end_matches('/').to_string();
    }
    if base.starts_with("http://") || base.starts_with("https://") {
        Some(base)
    } else {
        None
    }
}

fn read_context_from_model(m: &Value) -> Option<i64> {
    for key in [
        "context_length",
        "max_context_length",
        "contextLength",
        "maxContextLength",
    ] {
        if let Some(n) = m.get(key).and_then(|v| v.as_i64()).filter(|&n| n > 0) {
            return Some(n);
        }
    }
    for nested in ["loaded_instances", "loadedModels", "load_config"] {
        if let Some(child) = m.get(nested) {
            if let Some(n) = read_context_from_model(child) {
                return Some(n);
            }
            if let Some(arr) = child.as_array() {
                for item in arr {
                    if let Some(n) = read_context_from_model(item) {
                        return Some(n);
                    }
                }
            }
        }
    }
    None
}

fn extract_context_length(json: &Value) -> Option<i64> {
    if let Some(n) = read_context_from_model(json) {
        return Some(n);
    }
    if let Some(arr) = json.get("data").and_then(|v| v.as_array()) {
        for m in arr {
            if let Some(n) = read_context_from_model(m) {
                return Some(n);
            }
        }
    }
    if let Some(arr) = json.as_array() {
        for m in arr {
            if let Some(n) = read_context_from_model(m) {
                return Some(n);
            }
        }
    }
    None
}

/// Best-effort context window from LM Studio native `/api/v1/models` (or v0).
/// Returns `None` on any failure — callers must not treat that as an error.
pub async fn probe_context_length(base_url: &str, cfg: &HttpConfig) -> Option<i64> {
    if !is_lm_studio_url(base_url) {
        return None;
    }
    let origin = origin_from_base(base_url)?;
    let client = super::http(cfg).ok()?;
    for path in ["/api/v1/models", "/api/v0/models"] {
        let url = format!("{origin}{path}");
        let resp = match client.get(&url).send().await {
            Ok(r) if r.status().is_success() => r,
            _ => continue,
        };
        let json: Value = match resp.json().await {
            Ok(v) => v,
            Err(_) => continue,
        };
        if let Some(n) = extract_context_length(&json) {
            return Some(n);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_lm_studio_urls() {
        assert!(is_lm_studio_url("http://localhost:1234/v1"));
        assert!(is_lm_studio_url("http://127.0.0.1:1234"));
        assert!(!is_lm_studio_url("https://api.openai.com/v1"));
    }

    #[test]
    fn strips_v1_suffix() {
        assert_eq!(
            origin_from_base("http://localhost:1234/v1").as_deref(),
            Some("http://localhost:1234")
        );
    }
}
