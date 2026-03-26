import { observed, Observed } from "./observed";
import { create } from "./create";
import type { AttrValue, DomChild } from "./types";
import { Container } from "./container";

export interface TransitionOptions {
  show: Observed<boolean>;
  enter: string;
  enterFrom: string;
  enterTo: string;
  leave: string;
  leaveFrom: string;
  leaveTo: string;

  children?: Observed<number>;
  chilren?: Observed<number>;

  beforeOpen?: () => void;
  afterOpen?: () => void;
  beforeClose?: () => void;
  afterClose?: () => void;
}

function nextFrame(fn: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

/** Returns the *max* (delay+duration) across all transition entries, in ms. */
function getTransitionMs(el: Element): number {
  const cs = getComputedStyle(el);

  const toMs = (s: string) => {
    const v = s.trim();
    if (!v) return 0;
    if (v.endsWith("ms")) return Number.parseFloat(v);
    if (v.endsWith("s")) return Number.parseFloat(v) * 1000;
    // sometimes browsers return "0" without unit
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  const durations = cs.transitionDuration.split(",").map(toMs);
  const delays = cs.transitionDelay.split(",").map(toMs);

  const n = Math.max(durations.length, delays.length, 1);
  let max = 0;

  for (let i = 0; i < n; i++) {
    const d = durations[i] ?? durations[durations.length - 1] ?? 0;
    const l = delays[i] ?? delays[delays.length - 1] ?? 0;
    max = Math.max(max, d + l);
  }

  // if transition-property is "none", treat as no transition
  if (cs.transitionProperty === "none") return 0;

  return max;
}

function runTransition(
  el: HTMLElement,
  setClass: (cls: string) => void,
  from: string,
  to: string,
  done: () => void
) {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    cleanup();
    done();
  };

  const onEnd = (ev: Event) => {
    // Only treat events from the element itself (not bubbling from children)
    if (ev.target !== el) return;
    finish();
  };

  const cleanup = () => {
    el.removeEventListener("transitionend", onEnd);
    el.removeEventListener("transitioncancel", onEnd);
    if (timer != null) clearTimeout(timer);
  };

  // Start in "from" state
  setClass(from);

  // Force the browser to acknowledge the "from" styles before switching to "to".
  // (Reading offsetHeight triggers layout.)
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  el.offsetHeight;

  // Switch to "to" in next frame for reliable transitions
  nextFrame(() => {
    setClass(to);

    const ms = getTransitionMs(el);
    if (ms <= 0) {
      // No transition -> complete immediately (but after we've applied "to")
      finish();
      return;
    }

    el.addEventListener("transitionend", onEnd);
    el.addEventListener("transitioncancel", onEnd);

    // Fallback: in case transitionend never fires
    timer = window.setTimeout(finish, ms + 50);
  });

  let timer: number | null = null;
}

export function createTransition<K extends keyof HTMLElementTagNameMap>(
  options: TransitionOptions,
  type: K,
  attributes: Record<string, AttrValue> = {},
  ...nodes: DomChild[]
) {
  const children = options.children;

  const active = observed(options.show.get());
  const wantsActive = observed(options.show.get());

  const baseClass =
    attributes.class instanceof Observed
      ? attributes.class
      : observed(attributes.class ? (attributes.class as any) : "");

  const transitionClass = observed(
    options.show.get()
      ? `${options.enter} ${options.enterTo}`
      : `${options.leave} ${options.leaveTo}`
  );

  const mergedClass = observed(`${baseClass.get()} ${transitionClass.get()}`.trim());
  const recompute = () => mergedClass.set(`${baseClass.get()} ${transitionClass.get()}`.trim());
  baseClass.subscribe(recompute);
  transitionClass.subscribe(recompute);

  attributes.class = mergedClass;

  const el = create(type, attributes, ...nodes) as HTMLElement;

  // Helper: only touch transitionClass via one place
  const setTrans = (cls: string) => transitionClass.set(cls);

  wantsActive.subscribe((state) => {
    if (!state && children && children.get() > 0) return;
    active.set(state);
  });

  if (children) {
    children.subscribe((n) => {
      if (n < 1 && !wantsActive.get()) active.set(false);
    });
  }

  options.show.subscribe((state) => {
    // OPEN
    if (state && !active.get()) {
      options.beforeOpen?.();

      wantsActive.set(true);
      active.set(true);

      runTransition(
        el,
        setTrans,
        `${options.enter} ${options.enterFrom}`,
        `${options.enter} ${options.enterTo}`,
        () => options.afterOpen?.()
      );

      return;
    }

    // CLOSE
    if (!state && active.get()) {
      options.beforeClose?.();

      runTransition(
        el,
        setTrans,
        `${options.leave} ${options.leaveFrom}`,
        `${options.leave} ${options.leaveTo}`,
        () => {
          wantsActive.set(false);
          options.afterClose?.();
        }
      );

      return;
    }
  });

  return conditional(active, el);
}

export function conditional(condition: Observed<boolean>, ...nodes: DomChild[]): Container {
  const placeholder = document.createComment("conditional");
  const hidden = new Container();
  const shown = new Container();

  hidden.add(placeholder);
  shown.add(...nodes);

  if (!condition.get()) shown.swap(hidden);

  let isShown = condition.get();
  condition.subscribe((next) => {
    if (next === isShown) return;
    shown.swap(hidden);
    isShown = next;
  });

  return shown;
}