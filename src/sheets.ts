/**
 * Sheet (workspace) management for MrMarkdown.
 *
 * Each sheet owns its own list of open documents, folder roots, and active document,
 * allowing the user to switch between completely distinct contexts without opening
 * multiple windows.
 */

export interface SheetDocRef {
  path: string | null;
  name: string;
  defaultName?: string;
  customName?: boolean;
  savedSource: string;
  workingText: string;
  mtime: number;
  scroll?: { preview: number; edit: number };
  caret?: number;
}

export interface Sheet<T = any> {
  id: string;
  name: string;
  docs: T[];
  activeId: string | null; // path or doc identifier or index
  folderRoots: string[];
  expandedFolders: string[];
}

export interface StoredSheet {
  id: string;
  name: string;
  docs: Array<{
    path: string | null;
    name: string;
    workingText: string;
    savedSource: string;
    mtime: number;
  }>;
  activeIndex: number;
  folderRoots?: string[];
  expandedFolders?: string[];
}

export interface StoredSessionWithSheets {
  version: 2;
  activeSheetId: string;
  sheets: StoredSheet[];
}

let nextSheetNum = 1;

export function generateSheetId(): string {
  return 'sheet_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

export function createDefaultSheet<T = any>(name?: string): Sheet<T> {
  const num = nextSheetNum++;
  return {
    id: generateSheetId(),
    name: name || `Sheet ${num}`,
    docs: [],
    activeId: null,
    folderRoots: [],
    expandedFolders: [],
  };
}

export class SheetStore<T extends { path: string | null; name: string } = any> {
  private _sheets: Sheet<T>[] = [];
  private _activeSheetId: string = '';

  constructor(initialSheets?: Sheet<T>[], initialActiveId?: string) {
    if (initialSheets && initialSheets.length > 0) {
      this._sheets = [...initialSheets];
      this._activeSheetId = initialActiveId && this._sheets.some((s) => s.id === initialActiveId)
        ? initialActiveId
        : this._sheets[0].id;
    } else {
      const defaultSheet = createDefaultSheet<T>('Sheet 1');
      this._sheets = [defaultSheet];
      this._activeSheetId = defaultSheet.id;
    }
  }

  get sheets(): Sheet<T>[] {
    return this._sheets;
  }

  get activeSheetId(): string {
    return this._activeSheetId;
  }

  get activeSheet(): Sheet<T> {
    const s = this._sheets.find((sh) => sh.id === this._activeSheetId);
    if (!s) {
      if (this._sheets.length === 0) {
        const fallback = createDefaultSheet<T>('Sheet 1');
        this._sheets.push(fallback);
        this._activeSheetId = fallback.id;
        return fallback;
      }
      this._activeSheetId = this._sheets[0].id;
      return this._sheets[0];
    }
    return s;
  }

  addSheet(name?: string): Sheet<T> {
    const sheet = createDefaultSheet<T>(name);
    this._sheets.push(sheet);
    return sheet;
  }

  setActiveSheet(sheetId: string): boolean {
    const found = this._sheets.find((s) => s.id === sheetId);
    if (!found) return false;
    this._activeSheetId = sheetId;
    return true;
  }

  renameSheet(sheetId: string, newName: string): boolean {
    const trimmed = newName.trim();
    if (!trimmed) return false;
    const s = this._sheets.find((sh) => sh.id === sheetId);
    if (!s) return false;
    s.name = trimmed;
    return true;
  }

  removeSheet(sheetId: string): Sheet<T> | null {
    if (this._sheets.length <= 1) {
      // Cannot remove the only remaining sheet; reset it instead or prevent removal
      return null;
    }
    const idx = this._sheets.findIndex((s) => s.id === sheetId);
    if (idx === -1) return null;

    const [removed] = this._sheets.splice(idx, 1);
    if (this._activeSheetId === sheetId) {
      const nextIdx = Math.min(idx, this._sheets.length - 1);
      this._activeSheetId = this._sheets[nextIdx].id;
    }
    return removed;
  }

  /**
   * Reorder sheets: move `fromSheetId` right before or after `targetSheetId`.
   */
  moveSheetRelativeTo(fromSheetId: string, targetSheetId: string, after: boolean): boolean {
    if (fromSheetId === targetSheetId) return false;
    const fromIdx = this._sheets.findIndex((s) => s.id === fromSheetId);
    if (fromIdx === -1) return false;

    const [sheet] = this._sheets.splice(fromIdx, 1);
    let targetIdx = this._sheets.findIndex((s) => s.id === targetSheetId);
    if (targetIdx === -1) {
      this._sheets.splice(fromIdx, 0, sheet);
      return false;
    }

    if (after) targetIdx += 1;
    this._sheets.splice(targetIdx, 0, sheet);
    return true;
  }

  /**
   * Move a doc from source sheet to target sheet (Drag & Drop).
   * Note: This is a move, not a copy. It removes from source and appends to target.
   * If target already contains a doc with identical path (non-null), the move merges/avoids duplicate.
   */
  moveDoc(doc: T, fromSheetId: string, toSheetId: string): boolean {
    if (fromSheetId === toSheetId) return false;
    const fromSheet = this._sheets.find((s) => s.id === fromSheetId);
    const toSheet = this._sheets.find((s) => s.id === toSheetId);
    if (!fromSheet || !toSheet) return false;

    const docIdx = fromSheet.docs.indexOf(doc);
    if (docIdx === -1) return false;

    // Remove from source sheet
    fromSheet.docs.splice(docIdx, 1);

    // If destination already has the exact same doc reference or non-null path, avoid duplicate
    const existing = toSheet.docs.find(
      (d) => d === doc || (doc.path !== null && d.path === doc.path)
    );
    if (!existing) {
      toSheet.docs.push(doc);
    }

    return true;
  }

  /**
   * Find which sheet a document currently belongs to.
   */
  findSheetForDoc(doc: T): Sheet<T> | null {
    return this._sheets.find((s) => s.docs.includes(doc)) || null;
  }

  /**
   * Search all docs across all sheets matching a predicate.
   */
  findAllDocs(predicate: (doc: T, sheet: Sheet<T>) => boolean): Array<{ doc: T; sheet: Sheet<T> }> {
    const results: Array<{ doc: T; sheet: Sheet<T> }> = [];
    for (const sheet of this._sheets) {
      for (const doc of sheet.docs) {
        if (predicate(doc, sheet)) {
          results.push({ doc, sheet });
        }
      }
    }
    return results;
  }
}

/**
 * Migration helper: converts a legacy session (single docs array) or a multi-sheet session.
 */
export function migrateOrLoadSessionData<D extends { path: string | null; name: string }>(
  rawJson: string | null,
  docDeserializer: (stored: any) => D
): { sheets: Sheet<D>[]; activeSheetId: string } | null {
  if (!rawJson) return null;
  try {
    const data = JSON.parse(rawJson);
    if (!data || typeof data !== 'object') return null;

    // Version 2: Multi-sheet session
    if (data.version === 2 && Array.isArray(data.sheets)) {
      if (data.sheets.length === 0) {
        const defaultSheet = createDefaultSheet<D>('Sheet 1');
        return { sheets: [defaultSheet], activeSheetId: defaultSheet.id };
      }
      const sheets: Sheet<D>[] = data.sheets.map((s: StoredSheet) => {
        const docs = Array.isArray(s.docs) ? s.docs.map(docDeserializer) : [];
        const activeIdx = typeof s.activeIndex === 'number' && s.activeIndex >= 0 && s.activeIndex < docs.length ? s.activeIndex : 0;
        const targetDoc = docs[activeIdx] || docs[0] || null;
        return {
          id: s.id || generateSheetId(),
          name: s.name || 'Sheet',
          docs,
          activeId: targetDoc ? (targetDoc.path || targetDoc.name) : null,
          folderRoots: Array.isArray(s.folderRoots) ? s.folderRoots : [],
          expandedFolders: Array.isArray(s.expandedFolders) ? s.expandedFolders : [],
        };
      });
      const activeSheetId = data.activeSheetId && sheets.some((s) => s.id === data.activeSheetId)
        ? data.activeSheetId
        : sheets[0].id;
      return { sheets, activeSheetId };
    }

    // Version 1 / Legacy: Single list of docs
    if (Array.isArray(data.docs)) {
      const docs = data.docs.map(docDeserializer);
      const activeIdx = typeof data.activeIndex === 'number' && data.activeIndex >= 0 && data.activeIndex < docs.length ? data.activeIndex : 0;
      const targetDoc = docs[activeIdx] || docs[0] || null;
      const singleSheet: Sheet<D> = {
        id: generateSheetId(),
        name: 'Sheet 1',
        docs,
        activeId: targetDoc ? (targetDoc.path || targetDoc.name) : null,
        folderRoots: [],
        expandedFolders: [],
      };
      return { sheets: [singleSheet], activeSheetId: singleSheet.id };
    }

    return null;
  } catch {
    return null;
  }
}
