//! Persistence for user-owned provider connections.
//!
//! API keys are NOT stored here. They live in the OS keyring (see
//! `crate::security` / `services::connection_service`); the `api_key` column on
//! these rows is legacy and kept blank — it exists only so the one-shot startup
//! migration (`migrate_keys_to_keyring`) can read and clear any pre-keyring
//! plaintext values. This layer persists connection metadata only.

use sqlx::SqlitePool;

use crate::utils::{AppError, AppResult};

#[derive(Debug, Clone)]
pub struct ConnectionRow {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub base_url: String,
    pub api_key: String,
    pub default_model: String,
    pub is_default: bool,
    /// JSON-encoded `{ "Header-Name": "value", ... }`. Empty string when
    /// none configured. Parsed by the HTTP layer on each request.
    pub extra_headers: String,
    /// RFC3339 timestamp of the last successful call through this
    /// connection. Empty string = never used.
    pub last_used_at: String,
    /// Free-text notes attached to the connection (rate limit reminders,
    /// account ownership, etc.). Empty string when none.
    pub notes: String,
    /// Comma-separated free-text tags ("work,personal,gpt"). Empty string
    /// when untagged. Used by the Providers panel to group / filter the list.
    pub tags: String,
    /// USD per million input tokens. `0.0` means "use the embedded pricing
    /// table from services/pricing.rs" (falls back to that lookup, which
    /// may itself return 0 for unknown models). When non-zero, takes
    /// precedence over the embedded table for any run on this connection.
    pub price_input_per_m: f64,
    /// USD per million output tokens. Same fallback semantics as
    /// `price_input_per_m`.
    pub price_output_per_m: f64,
    /// Model context window in tokens. `0` = unset (hide usage ring).
    pub context_window_size: i64,
}

type RowTuple = (
    String,
    String,
    String,
    String,
    String,
    String,
    bool,
    String,
    String,
    String,
    String,
    f64,
    f64,
    i64,
);

const SELECT_COLS: &str = "id, label, kind, base_url, api_key, default_model, is_default, extra_headers, last_used_at, notes, tags, price_input_per_m, price_output_per_m, context_window_size";

fn row_from_tuple(
    (
        id,
        label,
        kind,
        base_url,
        api_key,
        default_model,
        is_default,
        extra_headers,
        last_used_at,
        notes,
        tags,
        price_input_per_m,
        price_output_per_m,
        context_window_size,
    ): RowTuple,
) -> ConnectionRow {
    ConnectionRow {
        id,
        label,
        kind,
        base_url,
        api_key,
        default_model,
        is_default,
        extra_headers,
        last_used_at,
        notes,
        tags,
        price_input_per_m,
        price_output_per_m,
        context_window_size,
    }
}

#[derive(Clone)]
pub struct ConnectionRepo {
    pool: SqlitePool,
}

impl ConnectionRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> AppResult<Vec<ConnectionRow>> {
        let rows: Vec<RowTuple> = sqlx::query_as(&format!(
            "SELECT {SELECT_COLS}
             FROM provider_connections
             ORDER BY is_default DESC, last_used_at DESC, created_at ASC"
        ))
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(row_from_tuple).collect())
    }

    pub async fn get(&self, id: &str) -> AppResult<ConnectionRow> {
        let row: Option<RowTuple> = sqlx::query_as(&format!(
            "SELECT {SELECT_COLS} FROM provider_connections WHERE id = ?1"
        ))
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        row.map(row_from_tuple)
            .ok_or_else(|| AppError::NotFound {
                entity: "provider_connection",
                id: id.to_string(),
            })
    }

    pub async fn upsert(&self, row: &ConnectionRow) -> AppResult<()> {
        upsert_row(&self.pool, row).await
    }

    /// Upsert a row AND clear `is_default` on every other row in a single
    /// transaction, preserving the single-default invariant even if the
    /// process crashes mid-flip (which would otherwise leave zero or two
    /// defaults). Use this instead of a bare `upsert` whenever
    /// `row.is_default` is true.
    pub async fn upsert_as_default(&self, row: &ConnectionRow) -> AppResult<()> {
        let mut tx = self.pool.begin().await?;
        upsert_row(&mut *tx, row).await?;
        sqlx::query("UPDATE provider_connections SET is_default = 0 WHERE id != ?1")
            .bind(&row.id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    /// Stamp the connection as used "now". Called after every successful
    /// completion so the providers list can sort by recency.
    pub async fn touch_last_used(&self, id: &str) -> AppResult<()> {
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query("UPDATE provider_connections SET last_used_at = ?1 WHERE id = ?2")
            .bind(&now)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM provider_connections WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn get_default(&self) -> AppResult<Option<ConnectionRow>> {
        let row: Option<RowTuple> = sqlx::query_as(&format!(
            "SELECT {SELECT_COLS}
             FROM provider_connections WHERE is_default = 1 LIMIT 1"
        ))
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(row_from_tuple))
    }
}

/// Shared upsert body, generic over a pool or transaction executor so the
/// same SQL backs both `upsert` and the transactional `upsert_as_default`.
///
/// Intentionally does NOT touch `last_used_at` — that's the job of
/// `touch_last_used()` after a successful completion. Editing a connection's
/// label shouldn't reset its recency.
async fn upsert_row<'e, E>(executor: E, row: &ConnectionRow) -> AppResult<()>
where
    E: sqlx::Executor<'e, Database = sqlx::Sqlite>,
{
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO provider_connections
           (id, label, kind, base_url, api_key, default_model, is_default,
            extra_headers, notes, tags, price_input_per_m, price_output_per_m,
            context_window_size, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)
         ON CONFLICT(id) DO UPDATE SET
           label = ?2, kind = ?3, base_url = ?4, api_key = ?5,
           default_model = ?6, is_default = ?7, extra_headers = ?8,
           notes = ?9, tags = ?10,
           price_input_per_m = ?11, price_output_per_m = ?12,
           context_window_size = ?13,
           updated_at = ?14",
    )
    .bind(&row.id)
    .bind(&row.label)
    .bind(&row.kind)
    .bind(&row.base_url)
    .bind(&row.api_key)
    .bind(&row.default_model)
    .bind(row.is_default)
    .bind(&row.extra_headers)
    .bind(&row.notes)
    .bind(&row.tags)
    .bind(row.price_input_per_m)
    .bind(row.price_output_per_m)
    .bind(row.context_window_size)
    .bind(now)
    .execute(executor)
    .await?;
    Ok(())
}
