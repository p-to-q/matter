const EMOJI_ZWJ_PREFIX = /\p{Extended_Pictographic}(?:\ufe0f|\p{Emoji_Modifier})?\u200d(?=\p{Extended_Pictographic})/gu;

/** Reject invisible and bidi formatting controls. U+200D is retained only
 * between emoji pictographs, never as an invisible distinction in text. */
export function hasUnsafeWikiFormatControl(value: string): boolean {
  const withoutValidEmojiJoiners = value.replace(EMOJI_ZWJ_PREFIX, "");
  for (const codePoint of withoutValidEmojiJoiners) {
    if (/\p{Cf}/u.test(codePoint)) return true;
  }
  return false;
}
