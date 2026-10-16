import { createElement } from '../src/create-element';
import { ErrorBoundary } from '../src/error-boundary';
import type { VNode } from '../src/types';

const fallback = (error: unknown): VNode =>
  createElement('p', { role: 'alert' }, error instanceof Error ? 'Recovered' : 'Unknown');

describe('ErrorBoundary', () => {
  it('returns the rendered subtree when nothing throws', () => {
    const tree = createElement('ul', null);
    expect(ErrorBoundary({ render: () => tree, fallback })).toBe(tree);
  });

  it('returns the fallback when render throws', () => {
    const vnode = ErrorBoundary({
      render: () => {
        throw new Error('Cannot read properties of undefined');
      },
      fallback,
    });
    expect(vnode.type).toBe('p');
    expect(vnode.props).toHaveProperty('role', 'alert');
    expect(vnode.props.children[0]?.props['nodeValue']).toBe('Recovered');
  });

  it('reports the error to onError', () => {
    const onError = vi.fn();
    const error = new RangeError('bad index');
    ErrorBoundary({ render: () => { throw error; }, fallback, onError });
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('lets the innermost boundary handle the error', () => {
    const outerFallback = vi.fn(fallback);
    const vnode = ErrorBoundary({
      render: () =>
        createElement('section', null,
          ErrorBoundary({ render: () => { throw new Error('inner'); }, fallback })),
      fallback: outerFallback,
    });
    expect(vnode.type).toBe('section');
    expect(outerFallback).not.toHaveBeenCalled();
  });

  it('propagates errors thrown by the fallback itself', () => {
    expect(() =>
      ErrorBoundary({
        render: () => { throw new Error('a'); },
        fallback: () => { throw new Error('fallback broke'); },
      }),
    ).toThrow('fallback broke');
  });
});
