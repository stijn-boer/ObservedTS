import { Observed, type Cleaner } from "./observed";
import type { DomChild, Stringable } from "./types";
import { toNode } from "./dom";

export class Ref {}

type Subscription =
  | Cleaner<(Node | Ref)[]>
  | Cleaner<Node | Stringable>
  | Cleaner<any>;

export class Container extends Observed<(Node | Ref)[]> {
  private subs: Subscription[] = [];

  constructor() {
    super([]);
  }

  /** Inserts/maintains a child Container’s live nodes into this container, anchored by a Ref. */
  addContainer(child: Container): Cleaner<(Node | Ref)[]> {
    const anchor = new Ref();
    let current = [...child.get()];

    // initial splice: anchor + current
    this.spliceAfterAnchor(anchor, current);

    const cleaner = child.subscribe((next) => {
      this.removeNodes(...current);
      current = [...next];

      this.spliceAfterAnchor(anchor, current);
      cleaner.update([...current, anchor]);
      this.notify();
    });

    cleaner.update([...current, anchor]);
    this.subs.push(cleaner);
    this.notify();
    return cleaner;
  }

  add(...nodes: DomChild[]): void {
    for (const node of nodes) {
      if (node instanceof Ref) continue;

      if (node instanceof Container) {
        this.addContainer(node);
        continue;
      }

      if (node instanceof Observed) {
        let current = toNode(node.get() as any);
        this.value.push(current);

        const cleaner = node.subscribe((val: Node | Stringable) => {
          const next = toNode(val);
          this.replaceNode(current, next);
          current = next;
          this.notify();
        });

        this.subs.push(cleaner);
        continue;
      }

      this.value.push(toNode(node));
    }

    this.notify();
  }

  removeNodes(...nodes: (Node | Ref)[]): void {
    const arr = this.get();
    const toRemove = new Set(nodes);

    // remove exact Node/Ref occurrences
    const next: (Node | Ref)[] = [];
    for (const n of arr) {
      if (n instanceof Ref) {
        next.push(n);
        continue;
      }
      if (!toRemove.has(n)) next.push(n);
    }

    (this as any).value = next; // keeps Observed as-is without changing its API
    this.notify();
  }

  clear(): void {
    for (const s of this.subs) s.execute(this);
    this.value = [];
    this.subs = [];
    this.notify();
  }

  swap(other: Container): void {
    const tmp = [...other.get()];
    other.clear();
    other.add(...this.get());
    this.clear();
    this.add(...tmp);
    this.notify();
  }

  private replaceNode(oldNode: Node, newNode: Node): void {
    const arr = this.get();
    const i = arr.indexOf(oldNode);
    if (i >= 0) arr[i] = newNode;
  }

  private spliceAfterAnchor(anchor: Ref, nodes: (Node | Ref)[]): void {
    const arr = this.get();
    const idx = arr.indexOf(anchor);

    if (idx === -1) {
      // first insertion: append anchor then nodes
      arr.push(anchor, ...nodes);
      return;
    }

    // insert before anchor so anchor stays at end of segment
    arr.splice(idx, 0, ...nodes);
  }
}


export const container = (...nodes: DomChild[]) => {
  const c = new Container();
  c.add(...nodes);
  return c;
};
