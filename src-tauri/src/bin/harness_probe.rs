//! Full harness probe — deterministic toolchain + optional live LLM scenarios.
//!
//! ```text
//! cargo run --bin harness_probe
//! HARNESS_LIVE=1 cargo run --bin harness_probe    # ProjectsAPI audit (LM Studio)
//! HARNESS_REACT=1 cargo run --bin harness_probe   # 3-step React scaffold (LM Studio)
//! ```

use app_lib::app::harness::{
    probe_harness_audit, probe_react_scaffold_steps, run_deterministic_checks,
    REACT_SCAFFOLD_DIR,
};
use app_lib::app::probe::build_probe_state;
use serde::Serialize;

#[derive(Serialize)]
struct HarnessProbeReport {
    deterministic: app_lib::app::harness::HarnessDeterministicReport,
    audit: Option<app_lib::app::probe::ProjectsApiProbeResult>,
    react_scaffold: Option<Vec<app_lib::app::harness::ReactScaffoldStepReport>>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let state = build_probe_state().await?;
    let deterministic = run_deterministic_checks(&state).await?;

    let mut audit = None;
    if std::env::var("HARNESS_LIVE").ok().as_deref() == Some("1") {
        audit = Some(probe_harness_audit(&state).await?);
    }

    let mut react_scaffold = None;
    if std::env::var("HARNESS_REACT").ok().as_deref() == Some("1") {
        react_scaffold = Some(probe_react_scaffold_steps(&state).await?);
    }

    let report = HarnessProbeReport {
        deterministic,
        audit,
        react_scaffold,
    };

    println!("{}", serde_json::to_string_pretty(&report)?);

    if !report.deterministic.all_pass {
        let failed: Vec<_> = report
            .deterministic
            .checks
            .iter()
            .filter(|c| !c.pass)
            .map(|c| c.id.as_str())
            .collect();
        anyhow::bail!("FAIL deterministic: {}", failed.join(", "));
    }

    if let Some(ref a) = report.audit {
        if !a.tools_phase {
            anyhow::bail!("FAIL audit: tools phase never ran");
        }
        if !a.agent_found_bug {
            anyhow::bail!("FAIL audit: agent did not mention projectUids/projectUuids");
        }
        if a.had_bug_before && a.has_bug_after {
            anyhow::bail!("FAIL audit: bug still in file after run");
        }
    }

    if let Some(ref steps) = report.react_scaffold {
        for s in steps {
            if s.raw_tool_markup_in_text {
                anyhow::bail!("FAIL react step {}: raw tool markup in final text", s.step);
            }
            if !s.files_missing.is_empty() {
                anyhow::bail!(
                    "FAIL react step {}: missing files {:?} (expected under {REACT_SCAFFOLD_DIR})",
                    s.step,
                    s.files_missing
                );
            }
        }
    }

    println!("PASS: harness_probe");
    Ok(())
}
