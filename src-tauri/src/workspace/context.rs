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
            id: "developer".into(),
            label: "Developer".into(),
            description:
                "PLAN.md step-by-step workflow (only with File / Folder / Workspace scope)".into(),
        },
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
        "translate_en" => {
            Some("Translate the result into English. Keep code identifiers unchanged.")
        }
        "translate_ru" => {
            Some("Translate the result into Russian. Keep code identifiers unchanged.")
        }
        "formal_tone" => {
            Some("Use a formal, professional tone suitable for business communication.")
        }
        "concise" => Some("Be as concise as possible without losing required information."),
        "add_docs" => {
            Some("Add clear comments or documentation blocks appropriate to the language.")
        }
        _ => None,
    }
}

fn scope_involves_workspace_files(scope: &ChatScope) -> bool {
    matches!(
        scope,
        ChatScope::File { .. } | ChatScope::Folder { .. } | ChatScope::Workspace { .. }
    )
}

fn developer_mode_active(modifiers: &[String]) -> bool {
    modifiers.iter().any(|m| m == "developer")
}

const PLAN_DRIVEN_PROTOCOL: &str = r#"## Plan-driven developer workflow (active)

This applies only because Developer mode is on and a file/folder/workspace scope is attached.

Treat a task as LARGE if it needs 2+ files, new architecture, or unclear scope.
For LARGE tasks, do NOT jump straight to full implementation.

### Phase A — Plan (first response on a new large task)
1. Create `PLAN.md` in the scoped folder via a file fence (workspace-relative path).
2. Structure PLAN.md:
   - **Goal** — one paragraph
   - **Scope** — in / out
   - **Design** — stack and key decisions (prefix important lines with DECISION: for memory)
   - **Steps** — numbered checklist `- [ ] 1. …` (one atomic concern per step)
   - **Verification** — how to verify each step
   - **Status** — `Current step: 0 / N`, `Last completed: none`
3. After PLAN.md, output a short summary (3–5 bullets) and tell the user to Apply PLAN.md, then say «иди по плану» or «следующий пункт».
4. In Phase A output ONLY PLAN.md (no other code files).

### Phase B — Execute (continue / иди по плану / следующий пункт)
1. Use PLAN.md from context or retrieved memory. Pick the first unchecked `- [ ]` step.
2. Implement ONE step: `apply_patch` for edits to existing files; ```file``` fences only for new files.
3. After code, OUTSIDE fences, output ONLY this brief block (max 4 short lines inside; no long prose):

<plan-step-summary>
step: N / TOTAL
done: что сделано (1 короткая фраза)
why: зачем (1 короткая фраза)
next: следующий пункт или «готово»
</plan-step-summary>

The app stores this block in semantic memory — after context reload you must still know current step, what is done, and what is next. Keep it extremely brief.
Canonical plan status is PLAN.md **Status** plus the `<plan-step-summary>` block. Do not duplicate a conflicting current-step narrative elsewhere; if you need to refer to plan progress in prose, refer to PLAN_CANONICAL.
4. Update PLAN.md: mark step `[x]`, update **Status** (`Current step`, `Last completed`).
5. Stop after one step unless the user explicitly asked for full autopilot.

### Phase C — Small tasks
Single-file fix or trivial change: skip PLAN.md. Use `read_file` + `apply_patch` tool_call blocks (minimal patches). Do not use ```file edits:``` blocks.

Use Russian for prose unless the user uses another language."#;

/// Options when building the layered system prompt.
#[derive(Debug, Clone, Copy, Default)]
pub struct ComposeSystemOptions {
    /// Workspace agent tools are active (file/folder/workspace + tool-capable format).
    pub tools_active: bool,
}

pub fn compose_system_prompt(base_mode_sys: &str, ctx: &ChatContextPayload) -> String {
    compose_system_prompt_with_opts(base_mode_sys, ctx, ComposeSystemOptions::default())
}

pub fn compose_system_prompt_with_opts(
    base_mode_sys: &str,
    ctx: &ChatContextPayload,
    opts: ComposeSystemOptions,
) -> String {
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
        parts.push(format!("Language context: {lang}\n{}", hints_for(lang)));
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
            if opts.tools_active {
                parts.push(format!(
                    "You have a FILE scoped in this session: path=\"{path}\" lines=\"{line_start}-{line_end}\" lang=\"{lang}\".\n\
                     Rules:\n\
                     - Do NOT paste the file body, a rewritten file, or ```file:``` fences for this path.\n\
                     - To inspect or fix: emit <|tool_call|> read_file / apply_patch only (see Workspace file tools below).\n\
                     - Questions: answer in plain language; quote short fragments only after read_file.\n\
                     - Code fixes: apply_patch with 1–3 line old_text — never whole methods, switch blocks, or files."
                ));
            } else {
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
        ChatScope::Folder {
            path,
            tree_summary,
            outline_summary,
            files: _,
            truncated,
        } => {
            let edit_rules = if opts.tools_active {
                "- Edits to **existing** files: ONLY <|tool_call|> apply_patch after read_file. \
                 Never ```file:``` fences with edits:, old_text:, or new_text: for existing paths.\n\
                 - **New** files only: use ```file relative/path``` fences with the full new file body.\n\
                 - Prefer read_symbol over read_file for large PHP/JS/Python files."
            } else {
                "- Prefer small, targeted edits; use file fences with paths when changing multiple files.\n\
                 - For new or changed files in this folder, use ```file paths relative to the workspace root \
                 (prefix with `{path}/` when the scoped path is not `.`, e.g. `{path}/index.html`)."
            };
            let mut block = format!(
                "You are in FOLDER scoped session for `{path}`.\n\
                 Rules:\n\
                 - The folder file tree and symbol outlines are below — use workspace tools to read bodies.\n\
                 - Tools: list_dir, file_outline, read_symbol, read_file.\n\
                 - Refer to files by relative paths from the tree.\n\
                 - Do not claim to have read a file until you received it via a tool result.\n\
                 {edit_rules}\n\n\
                 <folder-tree path=\"{path}\">\n{tree_summary}\n</folder-tree>\n\n\
                 <folder-outline path=\"{path}\">\n{outline_summary}\n</folder-outline>"
            );
            if *truncated {
                block.push_str(
                    "\n\n(Note: symbol outline truncated — use file_outline/read_symbol for missing files.)",
                );
            }
            parts.push(block);
        }
    }

    for m in &ctx.modifiers {
        if let Some(text) = modifier_block(m) {
            parts.push(text.to_string());
        }
    }

    if developer_mode_active(&ctx.modifiers) && scope_involves_workspace_files(&ctx.scope) {
        parts.push(PLAN_DRIVEN_PROTOCOL.to_string());
    }

    parts.join("\n\n")
}

/// User-turn scope block appended to the last user message.
pub fn scope_user_context_block(scope: &ChatScope, tools_active: bool) -> String {
    match scope {
        ChatScope::None => String::new(),
        ChatScope::Snippet { working, .. } => {
            format!("[Attached snippet for reference]\n```\n{working}\n```")
        }
        ChatScope::File {
            path,
            content,
            line_start,
            line_end,
            ..
        } => {
            if tools_active {
                format!(
                    "[Scoped file: {path} (lines {line_start}-{line_end}) — use read_file tool; do not expect file body in this message]"
                )
            } else {
                format!("[Attached file: {path} (lines {line_start}-{line_end})]\n```\n{content}\n```")
            }
        }
        ChatScope::Workspace { tree_summary } => {
            if tools_active {
                return "[Workspace scope — file tree is in the system prompt; use read_file to load file bodies]"
                    .to_string();
            }
            tree_summary
                .as_deref()
                .filter(|s| !s.is_empty())
                .map(|tree| format!("[Workspace tree]\n{tree}"))
                .unwrap_or_default()
        }
        ChatScope::Folder {
            path,
            tree_summary,
            outline_summary,
            ..
        } => {
            if tools_active {
                return format!(
                    "[Scoped folder: {path} — tree/outline in system prompt; use list_dir / read_file tools]"
                );
            }
            format!(
                "[Attached folder: {path}]\n[Folder tree]\n{tree_summary}\n\n[Folder outline]\n{outline_summary}"
            )
        }
    }
}

fn scope_language(scope: &ChatScope) -> Option<String> {
    match scope {
        ChatScope::Snippet {
            language_id,
            path,
            working,
            ..
        } => language_id
            .clone()
            .or_else(|| Some(detect_language(path.as_deref(), Some(working.as_str())))),
        ChatScope::File {
            language_id,
            path,
            content,
            ..
        } => language_id
            .clone()
            .or_else(|| Some(detect_language(Some(path), Some(content)))),
        ChatScope::Folder { files, .. } => files.first().and_then(|f| {
            f.language_id
                .clone()
                .or_else(|| Some(detect_language(Some(&f.path), Some(&f.content))))
        }),
        _ => None,
    }
}

/// Strip model chatter and return applyable code (snippet or file region).
pub fn extract_scoped_code_output(text: &str) -> String {
    if let Some(inner) = extract_tag(text, "snippet") {
        return inner;
    }
    if let Some(inner) = extract_tag(text, "file") {
        return inner;
    }
    if let Some(block) = extract_fenced_code_block(text) {
        return block;
    }
    text.trim().to_string()
}

/// Strip model output to snippet body when in snippet scope.
pub fn extract_snippet_output(text: &str) -> String {
    extract_scoped_code_output(text)
}

/// Longest ``` fenced block in the text (models often prepend prose).
fn extract_fenced_code_block(text: &str) -> Option<String> {
    let mut best: Option<String> = None;
    let mut pos = 0;
    while let Some(rel) = text[pos..].find("```") {
        let open = pos + rel + 3;
        let rest = &text[open..];
        let body_start = match rest.find('\n') {
            Some(nl) => open + nl + 1,
            None => {
                pos = open;
                continue;
            }
        };
        let tail = &text[body_start..];
        let body = if let Some(close_rel) = tail.find("```") {
            tail[..close_rel].trim_end()
        } else {
            tail.trim_end()
        };
        if !body.is_empty() && body.len() > best.as_ref().map(|s| s.len()).unwrap_or(0) {
            best = Some(body.to_string());
        }
        let Some(close_rel) = tail.find("```") else {
            break;
        };
        pos = body_start + close_rel + 3;
    }
    best
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
    use crate::workspace::types::{ChatContextPayload, ChatScope};

    #[test]
    fn extracts_snippet_tag() {
        let out = extract_snippet_output("hello <snippet>code();\n</snippet> bye");
        assert_eq!(out, "code();");
    }

    #[test]
    fn strips_prose_before_fenced_code() {
        let input =
            "Для рефакторирования можно улучшить структуру:\n\n```php\n<?php\necho 1;\n```\n";
        let out = extract_scoped_code_output(input);
        assert_eq!(out, "<?php\necho 1;");
    }

    #[test]
    fn extracts_unclosed_fenced_code_block() {
        let input = "Updated file:\n\n```php\n<?php\necho 1;\n";
        let out = extract_scoped_code_output(input);
        assert_eq!(out, "<?php\necho 1;");
    }

    #[test]
    fn detects_edit_vs_explain_intent() {
        assert!(!user_requests_code_edit("что за файл?"));
        assert!(!user_requests_code_edit("объясни этот код"));
        assert!(user_requests_code_edit("исправь ошибку в сниппете"));
        assert!(user_requests_code_edit("please refactor this function"));
    }

    #[test]
    fn plan_protocol_requires_developer_and_file_scope() {
        let folder_scope = ChatScope::Folder {
            path: "test/app".into(),
            tree_summary: "index.html".into(),
            outline_summary: String::new(),
            files: vec![],
            truncated: false,
        };
        let with_dev = ChatContextPayload {
            scope: folder_scope.clone(),
            modifiers: vec!["developer".into()],
            language_id: None,
        };
        let sys = compose_system_prompt("", &with_dev);
        assert!(sys.contains("PLAN.md"));
        assert!(sys.contains("Plan-driven developer workflow"));
        assert!(sys.contains("<plan-step-summary>"));
        assert!(sys.contains("PLAN_CANONICAL"));

        let no_dev = ChatContextPayload {
            scope: folder_scope.clone(),
            modifiers: vec![],
            language_id: None,
        };
        assert!(!compose_system_prompt("", &no_dev).contains("Plan-driven developer workflow"));

        let snippet_scope = ChatContextPayload {
            scope: ChatScope::Snippet {
                original: "x".into(),
                working: "x".into(),
                path: None,
                line_start: None,
                line_end: None,
                language_id: None,
            },
            modifiers: vec!["developer".into()],
            language_id: None,
        };
        assert!(
            !compose_system_prompt("", &snippet_scope).contains("Plan-driven developer workflow")
        );
    }

    #[test]
    fn file_scope_tools_active_omits_body_from_system() {
        let ctx = ChatContextPayload {
            scope: ChatScope::File {
                path: "vp/a.php".into(),
                content: "<?php\n$secret = 1;\n".into(),
                content_hash: "x".into(),
                line_start: 1,
                line_end: 2,
                language_id: Some("php".into()),
            },
            modifiers: vec![],
            language_id: None,
        };
        let with_tools = compose_system_prompt_with_opts(
            "",
            &ctx,
            ComposeSystemOptions { tools_active: true },
        );
        assert!(with_tools.contains("read_file"));
        assert!(!with_tools.contains("$secret"));
        assert!(!with_tools.contains("output ONLY the updated file body"));

        let without_tools = compose_system_prompt_with_opts(
            "",
            &ctx,
            ComposeSystemOptions::default(),
        );
        assert!(without_tools.contains("$secret"));
        assert!(without_tools.contains("output ONLY the updated file body"));
    }

    #[test]
    fn scope_user_block_tools_active_is_minimal() {
        let scope = ChatScope::File {
            path: "vp/a.php".into(),
            content: "body".into(),
            content_hash: "h".into(),
            line_start: 1,
            line_end: 1,
            language_id: None,
        };
        let minimal = scope_user_context_block(&scope, true);
        assert!(minimal.contains("read_file"));
        assert!(!minimal.contains("body"));
        let full = scope_user_context_block(&scope, false);
        assert!(full.contains("body"));
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
