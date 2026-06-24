//! run_verify — deterministic checks (file content, php -l, cargo check, vitest).

use serde_json::{json, Value};

use crate::workspace::{run_verify_spec, VerifySpec};
use crate::providers::prompt_format::ToolDefinition;
use crate::utils::AppResult;

use super::super::context::ToolExecutionContext;
use super::super::ToolExecutionResult;
use super::helpers::ensure_readable_path;

pub const NAME: &str = "run_verify";

pub fn tool_definition() -> ToolDefinition {
    ToolDefinition {
        name: NAME.into(),
        description: "Run a deterministic verification check. \
Kinds: file_contains, file_not_contains, php_lint, cargo_check, vitest. \
Use after apply_patch to confirm the fix.".into(),
        parameters: json!({
            "type": "object",
            "properties": {
                "kind": {
                    "type": "string",
                    "enum": ["file_contains", "file_not_contains", "php_lint", "cargo_check", "vitest"]
                },
                "path": {
                    "type": "string",
                    "description": "Workspace-relative file path (required for most kinds)"
                },
                "needle": {
                    "type": "string",
                    "description": "Substring for file_contains / file_not_contains"
                },
                "manifest": {
                    "type": "string",
                    "description": "Cargo.toml path for cargo_check (default: src-tauri/Cargo.toml)"
                }
            },
            "required": ["kind"]
        }),
    }
}

pub async fn execute(ctx: &ToolExecutionContext, arguments: Value) -> AppResult<ToolExecutionResult> {
    let spec = parse_spec(arguments)?;
    if let Some(path) = spec.path.as_deref() {
        ensure_readable_path(ctx, path)?;
    }
    if let Some(manifest) = spec.manifest.as_deref() {
        ensure_readable_path(ctx, manifest)?;
    }

    let root = std::path::PathBuf::from(ctx.settings.workspace_root.trim());
    let outcome = run_verify_spec(&root, &spec).await?;

    Ok(ToolExecutionResult {
        name: NAME.into(),
        ok: outcome.ok,
        output: json!({
            "kind": outcome.kind,
            "message": outcome.message,
        }),
        message: outcome.message,
    })
}

fn parse_spec(arguments: Value) -> AppResult<VerifySpec> {
    let kind = arguments
        .get("kind")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if kind.is_empty() {
        return Err(crate::utils::AppError::Validation(
            "run_verify: kind is required".into(),
        ));
    }
    Ok(VerifySpec {
        kind,
        path: arguments
            .get("path")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        needle: arguments
            .get("needle")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        manifest: arguments
            .get("manifest")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
    })
}
