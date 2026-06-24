//! Agent tool registry — list, execute, and probe function / tool calling.

use serde::Deserialize;
use serde_json::Value;
use tauri::State;

use crate::app::AppState;
use crate::providers::prompt_format::{self, ParsedToolCall, ToolDefinition};
use crate::tools::{self, ToolExecutionContext, ToolExecutionResult};
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
    /// Folder scope prefix — restricts workspace tools to this subtree.
    #[serde(default)]
    pub scope_path: Option<String>,
}

async fn build_tool_context(
    state: &AppState,
    scope_path: Option<String>,
) -> Result<ToolExecutionContext, AppError> {
    let settings = state.workspace.get_settings().await?;
    Ok(ToolExecutionContext {
        workspace: state.workspace.clone(),
        settings,
        scope_path,
    })
}

#[tauri::command]
pub async fn execute_agent_tool(
    state: State<'_, AppState>,
    input: ExecuteAgentToolInput,
) -> Result<ToolExecutionResult, AppError> {
    let ctx = build_tool_context(&state, input.scope_path).await?;
    tools::execute_tool(&ctx, &input.name, input.arguments).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteToolCallsFromTextInput {
    pub format_id: String,
    pub text: String,
    #[serde(default)]
    pub scope_path: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteToolCallsFromTextResult {
    pub tool_calls: Vec<ParsedToolCall>,
    pub results: Vec<ToolExecutionResult>,
}

/// Parse model output for tool calls (Gemma 4 etc.) and run each tool locally.
#[tauri::command]
pub async fn execute_tool_calls_from_text(
    state: State<'_, AppState>,
    input: ExecuteToolCallsFromTextInput,
) -> Result<ExecuteToolCallsFromTextResult, AppError> {
    let calls = prompt_format::resolve(&input.format_id).parse_tool_calls(&input.text);
    let pairs: Vec<(String, Value)> = calls
        .iter()
        .map(|c| (c.name.clone(), c.arguments.clone()))
        .collect();
    let ctx = build_tool_context(&state, input.scope_path).await?;
    let results = tools::execute_many(&ctx, &pairs).await;
    Ok(ExecuteToolCallsFromTextResult {
        tool_calls: calls,
        results,
    })
}
