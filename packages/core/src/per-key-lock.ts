export class PerKeyLock {
  private queues: Map<string, (() => void)[]> = new Map();

  async withLock<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
    await this.acquire(name);
    try {
      return await fn();
    } finally {
      this.release(name);
    }
  }

  private acquire(name: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const queue = this.queues.get(name) ?? [];
      queue.push(resolve);
      this.queues.set(name, queue);
      if (queue.length === 1) {
        resolve();
      }
    });
  }

  private release(name: string): void {
    const queue = this.queues.get(name);
    if (!queue) return;
    queue.shift();
    if (queue.length > 0) {
      queue[0]?.();
    }
  }
}
