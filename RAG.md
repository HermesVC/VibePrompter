# Семантическая память чата (RAG) в VibePrompter

Документ описывает, как устроена долговременная память в chat window, как её включить с локальными моделями (Qwen, LM Studio, Ollama, nomic-embed-text) и чем наш подход **не является**.

---

## Что это и зачем

При длинном диалоге контекстное окно модели (у нас обычно **16K**) переполняется. Старые реплики нельзя бесконечно держать в prompt.

VibePrompter использует **трёхуровневую память**:

| Уровень | Что хранит | Когда включается |
|--------|------------|------------------|
| **1. Active window** | Последние реплики целиком | Всегда — в prompt идут только «активные» сообщения |
| **2. Rolling summary** | LLM-сжатие вытесненных turn'ов | Когда sliding window выкидывает старые сообщения |
| **3. Vector memory (RAG)** | Embedding-чанки вытесненного текста | Те же evicted-сообщения индексируются в SQLite |

Полная история **всегда остаётся в UI**. В модель уходит сжатая выборка + релевантные excerpt'ы из прошлого.

Это **session episodic memory** (память одного чата), а не RAG по PDF/документам.

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│  UI: полная история + sessionId + sessionSummary (localStorage) │
└───────────────────────────┬─────────────────────────────────┘
                            │ chat_complete_stream (все messages)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend (Rust)                                              │
│  1. plan_sliding_window → active + evicted                   │
│  2. compress evicted → rolling summary (LLM)               │
│  3. index evicted → embed → SQLite (chat_memory_chunks)     │
│  4. retrieve top-k по последнему user message                │
│  5. inject summary + retrieved в system prompt               │
│  6. stream только active messages                            │
└───────────────────────────┬─────────────────────────────────┘
                            │
          ┌─────────────────┴─────────────────┐
          ▼                                   ▼
   POST /v1/chat/completions          POST /v1/embeddings
   (Qwen и т.д.)                      (nomic-embed-text)
```

### Бюджеты (при context 16K)

| Слой | Доля окна | ~токены @ 16K |
|------|-----------|---------------|
| Rolling summary | до 30% | ~4 900 |
| Vector retrieval | до 15% | ~2 450 |
| Active turns | остаток после reserve + system + summary | ~6–8K+ |

Sliding window **учитывает summary** при выборе active turns. Retrieval добавляется после plan — при переполнении срабатывает context recovery (повтор с более агрессивным сжатием).

### Ключевые файлы

| Область | Путь |
|---------|------|
| Pipeline | `src-tauri/src/commands/chat.rs` |
| Sliding window + LLM compress | `src-tauri/src/chat/sliding_window.rs` |
| Summary в system | `src-tauri/src/chat/session_summary.rs` |
| Vector index/retrieve | `src-tauri/src/chat/vector_memory.rs` |
| Embeddings API | `src-tauri/src/providers/embeddings.rs` |
| SQLite | `src-tauri/src/storage/migrations/0008_chat_vector_memory.sql` |
| Frontend sessionId | `src/shared/lib/chatSessionStorage.ts`, `ChatWindow.tsx` |

### Поведение без embed

Если `/v1/embeddings` недоступен — чат **работает как раньше** (только summary). В логах: `vector memory index skipped` / `retrieve skipped`.

---

## Рекомендуемый локальный стек

| Роль | Модель | Где |
|------|--------|-----|
| Chat | **Qwen 2.5 / 3.5 ~9B** (Q4) | LM Studio или Ollama |
| Context | **16K** | Настройка connection / probe |
| Embeddings | **nomic-embed-text** | Ollama (рекомендуется) или LM Studio |

На **8 GB VRAM**: Qwen на GPU, nomic на CPU (Ollama) — типичная схема.

---

## LM Studio: что важно знать

### Одна LLM в UI

LM Studio в интерфейсе обычно держит **одну активную chat-модель**. Отдельно «запустить вторую модель для embed» в UI нельзя.

VibePrompter для памяти вызывает **`POST {base_url}/embeddings`**. Если embed model не задан явно, код сначала пробует найти embedding-модель через `GET {base_url}/models`, затем fallback-и для LM Studio/Ollama.

**Практика:** LM Studio — только для Qwen → vector layer **не заводится** без отдельного embed-сервера. Нужен **Ollama для nomic** или доработка «Embedding connection» в VibePrompter (пока не реализовано).

### Плагин `rag-v1` в Integrations

В LM Studio есть встроенный **rag-v1** — RAG **прикреплённых файлов** внутри чата LM Studio.

| | LM Studio rag-v1 | VibePrompter vector memory |
|--|------------------|----------------------------|
| Где работает | Только UI LM Studio | Chat window VibePrompter |
| Индексирует | PDF/файлы | Вытесненные реплики диалога |
| API для VibePrompter | **Нет** | `/v1/embeddings` + SQLite |

**Включение rag-v1 не включает семантическую память в VibePrompter.**

---

## Ollama + nomic-embed-text (рекомендуемая настройка)

### 1. Скачать модели

```powershell
ollama pull nomic-embed-text
ollama pull qwen2.5:7b
```

(Или свой Qwen — главное, чтобы имя совпадало с connection.)

### 2. Проверить embed

`nomic-embed-text` — **не чат-модель**. Команда `ollama run nomic-embed-text` без текста выдаст:

> embedding models require input text

Это нормально. Для проверки используй API:

```powershell
curl http://127.0.0.1:11434/v1/embeddings `
  -H "Content-Type: application/json" `
  -d '{"model":"nomic-embed-text","input":"hello"}'
```

Ожидается JSON с `"data":[{"embedding":[...]}]`.

Нативный API Ollama:

```powershell
curl http://127.0.0.1:11434/api/embed `
  -d '{"model":"nomic-embed-text","input":"hello"}'
```

CLI-тест (один embed):

```powershell
ollama run nomic-embed-text "hello world"
```

### 3. Ollama «две модели»

Ollama **подгружает модель по запросу**: Qwen для chat, nomic для embed. Вручную две модели в UI держать не нужно. На 8 GB возможна пауза при переключении chat ↔ embed.

### 4. Connection в VibePrompter

**Settings → Providers:**

| Поле | Значение |
|------|----------|
| Base URL | `http://127.0.0.1:11434/v1` |
| Default model | `qwen2.5:7b` (твой chat-модель) |

Для embeddings код вызывает `resolve_embed_model()`:

- если в default model есть `embed`, `nomic` или `bge` — использует его;
- иначе пробует embedding-модели из `GET /models`;
- затем fallback-и: `text-embedding-nomic-embed-text-v1.5`, `nomic-embed-text`, `nomic-embed-text:latest`.

> **Имя модели:** LM Studio часто показывает nomic как `text-embedding-nomic-embed-text-v1.5`, Ollama — как `nomic-embed-text` / `nomic-embed-text:latest`. Код пробует оба семейства имён, но если embed всё равно падает с `model not found`, задай в default model connection строку из `ollama list` / `GET /v1/models`, либо дождись настройки embed model в Settings (TODO).

---

## Схемы развёртывания

### A. Всё на Ollama (проще всего)

- Chat + embed на `:11434`
- Один connection в VibePrompter
- Vector memory работает

### B. LM Studio (Qwen) + summary only

- Connection на `http://127.0.0.1:1234/v1`
- Embeddings недоступны → **только rolling summary**
- Для многих сессий на 16K этого часто достаточно

### C. LM Studio (chat) + Ollama (embed) — целевая, нужна доработка

- Qwen в LM Studio `:1234`
- nomic в Ollama `:11434`
- Сейчas **один base_url** на connection — **не поддерживается** без поля «Embedding connection»

---

## Как проверить, что память работает

1. Пересобрать: `npm run tauri dev`
2. Длинный чат (чтобы сработал eviction)
3. Спросить деталь из начала диалога
4. В UI:
   - notice «подтянуто N фрагм. из семантической памяти сессии»;
   - блок **«Семантическая память»**;
   - **«Память диалога»** (rolling summary)

**New chat** → новый `sessionId`, vector store старой сессии очищается (`chat_clear_session_memory`).

---

## Когда embed вызывается

Не на каждый символ:

- **1×** на ответ — embed последнего user message (поиск);
- **батчами** — при eviction (индексация новых чанков; уже проиндексированные пропускаются по hash в БД).

---

## Troubleshooting

| Симптом | Решение |
|---------|---------|
| `model not found` (embed) | Имя модели = из `ollama list` / `GET /v1/models`; для Ollama: `nomic-embed-text` |
| `ollama run nomic-embed-text` — error про input | Нормально; используй API или `ollama run nomic-embed-text "text"` |
| Embeddings 404 | Сервер не запущен; для Ollama: `ollama serve` или перезапуск из трея |
| OOM 8 GB | Qwen GPU + nomic CPU в Ollama |
| Память пустая, чат OK | Embed не настроен — только summary |
| Медленно после длинного чата | Нормально: embed при eviction + retrieve на turn |

---

## Ограничения MVP

- Память **только в рамках sessionId** (не cross-session).
- Retrieval в **system prompt** (не prefix к last user) — для 9B не идеально, но рабочий компромисс.
- Query = **только последнее user-сообщение** — «продолжай», «да» ищут плохо.
- Нет MMR / recency / reranker — возможен шум в top-k.
- Brute-force cosine по SQLite — OK до ~500–1000 чанков на сессию.
- Отдельный embed connection (LM Studio + Ollama) — **в планах**.

---

## Связанные команды и API

| Tauri command | Назначение |
|---------------|------------|
| `chat_complete_stream` | Параметры: `sessionId`, `sessionSummary`, `messages`, … |
| `chat_clear_session_memory` | Очистка vector store по `sessionId` |

| HTTP (OpenAI-compat) | Назначение |
|----------------------|------------|
| `POST /v1/chat/completions` | Ответ модели |
| `POST /v1/embeddings` | Векторизация для index/retrieve |

Default/fallback embed models в коде: `text-embedding-nomic-embed-text-v1.5`, `nomic-embed-text`, `nomic-embed-text:latest` (`src-tauri/src/providers/embeddings.rs`).

---

## Compact semantic memory policy

Vector retrieval is deliberately small and typed. The backend should not inject
raw top-k chat excerpts into the system prompt:

- low-signal turns such as greetings, "ok", "yes", and assistant hello text are
  skipped before indexing;
- retrieved snippets are classified as `decision`, `bug`, `repo`, `code`,
  `preference`, or `note`;
- important classes get a small ranking boost, but still need semantic
  similarity to the current query;
- each snippet is whitespace-compacted and trimmed;
- the whole semantic block is capped to a small budget, with an absolute max,
  so a huge model context does not accidentally create a huge memory block.

The goal is for semantic memory to recall durable facts, decisions, bugs,
repo paths, code context, and user preferences. It should not replay the chat
transcript.

### Explicit memory markers

Use an explicit marker at the start of a chat message when a fact must be kept
in semantic memory for the current chat session:

| Marker | Stored as | Use for |
| --- | --- | --- |
| `IMPORTANT:`, `REMEMBER:`, `MEMORY:` | `important` | high-priority facts |
| `BUG:`, `ISSUE:`, `ERROR:` | `bug` | defects, regressions, failures |
| `DECISION:`, `DECIDED:` | `decision` | architectural or workflow decisions |
| `FACT:`, `REPO:`, `PROJECT:` | `repo` | repo paths, commands, environment facts |
| `PREF:`, `PREFERENCE:`, `USERPREF:` | `preference` | user preferences and expected behavior |
| `CODE:`, `API:`, `IMPL:` | `code` | code/API/implementation notes |

Russian aliases are supported: `ВАЖНО:`, `ЗАПОМНИ:`, `ПАМЯТЬ:`, `БАГ:`,
`ОШИБКА:`, `РЕШЕНИЕ:`, `РЕШИЛИ:`, `ФАКТ:`, `РЕПО:`, `ПРОЕКТ:`,
`ПРЕДПОЧТЕНИЕ:`, `КОД:`, `АПИ:`.

These markers force indexing and give the snippet a retrieval priority boost,
but the memory is still session-scoped unless/until project/global memory is
implemented.

---

## Repo preflight script

Для проверки RAG/embeddings и сборки используем единый скрипт:

```powershell
npm run preflight:rag
```

Он делает:

1. `GET {base_url}/models`
2. подбор embed-модели (`text-embedding-nomic-embed-text-v1.5`, `nomic-embed-text`, `nomic-embed-text:latest` + autodiscovery)
3. реальный `POST {base_url}/embeddings`
4. `npm run build`
5. `cargo check --lib`

По умолчанию проверяются:

- `http://127.0.0.1:1234/v1` (LM Studio)
- `http://127.0.0.1:11434/v1` (Ollama)

Если сервисы подняты контейнерами, скрипт можно запускать идемпотентно: уже запущенные контейнеры не ломаются, а `docker compose up -d` просто убеждается, что они есть.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/preflight-rag-build.ps1 `
  -StartContainers `
  -DockerComposeFile docker-compose.yml
```

---

## Краткий вердикт

- **16K + Qwen + hybrid memory** — разумная схема для локального длинного чата.
- **Vector layer** окупается на длинных сессиях (код, итерации); на коротких хватает active window + summary.
- **Для embed с LM Studio-only** — без Ollama или отдельного embed URL не обойтись.
- **LM Studio rag-v1** — про файлы в LM Studio, не про VibePrompter.
