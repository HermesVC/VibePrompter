//! Workspace / chat-context IPC commands.

use std::path::PathBuf;

use tauri::{AppHandle, State};
use tauri_plugin_dialog::{DialogExt, FilePath};

use crate::app::AppState;
use crate::utils::AppError;
use crate::workspace::{
    ChatContextPayload, ChatModifierInfo, FileContentDto, WorkspaceSettings, WritePreviewDto,
    WriteResultDto,
};

#[tauri::command]
pub async fn get_workspace_settings(
    state: State<'_, AppState>,
) -> Result<WorkspaceSettings, AppError> {
    state.workspace.get_settings().await
}

#[tauri::command]
pub async fn save_workspace_settings(
    state: State<'_, AppState>,
    settings: WorkspaceSettings,
) -> Result<(), AppError> {
    state.workspace.save_settings(&settings).await
}

#[tauri::command]
pub fn list_chat_modifiers(state: State<'_, AppState>) -> Result<Vec<ChatModifierInfo>, AppError> {
    Ok(state.workspace.list_modifiers())
}

#[tauri::command]
pub async fn read_workspace_file(
    state: State<'_, AppState>,
    path: String,
    start_line: Option<u32>,
    end_line: Option<u32>,
) -> Result<FileContentDto, AppError> {
    state
        .workspace
        .read_file(path.trim(), start_line, end_line)
        .await
}

#[tauri::command]
pub async fn list_workspace_dir(
    state: State<'_, AppState>,
    path: Option<String>,
    depth: Option<u32>,
) -> Result<Vec<String>, AppError> {
    state
        .workspace
        .list_dir(path.unwrap_or_default().as_str(), depth.unwrap_or(2))
        .await
}

#[tauri::command]
pub async fn workspace_tree_summary(state: State<'_, AppState>) -> Result<String, AppError> {
    state.workspace.build_workspace_tree_summary().await
}

#[tauri::command]
pub async fn pick_workspace_root(app: AppHandle) -> Result<Option<String>, AppError> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<FilePath>>();
    app.dialog()
        .file()
        .set_title("Select workspace folder")
        .pick_folder(move |path| {
            let _ = tx.send(path);
        });
    let path = rx
        .await
        .map_err(|_| AppError::Config("dialog closed".into()))?;
    Ok(path.and_then(|p| match p {
        FilePath::Path(pb) => Some(pb.to_string_lossy().to_string()),
        #[allow(unused)]
        FilePath::Url(url) => Some(url.to_string()),
    }))
}

#[tauri::command]
pub async fn pick_workspace_file(app: AppHandle) -> Result<Option<String>, AppError> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<FilePath>>();
    app.dialog()
        .file()
        .set_title("Attach file from workspace")
        .pick_file(move |path| {
            let _ = tx.send(path);
        });
    let path = rx
        .await
        .map_err(|_| AppError::Config("dialog closed".into()))?;
    Ok(path.and_then(|p| match p {
        FilePath::Path(pb) => Some(pb.to_string_lossy().to_string()),
        #[allow(unused)]
        FilePath::Url(url) => Some(url.to_string()),
    }))
}

#[tauri::command]
pub async fn load_folder_scope(
    state: State<'_, AppState>,
    path: String,
    max_content_chars: Option<u32>,
) -> Result<crate::workspace::FolderScopeDto, AppError> {
    state
        .workspace
        .load_folder_scope(&path, max_content_chars.unwrap_or(12_000))
        .await
}

#[tauri::command]
pub async fn pick_workspace_folder(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<String>, AppError> {
    let settings = state.workspace.get_settings().await?;
    let root = settings.workspace_root.trim();
    if root.is_empty() {
        return Err(AppError::Validation(
            "workspace root is not configured — set it in Settings → Workspace".into(),
        ));
    }
    let root_pb = PathBuf::from(root);
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<FilePath>>();
    app.dialog()
        .file()
        .set_title("Select folder in workspace")
        .set_directory(&root_pb)
        .pick_folder(move |path| {
            let _ = tx.send(path);
        });
    let path = rx
        .await
        .map_err(|_| AppError::Config("dialog closed".into()))?;
    let Some(picked) = path else {
        return Ok(None);
    };
    let abs = match picked {
        FilePath::Path(pb) => pb,
        #[allow(unused)]
        FilePath::Url(url) => PathBuf::from(url.to_string()),
    };
    let canon_root = std::fs::canonicalize(&root_pb)
        .map_err(|e| AppError::Validation(format!("workspace root invalid: {e}")))?;
    let canon_picked = std::fs::canonicalize(&abs)
        .map_err(|e| AppError::Validation(format!("folder not found: {e}")))?;
    if !canon_picked.starts_with(&canon_root) {
        return Err(AppError::Validation(
            "selected folder is outside the workspace root".into(),
        ));
    }
    if !canon_picked.is_dir() {
        return Err(AppError::Validation("expected a directory".into()));
    }
    let rel = canon_picked
        .strip_prefix(&canon_root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| crate::workspace::rel_display_path(&root_pb, &canon_picked));
    let rel = rel.trim_matches('/').to_string();
    Ok(Some(if rel.is_empty() { ".".into() } else { rel }))
}

#[tauri::command]
pub async fn preview_workspace_write(
    state: State<'_, AppState>,
    path: String,
    content: String,
    content_hash: Option<String>,
) -> Result<WritePreviewDto, AppError> {
    state
        .workspace
        .preview_write(&path, &content, content_hash)
        .await
}

#[tauri::command]
pub async fn apply_workspace_write(
    state: State<'_, AppState>,
    path: String,
    content: String,
    content_hash: Option<String>,
    force: bool,
) -> Result<WriteResultDto, AppError> {
    state
        .workspace
        .apply_write(&path, &content, content_hash, force)
        .await
}

#[tauri::command]
pub async fn resolve_workspace_file_path(
    state: State<'_, AppState>,
    absolute_path: String,
) -> Result<FileContentDto, AppError> {
    let abs = PathBuf::from(absolute_path.trim());
    let settings = state.workspace.get_settings().await?;
    let root = PathBuf::from(settings.workspace_root.trim());
    if root.as_os_str().is_empty() {
        return crate::workspace::read_absolute_file_for_context(&abs);
    }
    let rel = crate::workspace::rel_display_path(&root, &abs);
    state.workspace.read_file(&rel, None, None).await
}

#[tauri::command]
pub fn compose_chat_context_prompt(
    state: State<'_, AppState>,
    mode_system_prompt: String,
    chat_context: ChatContextPayload,
) -> Result<String, AppError> {
    let tools_active = crate::chat::scope_enables_tools(&chat_context.scope);
    Ok(state.workspace.compose_system_with_opts(
        &mode_system_prompt,
        &chat_context,
        crate::workspace::ComposeSystemOptions { tools_active },
    ))
}

#[tauri::command]
pub async fn harness_run_deterministic(
    state: State<'_, AppState>,
) -> Result<crate::app::harness::HarnessDeterministicReport, AppError> {
    crate::app::harness::run_deterministic_checks(&state).await
}

#[tauri::command]
pub async fn harness_check_workspace_files(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<serde_json::Value, AppError> {
    let settings = state.workspace.get_settings().await?;
    let root = settings.workspace_root.trim();
    let refs: Vec<&str> = paths.iter().map(String::as_str).collect();
    let (present, missing) = crate::app::harness::check_workspace_files(root, &refs);
    Ok(serde_json::json!({ "present": present, "missing": missing }))
}

#[tauri::command]
pub async fn harness_apply_generated_fences(
    state: State<'_, AppState>,
    text: String,
) -> Result<Vec<String>, AppError> {
    crate::app::harness::harness_apply_generated_fences(&state, &text).await
}
