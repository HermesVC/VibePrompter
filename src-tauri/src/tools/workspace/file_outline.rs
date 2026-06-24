//! file_outline — list class/function signatures in a source file.

use serde_json::{json, Value};

use crate::providers::prompt_format::ToolDefinition;
use crate::utils::AppResult;
use crate::workspace::symbols::outline_for_file;

use super::super::context::ToolExecutionContext;
use super::super::ToolExecutionResult;
use super::helpers::ensure_readable_path;

pub const NAME: &str = "file_outline";

pub fn tool_definition() -> ToolDefinition {
    ToolDefinition {
        name: NAME.into(),
        description:
            "List classes, methods, and functions in a PHP/JS/Python file with line ranges. \
                      Other file types return line count only — use read_file for full content."
                .into(),
        parameters: json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "File path relative to workspace root"
                }
            },
            "required": ["path"]
        }),
    }
}

pub async fn execute(
    ctx: &ToolExecutionContext,
    arguments: Value,
) -> AppResult<ToolExecutionResult> {
    let raw_path = arguments
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| crate::utils::AppError::Validation("path is required".into()))?;

    let path = ensure_readable_path(ctx, raw_path)?;
    let file = ctx.workspace.read_file(&path, None, None).await?;
    let outline = outline_for_file(&file.path, &file.content);

    let message = if outline.parseable {
        format!(
            "Outline: {} symbols in {} ({} lines)",
            outline.symbols.len(),
            outline.path,
            outline.line_count
        )
    } else {
        format!(
            "File {} has {} lines (not a parseable language — use read_file)",
            outline.path, outline.line_count
        )
    };

    Ok(ToolExecutionResult {
        name: NAME.into(),
        ok: true,
        output: serde_json::to_value(&outline).unwrap_or_else(|_| json!({})),
        message,
    })
}
