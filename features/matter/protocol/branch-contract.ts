import { isMatterLocale, type MatterLocale } from "../config/locales";
import { isWellFormedUnicodeText } from "../tree/unicode-text";

import { BRANCH_VERSION } from "../config/branch";
export { BRANCH_VERSION, BRANCH_TIMEOUT_MS } from "../config/branch";
export type BranchRequest = Readonly<{
  version: typeof BRANCH_VERSION;
  requestId: string;
  treeId: string;
  revision: number;
  parentId: string;
  locale: MatterLocale;
  parentText: string;
  children: readonly string[];
}>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max &&
    isWellFormedUnicodeText(value) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}
export function parseBranchRequest(value: unknown): BranchRequest | null {
  if (!record(value) || Object.keys(value).sort().join() !==
    "children,locale,parentId,parentText,requestId,revision,treeId,version" ||
    value.version !== BRANCH_VERSION || !text(value.requestId, 128) ||
    !text(value.treeId, 128) || !text(value.parentId, 128) ||
    !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
    typeof value.locale !== "string" || !isMatterLocale(value.locale) ||
    !text(value.parentText, 4000) || !Array.isArray(value.children) ||
    value.children.length > 32 || !value.children.every((item) => text(item, 4000)) ||
    value.children.reduce((n, item) => n + item.length, value.parentText.length) > 8000) return null;
  return value as BranchRequest;
}
export function validateBranchText(value: unknown, input: BranchRequest): value is string {
  if (!text(value, 160) || value !== value.trim() || /[\r\n<>`]/u.test(value) ||
    /^(?:[#>*•-]|\d+[.)、])/u.test(value)) return false;
  const key = (s: string) => s.normalize("NFKC").replace(/[\p{P}\p{Z}\s]/gu, "").toLocaleLowerCase();
  return key(value).length >= 2 && ![input.parentText, ...input.children].some((s) => key(s) === key(value));
}

export type BranchAnswer = Readonly<{
  version: typeof BRANCH_VERSION;
  requestId: string;
  treeId: string;
  revision: number;
  parentId: string;
  text: string;
}>;
export function parseBranchAnswer(value: unknown, input: BranchRequest): BranchAnswer | null {
  if (!record(value) || Object.keys(value).sort().join() !== "parentId,requestId,revision,text,treeId,version" ||
    value.version !== BRANCH_VERSION || value.requestId !== input.requestId ||
    value.treeId !== input.treeId || value.revision !== input.revision ||
    value.parentId !== input.parentId || !validateBranchText(value.text, input)) return null;
  return value as BranchAnswer;
}
