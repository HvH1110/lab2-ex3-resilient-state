import { registerHandler, toDelegatedEventType } from './events';
import {
  isComponentVNode,
  isEventProp,
  isTextVNode,
  isVNode,
  type VNode,
  type VNodeProps,
} from './types';

/** Props that are engine metadata, not DOM attributes. */
const RESERVED_PROPS = new Set(['children', 'key']);

/** Props that would bypass text-node escaping — never allowed. */
const FORBIDDEN_PROPS = new Set(['innerHTML', 'outerHTML', 'dangerouslySetInnerHTML']);

/** JSX-style prop names that differ from their HTML attribute names. */
const ATTRIBUTE_ALIASES: Readonly<Record<string, string>> = { className: 'class', htmlFor: 'for' };

function applyProps(element: HTMLElement, props: VNodeProps): void {
  for (const [name, value] of Object.entries(props)) {
    if (RESERVED_PROPS.has(name)) continue;

    if (FORBIDDEN_PROPS.has(name)) {
      throw new TypeError(`renderToDOM: "${name}" is forbidden (XSS); pass text as children instead`);
    }

    if (isEventProp(name, value)) {
      // No listener on the element itself: the root delegation hub dispatches to this handler.
      registerHandler(element, toDelegatedEventType(name), value);
      continue;
    }

    if (/^on/i.test(name)) {
      // Blocks inline handlers such as { onclick: 'alert(1)' }.
      throw new TypeError(`renderToDOM: event prop "${name}" must be a camelCase function, e.g. onClick`);
    }

    if (typeof value === 'function' || Array.isArray(value)) {
      throw new TypeError(`renderToDOM: unsupported value for prop "${name}"`);
    }

    if (value === null || value === undefined || value === false) continue;

    element.setAttribute(ATTRIBUTE_ALIASES[name] ?? name, value === true ? '' : String(value));
  }
}

/** Recursively converts a VNode tree into real DOM nodes (not yet attached). */
export function renderToDOM(vnode: VNode): Node {
  if (isTextVNode(vnode)) {
    // createTextNode never parses markup: '<script>' stays literal text.
    return document.createTextNode(vnode.props.nodeValue);
  }

  if (isComponentVNode(vnode)) {
    const rendered: unknown = vnode.type(vnode.props);
    if (!isVNode(rendered)) {
      throw new TypeError(`renderToDOM: component ${vnode.type.name || 'anonymous'} did not return a VNode`);
    }
    return renderToDOM(rendered);
  }

  const element = document.createElement(vnode.type);
  applyProps(element, vnode.props);
  for (const child of vnode.props.children) {
    element.appendChild(renderToDOM(child));
  }
  return element;
}

/** Renders `vnode` and replaces everything inside `container` with it. */
export function mount(vnode: VNode, container: Element): Node {
  const dom = renderToDOM(vnode);
  container.replaceChildren(dom);
  return dom;
}
