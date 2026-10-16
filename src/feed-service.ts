import type { FeedErrorKind, FeedItem, Fetcher, Scenario } from './types';

export class FeedError extends Error {
  override readonly name = 'FeedError';

  constructor(readonly kind: FeedErrorKind, detail: string) {
    super(detail);
  }
}

/** What the user sees. Raw error messages and stack traces never reach the UI. */
const HUMAN_MESSAGES: Readonly<Record<FeedErrorKind, string>> = {
  OFFLINE: "We couldn't reach the server. Check your connection and try again.",
  TIMEOUT: 'The server took too long to respond. It may be busy right now.',
  SERVER: 'The server ran into a problem. Please try again in a moment.',
  INVALID_PAYLOAD: 'The server sent data we could not read.',
};

const GENERIC_MESSAGE = 'Something went wrong while loading the feed.';

export function describeError(error: unknown): string {
  if (error instanceof FeedError) return HUMAN_MESSAGES[error.kind];
  // fetch() rejects with a TypeError when the network is unreachable.
  if (error instanceof TypeError) return HUMAN_MESSAGES.OFFLINE;
  return GENERIC_MESSAGE;
}

export const isAbortError = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';

const abortError = (): DOMException => new DOMException('The request was aborted.', 'AbortError');

// ---------------------------------------------------------------------------
// Payload validation: network data is `unknown` until proven otherwise
// ---------------------------------------------------------------------------

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

export function isFeedItem(value: unknown): value is FeedItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isNonEmptyString(item['id']) &&
    isNonEmptyString(item['title']) &&
    typeof item['summary'] === 'string' &&
    isNonEmptyString(item['author']) &&
    typeof item['publishedAt'] === 'string' &&
    !Number.isNaN(Date.parse(item['publishedAt']))
  );
}

export function parseFeed(payload: unknown): readonly FeedItem[] {
  if (!Array.isArray(payload) || !payload.every(isFeedItem)) {
    throw new FeedError('INVALID_PAYLOAD', 'Feed payload failed validation');
  }
  return Object.freeze(payload.map((item) => Object.freeze({ ...item })));
}

// ---------------------------------------------------------------------------
// Simulated backend
// ---------------------------------------------------------------------------

export const FEED_FIXTURE: readonly FeedItem[] = Object.freeze([
  { id: 'n1', title: 'Fiber work loop, explained', summary: 'How time slicing splits rendering into interruptible units of work.', author: 'Core Team', publishedAt: '2026-10-12T08:00:00Z' },
  { id: 'n2', title: 'Why index keys corrupt state', summary: 'A walkthrough of the key anti-pattern with a deleted list item.', author: 'Reconciler WG', publishedAt: '2026-10-10T14:30:00Z' },
  { id: 'n3', title: 'Skeleton screens vs spinners', summary: 'Perceived performance improves when placeholders mirror the final layout.', author: 'UX Research', publishedAt: '2026-10-08T09:15:00Z' },
  { id: 'n4', title: 'Cancelling stale requests', summary: 'AbortController plus request ids keep slow responses from overwriting fresh data.', author: 'Platform', publishedAt: '2026-10-05T17:45:00Z' },
]);

export interface FeedServiceOptions {
  /** Response delay per scenario, in ms. */
  readonly latencyMs?: Partial<Record<Scenario, number>>;
  /** Requests slower than this reject with a TIMEOUT error. */
  readonly timeoutMs?: number;
}

export const DEFAULT_LATENCY: Readonly<Record<Scenario, number>> = {
  healthy: 1200,
  slow: 8000,
  offline: 800,
  malformed: 1000,
};

export const DEFAULT_TIMEOUT_MS = 4000;

/** Returns a fetcher that behaves like a network request under the given scenario. */
export function createFeedFetcher(scenario: Scenario, options: FeedServiceOptions = {}): Fetcher<unknown> {
  const latency = options.latencyMs?.[scenario] ?? DEFAULT_LATENCY[scenario];
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return (signal) =>
    new Promise<unknown>((resolve, reject) => {
      if (signal.aborted) {
        reject(abortError());
        return;
      }

      const settle = (finish: () => void): void => {
        clearTimeout(responseTimer);
        clearTimeout(timeoutTimer);
        signal.removeEventListener('abort', onAbort);
        finish();
      };
      const onAbort = (): void => settle(() => reject(abortError()));

      const respond = (): void => {
        switch (scenario) {
          case 'healthy':
          case 'slow':
            resolve(structuredClone(FEED_FIXTURE));
            return;
          case 'offline':
            reject(new FeedError('OFFLINE', 'net::ERR_INTERNET_DISCONNECTED'));
            return;
          case 'malformed':
            resolve([{ id: 42, title: null, body: '<script>alert(1)</script>' }]);
            return;
        }
      };

      const responseTimer = setTimeout(() => settle(respond), latency);
      const timeoutTimer = setTimeout(
        () => settle(() => reject(new FeedError('TIMEOUT', `No response after ${timeout}ms`))),
        timeout,
      );
      signal.addEventListener('abort', onAbort, { once: true });
    });
}
