import { invoke } from '@tauri-apps/api/core';
import type { ParsedToolCall, ToolDefinition } from './promptFormatApi';

export interface ToolExecutionResult {
  name: string;
  ok: boolean;
  output: Record<string, unknown>;
  message: string;
}

export interface ExecuteToolCallsFromTextResult {
  toolCalls: ParsedToolCall[];
  results: ToolExecutionResult[];
}

export async function listAgentTools(): Promise<ToolDefinition[]> {
  return invoke<ToolDefinition[]>('list_agent_tools');
}

export async function executeAgentTool(
  name: string,
  args: Record<string, unknown> = {},
  scopePath?: string
): Promise<ToolExecutionResult> {
  return invoke<ToolExecutionResult>('execute_agent_tool', {
    input: { name, arguments: args, scopePath },
  });
}

export async function executeToolCallsFromText(
  formatId: string,
  text: string,
  scopePath?: string
): Promise<ExecuteToolCallsFromTextResult> {
  return invoke<ExecuteToolCallsFromTextResult>('execute_tool_calls_from_text', {
    input: { formatId, text, scopePath },
  });
}
