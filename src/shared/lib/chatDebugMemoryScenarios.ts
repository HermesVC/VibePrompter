/** Ready-made scenarios for Settings → Advanced → Agent scenario runner. */

import type { ChatDebugScenarioInput } from './chatDebugApi';

export const MEMORY_PROBE_SESSION = 'memory-probe-manual';
export const MEMORY_SENTINEL = 'MEMORY_SENTINEL::orchid-17-cobalt-93';

const FILLER_TURNS = 24;

function buildFillerMessages(): Array<{ role: string; content: string; images: [] }> {
  const messages: Array<{ role: string; content: string; images: [] }> = [
    {
      role: 'user',
      content:
        'DECISION: секретный код проекта — VIBE-7749. Запомни этот код, он понадобится позже.',
      images: [],
    },
    {
      role: 'assistant',
      content: 'Принял. Секретный код проекта: VIBE-7749.',
      images: [],
    },
  ];

  for (let i = 0; i < FILLER_TURNS; i++) {
    messages.push({
      role: 'user',
      content: `Филлер #${i}: кратко сравни REST и GraphQL для CRUD. Не повторяй секретный код.`,
      images: [],
    });
    messages.push({
      role: 'assistant',
      content: `Филлер #${i}: REST проще, GraphQL гибче по полям.`,
      images: [],
    });
  }

  messages.push({
    role: 'user',
    content:
      'Какой секретный код проекта мы зафиксировали в DECISION? Ответь только кодом.',
    images: [],
  });

  return messages;
}

/** Single-shot pressure + recall (watch debug trace + result.sessionSummary / retrievedMemory). */
export function memoryRecallPressureScenario(): ChatDebugScenarioInput {
  return {
    modeId: 'chat-developer',
    sessionId: MEMORY_PROBE_SESSION,
    messages: buildFillerMessages(),
  };
}

/** Seed fact only — run first, copy sessionSummary from result into step 2. */
export function memorySeedFactScenario(): ChatDebugScenarioInput {
  return {
    modeId: 'chat-developer',
    sessionId: MEMORY_PROBE_SESSION,
    messages: [
      {
        role: 'user',
        content:
          'DECISION: секретный код проекта — VIBE-7749. Запомни. Ответь одним словом: OK.',
        images: [],
      },
    ],
  };
}

/** Recall only — paste sessionSummary from step 1 into sessionSummary field. */
export function memoryRecallOnlyScenario(sessionSummary: string): ChatDebugScenarioInput {
  return {
    modeId: 'chat-developer',
    sessionId: MEMORY_PROBE_SESSION,
    sessionSummary,
    messages: [
      {
        role: 'user',
        content:
          'Какой секретный код проекта в DECISION? Ответь только кодом, без пояснений.',
        images: [],
      },
    ],
  };
}

export function memorySentinelSeedScenario(): ChatDebugScenarioInput {
  return {
    modeId: 'chat-developer',
    sessionId: MEMORY_PROBE_SESSION,
    forceContextLimit: 4096,
    messages: [
      {
        role: 'user',
        content:
          `DECISION: store this exact project memory sentinel: ${MEMORY_SENTINEL}. ` +
          'It is important and will be requested later. Answer OK only.',
        images: [],
      },
      {
        role: 'assistant',
        content: 'OK',
        images: [],
      },
      ...Array.from({ length: 80 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content:
          `FILLER-${i}: unrelated context pressure about CRUD, UI state, and retry policies. ` +
          'Do not repeat the memory sentinel.',
        images: [],
      })),
      {
        role: 'user',
        content: 'Compress and index old context now. Answer READY only.',
        images: [],
      },
    ],
  };
}

export function memoryVectorOnlyRecallScenario(): ChatDebugScenarioInput {
  return {
    modeId: 'chat-developer',
    sessionId: MEMORY_PROBE_SESSION,
    sessionSummary: '',
    disableRollingMemory: true,
    messages: [
      {
        role: 'user',
        content:
          'Recall the exact MEMORY_SENTINEL value from semantic/vector memory only. ' +
          'Do not use tools. Answer with the sentinel only.',
        images: [],
      },
    ],
  };
}

export function memoryRollingOnlyRecallScenario(sessionSummary: string): ChatDebugScenarioInput {
  return {
    modeId: 'chat-developer',
    sessionId: MEMORY_PROBE_SESSION,
    sessionSummary,
    disableVectorRetrieval: true,
    messages: [
      {
        role: 'user',
        content:
          'Recall the exact MEMORY_SENTINEL value from rolling summary only. ' +
          'Do not use tools. Answer with the sentinel only.',
        images: [],
      },
    ],
  };
}

export function memoryNoMemoryNegativeScenario(): ChatDebugScenarioInput {
  return {
    modeId: 'chat-developer',
    sessionId: `${MEMORY_PROBE_SESSION}-negative`,
    sessionSummary: '',
    disableRollingMemory: true,
    disableVectorRetrieval: true,
    messages: [
      {
        role: 'user',
        content:
          'What is the exact MEMORY_SENTINEL value for this session? ' +
          'If it is not present in context, answer UNKNOWN.',
        images: [],
      },
    ],
  };
}

export function interpretMemoryProbeResult(result: {
  text?: string;
  memoryCompressed?: boolean;
  evictedTurns?: number;
  vectorChunksUsed?: number;
  vectorMemoryCompressed?: boolean;
  sessionSummary?: string;
  retrievedMemory?: string;
  memoryDiagnostics?: {
    vectorAvailable?: boolean;
    vectorChunksRetrieved?: number;
    vectorChunksIndexed?: number;
    rollingSummaryChars?: number;
    degradeLabel?: string;
    inputEstimateFirst?: number;
    inputEstimateFinal?: number;
  };
}): string[] {
  const lines: string[] = [];
  const code = 'VIBE-7749';
  const answer = result.text?.trim() ?? '';
  lines.push(
    answer.includes(code)
      ? `✓ Модель вспомнила код (${code})`
      : `✗ Код не найден в ответе: «${answer.slice(0, 120)}»`
  );
  if (result.memoryCompressed) {
    lines.push(`✓ Rolling memory сжата (${result.evictedTurns ?? '?'} turns evicted)`);
  } else {
    lines.push('○ Rolling compress не срабатывала в этом прогоне');
  }
  if (result.vectorChunksUsed && result.vectorChunksUsed > 0) {
    lines.push(`✓ Vector retrieval: ${result.vectorChunksUsed} chunk(s)`);
  } else {
    lines.push('○ Vector retrieval пустой');
  }
  if (result.vectorMemoryCompressed) {
    lines.push('✓ Vector DB compress сработал');
  }
  if (result.sessionSummary?.includes(code)) {
    lines.push('✓ Код есть в sessionSummary');
  }
  if (result.retrievedMemory?.includes(code)) {
    lines.push('✓ Код есть в retrievedMemory');
  }
  const diag = result.memoryDiagnostics;
  if (diag) {
    lines.push(
      `diag: vector=${diag.vectorAvailable ? 'available' : 'off/unavailable'}, ` +
        `retrieved=${diag.vectorChunksRetrieved ?? 0}, indexed=${diag.vectorChunksIndexed ?? 0}, ` +
        `rollingChars=${diag.rollingSummaryChars ?? 0}, degrade=${diag.degradeLabel ?? 'n/a'}, ` +
        `input=${diag.inputEstimateFirst ?? '?'}->${diag.inputEstimateFinal ?? '?'}`
    );
  }
  return lines;
}
