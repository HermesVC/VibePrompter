//! Cross-platform filesystem access — OS-specific code stays out of tool logic.

use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Component, Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::utils::{AppError, AppResult};

use super::language::detect_language;
use super::types::FileContentDto;

const MAX_READ_BYTES: usize = 512 * 1024;

pub fn content_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Resolve `rel` under `workspace_root` and ensure the result stays inside.
pub fn resolve_under_root(workspace_root: &Path, rel: &str) -> AppResult<PathBuf> {
    if workspace_root.as_os_str().is_empty() {
        return Err(AppError::Validation(
            "workspace root is not configured — set it in Settings → Workspace".into(),
        ));
    }
    let root = fs::canonicalize(workspace_root).map_err(|e| {
        AppError::Validation(format!("workspace root is not accessible: {e}"))
    })?;
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() {
        let canon = fs::canonicalize(rel_path)
            .map_err(|e| AppError::Validation(format!("path not found: {e}")))?;
        if !canon.starts_with(&root) {
            return Err(AppError::Validation(
                "path is outside the configured workspace".into(),
            ));
        }
        return Ok(canon);
    }
    for comp in rel_path.components() {
        if matches!(comp, Component::ParentDir) {
            return Err(AppError::Validation(
                "parent directory segments are not allowed in workspace paths".into(),
            ));
        }
    }
    let joined = root.join(rel_path);
    if joined.exists() {
        let canon = fs::canonicalize(&joined)
            .map_err(|e| AppError::Validation(format!("path not found: {e}")))?;
        if !canon.starts_with(&root) {
            return Err(AppError::Validation(
                "path escapes the workspace root".into(),
            ));
        }
        Ok(canon)
    } else {
        let parent = joined.parent().unwrap_or(&root);
        let parent_canon = if parent.exists() {
            fs::canonicalize(parent)
                .map_err(|e| AppError::Validation(format!("parent path invalid: {e}")))?
        } else {
            root.clone()
        };
        if !parent_canon.starts_with(&root) {
            return Err(AppError::Validation(
                "path escapes the workspace root".into(),
            ));
        }
        Ok(joined)
    }
}

pub fn rel_display_path(workspace_root: &Path, abs: &Path) -> String {
    if let Ok(root) = fs::canonicalize(workspace_root) {
        if let Ok(rel) = abs.strip_prefix(&root) {
            return rel.to_string_lossy().replace('\\', "/");
        }
    }
    abs.to_string_lossy().replace('\\', "/")
}

/// Read a file by absolute path for chat attach when workspace root is not configured.
pub fn read_absolute_file_for_context(abs: &Path) -> AppResult<FileContentDto> {
    if abs.as_os_str().is_empty() {
        return Err(AppError::Validation("empty file path".into()));
    }
    if abs.is_dir() {
        return Err(AppError::Validation("expected a file, got a directory".into()));
    }
    let bytes = fs::read(abs).map_err(|e| AppError::Validation(format!("read failed: {e}")))?;
    if bytes.len() > MAX_READ_BYTES {
        return Err(AppError::Validation(format!(
            "file exceeds {} KB — attach a smaller file",
            MAX_READ_BYTES / 1024
        )));
    }
    let full = String::from_utf8(bytes)
        .map_err(|_| AppError::Validation("file is not valid UTF-8 text".into()))?;
    let lines: Vec<&str> = full.lines().collect();
    let total = lines.len().max(1) as u32;
    let display = abs.to_string_lossy().replace('\\', "/");
    let lang = detect_language(Some(&display), Some(&full));
    Ok(FileContentDto {
        path: display,
        content_hash: content_hash(&full),
        content: full,
        line_count: total,
        language_id: lang,
        line_start: 1,
        line_end: total,
    })
}

pub fn read_file_range(
    workspace_root: &Path,
    rel: &str,
    start_line: Option<u32>,
    end_line: Option<u32>,
) -> AppResult<FileContentDto> {
    let abs = resolve_under_root(workspace_root, rel)?;
    if abs.is_dir() {
        return Err(AppError::Validation("expected a file, got a directory".into()));
    }
    let bytes = fs::read(&abs).map_err(|e| AppError::Validation(format!("read failed: {e}")))?;
    if bytes.len() > MAX_READ_BYTES {
        return Err(AppError::Validation(format!(
            "file exceeds {} KB — use a line range",
            MAX_READ_BYTES / 1024
        )));
    }
    let full = String::from_utf8(bytes)
        .map_err(|_| AppError::Validation("file is not valid UTF-8 text".into()))?;
    let lines: Vec<&str> = full.lines().collect();
    let total = lines.len().max(1) as u32;
    let start = start_line.unwrap_or(1).max(1);
    let end = end_line.unwrap_or(total).min(total);
    if start > end {
        return Err(AppError::Validation("invalid line range".into()));
    }
    let slice: String = lines
        .get((start - 1) as usize..end as usize)
        .unwrap_or(&[])
        .join("\n");
    let display = rel_display_path(workspace_root, &abs);
    let lang = detect_language(Some(&display), Some(&slice));
    Ok(FileContentDto {
        path: display,
        content_hash: content_hash(&full),
        content: slice,
        line_count: total,
        language_id: lang,
        line_start: start,
        line_end: end,
    })
}

pub fn write_file_checked(
    workspace_root: &Path,
    rel: &str,
    content: &str,
    expected_hash: Option<&str>,
) -> AppResult<String> {
    let abs = resolve_under_root(workspace_root, rel)?;
    if abs.is_dir() {
        return Err(AppError::Validation("expected a file, got a directory".into()));
    }
    if let Some(expected) = expected_hash.filter(|s| !s.is_empty()) {
        if abs.exists() {
            let current = fs::read_to_string(&abs)
                .map_err(|e| AppError::Validation(format!("read failed: {e}")))?;
            let hash = content_hash(&current);
            if hash != expected {
                return Err(AppError::Validation(
                    "file changed on disk since it was loaded — reload and try again".into(),
                ));
            }
        }
    }
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| AppError::Validation(format!("create parent failed: {e}")))?;
    }
    fs::write(&abs, content).map_err(|e| AppError::Validation(format!("write failed: {e}")))?;
    Ok(content_hash(content))
}

pub fn list_dir_recursive(
    workspace_root: &Path,
    rel: &str,
    max_depth: u32,
    max_entries: usize,
) -> AppResult<Vec<String>> {
    let base = resolve_under_root(workspace_root, rel)?;
    if !base.is_dir() {
        return Err(AppError::Validation("not a directory".into()));
    }
    let root = fs::canonicalize(workspace_root).map_err(|e| {
        AppError::Validation(format!("workspace root invalid: {e}"))
    })?;
    let mut out = Vec::new();
    walk_dir(&root, &base, 0, max_depth, max_entries, &mut out)?;
    out.sort();
    Ok(out)
}

fn walk_dir(
    root: &Path,
    dir: &Path,
    depth: u32,
    max_depth: u32,
    max_entries: usize,
    out: &mut Vec<String>,
) -> AppResult<()> {
    if out.len() >= max_entries {
        return Ok(());
    }
    if depth > max_depth {
        return Ok(());
    }
    let read = fs::read_dir(dir).map_err(|e| AppError::Validation(format!("list failed: {e}")))?;
    for entry in read {
        if out.len() >= max_entries {
            break;
        }
        let entry = entry.map_err(|e| AppError::Validation(format!("list failed: {e}")))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name == "node_modules"
            || name == "vendor"
            || name == ".git"
            || name == "target"
            || name.starts_with('.')
        {
            continue;
        }
        let rel = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        if path.is_dir() {
            out.push(format!("{rel}/"));
            walk_dir(root, &path, depth + 1, max_depth, max_entries, out)?;
        } else {
            out.push(rel);
        }
    }
    Ok(())
}

pub fn count_lines(path: &Path) -> AppResult<u32> {
    let f = fs::File::open(path).map_err(|e| AppError::Validation(format!("read failed: {e}")))?;
    let reader = BufReader::new(f);
    Ok(reader.lines().count().max(1) as u32)
}
