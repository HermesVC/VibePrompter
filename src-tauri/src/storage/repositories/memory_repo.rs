//! SQLite store for chat session embedding chunks.

use sqlx::SqlitePool;

use crate::utils::{AppError, AppResult};

#[derive(Debug, Clone)]
pub struct MemoryChunkRow {
    pub id: i64,
    pub session_id: String,
    pub role: String,
    pub content: String,
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
        let rows: Vec<(i64, String, String, String, Vec<u8>, i64)> = sqlx::query_as(
            "SELECT id, session_id, role, content, embedding, dims
             FROM chat_memory_chunks WHERE session_id = ?1 ORDER BY id ASC",
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(e))?;

        let mut out = Vec::with_capacity(rows.len());
        for (id, sid, role, content, blob, dims) in rows {
            let embedding = blob_to_embedding(&blob, dims as usize)?;
            out.push(MemoryChunkRow {
                id,
                session_id: sid,
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

    pub async fn chunk_count(&self, session_id: &str) -> AppResult<i64> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM chat_memory_chunks WHERE session_id = ?1",
        )
        .bind(session_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(e))?;
        Ok(row.0)
    }

    pub async fn list_content_hashes(&self, session_id: &str) -> AppResult<Vec<String>> {
        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT content_hash FROM chat_memory_chunks WHERE session_id = ?1",
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(e))?;
        Ok(rows.into_iter().map(|(h,)| h).collect())
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
