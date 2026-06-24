//! OpenAI-compatible `/v1/embeddings` (LM Studio, Ollama, cloud).

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::json;

use super::{apply_extra_headers, http, normalize_base, HttpConfig};
use crate::storage::repositories::ConnectionRow;
use crate::utils::{AppError, AppResult};

const FALLBACK_EMBED_MODELS: &[&str] = &[
    // LM Studio exposes nomic with the OpenAI-ish id.
    "text-embedding-nomic-embed-text-v1.5",
    // Ollama accepts both the tagless and tagged names.
    "nomic-embed-text",
    "nomic-embed-text:latest",
];
const DEFAULT_EMBED_MODEL: &str = FALLBACK_EMBED_MODELS[0];
const EMBED_MODEL_CACHE_TTL: Duration = Duration::from_secs(300);

static EMBED_MODEL_CACHE: Mutex<Option<HashMap<String, (Instant, Vec<String>)>>> = Mutex::new(None);

/// Best-effort embedding model: connection default if it looks like an embed model, else fallback.
pub fn resolve_embed_model(connection_default: &str) -> &str {
    let d = connection_default.trim();
    if d.is_empty() {
        return DEFAULT_EMBED_MODEL;
    }
    let lower = d.to_ascii_lowercase();
    if lower.contains("embed") || lower.contains("nomic") || lower.contains("bge") {
        return d;
    }
    DEFAULT_EMBED_MODEL
}

pub async fn embed_texts(
    conn: &ConnectionRow,
    cfg: &HttpConfig,
    texts: &[String],
    model: Option<&str>,
) -> AppResult<Vec<Vec<f32>>> {
    if texts.is_empty() {
        return Ok(Vec::new());
    }

    let candidates = embed_model_candidates(conn, cfg, model).await;
    let mut last_err: Option<AppError> = None;
    for candidate in candidates {
        match embed_texts_once(conn, cfg, texts, &candidate).await {
            Ok(v) => return Ok(v),
            Err(e) => {
                tracing::debug!("embeddings candidate '{candidate}' failed: {e}");
                last_err = Some(e);
            }
        }
    }

    Err(last_err
        .unwrap_or_else(|| AppError::Validation("no embedding model candidates available".into())))
}

async fn embed_model_candidates(
    conn: &ConnectionRow,
    cfg: &HttpConfig,
    model: Option<&str>,
) -> Vec<String> {
    if let Some(explicit) = model.map(str::trim).filter(|s| !s.is_empty()) {
        return vec![explicit.to_string()];
    }

    let cache_key = format!("{}|{}", conn.id, normalize_base(&conn.base_url));
    if let Some(cached) = cached_embed_models(&cache_key) {
        return cached;
    }

    let mut out = Vec::new();
    push_candidate(&mut out, resolve_embed_model(&conn.default_model));

    let discovered = discover_embedding_models(conn, cfg).await;
    for discovered in discovered {
        push_candidate(&mut out, &discovered);
    }

    for fallback in FALLBACK_EMBED_MODELS {
        push_candidate(&mut out, fallback);
    }

    store_embed_models(&cache_key, &out);

    out
}

fn cached_embed_models(cache_key: &str) -> Option<Vec<String>> {
    let guard = EMBED_MODEL_CACHE.lock().ok()?;
    let map = guard.as_ref()?;
    let (at, models) = map.get(cache_key)?;
    if at.elapsed() > EMBED_MODEL_CACHE_TTL {
        return None;
    }
    Some(models.clone())
}

fn store_embed_models(cache_key: &str, models: &[String]) {
    let Ok(mut guard) = EMBED_MODEL_CACHE.lock() else {
        return;
    };
    let map = guard.get_or_insert_with(HashMap::new);
    map.insert(cache_key.to_string(), (Instant::now(), models.to_vec()));
}

async fn discover_embedding_models(conn: &ConnectionRow, cfg: &HttpConfig) -> Vec<String> {
    let base = normalize_base(&conn.base_url);
    let url = format!("{base}/models");
    let client = match http(cfg) {
        Ok(client) => client,
        Err(e) => {
            tracing::debug!("embedding model discovery skipped: {e}");
            return Vec::new();
        }
    };
    let resp = match apply_extra_headers(client.get(&url).bearer_auth(&conn.api_key), conn)
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => resp,
        Ok(resp) => {
            tracing::debug!(
                "embedding model discovery skipped: /models {}",
                resp.status()
            );
            return Vec::new();
        }
        Err(e) => {
            tracing::debug!("embedding model discovery skipped: {e}");
            return Vec::new();
        }
    };

    let parsed: serde_json::Value = match resp.json().await {
        Ok(v) => v,
        Err(e) => {
            tracing::debug!("embedding model discovery parse skipped: {e}");
            return Vec::new();
        }
    };

    parsed
        .get("data")
        .and_then(|d| d.as_array())
        .into_iter()
        .flatten()
        .filter_map(|item| item.get("id").and_then(|id| id.as_str()))
        .filter(|id| looks_like_embedding_model(id))
        .map(ToString::to_string)
        .collect()
}

fn push_candidate(out: &mut Vec<String>, candidate: &str) {
    let candidate = candidate.trim();
    if candidate.is_empty() || out.iter().any(|m| m == candidate) {
        return;
    }
    out.push(candidate.to_string());
}

fn looks_like_embedding_model(model: &str) -> bool {
    let lower = model.to_ascii_lowercase();
    lower.contains("embed") || lower.contains("nomic") || lower.contains("bge")
}

async fn embed_texts_once(
    conn: &ConnectionRow,
    cfg: &HttpConfig,
    texts: &[String],
    model: &str,
) -> AppResult<Vec<Vec<f32>>> {
    let base = normalize_base(&conn.base_url);
    let url = format!("{base}/embeddings");

    let body = json!({
        "model": model,
        "input": texts,
    });

    let resp = apply_extra_headers(
        http(cfg)?.post(&url).bearer_auth(&conn.api_key).json(&body),
        conn,
    )
    .send()
    .await
    .map_err(|e| AppError::Network(format!("embeddings request to {url}: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let raw = resp.text().await.unwrap_or_default();
        return Err(AppError::Validation(format!(
            "embeddings {status} · {}",
            raw.chars().take(300).collect::<String>()
        )));
    }

    let parsed: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Network(format!("embeddings parse: {e}")))?;

    let Some(data) = parsed.get("data").and_then(|d| d.as_array()) else {
        return Err(AppError::Validation(
            "embeddings response missing data array".into(),
        ));
    };

    let has_index = data.iter().any(|item| item.get("index").is_some());

    if !has_index {
        if data.len() != texts.len() {
            return Err(AppError::Validation(format!(
                "embeddings count mismatch: got {} for {} inputs",
                data.len(),
                texts.len()
            )));
        }
        let mut out = Vec::with_capacity(texts.len());
        for item in data {
            out.push(parse_embedding_vector(item)?);
        }
        return Ok(out);
    }

    let mut indexed: Vec<Option<Vec<f32>>> = vec![None; texts.len()];
    for item in data {
        let idx = item
            .get("index")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| AppError::Validation("embedding item missing index".into()))?
            as usize;
        if idx >= indexed.len() {
            return Err(AppError::Validation(format!(
                "embeddings index {idx} out of range for {} inputs",
                texts.len()
            )));
        }
        indexed[idx] = Some(parse_embedding_vector(item)?);
    }

    let mut out = Vec::with_capacity(texts.len());
    for (i, slot) in indexed.into_iter().enumerate() {
        out.push(slot.ok_or_else(|| {
            AppError::Validation(format!("embeddings missing vector for input index {i}"))
        })?);
    }

    Ok(out)
}

fn parse_embedding_vector(item: &serde_json::Value) -> AppResult<Vec<f32>> {
    let emb = item
        .get("embedding")
        .and_then(|e| e.as_array())
        .ok_or_else(|| AppError::Validation("embedding item missing vector".into()))?;
    let vec: Vec<f32> = emb
        .iter()
        .filter_map(|v| v.as_f64().map(|n| n as f32))
        .collect();
    if vec.is_empty() {
        return Err(AppError::Validation("empty embedding vector".into()));
    }
    Ok(vec)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embed_model_uses_lmstudio_nomic_fallback() {
        assert_eq!(
            resolve_embed_model("qwen2.5"),
            "text-embedding-nomic-embed-text-v1.5"
        );
    }

    #[test]
    fn embed_model_keeps_explicit_embedding_model() {
        assert_eq!(resolve_embed_model("bge-m3"), "bge-m3");
    }
}
