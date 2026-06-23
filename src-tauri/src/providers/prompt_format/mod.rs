//! Pluggable chat prompt formats — render local templates or defer to wire JSON.

mod gemma4;
mod openai_messages;
mod types;

pub use types::*;

use gemma4::Gemma4Format;
use openai_messages::OpenAiMessagesFormat;

use crate::models::ChatMessage;

/// Renders chat history into a provider-specific prompt string or delegates to wire JSON.
pub trait ChatPromptFormat: Send + Sync {
    fn id(&self) -> &'static str;
    fn display_name(&self) -> &'static str;
    fn description(&self) -> &'static str;
    fn supports_tool_calling(&self) -> bool;
    /// When `true`, HTTP uses OpenAI `messages` JSON; when `false`, use `render()` for `/completions`.
    fn uses_wire_messages(&self) -> bool;
    fn render(&self, ctx: &PromptFormatContext) -> String;
    fn parse_tool_calls(&self, output: &str) -> Vec<ParsedToolCall>;
}

static OPENAI_MESSAGES: OpenAiMessagesFormat = OpenAiMessagesFormat;
static GEMMA4: Gemma4Format = Gemma4Format;

const FORMATS: &[&dyn ChatPromptFormat] = &[&OPENAI_MESSAGES, &GEMMA4];

pub fn resolve(id: &str) -> &'static dyn ChatPromptFormat {
    FORMATS
        .iter()
        .find(|f| f.id() == id)
        .copied()
        .unwrap_or(&OPENAI_MESSAGES)
}

pub fn list_formats() -> Vec<PromptFormatInfo> {
    FORMATS
        .iter()
        .map(|f| PromptFormatInfo {
            id: f.id().to_string(),
            label: f.display_name().to_string(),
            description: f.description().to_string(),
            supports_tool_calling: f.supports_tool_calling(),
            uses_wire_messages: f.uses_wire_messages(),
        })
        .collect()
}

pub fn default_format_id() -> &'static str {
    "openai_messages"
}

/// Map API chat messages + optional system line into a canonical render context.
pub fn build_context(
    system: Option<String>,
    messages: &[ChatMessage],
    tools: Vec<ToolDefinition>,
    add_generation_prompt: bool,
) -> PromptFormatContext {
    let mut canonical = Vec::with_capacity(messages.len());
    for m in messages {
        let role = match m.role.as_str() {
            "system" => CanonicalRole::System,
            "assistant" => CanonicalRole::Assistant,
            _ => CanonicalRole::User,
        };
        canonical.push(CanonicalMessage {
            role,
            content: if m.content.is_empty() {
                None
            } else {
                Some(m.content.clone())
            },
            tool_calls: Vec::new(),
            tool_responses: Vec::new(),
        });
    }

    PromptFormatContext {
        system,
        messages: canonical,
        tools,
        add_generation_prompt,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_contains_gemma4() {
        let formats = list_formats();
        assert!(formats.iter().any(|f| f.id == "gemma4"));
        assert!(formats.iter().any(|f| f.id == "openai_messages"));
    }

    #[test]
    fn unknown_format_falls_back_to_openai() {
        assert_eq!(resolve("unknown").id(), "openai_messages");
    }
}
