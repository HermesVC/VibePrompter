//! Execution context passed into workspace agent tools.

use crate::services::WorkspaceService;
use crate::workspace::WorkspaceSettings;

#[derive(Clone)]
pub struct ToolExecutionContext {
    pub workspace: WorkspaceService,
    pub settings: WorkspaceSettings,
    /// When set (folder scope), tool paths must stay under this relative prefix.
    pub scope_path: Option<String>,
}

impl ToolExecutionContext {
    pub fn scope_prefix(&self) -> Option<&str> {
        self.scope_path
            .as_deref()
            .filter(|s| !s.is_empty() && *s != ".")
    }
}
