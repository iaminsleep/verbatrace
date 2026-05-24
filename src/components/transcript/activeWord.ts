

let container: HTMLElement | null = null;
let current = -1;

const nodeAt = (index: number): HTMLElement | null =>
  index < 0 ? null : container?.querySelector<HTMLElement>(`[data-i="${index}"]`) ?? null;

export function setContainer(element: HTMLElement | null): void {
  container = element;
}

export function setActiveWord(index: number): void {
  if (index === current) return;
  nodeAt(current)?.removeAttribute("data-active");
  current = index;
  nodeAt(index)?.setAttribute("data-active", "true");
}

export function reapplyActiveWord(): void {
  if (current < 0) return;
  const node = nodeAt(current);
  if (node && node.getAttribute("data-active") !== "true") {
    node.setAttribute("data-active", "true");
  }
}

export function applyIfInRange(from: number, to: number): void {
  if (current < from || current > to) return;
  nodeAt(current)?.setAttribute("data-active", "true");
}
