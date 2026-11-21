import { describe, expect, it } from 'vitest';
import {
  migrateOrLoadSessionData,
  SheetStore,
} from './sheets';

interface MockDoc {
  path: string | null;
  name: string;
}

describe('SheetStore', () => {
  it('initializes with a default Sheet 1', () => {
    const store = new SheetStore<MockDoc>();
    expect(store.sheets.length).toBe(1);
    expect(store.sheets[0].name).toBe('Sheet 1');
    expect(store.activeSheetId).toBe(store.sheets[0].id);
    expect(store.activeSheet).toBe(store.sheets[0]);
  });

  it('adds new sheets with auto-incremented names', () => {
    const store = new SheetStore<MockDoc>();
    const s2 = store.addSheet();
    expect(store.sheets.length).toBe(2);
    expect(s2.name).toMatch(/^Sheet \d+$/);

    const s3 = store.addSheet('Custom Sheet');
    expect(store.sheets.length).toBe(3);
    expect(s3.name).toBe('Custom Sheet');
  });

  it('switches active sheet', () => {
    const store = new SheetStore<MockDoc>();
    const s2 = store.addSheet('Work');
    expect(store.setActiveSheet(s2.id)).toBe(true);
    expect(store.activeSheetId).toBe(s2.id);
    expect(store.activeSheet.name).toBe('Work');

    expect(store.setActiveSheet('non_existent')).toBe(false);
  });

  it('renames a sheet', () => {
    const store = new SheetStore<MockDoc>();
    const sheet = store.sheets[0];
    expect(store.renameSheet(sheet.id, 'Personal')).toBe(true);
    expect(sheet.name).toBe('Personal');

    // Blank name rejected
    expect(store.renameSheet(sheet.id, '   ')).toBe(false);
    expect(sheet.name).toBe('Personal');
  });

  it('removes a sheet and adjusts active sheet', () => {
    const store = new SheetStore<MockDoc>();
    const s1 = store.sheets[0];
    const s2 = store.addSheet('Sheet 2');
    const s3 = store.addSheet('Sheet 3');

    store.setActiveSheet(s2.id);
    const removed = store.removeSheet(s2.id);
    expect(removed).toBe(s2);
    expect(store.sheets.length).toBe(2);
    expect(store.sheets.map((s) => s.id)).toContain(s3.id);
    // Active sheet moves to s3 or s1
    expect(store.activeSheetId).not.toBe(s2.id);

    // Cannot remove the last remaining sheet
    store.removeSheet(s1.id);
    expect(store.sheets.length).toBe(1);
    expect(store.removeSheet(store.sheets[0].id)).toBeNull();
    expect(store.sheets.length).toBe(1);
  });

  it('reorders sheets with moveSheetRelativeTo', () => {
    const store = new SheetStore<MockDoc>();
    const s1 = store.sheets[0];
    const s2 = store.addSheet('Sheet 2');
    const s3 = store.addSheet('Sheet 3');

    // Move s1 after s2
    expect(store.moveSheetRelativeTo(s1.id, s2.id, true)).toBe(true);
    expect(store.sheets.map((s) => s.id)).toEqual([s2.id, s1.id, s3.id]);

    // Move s3 before s2
    expect(store.moveSheetRelativeTo(s3.id, s2.id, false)).toBe(true);
    expect(store.sheets.map((s) => s.id)).toEqual([s3.id, s2.id, s1.id]);
  });

  it('moves document from one sheet to another (Drag & Drop)', () => {
    const store = new SheetStore<MockDoc>();
    const s1 = store.sheets[0];
    const s2 = store.addSheet('Destination');

    const docA: MockDoc = { path: '/tmp/a.md', name: 'a.md' };
    const docB: MockDoc = { path: '/tmp/b.md', name: 'b.md' };
    s1.docs.push(docA, docB);

    // Move docA from s1 to s2
    const ok = store.moveDoc(docA, s1.id, s2.id);
    expect(ok).toBe(true);
    expect(s1.docs).toEqual([docB]);
    expect(s2.docs).toEqual([docA]);

    // Destination already has duplicate doc -> merges without duplicating
    s1.docs.push(docA);
    const ok2 = store.moveDoc(docA, s1.id, s2.id);
    expect(ok2).toBe(true);
    expect(s1.docs).toEqual([docB]);
    expect(s2.docs.length).toBe(1); // Not duplicated
  });

  it('removes sheets safely from first, middle, or last position and transitions active sheet correctly', () => {
    // 1. Remove middle sheet (s2)
    const store = new SheetStore<MockDoc>();
    const s1 = store.sheets[0];
    const s2 = store.addSheet('Sheet 2');
    const s3 = store.addSheet('Sheet 3');
    store.setActiveSheet(s2.id);

    const removed2 = store.removeSheet(s2.id);
    expect(removed2?.id).toBe(s2.id);
    expect(store.sheets.map((s) => s.id)).toEqual([s1.id, s3.id]);
    expect(store.activeSheetId).toBe(s3.id); // transitions to next adjacent sheet

    // 2. Remove last sheet (s3)
    const removed3 = store.removeSheet(s3.id);
    expect(removed3?.id).toBe(s3.id);
    expect(store.sheets.map((s) => s.id)).toEqual([s1.id]);
    expect(store.activeSheetId).toBe(s1.id);

    // 3. Remove only remaining sheet -> returns null (cannot remove the only sheet)
    const cannotRemove = store.removeSheet(s1.id);
    expect(cannotRemove).toBeNull();
    expect(store.sheets.length).toBe(1);
    expect(store.activeSheetId).toBe(s1.id);

    // 4. Remove first sheet when active
    const store2 = new SheetStore<MockDoc>();
    const shA = store2.sheets[0];
    const shB = store2.addSheet('Sheet B');
    store2.setActiveSheet(shA.id);
    const removedA = store2.removeSheet(shA.id);
    expect(removedA?.id).toBe(shA.id);
    expect(store2.activeSheetId).toBe(shB.id);
  });

  it('finds docs across all sheets', () => {
    const store = new SheetStore<MockDoc>();
    const s1 = store.sheets[0];
    const s2 = store.addSheet('Docs');

    const doc1: MockDoc = { path: '/a/readme.md', name: 'readme.md' };
    const doc2: MockDoc = { path: '/b/readme.md', name: 'readme.md' };
    s1.docs.push(doc1);
    s2.docs.push(doc2);

    const matches = store.findAllDocs((d) => d.name === 'readme.md');
    expect(matches.length).toBe(2);
    expect(matches[0].sheet).toBe(s1);
    expect(matches[1].sheet).toBe(s2);
  });
});

describe('migrateOrLoadSessionData', () => {
  const deserializer = (raw: any): MockDoc => ({
    path: raw.path ?? null,
    name: raw.name ?? 'untitled',
  });

  it('migrates legacy v1 session (single docs list)', () => {
    const legacy = JSON.stringify({
      docs: [
        { path: '/path/1.md', name: '1.md' },
        { path: null, name: 'untitled' },
      ],
      activeIndex: 1,
    });

    const result = migrateOrLoadSessionData<MockDoc>(legacy, deserializer);
    expect(result).not.toBeNull();
    expect(result!.sheets.length).toBe(1);
    expect(result!.sheets[0].name).toBe('Sheet 1');
    expect(result!.sheets[0].docs.length).toBe(2);
    expect(result!.sheets[0].activeId).toBe('untitled');
  });

  it('loads version 2 multi-sheet session', () => {
    const v2 = JSON.stringify({
      version: 2,
      activeSheetId: 's2',
      sheets: [
        {
          id: 's1',
          name: 'Project A',
          docs: [{ path: '/a.md', name: 'a.md' }],
          activeIndex: 0,
          folderRoots: ['/dir/a'],
        },
        {
          id: 's2',
          name: 'Project B',
          docs: [{ path: '/b.md', name: 'b.md' }],
          activeIndex: 0,
          folderRoots: ['/dir/b'],
        },
      ],
    });

    const result = migrateOrLoadSessionData<MockDoc>(v2, deserializer);
    expect(result).not.toBeNull();
    expect(result!.sheets.length).toBe(2);
    expect(result!.activeSheetId).toBe('s2');
    expect(result!.sheets[0].name).toBe('Project A');
    expect(result!.sheets[1].name).toBe('Project B');
    expect(result!.sheets[1].folderRoots).toEqual(['/dir/b']);
  });

  it('handles edge-cases and corrupt inputs when migrating or loading sessions', () => {
    // 1. Broken / invalid JSON
    expect(migrateOrLoadSessionData('{ broken json', deserializer)).toBeNull();

    // 2. Empty string
    expect(migrateOrLoadSessionData('', deserializer)).toBeNull();

    // 3. Null or non-object
    expect(migrateOrLoadSessionData('null', deserializer)).toBeNull();
    expect(migrateOrLoadSessionData('12345', deserializer)).toBeNull();

    // 4. Legacy session with out-of-range activeIndex
    const outOfRange = JSON.stringify({
      docs: [{ path: '/1.md', name: '1.md' }],
      activeIndex: 99,
    });
    const resOutOfRange = migrateOrLoadSessionData<MockDoc>(outOfRange, deserializer);
    expect(resOutOfRange).not.toBeNull();
    expect(resOutOfRange!.sheets[0].activeId).toBe('/1.md'); // falls back to docs[0].path

    // 5. Legacy session with negative activeIndex and empty docs
    const emptyDocs = JSON.stringify({
      docs: [],
      activeIndex: -1,
    });
    const resEmpty = migrateOrLoadSessionData<MockDoc>(emptyDocs, deserializer);
    expect(resEmpty).not.toBeNull();
    expect(resEmpty!.sheets[0].docs).toEqual([]);
    expect(resEmpty!.sheets[0].activeId).toBeNull();

    // 6. Version 2 session with empty sheets array
    const emptyV2 = JSON.stringify({
      version: 2,
      activeSheetId: 'none',
      sheets: [],
    });
    const resV2Empty = migrateOrLoadSessionData<MockDoc>(emptyV2, deserializer);
    expect(resV2Empty).not.toBeNull();
    expect(resV2Empty!.sheets.length).toBe(1); // falls back to a clean default sheet

    // 7. Version 2 session with out-of-range activeIndex
    const v2OutOfRange = JSON.stringify({
      version: 2,
      activeSheetId: 's1',
      sheets: [
        {
          id: 's1',
          name: 'Sheet 1',
          docs: [{ path: '/doc.md', name: 'doc.md' }],
          activeIndex: -5,
        },
      ],
    });
    const resV2Oor = migrateOrLoadSessionData<MockDoc>(v2OutOfRange, deserializer);
    expect(resV2Oor!.sheets[0].activeId).toBe('/doc.md'); // falls back to docs[0].path
  });
});
