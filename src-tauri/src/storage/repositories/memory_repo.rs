//! SQLite store for chat session embedding chunks.

use sqlx::SqlitePool;

use crate::utils::{AppError, AppResult};

#[derive(Debug, Clone)]
pub struct MemoryChunkRow {
    pub id: i64,
    pub role: String,
    pub content: String,
    pub embedding: Vec<f32>,
}

#[derive(Debug, Clone)]
pub struct NewMemoryChunk {
    pub role: String,
    pub content: String,
    pub content_hash: String,
    pub embedding: Vec<f32>,
}

#[derive(Clone)]
pub struct MemoryRepo {
    pool: SqlitePool,
}

impl MemoryRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn insert_chunk(
        &self,
        session_id: &str,
        role: &str,
        content: &str,
        content_hash: &str,
        embedding: &[f32],
    ) -> AppResult<()> {
        let blob = embedding_to_blob(embedding);
        sqlx::query(
            "INSERT OR IGNORE INTO chat_memory_chunks
             (session_id, role, content, content_hash, embedding, dims)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(session_id)
        .bind(role)
        .bind(content)
        .bind(content_hash)
        .bind(blob)
        .bind(embedding.len() as i64)
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(e))?;
        Ok(())
    }

    pub async fn list_session_chunks(&self, session_id: &str) -> AppResult<Vec<MemoryChunkRow>> {
        let rows: Vec<(i64, String, String, Vec<u8>, i64)> = sqlx::query_as(
            "SELECT id, role, content, embedding, dims
             FROM chat_memory_chunks WHERE session_id = ?1 ORDER BY id ASC",
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(e))?;

        let mut out = Vec::with_capacity(rows.len());
        for (id, role, content, blob, dims) in rows {
            let embedding = blob_to_embedding(&blob, dims as usize)?;
            out.push(MemoryChunkRow {
                id,
                role,
                content,
                embedding,
            });
        }
        Ok(out)
    }

    pub async fn delete_session(&self, session_id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM chat_memory_chunks WHERE session_id = ?1")
            .bind(session_id)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::Database(e))?;
        Ok(())
    }

    pub async fn replace_session_chunks(
        &self,
        session_id: &str,
        chunks: &[NewMemoryChunk],
    ) -> AppResult<()> {
        let mut tx = self.pool.begin().await.map_err(AppError::Database)?;
        sqlx::query("DELETE FROM chat_memory_chunks WHERE session_id = ?1")
            .bind(session_id)
            .execute(&mut *tx)
            .await
            .map_err(AppError::Database)?;

        for chunk in chunks {
            let blob = embedding_to_blob(&chunk.embedding);
            sqlx::query(
                "INSERT INTO chat_memory_chunks
                 (session_id, role, content, content_hash, embedding, dims)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .bind(session_id)
            .bind(&chunk.role)
            .bind(&chunk.content)
            .bind(&chunk.content_hash)
            .bind(blob)
            .bind(chunk.embedding.len() as i64)
            .execute(&mut *tx)
            .await
            .map_err(AppError::Database)?;
        }

        tx.commit().await.map_err(AppError::Database)?;
        Ok(())
    }

    pub async fn replace_session_role_chunks(
        &self,
        session_id: &str,
        role: &str,
        chunks: &[NewMemoryChunk],
    ) -> AppResult<()> {
        let mut tx = self.pool.begin().await.map_err(AppError::Database)?;
        sqlx::query("DELETE FROM chat_memory_chunks WHERE session_id = ?1 AND role = ?2")
            .bind(session_id)
            .bind(role)
            .execute(&mut *tx)
            .await
            .map_err(AppError::Database)?;

        for chunk in chunks {
            let blob = embedding_to_blob(&chunk.embedding);
            sqlx::query(
                "INSERT INTO chat_memory_chunks
                 (session_id, role, content, content_hash, embedding, dims)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .bind(session_id)
            .bind(&chunk.role)
            .bind(&chunk.content)
            .bind(&chunk.content_hash)
            .bind(blob)
            .bind(chunk.embedding.len() as i64)
            .execute(&mut *tx)
            .await
            .map_err(AppError::Database)?;
        }

        tx.commit().await.map_err(AppError::Database)?;
        Ok(())
    }

    pub async fn prune_session(&self, session_id: &str, keep_latest: i64) -> AppResult<()> {
        if keep_latest <= 0 {
            return self.delete_session(session_id).await;
        }
        sqlx::query(
            "DELETE FROM chat_memory_chunks
             WHERE session_id = ?1
               AND id NOT IN (
                   SELECT id FROM chat_memory_chunks
                   WHERE session_id = ?2
                   ORDER BY id DESC
                   LIMIT ?3
               )",
        )
        .bind(session_id)
        .bind(session_id)
        .bind(keep_latest)
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(e))?;
        Ok(())
    }

    pub async fn list_content_hashes(&self, session_id: &str) -> AppResult<Vec<String>> {
        let rows: Vec<(String,)> =
            sqlx::query_as("SELECT content_hash FROM chat_memory_chunks WHERE session_id = ?1")
                .bind(session_id)
                .fetch_all(&self.pool)
                .await
                .map_err(|e| AppError::Database(e))?;
        Ok(rows.into_iter().map(|(h,)| h).collect())
    }

    pub async fn count_session_chunks(&self, session_id: &str) -> AppResult<i64> {
        let row: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM chat_memory_chunks WHERE session_id = ?1")
                .bind(session_id)
                .fetch_one(&self.pool)
                .await
                .map_err(|e| AppError::Database(e))?;
        Ok(row.0)
    }
}

fn embedding_to_blob(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|f| f.to_le_bytes()).collect()
}

fn blob_to_embedding(blob: &[u8], dims: usize) -> AppResult<Vec<f32>> {
    if dims == 0 || blob.len() != dims * 4 {
        return Err(AppError::Validation(
            "invalid embedding blob in chat_memory_chunks".into(),
        ));
    }
    Ok(blob
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect())
}

pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0f32;
    let mut na = 0.0f32;
    let mut nb = 0.0f32;
    for (x, y) in a.iter().zip(b.iter()) {
        dot += x * y;
        na += x * x;
        nb += y * y;
    }
    if na <= 0.0 || nb <= 0.0 {
        return 0.0;
    }
    dot / (na.sqrt() * nb.sqrt())
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn repo() -> MemoryRepo {
        MemoryRepo::new(crate::storage::pool::test_pool().await)
    }

    #[tokio::test]
    async fn replace_session_chunks_swaps_only_target_session() {
        let repo = repo().await;
        repo.insert_chunk("s1", "user", "old", "old-hash", &[1.0, 0.0])
            .await
            .unwrap();
        repo.insert_chunk("other", "user", "keep", "other-hash", &[0.0, 1.0])
            .await
            .unwrap();

        repo.replace_session_chunks(
            "s1",
            &[
                NewMemoryChunk {
                    role: "compressed".into(),
                    content: "new-a".into(),
                    content_hash: "new-a-hash".into(),
                    embedding: vec![0.5, 0.5],
                },
                NewMemoryChunk {
                    role: "compressed".into(),
                    content: "new-b".into(),
                    content_hash: "new-b-hash".into(),
                    embedding: vec![0.25, 0.75],
                },
            ],
        )
        .await
        .unwrap();

        let s1 = repo.list_session_chunks("s1").await.unwrap();
        assert_eq!(s1.len(), 2);
        assert!(s1.iter().all(|row| row.role == "compressed"));
        assert_eq!(
            s1.iter()
                .map(|row| row.content.as_str())
                .collect::<Vec<_>>(),
            vec!["new-a", "new-b"]
        );

        let other = repo.list_session_chunks("other").await.unwrap();
        assert_eq!(other.len(), 1);
        assert_eq!(other[0].content, "keep");
    }

    #[tokio::test]
    async fn replace_session_chunks_rolls_back_on_insert_failure() {
        let repo = repo().await;
        repo.insert_chunk("s1", "user", "old", "old-hash", &[1.0, 0.0])
            .await
            .unwrap();

        let err = repo
            .replace_session_chunks(
                "s1",
                &[
                    NewMemoryChunk {
                        role: "compressed".into(),
                        content: "new-a".into(),
                        content_hash: "dup-hash".into(),
                        embedding: vec![0.5, 0.5],
                    },
                    NewMemoryChunk {
                        role: "compressed".into(),
                        content: "new-b".into(),
                        content_hash: "dup-hash".into(),
                        embedding: vec![0.25, 0.75],
                    },
                ],
            )
            .await;

        assert!(err.is_err());
        let s1 = repo.list_session_chunks("s1").await.unwrap();
        assert_eq!(s1.len(), 1);
        assert_eq!(s1[0].content, "old");
    }

    #[tokio::test]
    async fn replace_session_role_chunks_preserves_other_roles_and_replaces_target_role() {
        let repo = repo().await;
        repo.insert_chunk("s1", "plan-canonical", "old plan", "old-plan", &[1.0])
            .await
            .unwrap();
        repo.insert_chunk("s1", "decision", "keep decision", "decision", &[1.0])
            .await
            .unwrap();

        repo.replace_session_role_chunks(
            "s1",
            "plan-canonical",
            &[NewMemoryChunk {
                role: "plan-canonical".into(),
                content: "new plan".into(),
                content_hash: "new-plan".into(),
                embedding: vec![0.5],
            }],
        )
        .await
        .unwrap();

        let chunks = repo.list_session_chunks("s1").await.unwrap();
        assert_eq!(chunks.len(), 2);
        assert!(chunks
            .iter()
            .any(|row| row.role == "plan-canonical" && row.content == "new plan"));
        assert!(chunks
            .iter()
            .any(|row| row.role == "decision" && row.content == "keep decision"));
    }

    #[tokio::test]
    async fn duplicate_hash_is_idempotent_per_session_but_not_global() {
        let repo = repo().await;
        repo.insert_chunk("s1", "user", "first", "same-hash", &[1.0, 0.0])
            .await
            .unwrap();
        repo.insert_chunk("s1", "user", "duplicate ignored", "same-hash", &[0.0, 1.0])
            .await
            .unwrap();
        repo.insert_chunk(
            "s2",
            "user",
            "same hash other session",
            "same-hash",
            &[0.0, 1.0],
        )
        .await
        .unwrap();

        let s1 = repo.list_session_chunks("s1").await.unwrap();
        let s2 = repo.list_session_chunks("s2").await.unwrap();

        assert_eq!(s1.len(), 1);
        assert_eq!(s1[0].content, "first");
        assert_eq!(s2.len(), 1);
    }

    #[tokio::test]
    async fn prune_keeps_latest_rows_only_within_target_session() {
        let repo = repo().await;
        for i in 0..5 {
            repo.insert_chunk("s1", "user", &format!("old-{i}"), &format!("h-{i}"), &[1.0])
                .await
                .unwrap();
        }
        repo.insert_chunk("other", "user", "keep", "other-hash", &[1.0])
            .await
            .unwrap();

        repo.prune_session("s1", 2).await.unwrap();

        let s1 = repo.list_session_chunks("s1").await.unwrap();
        let other = repo.list_session_chunks("other").await.unwrap();
        assert_eq!(
            s1.iter()
                .map(|row| row.content.as_str())
                .collect::<Vec<_>>(),
            vec!["old-3", "old-4"]
        );
        assert_eq!(other.len(), 1);
    }

    #[tokio::test]
    async fn list_session_chunks_rejects_corrupt_embedding_blob() {
        let repo = repo().await;
        sqlx::query(
            "INSERT INTO chat_memory_chunks
             (session_id, role, content, content_hash, embedding, dims)
             VALUES ('s1', 'user', 'bad', 'bad-hash', x'000000', 2)",
        )
        .execute(&repo.pool)
        .await
        .unwrap();

        let err = repo.list_session_chunks("s1").await.unwrap_err();
        assert!(err.to_string().contains("invalid embedding blob"));
    }
}
