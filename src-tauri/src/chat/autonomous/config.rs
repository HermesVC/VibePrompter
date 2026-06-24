//! Budgets and limits for autonomous multi-step runs.

use serde::{Deserialize, Serialize};

fn default_max_step_retries() -> usize {
    1
}

/// Tunable limits for an autonomous run (outer orchestration loop).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutonomousRunConfig {
    /// Maximum executed plan steps (each step = one `run_chat` turn).
    #[serde(default = "default_max_steps")]
    pub max_steps: usize,
    /// How many times the orchestrator may ask the model to replan after verify failures.
    #[serde(default = "default_max_replans")]
    pub max_replans: usize,
    /// When true, the first turn asks the model for a structured `<autonomous-plan>`.
    #[serde(default = "default_planning_enabled")]
    pub planning_enabled: bool,
    /// Run deterministic verification after each step when the plan step defines `verify`.
    #[serde(default = "default_verify_steps")]
    pub verify_steps: bool,
    /// Outer safety-net retries per orchestrator turn after inner context recovery is exhausted.
    #[serde(default = "default_max_step_retries")]
    pub max_step_retries: usize,
}

fn default_max_steps() -> usize {
    12
}

fn default_max_replans() -> usize {
    2
}

fn default_planning_enabled() -> bool {
    true
}

fn default_verify_steps() -> bool {
    true
}

impl Default for AutonomousRunConfig {
    fn default() -> Self {
        Self {
            max_steps: 12,
            max_replans: 2,
            planning_enabled: true,
            verify_steps: true,
            max_step_retries: 1,
        }
    }
}

impl AutonomousRunConfig {
    pub fn clamped(self) -> Self {
        Self {
            max_steps: self.max_steps.clamp(1, 32),
            max_replans: self.max_replans.clamp(0, 8),
            max_step_retries: self.max_step_retries.clamp(0, 3),
            ..self
        }
    }
}
