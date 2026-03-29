import { Observed, Cleaner } from "./observed";
import type { JsxChild } from "./jsx";

type ForeachApi<T> = {
  index: () => number;
  get: () => T;
  set: (val: T) => void;
  remove: () => void;
  notify: () => void;
  subscribe: (fn: (value: T) => void | boolean, cleanup?: () => void) => void;
  map<U>(fn: (value: T) => U): Observed<U>;
};

type ForProps<T, K> = {
  each: Observed<T[]>;
  key: (item: T, index: number) => K;
  children: (api: ForeachApi<T>) => JsxChild;
};

export function For<T, K>(props: ForProps<T, K>): JsxChild {
  const { each: arr, key, children: template } = props;

  const rendered = new Observed<JsxChild[]>([]);

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
    view: JsxChild;
    cleaners: Cleaner[];
  };

  const byKey = new Map<K, ItemState>();

  const reconcile = () => {
    const a = arr.get();

    const nextKeys: K[] = new Array(a.length);
    for (let i = 0; i < a.length; i++) {
      nextKeys[i] = key(a[i], i);
    }

    for (let i = 0; i < a.length; i++) {
      const k = nextKeys[i];
      if (byKey.has(k)) continue;

      const st: ItemState = {
        k,
        view: null,
        cleaners: [],
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
          const cleaner = arr.subscribe((value) => {
            const idx = getIndex();
            if (idx === -1) return;
            return fn(value[idx]);
          }, cleanup);

          st.cleaners.push(cleaner);
        },

        map: <U,>(fn: (value: T) => U) => {
          const idx = getIndex();
          const cur = arr.get();
          const o = new Observed(fn(cur[idx]));

          const cleaner = arr.subscribe((value) => {
            const i = getIndex();
            if (i === -1) return;
            o.set(fn(value[i]));
          });

          st.cleaners.push(cleaner);
          return o;
        },
      };

      st.view = template(api);
      byKey.set(k, st);
    }

    for (const [k, st] of byKey) {
      let exists = false;
      for (let i = 0; i < nextKeys.length; i++) {
        if (nextKeys[i] === k) {
          exists = true;
          break;
        }
      }

      if (!exists) {
        for (const cleaner of st.cleaners) {
          cleaner.execute();
        }
        st.cleaners.length = 0;
        byKey.delete(k);
      }
    }

    rendered.set(nextKeys.map((k) => byKey.get(k)!.view));
  };

  arr.subscribe(() => reconcile());
  reconcile();

  const a = <div ></div>

  return <>{rendered}</>;
}