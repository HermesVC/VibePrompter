//! Compose layered system prompts from primary mode + scope + modifiers.

use super::language::{detect_language, hints_for};
use super::types::{ChatContextPayload, ChatModifierInfo, ChatScope};

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
                "You are editing a CODE SNIPPET scoped session.{loc} lang=\"{lang}\"\n\
                 Rules:\n\
                 - Change ONLY the snippet content. Do not add imports, new files, or unrelated code.\n\
                 - Do not wrap the answer in markdown fences unless the snippet itself is markdown.\n\
                 - Output ONLY the revised snippet text — no preamble or explanation.\n\
                 - Stay within the same language and APIs present in the snippet.\n\n\
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
                "You are editing a single FILE scoped session.\n\
                 Rules:\n\
                 - Work only on the provided file region unless the user explicitly asks for a full-file rewrite.\n\
                 - When returning an updated file region, output ONLY the file body (no markdown fences).\n\
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
    use super::*;

    #[test]
    fn extracts_snippet_tag() {
        let out = extract_snippet_output("hello <snippet>code();\n</snippet> bye");
        assert_eq!(out, "code();");
    }
}
