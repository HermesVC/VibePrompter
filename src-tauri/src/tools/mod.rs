//! Local agent tools — minimal MCP-style registry executed on the desktop.

mod chrome;
pub mod context;
mod workspace;

use serde::Serialize;
use serde_json::{json, Value};

use crate::providers::prompt_format::ToolDefinition;
use crate::utils::{AppError, AppResult};

pub use context::ToolExecutionContext;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolExecutionResult {
    pub name: String,
    pub ok: bool,
    pub output: Value,
    pub message: String,
}

/// Workspace file tools + legacy chrome launcher.
pub fn list_workspace_tools() -> Vec<ToolDefinition> {
    vec![
        workspace::list_dir::tool_definition(),
        workspace::read_file::tool_definition(),
        workspace::file_outline::tool_definition(),
        workspace::read_symbol::tool_definition(),
        workspace::apply_patch::tool_definition(),
    ]
}

/// Tools exposed to prompt templates / function-calling experiments.
pub fn list_tools() -> Vec<ToolDefinition> {
    let mut tools = list_workspace_tools();
    tools.push(chrome::tool_definition());
    tools
}

pub async fn execute_tool(
    ctx: &ToolExecutionContext,
    name: &str,
    arguments: Value,
) -> AppResult<ToolExecutionResult> {
    match name {
        workspace::LIST_DIR => workspace::list_dir::execute(ctx, arguments).await,
        workspace::READ_FILE => workspace::read_file::execute(ctx, arguments).await,
        workspace::FILE_OUTLINE => workspace::file_outline::execute(ctx, arguments).await,
        workspace::READ_SYMBOL => workspace::read_symbol::execute(ctx, arguments).await,
        workspace::APPLY_PATCH => workspace::apply_patch::execute(ctx, arguments).await,
        chrome::NAME => chrome::execute(arguments),
        _ => Err(AppError::NotFound {
            entity: "agent_tool",
            id: name.to_string(),
        }),
    }
}

pub async fn execute_many(
    ctx: &ToolExecutionContext,
    calls: &[(String, Value)],
) -> Vec<ToolExecutionResult> {
    let mut results = Vec::with_capacity(calls.len());
    for (name, args) in calls {
        let result = match execute_tool(ctx, name, args.clone()).await {
            Ok(r) => r,
            Err(e) => ToolExecutionResult {
                name: name.clone(),
                ok: false,
                output: json!({}),
                message: e.to_string(),
            },
        };
        results.push(result);
    }
    results
}
