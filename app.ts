import { Container } from "./container";
import type { DomChild } from "./types";
import { LruCache, Lazy } from "./util";
import { appendNode } from "./dom";
import { resolveRoute, type RouteLoader, type NavGuard } from "./router";
import type { Cleaner } from "./observed";
import type { Ref } from "./container";

export interface PageOptions {
  beforeMount?: () => void;
  afterMount?: () => void;
  beforeUnmount?: () => void;
  afterUnmount?: () => void;
}

export interface Page {
  options: PageOptions;
  frag: Container;
}

export function page(options: PageOptions, ...nodes: DomChild[]): Page {
  const frag = new Container();
  frag.add(...nodes);
  return { options, frag };
}

export interface AppConfig {
  maxLoadedPages?: number;
}

export class App {
  private loaders = new Map<string, RouteLoader>();
  private navguards = new Map<string, NavGuard>();
  private pages = new LruCache<string, Page>();

  private current?: Page;
  private currentRoute?: string;
  private currentParams: Record<string, string> = {};
  private cleaner?: Cleaner<(Node | Ref)[]>;

  constructor(private readonly root: HTMLElement, private readonly config: AppConfig = {}) {}

  page(path: string, loader: RouteLoader, navGuard?: NavGuard): this {
    this.loaders.set(path, loader);
    if (navGuard) this.navguards.set(path, navGuard);
    return this;
  }

  start(): this {
    window.addEventListener("click", (evt) => {
      if (
        evt.defaultPrevented ||
        evt.button !== 0 ||
        evt.metaKey ||
        evt.altKey ||
        evt.ctrlKey ||
        evt.shiftKey
      ) return;

      const a = evt
        .composedPath()
        .find((el) => el instanceof Element && el.tagName === "A") as HTMLAnchorElement | undefined;

      if (!a || a.target) return;

      const rel = (a.getAttribute("rel") || "").split(/\s+/);
      if (a.hasAttribute("download") || rel.includes("external")) return;

      const href = a.getAttribute("href");
      if (!href) return;

      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;

      evt.preventDefault();
      this.route(url.pathname);
    });

    window.addEventListener("popstate", () => {
      this.route(window.location.pathname, { push: false });
    });

    this.route(window.location.pathname, { push: false });
    return this;
  }

  route(path: string, opts: { push?: boolean } = {}): void {
    const push = opts.push ?? true;

    this.getPageFor(path)
      .then((resolved) => {
        if (!resolved) throw new Error(`No page exists for ${path}`);
        const { route, page, params } = resolved;

        this.cleanupCurrent();

        if (push) {
          const url = new URL(path, window.location.origin);
          window.history.pushState("", "", url);
        }

        this.mount(route, page, params);
      })
      .catch((err) => console.error(err));
  }

  getParams(): Record<string, string> {
    return { ...this.currentParams };
  }

  private cleanupCurrent(): void {
    if (!this.current) return;

    this.current.options.beforeUnmount?.call(this.root);
    this.cleaner?.execute(this.root);
    this.current.options.afterUnmount?.call(this.root);

    this.cleaner = undefined;
    this.current = undefined;
    this.currentRoute = undefined;
    this.currentParams = {};
  }

  private mount(route: string, page: Page, params: Record<string, string>): void {
    this.current = page;
    this.currentRoute = route;
    this.currentParams = params;

    page.options.beforeMount?.call(this.root);
    this.cleaner = appendNode(this.root, page.frag);
    page.options.afterMount?.call(this.root);
  }

  private async getPageFor(
    pathname: string
  ): Promise<{ route: string; page: Page; params: Record<string, string> } | undefined> {
    const resolved = resolveRoute(this.loaders, this.navguards, pathname);
    if (!resolved) return undefined;

    const [route, loader, params] = resolved;

    const cached = this.pages.get(route);
    if (cached) return { route, page: cached, params };

    let page: Page;

    if (loader instanceof Lazy) {
      const mod = await loader.load();
      this.loaders.set(route, mod.default);
      page = mod.default.call(this.root);
    } else {
      page = loader.call(this.root);
    }

    this.pages.put(route, page);
    if (this.config.maxLoadedPages && this.pages.size() > this.config.maxLoadedPages) {
      this.pages.clearOldest(this.pages.size() - this.config.maxLoadedPages);
    }

    return { route, page, params };
  }
}

export function createApp(root: HTMLElement, config: AppConfig = {}) {
  return new App(root, config);
}
