//! Multi-step autonomous orchestration (plan → execute → verify → replan).

mod config;
mod plan;
mod prompts;
mod runner;

pub use config::AutonomousRunConfig;
pub use runner::{
    run_autonomous, AutonomousPhase, AutonomousPlanSnapshot, AutonomousRunEventSink,
    AutonomousRunRequest, AutonomousRunResult, AutonomousStepRecord, StepSnapshot,
};
