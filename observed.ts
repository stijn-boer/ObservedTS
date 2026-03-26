import type { Cleanup, Listener } from "./types";

export class Observed<T> {
  protected value: T;
  private listeners = new Map<Listener<T>, Cleanup>();

  constructor(value: T) {
    this.value = value;
  }

  get(): T {
    return this.value;
  }

  set(value: T): void {
    if (Object.is(this.value, value)) return; // tiny win
    this.value = value;
    this.notify();
  }

  notify(): void {
    for (const [fn] of this.listeners) fn(this.value);
  }

  subscribe(fn: Listener<T>, cleanup: Cleanup = () => {}): Cleaner<T> {
    this.listeners.set(fn, cleanup);
    return new Cleaner(this, fn, cleanup);
  }

  unsubscribe(fn: Listener<T>): boolean {
    return this.listeners.delete(fn);
  }
}


export const observed = <T>(value: T) => new Observed(value);

/** Structural “container-like” target to avoid importing Container and creating cycles. */
export interface NodeRemover {
  removeNodes(...nodes: unknown[]): void;
}

export class Cleaner<T> {
  // keep broad to avoid importing Ref; we only treat Node specially at runtime
  private current: unknown[] = [];

  constructor(
    private readonly obs: Observed<T>,
    private readonly fn: Listener<T>,
    private readonly cleanup: Cleanup
  ) {}

  update(nodes: unknown[]): void {
    this.current = nodes;
  }

  /**
   * Execute cleanup and detach nodes.
   * - If you pass a DOM Node, it will remove Node children (ignores non-Nodes).
   * - If you pass a NodeRemover (e.g. Container), it will call removeNodes(...).
   */
  execute(root?: Node | NodeRemover): void {
    this.obs.unsubscribe(this.fn);
    this.cleanup();

    if (!root) return;

    // Container path (structural)
    if (typeof (root as any).removeNodes === "function") {
      (root as NodeRemover).removeNodes(...this.current);
      return;
    }

    // DOM path
    const domRoot = root as Node;
    for (const n of this.current) {
      if (!(n instanceof Node)) continue;
      if (n.parentNode === domRoot) domRoot.removeChild(n);
    }
  }
}
