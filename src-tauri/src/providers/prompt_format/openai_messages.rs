//! OpenAI-style wire format — roles travel as JSON `messages`; no local template.

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

    fn parse_tool_calls(&self, _output: &str) -> Vec<ParsedToolCall> {
        Vec::new()
    }
}
