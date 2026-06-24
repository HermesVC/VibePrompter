//! Deterministic search/replace patches — model supplies anchors, tool applies.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PatchEdit {
    pub old_text: String,
    pub new_text: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PatchError {
    EmptyOldText { edit_index: usize },
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
    if let Some(bounds) = unique_match_bounds(haystack, needle) {
        return Ok(bounds);
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
}
