import type { CanvasLanguage } from "./canvas-preferences";

type PluralForms = Readonly<{ one: (count: number) => string; other: (count: number) => string }>;

/**
 * Describes to assistive technology that a passage holds Wiki changes it can
 * still review. Every locale is complete; counts follow each locale's rules.
 */
const COPY: Readonly<Record<CanvasLanguage, PluralForms>> = Object.freeze({
  "en-US": forms(
    () => "Wiki changed 1 word. Review it in this passage's actions.",
    (count) => `Wiki changed ${count} words. Review them in this passage's actions.`,
  ),
  "zh-CN": forms(
    (count) => `词典 WIKI 在这里改动了 ${count} 个词，可在这段的操作中查看。`,
    (count) => `词典 WIKI 在这里改动了 ${count} 个词，可在这段的操作中查看。`,
  ),
  "zh-TW": forms(
    (count) => `詞典 WIKI 在這裡改動了 ${count} 個詞，可在這段的操作中查看。`,
    (count) => `詞典 WIKI 在這裡改動了 ${count} 個詞，可在這段的操作中查看。`,
  ),
  "ja-JP": forms(
    (count) => `辞書 WIKI がここで ${count} 語を変更しました。この段落の操作から確認できます。`,
    (count) => `辞書 WIKI がここで ${count} 語を変更しました。この段落の操作から確認できます。`,
  ),
  "de-DE": forms(
    () => "Wörterbuch Wiki hat 1 Wort geändert. In den Aktionen dieser Passage prüfen.",
    (count) => `Wörterbuch Wiki hat ${count} Wörter geändert. In den Aktionen dieser Passage prüfen.`,
  ),
});

const PLURAL_RULES = new Map<CanvasLanguage, Intl.PluralRules>();

export function wikiOccurrenceDescription(locale: CanvasLanguage, count: number): string {
  let rules = PLURAL_RULES.get(locale);
  if (rules === undefined) {
    rules = new Intl.PluralRules(locale);
    PLURAL_RULES.set(locale, rules);
  }
  const copy = COPY[locale];
  return rules.select(count) === "one" ? copy.one(count) : copy.other(count);
}

function forms(one: PluralForms["one"], other: PluralForms["other"]): PluralForms {
  return Object.freeze({ one, other });
}
