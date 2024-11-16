export type AcceptedNodes = Node | Ref | Container | Observed<Node> | Stringable | ObservedStringable
type Stringable = string | number | Symbol | boolean
type ObservedStringable = Observed<boolean> | Observed<string> | Observed<number> | Observed<Symbol>

export class Observed<T> {
    protected value: T
    listeners: Map<((value: T) => boolean | void), () => void>

    constructor(value: T) {
        this.listeners = new Map();
        this.value = value;
    }

    subscribe(fn: ((value: T) => boolean | void), clean = () => {}): Cleaner<T> {
        this.listeners.set(fn, clean);
        return new Cleaner(this, [fn, clean]);
    }

    unsubscribe(fn: ((value: T) => boolean | void)): boolean {
        return this.listeners.delete(fn);
    }

    get() {
        return this.value;
    }
    
    set(value: T) {
        this.value = value;
        this.notify();
    }    

    notify() {
        for (let reciever of this.listeners) {
            if (!reciever) continue;
            reciever[0](this.value);
        }
    }
}

export function observed<T>(data: T): Observed<T> {
    return new Observed(data);
}

export class Ref {}

export class Container extends Observed<(Node | Ref)[]> {
    private subscriptions: (Cleaner<(Node | Ref)[]> | Cleaner<Node> | Cleaner<string> | Cleaner<number> | Cleaner<Symbol> | Cleaner<boolean>)[]
    private content: AcceptedNodes[]

    constructor() {
        super([]);
        this.subscriptions = [];
        this.content = [];
    }
    
    addContainer(node: Container): Cleaner<(Node | Ref)[]> {
        const ref = new Ref;
        let current = [...node.get()];
        this.value.push(ref, ...current);
        this.content.push(node);

        const cleaner = node.subscribe((val: (Node | Ref)[]) => {
            const index = this.value.indexOf(ref);
            this.remove(current);
            if (index < 0) {
                throw new Error("Container Ref has been removed!")
            } else {
                this.value.splice(index, 0, ...val);
            }

            current = [...val];
            cleaner.update([...current, ref]);
            this.notify();
        });

        cleaner.update([...current, ref]);
        this.subscriptions.push(cleaner);

        this.notify();
        return cleaner;
    }

    add(...nodes: AcceptedNodes[]) {
        for (let node of nodes) {
            this.content.push(node);
            if (node instanceof Ref) continue;
            if (node instanceof Container) {
                const ref = new Ref;
                let current = [...node.get()];
                this.value.push(ref, ...current);

                const cleaner = node.subscribe((val: (Node | Ref)[]) => {
                    const index = this.value.indexOf(ref);
                    this.remove(current);
                    if (index < 0) {
                        throw new Error("Container Ref has been removed!")
                    } else {
                        this.value.splice(index, 0, ...val);
                    }

                    current = [...val];
                    cleaner.update(current);
                    this.notify();
                });

                cleaner.update(current);
                this.subscriptions.push(cleaner);
                continue;
            }

            if (node instanceof Observed) {
                let current = stringToNode(node.get());
                this.value.push(current);

                const cleaner = node.subscribe((val: Stringable | Node) => {
                    const new_node = stringToNode(val);
                    this.replace(new_node, current);
                    current = new_node;
                    this.notify();
                });

                this.subscriptions.push(cleaner);

                continue;
            }

            this.value.push(stringToNode(node));
        }
        this.notify();
    }

    private remove(nodes: (Node | Ref)[]): void {
        for (const node of nodes) {
            if (node instanceof Ref) continue;
            const index = this.value.indexOf(node);
            if (index < 0) continue;
            delete this.value[index];
        }
        this.value = this.value.filter(n => n !== undefined);
    }

    removeNodes(...nodes: (Node | Ref)[]) {
        this.remove(nodes);
        this.notify();
    }

    private replace(current: Node, old: Node) {
        const index = this.value.indexOf(old);
        if (index < 0) return;
        this.value[index] = current;
    }

    clear() {
        for (const sub of this.subscriptions) {
            sub.execute(this);
        }
        this.value.length = 0;
        this.content.length = 0;
        this.subscriptions.length = 0;
    }

    private getContent() {
        return this.content;
    }

    swap(arr: Container) {
        const tmp = [...arr.getContent()];
        arr.clear();
        arr.add(...this.getContent());
        this.clear();
        this.add(...tmp);
        this.notify();
    }

}

function difference<T>(current: T[], next: T[]): number[] {
    const returnVal: number[] = []
    const maxIndex = Math.max(current.length, next.length);
    for (let i = 0; i < maxIndex; i++) {
        if (current[i] === next[i]) returnVal.push(i);
    }
    return returnVal;
}

class TemplateInstance {
    index: number
    container: Container | undefined
    cleaners: Cleaner<any>[]

    constructor(index: number) {
        this.index = index;
        this.cleaners = [];
    }

    with(container: Container) {
        this.container = container;
    }
}

export function foreach<T>(arr: Observed<T[]>, template: ((index: () => number, get: () => T, set: (val: T | undefined) => void, notify: () => void, subscribe: (fn: ((value: T) => boolean | void), clean?: () => void) => void) => Container)): Container {
    const container = new Container();
    let instances: TemplateInstance[] = [];

    let current = [...arr.get()];

    arr.subscribe((val) => {
        const diff = difference(current, val);
        let diffIndex = 0;

        for (let i = val.length; i < instances.length; i++) {
            instances[i].cleaners.forEach(c => c.execute(container));
            instances[i].cleaners.length = 0;
        }

        for (let i = 0; i < val.length; i++) {
            if (i == diff[diffIndex]) { diffIndex++; continue; }
            if (i < instances.length && instances[i]) {
                for (const c of instances[i].cleaners) {
                    c.execute(container)
                }
                instances[i].cleaners.length = 0
            };
            const oldIndex = current.indexOf(val[i], i);
            if (oldIndex >= 0) {
                const instance = instances[oldIndex];
                if (!instance.container) throw new Error("Template Instance without container!");

                instance.index = i;
                instances[i] = instance;

                for (const c of instances[oldIndex].cleaners) {
                    c.execute(container)
                }
                delete instances[oldIndex];
                
                const cleaner = container.addContainer(instance.container);
                instances[i].cleaners.push(cleaner);
            } else {
                const instance: TemplateInstance = new TemplateInstance(i)
                instance.with(template(
                    () => instance.index,
                    () => arr.get()[instance.index], 
                    (val) => {
                        if (val) {
                            const a = arr.get();
                            a[instance.index] = val; 
                            arr.set(a)
                        } else {
                            let a = arr.get();
                            delete a[instance.index];
                            a = a.filter(n => n !== undefined);
                            arr.set(a);
                        }
                    }, 
                    () => arr.notify(), 
                    (fn, clean) => instance.cleaners.push(arr.subscribe(
                        (val) => fn(val[instance.index]), clean
                    ))
                ));
                if (!instance.container) throw new Error("Template Instance without container!");
                instance.cleaners.push(container.addContainer(instance.container));
                if (!instance.cleaners.length) {
                    console.error("Template Instance without cleaners!");
                    continue;
                }
                instances.push(instance);
            }
        }

        instances = instances.filter(n => n !== undefined);
        current = [...val];
        return true;
    })

    for (let i = 0; i < current.length; i++) {
        const instance: TemplateInstance = new TemplateInstance(i)
        instance.with(template(
            () => instance.index,
            () => arr.get()[instance.index], 
            (val) => {
                if (val) {
                    const a = arr.get();
                    a[instance.index] = val; 
                    arr.set(a)
                } else {
                    let a = arr.get();
                    delete a[instance.index];
                    a = a.filter(n => n !== undefined);
                    arr.set(a);
                }
            }, 
            () => arr.notify(), 
            (fn, clean) => instance.cleaners.push(arr.subscribe(
                (val) => fn(val[instance.index]), clean
            ))
        ));
        if (!instance.container) throw new Error("Template Instance without container!");
        instance.cleaners.push(container.addContainer(instance.container));
        if (!instance.cleaners.length) {
            console.error("Template Instance without cleaners!");
            continue;
        }
        instances.push(instance);
    }

    return container;
}

function stringToNode(input: Node | Stringable): Node {
    if (!(input instanceof Node)) {
        const text = input.toString();
        if (text.startsWith("<!--") && text.endsWith("-->")) {
            input = new Comment(text.slice(4, text.length-3));
        } else input = new Text(text);
    }
    return input;
}

function appendNode(parent: Node | Container, child: AcceptedNodes): Cleaner<(Node | Ref)[]> | undefined {
    if (parent instanceof Container) {
        parent.add(child);
        return;
    }

    if (child instanceof Ref) return;

    if (child instanceof Container) {
        const ref = new Comment("Ref");
        let current = [...child.get()];

        for(let node of current) {
            if (node instanceof Ref) continue;
            parent.appendChild(node);
        }
        parent.appendChild(ref);

        const cleaner = child.subscribe((val: (Node | Ref)[]) => {
            
            for (const c of current) {
                if (c instanceof Ref) continue;
                parent.removeChild(c);
            }

            for (const v of val) {
                if (v instanceof Ref) continue;
                parent.insertBefore(v, ref);
            }

            current = [...val];
            cleaner.update([ref, ...current]);
        });

        cleaner.update([ref, ...current]);
        return cleaner;
    }

    if (child instanceof Observed) {
        let init_val = child.get();
        let current = parent.appendChild(stringToNode(init_val));

        child.subscribe((val) => {
            const new_child = stringToNode(val);
            parent.replaceChild(new_child, current);
            current = new_child;
        })

        return;
    }

    parent.appendChild(stringToNode(child));
    
}

export interface transitionOptions {
    show: Observed<boolean>, 
    enter: string, 
    enterFrom: string, 
    enterTo: string, 
    leave: string, 
    leaveFrom: string, 
    leaveTo: string, 
    chilren?: Observed<number>,
    beforeOpen?: () => void,
    afterOpen?: () => void,
    beforeClose?: () => void,
    afterClose?: () => void,
}

export function createTransition(
    options: transitionOptions,
    type: keyof HTMLElementTagNameMap, 
    attributes: {[key: string]: Stringable | ObservedStringable}, 
    ...nodes: AcceptedNodes[]
    ) {
    const active = new Observed(options.show.get());
    const wantsActive = new Observed(options.show.get());

    const baseClass = attributes.class ? (attributes.class instanceof Observed ? attributes.class : new Observed(attributes.class)) : new Observed("");
    const transitionClass = new Observed(`${options.show.get() ? options.enter + " " + options.enterTo : options.leave + " " + options.leaveTo}`);
    const divClass = new Observed(`${baseClass.get()} ${transitionClass.get()}`); 

    transitionClass.subscribe(c => divClass.set(`${baseClass.get()} ${c}`))
    baseClass.subscribe(c => divClass.set(`${c} ${transitionClass.get()}`));

    attributes.class = divClass;
    const div = create(type, attributes, ...nodes);

    wantsActive.subscribe(state => {
        if (!state && options.chilren && options.chilren.get() > 0) return;
        active.set(state);
    })

    if (options.chilren) options.chilren.subscribe((num) => {
        if (num < 1 && !wantsActive.get()) active.set(false);
    })

    options.show.subscribe(state => {
        if (state && !active.get()) {
            if (options.beforeOpen) options.beforeOpen();
            transitionClass.set(options.enter + " " + options.enterFrom);
            div.addEventListener('transitionend', (_) => {
                if (options.afterOpen) options.afterOpen();
            }, {once: true});
            wantsActive.set(true);
            setTimeout(() => transitionClass.set(options.enter + " " + options.enterTo), 1);
        }

        if (!state && active.get()) {
            if (options.beforeClose) options.beforeClose();
            transitionClass.set(options.leave + " " + options.leaveFrom);
            div.addEventListener('transitionend', (_) => {
                wantsActive.set(false);
                if (options.afterClose) options.afterClose();
            }, {once: true});
            transitionClass.set(options.leave + " " + options.leaveTo);
        }
    })

    return conditional(active, div);
}

export function debounce(fn: (...args: any[]) => void, timeout = 300){
    let timer: number;
    return (...args: any[]) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(args), timeout);
    };
}

export function create(
    type: keyof HTMLElementTagNameMap, 
    attributes: {[key: string]: Stringable | ObservedStringable}, 
    ...nodes: AcceptedNodes[]
    ) {
    
    const element = document.createElement(type);

    if (attributes) {
        for (const [attr, val] of Object.entries(attributes)) {
            if (val instanceof Observed) {
                let init_val = val.get();
                if (init_val) element.setAttribute(attr, init_val.toString());

                val.subscribe((value) => {
                    if (!value) {
                        element.removeAttribute(attr);
                        return;
                    }

                    element.setAttribute(attr, value.toString());
                })

            } else {
                if (!val) continue;
                element.setAttribute(attr, val.toString());
            }
        }
    }

    for (let node of nodes) {
        appendNode(element, node);
    }

    return element;
    
}

export function createSVG(
    type: keyof SVGElementTagNameMap, 
    attributes: {[key: string]: Stringable | ObservedStringable}, 
    ...nodes: AcceptedNodes[]
    ) {
    
    const element = document.createElementNS("http://www.w3.org/2000/svg", type);

    if (attributes) {
        for (const [attr, val] of Object.entries(attributes)) {
            if (val instanceof Observed) {
                let init_val = val.get();
                if (init_val) element.setAttribute(attr, init_val.toString());

                val.subscribe((value) => {
                    if (!value) {
                        element.removeAttribute(attr);
                        return;
                    }
                    
                    element.setAttribute(attr, value.toString());
                })

            } else {
                if (!val) continue;
                element.setAttribute(attr, val.toString());
            }
        }
    }

    for (let node of nodes) {
        appendNode(element, node);
    }

    return element;
    
}

export function container(...nodes: AcceptedNodes[]) {
    const container = new Container();
    container.add(...nodes);
    return container;
}

export function conditional(condition: Observed<boolean>, ...nodes: AcceptedNodes[]) {
    let comment = new Comment("conditional");
    let storage: Container = new Container();
    let container = new Container();
    let appended = condition.get();

    storage.add(comment);
    container.add(...nodes);

    if (!appended) container.swap(storage);

    condition.subscribe((state) => {
        if (appended && !state) {            
            container.swap(storage);
            appended = false;
        }

        if (!appended && state) {
            container.swap(storage);
            appended = true
        }

    })

    return container

}

const globalStore: Map<string, any> = new Map();
export function store(key: string, val?: any) {
    if (arguments.length > 1) {
        globalStore.set(key, val);
    }
    return globalStore.get(key);
}

//@ts-ignore
window.store = store;

export interface PageOptions {
    beforeMount?: (() => void), 
    afterMount?: (() => void), 
    beforeUnmount?: (() => void),
    afterUnmount?: (() => void),
}

interface Page {
    options: PageOptions
    frag: Container
}

export function page(options: PageOptions, ...nodes: AcceptedNodes[]): Page {
    const frag = new Container();

    frag.add(...nodes);

    return {
        options: options,
        frag: frag
    }

}

function resolveRoute(routes:  Map<string, (() => Page) | Lazy<Promise<{ default: (() => Page)}>>>, navguards: Map<string, (route: string, params: {[key: string]: string}) => boolean | string>, pathname: string): [string, (() => Page) | Lazy<Promise<{ default: (() => Page)}>>] | undefined {
    pathname = (pathname.endsWith("/") ? pathname : pathname + "/");
    const path = pathname.split("/");
    path.shift();

    for (let [route, loader] of routes) {
        const splits = route.split("/");
        splits.shift();

        let isValid: boolean = true;
        for (let i = 0; i < splits.length; i++) {
            if (splits[i].startsWith("*")) continue;
            if (splits[i] == path[i]) continue;
            if (i + 1 > path.length && splits[splits.length-1] == path[path.length-1]) continue;
            isValid = false;
            break;
        }

        if (!isValid) continue;
        const navGuard = navguards.get(route);
        if (navGuard) {
            const result = navGuard(pathname, calcParams(route, pathname.slice(0, pathname.length - 1)));
            if (!result) continue;
            if (typeof result === 'string') {
                const redirLoader = routes.get(result);
                if (redirLoader) return [result, redirLoader]
            }
        }
        return [route, loader];
    }
}

function calcParams(route: string, path: string): {[key: string]: string} {
    const splitPath = path.split("/");
    const splitRoute = route.split("/");
    const params: {[key: string]: string} = {};  

    for (let i = 0; i < splitRoute.length; i++) {
        if (!splitRoute[i].startsWith("*") || splitRoute[i] == "*") continue;
        const pId = splitRoute[i].slice(1);
        let data = splitPath[i];
        if (i + 1 == splitRoute.length) {
            splitPath.splice(0, i);
            data = splitPath.join("/");
        }
        params[pId] = data;
    }

    return params;
}

class Cleaner<T> {
    cont: Observed<T>;
    rec: [((value: T) => boolean | void), () => void]
    current: (Node | Ref)[];

    constructor(cont: Observed<T>, rec: [((value: T) => boolean | void), () => void]) {
        this.cont = cont;
        this.rec = rec;
        this.current = [];
    }

    update(current: (Node | Ref)[]) {
        this.current = current;
    }

    execute(root?: Node | Container) {
        this.cont.unsubscribe(this.rec[0]);
        this.rec[1]();

        if (!root) return;
        if (root instanceof Container) {
            root.removeNodes(...this.current)
        } else {
            for (let node of this.current) {
                if (node instanceof Ref) continue;
                root.removeChild(node);
            }
        }   
    }   

}

export class Lazy<T> {
    toLoad: (() => T)

    constructor(cb: (() => T)) {
        this.toLoad = cb;
    }

    load(): T {
        return this.toLoad();
    }

}

class Cache<K, V> {
    index: Map<K, V>;

    constructor() {
        this.index = new Map()
    }

    put(key: K, val: V) {
        this.index.set(key,  val);
    }

    has(key: K): boolean {
        return this.index.has(key);
    }

    get(key: K): V | undefined {
        const val = this.index.get(key);

        if (val) {
            this.index.delete(key);
            this.index.set(key, val);
        }

        return val;
    }

    size(): number {
        return this.index.size;
    }

    clear(count?: number) {
        if (!count) {
            this.index.clear();
            return;
        }
        const elementsToRemoveCount = Math.min(count, this.index.size);
        const keys = this.index.keys();
        for (let i = 0; i < elementsToRemoveCount; i++) {
            this.index.delete(keys.next().value);
        }
    }
}

export function lazy<T>(cb: (() => T)): Lazy<T> {
    return new Lazy(cb);
}

interface AppConfig {
    maxLoadedPages?: number
}

class App {
    root: HTMLElement
    loaders: Map<string, (() => Page) | Lazy<Promise<{ default: (() => Page)}>>>
    navguards: Map<string, (route: string, params: {[key: string]: string}) => boolean | string>
    pages: Cache<string, Page>
    current: Page | undefined;
    path: string | undefined;
    cleaner: Cleaner<(Node | Ref)[]> | undefined;
    config: AppConfig

    constructor(root: HTMLElement, config: AppConfig) {
        this.loaders = new Map();
        this.navguards = new Map();
        this.pages = new Cache();
        this.root = root;
        this.config = config;

    }

    page(path: string, page: (() => Page) | Lazy<Promise<{ default: (() => Page)}>>, navGuard?: (route: string, params: {[key: string]: string}) => boolean | string): App {
        this.loaders.set(path, page)
        if (navGuard) this.navguards.set(path, navGuard);
        return this;
    }

    start(): App {
        window.addEventListener("click", (evt) => {
            if (evt.defaultPrevented || evt.button !== 0 || evt.metaKey || evt.altKey || evt.ctrlKey || evt.shiftKey ) return;
            const a = evt.composedPath().find(el => el instanceof Node && el.nodeName.toUpperCase() === "A") as HTMLAnchorElement | undefined;
            
            if (!a) return;
            const href = a.href;

            if (a.target || (!href && !a.hasAttribute("state"))) return;

            const rel = (a.getAttribute("rel") || "").split(/\s+/);
            if (a.hasAttribute("download") || (rel && rel.includes("external"))) return;

            const url = new URL(href, window.location.origin);
            const loc = window.location;
            if (url.origin !== loc.origin) return;

            evt.preventDefault();

            this.getRoute(url.pathname, (page) => {
                if (!page) return;
                this.cleanup();
                window.history.pushState("", "", url);
                this.add(page);
            });
        });

        window.addEventListener("popstate", () => {
            this.getRoute(window.location.pathname, (page) => {
                if (!page) return;
                this.cleanup();
                this.add(page);
            });
        });

        this.getRoute(window.location.pathname, (page) => {
            if (!page) throw new Error(`The page for ${window.location.pathname} could not be resolved!`);
            this.add(page);
        });

        return this;
    }

    private cleanup() {
        if (!this.current) return;
        const before = this.current.options.beforeUnmount
        const after = this.current.options.afterUnmount
        if (before) before.call(this.root);
        if (this.cleaner) this.cleaner.execute(this.root);
        if (after) after.call(this.root);
    }

    private getRoute(path: string, cb: (page: [string, Page] | undefined) => void) {
        const route = resolveRoute(this.loaders, this.navguards, path);
        if (!route) throw new Error('No page exists for this url!');

        if (this.pages.has(route[0])) {
            cb([route[0], <Page>this.pages.get(route[0])]);
            return;
        }

        if (route[1] instanceof Lazy) {
            route[1].load().then((page) => {

                this.loaders.set(route[0], page.default);
                const resolved = page.default.call(this.root);

                this.pages.put(route[0], resolved);
                if (this.config.maxLoadedPages && this.pages.size() > this.config.maxLoadedPages) {
                    this.pages.clear(this.pages.size() - this.config.maxLoadedPages);
                }

                cb([route[0], resolved]);
            }).catch(() => cb(undefined));
        } else {
            const resolved = route[1].call(this.root);

            this.pages.put(route[0], resolved);
            if (this.config.maxLoadedPages && this.pages.size() > this.config.maxLoadedPages) {
                this.pages.clear(this.pages.size() - this.config.maxLoadedPages);
            }

            cb([route[0], resolved]);
        }
    }

    private routeInternal(path: string) {
        this.getRoute(path, (page) => {
            if (!page) return;
            this.cleanup();
            window.history.pushState("", "", path);
            this.add(page);
        });
    }

    route(route: string) {
        if (!route) return;

        const url = new URL(route, window.location.origin);
        const loc = window.location;
        if (url.origin !== loc.origin) {
            window.location.assign(url);
            return;
        };
    
        this.routeInternal(url.pathname);
    }

    private add(route: [string, Page]) {
        this.current = route[1];
        this.path = route[0];
        const before = this.current.options.beforeMount
        const after = this.current.options.afterMount
        if (before) before.call(this.root);
        this.cleaner = appendNode(this.root, route[1].frag);
        if (after) after.call(this.root);
    }

    getParams(): {[key: string]: string} {
        if (!this.path) return {};
        return calcParams(this.path, window.location.pathname);    
    }

}

export function createApp(root: HTMLElement, config: AppConfig) {
    return new App(root, config);
}