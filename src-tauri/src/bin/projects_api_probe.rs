//! Agent scenario on synthetic harness fixture (not real project files).

use app_lib::app::probe::{
    build_probe_state, probe_apply_patch_smoke, probe_harness_fixture_bugfix,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let state = build_probe_state().await?;
    let mut report = probe_harness_fixture_bugfix(&state).await?;

    if report.had_bug_before && report.has_bug_after {
        let (ok, msg) = probe_apply_patch_smoke(&state).await?;
        report.patch_smoke_ok = Some(ok);
        report.patch_smoke_message = Some(msg);
    }

    println!("{}", serde_json::to_string_pretty(&report)?);

    if !report.tools_phase {
        anyhow::bail!("FAIL: tools phase never ran");
    }
    if !report.agent_found_bug {
        anyhow::bail!("FAIL: agent did not identify the bug");
    }
    if report.had_bug_before && report.has_bug_after {
        if report.patch_smoke_ok == Some(true) {
            anyhow::bail!(
                "PARTIAL: agent found bug but did not apply fix; toolchain apply_patch works"
            );
        }
        anyhow::bail!("FAIL: bug still in synthetic fixture after agent run");
    }

    println!("PASS: harness fixture scenario completed");
    Ok(())
}
