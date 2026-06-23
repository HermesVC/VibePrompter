//! Workspace / chat-context IPC commands.

use std::path::PathBuf;

use tauri::{AppHandle, State};
use tauri_plugin_dialog::{DialogExt, FilePath};

use crate::app::AppState;
use crate::utils::AppError;
use crate::workspace::{
    ChatContextPayload, ChatModifierInfo, FileContentDto, WritePreviewDto, WriteResultDto,
    WorkspaceSettings,
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
    let settings = state.workspace.get_settings().await?;
    let root = PathBuf::from(settings.workspace_root.trim());
    if root.as_os_str().is_empty() {
        return Err(AppError::Validation(
            "configure workspace root in Settings → Workspace".into(),
        ));
    }
    let abs = PathBuf::from(absolute_path.trim());
    let rel = crate::workspace::rel_display_path(&root, &abs);
    state.workspace.read_file(&rel, None, None).await
}

#[tauri::command]
pub fn compose_chat_context_prompt(
    state: State<'_, AppState>,
    mode_system_prompt: String,
    chat_context: ChatContextPayload,
) -> Result<String, AppError> {
    Ok(state
        .workspace
        .compose_system(&mode_system_prompt, &chat_context))
}
