import { appendNode } from "./dom";
import { Observed } from "./observed";
import type { AttrValue,  EventHandler, VIntrinsic, Namespace, StyleValue, StyleObject, Stringable, ObservedStringable } from "./jsx";
import { HTML_NS, SVG_NS, MATH_NS } from "./jsx";

function getChildNamespace(parentNs: Namespace, tag: string, parentTag?: string): Namespace {
  if (parentNs === HTML_NS) {
    if (tag === "svg") return SVG_NS;
    if (tag === "math") return MATH_NS;
    return HTML_NS;
  }

  if (parentNs === SVG_NS) {
    if (parentTag === "foreignObject") return HTML_NS;
    return SVG_NS;
  }

  if (parentNs === MATH_NS) {
    return MATH_NS;
  }

  return HTML_NS;
}

function isEventKey(key: string) {
  // onclick, oninput, onkeydown, ...
  return key.length > 2 && key[0] === "o" && key[1] === "n";
}

function toKebabCase(prop: string) {
  // backgroundColor -> background-color
  // vendor prefixes like WebkitUserSelect -> -webkit-user-select (roughly)
  return prop
    .replace(/^[A-Z]/, (m) => "-" + m.toLowerCase())
    .replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

function shouldRemoveAttr(v: Stringable) {
  // Important: DO NOT treat 0 as "remove"
  // Remove for: false, empty string, null/undefined (defensive)
  return v === false || v === "" || v == null;
}

function setOrRemoveAttr(el: Element, attr: string, v: Stringable) {
  if (shouldRemoveAttr(v)) {
    el.removeAttribute(attr);
    return;
  }

  // boolean true -> boolean attribute present
  if (v === true) {
    el.setAttribute(attr, "");
    return;
  }

  el.setAttribute(attr, String(v));
}

type NestedObservedStringable =
  | ObservedStringable
  | NestedObservedStringable[];

function collectJoinedParts(
  value: NestedObservedStringable,
  parts: string[],
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectJoinedParts(item, parts);
    }
    return;
  }

  const resolved = value instanceof Observed ? value.get() : value;

  if (shouldRemoveAttr(resolved)) return;
  if (resolved === true) return;

  parts.push(String(resolved));
}

function normalizeJoinedValue(
  values: NestedObservedStringable,
  separator = " ",
): Stringable {
  const parts: string[] = [];
  collectJoinedParts(values, parts);
  return parts.length === 0 ? "" : parts.join(separator);
}

function subscribeNestedObserved(
  value: NestedObservedStringable,
  listener: () => void,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      subscribeNestedObserved(item, listener);
    }
    return;
  }

  if (value instanceof Observed) {
    value.subscribe(listener);
  }
}

function applyStyleObject(el: Element, obj: StyleObject) {
  const style = (el as any).style as CSSStyleDeclaration | undefined;
  if (!style) return;

  for (const [prop, val] of Object.entries(obj)) {
    const cssProp = prop.includes("-") ? prop : toKebabCase(prop);

    if (Array.isArray(val)) {
      const apply = () => {
        const resolved = normalizeJoinedValue(val, " ");
        if (shouldRemoveAttr(resolved)) style.removeProperty(cssProp);
        else style.setProperty(cssProp, String(resolved));
      };

      apply();
      subscribeNestedObserved(val, apply);
      continue;
    }

    if (val instanceof Observed) {
      const apply = (v: Stringable) => {
        if (shouldRemoveAttr(v)) style.removeProperty(cssProp);
        else style.setProperty(cssProp, String(v));
      };

      apply(val.get());
      val.subscribe(apply);
    } else {
      if (shouldRemoveAttr(val)) style.removeProperty(cssProp);
      else style.setProperty(cssProp, String(val));
    }
  }
}

function applyStyle(el: Element, v: StyleValue) {
  const style = (el as any).style as CSSStyleDeclaration | undefined;
  if (!style) return;

  const apply = (val: string | StyleObject) => {
    if (typeof val === "string") {
      style.cssText = val;
    } else {
      applyStyleObject(el, val);
    }
  };

  if (v instanceof Observed) {
    apply(v.get());
    v.subscribe(apply);
  } else {
    apply(v);
  }
}

function applyAttrLike(el: Element, attr: string, val: AttrValue) {
  if (Array.isArray(val)) {
    const apply = () => {
      setOrRemoveAttr(el, attr, normalizeJoinedValue(val, " "));
    };

    apply();

    for (const item of val) {
      if (item instanceof Observed) {
        item.subscribe(apply);
      }
    }

    return;
  }

  if (val instanceof Observed) {
    const apply = (v: Stringable) => setOrRemoveAttr(el, attr, v);
    apply(val.get());
    val.subscribe(apply);
  } else {
    setOrRemoveAttr(el, attr, val);
  }
}

function applyAttributes(el: Element, attributes: any): void {
  for (const [key, raw] of Object.entries(attributes)) {
    if (raw == null) continue;

    if (key === "ref") {
      applyRef(el, raw as Observed<Element | undefined> | ((el: Element) => void));
      continue;
    }

    if (key === "style") {
      applyStyle(el, raw as StyleValue);
      continue;
    }

    if (isEventKey(key) && typeof raw === "function") {
      el.addEventListener(key.slice(2), raw as EventHandler);
      continue;
    }

    applyAttrLike(el, key, raw as AttrValue);
  }
}

function applyRef<T extends Element>(
  el: T,
  ref: Observed<T | undefined> | ((el: T) => void),
): void {
  if (ref instanceof Observed) {
    ref.set(el);
    return;
  }

  if (typeof ref === "function") {
    ref(el);
  }
}

export function renderIntrinsic(
  vnode: VIntrinsic,
  parentNs: Namespace,
  parentTag?: string,
): Element {
  const ns = getChildNamespace(parentNs, vnode.type, parentTag);

  const el =
    ns === HTML_NS
      ? document.createElement(vnode.type)
      : document.createElementNS(ns, vnode.type);

  applyAttributes(el, vnode.props);

  appendNode(el, vnode.children, ns, vnode.type);

  return el;
}