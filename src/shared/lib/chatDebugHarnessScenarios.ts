/** Harness stress-test scenarios for Settings → Advanced → Agent scenario runner. */

export const HARNESS_AUDIT_SESSION = 'harness-audit-probe';
export const HARNESS_REACT_SESSION = 'harness-react-scaffold';
export const REACT_SCAFFOLD_DIR = 'test/harness-react';

const CONTROLLERS = 'vp/src/service/api/Controllers';

/** Full mini-audit (folder scope, tools + patch + audit.md). */
export function harnessAuditScenario() {
  return {
    modeId: 'chat-developer',
    sessionId: HARNESS_AUDIT_SESSION,
    chatContext: {
      scope: {
        kind: 'folder',
        path: CONTROLLERS,
        treeSummary: `${CONTROLLERS}/ProjectsAPI.php`,
        outlineSummary: '',
        files: [],
        truncated: false,
      },
      modifiers: ['developer'],
      languageId: 'php',
    },
    messages: [
      {
        role: 'user',
        content: `Мини-аудит контроллеров в ${CONTROLLERS}.

1) Сначала только tool_call: file_outline по ProjectsAPI.php и ещё одному PHP-файлу на выбор.
2) read_file только нужные фрагменты.
3) Найди минимум 2 реальных бага (логика/опечатки), не косметику.
4) Каждый фикс — отдельный apply_patch с уникальным old_text.
5) Создай notes/harness-audit.md с отчётом.
6) Краткий ответ по-русски: что нашёл и исправил.

Запрещено: переписывать файлы целиком, \`\`\`file:\`\`\` для существующих PHP.`,
        images: [],
      },
    ],
  };
}

/** Phase 2 — memory recall without re-reading files. */
export function harnessMemoryRecallScenario(sessionSummary?: string) {
  return {
    modeId: 'chat-developer',
    sessionId: HARNESS_AUDIT_SESSION,
    sessionSummary: sessionSummary ?? undefined,
    messages: [
      {
        role: 'user',
        content:
          'Без read_file: перечисли, какие баги ты исправил и в каких файлах. Если помнишь — переменная до и после.',
        images: [],
      },
    ],
  };
}

/** Hard mode — React scaffold step 1: PLAN.md */
export function reactScaffoldStep1Scenario() {
  return {
    modeId: 'chat-developer',
    sessionId: HARNESS_REACT_SESSION,
    chatContext: {
      scope: { kind: 'workspace', treeSummary: `${REACT_SCAFFOLD_DIR}/\n` },
      modifiers: ['developer'],
      languageId: 'typescript',
    },
    messages: [
      {
        role: 'user',
        content: `Создай план scaffold React+Vite+TypeScript в ${REACT_SCAFFOLD_DIR}/.
Выведи один markdown fence:
\`\`\`file ${REACT_SCAFFOLD_DIR}/PLAN.md
# Plan
(дерево файлов и шаги 2–3)
\`\`\`
Без PHP. Не используй tool_call для PLAN.md.`,
        images: [],
      },
    ],
  };
}

export function reactScaffoldStep2Scenario() {
  return {
    modeId: 'chat-developer',
    sessionId: HARNESS_REACT_SESSION,
    chatContext: {
      scope: { kind: 'workspace', treeSummary: `${REACT_SCAFFOLD_DIR}/\n` },
      modifiers: ['developer'],
      languageId: 'typescript',
    },
    messages: [
      {
        role: 'user',
        content: `Шаг 2 scaffold в ${REACT_SCAFFOLD_DIR}/: конфиги через file fences (не tool_call):
- ${REACT_SCAFFOLD_DIR}/package.json (react, react-dom, vite, typescript)
- ${REACT_SCAFFOLD_DIR}/vite.config.ts
- ${REACT_SCAFFOLD_DIR}/index.html
- ${REACT_SCAFFOLD_DIR}/tsconfig.json
Один fence на файл.`,
        images: [],
      },
    ],
  };
}

export function reactScaffoldStep3Scenario() {
  return {
    modeId: 'chat-developer',
    sessionId: HARNESS_REACT_SESSION,
    chatContext: {
      scope: { kind: 'workspace', treeSummary: `${REACT_SCAFFOLD_DIR}/\n` },
      modifiers: ['developer'],
      languageId: 'typescript',
    },
    messages: [
      {
        role: 'user',
        content: `Шаг 3 scaffold в ${REACT_SCAFFOLD_DIR}/: исходники через file fences:
- ${REACT_SCAFFOLD_DIR}/src/main.tsx
- ${REACT_SCAFFOLD_DIR}/src/App.tsx
- ${REACT_SCAFFOLD_DIR}/src/index.css
Простой App с заголовком «Harness React». Без tool_call.`,
        images: [],
      },
    ],
  };
}

export function interpretHarnessAuditTrace(
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
  lines.push(toolsPhase ? '✓ Backend entered tools phase' : '✗ tools phase не было');

  const text = result?.text?.trim() ?? '';
  const rawMarkup =
    /tool_call|call:apply_patch|call:read_file|old_text:\s*\n/i.test(text) &&
    !text.includes('исправ');
  lines.push(
    rawMarkup
      ? '✗ В финальном text остался сырой wire markup'
      : '✓ Сырой tool_call / fence-патч в text нет'
  );

  const mentionsFix =
    /projectUuid|исправ|apply_patch|баг|bug/i.test(text) || text.length > 80;
  lines.push(
    mentionsFix ? '✓ Похоже на осмысленный отчёт' : `○ Короткий ответ (${text.length} chars)`
  );

  const jinjaRetry = trace.some(
    (e) =>
      e.type === 'status' &&
      typeof e.status === 'object' &&
      e.status !== null &&
      (e.status as { phase?: string; message?: string }).phase === 'provider_retry'
  );
  lines.push(
    jinjaRetry ? '○ Были Jinja-ретраи (смотри trace)' : '✓ Jinja-ретраев в trace нет'
  );

  return lines;
}

export function interpretHarnessMemoryRecall(result: { text?: string } | null | undefined): string[] {
  const text = result?.text?.trim() ?? '';
  const lines: string[] = [];
  const mentionsProjects =
    /ProjectsAPI|projectUuid/i.test(text) || /Controllers/i.test(text);
  lines.push(
    mentionsProjects
      ? '✓ Вспомнил контекст ProjectsAPI / переменные'
      : `✗ Нет явного recall: «${text.slice(0, 100)}»`
  );
  lines.push(
    text.length > 20 ? '✓ Развёрнутый ответ' : '○ Очень короткий ответ'
  );
  return lines;
}

export function interpretReactScaffoldStep(
  step: 1 | 2 | 3,
  trace: Array<Record<string, unknown>>,
  result: { text?: string } | null | undefined,
  filesPresent: string[]
): string[] {
  const expected: Record<number, string[]> = {
    1: [`${REACT_SCAFFOLD_DIR}/PLAN.md`],
    2: [
      `${REACT_SCAFFOLD_DIR}/package.json`,
      `${REACT_SCAFFOLD_DIR}/vite.config.ts`,
      `${REACT_SCAFFOLD_DIR}/index.html`,
      `${REACT_SCAFFOLD_DIR}/tsconfig.json`,
    ],
    3: [
      `${REACT_SCAFFOLD_DIR}/src/main.tsx`,
      `${REACT_SCAFFOLD_DIR}/src/App.tsx`,
      `${REACT_SCAFFOLD_DIR}/src/index.css`,
    ],
  };
  const want = expected[step];
  const lines: string[] = [];
  const text = result?.text?.trim() ?? '';

  lines.push(
    /tool_call|call:read_file/i.test(text)
      ? '✗ Не должно быть tool_call на этом шаге'
      : '✓ Без tool_call в ответе'
  );

  const missing = want.filter((p) => !filesPresent.includes(p));
  lines.push(
    missing.length === 0
      ? `✓ Все файлы шага ${step} на диске`
      : `✗ Нет на диске: ${missing.join(', ')}`
  );

  if (step === 2 && filesPresent.some((p) => p.endsWith('package.json'))) {
    lines.push('○ Проверь package.json вручную (react + vite)');
  }
  if (step === 3 && text.toLowerCase().includes('harness react')) {
    lines.push('✓ App упоминает Harness React');
  }

  const toolsPhase = trace.some(
    (e) =>
      e.type === 'status' &&
      typeof e.status === 'object' &&
      e.status !== null &&
      (e.status as { phase?: string }).phase === 'tools'
  );
  if (toolsPhase) {
    lines.push('○ tools phase была (для scaffold не обязательна)');
  }

  return lines;
}

export function interpretDeterministicHarness(
  report: { checks: Array<{ id: string; pass: boolean; detail: string }>; allPass: boolean } | null
): string[] {
  if (!report) return ['○ Deterministic probe не запускался'];
  return report.checks.map((c) =>
    `${c.pass ? '✓' : '✗'} ${c.id}: ${c.detail.slice(0, 100)}`
  );
}
