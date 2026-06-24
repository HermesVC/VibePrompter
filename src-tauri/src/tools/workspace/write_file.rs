//! write_file — create a new workspace file (does not edit existing files).

use serde_json::{json, Value};

use crate::providers::prompt_format::ToolDefinition;
use crate::utils::{AppError, AppResult};
use crate::workspace::policy::{PolicyDecision, PolicyEngine};
use crate::workspace::write_file_checked;

use super::super::context::ToolExecutionContext;
use super::super::ToolExecutionResult;
use super::helpers::ensure_readable_path;

pub const NAME: &str = "write_file";

pub fn tool_definition() -> ToolDefinition {
    ToolDefinition {
        name: NAME.into(),
        description: "Create a NEW file with the given content. \
Fails if the path already exists (use apply_patch to edit existing files). \
Creates parent directories as needed."
            .into(),
        parameters: json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path for the new file"
                },
                "content": {
                    "type": "string",
                    "description": "Full file body to write"
                }
            },
            "required": ["path", "content"]
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
        .ok_or_else(|| AppError::Validation("path is required".into()))?;
    let content = arguments
        .get("content")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Validation("content is required".into()))?;

    let path = ensure_readable_path(ctx, raw_path)?;
    let decision = PolicyEngine::evaluate_write(&ctx.settings, &path);
    if decision == PolicyDecision::Deny {
        return Err(AppError::Validation(
            "write denied by workspace policy".into(),
        ));
    }

    let root = std::path::PathBuf::from(ctx.settings.workspace_root.trim());
    let abs = crate::workspace::fs::resolve_under_root(&root, &path)?;
    if abs.exists() {
        return Err(AppError::Validation(format!(
            "file already exists: {path} — use apply_patch to edit, not write_file"
        )));
    }

    let hash = write_file_checked(&root, &path, content, None)?;
    let line_count = content.lines().count();

    Ok(ToolExecutionResult {
        name: NAME.into(),
        ok: true,
        output: json!({
            "path": path,
            "contentHash": hash,
            "lineCount": line_count,
            "created": true,
        }),
        message: format!("Created {path} ({line_count} lines)"),
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn write_file_tool_name() {
        assert_eq!(super::NAME, "write_file");
    }
}
