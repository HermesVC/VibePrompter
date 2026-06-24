//! Headless tool-call probe — parse, execute, optional live LLM round-trip.

use app_lib::app::probe::{build_probe_state, probe_tool_call_live, probe_tool_call_parse_and_execute};
use app_lib::providers::prompt_format::tool_call_parse;
use serde::Serialize;

const SAMPLE_TOOL_TEXT: &str = r#"<|tool_call|>call:read_file{path:test/single-page-games/index.html}
</|tool_call|>"#;

#[derive(Serialize)]
struct ProbeReport {
    parse_count: usize,
    parsed_names: Vec<String>,
    execute_ok: bool,
    execute_message: String,
    live_run: Option<LiveRun>,
}

#[derive(Serialize)]
struct LiveRun {
    text_preview: String,
    contains_tool_markup: bool,
    contains_file_content: bool,
    trace_tools_phase: bool,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let calls = tool_call_parse::parse_all_tool_calls(SAMPLE_TOOL_TEXT);
    let parsed_names: Vec<String> = calls.iter().map(|c| c.name.clone()).collect();

    let state = build_probe_state().await?;
    let (execute_ok, execute_message) =
        probe_tool_call_parse_and_execute(&state, SAMPLE_TOOL_TEXT).await?;

    let mut report = ProbeReport {
        parse_count: calls.len(),
        parsed_names,
        execute_ok,
        execute_message,
        live_run: None,
    };

    if std::env::var("TOOL_PROBE_LIVE").ok().as_deref() == Some("1") {
        let (text, tools_phase) = probe_tool_call_live(&state).await?;
        report.live_run = Some(LiveRun {
            contains_tool_markup: tool_call_parse::contains_tool_call_markup(&text),
            contains_file_content: text.to_lowercase().contains("<html")
                || text.to_lowercase().contains("<!doctype")
                || text.to_lowercase().contains("<title"),
            text_preview: text.chars().take(400).collect(),
            trace_tools_phase: tools_phase,
        });
    }

    println!("{}", serde_json::to_string_pretty(&report)?);
    if report.parse_count == 0 {
        anyhow::bail!("FAIL: parser found 0 tool calls");
    }
    if !report.execute_ok {
        anyhow::bail!("FAIL: tool execute: {}", report.execute_message);
    }
    Ok(())
}
