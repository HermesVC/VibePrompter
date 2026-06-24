//! Exclusive inference lock per local provider endpoint.
//!
//! LM Studio (and most local runtimes) JIT-load one model at a time when Auto-Evict
//! is on. Chat completions and `/embeddings` must not run concurrently against the
//! same origin or one request unloads the other's model mid-stream.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::{Mutex, OwnedSemaphorePermit, Semaphore};

/// Serializes chat + embed (and other inference) calls per provider origin.
#[derive(Clone, Default)]
pub struct InferenceGate {
    locks: Arc<Mutex<HashMap<String, Arc<Semaphore>>>>,
}

impl InferenceGate {
    /// Normalized origin key — strips trailing `/v1` so OpenAI-compat URLs share one lock.
    pub fn endpoint_key(base_url: &str) -> String {
        let mut s = base_url.trim().trim_end_matches('/').to_string();
        if s.to_ascii_lowercase().ends_with("/v1") {
            s.truncate(s.len() - 3);
            s = s.trim_end_matches('/').to_string();
        }
        s.to_ascii_lowercase()
    }

    /// Local inference servers swap models on concurrent JIT loads; cloud APIs do not.
    pub fn needs_exclusive_lock(base_url: &str) -> bool {
        if crate::providers::lmstudio::is_lm_studio_url(base_url) {
            return true;
        }
        let lower = base_url.to_ascii_lowercase();
        lower.contains("localhost")
            || lower.contains("127.0.0.1")
            || lower.contains("[::1]")
            || lower.contains("0.0.0.0")
    }

    /// Hold until no other inference call is using this endpoint. `None` for cloud APIs.
    pub async fn acquire(&self, base_url: &str) -> Option<OwnedSemaphorePermit> {
        if !Self::needs_exclusive_lock(base_url) {
            return None;
        }
        let key = Self::endpoint_key(base_url);
        let sem = {
            let mut map = self.locks.lock().await;
            map.entry(key)
                .or_insert_with(|| Arc::new(Semaphore::new(1)))
                .clone()
        };
        Some(
            sem.acquire_owned()
                .await
                .expect("inference gate semaphore closed"),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_key_strips_v1_suffix() {
        assert_eq!(
            InferenceGate::endpoint_key("http://localhost:1234/v1"),
            "http://localhost:1234"
        );
    }

    #[test]
    fn lm_studio_needs_lock() {
        assert!(InferenceGate::needs_exclusive_lock(
            "http://localhost:1234/v1"
        ));
    }

    #[test]
    fn openai_cloud_skips_lock() {
        assert!(!InferenceGate::needs_exclusive_lock(
            "https://api.openai.com/v1"
        ));
    }
}
