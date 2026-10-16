# Project Rules — Lab 02 / Exercise 3: Resilient State Machine & Skeleton Loader

These rules are binding for every human or AI contribution to this repository.
A change that violates any rule below must not be committed. Rules from Exercises 1–2 (VNode contract,
XSS prevention, zero div-soup, Rules of Hooks, root event delegation) still apply and are repeated here.

## 1. Workflow (Anti-Monolithic Vibe Coding)

1. **Functional slicing**: work only on tasks listed in `TASK_DECOMPOSITION.md`.
2. **Contract first**: types/interfaces are written *before* the code that uses them.
3. **Atomic generation**: one sub-task per prompt and one sub-task per commit. Never prompt AI with more than one sub-task at a time.
4. **Independent verification**: every task is verified (unit test, `npm run typecheck`, DevTools, `git diff`) before it is committed.
5. Tick the matching checkbox in `TASK_DECOMPOSITION.md` in the same commit that completes the task.

## 2. Git

- Conventional Commits: `type(scope): imperative summary`. Types: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`.
- Mandatory milestone commit message (exact text):
  - `feat(ui): implement multi-state data component with skeleton feedback`
- `npm test` and `npm run typecheck` must pass before every commit.

## 3. Language & Tooling

- TypeScript `strict` mode; no `any` (use `unknown` + typeguards).
- ES modules only, bundled with **Vite**. No Babel standalone, no CDN script tags.
- **BANNED:** `var`, implicit globals, `keypress`, `e.keyCode`.

## 4. Finite State Machine (async data)

- A data component's state is **only** `ViewState<T>`:
  `{ status: 'IDLE' } | { status: 'LOADING' } | { status: 'SUCCESS'; data } | { status: 'ERROR'; error }`.
- **BANNED:** parallel booleans such as `isLoading` + `hasError` + `data`. They allow impossible combinations
  (loading *and* error at the same time).
- State changes only through the pure `transition(state, event)` function. Events that are not valid
  in the current state are ignored (the same state object is returned, so nothing re-renders).
- Rendering switches over `status` exhaustively (`assertNever`), so a new state cannot be forgotten.

## 5. Race Conditions

- Every request gets a monotonically increasing `requestId`. `RESOLVE` / `REJECT` are applied only when their
  `requestId` matches the request the machine is currently `LOADING`. Stale responses are dropped.
- Starting a new request aborts the previous one (`AbortController`). Cancelling returns to `IDLE`.
- Network data is `unknown` until a typeguard validates it. A malformed payload becomes an `ERROR`, never a crash.
- Setters called after the app is unmounted are ignored.

## 6. Feedback UI

- `LOADING` renders a pulsing CSS skeleton that mirrors the final layout, marked `aria-hidden`, plus a
  visually-hidden `role="status"` message. The animation is disabled under `prefers-reduced-motion`.
- `ERROR` renders a human-readable message (never a stack trace or raw `Error.message`) in a `role="alert"`
  region with a **Retry Connection** button.
- An `ErrorBoundary` wraps the data view so an unexpected render exception shows the fallback instead of breaking the app.

## 7. Events, Security, Semantics

- Events go through the root delegation hub only. **BANNED:** `addEventListener` on rendered children and `onclick="..."`.
- **BANNED:** `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`. Remote text is rendered as text nodes.
- **BANNED:** `<div>` / `<span>` as structural containers. Use `<main>`, `<header>`, `<section>`, `<article>`,
  `<fieldset>`, `<ul>`/`<li>`, `<button>`, `<footer>`.

## 8. Verification

- After every render the DOM must mirror the VNode tree 1:1 (`auditMount`).
- Every state transition, including invalid and stale events, is covered by unit tests.
