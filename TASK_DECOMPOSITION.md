# Work Breakdown Structure (WBS) — Exercise 3

Objective: remove race conditions and inconsistent UI states from async data loading with a strict
4-state machine (`IDLE`, `LOADING`, `SUCCESS`, `ERROR`), a pulsing skeleton during loading, and a
human-readable error with a **Retry Connection** button.

> RULE: Never prompt AI with more than one sub-task at a time. One task = one commit.

| # | Task | Verification | Commit |
|---|------|--------------|--------|
| 3.0 | Project rules & WBS | Review | `chore: add project rules and task decomposition` |
| 3.1 | Import the reactive engine from Exercise 2 | `npm test`, `npm run typecheck` | `chore: import reactive engine from exercise 2` |
| 3.2 | Ignore state setters called after the store was reset (unmount race) | Unit tests | `fix(state): ignore setter calls after the store is reset` |
| 3.3 | `useRef` hook (mutable box that survives renders) | Unit tests | `feat(state): add useRef hook` |
| 3.4 | Contract: `ViewState<T>`, `ViewEvent<T>`, feed types | `npm run typecheck` | `feat(types): define view state machine contract` |
| 3.5 | Pure `transition` reducer with request-id guard + invariant check | Unit tests (transition table) | `feat(state): implement view state transition reducer` |
| 3.6 | Abortable feed service: simulated latency, timeout, offline, malformed payload, human-readable errors | Unit tests (fake timers) | `feat(data): add abortable feed service with failure scenarios` |
| 3.7 | `useAsyncResource` hook: request ids, abort previous, cancel, validate payload | Unit tests (deferred promises) | `feat(state): add race-safe useAsyncResource hook` |
| 3.8 | `ErrorBoundary` for render exceptions | Unit tests | `feat(ui): add error boundary with fallback` |
| 3.9 | DataFeed component: IDLE / skeleton / SUCCESS / ERROR + Retry Connection, scenario switcher | Checkpoint tests + DevTools | `feat(ui): implement multi-state data component with skeleton feedback` |
| 3.10 | README with state diagram and DevTools checklist | Manual review | `docs: add readme with state machine and audit checklist` |

## Checklist

- [x] Task 3.0: Write `project-rules.md` and `TASK_DECOMPOSITION.md`
- [x] Task 3.1: Import reactive engine (VNode, useState, delegation, renderApp) from Exercise 2
- [x] Task 3.2: Guard setters against a reset store
- [x] Task 3.3: Implement `useRef`
- [x] Task 3.4: Define `ViewState` / `ViewEvent` contracts
- [ ] Task 3.5: Implement `transition` reducer (stale responses dropped)
- [ ] Task 3.6: Implement abortable feed service with failure scenarios
- [ ] Task 3.7: Implement `useAsyncResource` (abort + request ids)
- [ ] Task 3.8: Implement `ErrorBoundary`
- [ ] Task 3.9: Assemble multi-state DataFeed with skeleton feedback and Retry Connection
- [ ] Task 3.10: Document state machine and DevTools audit in README
