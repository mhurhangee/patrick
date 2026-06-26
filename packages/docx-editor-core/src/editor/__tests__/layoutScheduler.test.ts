import { describe, test, expect } from 'bun:test';
import type { EditorState } from 'prosemirror-state';
import { createLayoutScheduler } from '../layoutScheduler';

// The scheduler only passes `state` through to `run` — it never inspects it —
// so a tagged stub stands in for a real EditorState in these tests.
const st = (tag: string): EditorState => ({ tag }) as unknown as EditorState;

/** A manually-pumped frame queue so tests control when the "rAF" fires. */
function manualFrames() {
  const queue: Array<() => void> = [];
  const cancelled = new Set<number>();
  let next = 1;
  return {
    schedule: (cb: () => void): number => {
      const handle = next++;
      queue.push(() => {
        if (!cancelled.has(handle)) cb();
      });
      return handle;
    },
    cancel: (handle: number): void => {
      cancelled.add(handle);
    },
    /** Fire all queued frames. */
    flush: () => {
      const pending = queue.splice(0);
      for (const fn of pending) fn();
    },
    size: () => queue.length,
  };
}

describe('createLayoutScheduler', () => {
  test('coalesces a burst into one run with the latest state', () => {
    const runs: string[] = [];
    const frames = manualFrames();
    const scheduler = createLayoutScheduler(
      (s) => runs.push((s as unknown as { tag: string }).tag),
      frames.schedule,
      frames.cancel
    );

    scheduler.schedule(st('a'));
    scheduler.schedule(st('b'));
    scheduler.schedule(st('c'));

    // Nothing runs until the frame fires; only one frame was queued.
    expect(runs).toEqual([]);
    expect(frames.size()).toBe(1);

    frames.flush();
    expect(runs).toEqual(['c']); // latest state wins
  });

  test('a new burst after the frame fires schedules a fresh frame', () => {
    const runs: string[] = [];
    const frames = manualFrames();
    const scheduler = createLayoutScheduler(
      (s) => runs.push((s as unknown as { tag: string }).tag),
      frames.schedule,
      frames.cancel
    );

    scheduler.schedule(st('a'));
    frames.flush();
    scheduler.schedule(st('b'));
    frames.flush();

    expect(runs).toEqual(['a', 'b']);
  });

  test('synchronous frame stub runs immediately and deterministically', () => {
    const runs: string[] = [];
    const scheduler = createLayoutScheduler(
      (s) => runs.push((s as unknown as { tag: string }).tag),
      (cb) => {
        cb();
        return 0;
      },
      () => {}
    );

    scheduler.schedule(st('x'));
    expect(runs).toEqual(['x']);
  });

  test('cancel drops the pending frame', () => {
    const runs: string[] = [];
    const frames = manualFrames();
    const scheduler = createLayoutScheduler(
      (s) => runs.push((s as unknown as { tag: string }).tag),
      frames.schedule,
      frames.cancel
    );

    scheduler.schedule(st('a'));
    scheduler.cancel();
    frames.flush();

    expect(runs).toEqual([]);
  });

  test('schedule works again after cancel', () => {
    const runs: string[] = [];
    const frames = manualFrames();
    const scheduler = createLayoutScheduler(
      (s) => runs.push((s as unknown as { tag: string }).tag),
      frames.schedule,
      frames.cancel
    );

    scheduler.schedule(st('a'));
    scheduler.cancel();
    scheduler.schedule(st('b'));
    frames.flush();

    expect(runs).toEqual(['b']);
  });
});
