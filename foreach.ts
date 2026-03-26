import { Container } from "./container";
import { Cleaner, Observed } from "./observed";

type ForeachApi<T> = {
  index: () => number;
  get: () => T;
  set: (val: T) => void;     // undefined => remove entry
  remove: () => void;                    // convenience
  notify: () => void;                    // force re-render / re-run subscribers
  subscribe: (fn: (value: T) => void | boolean, cleanup?: () => void) => void;
};

export function foreach<T, K>(
  arr: Observed<T[]>,
  key: (item: T, index: number) => K,
  template: (api: ForeachApi<T>) => Container
): Container {
  // We return a stable "root" that holds children + an anchor comment.
  const root = new Container();

  const removeByIndex = (idx: number) => {
    const a = arr.get();
    if (idx < 0 || idx >= a.length) return;
    a.splice(idx, 1);
    arr.notify();
  };

  const setByIndex = (idx: number, val: T) => {
    const a = arr.get();
    if (idx < 0 || idx >= a.length) return;
    a[idx] = val;
    arr.notify();
  };

  type ItemState = {
    k: K;
    cleaners: Cleaner<any>[];
  };

  const byKey = new Map<K, ItemState>();

  const reconcile = () => {
    const a = arr.get();

    // Compute next ordering by key
    const nextKeys: K[] = new Array(a.length);
    for (let i = 0; i < a.length; i++) nextKeys[i] = key(a[i], i);

    // Create missing states
    for (let i = 0; i < a.length; i++) {
      const k = nextKeys[i];
      if (byKey.has(k)) continue;

      const st: ItemState = {
        k,
        cleaners: []
      };

      const getIndex = () => {
        const cur = arr.get();
        for (let j = 0; j < cur.length; j++) {
          if (key(cur[j], j) === st.k) return j;
        }
        return -1;
      };

      const api: ForeachApi<T> = {
        index: () => getIndex(),
        get: () => {
          const idx = getIndex();
          const cur = arr.get();
          return cur[idx];
        },
        set: (val) => {
          const idx = getIndex();
          if (idx === -1) return;
          setByIndex(idx, val);
        },
        remove: () => {
          const idx = getIndex();
          if (idx === -1) return;
          removeByIndex(idx);
        },
        notify: () => arr.notify(),
        subscribe: (fn, cleanup) => {
          st.cleaners.push(arr.subscribe((val) => fn(val[getIndex()]), cleanup))
        },
      };

      const node = template(api);
      st.cleaners.push(root.addContainer(node))

      byKey.set(k, st);
    }

    for (const [k, st] of byKey) {
      // key is gone if it doesn't appear in nextKeys
      // O(n) check is fine for small lists; for big lists use a Set(nextKeys)
      let exists = false;
      for (let i = 0; i < nextKeys.length; i++) {
        if (nextKeys[i] === k) { exists = true; break; }
      }
      if (!exists) {
        st.cleaners.forEach(c => c.execute(root));
        st.cleaners.length = 0;
        byKey.delete(k);
      }
    }
  };

  arr.subscribe(() => reconcile());
  reconcile();

  return root;
}
