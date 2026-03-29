import type { Cleanup, Listener } from "./jsx";

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

  subscribe(fn: Listener<T>, cleanup: Cleanup = () => {}): Cleaner {
    this.listeners.set(fn, cleanup);
    return new Cleaner(() => {
      this.unsubscribe(fn);
      cleanup()
    });
  }

  unsubscribe(fn: Listener<T>): boolean {
    return this.listeners.delete(fn);
  }

  map<U>(fn: (value: T) => U): Observed<U> {
    const o = new Observed(fn(this.value));
    this.subscribe((f) => o.set(fn(f)));
    return o;
  } 
}


export const observed = <T>(value: T) => new Observed(value);

export class Cleaner {

  constructor(
    private readonly cleanup: Cleanup
  ) {}

  execute(): void {
    this.cleanup();
  }
}
