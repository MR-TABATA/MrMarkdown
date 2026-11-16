/**
 * Pure utility functions for title derivation, suggested save name calculation,
 * and inline rename validation.
 */

/**
 * Extract up to 24 characters from the first non-empty line of content,
 * stripping markdown heading and list markers. Handles multi-byte and emojis
 * using Array.from to prevent half-character truncation.
 */
export function deriveTitleFromContent(content: string): string {
  const head = content.slice(0, 1000);
  const lines = head.split('\n');
  for (const line of lines) {
    const cleaned = line.replace(/^[#\s\-*=>`~_]+/, '').trim();
    if (cleaned) {
      return Array.from(cleaned).slice(0, 24).join('').trim();
    }
  }
  return '';
}

/**
 * Sanitize a string to be a safe filesystem name.
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[/:*?"<>|\0\\]/g, '_').trim();
}

export interface MinimalDocForSave {
  path: string | null;
  name: string;
  customName?: boolean;
  workingText: string;
}

/**
 * Determine the suggested save filename for a document:
 * 1. If saved on disk (has path): use disk basename.
 * 2. If untitled and user explicitly renamed (customName = true): use the custom name
 *    (retaining .md/.markdown/.txt or appending .md).
 * 3. If untitled without custom name: prioritize the first heading in markdown,
 *    falling back to current buffer name.
 */
export function decideSuggestedSaveName(
  doc: MinimalDocForSave,
  firstHeading?: string | null
): string {
  if (doc.path) {
    const parts = doc.path.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || 'untitled.md';
  }

  // Custom name explicitly given by user
  if (doc.customName && doc.name.trim()) {
    const trimmed = doc.name.trim();
    const hasExt = /\.(md|markdown|txt)$/i.test(trimmed);
    return hasExt ? sanitizeFilename(trimmed) : `${sanitizeFilename(trimmed)}.md`;
  }

  // First heading takes precedence for non-custom-named drafts
  if (firstHeading && firstHeading.trim()) {
    return `${sanitizeFilename(firstHeading.trim())}.md`;
  }

  return `${sanitizeFilename(doc.name)}.md`;
}

/**
 * Validates inline rename input. Returns null if invalid or cancelled,
 * otherwise returns trimmed new name.
 */
export function validateInlineRename(commit: boolean, oldName: string, newName: string): string | null {
  if (!commit) return null;
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldName) return null;
  return trimmed;
}
