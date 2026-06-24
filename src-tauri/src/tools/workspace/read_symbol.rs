//! read_symbol — read a class/method/function body by symbol name.

use serde_json::{json, Value};

use crate::providers::prompt_format::ToolDefinition;
use crate::utils::AppResult;
use crate::workspace::symbols::{find_symbol, outline_for_file};

use super::super::context::ToolExecutionContext;
use super::super::ToolExecutionResult;
use super::helpers::{cap_tool_text, ensure_readable_path};

pub const NAME: &str = "read_symbol";

pub fn tool_definition() -> ToolDefinition {
    ToolDefinition {
        name: NAME.into(),
        description:
            "Read the body of a class, method, or function by symbol name in PHP/JS/Python files."
                .into(),
        parameters: json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "File path relative to workspace root"
                },
                "symbol": {
                    "type": "string",
                    "description": "Symbol name, e.g. UserService, create, or UserService::create"
                }
            },
            "required": ["path", "symbol"]
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
    let symbol = arguments
        .get("symbol")
        .and_then(|v| v.as_str())
        .ok_or_else(|| crate::utils::AppError::Validation("symbol is required".into()))?;

    let path = ensure_readable_path(ctx, raw_path)?;
    let file = ctx.workspace.read_file(&path, None, None).await?;
    let outline = outline_for_file(&file.path, &file.content);

    if !outline.parseable {
        return Err(crate::utils::AppError::Validation(format!(
            "file {} is not outline-parseable — use read_file",
            outline.path
        )));
    }

    let entry = find_symbol(&outline, symbol).ok_or_else(|| {
        crate::utils::AppError::Validation(format!(
            "symbol `{symbol}` not found in {}",
            outline.path
        ))
    })?;

    let start = entry.line_start.saturating_sub(1).max(1);
    let end = entry.line_end.max(start);
    let slice = ctx
        .workspace
        .read_file(&path, Some(start), Some(end))
        .await?;
    let (content, truncated) = cap_tool_text(&slice.content);

    Ok(ToolExecutionResult {
        name: NAME.into(),
        ok: true,
        output: json!({
            "path": slice.path,
            "symbol": entry.qualified_name,
            "kind": entry.kind,
            "signature": entry.signature,
            "lineStart": slice.line_start,
            "lineEnd": slice.line_end,
            "truncated": truncated,
            "content": content,
        }),
        message: format!(
            "Read symbol {} at {}:{}-{}",
            entry.qualified_name, slice.path, slice.line_start, slice.line_end
        ),
    })
}
