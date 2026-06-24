//! Technical specification (ТЗ) helpers for autonomous runs.

pub const DEFAULT_SPEC_PATH: &str = "docs/spec.md";
pub const SPEC_COMPLIANCE_TAG: &str = "spec-compliance";

/// Extract inner text from `<spec-compliance>...</spec-compliance>`.
pub fn extract_spec_compliance(text: &str) -> Option<String> {
    extract_tag(text, SPEC_COMPLIANCE_TAG)
}

/// True when the relative path looks like a spec / design document.
pub fn is_spec_path(path: &str) -> bool {
    let norm = path
        .replace('\\', "/")
        .trim()
        .trim_start_matches("./")
        .to_ascii_lowercase();
    let base = norm.rsplit('/').next().unwrap_or(norm.as_str());
    let stem = base.rsplit_once('.').map(|(s, _)| s).unwrap_or(base);
    matches!(stem, "spec" | "design" | "tz" | "requirements" | "architecture")
        || stem.contains("spec")
        || stem.contains("design")
        || base == "requirements.md"
}

/// Pick the best spec path from assistant turn text (fences + write_file tool results).
pub fn detect_spec_path_from_turn(text: &str, current: Option<&str>) -> Option<String> {
    if let Some(path) = current.filter(|p| !p.trim().is_empty()) {
        return Some(path.trim().to_string());
    }

    for (path, content) in crate::app::harness::extract_generated_file_fences(text) {
        if !content.trim().is_empty() && is_spec_path(&path) {
            return Some(path);
        }
    }

    for path in extract_write_file_paths(text) {
        if is_spec_path(&path) {
            return Some(path);
        }
    }

    None
}

fn extract_write_file_paths(text: &str) -> Vec<String> {
    let mut paths = Vec::new();
    for chunk in text.split("[Tool result:").skip(1) {
        if !chunk.contains("write_file") {
            continue;
        }
        for line in chunk.lines().take(40) {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("\"path\":") {
                let value = rest.trim().trim_matches(|c| c == '"' || c == ',' || c == '\'');
                if !value.is_empty() && !value.contains("..") {
                    paths.push(value.to_string());
                }
            } else if let Some((_, value)) = trimmed.split_once("\"path\": \"") {
                let value = value.split('"').next().unwrap_or("").trim();
                if !value.is_empty() && !value.contains("..") {
                    paths.push(value.to_string());
                }
            }
        }
    }
    paths
}

fn extract_tag(text: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = text.find(&open)? + open.len();
    let end = text[start..].find(&close)? + start;
    let inner = text[start..end].trim();
    if inner.is_empty() {
        None
    } else {
        Some(inner.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_spec_paths() {
        assert!(is_spec_path("docs/spec.md"));
        assert!(is_spec_path("design.md"));
        assert!(!is_spec_path("src/main.rs"));
    }

    #[test]
    fn extracts_spec_compliance_block() {
        let text = "done\n<spec-compliance>\nR1: met\nR2: partial\n</spec-compliance>";
        let inner = extract_spec_compliance(text).unwrap();
        assert!(inner.contains("R1: met"));
    }
}
