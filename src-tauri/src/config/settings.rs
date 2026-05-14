//! Process/environment configuration — distinct from the user-facing `settings`
//! table. Resolved once at startup from the OS app-data directory.

use std::path::{Path, PathBuf};

use crate::utils::AppResult;

#[derive(Debug, Clone)]
pub struct Config {
    pub app_data_dir: PathBuf,
    pub db_path: PathBuf,
    pub log_dir: PathBuf,
    pub debug_mode: bool,
    pub log_level: String,
}

impl Config {
    /// Build a `Config` rooted at `app_data_dir`, creating the directory tree if needed.
    pub fn from_app_data_dir(app_data_dir: &Path) -> AppResult<Self> {
        let log_dir = app_data_dir.join("logs");
        std::fs::create_dir_all(&log_dir)?;
        let debug_mode = cfg!(debug_assertions);
        Ok(Self {
            db_path: app_data_dir.join("vibeprompter.db"),
            log_dir,
            app_data_dir: app_data_dir.to_path_buf(),
            debug_mode,
            log_level: if debug_mode { "debug".into() } else { "info".into() },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_paths_and_creates_log_dir() {
        let tmp = std::env::temp_dir().join(format!("vp-cfg-{}", std::process::id()));
        let cfg = Config::from_app_data_dir(&tmp).unwrap();
        assert_eq!(cfg.db_path, tmp.join("vibeprompter.db"));
        assert!(cfg.log_dir.exists());
        std::fs::remove_dir_all(&tmp).ok();
    }
}
