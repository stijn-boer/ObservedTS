import type { DomChild, Stringable, AttrValue } from "./types";
import { Cleaner, Observed } from "./observed";
import { Container, Ref } from "./container";

function isNode(value: any): value is Node {
  if (!value || typeof value !== "object") return false;
  const view = value.ownerDocument?.defaultView;
  return !!view && value instanceof view.Node;
}

export function toNode(input: Node | Stringable): Node {
  if (isNode(input)) return input;

  const text = String(input);
  if (text.startsWith("<!--") && text.endsWith("-->")) {
    return document.createComment(text.slice(4, text.length - 3));
  }
  return document.createTextNode(text);
}

export function appendNode(
  parent: Node | Container,
  child: DomChild
): Cleaner<(Node | Ref)[]> | undefined {
  if (parent instanceof Container) {
    parent.add(child);
    return;
  }

  if (child instanceof Ref) return;

  if (child instanceof Container) {
    const anchor = document.createComment("container");

    const stripRefs = (arr: (Node | Ref)[]) => {
      const out: Node[] = [];
      for (const n of arr) if (!(n instanceof Ref)) out.push(n);
      return out;
    };

    let currentAll = child.get();
    let current = stripRefs(currentAll);

    for (const n of current) parent.appendChild(n);
    parent.appendChild(anchor);

    const patch = (prev: Node[], next: Node[]) => {
      let a = 0;
      while (a < prev.length && a < next.length && prev[a] === next[a]) a++;

      let bPrev = prev.length - 1;
      let bNext = next.length - 1;
      while (bPrev >= a && bNext >= a && prev[bPrev] === next[bNext]) {
        bPrev--;
        bNext--;
      }

      for (let i = a; i <= bPrev; i++) {
        const n = prev[i];
        if (n.parentNode === parent) parent.removeChild(n);
      }

      const before = bNext + 1 < next.length ? next[bNext + 1] : anchor;
      for (let i = a; i <= bNext; i++) {
        parent.insertBefore(next[i], before);
      }
    };

    const cleaner = child.subscribe((nextAll) => {
      const next = stripRefs(nextAll);
      patch(current, next);

      currentAll = nextAll;
      current = next;

      cleaner.update([anchor, ...currentAll]); // fine: bookkeeping only
    });

    cleaner.update([anchor, ...currentAll]);
    return cleaner;
  }


  if (child instanceof Observed) {
    let current = parent.appendChild(toNode(child.get() as any));

    child.subscribe((val) => {
      const next = toNode(val as any);

      // Prefer in-place mutation for Text/Comment
      if (updateNodeInPlace(current, next)) return;

      // Otherwise replace
      parent.replaceChild(next, current);
      current = next;
    });

    return;
  }


  parent.appendChild(toNode(child));
}

export function debounce<F extends (...args: any[]) => void>(fn: F, timeout = 300) {
  let timer: number | undefined;
  return (...args: Parameters<F>) => {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), timeout);
  };
}

function updateNodeInPlace(current: Node, next: Node): boolean {
  // Text -> Text
  if (current.nodeType === Node.TEXT_NODE && next.nodeType === Node.TEXT_NODE) {
    const c = current as Text;
    const n = next as Text;
    if (c.data !== n.data) c.data = n.data;
    return true;
  }

  // Comment -> Comment
  if (current.nodeType === Node.COMMENT_NODE && next.nodeType === Node.COMMENT_NODE) {
    const c = current as Comment;
    const n = next as Comment;
    if (c.data !== n.data) c.data = n.data;
    return true;
  }

  return false;
}
