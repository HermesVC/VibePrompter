//! Apply-policy evaluation for mutating filesystem tools.

use std::path::Path;

use glob::Pattern;

use super::types::{PolicyDecisionDto, WorkspaceSettings};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyDecision {
    Allow,
    Ask,
    Deny,
}

impl From<PolicyDecision> for PolicyDecisionDto {
    fn from(d: PolicyDecision) -> Self {
        match d {
            PolicyDecision::Allow => PolicyDecisionDto::Allow,
            PolicyDecision::Ask => PolicyDecisionDto::Ask,
            PolicyDecision::Deny => PolicyDecisionDto::Deny,
        }
    }
}

pub struct PolicyEngine;

impl PolicyEngine {
    pub fn evaluate_write(settings: &WorkspaceSettings, rel_path: &str) -> PolicyDecision {
        let normalized = normalize_rel(rel_path);
        if matches_deny(&settings.deny_globs, &normalized) {
            return PolicyDecision::Deny;
        }

        match settings.apply_policy.as_str() {
            "always_apply" => PolicyDecision::Allow,
            "allow_list_only" => {
                if matches_allow(settings, &normalized) {
                    PolicyDecision::Allow
                } else {
                    PolicyDecision::Deny
                }
            }
            _ => {
                if matches_allow(settings, &normalized) {
                    PolicyDecision::Allow
                } else {
                    PolicyDecision::Ask
                }
            }
        }
    }
}

fn normalize_rel(path: &str) -> String {
    path.replace('\\', "/")
        .trim_start_matches("./")
        .to_string()
}

fn matches_deny(patterns: &[String], path: &str) -> bool {
    patterns.iter().any(|p| glob_match(p, path))
}

fn matches_allow(settings: &WorkspaceSettings, path: &str) -> bool {
    if settings.allow_paths.iter().any(|p| normalize_rel(p) == path) {
        return true;
    }
    if settings
        .allow_dirs
        .iter()
        .any(|d| path.starts_with(&normalize_rel(d).trim_end_matches('/')))
    {
        return true;
    }
    if let Some(ext) = Path::new(path).extension().and_then(|e| e.to_str()) {
        let ext = format!(".{}", ext.to_ascii_lowercase());
        if settings
            .allow_extensions
            .iter()
            .any(|e| e.eq_ignore_ascii_case(&ext) || e.eq_ignore_ascii_case(ext.trim_start_matches('.')))
        {
            return true;
        }
    }
    if settings
        .allow_globs
        .iter()
        .any(|g| glob_match(g, path))
    {
        return true;
    }
    false
}

fn glob_match(pattern: &str, path: &str) -> bool {
    let pat = pattern.replace('\\', "/");
    Pattern::new(&pat)
        .map(|p| p.matches(path))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deny_env_files() {
        let s = WorkspaceSettings::default();
        assert_eq!(
            PolicyEngine::evaluate_write(&s, ".env"),
            PolicyDecision::Deny
        );
        assert_eq!(
            PolicyEngine::evaluate_write(&s, "config/.env"),
            PolicyDecision::Deny
        );
    }

    #[test]
    fn allow_list_only_blocks_unknown() {
        let mut s = WorkspaceSettings::default();
        s.apply_policy = "allow_list_only".into();
        s.allow_dirs = vec!["service/".into()];
        assert_eq!(
            PolicyEngine::evaluate_write(&s, "service/lang/ru.php"),
            PolicyDecision::Allow
        );
        assert_eq!(
            PolicyEngine::evaluate_write(&s, "other/file.php"),
            PolicyDecision::Deny
        );
    }
}
