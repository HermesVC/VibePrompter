# Frontend Clean Architecture — AI-Enforced Rules

> **Status:** Mandatory
>
> This document defines non-negotiable architectural rules for all React code generated or modified by AI. Any deviation is a defect. If uncertain, STOP and ASK.

---

## 1. Purpose

This project follows **Frontend Clean Architecture** optimized for:

* AI-generated code at scale
* Human readability and review
* Predictable workflows
* Easy debugging

The architecture mirrors backend Clean Architecture (DDD-lite + CQRS) adapted for frontend.

---

## 2. Absolute Rules (Do Not Break)

AI MUST NOT:

* Put business logic in React components
* Call APIs directly from UI or hooks
* Share business logic across features
* Import across features except via `index.ts`
* Introduce new global state without approval
* Create generic `utils/`, `helpers/`, or `services/` with business meaning
* Modify architectural boundaries without explicit instruction

If any rule cannot be satisfied → **STOP AND ASK**.

---

## 3. Mandatory Project Structure

```txt
src/
├── app/                     # App composition only (no business logic)
│   ├── App.tsx
│   ├── router.tsx
│   └── providers.tsx
│
├── shared/                  # Business-agnostic code ONLY
│   ├── ui/                  # Pure presentational components
│   ├── lib/                 # Generic helpers (date, math, formatting)
│   ├── config/
│   └── types/
│
├── kernel/                  # Shared Kernel (RARE, HIGH-STABILITY)
│   ├── domain/              # Shared invariants ONLY
│   ├── application/         # Shared use cases / global state
│   ├── infrastructure/      # Shared adapters (auth, session)
│   └── index.ts             # Explicit public API
│
├── features/                # All business logic lives here
│   └── <feature-name>/
│       ├── ui/              # Dumb UI components
│       ├── application/     # Use cases (CQRS)
│       ├── domain/          # Business rules & entities
│       ├── infrastructure/  # API / adapters
│       └── index.ts         # Public feature API
│
└── main.tsx
```

---

## 4. Feature Rules

### 4.1 One Feature = One Business Capability

Each feature:

* Represents a single business concept
* Is isolated from other features
* Owns its own UI, logic, domain, and API

Examples:

* `user-profile`
* `order-checkout`
* `invoice-list`

---

### 4.2 Feature Public API (Required)

Each feature MUST expose a single public surface via `index.ts`.

```ts
export { UserProfileView } from './ui/UserProfileView';
export { getUserQuery } from './application/getUser.query';
export { updateUserCommand } from './application/updateUser.command';
```

Other features MUST NOT import internal files directly.

---

## 5. Layer Responsibilities (Strict)

### 5.1 UI Layer (`ui/`)

**Responsibility:** Rendering only.

Allowed:

* JSX
* Props
* Styling
* Event forwarding

Forbidden:

* Business rules
* API calls
* Data transformations
* Complex conditionals

---

### 5.2 Application Layer (`application/`)

**Responsibility:** Orchestration and use cases (CQRS).

Rules:

* Queries = read-only
* Commands = write-only
* No JSX
* No UI concerns

Naming:

* `*.query.ts`
* `*.command.ts`

---

### 5.3 Domain Layer (`domain/`)

**Responsibility:** Business rules and invariants.

Allowed:

* Entities
* Value objects
* Pure functions
* Domain validation

Forbidden:

* React
* API calls
* Browser APIs

---

### 5.4 Infrastructure Layer (`infrastructure/`)

**Responsibility:** External systems.

Allowed:

* HTTP calls
* DTO mapping
* API clients

Forbidden:

* Business decisions
* UI logic

---

## 6. Mandatory Data Flow

```txt
UI
 ↓
Application (Command / Query)
 ↓
Domain (Rules)
 ↓
Infrastructure (API)
```

Reverse flow is NOT allowed.

---

## 7. CQRS Rules

### Queries

* Read-only
* Cacheable
* No side effects
* Prefer TanStack Query

### Commands

* Explicit intent
* No returned domain data
* Responsible for cache invalidation

---

## 7A. State Ownership Rules

All state MUST belong to exactly one category:

| State Type             | Tool                            | Location                 |
| ---------------------- | ------------------------------- | ------------------------ |
| Server State           | TanStack Query                  | `application/*.query.ts` |
| Feature UI State       | React `useState` / `useReducer` | Feature `ui/`            |
| Global Client State    | Zustand / Redux Toolkit         | `kernel/application/`    |
| Derived Business State | Pure functions                  | `domain/`                |

If state ownership is unclear → **STOP AND ASK**.

---

## 8. Shared Code Rules

### `shared/ui`

* Buttons, inputs, modals
* No business meaning
* No feature imports

### `shared/lib`

* Generic helpers only
* Must apply to unrelated features

If logic has business meaning → it belongs in a feature or kernel.

---

## 8A. Shared Kernel Rules

The Kernel represents **shared business invariants** and is used **rarely and deliberately**.

Kernel MAY contain:

* Authentication & authorization rules
* Identity/session state
* Cross-feature invariants

Kernel MUST NOT:

* Depend on features
* Contain UI components
* Grow opportunistically

Features MAY import from `kernel/index.ts` only.

---

## 9. Naming Conventions

* Feature folders: `kebab-case`
* Components: `PascalCase`
* Files:

  * `*.query.ts`
  * `*.command.ts`
  * `*.api.ts`

---

## 10. AI Clarification Rules

AI MUST ASK when:

* Business rules are unclear
* A change crosses feature boundaries
* New shared or kernel logic is proposed
* State ownership is ambiguous

AI MUST NOT GUESS.

---

## 11. Change Policy

Before making changes, AI must:

1. Identify affected feature(s)
2. Modify only relevant layers
3. Preserve architectural boundaries
4. Update `index.ts` if the public API changes

---

## 12. AI Definition of Done

Before responding, AI must verify:

* [ ] No cross-feature imports
* [ ] UI contains no business logic
* [ ] Business rules are in `domain/`
* [ ] API calls exist only in `infrastructure/`
* [ ] Commands and queries are used correctly
* [ ] Feature public API is updated
* [ ] No architectural drift introduced

---

## 13. Final Rule

> If any request conflicts with this document, **THIS DOCUMENT WINS**.
