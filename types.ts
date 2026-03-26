import type { Observed } from "./observed";
import type { Container, Ref } from "./container";

export type Listener<T> = (value: T) => void | boolean;
export type Cleanup = () => void;

export type Stringable = string | number | boolean | symbol;
export type ObservedStringable = Observed<boolean> | Observed<string> | Observed<number> | Observed<symbol>

export type AttrValue = Stringable | ObservedStringable;

export type EventHandler = (ev: Event) => any;

export type StyleObject = Record<string, Stringable | Observed<Stringable>>;
export type StyleValue = string | StyleObject | Observed<string | StyleObject>;

export type CreateAttributes = Record<string, AttrValue | EventHandler | StyleValue>;

export type DomChild =
  | Node
  | Ref
  | Container
  | Observed<Node>
  | ObservedStringable
  | Stringable;
