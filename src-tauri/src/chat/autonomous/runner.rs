//! Outer orchestration loop — plan → execute → verify → replan.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::Serialize;

use crate::app::AppState;
use crate::chat::autonomous::config::AutonomousRunConfig;
use crate::chat::autonomous::plan::{
    parse_autonomous_plan, parse_step_result, AutonomousPlan, PlanStep, StepStatus,
};
use crate::chat::autonomous::prompts::{
    completion_user_message, execution_user_message, planning_user_message, replan_user_message,
    AUTONOMOUS_PROTOCOL,
};
use crate::workspace::{run_verify_spec, VerifyOutcome};
use crate::chat::{run_chat, ChatRunEventSink, ChatRunRequest, ChatRunStatus};
use crate::models::{ChatMessage, CompletionResult};
use crate::utils::AppError;

#[derive(Clone)]
pub struct AutonomousRunRequest {
    pub goal: String,
    pub base: ChatRunRequest,
    pub config: AutonomousRunConfig,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AutonomousPhase {
    Planning,
    Executing,
    Verifying,
    Replanning,
    Completing,
    Done,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutonomousStepRecord {
    pub step_id: u32,
    pub title: String,
    pub phase: AutonomousPhase,
    pub assistant_preview: String,
    pub verify_ok: Option<bool>,
    pub verify_message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutonomousRunResult {
    pub phase: AutonomousPhase,
    pub plan: Option<AutonomousPlan>,
    pub steps: Vec<AutonomousStepRecord>,
    pub final_text: String,
    pub replans_used: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutonomousPlanSnapshot {
    pub progress: String,
    pub steps: Vec<StepSnapshot>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepSnapshot {
    pub id: u32,
    pub title: String,
    pub status: StepStatus,
}

/// Extends chat streaming with autonomous orchestration events.
pub trait AutonomousRunEventSink: ChatRunEventSink {
    fn autonomous_plan(&mut self, snapshot: AutonomousPlanSnapshot);
    fn autonomous_phase(&mut self, phase: AutonomousPhase, detail: Option<String>);
}

struct SinkAdapter<'a, E: AutonomousRunEventSink + ?Sized> {
    inner: &'a mut E,
}

impl<E: AutonomousRunEventSink + ?Sized> ChatRunEventSink for SinkAdapter<'_, E> {
    fn status(&mut self, status: ChatRunStatus) {
        self.inner.status(status);
    }

    fn token(&mut self, generation: u32, delta: &str) {
        self.inner.token(generation, delta);
    }

    fn memory(&mut self, update: crate::chat::ChatRunMemoryUpdate) {
        self.inner.memory(update);
    }
}

pub async fn run_autonomous<E>(
    state: &AppState,
    request: AutonomousRunRequest,
    cancel_flag: Arc<AtomicBool>,
    events: &mut E,
) -> Result<AutonomousRunResult, AppError>
where
    E: AutonomousRunEventSink + Send,
{
    let config = request.config.clamped();
    let goal = request.goal.trim().to_string();
    if goal.is_empty() {
        return Err(AppError::Validation("goal is empty".into()));
    }

    let workspace_root = PathBuf::from(
        state
            .workspace
            .get_settings()
            .await?
            .workspace_root
            .trim(),
    );

    let mut messages = request.base.messages.clone();
    let mut session_summary = request.base.session_summary.clone();
    let mut records: Vec<AutonomousStepRecord> = Vec::new();
    let mut replans_used = 0u32;
    let mut steps_executed = 0usize;
    let mut final_text = String::new();

    let mut plan = if config.planning_enabled {
        events.autonomous_phase(
            AutonomousPhase::Planning,
            Some("Creating execution plan…".into()),
        );
        let planning_msg = wrap_with_protocol(&planning_user_message(&goal), Some(AUTONOMOUS_PROTOCOL));
        messages.push(ChatMessage {
            role: "user".into(),
            content: planning_msg,
            images: vec![],
        });
        let result = run_autonomous_turn(
            state,
            &request.base,
            &mut messages,
            &mut session_summary,
            &cancel_flag,
            events,
        )
        .await?;
        final_text = result.text.clone();
        parse_autonomous_plan(&result.text).ok_or_else(|| {
            AppError::Validation(
                "planning turn did not produce a valid <autonomous-plan>".into(),
            )
        })?
    } else {
        AutonomousPlan {
            steps: vec![PlanStep {
                id: 1,
                title: goal.clone(),
                status: StepStatus::Pending,
                verify: None,
                note: None,
            }],
        }
    };

    emit_plan_snapshot(events, &plan);

    loop {
        if cancel_flag.load(Ordering::SeqCst) {
            return Ok(cancelled_result(
                plan,
                records,
                final_text,
                replans_used,
            ));
        }

        if plan.all_done() {
            break;
        }

        if steps_executed >= config.max_steps {
            return Ok(failed_result(
                plan,
                records,
                final_text,
                replans_used,
                "max_steps exceeded",
            ));
        }

        let Some(step) = plan.next_pending().cloned() else {
            if plan.all_terminal() {
                break;
            }
            return Ok(failed_result(
                plan,
                records,
                final_text,
                replans_used,
                "no pending steps and plan not complete",
            ));
        };

        plan.mark(step.id, StepStatus::InProgress, None);
        emit_plan_snapshot(events, &plan);

        events.autonomous_phase(
            AutonomousPhase::Executing,
            Some(format!("Step {}: {}", step.id, step.title)),
        );

        let exec_msg = wrap_with_protocol(&execution_user_message(&plan, &step), Some(AUTONOMOUS_PROTOCOL));
        messages.push(ChatMessage {
            role: "user".into(),
            content: exec_msg,
            images: vec![],
        });

        let result = run_autonomous_turn(
            state,
            &request.base,
            &mut messages,
            &mut session_summary,
            &cancel_flag,
            events,
        )
        .await?;
        final_text = result.text.clone();
        steps_executed += 1;

        let step_status = parse_step_result(&result.text)
            .filter(|r| r.step_id == step.id)
            .map(|r| {
                if !r.summary.is_empty() {
                    plan.mark(step.id, r.status, Some(r.summary.clone()));
                }
                r.status
            })
            .unwrap_or(StepStatus::Done);

        let mut verify_ok = None;
        let mut verify_message = None;

        if config.verify_steps {
            if let Some(spec) = step.verify.as_ref() {
                events.autonomous_phase(
                    AutonomousPhase::Verifying,
                    Some(format!("Verifying step {}", step.id)),
                );
                match run_verify_spec(&workspace_root, spec).await {
                    Ok(outcome) => {
                        verify_ok = Some(outcome.ok);
                        verify_message = Some(outcome.message.clone());
                        if !outcome.ok && step_status != StepStatus::Failed {
                            plan.mark(
                                step.id,
                                StepStatus::Failed,
                                Some(outcome.message.clone()),
                            );
                            emit_plan_snapshot(events, &plan);
                            records.push(AutonomousStepRecord {
                                step_id: step.id,
                                title: step.title.clone(),
                                phase: AutonomousPhase::Verifying,
                                assistant_preview: preview(&result.text),
                                verify_ok,
                                verify_message,
                            });

                            if replans_used < config.max_replans as u32 {
                                replans_used += 1;
                                if try_replan(
                                    state,
                                    &request.base,
                                    &mut messages,
                                    &mut session_summary,
                                    &cancel_flag,
                                    events,
                                    &mut plan,
                                    &step,
                                    Some(&outcome),
                                    &mut final_text,
                                )
                                .await?
                                {
                                    emit_plan_snapshot(events, &plan);
                                    continue;
                                }
                            }
                            return Ok(failed_result(
                                plan,
                                records,
                                final_text,
                                replans_used,
                                "verification failed",
                            ));
                        }
                    }
                    Err(e) => {
                        verify_ok = Some(false);
                        verify_message = Some(e.to_string());
                    }
                }
            }
        }

        let terminal_status = if step_status == StepStatus::Failed {
            StepStatus::Failed
        } else if verify_ok == Some(false) {
            StepStatus::Failed
        } else {
            StepStatus::Done
        };

        plan.mark(step.id, terminal_status, None);
        emit_plan_snapshot(events, &plan);

        records.push(AutonomousStepRecord {
            step_id: step.id,
            title: step.title.clone(),
            phase: AutonomousPhase::Executing,
            assistant_preview: preview(&result.text),
            verify_ok,
            verify_message,
        });

        if terminal_status == StepStatus::Failed {
            if replans_used < config.max_replans as u32 {
                replans_used += 1;
                if try_replan(
                    state,
                    &request.base,
                    &mut messages,
                    &mut session_summary,
                    &cancel_flag,
                    events,
                    &mut plan,
                    &step,
                    None,
                    &mut final_text,
                )
                .await?
                {
                    emit_plan_snapshot(events, &plan);
                    continue;
                }
            }
            return Ok(failed_result(
                plan,
                records,
                final_text,
                replans_used,
                "step failed",
            ));
        }
    }

    events.autonomous_phase(AutonomousPhase::Completing, None);
    messages.push(ChatMessage {
        role: "user".into(),
        content: completion_user_message(&plan),
        images: vec![],
    });
    let completion = run_autonomous_turn(
        state,
        &request.base,
        &mut messages,
        &mut session_summary,
        &cancel_flag,
        events,
    )
    .await?;
    final_text = completion.text;

    events.autonomous_phase(AutonomousPhase::Done, None);
    Ok(AutonomousRunResult {
        phase: AutonomousPhase::Done,
        plan: Some(plan),
        steps: records,
        final_text,
        replans_used,
    })
}

async fn try_replan<E>(
    state: &AppState,
    base: &ChatRunRequest,
    messages: &mut Vec<ChatMessage>,
    session_summary: &mut Option<String>,
    cancel_flag: &Arc<AtomicBool>,
    events: &mut E,
    plan: &mut AutonomousPlan,
    failed_step: &PlanStep,
    verify: Option<&VerifyOutcome>,
    final_text: &mut String,
) -> Result<bool, AppError>
where
    E: AutonomousRunEventSink + Send,
{
    events.autonomous_phase(AutonomousPhase::Replanning, None);
    messages.push(ChatMessage {
        role: "user".into(),
        content: wrap_with_protocol(
            &replan_user_message(plan, failed_step, verify),
            Some(AUTONOMOUS_PROTOCOL),
        ),
        images: vec![],
    });
    let result = run_autonomous_turn(
        state,
        base,
        messages,
        session_summary,
        cancel_flag,
        events,
    )
    .await?;
    *final_text = result.text.clone();
    if let Some(updated) = parse_autonomous_plan(&result.text) {
        *plan = updated;
        Ok(true)
    } else {
        Ok(false)
    }
}

async fn run_autonomous_turn<E>(
    state: &AppState,
    base: &ChatRunRequest,
    messages: &mut Vec<ChatMessage>,
    session_summary: &mut Option<String>,
    cancel_flag: &Arc<AtomicBool>,
    events: &mut E,
) -> Result<CompletionResult, AppError>
where
    E: AutonomousRunEventSink + Send,
{
    let req = ChatRunRequest {
        messages: messages.clone(),
        mode_id: base.mode_id.clone(),
        connection_id: base.connection_id.clone(),
        chat_context: base.chat_context.clone(),
        session_summary: session_summary.clone(),
        session_id: base.session_id.clone(),
    };

    let mut adapter = SinkAdapter { inner: events };
    let result = run_chat(state, req, cancel_flag.clone(), &mut adapter).await?;

    messages.push(ChatMessage {
        role: "assistant".into(),
        content: result.text.clone(),
        images: vec![],
    });

    if let Some(summary) = result.session_summary.as_ref().filter(|s| !s.trim().is_empty()) {
        *session_summary = Some(summary.clone());
    }

    Ok(result)
}

fn wrap_with_protocol(user_content: &str, protocol: Option<&str>) -> String {
    match protocol {
        Some(p) => format!("{p}\n\n---\n\n{user_content}"),
        None => user_content.to_string(),
    }
}

fn emit_plan_snapshot<E: AutonomousRunEventSink + ?Sized>(
    events: &mut E,
    plan: &AutonomousPlan,
) {
    events.autonomous_plan(AutonomousPlanSnapshot {
        progress: plan.progress_label(),
        steps: plan
            .steps
            .iter()
            .map(|s| StepSnapshot {
                id: s.id,
                title: s.title.clone(),
                status: s.status,
            })
            .collect(),
    });
}

fn preview(text: &str) -> String {
    text.chars().take(400).collect()
}

fn cancelled_result(
    plan: AutonomousPlan,
    steps: Vec<AutonomousStepRecord>,
    final_text: String,
    replans_used: u32,
) -> AutonomousRunResult {
    AutonomousRunResult {
        phase: AutonomousPhase::Cancelled,
        plan: Some(plan),
        steps,
        final_text,
        replans_used,
    }
}

fn failed_result(
    plan: AutonomousPlan,
    steps: Vec<AutonomousStepRecord>,
    final_text: String,
    replans_used: u32,
    _reason: &str,
) -> AutonomousRunResult {
    AutonomousRunResult {
        phase: AutonomousPhase::Failed,
        plan: Some(plan),
        steps,
        final_text,
        replans_used,
    }
}
