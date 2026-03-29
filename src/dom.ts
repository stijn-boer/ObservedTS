import { renderIntrinsic } from "./create";
import {
  HTML_NS,
  type JsxChild,
  type Namespace,
  type VFragment,
  type VIntrinsic,
} from "./jsx";
import { Cleaner, Observed } from "./observed";
import { isNode, isPrimitive, isVFragment, isVIntrinsic } from "./util";

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
    for (const c of cleaners) {
      c.execute()
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
): Cleaner {
  if (child == null) {
    return new Cleaner(noop);
  }

  if (Array.isArray(child)) {
    return combineCleaners(
      child.map((c) => appendIntoRange(parent, before, c, parentNs, parentTag)),
    );
  }

  if (isVFragment(child)) {
    return appendIntoRange(parent, before, child.children, parentNs, parentTag);
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
      innerDispose = appendIntoRange(parent, end, value, parentNs, parentTag);
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
    const c = renderIntrinsic(child, parentNs, parentTag);
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
): Cleaner {

  if (!isNode(parent)) {
    throw new Error("Parent isn't a node!");
  }

  return appendIntoRange(parent, null, child, parentNs, parentTag);
}

export function debounce<F extends (...args: any[]) => void>(fn: F, timeout = 300) {
  let timer: number | undefined;
  return (...args: Parameters<F>) => {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), timeout);
  };
}