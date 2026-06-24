# План: железные ретраи и пересборка контекста

**Цель:** агент не падает из‑за переполнения контекста, обрыва стрима и Jinja на LM Studio — вместо `Err` идёт деградация payload и повтор.

**Не в scope:** бесконечные ретраи, «магия» для мёртвого LM Studio, subagent'ы.

**Порядок:** четыре фазы по убыванию ROI / возрастанию diff. Каждая фаза самодостаточна для merge.

---

## Текущее состояние (кратко)

| Есть | Нет / слабо |
|------|-------------|
| `run_chat`: sliding window `Normal → Aggressive → Emergency`, до 3 попыток | Tool follow-up без context recovery |
| Сжатие memory + `fallback_*` | Cap на тело `read_file` в tool results |
| Jinja 3× в `complete_stream_with_observer` | Jinja reshape (anchor user, dedupe messages) |
| `should_retry_for_context` после stream+tools | Preflight до отправки |
| Autonomous наследует `run_chat` | Retry шага / planning в autonomous |

**Главная дыра:** после `read_file` follow-up раздувает prompt → decode/OOM без overflow-текста → partial/fail без пересборки окна.

---

## Фаза 1 — Tool follow-up + recovery + cap tool results

**Приоритет:** максимальный выигрыш при умеренном diff.

### Проблема

- `run_tool_followup_loop` → `complete_stream_with_tool_auto_continue` → голый `complete_stream`.
- При `Err` (decode, transport) — warn + partial, **без** `should_retry_for_context`.
- `format_tool_followup_user_message` отдаёт **полный** JSON/`content` из `read_file`.

### Задачи

1. **Cap tool results** в `agent_tools.rs`:
   - Константа `TOOL_RESULT_MAX_CHARS` (например 10–12k на результат, 24k на turn).
   - Для `read_file`: если `content` длинный — truncate + hint «use read_file with lines».
   - Для `apply_patch` ok — короткий summary, не дублировать файл.

2. **Общий wrapper** `run_completion_with_recovery` (новый модуль `chat/completion_recovery.rs` или расширение `context_recovery.rs`):
   - Вход: messages, params, conn, cfg, events, cancel, `input_estimate`, `context_limit`.
   - Внутри: вызов `complete_stream_with_observer` / auto-continue.
   - При fail: классификация → если context/transport retriable → вернуть `RetryWithDegrade` (пока только существующий `WindowAggression.next()`, без фазы 2).

3. **Подключить wrapper в tool follow-up**:
   - `complete_stream_with_tool_auto_continue` использует recovery вместо прямого `complete_stream`.
   - При исчерпании попыток — partial tool results (как сейчас), но **после** N degrade-попыток.

4. **Тесты**:
   - Unit: truncate tool message > cap.
   - Harness (опционально): synthetic fat `read_file` mock в deterministic check.

### Файлы

- `src-tauri/src/chat/agent_tools.rs`
- `src-tauri/src/chat/completion_recovery.rs` (new) или `context_recovery.rs`
- `src-tauri/src/chat/run_service.rs` — позже унификация с фазой 2

### Критерий готовности

- Follow-up после `read_file` большого файла не рвёт стрим без хотя бы одной попытки с урезанным tool block.
- Обычный 1-file audit на synthetic fixture стабилен.

---

## Фаза 2 — Preflight + расширенная лестница degrade

**Приоритет:** «не валиться на пересборке» для длинных сессий и autonomous.

### Проблема

- Только 3 уровня `WindowAggression`, потом hard fail.
- LM Studio часто падает без текста overflow — retry не срабатывает.
- Между шагами autonomous история только растёт.

### Задачи

1. **`DegradeLevel` enum** (0..6):

   | Level | Действие |
   |-------|----------|
   | 0 | Normal window |
   | 1 | Aggressive |
   | 2 | Emergency |
   | 3 | Без `retrieved_memory` в system |
   | 4 | Tool results summary-only (связка с фазой 1) |
   | 5 | Single-turn: `system + session_summary + last user` |
   | 6 | Anchor mode: явный user goal + plan canonical / краткий summary |

2. **Preflight** перед каждым HTTP-вызовом:

   ```text
   estimate(system + memory + retrieved + messages) 
   if > 0.88 × context_limit → bump DegradeLevel без ожидания ошибки
   ```

3. **Заменить** цикл `for attempt in 0..=MAX_CONTEXT_RETRIES` на цикл по `DegradeLevel` до success или level 6.

4. **Статусы UI:** `ChatRunStatus` — optional `degradeLevel`, `retryReason` (для ChatWindow / autonomous strip).

5. **Тесты:**
   - Unit: каждый level уменьшает `estimate_chat_input_tokens`.
   - Preflight срабатывает при estimate > порога.

### Файлы

- `src-tauri/src/chat/degrade.rs` (new) — уровни + применение к messages/system
- `src-tauri/src/chat/run_service.rs` — главный цикл
- `src-tauri/src/chat/completion_recovery.rs` — shared с фазой 1
- `src/features/chat-window/ui/ChatWindow.tsx` — опционально показ degrade в status

### Критерий готовности

- Длинный чат (10+ turns) или autonomous 4+ шага не падает с context error — доходит до level 5–6 с осмысленным ответом или partial.

---

## Фаза 3 — Jinja reshape (LM Studio)

**Приоритет:** частый кейс «No user query found in messages» на tool follow-up.

### Проблема

- 3× retry с `omit_thinking` и sleep — **те же messages**.
- Follow-up: assistant + synthetic user с tool results — Jinja не видит «user query».

### Задачи

1. **`reshape_messages_for_template`** в `providers/` или `chat/message_reshape.rs`:
   - Гарантировать последний non-empty `user` с якорем цели (последний «настоящий» user до tool noise).
   - Схлопнуть лишние подряд `user` без `assistant` между (опционально merge tool block).
   - Убрать дубли scope block в system vs user (если tools_active).

2. **Интеграция в `complete_stream_with_observer`:**
   - На `TemplateError` attempt 1: reshape level 1.
   - Attempt 2: reshape + omit_thinking (уже есть).
   - Attempt 3: reshape + DegradeLevel bump (связка с фазой 2).

3. **Tool follow-up:** перед follow-up вызывать reshape с флагом `tool_followup: true`.

4. **Тесты:**
   - Unit: messages после read_file follow-up → последний user не пустой, есть anchor.
   - `provider_errors` tests расширить.

### Файлы

- `src-tauri/src/chat/message_reshape.rs` (new)
- `src-tauri/src/providers/mod.rs`
- `src-tauri/src/chat/agent_tools.rs` — вызов reshape перед follow-up

### Критерий готовности

- Harness live / synthetic audit без Jinja fail на 2-м hop после `read_file` (или успешный retry с reshape в trace).

---

## Фаза 4 — Autonomous step retry

**Приоритет:** низкий до стабилизации фаз 1–3.

### Проблема

- `run_autonomous_turn` → `run_chat` → `Err` валит шаг/весь run.
- Planning без валидного `<autonomous-plan>` — сразу fail.
- Нет retry при transport после исчерпания recovery внутри `run_chat`.

### Задачи

1. **`run_autonomous_turn_with_retry`:**
   - Обёртка над `run_chat` (уже с фазами 1–3).
   - Transport / context exhausted после max degrade: **1** повтор шага с `DegradeLevel::Anchor` (level 6).
   - Не дублировать логику recovery — только outer safety net.

2. **Planning fallback:**
   - Нет `<autonomous-plan>` после 1-го turn → retry prompt «JSON only in tag».
   - Снова нет → fallback plan `[{ "id": 1, "title": goal }]`.

3. **Конфиг:** `AutonomousRunConfig.max_step_retries` (default 1).

4. **Debug / harness:** trace phase `step_retry`, кнопка в ChatDebugPanel.

### Файлы

- `src-tauri/src/chat/autonomous/runner.rs`
- `src-tauri/src/chat/autonomous/config.rs`
- `src/shared/lib/autonomousRunApi.ts` — optional config field

### Критерий готовности

- Autonomous synthetic scenario переживает один transport blip без полного fail.
- Invalid plan → fallback single-step, run продолжается.

---

## Общая архитектура (после всех фаз)

```text
run_chat / run_autonomous_turn
  └─ completion_recovery_loop
       ├─ preflight (DegradeLevel)
       ├─ apply_degrade(messages, system, level)
       ├─ reshape_messages (if template retry)
       ├─ complete_stream_with_observer
       └─ on fail → classify → next DegradeLevel | partial | Err (только после level 6)

run_tool_followup_loop
  └─ cap tool results (фаза 1)
  └─ completion_recovery_loop per follow-up (фаза 1–2)
```

---

## Метрики и наблюдаемость

- Trace / status: `degradeLevel`, `retryReason`, `inputEstimate`, `contextLimit`.
- Harness checks (добавить по мере фаз):
  - `tool_result_cap_applied`
  - `preflight_degraded_before_send`
  - `jinja_reshape_recovered`

---

## Оценка diff (грубо)

| Фаза | Новые файлы | Основные правки | Риск |
|------|-------------|-----------------|------|
| 1 | 1 | `agent_tools`, tool cap | Низкий |
| 2 | 1–2 | `run_service` цикл | Средний |
| 3 | 1 | `providers`, `agent_tools` | Средний |
| 4 | 0 | `autonomous/runner` | Низкий |

---

## Порядок реализации (рекомендуемый)

1. **Фаза 1** — merge, прогон harness synthetic + ручной chat audit.
2. **Фаза 2** — merge, stress длинный чат / autonomous 4 steps.
3. **Фаза 3** — merge, LM Studio tool follow-up regression.
4. **Фаза 4** — merge, autonomous debug panel.

После каждой фазы: `cargo check`, harness deterministic, при наличии LM Studio — live synthetic.

---

## Вне плана (не делать в этом цикле)

- Subagent'ы / parallel explore
- Полный shell `run_command`
- Смена wire tool format на native OpenAI tools API
- Увеличение `MAX_TOOL_ITERATIONS` без cap tool results
