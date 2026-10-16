import type { ViewEvent, ViewState } from '../src/types';
import { IDLE, transition, verifyViewState } from '../src/view-state';

type S = ViewState<string[]>;
type E = ViewEvent<string[]>;

const loading = (requestId: number): S => ({ status: 'LOADING', requestId });
const success: S = { status: 'SUCCESS', data: ['a'] };
const failure: S = { status: 'ERROR', error: 'Offline' };

const fetch = (requestId: number): E => ({ type: 'FETCH', requestId });
const resolve = (requestId: number, data = ['x']): E => ({ type: 'RESOLVE', requestId, data });
const reject = (requestId: number, error = 'Boom'): E => ({ type: 'REJECT', requestId, error });
const reset: E = { type: 'RESET' };

describe('transition: valid paths', () => {
  it.each<[string, S, E, S]>([
    ['IDLE + FETCH → LOADING', IDLE, fetch(1), loading(1)],
    ['LOADING + RESOLVE(current) → SUCCESS', loading(1), resolve(1, ['ok']), { status: 'SUCCESS', data: ['ok'] }],
    ['LOADING + REJECT(current) → ERROR', loading(1), reject(1, 'Offline'), { status: 'ERROR', error: 'Offline' }],
    ['LOADING + FETCH(newer) → LOADING(newer)', loading(1), fetch(2), loading(2)],
    ['SUCCESS + FETCH → LOADING (reload)', success, fetch(3), loading(3)],
    ['ERROR + FETCH → LOADING (Retry Connection)', failure, fetch(4), loading(4)],
    ['LOADING + RESET → IDLE (cancel)', loading(1), reset, IDLE],
    ['SUCCESS + RESET → IDLE', success, reset, IDLE],
    ['ERROR + RESET → IDLE', failure, reset, IDLE],
  ])('%s', (_name, state, event, expected) => {
    const next = transition(state, event);
    expect(next).toEqual(expected);
    expect(Object.isFrozen(next)).toBe(true);
  });
});

describe('transition: ignored events return the same object', () => {
  it.each<[string, S, E]>([
    ['stale RESOLVE after a newer FETCH', loading(2), resolve(1)],
    ['stale REJECT after a newer FETCH', loading(2), reject(1)],
    ['RESOLVE while IDLE (request was cancelled)', IDLE, resolve(1)],
    ['REJECT while IDLE (request was cancelled)', IDLE, reject(1)],
    ['late RESOLVE after SUCCESS', success, resolve(1)],
    ['late REJECT after SUCCESS', success, reject(1)],
    ['late RESOLVE after ERROR', failure, resolve(1)],
    ['duplicate FETCH with the same id', loading(3), fetch(3)],
    ['older FETCH while LOADING', loading(3), fetch(2)],
    ['RESET while IDLE', IDLE, reset],
  ])('%s', (_name, state, event) => {
    expect(transition(state, event)).toBe(state);
  });

  it('never mixes data and error (impossible states)', () => {
    let state: S = IDLE;
    const events: E[] = [fetch(1), fetch(2), resolve(1), reject(2, 'Timeout'), resolve(2), fetch(3), resolve(3, ['y'])];
    for (const event of events) {
      state = transition(state, event);
      expect(verifyViewState(state)).toBe(true);
    }
    expect(state).toEqual({ status: 'SUCCESS', data: ['y'] });
  });

  it('rejects unknown event types at runtime', () => {
    expect(() => transition(IDLE, { type: 'BOGUS' } as unknown as E)).toThrow(/Unhandled case/);
  });
});

describe('verifyViewState', () => {
  it.each([IDLE, loading(1), success, failure, { status: 'SUCCESS', data: undefined }])('accepts %o', (state) => {
    expect(verifyViewState(state)).toBe(true);
  });

  it.each([
    null,
    'IDLE',
    { status: 'PENDING' },
    { status: 'LOADING' },
    { status: 'LOADING', requestId: 1.5 },
    { status: 'ERROR', error: '' },
    { status: 'SUCCESS', data: [], error: 'x' },
    { status: 'IDLE', isLoading: true },
  ])('rejects %o', (state) => {
    expect(verifyViewState(state)).toBe(false);
  });
});
