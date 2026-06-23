import { ContextMap, withContextMap } from "./context";
import { renderIntrinsic } from "./create";
import {
  HTML_NS,
  type JsxChild,
  type Namespace,
} from "./jsx";
import { createLifecycleScope, runAfterUnmountLifecycle, runBeforeUnmountLifecycle, runMountLifecycle, withLifecycleScope } from "./lifecycle";
import { Cleaner, Observed } from "./observed";
import { isNode, isPrimitive, isVComponent, isVContextProvider, isVFragment, isVIntrinsic } from "./util";

export function toNode(input: Node | string | number | boolean | symbol): Node {
  if (isNode(input)) return input;

  const text = String(input);
  if (text.startsWith("<!--") && text.endsWith("-->")) {
    return document.createComment(text.slice(4, text.length - 3));
  }
  return document.createTextNode(text);
}

function noop() {}

function combineCleaners(cleaners: Array<Cleaner>): Cleaner {
  if (cleaners.length === 0) return new Cleaner(noop);

  return new Cleaner(() => {
    for (let i = cleaners.length - 1; i >= 0; i--) {
      cleaners[i].execute();
    }
  });
}

function clearBetween(parent: Node, start: Node, end: Node): void {
  let cur = start.nextSibling;
  while (cur && cur !== end) {
    const next = cur.nextSibling;
    parent.removeChild(cur);
    cur = next;
  }
}

function appendIntoRange(
  parent: Node,
  before: Node | null,
  child: JsxChild,
  parentNs: Namespace,
  parentTag?: string,
  contextMap: ContextMap = new Map(),
): Cleaner {
  if (child == null) {
    return new Cleaner(noop);
  }

  if (Array.isArray(child)) {
    return combineCleaners(
      child.map((c) => appendIntoRange(parent, before, c, parentNs, parentTag, contextMap)),
    );
  }

  if (isVFragment(child)) {
    return appendIntoRange(parent, before, child.children, parentNs, parentTag, contextMap);
  }

  if (isVComponent(child)) {
    const scope = createLifecycleScope();

    const rendered = withContextMap(contextMap, () => {
      return withLifecycleScope(scope, () => {
        return child.component(child.props);
      });
    });

    let renderedDispose = new Cleaner(noop);

    try {
      renderedDispose = appendIntoRange(
        parent,
        before,
        rendered,
        parentNs,
        parentTag,
        contextMap
      );

      runMountLifecycle(scope);
    } catch (err) {
      renderedDispose.execute();
      throw err;
    }

    return new Cleaner(() => {
      runBeforeUnmountLifecycle(scope);
      renderedDispose.execute();
      runAfterUnmountLifecycle(scope);
    });
  }

  if (isVContextProvider(child)) {
    const nextContextMap = new Map(contextMap);
    nextContextMap.set(child.context.id, child.value);

    return appendIntoRange(
      parent,
      before,
      child.children,
      parentNs,
      parentTag,
      nextContextMap,
    );
  }

  if (child instanceof Observed) {
    const start = document.createTextNode("");
    const end = document.createTextNode("");

    parent.insertBefore(start, before);
    parent.insertBefore(end, before);

    let innerDispose = new Cleaner(noop);

    const remount = (value: JsxChild) => {
      innerDispose.execute();
      clearBetween(parent, start, end);
      innerDispose = appendIntoRange(parent, end, value, parentNs, parentTag, contextMap);
    };

    remount(child.get() as JsxChild);

    const subDispose = child.subscribe((value) => {
      remount(value as JsxChild);
    });

    return new Cleaner(() => {
      subDispose.execute();
      innerDispose.execute();

      clearBetween(parent, start, end);

      if (start.parentNode === parent) parent.removeChild(start);
      if (end.parentNode === parent) parent.removeChild(end);
    });
  }

  if (isVIntrinsic(child)) {
    const c = renderIntrinsic(child, parentNs, parentTag, contextMap);
    parent.insertBefore(c, before);
    return new Cleaner(() => {
      parent.removeChild(c);
    });
  }

  if (isNode(child) || isPrimitive(child)) {
    const c = toNode(child);
    parent.insertBefore(c, before);
    return new Cleaner(() => {
      parent.removeChild(c);
    });
  }

  return new Cleaner(noop);
}

export function appendNode(
  parent: JsxChild,
  child: JsxChild,
  parentNs: Namespace = HTML_NS,
  parentTag?: string,
  contextMap: ContextMap = new Map(),
): Cleaner {

  if (!isNode(parent)) {
    throw new Error("Parent isn't a node!");
  }

  return appendIntoRange(parent, null, child, parentNs, parentTag, contextMap);
}

export function debounce<F extends (...args: any[]) => void>(fn: F, timeout = 300) {
  let timer: number | undefined;
  return (...args: Parameters<F>) => {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), timeout);
  };
}