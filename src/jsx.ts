import type { Observed } from "./observed";

export const HTML_NS = "http://www.w3.org/1999/xhtml";
export const SVG_NS = "http://www.w3.org/2000/svg";
export const MATH_NS = "http://www.w3.org/1998/Math/MathML";

export type Namespace = typeof HTML_NS | typeof SVG_NS | typeof MATH_NS;

export type VIntrinsic = {
  kind: "intrinsic";
  type: IntrinsicTag;
  props: CreateAttributes;
  children: JsxChild;
};

export type VFragment = {
  kind: "fragment";
  children: JsxChild;
};

export type JsxChild =   
    | VIntrinsic
    | VFragment
    | Node
    | string 
    | number 
    | boolean 
    | symbol
    | null
    | undefined
    | JsxChild[]
    | Observed<VIntrinsic>
    | Observed<VFragment>
    | Observed<Node>
    | Observed<string> 
    | Observed<number> 
    | Observed<boolean> 
    | Observed<symbol>
    | Observed<JsxChild>
    | Observed<JsxChild[]>;


export type Listener<T> = (value: T) => void | boolean;
export type Cleanup = () => void;

export type AttrValue = 
    | string 
    | number 
    | boolean 
    | symbol
    | Observed<string> 
    | Observed<number> 
    | Observed<boolean> 
    | Observed<symbol> 
    | Array<AttrValue>;

export type StyleObject = Record<string, AttrValue>;
export type StyleValue = string | StyleObject | Observed<string> | Observed<StyleObject>;
export type EventHandler = (ev: Event) => any;
export type CreateAttributes = Record<string, AttrValue | EventHandler | StyleValue>;

export type Stringable = 
    | string 
    | number 
    | boolean 
    | symbol;

export type ObservedStringable = 
    | string 
    | number 
    | boolean 
    | symbol
    | Observed<string> 
    | Observed<number> 
    | Observed<boolean> 
    | Observed<symbol>;

export type HtmlTag = keyof HTMLElementTagNameMap;
export type SvgTag = keyof SVGElementTagNameMap;
export type MathTag = keyof MathMLElementTagNameMap;
export type IntrinsicTag = HtmlTag | SvgTag | MathTag;

type EventMap = HTMLElementEventMap & SVGElementEventMap;
type A = HTMLElementTagNameMap

type EventProps = {
    [K in keyof EventMap as `on${K}`]?: (ev: EventMap[K]) => any;
};

export type BaseProps = EventProps & {
    children?: JsxChild | JsxChild[];
    style?: StyleValue;
    class?: AttrValue;
    ref?: Observed<Element | undefined> | ((el: Element) => void);
    [attr: string]: unknown;
};

type HtmlIntrinsicElements = {
    [K in keyof HTMLElementTagNameMap]: BaseProps;
};

type SvgIntrinsicElements = {
    [K in keyof SVGElementTagNameMap]: BaseProps;
};

type MathIntrinsicElements = {
    [K in keyof MathMLElementTagNameMap]: BaseProps;
};

declare global {
    namespace JSX {
        type Element = JsxChild | JsxChild[];

        interface ElementChildrenAttribute {
            children: {};
        }

        interface IntrinsicElements extends HtmlIntrinsicElements, SvgIntrinsicElements, MathIntrinsicElements {}
    }
}

type ComponentChildren = {
    children?: JsxChild | JsxChild[];
};

export type Component<P = {}> = (props: P & ComponentChildren) => any;

export {};