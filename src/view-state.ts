import { assertNever, isViewStatus, type ViewEvent, type ViewState } from './types';

export const IDLE: { readonly status: 'IDLE' } = Object.freeze({ status: 'IDLE' });

const isCurrentRequest = <T>(state: ViewState<T>, requestId: number): boolean =>
  state.status === 'LOADING' && state.requestId === requestId;

/**
 * Pure state machine for async data.
 *
 *   IDLE ──FETCH──► LOADING ──RESOLVE(id)──► SUCCESS ──FETCH──► LOADING
 *                     │  ▲                                        ...
 *                     │  └──FETCH(newer id) (restart, older responses become stale)
 *                     └──REJECT(id)──► ERROR ──FETCH (Retry Connection)──► LOADING
 *   any ──RESET──► IDLE
 *
 * Events that do not apply return the *same* state object, so useState skips the re-render.
 */
export function transition<T>(state: ViewState<T>, event: ViewEvent<T>): ViewState<T> {
  switch (event.type) {
    case 'FETCH':
      if (state.status === 'LOADING' && event.requestId <= state.requestId) return state;
      return Object.freeze({ status: 'LOADING', requestId: event.requestId });

    case 'RESOLVE':
      return isCurrentRequest(state, event.requestId) ? Object.freeze({ status: 'SUCCESS', data: event.data }) : state;

    case 'REJECT':
      return isCurrentRequest(state, event.requestId) ? Object.freeze({ status: 'ERROR', error: event.error }) : state;

    case 'RESET':
      return state.status === 'IDLE' ? state : IDLE;

    default:
      return assertNever(event);
  }
}

const EXPECTED_KEYS: Readonly<Record<ViewState<unknown>['status'], readonly string[]>> = {
  IDLE: ['status'],
  LOADING: ['requestId', 'status'],
  SUCCESS: ['data', 'status'],
  ERROR: ['error', 'status'],
};

/** Runtime invariant: exactly one of the four shapes, no leftover fields (e.g. data + error). */
export function verifyViewState(value: unknown): value is ViewState<unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const { status } = record;
  if (!isViewStatus(status)) return false;

  const keys = Object.keys(record).sort();
  const expected = EXPECTED_KEYS[status];
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) return false;

  if (status === 'LOADING') return Number.isInteger(record['requestId']);
  if (status === 'ERROR') return typeof record['error'] === 'string' && record['error'] !== '';
  return true;
}
