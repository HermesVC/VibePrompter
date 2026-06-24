//! LM Studio / local server prompt-template failures (often flaky Jinja).

use crate::utils::AppError;

pub const JINJA_PROMPT_MAX_RETRIES: usize = 3;

pub fn is_jinja_prompt_template_error(err: &AppError) -> bool {
    let msg = err.to_string().to_ascii_lowercase();
    msg.contains("jinja") || msg.contains("no user query found") || msg.contains("prompt template")
}

/// Short text for UI tooltips while retrying (not the full vendor essay).
pub fn prompt_template_error_summary(err: &AppError) -> String {
    let msg = err.to_string();
    if let Some(start) = msg.find('"') {
        let rest = &msg[start + 1..];
        if let Some(end) = rest.find('"') {
            let inner = rest[..end].trim();
            if !inner.is_empty() && inner.len() <= 200 {
                return inner.to_string();
            }
        }
    }
    if let Some(idx) = msg.to_ascii_lowercase().find("jinja template") {
        return msg[idx..].chars().take(160).collect();
    }
    msg.chars().take(160).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::AppError;

    #[test]
    fn detects_jinja_stream_error() {
        let e = AppError::Validation(
            r#"stream · Error rendering prompt with jinja template: "No user query found in messages.""#
                .into(),
        );
        assert!(is_jinja_prompt_template_error(&e));
        assert_eq!(
            prompt_template_error_summary(&e),
            "No user query found in messages."
        );
    }
}
