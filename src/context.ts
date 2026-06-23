import { Context } from "./jsx";

export type ContextMap = Map<symbol, unknown>;

let currentContextMap: ContextMap | undefined;

export function getCurrentContextMap(): ContextMap | undefined {
  return currentContextMap;
}

export function withContextMap<T>(map: ContextMap, fn: () => T): T {
  const prev = currentContextMap;
  currentContextMap = map;

  try {
    return fn();
  } finally {
    currentContextMap = prev;
  }
}

export function createContext<T>(name = "Context"): Context<T> {
  const id = Symbol(name);

  const ctx = {
    id,
  };

  return {
    Provider(props) {
      return {
        kind: "context_provider",
        context: ctx,
        value: props.value,
        children: props.children ?? null,
      };
    },

    use(): T {
      const value = currentContextMap?.get(id);

      if (value === undefined) {
        throw new Error(`${name} is not available in the current scope`);
      }

      return value as T;
    },

    tryUse(): T | undefined {
      return currentContextMap?.get(id) as T | undefined;
    },
  };
}