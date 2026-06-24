//! Chat session semantic memory (SQLite + embeddings).

use crate::storage::repositories::{MemoryChunkRow, MemoryRepo, NewMemoryChunk};
use crate::utils::AppResult;

#[derive(Clone)]
pub struct ChatMemoryService {
    repo: MemoryRepo,
}

impl ChatMemoryService {
    pub fn new(repo: MemoryRepo) -> Self {
        Self { repo }
    }

    pub async fn insert_chunk(
        &self,
        session_id: &str,
        role: &str,
        content: &str,
        content_hash: &str,
        embedding: &[f32],
    ) -> AppResult<()> {
        self.repo
            .insert_chunk(session_id, role, content, content_hash, embedding)
            .await
    }

    pub async fn list_chunks(&self, session_id: &str) -> AppResult<Vec<MemoryChunkRow>> {
        self.repo.list_session_chunks(session_id).await
    }

    pub async fn clear_session(&self, session_id: &str) -> AppResult<()> {
        self.repo.delete_session(session_id).await
    }

    pub async fn replace_session_chunks(
        &self,
        session_id: &str,
        chunks: &[NewMemoryChunk],
    ) -> AppResult<()> {
        self.repo.replace_session_chunks(session_id, chunks).await
    }

    pub async fn replace_session_role_chunks(
        &self,
        session_id: &str,
        role: &str,
        chunks: &[NewMemoryChunk],
    ) -> AppResult<()> {
        self.repo
            .replace_session_role_chunks(session_id, role, chunks)
            .await
    }

    pub async fn prune_session(&self, session_id: &str, keep_latest: i64) -> AppResult<()> {
        self.repo.prune_session(session_id, keep_latest).await
    }

    pub async fn list_content_hashes(&self, session_id: &str) -> AppResult<Vec<String>> {
        self.repo.list_content_hashes(session_id).await
    }

    pub async fn count_chunks(&self, session_id: &str) -> AppResult<i64> {
        self.repo.count_session_chunks(session_id).await
    }
}
