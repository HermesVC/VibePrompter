//! Prompt format registry — list formats and preview rendered templates.

use serde::Deserialize;

use crate::models::ChatMessage;
use crate::providers::prompt_format::{
    self, build_context, resolve, ToolDefinition, PromptFormatInfo,
};

#[tauri::command]
pub fn list_prompt_formats() -> Vec<PromptFormatInfo> {
    prompt_format::list_formats()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderPromptFormatInput {
    pub format_id: String,
    #[serde(default)]
    pub system: Option<String>,
    #[serde(default)]
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub tools: Vec<ToolDefinition>,
    #[serde(default = "default_true")]
    pub add_generation_prompt: bool,
}

fn default_true() -> bool {
    true
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderPromptFormatResult {
    pub format_id: String,
    pub uses_wire_messages: bool,
    pub rendered: String,
    pub tool_calls: Vec<prompt_format::ParsedToolCall>,
}

/// Preview how a connection's prompt format serializes system + messages (+ optional tools).
#[tauri::command]
pub fn render_prompt_format(input: RenderPromptFormatInput) -> RenderPromptFormatResult {
    let format = resolve(&input.format_id);
    let ctx = build_context(
        input.system,
        &input.messages,
        input.tools,
        input.add_generation_prompt,
    );
    let rendered = format.render(&ctx);
    RenderPromptFormatResult {
        format_id: format.id().to_string(),
        uses_wire_messages: format.uses_wire_messages(),
        rendered,
        tool_calls: Vec::new(),
    }
}

/// Parse tool calls from a model output string (Gemma 4 `<|tool_call|>` blocks).
#[tauri::command]
pub fn parse_prompt_tool_calls(format_id: String, text: String) -> Vec<prompt_format::ParsedToolCall> {
    resolve(&format_id).parse_tool_calls(&text)
}
