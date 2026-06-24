//! Outer orchestration loop — plan → execute → verify → replan.

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::Serialize;

use crate::app::AppState;
use crate::chat::autonomous::config::AutonomousRunConfig;
use crate::chat::autonomous::plan::{
    best_autonomous_plan_from_texts, format_plan_for_prompt, merge_replanned_plan,
    normalize_plan_for_goal, parse_all_step_results, parse_autonomous_plan, parse_step_result,
    synthesize_plan_from_goal, AutonomousPlan, PlanStep, StepStatus,
};
use crate::chat::autonomous::prompts::{
    completion_user_message, execution_user_message, planning_retry_user_message,
    planning_user_message, replan_user_message, AUTONOMOUS_PROTOCOL,
};
use crate::chat::{
    extract_context_artifacts_from_text, index_context_artifacts, index_plan_step_summary,
    is_step_retriable_error, run_chat, upsert_plan_canonical_from_plan_markdown, ChatRunEventSink,
    ChatRunMemoryUpdate, ChatRunRequest, ChatRunStatus, DegradeLevel,
};
use crate::models::{ChatMessage, CompletionResult, MemoryDiagnostics};
use crate::utils::AppError;
use crate::workspace::{
    plan_memory, run_verify_spec, spec_memory, VerifyOutcome,
};

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub memory_diagnostics: Option<MemoryDiagnostics>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vector_chunks_used: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retrieved_memory: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutonomousPlanSnapshot {
    pub progress: String,
    pub current_step_id: Option<u32>,
    pub steps: Vec<StepSnapshot>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub planning_warning: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spec_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub step_warning: Option<String>,
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

    let workspace_root = PathBuf::from(state.workspace.get_settings().await?.workspace_root.trim());

    let mut messages = request.base.messages.clone();
    let mut session_summary = request.base.session_summary.clone();
    let mut records: Vec<AutonomousStepRecord> = Vec::new();
    let mut replans_used = 0u32;
    let mut steps_executed = 0usize;
    let mut final_text = String::new();
    let mut spec_path: Option<String> = None;
    let mut spec_step_id: Option<u32> = None;
    let mut step_warning: Option<String> = None;
    let mut last_memory_diagnostics: Option<MemoryDiagnostics> = None;
    let mut last_vector_chunks: Option<u32> = None;
    let mut last_retrieved_memory: Option<String> = None;

    let session_id = request
        .base
        .session_id
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_string();
    let mut indexed_chunk_hashes = load_session_chunk_hashes(state, &session_id).await;

    let mut planning_warning: Option<String> = None;

    let mut plan = if config.planning_enabled {
        events.autonomous_phase(
            AutonomousPhase::Planning,
            Some("Creating execution plan…".into()),
        );
        let planning_msg =
            wrap_with_protocol(&planning_user_message(&goal), Some(AUTONOMOUS_PROTOCOL));
        messages.push(ChatMessage {
            role: "user".into(),
            content: planning_msg,
            images: vec![],
        });
        let (plan, warning) = run_planning_turn(
            state,
            &request.base,
            &config,
            &goal,
            &mut messages,
            &mut session_summary,
            &cancel_flag,
            events,
            &mut final_text,
        )
        .await?;
        planning_warning = warning;
        plan
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

    emit_plan_snapshot(
        events,
        &plan,
        planning_warning.as_deref(),
        spec_path.as_deref(),
        step_warning.as_deref(),
    );

    loop {
        if cancel_flag.load(Ordering::SeqCst) {
            return Ok(cancelled_result(plan, records, final_text, replans_used));
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
        step_warning = None;
        emit_plan_snapshot(
            events,
            &plan,
            None,
            spec_path.as_deref(),
            None,
        );

        events.autonomous_phase(
            AutonomousPhase::Executing,
            Some(format!("Step {}: {}", step.id, step.title)),
        );

        let exec_msg = wrap_with_protocol(
            &execution_user_message(&plan, &step, spec_path.as_deref()),
            Some(AUTONOMOUS_PROTOCOL),
        );
        messages.push(ChatMessage {
            role: "user".into(),
            content: exec_msg,
            images: vec![],
        });

        let retrieval_query = spec_path.as_ref().map(|spec| {
            format!(
                "Goal: {goal}\nStep {}: {}\nSpec: {spec}",
                step.id, step.title
            )
        });

        let result = run_autonomous_turn_with_retry(
            state,
            &request.base,
            &config,
            &goal,
            Some(&plan),
            &mut messages,
            &mut session_summary,
            &cancel_flag,
            events,
            retrieval_query,
        )
        .await?;
        final_text = result.text.clone();
        steps_executed += 1;

        commit_autonomous_turn_memory(
            state,
            &request.base,
            &session_id,
            &result,
            &mut indexed_chunk_hashes,
        )
        .await;
        emit_turn_memory_diagnostics(events, &result);

        if let Some(detected) =
            spec_memory::detect_spec_path_from_turn(&result.text, spec_path.as_deref())
        {
            if spec_path.is_none() {
                spec_step_id = Some(step.id);
            }
            spec_path = Some(detected);
        }

        if should_require_spec_compliance(spec_path.as_deref(), spec_step_id, step.id)
            && spec_memory::extract_spec_compliance(&result.text).is_none()
        {
            step_warning = Some(format!(
                "Шаг {}: нет блока <spec-compliance> — сверка с ТЗ не зафиксирована.",
                step.id
            ));
        }

        last_memory_diagnostics = result.memory_diagnostics.clone();
        last_vector_chunks = result.vector_chunks_used;
        last_retrieved_memory = result.retrieved_memory.clone();

        for r in parse_all_step_results(&result.text) {
            if r.step_id != step.id {
                tracing::warn!(
                    "step-result for step {} while executing step {} — model may be ahead of orchestrator",
                    r.step_id,
                    step.id
                );
                continue;
            }
            plan.mark(
                r.step_id,
                r.status,
                (!r.summary.is_empty()).then_some(r.summary.clone()),
            );
        }
        emit_plan_snapshot(
            events,
            &plan,
            None,
            spec_path.as_deref(),
            step_warning.as_deref(),
        );

        let step_status = resolve_step_status(&result.text, step.id);

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
                            plan.mark(step.id, StepStatus::Failed, Some(outcome.message.clone()));
                            emit_plan_snapshot(
            events,
            &plan,
            None,
            spec_path.as_deref(),
            step_warning.as_deref(),
        );
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
                                    &config,
                                    &goal,
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
                                    emit_plan_snapshot(
            events,
            &plan,
            None,
            spec_path.as_deref(),
            step_warning.as_deref(),
        );
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
        } else if tool_results_indicate_failure(&result.text) {
            StepStatus::Failed
        } else if verify_ok == Some(false) {
            StepStatus::Failed
        } else {
            StepStatus::Done
        };

        plan.mark(step.id, terminal_status, None);
        emit_plan_snapshot(
            events,
            &plan,
            None,
            spec_path.as_deref(),
            step_warning.as_deref(),
        );

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
                    &config,
                    &goal,
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
                    emit_plan_snapshot(
            events,
            &plan,
            None,
            spec_path.as_deref(),
            step_warning.as_deref(),
        );
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
    let completion = run_autonomous_turn_with_retry(
        state,
        &request.base,
        &config,
        &goal,
        Some(&plan),
        &mut messages,
        &mut session_summary,
        &cancel_flag,
        events,
        spec_path.as_ref().map(|spec| format!("Goal: {goal}\nFinal report\nSpec: {spec}")),
    )
    .await?;
    final_text = completion.text.clone();
    commit_autonomous_turn_memory(
        state,
        &request.base,
        &session_id,
        &completion,
        &mut indexed_chunk_hashes,
    )
    .await;
    emit_turn_memory_diagnostics(events, &completion);
    last_memory_diagnostics = completion.memory_diagnostics.clone();
    last_vector_chunks = completion.vector_chunks_used;
    last_retrieved_memory = completion.retrieved_memory.clone();

    events.autonomous_phase(AutonomousPhase::Done, None);
    Ok(AutonomousRunResult {
        phase: AutonomousPhase::Done,
        plan: Some(plan),
        steps: records,
        final_text,
        replans_used,
        memory_diagnostics: last_memory_diagnostics,
        vector_chunks_used: last_vector_chunks,
        retrieved_memory: last_retrieved_memory,
    })
}

async fn try_replan<E>(
    state: &AppState,
    base: &ChatRunRequest,
    config: &AutonomousRunConfig,
    goal: &str,
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
    let result = run_autonomous_turn_with_retry(
        state,
        base,
        config,
        goal,
        Some(plan),
        messages,
        session_summary,
        cancel_flag,
        events,
        None,
    )
    .await?;
    *final_text = result.text.clone();
    if let Some(updated) = parse_autonomous_plan(&result.text) {
        *plan = merge_replanned_plan(plan, updated, failed_step.id);
        tracing::info!(
            "replan merged: {} steps (kept completed through step {})",
            plan.steps.len(),
            failed_step.id.saturating_sub(1)
        );
        Ok(true)
    } else {
        Ok(false)
    }
}

async fn run_planning_turn<E>(
    state: &AppState,
    base: &ChatRunRequest,
    config: &AutonomousRunConfig,
    goal: &str,
    messages: &mut Vec<ChatMessage>,
    session_summary: &mut Option<String>,
    cancel_flag: &Arc<AtomicBool>,
    events: &mut E,
    final_text: &mut String,
) -> Result<(AutonomousPlan, Option<String>), AppError>
where
    E: AutonomousRunEventSink + Send,
{
    let result = run_autonomous_turn_with_retry(
        state,
        base,
        config,
        goal,
        None,
        messages,
        session_summary,
        cancel_flag,
        events,
        None,
    )
    .await?;
    *final_text = result.text.clone();

    if let Some(plan) = best_autonomous_plan_from_texts(&[&result.text]) {
        if plan.steps.len() >= 2 {
            return Ok((plan, None));
        }
    }

    tracing::warn!("planning: need multi-step plan, retrying with stricter prompt");
    messages.push(ChatMessage {
        role: "user".into(),
        content: wrap_with_protocol(
            &planning_retry_user_message(goal),
            Some(AUTONOMOUS_PROTOCOL),
        ),
        images: vec![],
    });
    let result2 = run_autonomous_turn_with_retry(
        state,
        base,
        config,
        goal,
        None,
        messages,
        session_summary,
        cancel_flag,
        events,
        None,
    )
    .await?;
    *final_text = result2.text.clone();

    if let Some(plan) = best_autonomous_plan_from_texts(&[&result.text, &result2.text]) {
        let normalized = normalize_plan_for_goal(plan, goal);
        let warning = if normalized.steps.len() < 2 {
            Some("План схлопнут до шаблона — проверьте разбиение.".into())
        } else if parse_autonomous_plan(&result2.text)
            .map(|p| p.steps.len())
            .unwrap_or(0)
            < 2
        {
            Some("Использован синтезированный многшаговый план (модель вернула < 2 шагов).".into())
        } else {
            None
        };
        return Ok((normalized, warning));
    }

    let hinted = count_plan_tag_blocks(&result.text).max(count_plan_tag_blocks(&result2.text));
    tracing::warn!(
        "planning: synthesizing default plan (saw {hinted} autonomous-plan block(s))"
    );
    let warning = Some(if hinted > 0 {
        format!(
            "Не удалось разобрать план ({hinted} блок(ов)) — используем шаблон из 4 шагов."
        )
    } else {
        "Модель не вернула <autonomous-plan> — используем шаблон из 4 шагов.".into()
    });
    Ok((synthesize_plan_from_goal(goal), warning))
}

fn count_plan_tag_blocks(text: &str) -> usize {
    let lower = text.to_ascii_lowercase();
    let open = format!("<{}>", super::plan::PLAN_TAG);
    lower.matches(&open).count()
}

async fn run_autonomous_turn_with_retry<E>(
    state: &AppState,
    base: &ChatRunRequest,
    config: &AutonomousRunConfig,
    goal: &str,
    plan: Option<&AutonomousPlan>,
    messages: &mut Vec<ChatMessage>,
    session_summary: &mut Option<String>,
    cancel_flag: &Arc<AtomicBool>,
    events: &mut E,
    retrieval_query_override: Option<String>,
) -> Result<CompletionResult, AppError>
where
    E: AutonomousRunEventSink + Send,
{
    let anchor = build_degrade_anchor(goal, plan);
    let max_retries = config.max_step_retries;
    let mut last_err: Option<AppError> = None;

    for attempt in 0..=max_retries {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err(AppError::Validation("cancelled".into()));
        }
        if attempt > 0 {
            events.autonomous_phase(
                AutonomousPhase::Executing,
                Some(format!(
                    "Step retry {attempt}/{max_retries} (anchor context)…"
                )),
            );
            tracing::warn!("autonomous turn outer retry {attempt}/{max_retries}");
        }

        let msg_len: usize = messages.iter().map(|m| m.content.len()).sum();
        let execution_turn = plan.is_some();
        let degrade_start = if attempt > 0 {
            Some(DegradeLevel::Anchor.as_u8())
        } else if execution_turn {
            Some(if msg_len > 24_000 {
                DegradeLevel::ToolSummaryOnly.as_u8()
            } else if messages.len() > 8 || msg_len > 12_000 {
                DegradeLevel::Aggressive.as_u8()
            } else {
                DegradeLevel::Normal.as_u8()
            })
        } else {
            None
        };

        let req = ChatRunRequest {
            messages: messages.clone(),
            mode_id: base.mode_id.clone(),
            connection_id: base.connection_id.clone(),
            chat_context: base.chat_context.clone(),
            session_summary: session_summary.clone(),
            session_id: base.session_id.clone(),
            degrade_anchor: if execution_turn || attempt > 0 {
                Some(anchor.clone())
            } else {
                None
            },
            degrade_start,
            force_context_limit: base.force_context_limit,
            disable_rolling_memory: base.disable_rolling_memory,
            disable_vector_retrieval: base.disable_vector_retrieval || attempt > 0 || msg_len > 20_000,
            retrieval_query_override: if attempt == 0 {
                retrieval_query_override.clone()
            } else {
                None
            },
        };

        let mut adapter = SinkAdapter { inner: events };
        match run_chat(state, req, cancel_flag.clone(), &mut adapter).await {
            Ok(result) => {
                messages.push(ChatMessage {
                    role: "assistant".into(),
                    content: result.text.clone(),
                    images: vec![],
                });
                if let Some(summary) = result
                    .session_summary
                    .as_ref()
                    .filter(|s| !s.trim().is_empty())
                {
                    *session_summary = Some(summary.clone());
                }
                return Ok(result);
            }
            Err(e) if attempt < max_retries && is_step_retriable_error(&e) => {
                tracing::warn!("autonomous turn failed (retriable): {e}");
                last_err = Some(e);
            }
            Err(e) => return Err(e),
        }
    }

    Err(last_err
        .unwrap_or_else(|| AppError::Validation("autonomous turn failed after retries".into())))
}

fn build_degrade_anchor(goal: &str, plan: Option<&AutonomousPlan>) -> String {
    match plan {
        Some(p) => format!("Goal: {goal}\n\n{}", format_plan_for_prompt(p)),
        None => format!("Goal: {goal}"),
    }
}

fn wrap_with_protocol(user_content: &str, protocol: Option<&str>) -> String {
    match protocol {
        Some(p) => format!("{p}\n\n---\n\n{user_content}"),
        None => user_content.to_string(),
    }
}

fn current_step_id(plan: &AutonomousPlan) -> Option<u32> {
    plan.steps
        .iter()
        .find(|s| s.status == StepStatus::InProgress)
        .map(|s| s.id)
        .or_else(|| plan.next_pending().map(|s| s.id))
}

fn emit_plan_snapshot<E: AutonomousRunEventSink + ?Sized>(
    events: &mut E,
    plan: &AutonomousPlan,
    planning_warning: Option<&str>,
    spec_path: Option<&str>,
    step_warning: Option<&str>,
) {
    events.autonomous_plan(AutonomousPlanSnapshot {
        progress: plan.progress_label(),
        current_step_id: current_step_id(plan),
        steps: plan
            .steps
            .iter()
            .map(|s| StepSnapshot {
                id: s.id,
                title: s.title.clone(),
                status: s.status,
            })
            .collect(),
        planning_warning: planning_warning.map(str::to_string),
        spec_path: spec_path.map(str::to_string),
        step_warning: step_warning.map(str::to_string),
    });
}

/// Resolve step outcome: explicit tag, tool errors, or inferred file output.
fn resolve_step_status(text: &str, executing_step_id: u32) -> StepStatus {
    if let Some(r) = parse_all_step_results(text)
        .into_iter()
        .rev()
        .find(|r| r.step_id == executing_step_id)
    {
        return r.status;
    }

    if tool_results_indicate_failure(text) {
        return StepStatus::Failed;
    }

    if assistant_produced_files(text) || tool_results_indicate_successful_write(text) {
        tracing::info!(
            "step {executing_step_id}: inferred done from file output (no step-result tag)"
        );
        return StepStatus::Done;
    }

    if let Some(wrong) = parse_step_result(text) {
        tracing::warn!(
            "missing step-result for step {executing_step_id}; got step {}",
            wrong.step_id
        );
    }
    StepStatus::Failed
}

fn assistant_produced_files(text: &str) -> bool {
    crate::app::harness::extract_generated_file_fences(text)
        .iter()
        .any(|(_, content)| content.trim().len() > 20)
}

fn tool_results_indicate_successful_write(text: &str) -> bool {
    text.split("[Tool result:").skip(1).any(|chunk| {
        if !chunk.contains("write_file") {
            return false;
        }
        let head: String = chunk.lines().take(10).collect::<Vec<_>>().join("\n");
        !head.contains("\"ok\": false")
            && !head.contains("\"ok\":false")
            && !head.contains("ERROR:")
    })
}

fn preview(text: &str) -> String {
    text.chars().take(400).collect()
}

/// Assistant turn included at least one failed tool execution (header only — not file body).
fn tool_results_indicate_failure(text: &str) -> bool {
    text.split("[Tool result:").skip(1).any(|chunk| {
        let head: String = chunk.lines().take(10).collect::<Vec<_>>().join("\n");
        head.contains("\"ok\": false")
            || head.contains("\"ok\":false")
            || head.lines().any(|l| l.trim_start().starts_with("ERROR:"))
    })
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
        memory_diagnostics: None,
        vector_chunks_used: None,
        retrieved_memory: None,
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
        memory_diagnostics: None,
        vector_chunks_used: None,
        retrieved_memory: None,
    }
}

fn should_require_spec_compliance(
    spec_path: Option<&str>,
    spec_step_id: Option<u32>,
    current_step_id: u32,
) -> bool {
    spec_path.is_some()
        && spec_step_id
            .map(|id| current_step_id > id)
            .unwrap_or(current_step_id > 1)
}

async fn load_session_chunk_hashes(state: &AppState, session_id: &str) -> HashSet<String> {
    if session_id.trim().is_empty() {
        return HashSet::new();
    }
    match state.chat_memory.list_content_hashes(session_id).await {
        Ok(hashes) => hashes.into_iter().collect(),
        Err(e) => {
            tracing::warn!("autonomous: vector hashes unavailable: {e}");
            HashSet::new()
        }
    }
}

async fn commit_autonomous_turn_memory(
    state: &AppState,
    base: &ChatRunRequest,
    session_id: &str,
    result: &CompletionResult,
    indexed_hashes: &mut HashSet<String>,
) {
    if session_id.trim().is_empty() {
        return;
    }
    let Ok(row) = resolve_autonomous_connection(state, base).await else {
        return;
    };
    let cfg = state.connections.http_config().await;

    let artifacts: Vec<(String, String)> = extract_context_artifacts_from_text(&result.text);
    if !artifacts.is_empty() {
        index_context_artifacts(
            &state.chat_memory,
            &state.connections,
            &row,
            &cfg,
            session_id,
            &artifacts,
            indexed_hashes,
        )
        .await;
        for (path, content) in &artifacts {
            if plan_memory::is_plan_markdown_path(path) {
                upsert_plan_canonical_from_plan_markdown(
                    &state.chat_memory,
                    &state.connections,
                    &row,
                    &cfg,
                    session_id,
                    content,
                    indexed_hashes,
                )
                .await;
            }
        }
    }

    if let Some(inner) = plan_memory::extract_plan_step_summary(&result.text) {
        index_plan_step_summary(
            &state.chat_memory,
            &state.connections,
            &row,
            &cfg,
            session_id,
            &inner,
            indexed_hashes,
        )
        .await;
    }
}

async fn resolve_autonomous_connection(
    state: &AppState,
    base: &ChatRunRequest,
) -> Result<crate::storage::repositories::ConnectionRow, AppError> {
    if let Some(id) = base
        .connection_id
        .as_deref()
        .filter(|s| !s.is_empty())
    {
        return state.connections.get_row(id).await;
    }
    if let Some(mid) = base.mode_id.as_deref().filter(|s| !s.trim().is_empty()) {
        let modes = state.catalog.list_modes().await?;
        if let Some(mode) = modes.iter().find(|m| m.id == mid) {
            if let Some(cid) = mode
                .provider_override
                .as_deref()
                .filter(|s| !s.is_empty())
            {
                return state.connections.get_row(cid).await;
            }
        }
    }
    state
        .connections
        .get_default_row()
        .await?
        .ok_or_else(|| AppError::Validation("no default connection".into()))
}

fn emit_turn_memory_diagnostics<E: ChatRunEventSink + ?Sized>(
    events: &mut E,
    result: &CompletionResult,
) {
    let summary = result
        .session_summary
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_string();
    if summary.is_empty() && result.memory_diagnostics.is_none() {
        return;
    }
    events.memory(ChatRunMemoryUpdate {
        session_summary: summary,
        context_window_size: result.context_window_size.unwrap_or(0),
        memory_diagnostics: result.memory_diagnostics.clone(),
        retrieved_memory: result.retrieved_memory.clone(),
        vector_chunks_used: result.vector_chunks_used,
        memory_compressed: Some(result.memory_compressed),
        evicted_turns: result.evicted_turns,
        vector_memory_compressed: Some(result.vector_memory_compressed),
        context_recovered: Some(result.context_recovered),
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_step_status_uses_matching_step_not_first_tag() {
        let text = r#"
<step-result step="3" status="done">future</step-result>
<step-result step="2" status="done">current</step-result>
"#;
        assert_eq!(resolve_step_status(text, 2), StepStatus::Done);
    }

    #[test]
    fn current_step_status_uses_last_matching_tag() {
        let text = r#"
<step-result step="2" status="failed">old failure</step-result>
<step-result step="2" status="done">fixed</step-result>
"#;
        assert_eq!(resolve_step_status(text, 2), StepStatus::Done);
    }

    #[test]
    fn infers_done_from_file_fence_without_step_result() {
        let text = "```file:test/index.html\n<!DOCTYPE html>\n<html>body</html>\n```";
        assert_eq!(resolve_step_status(text, 1), StepStatus::Done);
    }

    #[test]
    fn wrong_step_result_without_file_output_fails() {
        let text = r#"<step-result step="9" status="done">wrong</step-result>"#;
        assert_eq!(resolve_step_status(text, 2), StepStatus::Failed);
    }
}
