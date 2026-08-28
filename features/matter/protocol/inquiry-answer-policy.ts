/**
 * Visible Inquiry answers cross a strict network boundary. Server adjudication
 * and browser parsing share this shape predicate so a proxy or future route
 * cannot reintroduce panel chrome or direction-changing Unicode controls after
 * the scenario has rejected them.
 */
const ANSWER_CHROME = /(?:^|\n)[ \t]{0,3}(?:#{1,6}[ \t]|[-*+][ \t]|\d{1,3}[.)][ \t]|>[ \t]?)|(?:^|\n)[ \t]{0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})(?=\r?(?:\n|$))|(?:^|\n)[^\n]+\n[ \t]{0,3}(?:=+|-+)[ \t]*(?=\r?(?:\n|$))|(?:^|\n)[^\n|]*\|[^\n]*\n[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*\||<\/?(?:a|h[1-6]|blockquote|ul|ol|li|table|thead|tbody|tr|th|td|pre|details|summary)\b|<(?:https?:\/\/|mailto:)[^>\n]+>|```|~~~|\[[^\]\n]+\]\([^\n)]+\)/iu;
const UNSAFE_ANSWER_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069\uD800-\uDFFF]/u;

export function isInquiryAnswerProse(text: string): boolean {
  return !ANSWER_CHROME.test(text) && !UNSAFE_ANSWER_TEXT.test(text);
}
