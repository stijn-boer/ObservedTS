import type { Page } from "./app";
import { Lazy } from "./util";

export type RouteLoader =
  | (() => Page)
  | Lazy<Promise<{ default: () => Page }>>;

export type NavGuard = (
  route: string,
  params: Record<string, string>
) => boolean | string;

export function normalizePathname(pathname: string): string {
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  if (pathname.length > 1 && !pathname.endsWith("/")) pathname += "/";
  return pathname;
}

function stripUrlExtras(p: string) {
  // remove "?query" and "#hash"
  const q = p.indexOf("?");
  const h = p.indexOf("#");

  let cut = p.length;
  if (q !== -1) cut = Math.min(cut, q);
  if (h !== -1) cut = Math.min(cut, h);

  return p.slice(0, cut);
}


export function matchRoute(
  route: string,
  pathname: string
): { ok: boolean; params: Record<string, string> } {
  pathname = stripUrlExtras(pathname);
  route = stripUrlExtras(route);

  const routeRequiresEndSlash = route !== "/" && route.endsWith("/");
  const routeEndsWithStarSlash = route.endsWith("*/");

  route = normalizePathname(route);
  pathname = normalizePathname(pathname);

  const rSeg = route.split("/").filter(Boolean);
  const pSeg = pathname.split("/").filter(Boolean);

  const params: Record<string, string> = {};

  // Special-case: "/*" (or "*") matches anything, including "/"
  if (rSeg.length === 1 && rSeg[0] === "*") {
    return { ok: true, params: {} };
  }

  for (let i = 0, j = 0; i < rSeg.length; i++, j++) {
    const rs = rSeg[i];
    const isLast = i === rSeg.length - 1;

    const ps = pSeg[j];

    // Last segment = "*" can be either:
    // - "/a/*"  => catch-all, but MUST have at least one segment after "/a"
    // - "/a/*/" => exactly one segment (NOT a catch-all), and route must end there
    if (isLast && rs === "*") {
      if (routeEndsWithStarSlash) {
        // "/a/*/" => exactly one segment
        if (ps === undefined) return { ok: false, params: {} };
        // consume exactly one (the loop does that); final length check below enforces no more
        continue;
      } else {
        // "/a/*" => catch-all but must be non-empty
        if (j >= pSeg.length) return { ok: false, params: {} }; // prevents matching "/a"
        return { ok: true, params: {} };
      }
    }

    // Trailing catch-all capture: "*rest"
    if (isLast && rs.startsWith("*") && rs.length > 1) {
      if (j >= pSeg.length) return { ok: false, params: {} };

      const key = rs.slice(1);
      params[key] = pSeg.slice(j).join("/");
      return { ok: true, params };
    }

    // Non-trailing wildcard segment: matches exactly one segment
    if (rs === "*") {
      if (ps === undefined) return { ok: false, params: {} };
      continue;
    }

    // Non-trailing capture: matches exactly one segment
    if (rs.startsWith("*") && rs.length > 1) {
      if (ps === undefined) return { ok: false, params: {} };
      params[rs.slice(1)] = ps;
      continue;
    }

    if (ps === undefined || rs !== ps) return { ok: false, params: {} };
  }

  // If the route ended with "/" (e.g. "/a/"), treat as exact match of that path.
  // In practice (because we normalize), this is equivalent to requiring full consumption.
  const ok = pSeg.length === rSeg.length;

  // For "/a/*/" we already enforced "one segment" in-loop and this enforces "no more".
  // For "/a/*" we returned early.

  return { ok, params: ok ? params : {} };

  function normalizePathname(p: string) {
    // Keep your existing normalizePathname if you already have one.
    // This is a safe default: ensures leading "/", collapses slashes, strips trailing "/" (except root).
    p = p.trim();
    if (!p.startsWith("/")) p = "/" + p;
    p = p.replace(/\/+/g, "/");
    if (p.length > 1) p = p.replace(/\/+$/, "");
    return p;
  }
}



export function resolveRoute(
  routes: Map<string, RouteLoader>,
  navguards: Map<string, NavGuard>,
  pathname: string
): [string, RouteLoader, Record<string, string>] | undefined {
  pathname = normalizePathname(pathname);

  for (const [route, loader] of routes) {
    const { ok, params } = matchRoute(route, pathname);
    if (!ok) continue;

    const guard = navguards.get(route);
    if (guard) {
      const result = guard(route, params);
      if (!result) continue;
      if (typeof result === "string") {
        const redir = routes.get(result);
        if (redir) return [result, redir, matchRoute(result, pathname).params];
        continue;
      }
    }

    return [route, loader, params];
  }

  return undefined;
}
