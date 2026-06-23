//! Agent tool registry — list, execute, and probe function / tool calling.

use serde::Deserialize;
use serde_json::Value;

use crate::providers::prompt_format::{self, ParsedToolCall, ToolDefinition};
use crate::tools::{self, ToolExecutionResult};
use crate::utils::AppError;

#[tauri::command]
pub fn list_agent_tools() -> Vec<ToolDefinition> {
    tools::list_tools()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteAgentToolInput {
    pub name: String,
    #[serde(default)]
    pub arguments: Value,
}

#[tauri::command]
pub fn execute_agent_tool(input: ExecuteAgentToolInput) -> Result<ToolExecutionResult, AppError> {
    tools::execute_tool(&input.name, input.arguments)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteToolCallsFromTextInput {
    pub format_id: String,
    pub text: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteToolCallsFromTextResult {
    pub tool_calls: Vec<ParsedToolCall>,
    pub results: Vec<ToolExecutionResult>,
}

/// Parse model output for tool calls (Gemma 4 etc.) and run each tool locally.
#[tauri::command]
pub fn execute_tool_calls_from_text(
    input: ExecuteToolCallsFromTextInput,
) -> Result<ExecuteToolCallsFromTextResult, AppError> {
    let calls = prompt_format::resolve(&input.format_id).parse_tool_calls(&input.text);
    let pairs: Vec<(String, Value)> = calls
        .iter()
        .map(|c| (c.name.clone(), c.arguments.clone()))
        .collect();
    let results = tools::execute_many(&pairs);
    Ok(ExecuteToolCallsFromTextResult {
        tool_calls: calls,
        results,
    })
}
