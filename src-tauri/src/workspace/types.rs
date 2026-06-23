//! Shared workspace / chat-context types (IPC-safe).

use serde::{Deserialize, Serialize};

pub const WORKSPACE_SETTINGS_KEY: &str = "workspace_config";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSettings {
    #[serde(default)]
    pub workspace_root: String,
    /// `always_ask` | `always_apply` | `allow_list_only`
    #[serde(default = "default_apply_policy")]
    pub apply_policy: String,
    #[serde(default)]
    pub allow_paths: Vec<String>,
    #[serde(default)]
    pub allow_globs: Vec<String>,
    #[serde(default)]
    pub allow_dirs: Vec<String>,
    #[serde(default)]
    pub allow_extensions: Vec<String>,
    #[serde(default = "default_deny_globs")]
    pub deny_globs: Vec<String>,
}

fn default_apply_policy() -> String {
    "always_ask".into()
}

fn default_deny_globs() -> Vec<String> {
    vec![
        ".env".into(),
        "**/.env".into(),
        "**/vendor/**".into(),
        "**/node_modules/**".into(),
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatModifierInfo {
    pub id: String,
    pub label: String,
    pub description: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatContextPayload {
    #[serde(default)]
    pub scope: ChatScope,
    #[serde(default)]
    pub modifiers: Vec<String>,
    #[serde(default)]
    pub language_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ChatScope {
    #[default]
    None,
    Snippet {
        original: String,
        working: String,
        #[serde(default)]
        path: Option<String>,
        #[serde(default)]
        line_start: Option<u32>,
        #[serde(default)]
        line_end: Option<u32>,
        #[serde(default)]
        language_id: Option<String>,
    },
    File {
        path: String,
        content: String,
        #[serde(default)]
        content_hash: String,
        #[serde(default = "one")]
        line_start: u32,
        #[serde(default = "one")]
        line_end: u32,
        #[serde(default)]
        language_id: Option<String>,
    },
    Workspace {
        #[serde(default)]
        tree_summary: Option<String>,
    },
    Folder {
        path: String,
        #[serde(default)]
        tree_summary: String,
        #[serde(default)]
        files: Vec<FolderScopeFile>,
        #[serde(default)]
        truncated: bool,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderScopeFile {
    pub path: String,
    pub content: String,
    #[serde(default)]
    pub content_hash: String,
    #[serde(default)]
    pub language_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderScopeDto {
    pub path: String,
    pub tree_summary: String,
    pub files: Vec<FolderScopeFile>,
    pub truncated: bool,
}

fn one() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContentDto {
    pub path: String,
    pub content: String,
    pub content_hash: String,
    pub line_count: u32,
    pub language_id: String,
    pub line_start: u32,
    pub line_end: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WritePreviewDto {
    pub path: String,
    pub decision: PolicyDecisionDto,
    pub content_hash_before: Option<String>,
    pub line_count_before: u32,
    pub line_count_after: u32,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PolicyDecisionDto {
    Allow,
    Ask,
    Deny,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteResultDto {
    pub path: String,
    pub content_hash: String,
    pub applied: bool,
}
