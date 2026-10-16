import { createElement } from '../src/create-element';
import { renderApp, type AppHandle } from '../src/reactive-engine';
import { inspectStateStore } from '../src/state-store';
import type { Fetcher, VNode, ViewState } from '../src/types';
import { useAsyncResource, type AsyncResource } from '../src/use-async-resource';
import { verifyViewState } from '../src/view-state';

interface PendingCall {
  readonly signal: AbortSignal;
  readonly resolve: (payload: unknown) => void;
  readonly reject: (error: unknown) => void;
}

/** Fetcher whose responses are settled manually, in any order. */
function controllableFetcher(options: { ignoreAbort?: boolean } = {}) {
  const calls: PendingCall[] = [];
  const fetcher: Fetcher<unknown> = (signal) =>
    new Promise((resolve, reject) => {
      calls.push({ signal, resolve, reject });
      if (!options.ignoreAbort) {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      }
    });
  const call = (i: number): PendingCall => {
    const pending = calls[i];
    if (pending === undefined) throw new Error(`no call #${i}`);
    return pending;
  };
  return { fetcher, calls, call };
}

const parseStrings = (payload: unknown): readonly string[] => {
  if (!Array.isArray(payload) || !payload.every((x) => typeof x === 'string')) throw new Error('bad payload');
  return payload;
};

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

let app: AppHandle | null;
let resource: AsyncResource<readonly string[]>;
let history: ViewState<readonly string[]>[];

function Probe(): VNode {
  resource = useAsyncResource({ parse: parseStrings, describeError: () => 'Human-readable failure' });
  history.push(resource.state);
  return createElement('output', null, resource.state.status);
}

beforeEach(() => {
  history = [];
  app = renderApp(Probe, document.createElement('section'));
});

afterEach(() => {
  app?.unmount();
  app = null;
});

const statuses = (): string[] => history.map((s) => s.status);

describe('useAsyncResource', () => {
  it('starts IDLE', () => {
    expect(resource.state).toEqual({ status: 'IDLE' });
  });

  it('IDLE → LOADING → SUCCESS with parsed data', async () => {
    const { fetcher, call } = controllableFetcher();
    resource.load(fetcher);
    expect(resource.state.status).toBe('LOADING');
    call(0).resolve(['a', 'b']);
    await flush();
    expect(resource.state).toEqual({ status: 'SUCCESS', data: ['a', 'b'] });
    expect(statuses()).toEqual(['IDLE', 'LOADING', 'SUCCESS']);
  });

  it('LOADING → ERROR with a human-readable message', async () => {
    const { fetcher, call } = controllableFetcher();
    resource.load(fetcher);
    call(0).reject(new Error('ECONNRESET stack trace'));
    await flush();
    expect(resource.state).toEqual({ status: 'ERROR', error: 'Human-readable failure' });
  });

  it('a payload that fails validation becomes ERROR, not a crash', async () => {
    const { fetcher, call } = controllableFetcher();
    resource.load(fetcher);
    call(0).resolve([1, 2, 3]);
    await flush();
    expect(resource.state.status).toBe('ERROR');
  });

  it('retry after ERROR goes back through LOADING to SUCCESS', async () => {
    const { fetcher, call } = controllableFetcher();
    resource.load(fetcher);
    call(0).reject(new Error('down'));
    await flush();
    resource.load(fetcher);
    call(1).resolve(['ok']);
    await flush();
    expect(statuses()).toEqual(['IDLE', 'LOADING', 'ERROR', 'LOADING', 'SUCCESS']);
  });

  it('a new load aborts the request in flight', () => {
    const { fetcher, call } = controllableFetcher();
    resource.load(fetcher);
    resource.load(fetcher);
    expect(call(0).signal.aborted).toBe(true);
    expect(call(1).signal.aborted).toBe(false);
  });

  it('RACE: out-of-order responses never overwrite the latest request', async () => {
    const { fetcher, call } = controllableFetcher({ ignoreAbort: true });
    resource.load(fetcher); // request 1 (slow)
    resource.load(fetcher); // request 2 (fast)
    call(1).resolve(['fresh']);
    await flush();
    call(0).resolve(['stale']);
    await flush();
    expect(resource.state).toEqual({ status: 'SUCCESS', data: ['fresh'] });
  });

  it('RACE: a stale failure does not replace fresh data, even if the fetcher ignores abort', async () => {
    const { fetcher, call } = controllableFetcher({ ignoreAbort: true });
    resource.load(fetcher);
    resource.load(fetcher);
    call(1).resolve(['fresh']);
    await flush();
    call(0).reject(new Error('late failure'));
    await flush();
    expect(resource.state).toEqual({ status: 'SUCCESS', data: ['fresh'] });
  });

  it('cancel aborts, returns to IDLE and drops the late response', async () => {
    const { fetcher, call } = controllableFetcher({ ignoreAbort: true });
    resource.load(fetcher);
    resource.cancel();
    expect(call(0).signal.aborted).toBe(true);
    expect(resource.state.status).toBe('IDLE');
    call(0).resolve(['late']);
    await flush();
    expect(resource.state.status).toBe('IDLE');
  });

  it('a response after unmount is ignored and does not leak into the next mount', async () => {
    const { fetcher, call } = controllableFetcher({ ignoreAbort: true });
    resource.load(fetcher);
    app?.unmount();
    app = null;
    call(0).resolve(['late']);
    await flush();
    expect(inspectStateStore().states).toEqual([]);

    app = renderApp(Probe, document.createElement('section'));
    expect(resource.state.status).toBe('IDLE');
  });

  it('only ever renders valid FSM states (no impossible combinations)', async () => {
    const { fetcher, call } = controllableFetcher({ ignoreAbort: true });
    resource.load(fetcher);
    resource.load(fetcher);
    call(0).reject(new Error('x'));
    call(1).resolve(['y']);
    await flush();
    resource.load(fetcher);
    resource.cancel();
    expect(history.every((state) => verifyViewState(state))).toBe(true);
  });

  it('uses a constant number of hook slots', async () => {
    const { fetcher, call } = controllableFetcher();
    expect(inspectStateStore().states).toHaveLength(3);
    resource.load(fetcher);
    call(0).resolve(['a']);
    await flush();
    expect(inspectStateStore().states).toHaveLength(3);
  });
});
