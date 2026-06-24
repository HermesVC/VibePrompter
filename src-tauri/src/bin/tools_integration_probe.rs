//! Integration probe: write_file + apply_patch (deterministic + optional live LLM).
//!
//! ```text
//! cargo run --bin tools_integration_probe
//! TOOLS_PROBE_LIVE=1 cargo run --bin tools_integration_probe
//! ```

use app_lib::app::probe::build_probe_state;
use app_lib::app::toolchain_probe::{
    live_report_pass, run_toolchain_deterministic, run_toolchain_live,
};
use serde::Serialize;

#[derive(Serialize)]
struct ToolsIntegrationReport {
    deterministic: app_lib::app::toolchain_probe::ToolchainDeterministicReport,
    live: Option<app_lib::app::toolchain_probe::ToolchainLiveReport>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let state = build_probe_state().await?;
    let deterministic = run_toolchain_deterministic(&state).await?;

    let mut live = None;
    if std::env::var("TOOLS_PROBE_LIVE").ok().as_deref() == Some("1") {
        live = Some(run_toolchain_live(&state).await?);
    }

    let report = ToolsIntegrationReport {
        deterministic,
        live,
    };

    println!("{}", serde_json::to_string_pretty(&report)?);

    if !report.deterministic.all_pass {
        let failed: Vec<_> = report
            .deterministic
            .steps
            .iter()
            .filter(|s| !s.pass)
            .map(|s| s.id.as_str())
            .collect();
        anyhow::bail!("FAIL deterministic: {}", failed.join(", "));
    }

    if let Some(ref l) = report.live {
        let (ok, msg) = live_report_pass(l);
        if !ok {
            anyhow::bail!("FAIL live: {msg}");
        }
    }

    println!("PASS: tools_integration_probe");
    Ok(())
}
