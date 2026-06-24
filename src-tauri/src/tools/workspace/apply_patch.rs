//! apply_patch — deterministic search/replace edits on a workspace file.

use serde_json::{json, Value};

use crate::providers::prompt_format::ToolDefinition;
use crate::utils::{AppError, AppResult};
use crate::workspace::patch::{apply_patches, PatchEdit};
use crate::workspace::policy::{PolicyDecision, PolicyEngine};
use crate::workspace::write_file_checked;

use super::super::context::ToolExecutionContext;
use super::super::ToolExecutionResult;
use super::helpers::ensure_readable_path;

pub const NAME: &str = "apply_patch";

pub fn tool_definition() -> ToolDefinition {
    ToolDefinition {
        name: NAME.into(),
        description: "Apply one or more exact search/replace edits to a file. \
Each old_text must appear exactly once — include enough surrounding lines. \
Read the file first; pass contentHash as expected_hash when available."
            .into(),
        parameters: json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "File path relative to workspace root"
                },
                "expected_hash": {
                    "type": "string",
                    "description": "contentHash from read_file — rejects stale files"
                },
                "edits": {
                    "type": "array",
                    "description": "Sequential edits (applied in order)",
                    "items": {
                        "type": "object",
                        "properties": {
                            "old_text": {
                                "type": "string",
                                "description": "Exact substring to replace (unique in file)"
                            },
                            "new_text": {
                                "type": "string",
                                "description": "Replacement text"
                            }
                        },
                        "required": ["old_text", "new_text"]
                    }
                },
                "old_text": {
                    "type": "string",
                    "description": "Shorthand for a single edit"
                },
                "new_text": {
                    "type": "string",
                    "description": "Shorthand for a single edit"
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
        .ok_or_else(|| AppError::Validation("path is required".into()))?;
    let path = ensure_readable_path(ctx, raw_path)?;
    let edits = parse_edits(&arguments)?;
    let expected_hash = arguments
        .get("expected_hash")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    let decision = PolicyEngine::evaluate_write(&ctx.settings, &path);
    if decision == PolicyDecision::Deny {
        return Err(AppError::Validation(
            "write denied by workspace policy".into(),
        ));
    }

    let file = ctx.workspace.read_file(&path, None, None).await?;
    let patched = apply_patches(&file.content, &edits).map_err(|e| AppError::Validation(e.message()))?;

    let root = std::path::PathBuf::from(ctx.settings.workspace_root.trim());
    let hash = write_file_checked(
        &root,
        &path,
        &patched,
        expected_hash
            .as_deref()
            .or(Some(file.content_hash.as_str())),
    )?;

    let line_delta = patched.lines().count() as i64 - file.line_count as i64;

    Ok(ToolExecutionResult {
        name: NAME.into(),
        ok: true,
        output: json!({
            "path": path,
            "contentHash": hash,
            "editsApplied": edits.len(),
            "lineCountBefore": file.line_count,
            "lineCountAfter": patched.lines().count(),
            "lineDelta": line_delta,
            "policy": match decision {
                PolicyDecision::Allow => "allow",
                PolicyDecision::Ask => "ask",
                PolicyDecision::Deny => "deny",
            },
        }),
        message: format!(
            "Patched {} ({} edit(s), lines {} → {})",
            path,
            edits.len(),
            file.line_count,
            patched.lines().count()
        ),
    })
}

fn parse_edits(arguments: &Value) -> AppResult<Vec<PatchEdit>> {
    if let Some(arr) = arguments.get("edits").and_then(|v| v.as_array()) {
        let mut out = Vec::with_capacity(arr.len());
        for item in arr {
            out.push(parse_edit_object(item)?);
        }
        if out.is_empty() {
            return Err(AppError::Validation(
                "edits array is empty — provide at least one edit".into(),
            ));
        }
        return Ok(out);
    }

    let old_text = arguments
        .get("old_text")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Validation("old_text or edits[] is required".into()))?;
    let new_text = arguments
        .get("new_text")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    Ok(vec![PatchEdit {
        old_text: old_text.to_string(),
        new_text: new_text.to_string(),
    }])
}

fn parse_edit_object(item: &Value) -> AppResult<PatchEdit> {
    let old_text = item
        .get("old_text")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Validation("edit.old_text is required".into()))?;
    let new_text = item
        .get("new_text")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    Ok(PatchEdit {
        old_text: old_text.to_string(),
        new_text: new_text.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_edits_array() {
        let args = json!({
            "path": "a.ts",
            "edits": [{ "old_text": "x", "new_text": "y" }]
        });
        let edits = parse_edits(&args).expect("edits");
        assert_eq!(edits.len(), 1);
        assert_eq!(edits[0].old_text, "x");
    }

    #[test]
    fn parses_single_shorthand() {
        let args = json!({
            "path": "a.ts",
            "old_text": "foo",
            "new_text": "bar"
        });
        let edits = parse_edits(&args).expect("edits");
        assert_eq!(edits[0].new_text, "bar");
    }
}
