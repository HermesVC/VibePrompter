//! OpenAI-style wire format — roles travel as JSON `messages`; no local template.

use serde_json::{Map, Value};

use super::types::{ParsedToolCall, PromptFormatContext};
use super::ChatPromptFormat;

pub struct OpenAiMessagesFormat;

impl ChatPromptFormat for OpenAiMessagesFormat {
    fn id(&self) -> &'static str {
        "openai_messages"
    }

    fn display_name(&self) -> &'static str {
        "OpenAI messages (JSON)"
    }

    fn description(&self) -> &'static str {
        "Default for OpenAI-compatible APIs. The server applies its own chat template."
    }

    fn supports_tool_calling(&self) -> bool {
        true
    }

    fn uses_wire_messages(&self) -> bool {
        true
    }

    fn render(&self, _ctx: &PromptFormatContext) -> String {
        String::new()
    }

    fn parse_tool_calls(&self, output: &str) -> Vec<ParsedToolCall> {
        let mut calls = super::gemma4::parse_gemma4_tool_calls(output);
        calls.extend(parse_relaxed_tool_calls(output));
        calls
    }
}

fn parse_relaxed_tool_calls(text: &str) -> Vec<ParsedToolCall> {
    let mut out = Vec::new();
    let mut rest = text;
    const OPEN: &str = "<tool_call>";
    const CLOSE: &str = "</tool_call>";

    while let Some(start) = rest.find(OPEN) {
        let after = &rest[start + OPEN.len()..];
        let Some(close_idx) = after.find(CLOSE) else {
            break;
        };
        if let Some(call) = parse_relaxed_call_segment(&after[..close_idx]) {
            out.push(call);
        }
        rest = &after[close_idx + CLOSE.len()..];
    }

    out
}

fn parse_relaxed_call_segment(segment: &str) -> Option<ParsedToolCall> {
    let segment = segment.trim();
    let segment = segment.strip_prefix("call:").unwrap_or(segment).trim();
    let brace = segment.find('{')?;
    let name = segment[..brace].trim();
    if name.is_empty() {
        return None;
    }
    let args = segment[brace..].trim();
    Some(ParsedToolCall {
        name: name.to_string(),
        arguments: parse_relaxed_args(args).unwrap_or_else(|| Value::Object(Map::new())),
    })
}

fn parse_relaxed_args(body: &str) -> Option<Value> {
    let body = body.trim();
    if !body.starts_with('{') || !body.ends_with('}') {
        return None;
    }
    let inner = &body[1..body.len() - 1];
    let mut map = Map::new();
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_text_tool_call_blocks() {
        let calls = OpenAiMessagesFormat.parse_tool_calls(
            r#"I'll inspect it.
<|tool_call>call:read_file{path:<|"|>test/snake.js<|"|>,start_line:1,end_line:80}<|tool_call|>"#,
        );

        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "read_file");
        assert_eq!(calls[0].arguments["path"], "test/snake.js");
        assert_eq!(calls[0].arguments["start_line"], 1);
        assert_eq!(calls[0].arguments["end_line"], 80);
    }

    #[test]
    fn parses_qwen_relaxed_tool_call_blocks() {
        let calls = OpenAiMessagesFormat.parse_tool_calls(
            r#"Проверю реальный содержимое файлов:

<tool_call>call:read_file{path:test/single-page-games/index.html}</tool_call>"#,
        );

        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "read_file");
        assert_eq!(
            calls[0].arguments["path"],
            "test/single-page-games/index.html"
        );
    }

    #[test]
    fn parses_relaxed_tool_call_with_line_range() {
        let calls = OpenAiMessagesFormat.parse_tool_calls(
            r#"<tool_call>call:read_file{path:"test/js/game.js", start_line: 12, end_line: 40}</tool_call>"#,
        );

        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].arguments["path"], "test/js/game.js");
        assert_eq!(calls[0].arguments["start_line"], 12);
        assert_eq!(calls[0].arguments["end_line"], 40);
    }
}
