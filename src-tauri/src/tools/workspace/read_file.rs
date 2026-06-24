//! read_file — read a workspace file or a line range.

use serde_json::{json, Value};

use crate::providers::prompt_format::ToolDefinition;
use crate::utils::AppResult;

use super::helpers::{cap_tool_text, ensure_readable_path};
use super::super::context::ToolExecutionContext;
use super::super::ToolExecutionResult;

pub const NAME: &str = "read_file";

pub fn tool_definition() -> ToolDefinition {
    ToolDefinition {
        name: NAME.into(),
        description: "Read a text file from the workspace. Use start_line/end_line for large files."
            .into(),
        parameters: json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "File path relative to workspace root"
                },
                "start_line": {
                    "type": "integer",
                    "description": "First line to include (1-based, optional)"
                },
                "end_line": {
                    "type": "integer",
                    "description": "Last line to include (inclusive, optional)"
                }
            },
            "required": ["path"]
        }),
    }
}

pub async fn execute(ctx: &ToolExecutionContext, arguments: Value) -> AppResult<ToolExecutionResult> {
    let raw_path = arguments
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| crate::utils::AppError::Validation("path is required".into()))?;
    let start_line = arguments.get("start_line").and_then(|v| v.as_u64()).map(|n| n as u32);
    let end_line = arguments.get("end_line").and_then(|v| v.as_u64()).map(|n| n as u32);

    let path = ensure_readable_path(ctx, raw_path)?;
    let file = ctx
        .workspace
        .read_file(&path, start_line, end_line)
        .await?;

    let (content, truncated) = cap_tool_text(&file.content);

    Ok(ToolExecutionResult {
        name: NAME.into(),
        ok: true,
        output: json!({
            "path": file.path,
            "languageId": file.language_id,
            "lineStart": file.line_start,
            "lineEnd": file.line_end,
            "lineCount": file.line_count,
            "contentHash": file.content_hash,
            "truncated": truncated,
            "content": content,
        }),
        message: format!(
            "Read {} lines {}-{} of {}",
            file.line_end - file.line_start + 1,
            file.line_start,
            file.line_end,
            file.path
        ),
    })
}
