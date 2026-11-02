import * as Y from "yjs";

/** One change of a text: at an offset, so many characters replaced by new text. */
export interface TextChange {
  offset: number;
  length: number;
  text: string;
}

/**
 * The one change that turns one text into another: the part between their common start and common end. Enough for a
 * file that changed in one place, as when someone types or a remote edit arrives, and right for any change.
 */
export const diffTexts = (from: string, to: string): TextChange | undefined => {
  if (from === to) {
    return undefined;
  }

  let start = 0;
  const shorter = Math.min(from.length, to.length);
  while (start < shorter && from.charCodeAt(start) === to.charCodeAt(start)) {
    start++;
  }
  let end = 0;
  while (
    end < shorter - start &&
    from.charCodeAt(from.length - 1 - end) === to.charCodeAt(to.length - 1 - end)
  ) {
    end++;
  }
  // Keep a surrogate pair whole.
  if (start > 0 && isHighSurrogate(from.charCodeAt(start - 1))) {
    start--;
  }
  if (end > 0 && isLowSurrogate(from.charCodeAt(from.length - end))) {
    end--;
  }
  return { offset: start, length: from.length - start - end, text: to.slice(start, to.length - end) };
};

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/**
 * Applies an editor's changes to a shared text. The changes of one editor event do not overlap and their offsets are
 * of the text before the event, so they apply from the last to the first.
 */
export const applyChanges = (text: Y.Text, changes: readonly TextChange[], origin?: unknown) => {
  const ordered = [...changes].sort((a, b) => b.offset - a.offset);
  text.doc!.transact(() => {
    for (const change of ordered) {
      if (change.length > 0) {
        text.delete(change.offset, change.length);
      }
      if (change.text.length > 0) {
        text.insert(change.offset, change.text);
      }
    }
  }, origin);
};

/** Makes a shared text equal to a new one, changing only the part that differs. */
export const replaceText = (text: Y.Text, to: string, origin?: unknown) => {
  const change = diffTexts(text.toString(), to);
  if (change) {
    applyChanges(text, [change], origin);
  }
};

/** Text with Windows line endings made LF, as the shared offsets need. */
export const toLf = (text: string): string => text.replace(/\r\n?/g, "\n");
