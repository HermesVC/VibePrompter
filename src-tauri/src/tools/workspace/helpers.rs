//! Shared path checks for workspace tools.

use std::path::Path;

use glob::Pattern;

use crate::utils::{AppError, AppResult};
use crate::workspace::WorkspaceSettings;

use super::super::context::ToolExecutionContext;

pub const MAX_TOOL_OUTPUT_CHARS: usize = 16_000;

pub fn normalize_rel(path: &str) -> String {
    path.replace('\\', "/")
        .trim()
        .trim_start_matches("./")
        .to_string()
}

fn path_in_folder_scope(path: &str, scope: &str) -> bool {
    path == scope || path.starts_with(&format!("{scope}/"))
}

/// When folder scope is `test/foo`, accept `index.html` → `test/foo/index.html`.
pub fn resolve_path_in_scope(scope: Option<&str>, rel: &str) -> String {
    let path = normalize_rel(rel);
    let Some(scope) = scope.map(normalize_rel).filter(|s| !s.is_empty()) else {
        return path;
    };
    let scope = scope.trim_end_matches('/');
    if path_in_folder_scope(&path, scope) {
        return path;
    }
    // Model often passes a filename or `./sub/file` relative to the scoped folder.
    if !path.contains('/') || path.starts_with("./") {
        let candidate = format!("{scope}/{}", path.trim_start_matches("./"));
        if path_in_folder_scope(&candidate, scope) {
            return candidate;
        }
    }
    path
}

pub fn ensure_readable_path(ctx: &ToolExecutionContext, rel: &str) -> AppResult<String> {
    let path = resolve_path_in_scope(ctx.scope_prefix().as_deref(), rel);
    if path.is_empty() {
        return Err(AppError::Validation("path is required".into()));
    }
    if let Some(scope) = ctx.scope_prefix() {
        let scope = scope.trim_end_matches('/');
        if !path_in_folder_scope(&path, scope) {
            return Err(AppError::Validation(format!(
                "path `{path}` is outside folder scope `{scope}` (use a path under the scoped folder or a bare filename)"
            )));
        }
    }
    if matches_deny(&ctx.settings.deny_globs, &path) {
        return Err(AppError::Validation(format!(
            "path denied by workspace policy: {path}"
        )));
    }
    if !file_extension_allowed(&ctx.settings, &path) {
        return Err(AppError::Validation(format!(
            "file extension not allowed for read: {path}"
        )));
    }
    Ok(path)
}

pub fn ensure_listable_path(ctx: &ToolExecutionContext, rel: &str) -> AppResult<String> {
    let path = resolve_path_in_scope(ctx.scope_prefix().as_deref(), rel);
    if let Some(scope) = ctx.scope_prefix() {
        let scope = scope.trim_end_matches('/');
        if !path.is_empty() && !path_in_folder_scope(&path, scope) {
            return Err(AppError::Validation(format!(
                "path `{path}` is outside folder scope `{scope}`"
            )));
        }
    }
    Ok(path)
}

fn matches_deny(patterns: &[String], path: &str) -> bool {
    patterns.iter().any(|p| {
        Pattern::new(&p.replace('\\', "/"))
            .map(|pat| pat.matches(path))
            .unwrap_or(false)
    })
}

fn file_extension_allowed(settings: &WorkspaceSettings, path: &str) -> bool {
    let Some(ext) = Path::new(path).extension().and_then(|e| e.to_str()) else {
        return false;
    };
    let ext = format!(".{}", ext.to_ascii_lowercase());
    let list = &settings.allow_extensions;
    if list.is_empty() {
        return matches!(
            ext.as_str(),
            ".md"
                | ".php"
                | ".ts"
                | ".tsx"
                | ".js"
                | ".jsx"
                | ".rs"
                | ".json"
                | ".yaml"
                | ".yml"
                | ".toml"
                | ".css"
                | ".html"
                | ".sql"
                | ".py"
                | ".pyw"
        );
    }
    list.iter().any(|e| e.eq_ignore_ascii_case(&ext))
}

pub fn cap_tool_text(text: &str) -> (String, bool) {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= MAX_TOOL_OUTPUT_CHARS {
        return (text.to_string(), false);
    }
    let truncated: String = chars.into_iter().take(MAX_TOOL_OUTPUT_CHARS).collect();
    (format!("{truncated}\n… (output truncated)"), true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_bare_filename_in_folder_scope() {
        let path = resolve_path_in_scope(Some("test/qwen_test"), "index.html");
        assert_eq!(path, "test/qwen_test/index.html");
    }

    #[test]
    fn keeps_full_path_when_already_under_scope() {
        let path = resolve_path_in_scope(Some("test/qwen_test"), "test/qwen_test/index.html");
        assert_eq!(path, "test/qwen_test/index.html");
    }
}
