# Lab 02 · Exercise 3: Resilient State Machine & Skeleton Loader

Async data loading without race conditions or inconsistent UI. A strict 4-state machine
(`IDLE`, `LOADING`, `SUCCESS`, `ERROR`) drives an engineering feed with a pulsing skeleton loader,
human-readable errors and a **Retry Connection** button. Built from scratch on the Mini-React engine of
Exercises 1–2 (VNode factory, `renderToDOM`, `useState`, root event delegation).

- Rules: [project-rules.md](project-rules.md)
- Work breakdown: [TASK_DECOMPOSITION.md](TASK_DECOMPOSITION.md)

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + checkpoint tests (Vitest, jsdom, fake timers)
npm run typecheck  # tsc --noEmit (strict)
npm run build      # typecheck + production bundle
```

Use the **Network simulation** picker to switch the fake backend between *Healthy* (1.2 s),
*Slow* (8 s, times out at 4 s), *Offline* and *Malformed payload*.

## The state machine

```ts
type ViewState<T> =
  | { status: 'IDLE' }
  | { status: 'LOADING'; requestId: number }
  | { status: 'SUCCESS'; data: T }
  | { status: 'ERROR'; error: string };
```

```
            FETCH(id)                 RESOLVE(id) ✓ current
   IDLE ─────────────► LOADING(id) ───────────────────────► SUCCESS
    ▲                   │  │  ▲                               │
    │       RESET       │  │  └── FETCH(newer id): restart    │ FETCH (Reload)
    └───────────────────┘  │                                  ▼
    ▲   (Cancel)           │  REJECT(id) ✓ current        LOADING ...
    │                      └──────────────────────────► ERROR
    └──────────────── RESET ──────────────────────────── │  │ FETCH (Retry Connection)
                                                            └──► LOADING ...
```

- `transition(state, event)` in `src/view-state.ts` is pure. Events that don't apply return the **same object**, so
  `useState` skips the render (`Object.is`).
- Booleans like `isLoading` + `error` + `data` are banned: the union type makes "loading and failed at the same
  time" impossible to represent. `verifyViewState` checks the same invariant at runtime after every transition.
- Rendering uses an exhaustive `switch (state.status)` with `assertNever`, so adding a fifth state is a compile error
  until every view handles it.

## How race conditions are eliminated

| Hazard | Defence |
|--------|---------|
| Slow response arrives after a newer one | Each `load` gets a new `requestId`; the reducer applies `RESOLVE`/`REJECT` only for the id currently `LOADING` |
| Request keeps running after the user moved on | `load` and `cancel` abort the in-flight `AbortController`; the service clears its timers |
| Fetcher ignores the abort signal | The `requestId` guard drops the response anyway (tested with a non-cooperative fetcher) |
| Response arrives after unmount | Setters capture the store generation and become no-ops after `resetStateStore` (`fix(state)` commit) |
| Malformed payload crashes the view | Payload is `unknown` until `parseFeed` validates it; failure becomes `ERROR`, never a crash |
| Unexpected render exception | `ErrorBoundary` shows a fallback alert with Retry Connection; the rest of the app keeps working |

## Feedback UI

- **IDLE**: an explanation and a *Load feed* button.
- **LOADING**: three pulsing skeleton cards using the same box model as real cards (no layout jump), marked
  `aria-hidden="true"`. A `role="status"` live region announces "Loading posts…" and the panel gets `aria-busy="true"`.
  The pulse is turned off under `prefers-reduced-motion`. The toolbar offers *Cancel*.
- **SUCCESS**: `<ul>` of `<article>` cards with `<h3>`, summary and `<footer>` with `<time datetime>`.
- **ERROR**: `role="alert"` region with a human-readable message (raw errors such as `net::ERR_…` are never shown)
  and a **Retry Connection** button.

The toolbar button and Retry Connection share one id, so keyboard focus moves with the state
(Retry → Cancel → Reload).

## Structure

| File | Responsibility |
|------|----------------|
| `src/types.ts` | Contracts: VNode, hooks, `ViewState`, `ViewEvent`, `Fetcher`, `FeedItem`, `assertNever` |
| `src/view-state.ts` | Pure `transition` reducer + `verifyViewState` invariant |
| `src/feed-service.ts` | Simulated abortable backend, `parseFeed` validation, `describeError` human messages |
| `src/use-async-resource.ts` | `useAsyncResource`: request ids, abort previous, cancel, validate, dispatch |
| `src/use-ref.ts`, `src/use-state.ts`, `src/state-store.ts` | Hook engine (with stale-setter guard) |
| `src/error-boundary.ts` | `ErrorBoundary` for render-time exceptions |
| `src/data-feed.ts` | `DataFeedApp`: scenario picker, toolbar, one view per state |
| `src/create-element.ts`, `src/render-to-dom.ts`, `src/events.ts`, `src/reactive-engine.ts`, `src/audit.ts` | Mini-React engine from Exercises 1–2 |

## DevTools audit checklist

1. `npm run dev`, open Chrome DevTools.
2. **Console**: every state change logs `[commit #n] <STATUS> · audit PASS: X VNodes ↔ X DOM nodes` and the
   current `ViewState` object. No assertion failures.
3. Click *Load feed*. In **Elements**, `section.panel[data-status="LOADING"]` has `aria-busy="true"` and
   `ul.feed--skeleton[aria-hidden="true"]`. In **Computed**, `.skeleton-line` has `animation-name: skeleton-pulse`.
   Tick *Emulate CSS prefers-reduced-motion* in **Rendering**: the pulse stops.
4. **Network simulation → Offline**, then *Load feed*: the alert shows "We couldn't reach the server…" and
   **Retry Connection**. Switch to *Healthy* and retry: skeleton → posts.
5. **Race check**: choose *Slow*, *Load feed*, *Cancel*, choose *Healthy*, *Load feed*. Posts appear and stay;
   no late timeout error replaces them.
6. Exactly one of these views exists at any time: idle text, skeleton, post list or alert. There is no `<div>` or `<span>`.
7. Console: `[...document.querySelectorAll('#app *')].filter((el) => Object.keys(getEventListeners(el)).length)`
   returns `[]`. All listeners sit on `body#app`.

## Commit history

Each task in `TASK_DECOMPOSITION.md` is one Conventional Commit. The mandatory milestone is
`feat(ui): implement multi-state data component with skeleton feedback`.
