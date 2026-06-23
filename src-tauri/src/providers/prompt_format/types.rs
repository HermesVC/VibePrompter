//! Shared types for chat prompt formatters.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CanonicalRole {
    System,
    User,
    Assistant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub parameters: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    pub name: String,
    pub arguments: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResponse {
    pub name: String,
    pub response: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanonicalMessage {
    pub role: CanonicalRole,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub tool_calls: Vec<ToolCall>,
    #[serde(default)]
    pub tool_responses: Vec<ToolResponse>,
}

#[derive(Debug, Clone)]
pub struct PromptFormatContext {
    pub system: Option<String>,
    pub messages: Vec<CanonicalMessage>,
    pub tools: Vec<ToolDefinition>,
    pub add_generation_prompt: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedToolCall {
    pub name: String,
    pub arguments: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptFormatInfo {
    pub id: String,
    pub label: String,
    pub description: String,
    pub supports_tool_calling: bool,
    pub uses_wire_messages: bool,
}
