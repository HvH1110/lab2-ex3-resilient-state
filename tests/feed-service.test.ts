import {
  DEFAULT_LATENCY,
  DEFAULT_TIMEOUT_MS,
  FEED_FIXTURE,
  FeedError,
  createFeedFetcher,
  describeError,
  isAbortError,
  isFeedItem,
  parseFeed,
} from '../src/feed-service';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const settled = async <T>(promise: Promise<T>): Promise<{ value?: T; error?: unknown }> =>
  promise.then((value) => ({ value }), (error: unknown) => ({ error }));

describe('createFeedFetcher', () => {
  it('healthy: resolves a valid feed after the configured latency', async () => {
    const result = settled(createFeedFetcher('healthy')(new AbortController().signal));
    await vi.advanceTimersByTimeAsync(DEFAULT_LATENCY.healthy - 1);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(1);

    const { value } = await result;
    expect(parseFeed(value)).toEqual(FEED_FIXTURE);
    expect(value).not.toBe(FEED_FIXTURE); // a copy, like a real response body
    expect(vi.getTimerCount()).toBe(0);
  });

  it('slow: rejects with TIMEOUT once the timeout elapses', async () => {
    const result = settled(createFeedFetcher('slow')(new AbortController().signal));
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
    const { error } = await result;
    expect(error).toBeInstanceOf(FeedError);
    expect((error as FeedError).kind).toBe('TIMEOUT');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('offline: rejects with OFFLINE', async () => {
    const result = settled(createFeedFetcher('offline')(new AbortController().signal));
    await vi.runAllTimersAsync();
    expect(((await result).error as FeedError).kind).toBe('OFFLINE');
  });

  it('malformed: resolves a payload that fails validation', async () => {
    const result = settled(createFeedFetcher('malformed')(new AbortController().signal));
    await vi.runAllTimersAsync();
    const { value } = await result;
    expect(() => parseFeed(value)).toThrow(FeedError);
  });

  it('abort: rejects with AbortError and clears every timer', async () => {
    const controller = new AbortController();
    const result = settled(createFeedFetcher('healthy')(controller.signal));
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    const { error } = await result;
    expect(isAbortError(error)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { error } = await settled(createFeedFetcher('healthy')(controller.signal));
    expect(isAbortError(error)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('honours custom latency and timeout options', async () => {
    const fetcher = createFeedFetcher('healthy', { latencyMs: { healthy: 50 }, timeoutMs: 40 });
    const result = settled(fetcher(new AbortController().signal));
    await vi.advanceTimersByTimeAsync(40);
    expect(((await result).error as FeedError).kind).toBe('TIMEOUT');
  });
});

describe('parseFeed / isFeedItem', () => {
  it('accepts the fixture and returns frozen copies', () => {
    const feed = parseFeed(structuredClone(FEED_FIXTURE));
    expect(feed).toEqual(FEED_FIXTURE);
    expect(Object.isFrozen(feed)).toBe(true);
    expect(Object.isFrozen(feed[0])).toBe(true);
  });

  it.each([
    ['not an array', { items: [] }],
    ['null', null],
    ['item with numeric id', [{ ...FEED_FIXTURE[0], id: 1 }]],
    ['item without title', [{ ...FEED_FIXTURE[0], title: '' }]],
    ['item with invalid date', [{ ...FEED_FIXTURE[0], publishedAt: 'yesterday' }]],
  ])('rejects %s', (_label, payload) => {
    expect(() => parseFeed(payload)).toThrow(expect.objectContaining({ kind: 'INVALID_PAYLOAD' }));
  });

  it('accepts an empty feed', () => {
    expect(parseFeed([])).toEqual([]);
  });

  it('isFeedItem rejects primitives', () => {
    expect([null, 'x', 1, undefined].some(isFeedItem)).toBe(false);
  });
});

describe('describeError', () => {
  it.each([
    [new FeedError('OFFLINE', 'net::ERR'), /couldn't reach the server/],
    [new FeedError('TIMEOUT', 'x'), /took too long/],
    [new FeedError('SERVER', 'x'), /ran into a problem/],
    [new FeedError('INVALID_PAYLOAD', 'x'), /could not read/],
    [new TypeError('Failed to fetch'), /couldn't reach the server/],
    [new Error('ECONNRESET at Socket.onread (node:net:123)'), /Something went wrong/],
    ['string thrown', /Something went wrong/],
  ])('maps %o to a human-readable message', (error, expected) => {
    const message = describeError(error);
    expect(message).toMatch(expected);
    expect(message).not.toMatch(/net::|ECONNRESET|node:/);
  });
});
