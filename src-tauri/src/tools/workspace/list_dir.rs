//! list_dir — enumerate files under a workspace-relative directory.

use serde_json::{json, Value};

use crate::providers::prompt_format::ToolDefinition;
use crate::utils::AppResult;

use super::helpers::{cap_tool_text, ensure_listable_path};
use super::super::context::ToolExecutionContext;
use super::super::ToolExecutionResult;

pub const NAME: &str = "list_dir";

pub fn tool_definition() -> ToolDefinition {
    ToolDefinition {
        name: NAME.into(),
        description: "List files and subdirectories under a workspace-relative path. \
                      Returns relative paths (directories end with /)."
            .into(),
        parameters: json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Directory relative to workspace root (empty or \".\" for root)"
                },
                "depth": {
                    "type": "integer",
                    "description": "Max recursion depth (default 2, max 4)"
                }
            }
        }),
    }
}

pub async fn execute(ctx: &ToolExecutionContext, arguments: Value) -> AppResult<ToolExecutionResult> {
    let raw_path = arguments
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let depth = arguments
        .get("depth")
        .and_then(|v| v.as_u64())
        .unwrap_or(2)
        .clamp(1, 4) as u32;

    let path = ensure_listable_path(ctx, raw_path)?;
    let entries = ctx.workspace.list_dir(&path, depth).await?;
    let listing = if entries.is_empty() {
        "(empty)".into()
    } else {
        entries.join("\n")
    };
    let (text, truncated) = cap_tool_text(&listing);
    let count = entries.len();

    Ok(ToolExecutionResult {
        name: NAME.into(),
        ok: true,
        output: json!({
            "path": if path.is_empty() { "." } else { path.as_str() },
            "count": count,
            "truncated": truncated,
            "entries": entries,
            "listing": text,
        }),
        message: if truncated {
            format!("Listed {count} entries (listing truncated)")
        } else {
            format!("Listed {count} entries")
        },
    })
}
