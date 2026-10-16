// VNode contract — the single source of truth for the engine.
// Written before any implementation (contract-first, see project-rules.md §1).

export const TEXT_ELEMENT = 'TEXT_ELEMENT';

export type EventHandler = (event: Event) => void;
export type AttributeValue = string | number | boolean | null | undefined;
export type PropValue = AttributeValue | EventHandler;

/** Props accepted by createElement (children are passed variadically). */
export type Props = Readonly<Record<string, PropValue>>;

/** Props stored on a VNode: user props plus the normalized children array. */
export interface VNodeProps {
  readonly [name: string]: PropValue | readonly VNode[];
  readonly children: readonly VNode[];
}

export interface TextVNodeProps {
  readonly nodeValue: string;
  readonly children: readonly [];
}

export type FunctionComponent = (props: VNodeProps) => VNode;

export interface TextVNode {
  readonly type: typeof TEXT_ELEMENT;
  readonly props: TextVNodeProps;
}

export interface ElementVNode {
  readonly type: string;
  readonly props: VNodeProps;
}

export interface ComponentVNode {
  readonly type: FunctionComponent;
  readonly props: VNodeProps;
}

export type VNode = TextVNode | ElementVNode | ComponentVNode;

/** Anything that may appear as a child argument of createElement. */
export type Child = VNode | string | number | boolean | null | undefined | readonly Child[];

// ---------------------------------------------------------------------------
// Typeguards
// ---------------------------------------------------------------------------

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Structural check for values of unknown origin (e.g. children passed by callers). */
export function isVNode(value: unknown): value is VNode {
  if (!isPlainObject(value)) return false;
  const { type, props } = value;
  if (typeof type !== 'string' && typeof type !== 'function') return false;
  return isPlainObject(props) && Array.isArray(props['children']);
}

export function isTextVNode(node: VNode): node is TextVNode {
  return node.type === TEXT_ELEMENT;
}

export function isComponentVNode(node: VNode): node is ComponentVNode {
  return typeof node.type === 'function';
}

export function isElementVNode(node: VNode): node is ElementVNode {
  return typeof node.type === 'string' && node.type !== TEXT_ELEMENT;
}

/** Children that render nothing: null, undefined, true, false. */
export function isEmptyChild(value: unknown): value is null | undefined | boolean {
  return value === null || value === undefined || typeof value === 'boolean';
}

/** Children that become TEXT_ELEMENT nodes. */
export function isTextChild(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

/** `onClick`, `onKeyDown`, ... bound to a function. */
export function isEventProp(name: string, value: unknown): value is EventHandler {
  return /^on[A-Z]/.test(name) && typeof value === 'function';
}

// ---------------------------------------------------------------------------
// Exercise 2: state & event delegation contracts
// ---------------------------------------------------------------------------

/** A new value, or an updater that derives it from the previous value. */
export type SetStateAction<T> = T | ((previous: T) => T);

export type StateSetter<T> = (action: SetStateAction<T>) => void;

export type StateHook<T> = readonly [value: T, setValue: StateSetter<T>];

/** Re-renders the whole app; installed by renderApp via setRenderer. */
export type Renderer = () => void;

/** The root component of an app (hooks may be called inside it). */
export type RootComponent = () => VNode;

/** Bubbling event types handled by the root delegation hub. */
export const DELEGATED_EVENTS = ['click', 'input', 'change', 'keydown', 'submit'] as const;

export type DelegatedEventType = (typeof DELEGATED_EVENTS)[number];

export function isDelegatedEventType(value: string): value is DelegatedEventType {
  return (DELEGATED_EVENTS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Exercise 3: async view state machine & feed contracts
// ---------------------------------------------------------------------------

export const VIEW_STATUSES = ['IDLE', 'LOADING', 'SUCCESS', 'ERROR'] as const;

export type ViewStatus = (typeof VIEW_STATUSES)[number];

/** The only shape a data component's state may take: impossible states are unrepresentable. */
export type ViewState<T> =
  | { readonly status: 'IDLE' }
  | { readonly status: 'LOADING'; readonly requestId: number }
  | { readonly status: 'SUCCESS'; readonly data: T }
  | { readonly status: 'ERROR'; readonly error: string };

export type ViewEvent<T> =
  | { readonly type: 'FETCH'; readonly requestId: number }
  | { readonly type: 'RESOLVE'; readonly requestId: number; readonly data: T }
  | { readonly type: 'REJECT'; readonly requestId: number; readonly error: string }
  | { readonly type: 'RESET' };

/** An async data source; must reject with an AbortError once `signal` aborts. */
export type Fetcher<T> = (signal: AbortSignal) => Promise<T>;

export interface FeedItem {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly author: string;
  readonly publishedAt: string;
}

/** Simulated network conditions for the demo feed service. */
export const SCENARIOS = ['healthy', 'slow', 'offline', 'malformed'] as const;

export type Scenario = (typeof SCENARIOS)[number];

export type FeedErrorKind = 'OFFLINE' | 'TIMEOUT' | 'SERVER' | 'INVALID_PAYLOAD';

export function isViewStatus(value: unknown): value is ViewStatus {
  return typeof value === 'string' && (VIEW_STATUSES as readonly string[]).includes(value);
}

/** Exhaustiveness check: compilation fails if a union member is not handled. */
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
