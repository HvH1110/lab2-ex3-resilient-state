import { setupEventDelegation } from './events';
import { mount } from './render-to-dom';
import { abortRender, commitRender, resetCursor, resetStateStore, setRenderer } from './state-store';
import type { RootComponent, VNode } from './types';

export interface RenderAppOptions {
  /** Called after every committed render, e.g. to run the DOM parity audit. */
  readonly onCommit?: (tree: VNode, container: Element) => void;
}

export interface AppHandle {
  readonly rerender: () => void;
  readonly unmount: () => void;
  /** VNode tree of the last committed render. */
  readonly getTree: () => VNode | null;
}

/** The state store is a single global, so only one app can be mounted at a time. */
let mounted = false;

function focusedIdWithin(container: Element): string {
  const active = container.ownerDocument.activeElement;
  return active !== null && active !== container && container.contains(active) ? active.id : '';
}

/** Every render re-mounts the whole tree, so focus is restored by element id. */
function restoreFocus(container: Element, id: string): void {
  if (id === '') return;
  const element = container.ownerDocument.getElementById(id);
  if (element instanceof HTMLElement && container.contains(element)) element.focus();
}

export function renderApp(Component: RootComponent, container: Element, options: RenderAppOptions = {}): AppHandle {
  if (mounted) throw new Error('renderApp: an app is already mounted; unmount it first');
  mounted = true;

  const teardownEvents = setupEventDelegation(container);
  let tree: VNode | null = null;

  const render = (): void => {
    const focusedId = focusedIdWithin(container);
    let next: VNode;
    resetCursor();
    try {
      next = Component();
      // Nested components run (and may call hooks) while the tree is converted to DOM.
      mount(next, container);
      commitRender();
    } catch (error) {
      abortRender();
      throw error;
    }
    tree = next;
    restoreFocus(container, focusedId);
    options.onCommit?.(next, container);
  };

  setRenderer(render);
  render();

  return {
    rerender: render,
    getTree: () => tree,
    unmount: () => {
      teardownEvents();
      container.replaceChildren();
      resetStateStore();
      tree = null;
      mounted = false;
    },
  };
}
