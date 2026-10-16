import { auditMount } from '../src/audit';
import { createDataFeedApp } from '../src/data-feed';
import { DEFAULT_LATENCY, DEFAULT_TIMEOUT_MS, FEED_FIXTURE, createFeedFetcher } from '../src/feed-service';
import { renderApp, type AppHandle } from '../src/reactive-engine';
import { inspectStateStore } from '../src/state-store';
import type { Scenario } from '../src/types';
import { verifyViewState } from '../src/view-state';

/** Which of the four mutually exclusive views is on screen. */
const VIEW_SELECTORS = {
  IDLE: '.panel > p.empty',
  LOADING: '.feed--skeleton',
  SUCCESS: '.feed:not(.feed--skeleton)',
  ERROR: '[role="alert"]',
} as const;

let root: HTMLElement;
let app: AppHandle | null;
let commitLog: { status: string | null; audit: boolean; views: string[] }[];

const $ = <E extends Element = HTMLElement>(selector: string): E => {
  const element = root.querySelector<E>(selector);
  if (element === null) throw new Error(`not found: ${selector}`);
  return element;
};
const visibleViews = (): string[] =>
  Object.entries(VIEW_SELECTORS).filter(([, sel]) => root.querySelector(sel) !== null).map(([name]) => name);
const status = (): string | null => $('.panel').getAttribute('data-status');
const pick = (scenario: Scenario): void => $(`#scenario-${scenario}`).click();
const primary = (): HTMLButtonElement => $<HTMLButtonElement>('#primary-action');

function mountApp(formatDate?: (iso: string) => string): void {
  const options = formatDate === undefined
    ? { fetcherFor: (s: Scenario) => createFeedFetcher(s) }
    : { fetcherFor: (s: Scenario) => createFeedFetcher(s), formatDate };
  app = renderApp(createDataFeedApp(options), root, {
    onCommit: (tree, container) =>
      commitLog.push({ status: status(), audit: auditMount(tree, container).ok, views: visibleViews() }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement('body');
  document.documentElement.replaceChild(root, document.body);
  commitLog = [];
  mountApp();
});

afterEach(() => {
  app?.unmount();
  app = null;
  vi.useRealTimers();
});

describe('Checkpoint 3: multi-state data component', () => {
  it('IDLE: explains the empty state and offers Load feed', () => {
    expect(status()).toBe('IDLE');
    expect(visibleViews()).toEqual(['IDLE']);
    expect(primary().textContent).toBe('Load feed');
    expect($('[role="status"]').textContent).toBe('Not loaded');
  });

  it('LOADING: renders the pulsing skeleton, hidden from assistive tech', () => {
    primary().click();
    expect(status()).toBe('LOADING');
    expect(visibleViews()).toEqual(['LOADING']);

    const skeleton = $('.feed--skeleton');
    expect(skeleton.getAttribute('aria-hidden')).toBe('true');
    expect(skeleton.querySelectorAll('li > article.card--skeleton')).toHaveLength(3);
    expect(skeleton.querySelectorAll('.skeleton-line').length).toBeGreaterThan(0);
    expect($('.panel').getAttribute('aria-busy')).toBe('true');
    expect($('[role="status"]').textContent).toBe('Loading posts…');
    expect(primary().textContent).toBe('Cancel');
  });

  it('SUCCESS: renders the validated feed as semantic articles', async () => {
    primary().click();
    await vi.advanceTimersByTimeAsync(DEFAULT_LATENCY.healthy);

    expect(status()).toBe('SUCCESS');
    expect(visibleViews()).toEqual(['SUCCESS']);
    expect([...root.querySelectorAll('.feed article h3')].map((h) => h.textContent)).toEqual(FEED_FIXTURE.map((i) => i.title));
    expect($('.feed time').getAttribute('datetime')).toBe(FEED_FIXTURE[0]?.publishedAt);
    expect($('.panel').getAttribute('aria-busy')).toBe('false');
    expect($('[role="status"]').textContent).toBe('Up to date: 4 posts');
    expect(primary().textContent).toBe('Reload');
  });

  it('ERROR (offline): human-readable alert with Retry Connection', async () => {
    pick('offline');
    primary().click();
    await vi.advanceTimersByTimeAsync(DEFAULT_LATENCY.offline);

    expect(status()).toBe('ERROR');
    expect(visibleViews()).toEqual(['ERROR']);
    const alert = $('[role="alert"]');
    expect(alert.querySelector('h3')?.textContent).toBe('Connection failed');
    expect(alert.textContent).toContain("We couldn't reach the server");
    expect(alert.textContent).not.toMatch(/net::|Error:|at \w+/);
    expect(primary().textContent).toBe('Retry Connection');
  });

  it('Retry Connection goes back through the skeleton to SUCCESS', async () => {
    pick('offline');
    primary().click();
    await vi.advanceTimersByTimeAsync(DEFAULT_LATENCY.offline);

    pick('healthy');
    primary().click();
    expect(visibleViews()).toEqual(['LOADING']);
    await vi.advanceTimersByTimeAsync(DEFAULT_LATENCY.healthy);
    expect(status()).toBe('SUCCESS');
  });

  it('ERROR (slow): reports a timeout', async () => {
    pick('slow');
    primary().click();
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
    expect($('[role="alert"]').textContent).toContain('took too long');
  });

  it('ERROR (malformed): rejects the payload without rendering any of it', async () => {
    pick('malformed');
    primary().click();
    await vi.advanceTimersByTimeAsync(DEFAULT_LATENCY.malformed);
    expect($('[role="alert"]').textContent).toContain('could not read');
    expect(root.querySelector('script')).toBeNull();
    expect(root.textContent).not.toContain('alert(1)');
  });

  it('Cancel returns to IDLE and the aborted request never lands', async () => {
    primary().click();
    primary().click(); // Cancel
    expect(status()).toBe('IDLE');
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS * 3);
    expect(status()).toBe('IDLE');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('RACE: a cancelled slow request cannot overwrite a newer successful one', async () => {
    pick('slow');
    primary().click(); // slow request 1
    primary().click(); // cancel
    pick('healthy');
    primary().click(); // request 2
    await vi.advanceTimersByTimeAsync(DEFAULT_LATENCY.healthy);
    expect(status()).toBe('SUCCESS');
    await vi.advanceTimersByTimeAsync(DEFAULT_LATENCY.slow);
    expect(status()).toBe('SUCCESS'); // no late TIMEOUT error
  });

  it('keeps focus on the primary action across state changes', async () => {
    primary().focus();
    primary().click();
    expect(document.activeElement).toBe(primary());
    expect(primary().textContent).toBe('Cancel');
    await vi.advanceTimersByTimeAsync(DEFAULT_LATENCY.healthy);
    expect(document.activeElement).toBe(primary());
    expect(primary().textContent).toBe('Reload');
  });

  it('INVARIANT: every commit shows exactly one view, a valid FSM state and DOM parity', async () => {
    primary().click();
    await vi.advanceTimersByTimeAsync(DEFAULT_LATENCY.healthy);
    pick('offline');
    primary().click();
    await vi.advanceTimersByTimeAsync(DEFAULT_LATENCY.offline);
    primary().click();
    primary().click();

    expect(commitLog.length).toBeGreaterThan(5);
    for (const commit of commitLog) {
      expect(commit.audit).toBe(true);
      expect(commit.views).toEqual([commit.status]);
    }
    expect(verifyViewState(inspectStateStore().states[1])).toBe(true);
  });

  it('uses semantic markup only and no listeners on children', async () => {
    const addListener = vi.spyOn(EventTarget.prototype, 'addEventListener');
    primary().click();
    await vi.advanceTimersByTimeAsync(DEFAULT_LATENCY.healthy);
    expect(root.querySelector('div, span')).toBeNull();
    // Only AbortSignals (not DOM elements) may get listeners after mount.
    expect(addListener.mock.instances.some((target) => target instanceof Element)).toBe(false);
    addListener.mockRestore();
  });
});

describe('ErrorBoundary integration', () => {
  it('a render-time crash shows the fallback with Retry Connection instead of breaking the app', async () => {
    app?.unmount();
    commitLog = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let crash = true;
    mountApp((iso) => {
      if (crash) throw new RangeError('Invalid time value');
      return iso.slice(0, 10);
    });

    primary().click();
    await vi.advanceTimersByTimeAsync(DEFAULT_LATENCY.healthy);
    const alert = $('[role="alert"]');
    expect(alert.querySelector('h3')?.textContent).toBe('Something broke');
    expect(alert.textContent).not.toContain('Invalid time value');
    expect(consoleError).toHaveBeenCalled();
    expect($('header h1').textContent).toBe('Engineering Feed'); // rest of the app still rendered

    crash = false;
    primary().click(); // Retry Connection
    await vi.advanceTimersByTimeAsync(DEFAULT_LATENCY.healthy);
    expect(root.querySelectorAll('.feed article')).toHaveLength(4);
    consoleError.mockRestore();
  });
});
