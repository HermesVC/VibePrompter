-- Semantic memory chunks for chat sessions (embeddings stored as f32 BLOB).

CREATE TABLE IF NOT EXISTS chat_memory_chunks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT    NOT NULL,
    role         TEXT    NOT NULL,
    content      TEXT    NOT NULL,
    content_hash TEXT    NOT NULL,
    embedding    BLOB    NOT NULL,
    dims         INTEGER NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_memory_session ON chat_memory_chunks (session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_memory_session_hash
    ON chat_memory_chunks (session_id, content_hash);
