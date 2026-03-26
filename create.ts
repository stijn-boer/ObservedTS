import { appendNode } from "./dom";
import { Observed } from "./observed";
import type { Stringable, AttrValue, CreateAttributes, StyleObject, StyleValue, EventHandler, DomChild } from "./types";

function isEventKey(key: string) {
  // onclick, oninput, onkeydown, ...
  return key.length > 2 && key[0] === "o" && key[1] === "n";
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
  // boolean true -> boolean attribute present (empty string is canonical)
  if (v === true) {
    el.setAttribute(attr, "");
    return;
  }
  el.setAttribute(attr, String(v));
}

function toKebabCase(prop: string) {
  // backgroundColor -> background-color
  // vendor prefixes like WebkitUserSelect -> -webkit-user-select (roughly)
  return prop
    .replace(/^[A-Z]/, (m) => "-" + m.toLowerCase())
    .replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

function applyStyleObject(el: HTMLElement | SVGElement, obj: StyleObject) {
  const style = (el as any).style as CSSStyleDeclaration | undefined;
  if (!style) return;

  for (const [prop, val] of Object.entries(obj)) {
    const cssProp = prop.includes("-") ? prop : toKebabCase(prop);

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

function applyStyle(el: HTMLElement | SVGElement, v: StyleValue) {
  const style = (el as any).style as CSSStyleDeclaration | undefined;
  if (!style) return;

  const apply = (val: string | StyleObject) => {
    if (typeof val === "string") {
      style.cssText = val;
    } else {
      // Merge semantics: we do NOT wipe existing properties by default.
      // If you want "replace", do: style.cssText = "" first.
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
  if (val instanceof Observed) {
    const apply = (v: Stringable) => setOrRemoveAttr(el, attr, v);
    apply(val.get());
    val.subscribe(apply);
  } else {
    setOrRemoveAttr(el, attr, val);
  }
}

export function create<K extends keyof HTMLElementTagNameMap>(
  type: K,
  attributes: CreateAttributes = {},
  ...nodes: DomChild[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(type) as HTMLElementTagNameMap[K];

  for (const [key, raw] of Object.entries(attributes)) {
    if (raw == null) continue;

    // 1) style
    if (key === "style") {
      applyStyle(el, raw as StyleValue);
      continue;
    }

    // 2) inline event handlers: onclick, oninput, ...
    if (isEventKey(key) && typeof raw === "function") {
      const eventName = key.slice(2); // "click"
      el.addEventListener(eventName, raw as EventHandler);
      continue;
    }

    // 3) normal attributes (Stringable | Observed<Stringable>)
    applyAttrLike(el, key, raw as AttrValue);
  }

  for (const n of nodes) appendNode(el, n);
  return el;
}

export function createSVG<K extends keyof SVGElementTagNameMap>(
  type: K,
  attributes: CreateAttributes = {},
  ...nodes: DomChild[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS("http://www.w3.org/2000/svg", type) as any as SVGElementTagNameMap[K];

  for (const [key, raw] of Object.entries(attributes)) {
    if (raw == null) continue;

    if (key === "style") {
      applyStyle(el as any, raw as StyleValue);
      continue;
    }

    if (isEventKey(key) && typeof raw === "function") {
      const eventName = key.slice(2);
      (el as any).addEventListener(eventName, raw as EventHandler);
      continue;
    }

    applyAttrLike(el as any, key, raw as AttrValue);
  }

  for (const n of nodes) appendNode(el as any, n);
  return el;
}
