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
        super::gemma4::parse_gemma4_tool_calls(_output)
    }
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
}
