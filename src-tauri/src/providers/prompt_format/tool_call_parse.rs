//! Parse tool_call blocks from model text (Gemma, Qwen, relaxed XML).

use serde_json::Value;

use super::types::ParsedToolCall;

/// Try every supported wire format; models often ignore the connection template id.
pub fn parse_all_tool_calls(text: &str) -> Vec<ParsedToolCall> {
    let mut out = super::gemma4::parse_gemma4_tool_calls(text);
    out.extend(parse_qwen_piped_tool_calls(text));
    out.extend(parse_relaxed_tool_calls(text));
    dedupe_tool_calls(out)
}

/// Qwen / LM Studio: `<|tool_call|>call:name{args}</|tool_call|>`
pub fn parse_qwen_piped_tool_calls(text: &str) -> Vec<ParsedToolCall> {
    parse_marker_tool_calls(
        text,
        "<|tool_call|>",
        &["</|tool_call|>", "<|tool_call|>", "</tool_call>", "<|tool_call>"],
    )
}

pub fn parse_relaxed_tool_calls(text: &str) -> Vec<ParsedToolCall> {
    parse_marker_tool_calls(
        text,
        "<tool_call>",
        &["</tool_call>", "<|tool_call|>", "<|tool_call>"],
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
    let segment = segment.strip_prefix("call:").unwrap_or(segment).trim();
    let brace = segment.find('{')?;
    let name = segment[..brace].trim();
    if name.is_empty() {
        return None;
    }
    let args_end = matching_brace_end(segment, brace)?;
    let args = segment[brace..args_end].trim();
    Some(ParsedToolCall {
        name: name.to_string(),
        arguments: parse_relaxed_args(args).unwrap_or_else(|| serde_json::Map::new().into()),
    })
}

fn matching_brace_end(s: &str, open_idx: usize) -> Option<usize> {
    let mut depth = 0i32;
    let mut quote: Option<char> = None;
    let tail = s.get(open_idx..)?;
    for (offset, ch) in tail.char_indices() {
        if let Some(q) = quote {
            if ch == q {
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
            if ch == q {
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
        return Value::String(raw[1..raw.len() - 1].to_string());
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
}
