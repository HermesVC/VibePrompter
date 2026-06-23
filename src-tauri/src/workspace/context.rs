//! Compose layered system prompts from primary mode + scope + modifiers.

use super::fs::content_hash;
use super::language::{detect_language, hints_for};
use super::types::{ChatContextPayload, ChatModifierInfo, ChatScope};

/// Fill in derived fields when the frontend omits them.
pub fn normalize_chat_context(ctx: &mut ChatContextPayload) {
    if let ChatScope::File {
        content,
        content_hash: hash,
        line_start,
        line_end,
        ..
    } = &mut ctx.scope
    {
        if hash.is_empty() {
            *hash = content_hash(content);
        }
        let lines = content.lines().count().max(1) as u32;
        if *line_start == 0 {
            *line_start = 1;
        }
        if *line_end == 0 {
            *line_end = lines;
        }
        if *line_end < *line_start {
            *line_end = (*line_start).max(lines);
        }
    }
}

/// Whether the user's message asks to change code (vs explain / discuss).
pub fn user_requests_code_edit(user_text: &str) -> bool {
    let t = user_text.to_lowercase();
    const EDIT_MARKERS: &[&str] = &[
        "fix ",
        "fix\n",
        "rewrite",
        "refactor",
        "improve ",
        "optimiz",
        "change ",
        "update ",
        "edit ",
        "replace ",
        "correct ",
        "rename ",
        "add ",
        "remove ",
        "implement ",
        "patch ",
        "исправ",
        "перепиш",
        "рефактор",
        "измени",
        "замени",
        "добав",
        "удали",
        "оптимиз",
        "поправ",
        "отредактир",
    ];
    EDIT_MARKERS.iter().any(|m| t.contains(m))
}

pub fn list_modifiers() -> Vec<ChatModifierInfo> {
    vec![
        ChatModifierInfo {
            id: "translate_en".into(),
            label: "→ English".into(),
            description: "Translate output to English".into(),
        },
        ChatModifierInfo {
            id: "translate_ru".into(),
            label: "→ Русский".into(),
            description: "Translate output to Russian".into(),
        },
        ChatModifierInfo {
            id: "formal_tone".into(),
            label: "Formal".into(),
            description: "Use a formal, professional tone".into(),
        },
        ChatModifierInfo {
            id: "concise".into(),
            label: "Concise".into(),
            description: "Keep output short".into(),
        },
        ChatModifierInfo {
            id: "add_docs".into(),
            label: "Add docs".into(),
            description: "Add comments or docblocks appropriate to the language".into(),
        },
    ]
}

fn modifier_block(id: &str) -> Option<&'static str> {
    match id {
        "translate_en" => Some("Translate the result into English. Keep code identifiers unchanged."),
        "translate_ru" => Some("Translate the result into Russian. Keep code identifiers unchanged."),
        "formal_tone" => Some("Use a formal, professional tone suitable for business communication."),
        "concise" => Some("Be as concise as possible without losing required information."),
        "add_docs" => Some("Add clear comments or documentation blocks appropriate to the language."),
        _ => None,
    }
}

pub fn compose_system_prompt(base_mode_sys: &str, ctx: &ChatContextPayload) -> String {
    let mut parts: Vec<String> = Vec::new();
    if !base_mode_sys.trim().is_empty() {
        parts.push(base_mode_sys.trim().to_string());
    }

    let lang_id = ctx
        .language_id
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .or_else(|| scope_language(&ctx.scope));

    if let Some(ref lang) = lang_id {
        parts.push(format!(
            "Language context: {lang}\n{}",
            hints_for(lang)
        ));
    }

    match &ctx.scope {
        ChatScope::None => {}
        ChatScope::Snippet {
            original,
            working,
            path,
            line_start,
            line_end,
            language_id,
        } => {
            let lang = language_id
                .as_deref()
                .filter(|s| !s.is_empty())
                .unwrap_or("plaintext");
            let loc = match (path.as_deref(), line_start, line_end) {
                (Some(p), Some(s), Some(e)) => format!(" path=\"{p}\" lines=\"{s}-{e}\""),
                (Some(p), _, _) => format!(" path=\"{p}\""),
                _ => String::new(),
            };
            parts.push(format!(
                "You have a CODE SNIPPET attached for reference in this session.{loc} lang=\"{lang}\"\n\
                 Rules:\n\
                 - Questions (explain, what does this do, review, debug): answer in plain language. \
                 Short code quotes are fine; do NOT dump a full rewritten snippet unless the user asked to change code.\n\
                 - Code change requests (fix, rewrite, refactor, improve, add, remove): output ONLY the revised snippet — \
                 no preamble, no markdown fences, no text outside the snippet.\n\
                 - When editing, change only the snippet. No new files, imports, or unrelated code.\n\n\
                 <snippet>\n{working}\n</snippet>\n\n\
                 Original reference (do not expand beyond this scope):\n\
                 <snippet-original>\n{original}\n</snippet-original>"
            ));
        }
        ChatScope::File {
            path,
            content,
            line_start,
            line_end,
            language_id,
            ..
        } => {
            let lang = language_id
                .as_deref()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .unwrap_or_else(|| detect_language(Some(path), Some(content)));
            parts.push(format!(
                "You have a FILE attached for reference in this session.\n\
                 Rules:\n\
                 - Questions about the file (what is it, explain, review): answer in plain language.\n\
                 - Rewrite requests: output ONLY the updated file body for the scoped region unless a full-file rewrite is explicit.\n\
                 - Do not invent paths or modules not present in the workspace context.\n\n\
                 <file path=\"{path}\" lines=\"{line_start}-{line_end}\" lang=\"{lang}\">\n\
                 {content}\n\
                 </file>"
            ));
        }
        ChatScope::Workspace { tree_summary } => {
            let tree = tree_summary
                .as_deref()
                .filter(|s| !s.is_empty())
                .unwrap_or("(workspace tree not loaded)");
            parts.push(format!(
                "You are in WORKSPACE scoped session. The project file tree is listed below.\n\
                 Rules:\n\
                 - Refer to files by their relative paths from the tree.\n\
                 - Do not claim to have read a file unless its contents appear in the conversation.\n\
                 - Prefer small, targeted edits over large rewrites.\n\n\
                 <workspace-tree>\n{tree}\n</workspace-tree>"
            ));
        }
    }

    for m in &ctx.modifiers {
        if let Some(text) = modifier_block(m) {
            parts.push(text.to_string());
        }
    }

    parts.join("\n\n")
}

fn scope_language(scope: &ChatScope) -> Option<String> {
    match scope {
        ChatScope::Snippet { language_id, path, working, .. } => {
            language_id.clone().or_else(|| {
                Some(detect_language(
                    path.as_deref(),
                    Some(working.as_str()),
                ))
            })
        }
        ChatScope::File {
            language_id,
            path,
            content,
            ..
        } => language_id
            .clone()
            .or_else(|| Some(detect_language(Some(path), Some(content)))),
        _ => None,
    }
}

/// Strip model output to snippet body when in snippet scope.
pub fn extract_snippet_output(text: &str) -> String {
    if let Some(inner) = extract_tag(text, "snippet") {
        return inner;
    }
    let trimmed = text.trim();
    if trimmed.starts_with("```") {
        if let Some(_end) = trimmed.rfind("```") {
            let inner = trimmed
                .trim_start_matches('`')
                .trim_start_matches(|c: char| c.is_alphanumeric() || c == '\n')
                .trim();
            if let Some(stripped) = inner.strip_suffix("```") {
                return stripped.trim().to_string();
            }
        }
    }
    trimmed.to_string()
}

fn extract_tag(text: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = text.find(&open)? + open.len();
    let end = text[start..].find(&close)? + start;
    Some(text[start..end].trim().to_string())
}

#[cfg(test)]
mod tests {
    use crate::workspace::types::{ChatContextPayload, ChatScope};
    use super::*;

    #[test]
    fn extracts_snippet_tag() {
        let out = extract_snippet_output("hello <snippet>code();\n</snippet> bye");
        assert_eq!(out, "code();");
    }

    #[test]
    fn detects_edit_vs_explain_intent() {
        assert!(!user_requests_code_edit("что за файл?"));
        assert!(!user_requests_code_edit("объясни этот код"));
        assert!(user_requests_code_edit("исправь ошибку в сниппете"));
        assert!(user_requests_code_edit("please refactor this function"));
    }

    #[test]
    fn normalizes_file_scope_missing_hash_and_lines() {
        let mut ctx = ChatContextPayload {
            scope: ChatScope::File {
                path: "a.txt".into(),
                content: "line1\nline2\n".into(),
                content_hash: String::new(),
                line_start: 0,
                line_end: 0,
                language_id: None,
            },
            modifiers: vec![],
            language_id: None,
        };
        normalize_chat_context(&mut ctx);
        if let ChatScope::File {
            content_hash,
            line_start,
            line_end,
            ..
        } = ctx.scope
        {
            assert!(!content_hash.is_empty());
            assert_eq!(line_start, 1);
            assert_eq!(line_end, 2);
        } else {
            panic!("expected file scope");
        }
    }
}
