import { invoke } from '@tauri-apps/api/core';

export interface PromptFormatInfo {
  id: string;
  label: string;
  description: string;
  supportsToolCalling: boolean;
  usesWireMessages: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface RenderPromptFormatInput {
  formatId: string;
  system?: string;
  messages?: Array<{ role: string; content: string }>;
  tools?: ToolDefinition[];
  addGenerationPrompt?: boolean;
}

export interface RenderPromptFormatResult {
  formatId: string;
  usesWireMessages: boolean;
  rendered: string;
}

export interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export async function listPromptFormats(): Promise<PromptFormatInfo[]> {
  return invoke<PromptFormatInfo[]>('list_prompt_formats');
}

export async function renderPromptFormat(
  input: RenderPromptFormatInput
): Promise<RenderPromptFormatResult> {
  return invoke<RenderPromptFormatResult>('render_prompt_format', { input });
}

export async function parsePromptToolCalls(
  formatId: string,
  text: string
): Promise<ParsedToolCall[]> {
  return invoke<ParsedToolCall[]>('parse_prompt_tool_calls', { formatId, text });
}
