//! Launch Google Chrome on the local machine.

use std::path::Path;
use std::process::Command;

use serde_json::{json, Value};

use crate::providers::prompt_format::ToolDefinition;
use crate::utils::{AppError, AppResult};

use super::ToolExecutionResult;

pub const NAME: &str = "launch_chrome";

pub fn tool_definition() -> ToolDefinition {
    ToolDefinition {
        name: NAME.into(),
        description: "Open Google Chrome with an optional URL. Use for web lookups or testing.".into(),
        parameters: json!({
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "http(s) URL to open. Defaults to https://www.google.com"
                },
                "new_window": {
                    "type": "boolean",
                    "description": "When true, opens a new Chrome window"
                }
            }
        }),
    }
}

pub fn execute(arguments: Value) -> AppResult<ToolExecutionResult> {
    let url = arguments
        .get("url")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("https://www.google.com");
    validate_url(url)?;

    let new_window = arguments
        .get("new_window")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let message = launch_chrome_process(url, new_window)?;
    Ok(ToolExecutionResult {
        name: NAME.into(),
        ok: true,
        output: json!({ "url": url, "newWindow": new_window }),
        message,
    })
}

fn validate_url(url: &str) -> AppResult<()> {
    let lower = url.to_lowercase();
    if lower.starts_with("https://") || lower.starts_with("http://") {
        Ok(())
    } else {
        Err(AppError::Validation(
            "url must start with http:// or https://".into(),
        ))
    }
}

fn launch_chrome_process(url: &str, new_window: bool) -> AppResult<String> {
    #[cfg(target_os = "windows")]
    {
        let mut candidates: Vec<String> = vec![
            r"C:\Program Files\Google\Chrome\Application\chrome.exe".into(),
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe".into(),
        ];
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            candidates.push(format!(
                r"{local}\Google\Chrome\Application\chrome.exe"
            ));
        }
        for path in &candidates {
            if Path::new(path).is_file() {
                let mut cmd = Command::new(path);
                if new_window {
                    cmd.arg("--new-window");
                }
                cmd.arg(url);
                cmd.spawn()
                    .map_err(|e| AppError::Config(format!("chrome spawn: {e}")))?;
                return Ok(format!("Chrome started ({path}) → {url}"));
            }
        }
        Command::new("cmd")
            .args(["/C", "start", "", "chrome", url])
            .spawn()
            .map_err(|e| AppError::Config(format!("chrome via start: {e}")))?;
        return Ok(format!("Chrome started via shell → {url}"));
    }

    #[cfg(target_os = "macos")]
    {
        let mut cmd = Command::new("open");
        cmd.args(["-a", "Google Chrome", url]);
        cmd.spawn()
            .map_err(|e| AppError::Config(format!("chrome open: {e}")))?;
        return Ok(format!("Chrome started → {url}"));
    }

    #[cfg(target_os = "linux")]
    {
        for bin in ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"] {
            if Command::new(bin)
                .arg(url)
                .spawn()
                .is_ok()
            {
                return Ok(format!("{bin} started → {url}"));
            }
        }
        return Err(AppError::Config(
            "Chrome/Chromium not found on PATH".into(),
        ));
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = (url, new_window);
        Err(AppError::Config("launch_chrome unsupported on this OS".into()))
    }
}
