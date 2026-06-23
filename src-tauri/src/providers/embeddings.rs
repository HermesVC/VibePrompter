//! OpenAI-compatible `/v1/embeddings` (LM Studio, Ollama, cloud).

use serde_json::json;

use super::{apply_extra_headers, http, normalize_base, HttpConfig};
use crate::storage::repositories::ConnectionRow;
use crate::utils::{AppError, AppResult};

const DEFAULT_EMBED_MODEL: &str = "nomic-embed-text";

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

    let model = model
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| resolve_embed_model(&conn.default_model));

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
    fn embed_model_uses_ollama_nomic_fallback() {
        assert_eq!(resolve_embed_model("qwen2.5"), "nomic-embed-text");
    }

    #[test]
    fn embed_model_keeps_explicit_embedding_model() {
        assert_eq!(resolve_embed_model("bge-m3"), "bge-m3");
    }
}
