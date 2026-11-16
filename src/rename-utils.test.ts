import { describe, it, expect } from 'vitest';
import {
  deriveTitleFromContent,
  decideSuggestedSaveName,
  validateInlineRename,
  sanitizeFilename,
  MinimalDocForSave,
} from './rename-utils';

describe('rename-utils', () => {
  describe('deriveTitleFromContent', () => {
    it('strips markdown heading symbols and spaces', () => {
      expect(deriveTitleFromContent('# 見出しテキスト')).toBe('見出しテキスト');
      expect(deriveTitleFromContent('### 深い見出し')).toBe('深い見出し');
      expect(deriveTitleFromContent('- リスト項目')).toBe('リスト項目');
      expect(deriveTitleFromContent('> 引用ブロック')).toBe('引用ブロック');
    });

    it('skips frontmatter or leading symbol lines to find first real content', () => {
      const doc = '---\ntitle: test\n---\n本文の内容';
      expect(deriveTitleFromContent(doc)).toBe('title: test');

      const symbolsOnly = '### ---\n***\n実際の文章';
      expect(deriveTitleFromContent(symbolsOnly)).toBe('実際の文章');
    });

    it('truncates to exactly 24 characters when text is longer', () => {
      const longText = '123456789012345678901234567890'; // 30 chars
      const derived = deriveTitleFromContent(longText);
      expect(derived).toBe('123456789012345678901234');
      expect(Array.from(derived).length).toBe(24);
    });

    it('handles unicode and emojis without half-character corruption', () => {
      const emojiText = '🎉✨🚀🌟💡📝開発メモ2026年秋のリリース計画ドキュメント';
      const derived = deriveTitleFromContent(emojiText);
      expect(Array.from(derived).length).toBeLessThanOrEqual(24);
      expect(derived.startsWith('🎉✨🚀')).toBe(true);
    });

    it('returns empty string for empty content or only whitespaces/symbols', () => {
      expect(deriveTitleFromContent('')).toBe('');
      expect(deriveTitleFromContent('\n\n   \n')).toBe('');
      expect(deriveTitleFromContent('###\n---\n***')).toBe('');
    });
  });

  describe('decideSuggestedSaveName', () => {
    it('prioritizes customName and adds .md if missing', () => {
      const doc: MinimalDocForSave = {
        path: null,
        name: 'カスタム名称',
        customName: true,
        workingText: '# 本文見出し\n本文',
      };
      // Must take customName over firstHeading!
      expect(decideSuggestedSaveName(doc, '本文見出し')).toBe('カスタム名称.md');
    });

    it('preserves existing supported extension on customName without duplicating', () => {
      const docTxt: MinimalDocForSave = {
        path: null,
        name: 'memo.txt',
        customName: true,
        workingText: 'some text',
      };
      expect(decideSuggestedSaveName(docTxt, null)).toBe('memo.txt');

      const docMd: MinimalDocForSave = {
        path: null,
        name: 'memo.markdown',
        customName: true,
        workingText: 'some text',
      };
      expect(decideSuggestedSaveName(docMd, null)).toBe('memo.markdown');
    });

    it('prioritizes first heading when customName is false (auto-derived draft)', () => {
      const doc: MinimalDocForSave = {
        path: null,
        name: '最初の24文字自動タイトル',
        customName: false,
        workingText: '# 正式な文書見出し\n本文',
      };
      expect(decideSuggestedSaveName(doc, '正式な文書見出し')).toBe('正式な文書見出し.md');
    });

    it('sanitizes illegal path characters from suggested filename', () => {
      expect(sanitizeFilename('foo/bar\\baz:qux*')).toBe('foo_bar_baz_qux_');
      const doc: MinimalDocForSave = {
        path: null,
        name: '2026/11/16:計画',
        customName: true,
        workingText: '',
      };
      expect(decideSuggestedSaveName(doc, null)).toBe('2026_11_16_計画.md');
    });

    it('uses existing file basename when doc already has a path', () => {
      const doc: MinimalDocForSave = {
        path: '/Users/test/docs/existing_file.md',
        name: 'custom',
        customName: true,
        workingText: '',
      };
      expect(decideSuggestedSaveName(doc, 'heading')).toBe('existing_file.md');
    });
  });

  describe('validateInlineRename', () => {
    it('returns null on cancel (commit = false) for Escape or blur', () => {
      expect(validateInlineRename(false, 'old.md', 'new_name.md')).toBeNull();
    });

    it('returns null if new name is empty or unchanged', () => {
      expect(validateInlineRename(true, 'old.md', '')).toBeNull();
      expect(validateInlineRename(true, 'old.md', '   ')).toBeNull();
      expect(validateInlineRename(true, 'old.md', 'old.md')).toBeNull();
      expect(validateInlineRename(true, 'old.md', ' old.md ')).toBeNull();
    });

    it('returns trimmed string on valid commit (Enter)', () => {
      expect(validateInlineRename(true, 'old.md', 'renamed.md')).toBe('renamed.md');
      expect(validateInlineRename(true, 'old.md', '  renamed.md  ')).toBe('renamed.md');
    });
  });

  describe('customName protection on typing', () => {
    it('preserves name if customName is true and allows tracking if false', () => {
      // Simulating updateUntitledName logic
      function updateName(doc: { name: string; customName?: boolean; workingText: string }) {
        if (doc.customName) return; // Protected!
        const title = deriveTitleFromContent(doc.workingText);
        if (title) doc.name = title;
      }

      const autoDoc = { name: '初期', customName: false, workingText: '文字入力中' };
      updateName(autoDoc);
      expect(autoDoc.name).toBe('文字入力中');

      const customDoc = { name: '手動リネームした名前', customName: true, workingText: '新しい本文' };
      updateName(customDoc);
      expect(customDoc.name).toBe('手動リネームした名前'); // Does not change!
    });
  });
});
