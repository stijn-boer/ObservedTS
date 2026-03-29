import type { CreateAttributes, JsxChild, Component, IntrinsicTag, VIntrinsic, VFragment } from "./jsx";

function flattenChildren(input: JsxChild[], out: JsxChild[] = []): JsxChild[] {
    for (const child of input) {
        if (Array.isArray(child)) {
            flattenChildren(child, out);
            continue;
        }

        if (child == null) {
            continue;
        }

        out.push(child as JsxChild);
    }

    return out;
}

function normalizeChildren(children: unknown): JsxChild {
    if (children == null) {
        return undefined;
    }

    if (Array.isArray(children)) {
        return flattenChildren(children as JsxChild[]);
    }

    return children as JsxChild;
}

function normalizeProps(props: Record<string, unknown> | null | undefined) {
    return props ?? {};
}

export function jsx<P>(
  type: IntrinsicTag | Component<P>,
  props: (P & { children?: JsxChild; class?: unknown }) | null,
  key?: unknown,
): any {
  const normalized = normalizeProps(props as Record<string, unknown> | null | undefined);
  const { children, ...attrs } = normalized;

  const normalizedChildren = normalizeChildren(children);

  if (key !== undefined) {
    attrs.key = key;
  }

  if (typeof type === "function") {
    return type({
      ...(attrs as P),
      children: normalizedChildren,
    });
  }

  return {
    kind: "intrinsic",
    type,
    props: attrs as CreateAttributes,
    children: normalizedChildren,
  } satisfies VIntrinsic;
}

export function jsxs<P>(
  type: IntrinsicTag | Component<P>,
  props: (P & { children?: JsxChild; class?: unknown }) | null,
  key?: unknown,
): any {
  return jsx(type, props, key);
}

export function Fragment(props: { children?: JsxChild }): VFragment {
  return {
    kind: "fragment",
    children: normalizeChildren(props.children),
  };
}