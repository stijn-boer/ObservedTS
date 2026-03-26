const globalStore = new Map<string, any>();

export function store<T = any>(key: string): T | undefined;
export function store<T = any>(key: string, val: T): T;
export function store<T = any>(key: string, val?: T) {
  if (arguments.length > 1) globalStore.set(key, val);
  return globalStore.get(key);
}

// @ts-ignore
window.store = store;

export class Lazy<T> {
  constructor(private readonly loader: () => T) {}
  load(): T {
    return this.loader();
  }
}

export const lazy = <T>(cb: () => T) => new Lazy(cb);

export class LruCache<K, V> {
  private map = new Map<K, V>();

  put(key: K, val: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, val);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const val = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }

  size(): number {
    return this.map.size;
  }

  clearOldest(count: number): void {
    for (let i = 0; i < count; i++) {
      const k = this.map.keys().next().value;
      if (k === undefined) return;
      this.map.delete(k);
    }
  }
}
