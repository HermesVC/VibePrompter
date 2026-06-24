//! OpenAI-style wire format — roles travel as JSON `messages`; no local template.

use super::tool_call_parse;
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
        tool_call_parse::parse_all_tool_calls(output)
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
    fn parses_qwen_piped_wrapped_close() {
        let calls = OpenAiMessagesFormat.parse_tool_calls(
            r#"<|tool_call|>call:read_file{path:test/single-page-games/index.html}</|tool_call|>"#,
        );

        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "read_file");
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

    #[test]
    fn parses_mixed_qwen_tool_call_close_marker() {
        let calls = OpenAiMessagesFormat.parse_tool_calls(
            r#"<tool_call>call:read_file{path:test/single-page-games/index.html}<|tool_call>"#,
        );

        assert_eq!(calls.len(), 1);
        assert_eq!(
            calls[0].arguments["path"],
            "test/single-page-games/index.html"
        );
    }

    #[test]
    fn parses_relaxed_tool_call_with_trailing_prose_after_args() {
        let calls = OpenAiMessagesFormat
            .parse_tool_calls(r#"<tool_call>call:read_file{path:test/index.html} now waiting"#);

        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].arguments["path"], "test/index.html");
    }
}
