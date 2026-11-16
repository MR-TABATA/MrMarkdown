/**
 * File watcher synchronization and conflict detection logic.
 */

export interface WatchDocState {
  path: string | null;
  savedSource: string;
  workingText: string;
  mtime: number;
  isDirty: boolean;
  isEditing: boolean;
  deletedOnDisk?: boolean;
  conflict?: { content: string; mtime: number } | null;
}

/**
 * Returns true if the on-disk mtime indicates an external change that can be
 * silently synchronized (user has no unsaved edits and is not actively editing).
 */
export function canSyncSilent(doc: WatchDocState, diskMtime: number): boolean {
  if (!doc.path) return false;
  return diskMtime > doc.mtime && !doc.isDirty && !doc.isEditing;
}

/**
 * Returns true if the on-disk mtime indicates an external change that conflicts
 * with local unsaved edits or active editing.
 */
export function isConflictChange(doc: WatchDocState, diskMtime: number): boolean {
  if (!doc.path) return false;
  return diskMtime > doc.mtime && (doc.isDirty || doc.isEditing);
}

/**
 * Returns true if the disk mtime is less than or equal to local mtime
 * (e.g. event triggered by our own save or already processed).
 */
export function isOwnSaveOrStale(docMtime: number, diskMtime: number): boolean {
  return diskMtime <= docMtime;
}

/**
 * Handles detection of a deleted file on disk. Protects the in-memory buffer
 * and marks the document state.
 */
export function markDeletedOnDisk(doc: { deletedOnDisk?: boolean }): boolean {
  if (!doc.deletedOnDisk) {
    doc.deletedOnDisk = true;
    return true; // state changed
  }
  return false;
}

/**
 * Handles restoration of a file on disk.
 */
export function clearDeletedOnDisk(doc: { deletedOnDisk?: boolean }): boolean {
  if (doc.deletedOnDisk) {
    doc.deletedOnDisk = false;
    return true; // state changed
  }
  return false;
}

/**
 * Decision on manual reload (Cmd+R):
 * - If document has unsaved edits, do NOT reload document content (to protect edits),
 *   but DO refresh folder tree if a folder is open.
 * - Returns what actions should be performed.
 */
export function planManualReload(hasOpenDoc: boolean, isDocDirty: boolean, hasFolder: boolean): {
  reloadDoc: boolean;
  refreshTree: boolean;
} {
  return {
    reloadDoc: hasOpenDoc && !isDocDirty,
    refreshTree: hasFolder,
  };
}

/**
 * Debouncer with concurrency guard to coalesce multiple rapid filesystem events
 * into a single execution after quiet period, preventing concurrent executions.
 */
export class FsChangeDebouncer {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private isProcessing = false;
  private pending = false;
  private readonly delayMs: number;
  private readonly runner: () => Promise<void>;

  constructor(runner: () => Promise<void>, delayMs = 200) {
    this.runner = runner;
    this.delayMs = delayMs;
  }

  notify(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => this.trigger(), this.delayMs);
  }

  private async trigger(): Promise<void> {
    this.timer = undefined;
    if (this.isProcessing) {
      this.pending = true;
      return;
    }
    this.isProcessing = true;
    try {
      await this.runner();
    } finally {
      this.isProcessing = false;
      if (this.pending) {
        this.pending = false;
        this.timer = setTimeout(() => this.trigger(), this.delayMs);
      }
    }
  }

  cancel(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.pending = false;
  }

  isActive(): boolean {
    return this.timer !== undefined || this.isProcessing || this.pending;
  }
}
