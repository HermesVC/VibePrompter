/** Tool-calling scenarios for Settings → Advanced → Agent scenario runner. */

export function toolCallFolderReadScenario(workspaceRelPath = 'test') {
  return {
    modeId: 'chat-developer',
    sessionId: 'tool-call-probe-ui',
    chatContext: {
      scope: {
        kind: 'folder',
        path: workspaceRelPath,
        treeSummary: `${workspaceRelPath}/single-page-games/index.html`,
        outlineSummary: '',
        files: [],
        truncated: false,
      },
      modifiers: ['developer'],
      languageId: null,
    },
    messages: [
      {
        role: 'user',
        content:
          'Прочитай test/single-page-games/index.html через read_file и процитируй тег <title>.',
        images: [],
      },
    ],
  };
}

export function interpretToolProbeTrace(
  trace: Array<Record<string, unknown>>,
  result: { text?: string } | null | undefined
): string[] {
  const lines: string[] = [];
  const toolsPhase = trace.some(
    (e) =>
      e.type === 'status' &&
      typeof e.status === 'object' &&
      e.status !== null &&
      (e.status as { phase?: string }).phase === 'tools'
  );
  lines.push(toolsPhase ? '✓ Backend entered tools phase' : '✗ tools phase не было в trace');

  const text = result?.text?.trim() ?? '';
  const hasMarkup =
    text.includes('tool_call') || text.includes('<|tool_call') || text.includes('call:read_file');
  lines.push(
    hasMarkup
      ? '✗ В ответе остался сырой tool_call — loop не отработал'
      : '✓ Сырой tool_call в финальном text нет'
  );

  const looksLikeHtml =
    text.toLowerCase().includes('<title') ||
    text.toLowerCase().includes('<!doctype') ||
    text.toLowerCase().includes('<html');
  lines.push(
    looksLikeHtml || text.length > 120
      ? '✓ Похоже, есть содержимое файла или развёрнутый ответ'
      : `○ Короткий ответ (${text.length} chars): «${text.slice(0, 100)}»`
  );

  return lines;
}
