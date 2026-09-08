import { describe, expect, it } from "vitest";
import { isWellFormedUnicodeText } from "./unicode-text";

describe("Unicode scalar text", () => {
  it.each(["\uD800", "\uDC00", `before\uD800after`, `before\uDC00after`])(
    "rejects an unpaired surrogate in %j",
    (value) => expect(isWellFormedUnicodeText(value)).toBe(false),
  );

  it.each(["", "ordinary material", "思想🚀继续生长", "\u{20BB7}"])(
    "accepts scalar text in %j",
    (value) => expect(isWellFormedUnicodeText(value)).toBe(true),
  );
});
