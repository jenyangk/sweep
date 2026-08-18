// Minimal DOM helpers. No framework, no bloat.

type Props = {
  class?: string;
  id?: string;
  text?: string;
  html?: string;
  type?: string;
  href?: string;
  title?: string;
  value?: string;
  ariaLabel?: string;
  ariaLive?: string;
  role?: string;
  accept?: string;
  multiple?: boolean;
  hidden?: boolean;
  dataset?: Record<string, string>;
  onClick?: (e: MouseEvent) => void;
  onChange?: (e: Event) => void;
  style?: Partial<CSSStyleDeclaration>;
};

type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props,
  children?: Child | Child[],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props) {
    if (props.class) node.className = props.class;
    if (props.id) node.id = props.id;
    if (props.text) node.textContent = props.text;
    if (props.html) node.innerHTML = props.html;
    if (props.type) (node as HTMLInputElement).type = props.type;
    if (props.href) (node as HTMLAnchorElement).href = props.href;
    if (props.title) node.title = props.title;
    if (props.value) (node as HTMLInputElement).value = props.value;
    if (props.ariaLabel) node.setAttribute("aria-label", props.ariaLabel);
    if (props.ariaLive) node.setAttribute("aria-live", props.ariaLive);
    if (props.role) node.setAttribute("role", props.role);
    if (props.accept) (node as HTMLInputElement).setAttribute("accept", props.accept);
    if (props.multiple) (node as HTMLInputElement).multiple = true;
    if (props.hidden) node.hidden = true;
    if (props.dataset) {
      for (const [k, v] of Object.entries(props.dataset)) {
        node.dataset[k] = v;
      }
    }
    if (props.onClick) node.addEventListener("click", props.onClick as EventListener);
    if (props.onChange) node.addEventListener("change", props.onChange);
    if (props.style) Object.assign(node.style, props.style);
  }
  if (children != null) {
    const list = Array.isArray(children) ? children : [children];
    for (const c of list) {
      if (c == null || c === false) continue;
      if (typeof c === "string") {
        if (c.startsWith("<")) {
          // HTML fragment (inline SVG icons)
          node.insertAdjacentHTML("beforeend", c);
        } else {
          node.append(document.createTextNode(c));
        }
      } else {
        node.append(c);
      }
    }
  }
  return node;
}

export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function on<K extends keyof DocumentEventMap>(
  target: EventTarget,
  event: K,
  handler: (e: DocumentEventMap[K]) => void,
): () => void {
  target.addEventListener(event, handler as EventListener);
  return () => target.removeEventListener(event, handler as EventListener);
}