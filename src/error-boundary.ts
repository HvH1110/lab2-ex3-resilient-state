import type { VNode } from './types';

export interface ErrorBoundaryProps {
  /** Builds the protected subtree. Must be a pure view function (no hooks). */
  readonly render: () => VNode;
  /** Shown instead of the subtree when `render` throws. */
  readonly fallback: (error: unknown) => VNode;
  readonly onError?: (error: unknown) => void;
}

/**
 * Catches exceptions thrown while building a subtree, so one broken view
 * shows a fallback instead of taking down the whole app.
 *
 * Scope: errors thrown synchronously by `render` (our view functions run eagerly).
 * Hooks are not allowed inside `render`: a throw halfway through would change the hook count.
 */
export function ErrorBoundary({ render, fallback, onError }: ErrorBoundaryProps): VNode {
  try {
    return render();
  } catch (error) {
    onError?.(error);
    return fallback(error);
  }
}
