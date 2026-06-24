//! Headless memory recall probe — same pipeline as chat + debug panel.

use std::collections::HashSet;
use std::sync::{
    atomic::AtomicBool,
    Arc,
};

use app_lib::app::probe::build_probe_state;
use app_lib::chat::{
    compress_evicted_turns, fallback_merge_memory, index_evicted_messages,
    plan_sliding_window_with_aggression, run_chat, ChatRunEventSink, ChatRunMemoryUpdate,
    ChatRunRequest, ChatRunStatus, WindowAggression,
};
use app_lib::models::ChatMessage;
use serde::Serialize;

const SECRET_CODE: &str = "VIBE-7749";
const FILLER_TURNS: usize = 550;

#[derive(Serialize)]
struct PhaseReport {
    memory_compressed: bool,
    evicted_turns: Option<u32>,
    vector_chunks_used: Option<u32>,
    vector_memory_compressed: bool,
    session_summary_chars: usize,
    retrieved_memory_chars: usize,
    retrieved_contains_secret: bool,
    summary_contains_secret: bool,
}

#[derive(Serialize)]
struct ProbeReport {
    session_id: String,
    secret_expected: String,
    context_limit: Option<i64>,
    phase1_evicted: u32,
    phase1: PhaseReport,
    phase2: PhaseReport,
    answer: String,
    /// Model answered with the secret code.
    answer_contains_secret: bool,
    /// Vector retrieval contributed chunks containing the secret (no rolling summary in phase 2).
    vector_recall_ok: bool,
    recall_ok: bool,
}

struct TraceSink {
    trace: Vec<serde_json::Value>,
}

impl ChatRunEventSink for TraceSink {
    fn status(&mut self, status: ChatRunStatus) {
        self.trace.push(serde_json::json!({ "type": "status", "status": status }));
    }

    fn token(&mut self, _generation: u32, _delta: &str) {}

    fn memory(&mut self, update: ChatRunMemoryUpdate) {
        self.trace.push(serde_json::json!({
            "type": "memory",
            "summaryChars": update.session_summary.chars().count(),
        }));
    }
}

fn filler_block(i: usize) -> (String, String) {
    let paragraph = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. \
        Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. \
        Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip. \
        Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.";
    (
        format!("Филлер #{i}: {paragraph} REST vs GraphQL. Не упоминай секретный код."),
        format!("Филлер-ответ #{i}: {paragraph} REST — HTTP, GraphQL — схема."),
    )
}

fn build_pressure_messages() -> Vec<ChatMessage> {
    let mut messages = vec![
        ChatMessage {
            role: "user".into(),
            content: format!(
                "DECISION: секретный код проекта — {SECRET_CODE}. Запомни этот код, он понадобится позже."
            ),
            images: vec![],
        },
        ChatMessage {
            role: "assistant".into(),
            content: format!("Принял. Секретный код проекта: {SECRET_CODE}."),
            images: vec![],
        },
    ];

    for i in 0..FILLER_TURNS {
        let (user, assistant) = filler_block(i);
        messages.push(ChatMessage {
            role: "user".into(),
            content: user,
            images: vec![],
        });
        messages.push(ChatMessage {
            role: "assistant".into(),
            content: assistant,
            images: vec![],
        });
    }

    messages
}

fn phase_report(result: &app_lib::models::CompletionResult) -> PhaseReport {
    let session_summary = result.session_summary.as_deref().unwrap_or("");
    let retrieved = result.retrieved_memory.as_deref().unwrap_or("");
    PhaseReport {
        memory_compressed: result.memory_compressed,
        evicted_turns: result.evicted_turns,
        vector_chunks_used: result.vector_chunks_used,
        vector_memory_compressed: result.vector_memory_compressed,
        session_summary_chars: session_summary.chars().count(),
        retrieved_memory_chars: retrieved.chars().count(),
        retrieved_contains_secret: retrieved.contains(SECRET_CODE),
        summary_contains_secret: session_summary.contains(SECRET_CODE),
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let state = build_probe_state().await?;
    let session_id = format!("memory-probe-{}", chrono::Utc::now().timestamp());
    let _ = state.chat_memory.clear_session(&session_id).await;

    let row = state
        .connections
        .get_default_row()
        .await?
        .ok_or_else(|| anyhow::anyhow!("no default connection configured"))?;
    let cfg = state.connections.http_config().await;
    let context_limit = {
        let configured = row.context_window_size;
        let fallback = if configured > 0 { configured } else { 8192 };
        if let Some(probed) =
            app_lib::providers::lmstudio::probe_context_length(&row.base_url, &cfg).await
        {
            if configured > 0 {
                probed.min(configured)
            } else {
                probed
            }
        } else {
            fallback
        }
    };

    println!("Memory probe session: {session_id}");
    println!("Context limit: {context_limit}");
    println!("Phase 1: simulate eviction + compress + vector index ({FILLER_TURNS} filler turns)…");

    let messages = build_pressure_messages();
    let plan = plan_sliding_window_with_aggression(
        messages,
        context_limit,
        "",
        1024,
        WindowAggression::Normal,
    );
    let evicted_count = plan.evicted.len() as u32;
    if plan.evicted.is_empty() {
        anyhow::bail!(
            "Phase 1: nothing evicted with {FILLER_TURNS} turns at limit {context_limit} — increase FILLER_TURNS"
        );
    }

    let rolling_memory = match compress_evicted_turns(&row, &cfg, "", &plan.evicted, context_limit).await
    {
        Ok(m) => m,
        Err(e) => {
            eprintln!("compress_evicted_turns failed ({e}), using fallback merge");
            fallback_merge_memory("", &plan.evicted, context_limit)
        }
    };

    let mut indexed_hashes: HashSet<String> = state
        .chat_memory
        .list_content_hashes(&session_id)
        .await?
        .into_iter()
        .collect();
    let vector_compressed = index_evicted_messages(
        &state.chat_memory,
        &row,
        &cfg,
        &session_id,
        &plan.evicted,
        &mut indexed_hashes,
    )
    .await;

    let phase1_report = PhaseReport {
        memory_compressed: true,
        evicted_turns: Some(evicted_count),
        vector_chunks_used: None,
        vector_memory_compressed: vector_compressed,
        session_summary_chars: rolling_memory.chars().count(),
        retrieved_memory_chars: 0,
        retrieved_contains_secret: false,
        summary_contains_secret: rolling_memory.contains(SECRET_CODE),
    };

    println!(
        "Phase 1 done: evicted={evicted_count} summary_chars={} secret_in_summary={}",
        phase1_report.session_summary_chars,
        phase1_report.summary_contains_secret
    );

    println!("Phase 2: vector recall only (no session_summary)…");

    let cancel = Arc::new(AtomicBool::new(false));
    let mut sink2 = TraceSink { trace: Vec::new() };
    let phase2 = run_chat(
        &state,
        ChatRunRequest {
            messages: vec![ChatMessage {
                role: "user".into(),
                content:
                    "Какой секретный код проекта мы зафиксировали в DECISION? Ответь только кодом."
                        .into(),
                images: vec![],
            }],
            mode_id: Some("chat-developer".into()),
            connection_id: None,
            chat_context: None,
            session_summary: None,
            session_id: Some(session_id.clone()),
            ..Default::default()
        },
        cancel,
        &mut sink2,
    )
    .await?;

    let answer = phase2.text.trim().to_string();
    let phase2_report = phase_report(&phase2);
    let answer_contains_secret = answer.contains(SECRET_CODE);
    let vector_recall_ok = phase2_report.vector_chunks_used.unwrap_or(0) > 0
        && phase2_report.retrieved_contains_secret
        && answer_contains_secret;
    let recall_ok = vector_recall_ok;

    let report = ProbeReport {
        session_id,
        secret_expected: SECRET_CODE.into(),
        context_limit: Some(context_limit),
        phase1_evicted: evicted_count,
        phase1: phase1_report,
        phase2: phase2_report,
        answer: answer.clone(),
        answer_contains_secret,
        vector_recall_ok,
        recall_ok,
    };

    println!("{}", serde_json::to_string_pretty(&report)?);

    if recall_ok {
        println!(
            "\nPASS: vector recall returned {SECRET_CODE} (chunks_used={})",
            phase2.vector_chunks_used.unwrap_or(0)
        );
        Ok(())
    } else {
        anyhow::bail!(
            "FAIL: vector recall — answer_secret={answer_contains_secret} \
             retrieved_secret={} chunks_used={} answer={answer}",
            phase2.retrieved_memory.as_deref().unwrap_or("").contains(SECRET_CODE),
            phase2.vector_chunks_used.unwrap_or(0)
        );
    }
}
