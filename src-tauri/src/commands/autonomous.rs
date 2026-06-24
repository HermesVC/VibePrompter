//! Autonomous multi-step run — Tauri IPC.

use serde::Deserialize;
use tauri::{AppHandle, Emitter, State};

use crate::app::AppState;
use crate::chat::{
    run_autonomous, AutonomousPhase, AutonomousPlanSnapshot, AutonomousRunConfig,
    AutonomousRunEventSink, AutonomousRunRequest, AutonomousRunResult, ChatRunEventSink,
    ChatRunMemoryUpdate, ChatRunRequest, ChatRunStatus,
};
use crate::models::ChatMessage;
use crate::utils::AppError;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutonomousRunStreamInput {
    pub stream_id: String,
    pub goal: String,
    pub messages: Vec<ChatMessage>,
    pub mode_id: Option<String>,
    pub connection_id: Option<String>,
    pub chat_context: Option<crate::workspace::ChatContextPayload>,
    pub session_summary: Option<String>,
    pub session_id: Option<String>,
    #[serde(default)]
    pub config: AutonomousRunConfig,
}

#[tauri::command]
pub async fn autonomous_run_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    input: AutonomousRunStreamInput,
) -> Result<AutonomousRunResult, AppError> {
    let stream_id = input.stream_id.clone();
    let token_event = format!("autonomous:{stream_id}:token");
    let done_event = format!("autonomous:{stream_id}:done");
    let err_event = format!("autonomous:{stream_id}:error");
    let status_event = format!("autonomous:{stream_id}:status");
    let memory_event = format!("autonomous:{stream_id}:memory");
    let plan_event = format!("autonomous:{stream_id}:plan");
    let phase_event = format!("autonomous:{stream_id}:phase");

    let registry = tauri::Manager::state::<crate::app::cancel::CancelRegistry>(&app);
    let cancel_flag = registry.register(&stream_id);

    struct TauriAutonomousEvents {
        app: AppHandle,
        token_event: String,
        status_event: String,
        memory_event: String,
        plan_event: String,
        phase_event: String,
    }

    impl ChatRunEventSink for TauriAutonomousEvents {
        fn status(&mut self, status: ChatRunStatus) {
            let _ = self.app.emit(&self.status_event, status);
        }

        fn token(&mut self, generation: u32, delta: &str) {
            let _ = self.app.emit(
                &self.token_event,
                serde_json::json!({ "generation": generation, "delta": delta }),
            );
        }

        fn memory(&mut self, update: ChatRunMemoryUpdate) {
            let _ = self.app.emit(&self.memory_event, update);
        }
    }

    impl AutonomousRunEventSink for TauriAutonomousEvents {
        fn autonomous_plan(&mut self, snapshot: AutonomousPlanSnapshot) {
            let _ = self.app.emit(&self.plan_event, snapshot);
        }

        fn autonomous_phase(&mut self, phase: AutonomousPhase, detail: Option<String>) {
            let _ = self.app.emit(
                &self.phase_event,
                serde_json::json!({ "phase": phase, "detail": detail }),
            );
        }
    }

    let mut events = TauriAutonomousEvents {
        app: app.clone(),
        token_event,
        status_event,
        memory_event,
        plan_event,
        phase_event,
    };

    let request = AutonomousRunRequest {
        goal: input.goal,
        base: ChatRunRequest {
            messages: input.messages,
            mode_id: input.mode_id,
            connection_id: input.connection_id,
            chat_context: input.chat_context,
            session_summary: input.session_summary,
            session_id: input.session_id,
            ..Default::default()
        },
        config: input.config,
    };

    let result = run_autonomous(&state, request, cancel_flag.clone(), &mut events).await;

    tauri::Manager::state::<crate::app::cancel::CancelRegistry>(&app).forget(&stream_id);

    match result {
        Ok(r) => {
            let _ = app.emit(&done_event, &r);
            Ok(r)
        }
        Err(e) => {
            let _ = app.emit(&err_event, e.to_string());
            Err(e)
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutonomousDebugRunInput {
    pub goal: String,
    pub messages: Vec<ChatMessage>,
    pub mode_id: Option<String>,
    pub connection_id: Option<String>,
    pub chat_context: Option<crate::workspace::ChatContextPayload>,
    pub session_summary: Option<String>,
    pub session_id: Option<String>,
    #[serde(default)]
    pub config: AutonomousRunConfig,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutonomousDebugRunOutput {
    pub trace: Vec<serde_json::Value>,
    pub result: Option<AutonomousRunResult>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn autonomous_debug_run(
    state: State<'_, AppState>,
    input: AutonomousDebugRunInput,
) -> Result<AutonomousDebugRunOutput, AppError> {
    struct TraceEvents {
        trace: Vec<serde_json::Value>,
    }

    impl ChatRunEventSink for TraceEvents {
        fn status(&mut self, status: ChatRunStatus) {
            self.trace
                .push(serde_json::json!({ "type": "status", "status": status }));
        }

        fn token(&mut self, generation: u32, delta: &str) {
            self.trace.push(serde_json::json!({
                "type": "token",
                "generation": generation,
                "chars": delta.chars().count(),
            }));
        }

        fn memory(&mut self, update: ChatRunMemoryUpdate) {
            self.trace.push(serde_json::json!({
                "type": "memory",
                "summaryChars": update.session_summary.chars().count(),
            }));
        }
    }

    impl AutonomousRunEventSink for TraceEvents {
        fn autonomous_plan(&mut self, snapshot: AutonomousPlanSnapshot) {
            self.trace
                .push(serde_json::json!({ "type": "plan", "snapshot": snapshot }));
        }

        fn autonomous_phase(&mut self, phase: AutonomousPhase, detail: Option<String>) {
            self.trace.push(serde_json::json!({
                "type": "phase",
                "phase": phase,
                "detail": detail,
            }));
        }
    }

    let mut events = TraceEvents { trace: Vec::new() };
    let cancel_flag = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));

    let request = AutonomousRunRequest {
        goal: input.goal,
        base: ChatRunRequest {
            messages: input.messages,
            mode_id: input.mode_id,
            connection_id: input.connection_id,
            chat_context: input.chat_context,
            session_summary: input.session_summary,
            session_id: input.session_id,
            ..Default::default()
        },
        config: input.config,
    };

    match run_autonomous(&state, request, cancel_flag, &mut events).await {
        Ok(result) => {
            events.trace.push(serde_json::json!({
                "type": "done",
                "phase": result.phase,
                "steps": result.steps.len(),
            }));
            Ok(AutonomousDebugRunOutput {
                trace: events.trace,
                result: Some(result),
                error: None,
            })
        }
        Err(e) => {
            let msg = e.to_string();
            events
                .trace
                .push(serde_json::json!({ "type": "error", "message": msg }));
            Ok(AutonomousDebugRunOutput {
                trace: events.trace,
                result: None,
                error: Some(msg),
            })
        }
    }
}
