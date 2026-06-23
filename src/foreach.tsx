import { Observed, Cleaner } from "./observed";
import type { JsxChild } from "./jsx";

export class ForeachObserved<T> extends Observed<T> {
  constructor(
    private readonly arr: Observed<T[]>,
    private readonly getIndexInternal: () => number,
  ) {
    // Dummy initial value; real reads always go through get()
    super(undefined as T);
    this.ownedCleaners.push(arr.subscribe((_) => this.notifyItem()));
  }

  index(): number {
    return this.getIndexInternal();
  }

  override get(): T {
    const idx = this.getIndexInternal();
    const cur = this.arr.get();

    if (idx < 0 || idx >= cur.length) {
      throw new Error("ForeachObserved item no longer exists");
    }

    return cur[idx];
  }

  override set(value: T): void {
    const idx = this.getIndexInternal();
    if (idx === -1) return;

    const cur = this.arr.get();
    cur[idx] = value;
    this.arr.notify();
  }

  remove(): void {
    const idx = this.getIndexInternal();
    if (idx === -1) return;

    const cur = this.arr.get();
    cur.splice(idx, 1);
    this.arr.notify();
  }

  private notifyItem(): void {
    super.notify();
  }

  override notify(): void {
    this.arr.notify();
  }
}

type ForProps<T, K> = {
  each: Observed<T[]>;
  key: (item: T, index: number) => K;
  children: (item: ForeachObserved<T>) => JsxChild;
};

export function For<T, K>(props: ForProps<T, K>): JsxChild {
  const { each: arr, key, children: template } = props;

  const rendered = new Observed<JsxChild[]>([]);

  type ItemState = {
    k: K;
    item: ForeachObserved<T>;
    view: JsxChild;
    cleaners: Cleaner[];
  };

  const byKey = new Map<K, ItemState>();

  let previousKeys: K[] = [];

  const sameKeys = (a: K[], b: K[]) => {
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }

    return true;
  };

  const reconcile = () => {
    const a = arr.get();

    const nextKeys: K[] = new Array(a.length);

    for (let i = 0; i < a.length; i++) {
      nextKeys[i] = key(a[i], i);
    }

    for (let i = 0; i < a.length; i++) {
      const k = nextKeys[i];

      if (byKey.has(k)) continue;

      const st = {} as ItemState;

      const getIndex = () => {
        const cur = arr.get();

        for (let j = 0; j < cur.length; j++) {
          if (key(cur[j], j) === st.k) return j;
        }

        return -1;
      };

      const item = new ForeachObserved<T>(arr, getIndex);

      st.k = k;
      st.item = item;
      st.cleaners = [new Cleaner(() => item.dispose())];
      st.view = template(item);

      byKey.set(k, st);
    }

    const nextKeySet = new Set(nextKeys);

    for (const [k, st] of byKey) {
      if (!nextKeySet.has(k)) {
        for (const cleaner of st.cleaners) {
          cleaner.execute();
        }

        st.cleaners.length = 0;
        byKey.delete(k);
      }
    }

    const structureChanged = !sameKeys(previousKeys, nextKeys);

    previousKeys = nextKeys;

    if (structureChanged) {
      rendered.set(nextKeys.map((k) => byKey.get(k)!.view));
    }
  };

  arr.subscribe(() => reconcile());
  reconcile();

  return <>{rendered}</>;
}
