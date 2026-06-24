//! Parse tool_call blocks from model text (Gemma, Qwen, relaxed XML).

use serde_json::Value;

use super::types::ParsedToolCall;

/// Try every supported wire format; models often ignore the connection template id.
pub fn parse_all_tool_calls(text: &str) -> Vec<ParsedToolCall> {
    let text = normalize_tool_call_text(text);
    let mut out = super::gemma4::parse_gemma4_tool_calls(&text);
    out.extend(parse_qwen_piped_tool_calls(&text));
    out.extend(parse_relaxed_tool_calls(&text));
    out.extend(parse_bare_call_tool_calls(&text));
    out.extend(parse_file_edits_fence_tool_calls(&text));
    out.extend(parse_inline_file_edits_tool_calls(&text));
    dedupe_tool_calls(out)
}

/// Normalize common LM Studio / Qwen token variants before parsing.
fn normalize_tool_call_text(text: &str) -> String {
    text.replace('\u{FF5C}', "|") // fullwidth vertical bar
        .replace('\u{2016}', "|") // double vertical line
        .replace("<｜", "<|")
        .replace("｜>", "|>")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

/// Scan for bare `call:name{args}` outside explicit markers.
pub fn parse_bare_call_tool_calls(text: &str) -> Vec<ParsedToolCall> {
    let mut out = Vec::new();
    let mut search_from = 0usize;
    while let Some(rel) = text[search_from..].find("call:") {
        let start = search_from + rel;
        let slice = &text[start..];
        if let Some(call) = parse_call_segment(slice) {
            out.push(call);
            search_from = start + call_segment_byte_len(slice).unwrap_or(5);
        } else {
            search_from = start.saturating_add(5);
        }
    }
    out
}

/// Qwen / LM Studio: `<|tool_call|>call:name{args}</|tool_call|>`
pub fn parse_qwen_piped_tool_calls(text: &str) -> Vec<ParsedToolCall> {
    let mut out = parse_marker_tool_calls(
        text,
        "<|tool_call|>",
        &[
            "</|tool_call|>",
            "</|tool_call>",
            "<|tool_call|>",
            "</tool_call>",
            "<|tool_call>",
            "|tool_call|>",
        ],
    );
    out.extend(parse_marker_tool_calls(
        text,
        "<|tool_calls|>",
        &["</|tool_calls|>", "</|tool_calls>", "<|tool_calls|>"],
    ));
    out
}

pub fn parse_relaxed_tool_calls(text: &str) -> Vec<ParsedToolCall> {
    parse_marker_tool_calls(
        text,
        "<tool_call>",
        &[
            "</tool_call>",
            "<|tool_call|>",
            "<|tool_call>",
            "<tool_calls>",
            "</tool_calls>",
        ],
    )
}

fn parse_marker_tool_calls(text: &str, open: &str, closes: &[&str]) -> Vec<ParsedToolCall> {
    let mut out = Vec::new();
    let mut rest = text;
    while let Some(start) = rest.find(open) {
        let after = &rest[start + open.len()..];
        let close = closes
            .iter()
            .filter_map(|marker| after.find(marker).map(|idx| (idx, marker.len())))
            .min_by_key(|(idx, _)| *idx);
        let (segment, next_offset) = if let Some((close_idx, close_len)) = close {
            (&after[..close_idx], close_idx + close_len)
        } else {
            (after, after.len())
        };
        if let Some(call) = parse_call_segment(segment) {
            out.push(call);
        }
        rest = &after[next_offset..];
    }
    out
}

fn parse_call_segment(segment: &str) -> Option<ParsedToolCall> {
    let segment = segment.trim();
    if let Some(call) = parse_json_tool_call(segment) {
        return Some(call);
    }
    let segment = segment.strip_prefix("call:").unwrap_or(segment).trim();
    if let Some(call) = parse_json_tool_call(segment) {
        return Some(call);
    }
    let brace = segment.find('{')?;
    let name = segment[..brace].trim();
    if name.is_empty() {
        return None;
    }
    let args_end = matching_brace_end(segment, brace)?;
    let args = segment[brace..args_end].trim();
    if let Some(call) = parse_json_tool_call(args) {
        return Some(call);
    }
    Some(ParsedToolCall {
        name: name.to_string(),
        arguments: parse_relaxed_args(args).unwrap_or_else(|| serde_json::Map::new().into()),
    })
}

fn parse_json_tool_call(segment: &str) -> Option<ParsedToolCall> {
    let segment = segment.trim();
    if !segment.starts_with('{') {
        return None;
    }
    let json_end = matching_brace_end(segment, 0)?;
    let value: Value = serde_json::from_str(segment[..json_end].trim()).ok()?;
    let obj = value.as_object()?;
    let name = obj
        .get("name")
        .or_else(|| obj.get("tool"))
        .or_else(|| obj.get("function"))
        .and_then(|v| v.as_str())?
        .trim()
        .to_string();
    if name.is_empty() {
        return None;
    }
    let arguments = obj
        .get("arguments")
        .or_else(|| obj.get("parameters"))
        .or_else(|| obj.get("args"))
        .cloned()
        .unwrap_or_else(|| Value::Object(serde_json::Map::new()));
    Some(ParsedToolCall { name, arguments })
}

fn matching_brace_end(s: &str, open_idx: usize) -> Option<usize> {
    let mut depth = 0i32;
    let mut quote: Option<char> = None;
    let tail = s.get(open_idx..)?;
    for (offset, ch) in tail.char_indices() {
        if let Some(q) = quote {
            if ch == q && !is_json_escape_before(tail, offset) {
                quote = None;
            }
            continue;
        }
        match ch {
            '"' | '\'' => quote = Some(ch),
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(open_idx + offset + ch.len_utf8());
                }
            }
            _ => {}
        }
    }
    None
}

fn parse_relaxed_args(body: &str) -> Option<Value> {
    let body = body.trim();
    if !body.starts_with('{') || !body.ends_with('}') {
        return None;
    }
    let inner = &body[1..body.len() - 1];
    let mut map = serde_json::Map::new();
    for part in split_relaxed_top_level(inner) {
        let Some((key, val)) = part.split_once(':') else {
            continue;
        };
        let key = key.trim().trim_matches('"').trim_matches('\'');
        if key.is_empty() {
            continue;
        }
        map.insert(key.to_string(), parse_relaxed_value(val.trim()));
    }
    Some(Value::Object(map))
}

fn split_relaxed_top_level(s: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut quote: Option<char> = None;
    let mut start = 0usize;
    for (i, ch) in s.char_indices() {
        if let Some(q) = quote {
            if ch == q && !is_json_escape_before(s, i) {
                quote = None;
            }
            continue;
        }
        match ch {
            '"' | '\'' => quote = Some(ch),
            '{' | '[' => depth += 1,
            '}' | ']' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(s[start..i].trim().to_string());
                start = i + 1;
            }
            _ => {}
        }
    }
    if start < s.len() {
        parts.push(s[start..].trim().to_string());
    }
    parts
}

fn parse_relaxed_value(raw: &str) -> Value {
    let raw = raw.trim().trim_end_matches(',');
    if raw.starts_with('[') || raw.starts_with('{') {
        if let Ok(v) = serde_json::from_str::<Value>(raw) {
            return v;
        }
    }
    if raw.starts_with("<|\"|>") && raw.ends_with("<|\"|>") {
        return Value::String(
            raw.trim_start_matches("<|\"|>")
                .trim_end_matches("<|\"|>")
                .replace("\\<", "<"),
        );
    }
    if (raw.starts_with('"') && raw.ends_with('"'))
        || (raw.starts_with('\'') && raw.ends_with('\''))
    {
        let inner = &raw[1..raw.len() - 1];
        return Value::String(unescape_relaxed_string(inner));
    }
    if raw.eq_ignore_ascii_case("true") {
        return Value::Bool(true);
    }
    if raw.eq_ignore_ascii_case("false") {
        return Value::Bool(false);
    }
    if raw.eq_ignore_ascii_case("null") {
        return Value::Null;
    }
    if let Ok(n) = raw.parse::<i64>() {
        return Value::Number(n.into());
    }
    if let Ok(n) = raw.parse::<f64>() {
        if let Some(n) = serde_json::Number::from_f64(n) {
            return Value::Number(n);
        }
    }
    Value::String(raw.to_string())
}

fn unescape_relaxed_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            match chars.next() {
                Some('n') => out.push('\n'),
                Some('r') => out.push('\r'),
                Some('t') => out.push('\t'),
                Some('"') => out.push('"'),
                Some('\'') => out.push('\''),
                Some('\\') => out.push('\\'),
                Some(c) => {
                    out.push('\\');
                    out.push(c);
                }
                None => out.push('\\'),
            }
        } else {
            out.push(ch);
        }
    }
    out
}

fn call_segment_byte_len(segment: &str) -> Option<usize> {
    let trimmed = segment.trim_start();
    let offset = segment.len() - trimmed.len();
    let after_call = trimmed.strip_prefix("call:").unwrap_or(trimmed);
    let call_prefix = trimmed.len() - after_call.len();
    let brace = after_call.find('{')?;
    let args_end = matching_brace_end(after_call, brace)?;
    Some(offset + call_prefix + args_end)
}

/// Models sometimes emit patch edits inside a markdown file fence instead of tool_call.
pub fn parse_file_edits_fence_tool_calls(text: &str) -> Vec<ParsedToolCall> {
    let mut out = Vec::new();
    let mut search_from = 0usize;
    while let Some(rel) = text[search_from..].find("```") {
        let fence_start = search_from + rel;
        let after_ticks = fence_start + 3;
        let Some(header_end_rel) = text[after_ticks..].find('\n') else {
            break;
        };
        let header_end = after_ticks + header_end_rel;
        let header = text[after_ticks..header_end].trim();
        let content_start = header_end + 1;
        let (content_end, close_len) = find_fence_content_end(&text[content_start..]);
        let content = &text[content_start..content_start + content_end];
        let next = content_start + content_end + close_len;
        if let Some(call) = file_edits_fence_to_call(header, content) {
            out.push(call);
        }
        search_from = next;
    }
    out
}

/// `file:path` + `edits:[...]` without markdown fences (common Qwen output).
pub fn parse_inline_file_edits_tool_calls(text: &str) -> Vec<ParsedToolCall> {
    let mut out = Vec::new();
    let lower = text.to_ascii_lowercase();
    let mut search_from = 0usize;
    while let Some(rel) = lower[search_from..].find("file:") {
        let at = search_from + rel;
        let line_end = text[at..]
            .find('\n')
            .map(|i| at + i)
            .unwrap_or(text.len());
        let header_line = text[at..line_end].trim();
        let path = header_line.strip_prefix("file:").map(str::trim).filter(|p| !p.is_empty());
        let Some(path) = path else {
            search_from = at + 5;
            continue;
        };
        let after_line = line_end + 1;
        let edits_region = &text[after_line..];
        let Some(edits) = parse_edits_field(edits_region) else {
            search_from = at + 5;
            continue;
        };
        out.push(ParsedToolCall {
            name: "apply_patch".into(),
            arguments: serde_json::json!({ "path": path, "edits": edits }),
        });
        search_from = after_line + 1;
    }
    out
}

fn find_fence_content_end(slice: &str) -> (usize, usize) {
    let mut candidates = Vec::new();
    if let Some(i) = slice.find("```") {
        candidates.push((i, 3usize));
    }
    if let Some(i) = slice.to_ascii_lowercase().find("</file>") {
        candidates.push((i, 7usize));
    }
    if let Some((i, len)) = candidates.into_iter().min_by_key(|(i, _)| *i) {
        (i, len)
    } else {
        (slice.len(), 0usize)
    }
}

fn file_edits_fence_to_call(header: &str, content: &str) -> Option<ParsedToolCall> {
    let path = parse_file_fence_header_path(header)?;
    let edits = parse_edits_field(content)?;
    Some(ParsedToolCall {
        name: "apply_patch".into(),
        arguments: serde_json::json!({
            "path": path,
            "edits": edits,
        }),
    })
}

fn parse_file_fence_header_path(header: &str) -> Option<String> {
    let header = header.trim();
    if let Some(rest) = header.strip_prefix("file:") {
        let path = rest.trim();
        return (!path.is_empty()).then(|| path.to_string());
    }
    let lower = header.to_ascii_lowercase();
    if lower == "file" {
        return None;
    }
    if lower.starts_with("file ") {
        let path = header[4..].trim();
        return (!path.is_empty()).then(|| path.to_string());
    }
    None
}

fn parse_edits_field(content: &str) -> Option<Value> {
    let content = content.trim();
    let rest = content
        .strip_prefix("edits:")
        .or_else(|| content.strip_prefix("edits :"))?
        .trim();
    let array_json = extract_balanced_json_array(rest)?;
    serde_json::from_str(array_json).ok()
}

fn extract_balanced_json_array(s: &str) -> Option<&str> {
    let s = s.trim();
    let start = s.find('[')?;
    let end = matching_bracket_end(s, start)?;
    Some(&s[start..end])
}

fn matching_bracket_end(s: &str, open_idx: usize) -> Option<usize> {
    let mut depth = 0i32;
    let mut quote: Option<char> = None;
    let tail = s.get(open_idx..)?;
    for (offset, ch) in tail.char_indices() {
        if let Some(q) = quote {
            if ch == q && !is_json_escape_before(tail, offset) {
                quote = None;
            }
            continue;
        }
        match ch {
            '"' | '\'' => quote = Some(ch),
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    return Some(open_idx + offset + ch.len_utf8());
                }
            }
            _ => {}
        }
    }
    None
}

fn is_json_escape_before(s: &str, quote_offset: usize) -> bool {
    let mut slashes = 0usize;
    let mut i = quote_offset;
    while i > 0 {
        i -= 1;
        if s.as_bytes().get(i) == Some(&b'\\') {
            slashes += 1;
        } else {
            break;
        }
    }
    slashes % 2 == 1
}

/// Expand `apply_patch` with multiple `edits[]` into one call per edit (partial apply).
pub fn expand_apply_patch_calls(calls: Vec<ParsedToolCall>) -> Vec<ParsedToolCall> {
    let mut out = Vec::new();
    for call in calls {
        if call.name != "apply_patch" {
            out.push(call);
            continue;
        }
        let Some(edits) = call.arguments.get("edits").and_then(|v| v.as_array()) else {
            out.push(call);
            continue;
        };
        if edits.len() <= 1 {
            out.push(call);
            continue;
        }
        let path = call.arguments.get("path").cloned();
        let expected_hash = call.arguments.get("expected_hash").cloned();
        for edit in edits {
            let mut args = serde_json::Map::new();
            if let Some(p) = path.clone() {
                args.insert("path".into(), p);
            }
            if let Some(h) = expected_hash.clone() {
                args.insert("expected_hash".into(), h);
            }
            if let Some(obj) = edit.as_object() {
                if let Some(v) = obj.get("old_text") {
                    args.insert("old_text".into(), v.clone());
                }
                if let Some(v) = obj.get("new_text") {
                    args.insert("new_text".into(), v.clone());
                }
            }
            out.push(ParsedToolCall {
                name: "apply_patch".into(),
                arguments: Value::Object(args),
            });
        }
    }
    out
}

/// Last-resort extraction when markers are malformed but `call:name{...}` is visible.
pub fn parse_loose_tool_calls(text: &str) -> Vec<ParsedToolCall> {
    parse_all_tool_calls(text)
}

/// True when assistant text is only tool wire markup (no user-facing answer).
pub fn is_tool_call_only(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }
    let stripped = strip_tool_call_markup(trimmed);
    stripped.trim().is_empty() || parse_all_tool_calls(trimmed).len() > 0 && stripped.len() < 24
}

pub fn contains_tool_call_markup(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("tool_call")
        || lower.contains("<|tool_call")
        || lower.contains("call:read_file{")
        || lower.contains("call:list_dir{")
        || lower.contains("call:apply_patch{")
        || lower.contains("edits:[")
        || (lower.contains("file:") && lower.contains("edits:"))
}

/// Remove tool_call and patch-fence wire markup from assistant-visible text after tools ran.
pub fn strip_assistant_wire_markup(text: &str) -> String {
    strip_patch_fence_markup(&strip_tool_call_markup(text))
}

fn strip_patch_fence_markup(text: &str) -> String {
    let mut out = String::new();
    let mut search_from = 0usize;
    while search_from < text.len() {
        let Some(rel) = text[search_from..].find("```") else {
            out.push_str(&text[search_from..]);
            break;
        };
        let fence_start = search_from + rel;
        out.push_str(&text[search_from..fence_start]);
        let after_ticks = fence_start + 3;
        let Some(header_end_rel) = text[after_ticks..].find('\n') else {
            out.push_str(&text[fence_start..]);
            break;
        };
        let header_end = after_ticks + header_end_rel;
        let header = text[after_ticks..header_end].trim();
        let content_start = header_end + 1;
        if parse_file_fence_header_path(header).is_some() {
            let (content_end, close_len) = find_fence_content_end(&text[content_start..]);
            search_from = content_start + content_end + close_len;
            continue;
        }
        // keep non-patch fences
        let (content_end, close_len) = find_fence_content_end(&text[content_start..]);
        let end = content_start + content_end + close_len;
        out.push_str(&text[fence_start..end]);
        search_from = end;
    }
    out.trim().to_string()
}

/// Remove tool_call wire markup from assistant-visible text after tools ran.
pub fn strip_tool_call_markup(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    const MARKERS: &[&str] = &[
        "<|tool_call|>",
        "<|tool_calls|>",
        "<|tool_call>",
        "<tool_call>",
        "<tool_calls>",
    ];
    while !rest.is_empty() {
        let next = MARKERS
            .iter()
            .filter_map(|marker| rest.find(marker).map(|idx| (idx, marker.len())))
            .min_by_key(|(idx, _)| *idx);
        let Some((start, open_len)) = next else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..start]);
        let after = &rest[start + open_len..];
        let close = [
            "</|tool_call|>",
            "</|tool_call>",
            "</|tool_calls|>",
            "</|tool_calls>",
            "<|tool_call|>",
            "<|tool_call>",
            "</tool_call>",
            "</tool_calls>",
            "|tool_call|>",
        ]
        .iter()
        .filter_map(|marker| after.find(marker).map(|idx| idx + marker.len()))
        .min();
        rest = if let Some(end) = close {
            &after[end..]
        } else {
            break;
        };
    }
    let trimmed = out.trim();
    if trimmed.is_empty() {
        text.trim().to_string()
    } else {
        trimmed.to_string()
    }
}

fn dedupe_tool_calls(calls: Vec<ParsedToolCall>) -> Vec<ParsedToolCall> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for call in calls {
        let key = format!(
            "{}:{}",
            call.name,
            serde_json::to_string(&call.arguments).unwrap_or_default()
        );
        if seen.insert(key) {
            out.push(call);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_qwen_piped_open_close_exact() {
        let calls = parse_all_tool_calls(
            r#"<|tool_call|>call:read_file{path:test/single-page-games/index.html}</|tool_call|>"#,
        );
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "read_file");
        assert_eq!(
            calls[0].arguments["path"],
            "test/single-page-games/index.html"
        );
    }

    #[test]
    fn parses_gemma_and_qwen_in_one_pass() {
        let calls = parse_all_tool_calls(
            r#"<|tool_call>call:list_dir{path:<|"|>.<|"|>}<|tool_call|>
<|tool_call|>call:read_file{path:a.txt}</|tool_call|>"#,
        );
        assert_eq!(calls.len(), 2);
    }

    #[test]
    fn parses_relaxed_tool_call_blocks() {
        let calls = parse_all_tool_calls(
            r#"<tool_call>call:read_file{path:test/index.html}</tool_call>"#,
        );
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].arguments["path"], "test/index.html");
    }

    #[test]
    fn parses_qwen_json_tool_call_blocks() {
        let calls = parse_all_tool_calls(
            r#"<tool_call>
{"name": "read_file", "arguments": {"path": "test/single-page-games/index.html"}}
</tool_call>"#,
        );
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "read_file");
        assert_eq!(
            calls[0].arguments["path"],
            "test/single-page-games/index.html"
        );
    }

    #[test]
    fn parses_bare_call_without_markers() {
        let calls = parse_all_tool_calls(
            "I will read it.\ncall:read_file{path:test/index.html}\n",
        );
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "read_file");
    }

    #[test]
    fn parses_multiline_qwen_piped_close() {
        let calls = parse_all_tool_calls(
            "<|tool_call|>call:read_file{path:test/single-page-games/index.html}\n</|tool_call|>",
        );
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "read_file");
    }

    #[test]
    fn parses_apply_patch_with_json_edits_array() {
        let calls = parse_all_tool_calls(
            r#"<|tool_call|>call:apply_patch{path:vp/a.php,edits:[{"old_text":"$a","new_text":"$b"}]}</|tool_call|>"#,
        );
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "apply_patch");
        assert_eq!(calls[0].arguments["path"], "vp/a.php");
        assert!(calls[0].arguments["edits"].is_array());
    }

    #[test]
    fn parses_file_fence_with_edits_as_apply_patch() {
        let calls = parse_all_tool_calls(
            r#"Fix:
```file:vp/src/a.php
edits:[{"old_text":"$uids","new_text":"$uuids"}]
```"#,
        );
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "apply_patch");
        assert_eq!(calls[0].arguments["path"], "vp/src/a.php");
        let edits = calls[0].arguments["edits"].as_array().expect("edits");
        assert_eq!(edits[0]["old_text"], "$uids");
    }

    #[test]
    fn parses_file_fence_closed_with_xml_file_tag() {
        let calls = parse_all_tool_calls(
            r#"```file:vp/src/a.php
edits:[{"old_text":"foreach ($projectUids as $x)","new_text":"foreach ($projectUuids as $x)"}]</file>"#,
        );
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "apply_patch");
        assert_eq!(calls[0].arguments["path"], "vp/src/a.php");
    }

    #[test]
    fn parses_qwen_read_file_lines_array_alias() {
        let calls = parse_all_tool_calls(
            r#"<|tool_call|>call:read_file{path:vp/src/a.php,lines:[75,82]}</|tool_call|>"#,
        );
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "read_file");
        assert_eq!(calls[0].arguments["lines"], serde_json::json!([75, 82]));
    }

    #[test]
    fn parses_apply_patch_with_escaped_newlines_in_quotes() {
        let calls = parse_all_tool_calls(
            r#"<|tool_call|>call:apply_patch{path:vp/a.php,old_text:"line1\nline2",new_text:"fixed\nline2"}</|tool_call|>"#,
        );
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].arguments["old_text"], "line1\nline2");
        assert_eq!(calls[0].arguments["new_text"], "fixed\nline2");
    }

    #[test]
    fn parses_projects_api_style_tool_calls() {
        let text = r#"<|tool_call|>call:read_file{path:vp/src/service/api/Controllers/ProjectsAPI.php,lines:[75,82]}</|tool_call|>

<|tool_call|>call:apply_patch{path:vp/src/service/api/Controllers/ProjectsAPI.php,old_text:"foreach ($projectUids as $projectUuid) {",new_text:"foreach ($projectUuids as $projectUuid) {"}</|tool_call|>"#;
        let calls = parse_all_tool_calls(text);
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].name, "read_file");
        assert_eq!(calls[1].name, "apply_patch");
        assert_eq!(
            calls[1].arguments["old_text"],
            "foreach ($projectUids as $projectUuid) {"
        );
    }

    #[test]
    fn expands_multi_edit_apply_patch_into_separate_calls() {
        let expanded = expand_apply_patch_calls(vec![
            ParsedToolCall {
                name: "apply_patch".into(),
                arguments: serde_json::json!({
                    "path": "a.php",
                    "edits": [
                        {"old_text": "a", "new_text": "b"},
                        {"old_text": "c", "new_text": "d"},
                    ]
                }),
            },
        ]);
        assert_eq!(expanded.len(), 2);
        assert_eq!(expanded[0].arguments["old_text"], "a");
        assert_eq!(expanded[1].arguments["old_text"], "c");
    }
}
