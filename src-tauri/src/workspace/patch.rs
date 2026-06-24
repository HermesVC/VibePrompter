//! Deterministic search/replace patches — model supplies anchors, tool applies.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PatchEdit {
    pub old_text: String,
    pub new_text: String,
}

/// Limits enforced by `apply_patch` (from workspace settings).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PatchLimits {
    pub max_old_lines: usize,
    pub max_new_lines: usize,
    pub max_old_chars: usize,
    pub rewrite_min_lines: usize,
    /// Fraction of `old_text` lines that differ positionally from `new_text` (0.0–1.0).
    pub rewrite_change_ratio: f64,
}

impl Default for PatchLimits {
    fn default() -> Self {
        Self {
            max_old_lines: 40,
            max_new_lines: 55,
            max_old_chars: 8_000,
            rewrite_min_lines: 24,
            rewrite_change_ratio: 0.88,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PatchPolicy {
    Strict,
    Warn,
    Off,
}

impl PatchPolicy {
    pub fn parse(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "warn" => Self::Warn,
            "off" | "none" => Self::Off,
            _ => Self::Strict,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EditMetrics {
    pub edit_index: usize,
    pub old_lines: usize,
    pub new_lines: usize,
    pub old_chars: usize,
    pub new_chars: usize,
    pub changed_lines: usize,
    pub likely_rewrite: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PatchValidation {
    pub metrics: Vec<EditMetrics>,
    pub violations: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PatchError {
    EmptyOldText {
        edit_index: usize,
    },
    NotFound {
        edit_index: usize,
        old_preview: String,
    },
    Ambiguous {
        edit_index: usize,
        occurrences: usize,
    },
}

impl PatchError {
    pub fn message(&self) -> String {
        match self {
            Self::EmptyOldText { edit_index } => {
                format!("edit #{edit_index}: old_text must not be empty")
            }
            Self::NotFound {
                edit_index,
                old_preview,
            } => format!(
                "edit #{edit_index}: old_text not found in file (preview: {old_preview:?})"
            ),
            Self::Ambiguous {
                edit_index,
                occurrences,
            } => format!(
                "edit #{edit_index}: old_text matches {occurrences} places — add more surrounding context"
            ),
        }
    }
}

/// Apply edits sequentially on `source`. Each `old_text` must match exactly once.
pub fn apply_patches(source: &str, edits: &[PatchEdit]) -> Result<String, PatchError> {
    let mut content = source.to_string();
    for (edit_index, edit) in edits.iter().enumerate() {
        if edit.old_text.is_empty() {
            return Err(PatchError::EmptyOldText { edit_index });
        }
        let (start, end) = find_unique_match(&content, &edit.old_text, edit_index)?;
        content.replace_range(start..end, &edit.new_text);
    }
    Ok(content)
}

fn find_unique_match(
    haystack: &str,
    needle: &str,
    edit_index: usize,
) -> Result<(usize, usize), PatchError> {
    for candidate in line_ending_match_candidates(haystack, needle) {
        if let Some(bounds) = unique_match_bounds(haystack, &candidate) {
            return Ok(bounds);
        }
    }
    let count = count_occurrences(haystack, needle);
    if count == 0 {
        let preview: String = needle.chars().take(80).collect();
        return Err(PatchError::NotFound {
            edit_index,
            old_preview: preview,
        });
    }
    Err(PatchError::Ambiguous {
        edit_index,
        occurrences: count,
    })
}

/// Try LF and CRLF variants when the model's `old_text` line endings differ from the file.
fn line_ending_match_candidates(haystack: &str, needle: &str) -> Vec<String> {
    let mut out = vec![needle.to_string()];
    let haystack_crlf = haystack.contains("\r\n");
    let needle_crlf = needle.contains("\r\n");
    if haystack_crlf && !needle_crlf && needle.contains('\n') {
        let alt = needle.replace('\n', "\r\n");
        if !out.contains(&alt) {
            out.push(alt);
        }
    }
    if !haystack_crlf && needle_crlf {
        let alt = needle.replace("\r\n", "\n");
        if !out.contains(&alt) {
            out.push(alt);
        }
    }
    out
}

fn unique_match_bounds(haystack: &str, needle: &str) -> Option<(usize, usize)> {
    let mut found: Option<usize> = None;
    let mut search_from = 0usize;
    while let Some(rel) = haystack[search_from..].find(needle) {
        let start = search_from + rel;
        if found.is_some() {
            return None;
        }
        found = Some(start);
        search_from = start + needle.len().max(1);
    }
    found.map(|start| (start, start + needle.len()))
}

fn count_occurrences(haystack: &str, needle: &str) -> usize {
    if needle.is_empty() {
        return 0;
    }
    let mut count = 0usize;
    let mut rest = haystack;
    while let Some(rel) = rest.find(needle) {
        count += 1;
        rest = &rest[rel + needle.len()..];
    }
    count
}

use super::types::WorkspaceSettings;

impl WorkspaceSettings {
    pub fn patch_limits(&self) -> PatchLimits {
        let max_old = self.patch_max_lines.clamp(1, 200) as usize;
        let defaults = PatchLimits::default();
        PatchLimits {
            max_old_lines: max_old,
            max_new_lines: max_old.saturating_add(15),
            max_old_chars: max_old.saturating_mul(200).clamp(1_500, 20_000),
            rewrite_min_lines: (max_old.saturating_mul(3) / 5).clamp(12, 50),
            rewrite_change_ratio: defaults.rewrite_change_ratio,
        }
    }

    pub fn patch_policy(&self) -> PatchPolicy {
        PatchPolicy::parse(&self.patch_policy)
    }
}

/// Measure and validate edits before applying. Returns violations (empty when OK).
pub fn validate_patch_edits(edits: &[PatchEdit], limits: PatchLimits) -> PatchValidation {
    let mut metrics = Vec::with_capacity(edits.len());
    let mut violations = Vec::new();

    for (edit_index, edit) in edits.iter().enumerate() {
        let m = measure_edit(edit_index, edit, limits);
        if edit.old_text.is_empty() {
            violations.push(format!("edit #{edit_index}: old_text must not be empty"));
        }
        if m.old_lines > limits.max_old_lines {
            violations.push(format!(
                "edit #{edit_index}: old_text is {} lines (max {}). Narrow the anchor or split into sequential edits.",
                m.old_lines, limits.max_old_lines
            ));
        }
        if m.new_lines > limits.max_new_lines {
            violations.push(format!(
                "edit #{edit_index}: new_text is {} lines (max {}). Split into smaller edits if possible.",
                m.new_lines, limits.max_new_lines
            ));
        }
        if m.old_chars > limits.max_old_chars {
            violations.push(format!(
                "edit #{edit_index}: old_text is {} chars (max {}). Use a shorter unique anchor or split edits.",
                m.old_chars, limits.max_old_chars
            ));
        }
        if m.likely_rewrite {
            violations.push(format!(
                "edit #{edit_index}: looks like a large block rewrite ({} of {} old lines changed). \
Prefer smaller anchors when possible; split unrelated changes into separate apply_patch calls.",
                m.changed_lines, m.old_lines
            ));
        }
        metrics.push(m);
    }

    PatchValidation {
        metrics,
        violations,
    }
}

pub fn measure_edit(edit_index: usize, edit: &PatchEdit, limits: PatchLimits) -> EditMetrics {
    let old_lines = line_count(&edit.old_text);
    let new_lines = line_count(&edit.new_text);
    let changed_lines = positional_changed_lines(&edit.old_text, &edit.new_text);
    let likely_rewrite = old_lines >= limits.rewrite_min_lines
        && old_lines > 0
        && (changed_lines as f64 / old_lines as f64) >= limits.rewrite_change_ratio;

    EditMetrics {
        edit_index,
        old_lines,
        new_lines,
        old_chars: edit.old_text.chars().count(),
        new_chars: edit.new_text.chars().count(),
        changed_lines,
        likely_rewrite,
    }
}

fn line_count(text: &str) -> usize {
    if text.is_empty() {
        0
    } else {
        text.lines().count()
    }
}

fn positional_changed_lines(old: &str, new: &str) -> usize {
    let old_l: Vec<&str> = old.lines().collect();
    let new_l: Vec<&str> = new.lines().collect();
    let max_len = old_l.len().max(new_l.len());
    (0..max_len)
        .filter(|i| old_l.get(*i) != new_l.get(*i))
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn applies_single_edit() {
        let out = apply_patches(
            "function foo() {\n  return 1;\n}\n",
            &[PatchEdit {
                old_text: "return 1;".into(),
                new_text: "return 2;".into(),
            }],
        )
        .expect("patch");
        assert!(out.contains("return 2;"));
        assert!(!out.contains("return 1;"));
    }

    #[test]
    fn applies_sequential_edits() {
        let out = apply_patches(
            "a\nb\nc\n",
            &[
                PatchEdit {
                    old_text: "b".into(),
                    new_text: "B".into(),
                },
                PatchEdit {
                    old_text: "a\nB".into(),
                    new_text: "A\nB".into(),
                },
            ],
        )
        .expect("patch");
        assert_eq!(out, "A\nB\nc\n");
    }

    #[test]
    fn rejects_ambiguous_match() {
        let err = apply_patches(
            "foo bar foo",
            &[PatchEdit {
                old_text: "foo".into(),
                new_text: "x".into(),
            }],
        )
        .unwrap_err();
        assert!(matches!(err, PatchError::Ambiguous { occurrences: 2, .. }));
    }

    #[test]
    fn rejects_missing_match() {
        let err = apply_patches(
            "hello",
            &[PatchEdit {
                old_text: "missing".into(),
                new_text: "x".into(),
            }],
        )
        .unwrap_err();
        assert!(matches!(err, PatchError::NotFound { .. }));
    }

    #[test]
    fn validates_small_surgical_edit() {
        let limits = PatchLimits::default();
        let v = validate_patch_edits(
            &[PatchEdit {
                old_text: "foreach ($projectUids as $projectUuid)".into(),
                new_text: "foreach ($projectUuids as $projectUuid)".into(),
            }],
            limits,
        );
        assert!(v.violations.is_empty());
        assert_eq!(v.metrics[0].old_lines, 1);
    }

    #[test]
    fn matches_old_text_when_file_uses_crlf() {
        let out = apply_patches(
            "foreach ($projectUids as $projectUuid) {\r\n",
            &[PatchEdit {
                old_text: "foreach ($projectUids as $projectUuid) {\n".into(),
                new_text: "foreach ($projectUuids as $projectUuid) {\n".into(),
            }],
        )
        .expect("crlf patch");
        assert_eq!(out, "foreach ($projectUuids as $projectUuid) {\n");
    }

    #[test]
    fn rejects_oversized_old_text() {
        let big = (0..50)
            .map(|i| format!("line {i}"))
            .collect::<Vec<_>>()
            .join("\n");
        let v = validate_patch_edits(
            &[PatchEdit {
                old_text: big.clone(),
                new_text: big,
            }],
            PatchLimits::default(),
        );
        assert!(v
            .violations
            .iter()
            .any(|m| m.contains("old_text is 50 lines")));
    }

    #[test]
    fn allows_multi_line_case_sized_edit() {
        let old = (0..18)
            .map(|i| format!("    case 'item_{i}':"))
            .collect::<Vec<_>>()
            .join("\n");
        let mut new = old.clone();
        new = new.replace("item_3", "item_3_fixed");
        let v = validate_patch_edits(
            &[PatchEdit {
                old_text: old,
                new_text: new,
            }],
            PatchLimits::default(),
        );
        assert!(v.violations.is_empty(), "{:?}", v.violations);
    }

    #[test]
    fn rejects_likely_rewrite() {
        let old = (0..30)
            .map(|i| format!("    stmt_{i}();"))
            .collect::<Vec<_>>()
            .join("\n");
        let new = (0..30)
            .map(|i| format!("    new_stmt_{i}();"))
            .collect::<Vec<_>>()
            .join("\n");
        let v = validate_patch_edits(
            &[PatchEdit {
                old_text: old,
                new_text: new,
            }],
            PatchLimits::default(),
        );
        assert!(v.violations.iter().any(|m| m.contains("block rewrite")));
    }
}
