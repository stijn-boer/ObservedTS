import { observed, Observed } from "./observed";
import type {
  BaseProps,
  CreateAttributes,
  IntrinsicTag,
  JsxChild,
} from "./jsx";

export interface TransitionOptions {
  show: Observed<boolean>;
  enter: string;
  enterFrom: string;
  enterTo: string;
  leave: string;
  leaveFrom: string;
  leaveTo: string;

  children?: Observed<number>;

  beforeOpen?: () => void;
  afterOpen?: () => void;
  beforeClose?: () => void;
  afterClose?: () => void;
}

type ConditionalProps = {
  when: Observed<boolean>;
  children?: JsxChild | JsxChild[];
};

type TransitionProps<K extends IntrinsicTag> = {
  as: K;
  options: TransitionOptions;
  attributes?: CreateAttributes;
  children?: JsxChild | JsxChild[];
};

function nextFrame(fn: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

/** Returns the max (delay + duration) across all transition entries, in ms. */
function getTransitionMs(el: Element): number {
  const cs = getComputedStyle(el);

  const toMs = (s: string) => {
    const v = s.trim();
    if (!v) return 0;
    if (v.endsWith("ms")) return Number.parseFloat(v);
    if (v.endsWith("s")) return Number.parseFloat(v) * 1000;
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

  if (cs.transitionProperty === "none") return 0;

  return max;
}

function runTransition(
  el: HTMLElement,
  setClass: (cls: string) => void,
  from: string,
  to: string,
  done: () => void,
) {
  let finished = false;
  let timer: number | null = null;

  const cleanup = () => {
    el.removeEventListener("transitionend", onEnd);
    el.removeEventListener("transitioncancel", onEnd);
    if (timer != null) clearTimeout(timer);
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    cleanup();
    done();
  };

  const onEnd = (ev: Event) => {
    if (ev.target !== el) return;
    finish();
  };

  setClass(from);

  // Force layout
  el.offsetHeight;

  nextFrame(() => {
    setClass(to);

    const ms = getTransitionMs(el);
    if (ms <= 0) {
      finish();
      return;
    }

    el.addEventListener("transitionend", onEnd);
    el.addEventListener("transitioncancel", onEnd);
    timer = window.setTimeout(finish, ms + 50);
  });
}

export function Conditional(props: ConditionalProps): JsxChild {
  const rendered = props.when.map((s) => s ? props.children ?? [] : []);
  return <>{rendered}</>;
}

export function Transition<K extends IntrinsicTag>(props: TransitionProps<K>): JsxChild {
  const { as, options } = props;
  const attrs: BaseProps = { ...(props.attributes ?? {}) };

  const active = observed(options.show.get());
  const wantsActive = observed(options.show.get());

  const baseClass = attrs.class;

  const transitionClass = observed(
    options.show.get()
      ? `${options.enter} ${options.enterTo}`
      : `${options.leave} ${options.leaveTo}`,
  );

  const ref = observed<Element | undefined>(undefined);

  attrs.class = (baseClass == null) ? transitionClass : [baseClass, transitionClass];
  attrs.ref = ref;

  wantsActive.subscribe((state) => {
    if (!state && options.children && options.children.get() > 0) return;
    active.set(state);
  });

  if (options.children) {
    options.children.subscribe((n) => {
      if (n < 1 && !wantsActive.get()) {
        active.set(false);
      }
    });
  }

  options.show.subscribe((state) => {
    if (state && !active.get()) {
      options.beforeOpen?.();

      wantsActive.set(true);
      active.set(true);

      const el = ref.get();
      if (!el || !(el instanceof HTMLElement)) return;

      runTransition(
        el,
        (cls) => transitionClass.set(cls),
        `${options.enter} ${options.enterFrom}`,
        `${options.enter} ${options.enterTo}`,
        () => options.afterOpen?.(),
      );

      return;
    }

    if (!state && active.get()) {
      options.beforeClose?.();

      const el = ref.get();
      if (!el || !(el instanceof HTMLElement)) return;

      runTransition(
        el,
        (cls) => transitionClass.set(cls),
        `${options.leave} ${options.leaveFrom}`,
        `${options.leave} ${options.leaveTo}`,
        () => {
          wantsActive.set(false);
          options.afterClose?.();
        },
      );
    }
  });

  const node = {
    kind: "intrinsic" as const,
    type: as,
    props: attrs,
    children: props.children ?? [],
  };

  return (
    <Conditional when={active}>
      <>
        {node}
      </>
    </Conditional>
  );
}