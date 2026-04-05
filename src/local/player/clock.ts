

type Listener = (ms: number) => void;

class PlayerClock {
  private listeners = new Set<Listener>();
  private ms = 0;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.ms);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get now(): number {
    return this.ms;
  }

  set(ms: number): void {
    if (ms === this.ms) return;
    this.ms = ms;
    for (const listener of this.listeners) listener(ms);
  }

  reset(): void {
    this.ms = 0;
  }
}

export const clock = new PlayerClock();

export function findWordAt(
  starts: Int32Array,
  ends: Int32Array,
  ms: number,
): number {
  if (starts.length === 0) return -1;

  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= ms) low = mid;
    else high = mid - 1;
  }

  if (starts[low] > ms) return -1;
  if (ends[low] > 0 && ms > ends[low]) return -1;
  return low;
}
