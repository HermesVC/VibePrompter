//! Workspace settings, filesystem tools, and apply-policy orchestration.

use std::path::{Path, PathBuf};

use crate::storage::repositories::SettingsRepo;
use crate::utils::{AppError, AppResult};
use crate::workspace::symbols::{format_outline_text, outline_for_file};
use crate::workspace::{
    compose_system_prompt, compose_system_prompt_with_opts, extract_snippet_output,
    list_dir_recursive, list_modifiers, read_file_range, write_file_checked, ChatContextPayload,
    ChatModifierInfo, FileContentDto, FolderScopeDto, PolicyDecision, PolicyEngine,
    WorkspaceSettings, WritePreviewDto, WriteResultDto, WORKSPACE_SETTINGS_KEY,
};

#[derive(Clone)]
pub struct WorkspaceService {
    settings_repo: SettingsRepo,
}

impl WorkspaceService {
    pub fn new(settings_repo: SettingsRepo) -> Self {
        Self { settings_repo }
    }

    pub async fn get_settings(&self) -> AppResult<WorkspaceSettings> {
        let raw = self.settings_repo.get_one(WORKSPACE_SETTINGS_KEY).await?;
        match raw {
            Some(json) => serde_json::from_str(&json)
                .map_err(|e| AppError::Validation(format!("workspace settings corrupt: {e}"))),
            None => Ok(WorkspaceSettings::default()),
        }
    }

    pub async fn save_settings(&self, settings: &WorkspaceSettings) -> AppResult<()> {
        let json = serde_json::to_string(settings)
            .map_err(|e| AppError::Validation(format!("serialize settings: {e}")))?;
        self.settings_repo
            .upsert(WORKSPACE_SETTINGS_KEY, &json)
            .await
    }

    pub fn list_modifiers(&self) -> Vec<ChatModifierInfo> {
        list_modifiers()
    }

    pub fn compose_system(&self, base_mode_sys: &str, ctx: &ChatContextPayload) -> String {
        compose_system_prompt(base_mode_sys, ctx)
    }

    pub fn compose_system_with_opts(
        &self,
        base_mode_sys: &str,
        ctx: &ChatContextPayload,
        opts: crate::workspace::ComposeSystemOptions,
    ) -> String {
        compose_system_prompt_with_opts(base_mode_sys, ctx, opts)
    }

    pub fn extract_snippet(&self, text: &str) -> String {
        extract_snippet_output(text)
    }

    fn workspace_path(&self, settings: &WorkspaceSettings) -> PathBuf {
        PathBuf::from(settings.workspace_root.trim())
    }

    pub async fn read_file(
        &self,
        path: &str,
        start_line: Option<u32>,
        end_line: Option<u32>,
    ) -> AppResult<FileContentDto> {
        let settings = self.get_settings().await?;
        let root = self.workspace_path(&settings);
        read_file_range(&root, path, start_line, end_line)
    }

    pub async fn list_dir(&self, path: &str, depth: u32) -> AppResult<Vec<String>> {
        let settings = self.get_settings().await?;
        let root = self.workspace_path(&settings);
        list_dir_recursive(&root, path, depth, 1500)
    }

    pub async fn build_workspace_tree_summary(&self) -> AppResult<String> {
        let entries = self.list_dir("", 3).await?;
        if entries.is_empty() {
            return Ok("(empty workspace)".into());
        }
        Ok(cap_tree_lines(&entries, 10_000))
    }

    /// Load folder scope: directory tree + symbol outlines for PHP/JS/Python files.
    pub async fn load_folder_scope(
        &self,
        path: &str,
        max_content_chars: u32,
    ) -> AppResult<FolderScopeDto> {
        let max_chars = max_content_chars.max(1024) as usize;
        let settings = self.get_settings().await?;
        let root = self.workspace_path(&settings);
        let rel = normalize_folder_scope_path(&root, path.trim().trim_matches('/'));
        let entries = list_dir_recursive(&root, &rel, 3, 1500)?;
        let tree_summary = if entries.is_empty() {
            "(empty folder)".into()
        } else {
            cap_tree_lines(&entries, 10_000)
        };

        let mut outline_parts: Vec<String> = Vec::new();
        let mut used = 0usize;
        let mut truncated = false;

        for entry in &entries {
            if entry.ends_with('/') {
                continue;
            }
            let outline = match read_file_range(&root, entry, None, None) {
                Ok(f) => outline_for_file(&f.path, &f.content),
                Err(_) => continue,
            };
            if !outline.parseable {
                continue;
            }
            let block = format_outline_text(&outline);
            let block_len = block.chars().count() + 2;
            if !outline_parts.is_empty() && used.saturating_add(block_len) > max_chars {
                truncated = true;
                break;
            }
            used += block_len;
            outline_parts.push(block);
        }

        let outline_summary = if outline_parts.is_empty() {
            "(no PHP/JS/Python symbol outlines in this folder)".into()
        } else {
            outline_parts.join("\n\n")
        };

        Ok(FolderScopeDto {
            path: if rel.is_empty() { ".".into() } else { rel },
            tree_summary,
            outline_summary,
            files: Vec::new(),
            truncated,
        })
    }

    pub async fn preview_write(
        &self,
        path: &str,
        new_content: &str,
        expected_hash: Option<String>,
    ) -> AppResult<WritePreviewDto> {
        let settings = self.get_settings().await?;
        let decision = PolicyEngine::evaluate_write(&settings, path);
        let root = self.workspace_path(&settings);
        let hash_before = if expected_hash.as_deref().filter(|s| !s.is_empty()).is_some() {
            expected_hash.clone()
        } else if let Ok(existing) = read_file_range(&root, path, None, None) {
            Some(existing.content_hash)
        } else {
            None
        };
        let lines_after = new_content.lines().count().max(1) as u32;
        let lines_before = hash_before
            .as_ref()
            .and_then(|_| {
                read_file_range(&root, path, None, None)
                    .ok()
                    .map(|f| f.line_count)
            })
            .unwrap_or(0);
        Ok(WritePreviewDto {
            path: path.to_string(),
            decision: decision.into(),
            content_hash_before: hash_before,
            line_count_before: lines_before,
            line_count_after: lines_after,
        })
    }

    pub async fn apply_write(
        &self,
        path: &str,
        new_content: &str,
        expected_hash: Option<String>,
        force: bool,
    ) -> AppResult<WriteResultDto> {
        let settings = self.get_settings().await?;
        let decision = PolicyEngine::evaluate_write(&settings, path);
        if decision == PolicyDecision::Deny {
            return Err(AppError::Validation(
                "write denied by workspace policy (deny list or allow-list)".into(),
            ));
        }
        if decision == PolicyDecision::Ask && !force {
            return Err(AppError::Validation(
                "write requires confirmation — call with force after user approval".into(),
            ));
        }
        let root = self.workspace_path(&settings);
        let hash = write_file_checked(&root, path, new_content, expected_hash.as_deref())?;
        Ok(WriteResultDto {
            path: path.to_string(),
            content_hash: hash,
            applied: true,
        })
    }
}

fn cap_tree_lines(entries: &[String], max_chars: usize) -> String {
    let mut out = String::new();
    for entry in entries {
        if !out.is_empty() {
            out.push('\n');
        }
        if out.chars().count() + entry.chars().count() + 48 > max_chars {
            let n = entries.len();
            let shown = out.lines().count();
            return format!("{out}\n… ({shown} of {n} entries, tree truncated)");
        }
        out.push_str(entry);
    }
    out
}

fn normalize_folder_scope_path(workspace_root: &Path, path: &str) -> String {
    let rel = path.trim().trim_matches('/');
    if rel.is_empty() {
        return String::new();
    }
    let path_buf = Path::new(rel);
    if !path_buf.is_absolute() {
        return rel.to_string();
    }
    let Ok(root) = std::fs::canonicalize(workspace_root) else {
        return rel.to_string();
    };
    let Ok(abs) = std::fs::canonicalize(path_buf) else {
        return rel.to_string();
    };
    abs.strip_prefix(&root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| rel.to_string())
}
