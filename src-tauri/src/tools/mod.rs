//! Local agent tools — minimal MCP-style registry executed on the desktop.

mod chrome;

use serde::Serialize;
use serde_json::{json, Value};

use crate::providers::prompt_format::ToolDefinition;
use crate::utils::{AppError, AppResult};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolExecutionResult {
    pub name: String,
    pub ok: bool,
    pub output: Value,
    pub message: String,
}

/// Tools exposed to prompt templates / function-calling experiments.
pub fn list_tools() -> Vec<ToolDefinition> {
    vec![chrome::tool_definition()]
}

pub fn execute_tool(name: &str, arguments: Value) -> AppResult<ToolExecutionResult> {
    match name {
        chrome::NAME => chrome::execute(arguments),
        _ => Err(AppError::NotFound {
            entity: "agent_tool",
            id: name.to_string(),
        }),
    }
}

pub fn execute_many(calls: &[(String, Value)]) -> Vec<ToolExecutionResult> {
    calls
        .iter()
        .map(|(name, args)| match execute_tool(name, args.clone()) {
            Ok(r) => r,
            Err(e) => ToolExecutionResult {
                name: name.clone(),
                ok: false,
                output: json!({}),
                message: e.to_string(),
            },
        })
        .collect()
}
