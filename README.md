# ObservedTS

ObservedTS is a TypeScript-based web framework designed around events. It provides a set of utilities and classes to create and manage a web application.

## Getting started

To get started use the createApp to create the application and bind it to a root element.

```TS
function createApp(root: HTMLElement, config: AppConfig): App
```

After the app is created you can start it by calling the start function on the created app.

```TS
function start(): App
```

To add pages to your app there's the page function. This function takes in a path and a Page provider (Which can be lazily loaded).

```TS
function page(path: string, page: (() => Page)): App
```

```TS
function page(path: string, page: Lazy<Promise<{ default: (() => Page)}>>): App
```

There is also the ability to add navguards to the routing which can allow, prevent or redirect the current routing.

```TS
navGuard?: (route: string, params: {[key: string]: string}) => boolean | string
```

### Example
A simple single page.
```TS
import { createApp, create, page } from 'observedts'
const root = document.querySelector("body");

const pageProvider = () => page({}, create("h1", {}, "Hello World!")) //Creates a page with a Hello World! header

const app = createApp(root, {}) //Create the app and attach it to the body
    .page("/", pageProvider) //Adds page to the base route
    .start(); //Starts the app
```

## Creating Elements

To create a basic element you use the create function.

```TS
function create(
    type: keyof HTMLElementTagNameMap, 
    attributes: {[key: string]: Stringable | ObservedStringable}, 
    ...nodes: AcceptedNodes[]
)
```

To create elements for an svg there is the createSVG function.

```TS
function createSVG(
    type: keyof SVGElementTagNameMap, 
    attributes: {[key: string]: Stringable | ObservedStringable}, 
    ...nodes: AcceptedNodes[]
)
```

### Example

```TS
create("h1", {class: "m-3"}, "Hello World!");
```

## Using Observers

You can create an observer by using the observed function or class.

```TS
const count = observed(0);
```
```TS
const count = new Observed<number>(0);
```

You can subscribe to changes using the subscribe method.

```TS
count.subscribe(newValue => {
    console.log(`Count changed to: ${newValue}`);
});
```

You can also retrieve the current value using the get method.

```TS
console.log(`Count currently is: ${count.get()}`);
```

You can update the observed value by calling the set method.

```TS
count.set(1); // Updates the value to 1 and triggers the subscription callback
```

If you're working with nested values you can use the notify method to inform abount nested changes without having to set the value again.

```TS
const nestedData = observed({a: 10, b:20});

nestedData.get().b = 30;
nestedData.notify();
```

## Containers

You can create an container by using the container function or class.

```TS
const container = container();
```
```TS
const container = new Container();
```

You can add nodes to a container using the add method.

```TS
container.add(create("h1", {class: "m-3"}, "Hello World!"));
```

You can remove nodes in a container using the removeNodes method.

```TS
const header = create("h1", {class: "m-3"}, "Hello World!");
container.add(header);

...

container.removeNodes(header);
```

You can clear the entire container using the clear method.

```TS
container.clear();
```

You can swap the contents between 2 containers using the swap method

```TS
container.swap(container2)
```

## Dynamic Arrays

You can use the foreach function to instantiate a template for each element in the array.

```TS
export function foreach<T>(
    arr: Observed<T[]>, 
    template: ((
        index: () => number, 
        get: () => T, 
        set: (val: T | undefined) => void, 
        notify: () => void, 
        subscribe: (fn: ((value: T) => boolean | void), 
        clean?: () => void) => void
    ) => Container)
): Container;
```

The template instance has access to the same functions as a normal observed variable, but it also has access to its index and an optional cleanup method.

### Example

```TS
foreach(nav, (_, g) => container(
    create('li', {class: "relative mt-6"},
        create("h2", {class: "text-xs font-semibold text-zinc-900 dark:text-white"}, g().name),
        create("ul", {role: "list", class: "relative mt-3 ml-2 space-y-3 lg:space-y-2 border-l"},
            ...
        )
    )  
))
```

## Utility Functions

There is a conditional function that helps you create a container which is only visible when the condition is met.

```TS
function conditional(condition: Observed<boolean>, ...nodes: AcceptedNodes[]);
```

There is a createTransition funtion that helps create a conditional container with a smooth animation.

```TS
 function createTransition(
    options: transitionOptions,
    type: keyof HTMLElementTagNameMap, 
    attributes: {[key: string]: Stringable | ObservedStringable}, 
    ...nodes: AcceptedNodes[]
)
```

There is a store function to store data globally.

```TS 
function store(key: string, val?: any)
```

There is a debounce function to debounce input.

```TS
function debounce(fn: (...args: any[]) => void, timeout = 300)
```

There is a lazy function to lazy load data.

```TS
function lazy<T>(cb: (() => T)): Lazy<T>
```