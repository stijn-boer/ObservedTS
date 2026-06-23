import { Cleanup, Listener } from "./jsx";


export class Cleaner {
  constructor(private readonly cleanup: Cleanup) {}

  execute(): void {
    this.cleanup();
  }
}

type ObservedValue<T> = T extends Observed<infer U> ? U : never;

type ObservedValues<T extends readonly Observed<any>[]> = {
  [K in keyof T]: ObservedValue<T[K]>;
};

export class Observed<T> {
  private value: T;
  protected listeners = new Map<Listener<T>, Cleanup>();
  protected ownedCleaners: Cleaner[] = [];

  constructor(value: T) {
    this.value = value;
  }

  get(): T {
    return this.value;
  }

  set(value: T): void {
    this.value = value;
    this.notify();
  }

  notify(): void {
    for (const [fn] of this.listeners) {
      fn(this.get());
    }
  }

  subscribe(fn: Listener<T>, cleanup: Cleanup = () => {}): Cleaner {
    this.listeners.set(fn, cleanup);

    return new Cleaner(() => {
      this.unsubscribe(fn);
      cleanup();
    });
  }

  unsubscribe(fn: Listener<T>): boolean {
    return this.listeners.delete(fn);
  }

  dispose(): void {
    for (const cleaner of this.ownedCleaners) {
      cleaner.execute();
    }

    this.ownedCleaners = [];

    for (const [, cleanup] of this.listeners) {
      cleanup();
    }

    this.listeners.clear();
  }

  map<U>(fn: (value: T) => U): Observed<U> {
    return Observed.compute([this] as const, fn);
  }

  flatMap<U>(fn: (value: T) => U | Observed<U>): Observed<U> {
    let inner = fn(this.get());

    let output: Observed<U>;    
    let innerCleaner: Cleaner;
    if (inner instanceof Observed) {
      output = new Observed<U>(inner.get());
      innerCleaner = inner.subscribe((value) => {
        output.set(value);
      });
    } else {
      output = new Observed<U>(inner);
      innerCleaner = new Cleaner(() => {});
    }

    const outerCleaner = this.subscribe((outerValue) => {
      innerCleaner.execute();

      inner = fn(outerValue);

      if (inner instanceof Observed) {
        output.set(inner.get());
        innerCleaner = inner.subscribe((innerValue) => {
          output.set(innerValue);
        });
      } else {
        output.set(inner);
        innerCleaner = new Cleaner(() => {});
      }
    });

    output.ownedCleaners = [
      outerCleaner,
      new Cleaner(() => {
        innerCleaner.execute();
      }),
    ];

    return output;
  }

  static compute<const Deps extends readonly Observed<any>[], U>(
    deps: Deps,
    fn: (...values: ObservedValues<Deps>) => U,
  ): Observed<U> {
    const read = () =>
      deps.map((dep) => dep.get()) as ObservedValues<Deps>;

    const output = new Observed(fn(...read()));

    const update = () => {
      output.set(fn(...read()));
    };

    output.ownedCleaners = deps.map((dep) => dep.subscribe(update));

    return output;
  }
}

export const observed = <T>(value: T) => new Observed(value);

