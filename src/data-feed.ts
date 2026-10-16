import { describeError, parseFeed } from './feed-service';
import {
  ErrorBoundary,
  SCENARIOS,
  assertNever,
  createElement,
  useAsyncResource,
  useState,
  type FeedItem,
  type Fetcher,
  type RootComponent,
  type Scenario,
  type VNode,
  type ViewState,
} from './mini-react';

type FeedState = ViewState<readonly FeedItem[]>;

export interface DataFeedOptions {
  /** Creates the data source for the selected network scenario. */
  readonly fetcherFor: (scenario: Scenario) => Fetcher<unknown>;
  /** Injected so tests can force a render-time crash into the ErrorBoundary. */
  readonly formatDate?: (iso: string) => string;
}

const SCENARIO_LABELS: Readonly<Record<Scenario, string>> = {
  healthy: 'Healthy',
  slow: 'Slow (times out)',
  offline: 'Offline',
  malformed: 'Malformed payload',
};

const STATUS_TEXT: Readonly<Record<FeedState['status'], string>> = {
  IDLE: 'Not loaded',
  LOADING: 'Loading posts…',
  SUCCESS: 'Up to date',
  ERROR: 'Connection failed',
};

const SKELETON_CARDS = 3;

const utcDate = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' });
const defaultFormatDate = (iso: string): string => utcDate.format(new Date(iso));

// The toolbar button and the Retry button share one id, so focus survives the full re-mount
// when the state changes (renderApp restores focus by id). Only one of them exists at a time.
const PRIMARY_ACTION = 'primary-action';

// ---------------------------------------------------------------------------
// Pure view functions, one per state
// ---------------------------------------------------------------------------

function ScenarioPicker({ scenario, onChange }: {
  readonly scenario: Scenario;
  readonly onChange: (scenario: Scenario) => void;
}): VNode {
  return createElement('fieldset', { className: 'scenarios' },
    createElement('legend', null, 'Network simulation'),
    SCENARIOS.map((value) =>
      createElement('label', { key: value, className: 'scenario' },
        createElement('input', {
          id: `scenario-${value}`, type: 'radio', name: 'scenario', value,
          checked: value === scenario, onChange: () => onChange(value),
        }),
        SCENARIO_LABELS[value],
      ),
    ),
  );
}

function IdleView(): VNode {
  return createElement('p', { className: 'empty' }, 'The feed has not been loaded yet. Choose a scenario and press Load feed.');
}

/** Pulsing placeholders that mirror the final card layout. Hidden from assistive tech. */
function SkeletonView(): VNode {
  return createElement('ul', { className: 'feed feed--skeleton', 'aria-hidden': 'true' },
    Array.from({ length: SKELETON_CARDS }, (_, i) =>
      createElement('li', { key: `skeleton-${i}` },
        createElement('article', { className: 'card card--skeleton' },
          createElement('p', { className: 'skeleton-line skeleton-line--title' }),
          createElement('p', { className: 'skeleton-line' }),
          createElement('p', { className: 'skeleton-line skeleton-line--short' }),
          createElement('p', { className: 'skeleton-line skeleton-line--meta' }),
        ),
      ),
    ),
  );
}

function SuccessView({ items, formatDate }: {
  readonly items: readonly FeedItem[];
  readonly formatDate: (iso: string) => string;
}): VNode {
  if (items.length === 0) return createElement('p', { className: 'empty' }, 'No posts yet.');
  return createElement('ul', { className: 'feed' },
    items.map((item) =>
      createElement('li', { key: item.id },
        createElement('article', { className: 'card', 'aria-labelledby': `post-${item.id}` },
          createElement('h3', { id: `post-${item.id}` }, item.title),
          createElement('p', null, item.summary),
          createElement('footer', { className: 'card__meta' },
            createElement('p', null,
              `By ${item.author} · `,
              createElement('time', { dateTime: item.publishedAt }, formatDate(item.publishedAt)),
            ),
          ),
        ),
      ),
    ),
  );
}

function ErrorView({ title, message, onRetry }: {
  readonly title: string;
  readonly message: string;
  readonly onRetry: () => void;
}): VNode {
  return createElement('section', { className: 'error', role: 'alert', 'aria-labelledby': 'error-title' },
    createElement('h3', { id: 'error-title' }, title),
    createElement('p', null, message),
    createElement('button', { id: PRIMARY_ACTION, type: 'button', className: 'btn', onClick: onRetry }, 'Retry Connection'),
  );
}

function FeedBody({ state, formatDate, onRetry }: {
  readonly state: FeedState;
  readonly formatDate: (iso: string) => string;
  readonly onRetry: () => void;
}): VNode {
  switch (state.status) {
    case 'IDLE':
      return IdleView();
    case 'LOADING':
      return SkeletonView();
    case 'SUCCESS':
      return SuccessView({ items: state.data, formatDate });
    case 'ERROR':
      return ErrorView({ title: 'Connection failed', message: state.error, onRetry });
    default:
      return assertNever(state);
  }
}

function ToolbarAction({ state, onLoad, onCancel }: {
  readonly state: FeedState;
  readonly onLoad: () => void;
  readonly onCancel: () => void;
}): VNode | null {
  const button = (label: string, onClick: () => void, className = 'btn'): VNode =>
    createElement('button', { id: PRIMARY_ACTION, type: 'button', className, onClick }, label);

  switch (state.status) {
    case 'IDLE':
      return button('Load feed', onLoad);
    case 'LOADING':
      return button('Cancel', onCancel, 'btn btn--ghost');
    case 'SUCCESS':
      return button('Reload', onLoad, 'btn btn--ghost');
    case 'ERROR':
      return null; // Retry Connection lives in the alert
    default:
      return assertNever(state);
  }
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function createDataFeedApp({ fetcherFor, formatDate = defaultFormatDate }: DataFeedOptions): RootComponent {
  return function DataFeedApp(): VNode {
    const [scenario, setScenario] = useState<Scenario>('healthy');
    const feed = useAsyncResource({ parse: parseFeed, describeError });
    const { state } = feed;

    const load = (): void => feed.load(fetcherFor(scenario));
    const statusText = state.status === 'SUCCESS' ? `${STATUS_TEXT.SUCCESS}: ${state.data.length} posts` : STATUS_TEXT[state.status];

    return createElement('main', { className: 'feed-app' },
      createElement('header', { className: 'hero' },
        createElement('h1', null, 'Engineering Feed'),
        createElement('p', { className: 'hero__lead' }, 'Async data through a strict 4-state machine: IDLE · LOADING · SUCCESS · ERROR.'),
      ),
      ScenarioPicker({ scenario, onChange: setScenario }),
      createElement('section', {
        className: 'panel', 'aria-labelledby': 'feed-title', 'aria-busy': String(state.status === 'LOADING'),
        'data-status': state.status,
      },
        createElement('header', { className: 'panel__header' },
          createElement('h2', { id: 'feed-title' }, 'Latest posts'),
          createElement('p', { className: 'status', role: 'status', 'data-status': state.status }, statusText),
          ToolbarAction({ state, onLoad: load, onCancel: feed.cancel }),
        ),
        ErrorBoundary({
          render: () => FeedBody({ state, formatDate, onRetry: load }),
          fallback: () =>
            ErrorView({
              title: 'Something broke',
              message: 'The feed could not be displayed. Please try again.',
              onRetry: load,
            }),
          onError: (error) => console.error('[ErrorBoundary] feed view crashed', error),
        }),
      ),
      createElement('footer', { className: 'footer' }, createElement('p', null, 'Lab 02 · Exercise 3')),
    );
  };
}
