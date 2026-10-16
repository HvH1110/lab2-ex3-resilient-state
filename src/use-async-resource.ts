import type { Fetcher, ViewEvent, ViewState } from './types';
import { useRef } from './use-ref';
import { useState } from './use-state';
import { IDLE, transition, verifyViewState } from './view-state';

export interface AsyncResourceOptions<T> {
  /** Validates the raw payload; throwing turns the response into an ERROR state. */
  readonly parse: (payload: unknown) => T;
  /** Maps any failure to a human-readable message. */
  readonly describeError: (error: unknown) => string;
}

export interface AsyncResource<T> {
  readonly state: ViewState<T>;
  /** Starts a request, aborting the one in flight. Also used for Retry Connection. */
  readonly load: (fetcher: Fetcher<unknown>) => void;
  /** Aborts the request in flight and returns to IDLE. */
  readonly cancel: () => void;
}

export function useAsyncResource<T>({ parse, describeError }: AsyncResourceOptions<T>): AsyncResource<T> {
  const [state, setState] = useState<ViewState<T>>(IDLE);
  const controllerRef = useRef<AbortController | null>(null);
  const lastRequestId = useRef(0);

  const dispatch = (event: ViewEvent<T>): void =>
    setState((previous) => {
      const next = transition(previous, event);
      if (!verifyViewState(next)) throw new Error(`ViewState invariant violated after ${event.type}`);
      return next;
    });

  const load = (fetcher: Fetcher<unknown>): void => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++lastRequestId.current;
    dispatch({ type: 'FETCH', requestId });

    // Guard 1: aborted requests are ignored here. Guard 2: the reducer drops any requestId
    // that is not the one currently LOADING, even if a fetcher ignores the abort signal.
    fetcher(controller.signal)
      .then(
        (payload) => {
          if (controller.signal.aborted) return;
          let data: T;
          try {
            data = parse(payload);
          } catch (error) {
            dispatch({ type: 'REJECT', requestId, error: describeError(error) });
            return;
          }
          dispatch({ type: 'RESOLVE', requestId, data });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          dispatch({ type: 'REJECT', requestId, error: describeError(error) });
        },
      )
      .finally(() => {
        if (controllerRef.current === controller) controllerRef.current = null;
      });
  };

  const cancel = (): void => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    dispatch({ type: 'RESET' });
  };

  return { state, load, cancel };
}
