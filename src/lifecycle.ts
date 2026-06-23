import { Cleaner } from "./observed";

function noop() {}

export type LifecycleCallback = () => void;
export type MountCallback = () => void | Cleaner | (() => void);

export type LifecycleScope = {
  beforeMount: LifecycleCallback[];
  onMount: MountCallback[];
  beforeUnmount: LifecycleCallback[];
  onUnmount: LifecycleCallback[];
  mountedCleanups: Cleaner[];
  mounted: boolean;
};

let currentScope: LifecycleScope | undefined;

export function createLifecycleScope(): LifecycleScope {
  return {
    beforeMount: [],
    onMount: [],
    beforeUnmount: [],
    onUnmount: [],
    mountedCleanups: [],
    mounted: false,
  };
}

export function withLifecycleScope<T>(
  scope: LifecycleScope,
  fn: () => T,
): T {
  const previous = currentScope;
  currentScope = scope;

  try {
    return fn();
  } finally {
    currentScope = previous;
  }
}

function getCurrentScope(): LifecycleScope {
  if (!currentScope) {
    throw new Error("Lifecycle hook called outside of a component");
  }

  return currentScope;
}

export function beforeMount(callback: LifecycleCallback): void {
  getCurrentScope().beforeMount.push(callback);
}

export function onMount(callback: MountCallback): void {
  getCurrentScope().onMount.push(callback);
}

export function beforeUnmount(callback: LifecycleCallback): void {
  getCurrentScope().beforeUnmount.push(callback);
}

export function onUnmount(callback: LifecycleCallback): void {
  getCurrentScope().onUnmount.push(callback);
}

function runCallbacks(callbacks: LifecycleCallback[]): void {
  for (const callback of callbacks) {
    callback();
  }
}

export function runMountLifecycle(scope: LifecycleScope): void {
  if (scope.mounted) return;

  runCallbacks(scope.beforeMount);

  for (const callback of scope.onMount) {
    const cleanup = callback();

    if (cleanup instanceof Cleaner) {
      scope.mountedCleanups.push(cleanup);
    } else if (typeof cleanup === "function") {
      scope.mountedCleanups.push(new Cleaner(cleanup));
    }
  }

  scope.mounted = true;
}

export function runBeforeUnmountLifecycle(scope: LifecycleScope): void {
  if (!scope.mounted) return;

  runCallbacks(scope.beforeUnmount);
}

export function runAfterUnmountLifecycle(scope: LifecycleScope): void {
  if (!scope.mounted) return;

  for (const cleanup of scope.mountedCleanups) {
    cleanup.execute();
  }

  scope.mountedCleanups = [];

  runCallbacks(scope.onUnmount);

  scope.mounted = false;
}