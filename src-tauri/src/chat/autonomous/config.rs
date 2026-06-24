//! Budgets and limits for autonomous multi-step runs.

use serde::{Deserialize, Serialize};

/// Tunable limits for an autonomous run (outer orchestration loop).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutonomousRunConfig {
    /// Maximum executed plan steps (each step = one `run_chat` turn).
    pub max_steps: usize,
    /// How many times the orchestrator may ask the model to replan after verify failures.
    pub max_replans: usize,
    /// When true, the first turn asks the model for a structured `<autonomous-plan>`.
    pub planning_enabled: bool,
    /// Run deterministic verification after each step when the plan step defines `verify`.
    pub verify_steps: bool,
}

impl Default for AutonomousRunConfig {
    fn default() -> Self {
        Self {
            max_steps: 12,
            max_replans: 2,
            planning_enabled: true,
            verify_steps: true,
        }
    }
}

impl AutonomousRunConfig {
    pub fn clamped(self) -> Self {
        Self {
            max_steps: self.max_steps.clamp(1, 32),
            max_replans: self.max_replans.clamp(0, 8),
            ..self
        }
    }
}
