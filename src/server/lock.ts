/**
 * Serialises async work. Every state-changing operation on a match runs
 * through one of these so bids, timers and disconnects can never interleave
 * across `await` points.
 */
export class AsyncLock {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
