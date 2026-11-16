import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  canSyncSilent,
  isConflictChange,
  isOwnSaveOrStale,
  markDeletedOnDisk,
  clearDeletedOnDisk,
  planManualReload,
  FsChangeDebouncer,
  WatchDocState,
} from './file-watch';

describe('file-watch synchronization logic', () => {
  const baseDoc: WatchDocState = {
    path: '/path/to/doc.md',
    savedSource: 'hello world',
    workingText: 'hello world',
    mtime: 1000,
    isDirty: false,
    isEditing: false,
    conflict: null,
  };

  describe('canSyncSilent and isConflictChange', () => {
    it('allows silent sync when doc is clean and not editing', () => {
      const doc = { ...baseDoc };
      expect(canSyncSilent(doc, 2000)).toBe(true);
      expect(isConflictChange(doc, 2000)).toBe(false);
    });

    it('blocks silent sync and raises conflict when user has unsaved edits', () => {
      const doc = { ...baseDoc, isDirty: true, workingText: 'hello modified' };
      expect(canSyncSilent(doc, 2000)).toBe(false);
      expect(isConflictChange(doc, 2000)).toBe(true);
    });

    it('blocks silent sync and raises conflict when user is actively editing', () => {
      const doc = { ...baseDoc, isEditing: true };
      expect(canSyncSilent(doc, 2000)).toBe(false);
      expect(isConflictChange(doc, 2000)).toBe(true);
    });

    it('ignores untitled document without path', () => {
      const doc = { ...baseDoc, path: null };
      expect(canSyncSilent(doc, 2000)).toBe(false);
      expect(isConflictChange(doc, 2000)).toBe(false);
    });
  });

  describe('isOwnSaveOrStale', () => {
    it('recognizes self-save or stale mtime when disk mtime <= local mtime', () => {
      expect(isOwnSaveOrStale(1000, 1000)).toBe(true);
      expect(isOwnSaveOrStale(1000, 999)).toBe(true);
      expect(isOwnSaveOrStale(1000, 1001)).toBe(false);
    });
  });

  describe('deleted file handling', () => {
    it('marks doc as deletedOnDisk without wiping memory buffer', () => {
      const doc = { ...baseDoc, deletedOnDisk: false };
      const changed = markDeletedOnDisk(doc);
      expect(changed).toBe(true);
      expect(doc.deletedOnDisk).toBe(true);
      expect(doc.workingText).toBe('hello world'); // buffer preserved

      // Second call returns false (idempotent)
      expect(markDeletedOnDisk(doc)).toBe(false);
    });

    it('clears deletedOnDisk when file is restored', () => {
      const doc = { ...baseDoc, deletedOnDisk: true };
      const changed = clearDeletedOnDisk(doc);
      expect(changed).toBe(true);
      expect(doc.deletedOnDisk).toBe(false);
      expect(clearDeletedOnDisk(doc)).toBe(false);
    });
  });

  describe('planManualReload', () => {
    it('refreshes both doc and tree when doc is clean and folder is open', () => {
      const plan = planManualReload(true, false, true);
      expect(plan.reloadDoc).toBe(true);
      expect(plan.refreshTree).toBe(true);
    });

    it('protects unsaved doc by reloading only folder tree', () => {
      const plan = planManualReload(true, true, true);
      expect(plan.reloadDoc).toBe(false); // protect buffer!
      expect(plan.refreshTree).toBe(true);
    });

    it('refreshes folder tree even if no doc is currently open', () => {
      const plan = planManualReload(false, false, true);
      expect(plan.reloadDoc).toBe(false);
      expect(plan.refreshTree).toBe(true);
    });

    it('reloads only doc when no folder is open', () => {
      const plan = planManualReload(true, false, false);
      expect(plan.reloadDoc).toBe(true);
      expect(plan.refreshTree).toBe(false);
    });
  });

  describe('FsChangeDebouncer', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('debounces rapid events into a single call after delay', async () => {
      let callCount = 0;
      const debouncer = new FsChangeDebouncer(async () => {
        callCount++;
      }, 200);

      // 50 rapid notifications
      for (let i = 0; i < 50; i++) {
        debouncer.notify();
        vi.advanceTimersByTime(10);
      }

      // At 190ms after last event: not yet called
      vi.advanceTimersByTime(180);
      expect(callCount).toBe(0);

      // At 200ms after last event: called exactly once
      vi.advanceTimersByTime(20);
      await Promise.resolve();
      expect(callCount).toBe(1);
    });

    it('prevents concurrent executions and runs pending once completed', async () => {
      let activeRuns = 0;
      let maxConcurrent = 0;
      let totalRuns = 0;

      let resolveSlowRun: (() => void) | undefined;
      const debouncer = new FsChangeDebouncer(async () => {
        activeRuns++;
        totalRuns++;
        maxConcurrent = Math.max(maxConcurrent, activeRuns);
        await new Promise<void>((resolve) => {
          resolveSlowRun = resolve;
        });
        activeRuns--;
      }, 200);

      // Trigger first run
      debouncer.notify();
      vi.advanceTimersByTime(200);
      expect(activeRuns).toBe(1);

      // Trigger another event while first is running
      debouncer.notify();
      vi.advanceTimersByTime(200);
      // Still 1 running, not 2 concurrently!
      expect(activeRuns).toBe(1);
      expect(maxConcurrent).toBe(1);

      // Finish first run
      resolveSlowRun?.();
      await vi.advanceTimersByTimeAsync(0);

      // Second run is scheduled after delay
      await vi.advanceTimersByTimeAsync(200);
      expect(activeRuns).toBe(1);
      resolveSlowRun?.();
      await vi.advanceTimersByTimeAsync(0);

      expect(activeRuns).toBe(0);
      expect(totalRuns).toBe(2);
      expect(maxConcurrent).toBe(1);
    });
  });
});
