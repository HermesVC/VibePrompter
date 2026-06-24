//! Deterministic workspace verification — file checks and allowlisted commands.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::utils::{AppError, AppResult};
use crate::workspace::fs::resolve_under_root;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct VerifySpec {
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub needle: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub manifest: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyOutcome {
    pub ok: bool,
    pub message: String,
    pub kind: String,
}

pub async fn run_verify_spec(
    workspace_root: &Path,
    spec: &VerifySpec,
) -> AppResult<VerifyOutcome> {
    let outcome = match spec.kind.as_str() {
        "file_contains" => verify_file_contains(workspace_root, spec)?,
        "file_not_contains" => verify_file_not_contains(workspace_root, spec)?,
        "php_lint" => verify_php_lint(workspace_root, spec).await?,
        "cargo_check" => verify_cargo_check(workspace_root, spec).await?,
        "vitest" => verify_vitest(workspace_root, spec).await?,
        other => {
            return Err(AppError::Validation(format!(
                "unsupported verify kind: {other}"
            )));
        }
    };
    Ok(outcome)
}

fn verify_file_contains(root: &Path, spec: &VerifySpec) -> AppResult<VerifyOutcome> {
    let path = require_path(spec)?;
    let needle = require_needle(spec)?;
    let body = read_workspace_file(root, &path)?;
    let ok = body.contains(needle.as_str());
    Ok(VerifyOutcome {
        ok,
        message: if ok {
            format!("{path} contains expected text")
        } else {
            format!("{path} missing needle: {needle:?}")
        },
        kind: spec.kind.clone(),
    })
}

fn verify_file_not_contains(root: &Path, spec: &VerifySpec) -> AppResult<VerifyOutcome> {
    let path = require_path(spec)?;
    let needle = require_needle(spec)?;
    let body = read_workspace_file(root, &path)?;
    let ok = !body.contains(needle.as_str());
    Ok(VerifyOutcome {
        ok,
        message: if ok {
            format!("{path} no longer contains {needle:?}")
        } else {
            format!("{path} still contains forbidden text: {needle:?}")
        },
        kind: spec.kind.clone(),
    })
}

async fn verify_php_lint(root: &Path, spec: &VerifySpec) -> AppResult<VerifyOutcome> {
    let path = require_path(spec)?;
    let abs = resolve_under_workspace(root, &path)?;
    let output = Command::new("php")
        .arg("-l")
        .arg(&abs)
        .output()
        .map_err(|e| AppError::Validation(format!("php -l failed to start: {e}")))?;
    let ok = output.status.success();
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let message = if ok {
        format!("php -l OK for {path}")
    } else {
        format!("php -l failed for {path}: {}{}", stdout.trim(), stderr.trim())
    };
    Ok(VerifyOutcome {
        ok,
        message,
        kind: spec.kind.clone(),
    })
}

async fn verify_cargo_check(root: &Path, spec: &VerifySpec) -> AppResult<VerifyOutcome> {
    let manifest = spec
        .manifest
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("src-tauri/Cargo.toml");
    let abs_manifest = resolve_under_workspace(root, manifest)?;
    let manifest_dir = abs_manifest
        .parent()
        .ok_or_else(|| AppError::Validation("invalid manifest path".into()))?;

    let output = Command::new("cargo")
        .arg("check")
        .arg("--manifest-path")
        .arg(&abs_manifest)
        .current_dir(manifest_dir)
        .output()
        .map_err(|e| AppError::Validation(format!("cargo check failed to start: {e}")))?;

    let ok = output.status.success();
    let stderr = String::from_utf8_lossy(&output.stderr);
    let message = if ok {
        format!("cargo check OK ({manifest})")
    } else {
        truncate_lines(&stderr, 12)
    };
    Ok(VerifyOutcome {
        ok,
        message,
        kind: spec.kind.clone(),
    })
}

async fn verify_vitest(root: &Path, spec: &VerifySpec) -> AppResult<VerifyOutcome> {
    let path = require_path(spec)?;
    let abs = resolve_under_workspace(root, &path)?;
    let output = Command::new("npx")
        .args(["vitest", "run", abs.to_string_lossy().as_ref()])
        .current_dir(root)
        .output()
        .map_err(|e| AppError::Validation(format!("vitest failed to start: {e}")))?;

    let ok = output.status.success();
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let message = if ok {
        format!("vitest OK for {path}")
    } else {
        truncate_lines(&combined, 12)
    };
    Ok(VerifyOutcome {
        ok,
        message,
        kind: spec.kind.clone(),
    })
}

fn require_path(spec: &VerifySpec) -> AppResult<String> {
    spec.path
        .as_ref()
        .filter(|p| !p.trim().is_empty())
        .cloned()
        .ok_or_else(|| AppError::Validation("verify.path is required".into()))
}

fn require_needle(spec: &VerifySpec) -> AppResult<String> {
    spec.needle
        .as_ref()
        .filter(|n| !n.is_empty())
        .cloned()
        .ok_or_else(|| AppError::Validation("verify.needle is required".into()))
}

fn read_workspace_file(root: &Path, rel: &str) -> AppResult<String> {
    let abs = resolve_under_workspace(root, rel)?;
    std::fs::read_to_string(&abs)
        .map_err(|e| AppError::Validation(format!("read {rel}: {e}")))
}

fn resolve_under_workspace(root: &Path, rel: &str) -> AppResult<PathBuf> {
    resolve_under_root(root, rel)
}

fn truncate_lines(text: &str, max_lines: usize) -> String {
    let lines: Vec<_> = text.lines().take(max_lines).collect();
    let mut out = lines.join("\n");
    if text.lines().count() > max_lines {
        out.push_str("\n…");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn file_contains_check() {
        let tmp = std::env::temp_dir().join(format!("vp-verify-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        fs::write(tmp.join("a.txt"), "hello world").unwrap();
        let spec = VerifySpec {
            kind: "file_contains".into(),
            path: Some("a.txt".into()),
            needle: Some("world".into()),
            manifest: None,
        };
        let out = verify_file_contains(&tmp, &spec).unwrap();
        assert!(out.ok);
        let _ = fs::remove_dir_all(&tmp);
    }
}
