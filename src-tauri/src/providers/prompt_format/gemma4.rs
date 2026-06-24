//! Gemma 4 chat template — matches `apply_chat_template(..., tools=...)` from Hugging Face.
//!
//! Reference: https://ai.google.dev/gemma/docs/capabilities/text/function-calling-gemma4

use serde_json::{json, Map, Value};

use super::types::{CanonicalRole, ParsedToolCall, PromptFormatContext, ToolDefinition};
use super::ChatPromptFormat;

pub struct Gemma4Format;

const BOS: &str = "<bos>";
const TURN_CLOSE: &str = "<|turn|>";

impl ChatPromptFormat for Gemma4Format {
    fn id(&self) -> &'static str {
        "gemma4"
    }

    fn display_name(&self) -> &'static str {
        "Gemma 4 (turn template)"
    }

    fn description(&self) -> &'static str {
        "Local `<|turn|>` template for Gemma 4-it. Supports tool declarations, tool_call, and tool_response turns."
    }

    fn supports_tool_calling(&self) -> bool {
        true
    }

    fn uses_wire_messages(&self) -> bool {
        false
    }

    fn render(&self, ctx: &PromptFormatContext) -> String {
        render_gemma4(ctx)
    }

    fn parse_tool_calls(&self, output: &str) -> Vec<ParsedToolCall> {
        super::tool_call_parse::parse_all_tool_calls(output)
    }
}

pub fn render_gemma4(ctx: &PromptFormatContext) -> String {
    let mut out = String::from(BOS);

    let mut system_parts: Vec<String> = Vec::new();
    if let Some(sys) = ctx.system.as_ref().filter(|s| !s.trim().is_empty()) {
        system_parts.push(sys.trim().to_string());
    }
    for msg in &ctx.messages {
        if msg.role == CanonicalRole::System {
            if let Some(c) = msg.content.as_ref().filter(|s| !s.trim().is_empty()) {
                system_parts.push(c.trim().to_string());
            }
        }
    }

    if !system_parts.is_empty() || !ctx.tools.is_empty() {
        out.push_str("<|turn>system\n");
        if !system_parts.is_empty() {
            out.push_str(&system_parts.join("\n\n"));
        }
        for tool in &ctx.tools {
            out.push_str(&format_tool_declaration(tool));
        }
        out.push_str(TURN_CLOSE);
    }

    for msg in &ctx.messages {
        match msg.role {
            CanonicalRole::System => {}
            CanonicalRole::User => {
                out.push_str("<|turn>user\n");
                out.push_str(msg.content.as_deref().unwrap_or("").trim());
                out.push_str(TURN_CLOSE);
            }
            CanonicalRole::Assistant => {
                out.push_str("<|turn>model\n");
                for call in &msg.tool_calls {
                    out.push_str(&format_tool_call(call.name.as_str(), &call.arguments));
                }
                for resp in &msg.tool_responses {
                    out.push_str(&format_tool_response(resp.name.as_str(), &resp.response));
                }
                if let Some(text) = msg.content.as_ref().filter(|s| !s.is_empty()) {
                    out.push_str(text);
                }
                out.push_str(TURN_CLOSE);
            }
        }
    }

    if ctx.add_generation_prompt {
        out.push_str("<|turn>model\n");
    }

    out
}

fn format_tool_declaration(tool: &ToolDefinition) -> String {
    let body = encode_tool_schema(tool);
    format!("<|tool>declaration:{}{}<|tool|>", tool.name, body)
}

/// Concatenate Gemma 4 tool declaration blocks for injection into the system turn.
pub fn format_tool_declarations(tools: &[ToolDefinition]) -> String {
    tools
        .iter()
        .map(format_tool_declaration)
        .collect::<Vec<_>>()
        .join("")
}

fn encode_tool_schema(tool: &ToolDefinition) -> String {
    let mut parts = vec![format!("description:{}", gemma_quote(&tool.description))];

    if tool.parameters.is_object() {
        parts.push(format!(
            "parameters:{}",
            encode_schema_object(&tool.parameters)
        ));
    } else {
        parts.push("parameters:{type:<|\"|>OBJECT<|\"|>}".to_string());
    }

    format!("{{{}}}", parts.join(","))
}

fn encode_schema_object(schema: &Value) -> String {
    let mut parts: Vec<String> = Vec::new();

    if let Some(props) = schema.get("properties").and_then(|v| v.as_object()) {
        let mut prop_parts: Vec<String> = Vec::new();
        for (key, val) in props {
            prop_parts.push(format!("{}:{}", key, encode_schema_property(val)));
        }
        parts.push(format!("properties:{{{}}}", prop_parts.join(",")));
    }

    if let Some(required) = schema.get("required").and_then(|v| v.as_array()) {
        let items: Vec<String> = required
            .iter()
            .filter_map(|v| v.as_str().map(gemma_quote))
            .collect();
        if !items.is_empty() {
            parts.push(format!("required:[{}]", items.join(",")));
        }
    }

    let ty = schema
        .get("type")
        .and_then(|v| v.as_str())
        .map(json_type_to_gemma)
        .unwrap_or("OBJECT");
    parts.push(format!("type:{}", gemma_quote(ty)));

    format!("{{{}}}", parts.join(","))
}

fn encode_schema_property(prop: &Value) -> String {
    let mut parts: Vec<String> = Vec::new();

    if let Some(desc) = prop.get("description").and_then(|v| v.as_str()) {
        parts.push(format!("description:{}", gemma_quote(desc)));
    }

    if let Some(enum_vals) = prop.get("enum").and_then(|v| v.as_array()) {
        let items: Vec<String> = enum_vals
            .iter()
            .filter_map(|v| v.as_str().map(gemma_quote))
            .collect();
        if !items.is_empty() {
            parts.push(format!("enum:[{}]", items.join(",")));
        }
    }

    let ty = prop
        .get("type")
        .and_then(|v| v.as_str())
        .map(json_type_to_gemma)
        .unwrap_or("STRING");
    parts.push(format!("type:{}", gemma_quote(ty)));

    format!("{{{}}}", parts.join(","))
}

fn json_type_to_gemma(ty: &str) -> &str {
    match ty.to_ascii_lowercase().as_str() {
        "string" => "STRING",
        "integer" => "INTEGER",
        "number" => "NUMBER",
        "boolean" => "BOOLEAN",
        "array" => "ARRAY",
        "object" => "OBJECT",
        _ => "STRING",
    }
}

pub fn format_tool_call(name: &str, arguments: &Value) -> String {
    format!(
        "<|tool_call>call:{}{}<|tool_call|>",
        name,
        encode_inline_object(arguments)
    )
}

pub fn format_tool_response(name: &str, response: &Value) -> String {
    format!(
        "<|tool_response>response:{}{}<|tool_response|>",
        name,
        encode_inline_object(response)
    )
}

fn encode_inline_object(value: &Value) -> String {
    match value {
        Value::Object(map) => format!("{{{}}}", encode_map_pairs(map)),
        Value::Null => "{}".to_string(),
        other => format!("{{{}}}", encode_value_pair("_", other)),
    }
}

fn encode_map_pairs(map: &Map<String, Value>) -> String {
    map.iter()
        .map(|(k, v)| encode_value_pair(k, v))
        .collect::<Vec<_>>()
        .join(",")
}

fn encode_value_pair(key: &str, value: &Value) -> String {
    match value {
        Value::String(s) => format!("{}:{}", key, gemma_quote(s)),
        Value::Number(n) => format!("{}:{}", key, n),
        Value::Bool(b) => format!("{}:{}", key, b),
        Value::Null => format!("{}:null", key),
        Value::Array(arr) => {
            let inner = arr
                .iter()
                .map(encode_scalar_or_quoted)
                .collect::<Vec<_>>()
                .join(",");
            format!("{}:[{}]", key, inner)
        }
        Value::Object(map) => format!("{}:{{{}}}", key, encode_map_pairs(map)),
    }
}

fn encode_scalar_or_quoted(value: &Value) -> String {
    match value {
        Value::String(s) => gemma_quote(s),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => "null".to_string(),
        Value::Array(_) | Value::Object(_) => encode_inline_object(value),
    }
}

fn gemma_quote(s: &str) -> String {
    format!("<|\"|>{}<|\"|>", s.replace('<', "\\<"))
}

pub fn parse_gemma4_tool_calls(text: &str) -> Vec<ParsedToolCall> {
    let mut out = Vec::new();
    let mut rest = text;
    const OPEN: &str = "<|tool_call>call:";
    const CLOSE: &str = "<|tool_call|>";

    while let Some(start) = rest.find(OPEN) {
        let after = &rest[start + OPEN.len()..];
        let Some(close_idx) = after.find(CLOSE) else {
            break;
        };
        let segment = &after[..close_idx];
        let Some(brace) = segment.find('{') else {
            rest = &after[close_idx + CLOSE.len()..];
            continue;
        };
        let name = segment[..brace].trim();
        let args_body = &segment[brace..];
        let arguments = parse_gemma_inline_object(args_body).unwrap_or(json!({}));
        if !name.is_empty() {
            out.push(ParsedToolCall {
                name: name.to_string(),
                arguments,
            });
        }
        rest = &after[close_idx + CLOSE.len()..];
    }

    out
}

fn parse_gemma_inline_object(body: &str) -> Option<Value> {
    let body = body.trim();
    if !body.starts_with('{') || !body.ends_with('}') {
        return None;
    }
    let inner = &body[1..body.len() - 1];
    let mut map = Map::new();
    for part in split_top_level(inner) {
        let (key, val) = part.split_once(':')?;
        let key = key.trim().trim_matches('"');
        map.insert(key.to_string(), parse_gemma_value(val.trim())?);
    }
    Some(Value::Object(map))
}

fn split_top_level(s: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut start = 0usize;
    for (i, ch) in s.char_indices() {
        match ch {
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

fn parse_gemma_value(raw: &str) -> Option<Value> {
    if raw.starts_with("<|\"") {
        let inner = raw
            .strip_prefix("<|\"|>")?
            .strip_suffix("<|\"|>")?
            .replace("\\<", "<");
        return Some(Value::String(inner));
    }
    if raw.starts_with('[') && raw.ends_with(']') {
        let inner = &raw[1..raw.len() - 1];
        let items: Vec<Value> = split_top_level(inner)
            .into_iter()
            .filter_map(|p| parse_gemma_value(p.trim()))
            .collect();
        return Some(Value::Array(items));
    }
    if raw.starts_with('{') && raw.ends_with('}') {
        return parse_gemma_inline_object(raw);
    }
    if raw == "true" {
        return Some(Value::Bool(true));
    }
    if raw == "false" {
        return Some(Value::Bool(false));
    }
    if raw == "null" {
        return Some(Value::Null);
    }
    if let Ok(n) = raw.parse::<i64>() {
        return Some(Value::Number(n.into()));
    }
    if let Ok(n) = raw.parse::<f64>() {
        return serde_json::Number::from_f64(n).map(Value::Number);
    }
    Some(Value::String(raw.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::prompt_format::types::{CanonicalMessage, ToolCall, ToolResponse};

    #[test]
    fn renders_basic_user_turn() {
        let ctx = PromptFormatContext {
            system: Some("You are helpful.".into()),
            messages: vec![CanonicalMessage {
                role: CanonicalRole::User,
                content: Some("Hello".into()),
                tool_calls: vec![],
                tool_responses: vec![],
            }],
            tools: vec![],
            add_generation_prompt: true,
        };
        let rendered = render_gemma4(&ctx);
        assert!(rendered.starts_with("<bos><|turn>system\nYou are helpful.<|turn|>"));
        assert!(rendered.contains("<|turn>user\nHello<|turn|>"));
        assert!(rendered.ends_with("<|turn>model\n"));
    }

    #[test]
    fn renders_tool_declaration() {
        let ctx = PromptFormatContext {
            system: Some("You are a helpful assistant.".into()),
            messages: vec![CanonicalMessage {
                role: CanonicalRole::User,
                content: Some("What's the temperature in London?".into()),
                tool_calls: vec![],
                tool_responses: vec![],
            }],
            tools: vec![ToolDefinition {
                name: "get_current_temperature".into(),
                description: "Gets the current temperature for a given location.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "location": {
                            "type": "string",
                            "description": "The city name, e.g. San Francisco"
                        }
                    },
                    "required": ["location"]
                }),
            }],
            add_generation_prompt: true,
        };
        let rendered = render_gemma4(&ctx);
        assert!(rendered.contains("<|tool>declaration:get_current_temperature{"));
        assert!(rendered.contains("location"));
        assert!(rendered.contains("<|turn>user\nWhat's the temperature in London?<|turn|>"));
    }

    #[test]
    fn parses_tool_call_output() {
        let text =
            r#"<|tool_call>call:get_current_weather{location:<|"|>Tokyo, JP<|"|>}<|tool_call|>"#;
        let calls = parse_gemma4_tool_calls(text);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "get_current_weather");
        assert_eq!(calls[0].arguments["location"], "Tokyo, JP");
    }

    #[test]
    fn renders_assistant_tool_roundtrip() {
        let ctx = PromptFormatContext {
            system: Some("You are a helpful assistant.".into()),
            messages: vec![
                CanonicalMessage {
                    role: CanonicalRole::User,
                    content: Some("Hey, what's the weather in Tokyo right now?".into()),
                    tool_calls: vec![],
                    tool_responses: vec![],
                },
                CanonicalMessage {
                    role: CanonicalRole::Assistant,
                    content: Some(
                        "The current weather in Tokyo is 15 degrees Celsius and sunny.".into(),
                    ),
                    tool_calls: vec![ToolCall {
                        name: "get_current_weather".into(),
                        arguments: json!({ "location": "Tokyo, JP" }),
                    }],
                    tool_responses: vec![ToolResponse {
                        name: "get_current_weather".into(),
                        response: json!({ "temperature": 15, "weather": "sunny" }),
                    }],
                },
            ],
            tools: vec![ToolDefinition {
                name: "get_current_weather".into(),
                description: "Gets the current weather in a given location.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "location": { "type": "string" }
                    },
                    "required": ["location"]
                }),
            }],
            add_generation_prompt: false,
        };
        let rendered = render_gemma4(&ctx);
        assert!(rendered.contains("<|tool_call>call:get_current_weather{"));
        assert!(rendered.contains("<|tool_response>response:get_current_weather{"));
        assert!(rendered.contains("15 degrees Celsius"));
    }
}
