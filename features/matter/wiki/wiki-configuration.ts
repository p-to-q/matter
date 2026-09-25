import type { MatterLocale } from "../config/locales";
import {
  projectApplicableWikiRules,
  WIKI_CONFIRMED_ONLY,
  type WikiProjectionPolicy,
} from "./wiki-evidence";
import type { WikiBoundary, WikiLexemeScope, WikiState } from "./wiki-model";

const WORD_EDGE = /^[\p{L}\p{M}\p{N}].*[\p{L}\p{M}\p{N}]$/u;
const SINGLE_WORD_EDGE = /^[\p{L}\p{M}\p{N}]$/u;

export type WikiConfigurationRuleOrigin = "confirmed" | "automatic";

/** One person-visible lexeme; aliases remain a folded implementation detail. */
export type WikiConfigurationRule = Readonly<{
  id: string;
  lexemeId: number;
  locale: MatterLocale;
  canonical: string;
  scope: WikiLexemeScope;
  origin: WikiConfigurationRuleOrigin;
}>;

export type WikiConfigurationInput = Readonly<{
  locale: MatterLocale;
  canonical: string;
  scope: WikiLexemeScope;
}>;

/** Matcher grammar remains product policy rather than a configuration burden. */
export function deriveWikiBoundary(
  locale: MatterLocale,
  form: string,
): WikiBoundary {
  if (locale === "zh-CN" || locale === "zh-TW" || locale === "ja-JP") {
    return "literal";
  }
  return (form.length === 1 ? SINGLE_WORD_EDGE : WORD_EDGE).test(form)
    ? "word"
    : "literal";
}

/** Projects canonical lexemes only; fitting scores and channel plumbing stay internal. */
export function projectWikiConfigurationRules(
  state: WikiState,
  policy: WikiProjectionPolicy = WIKI_CONFIRMED_ONLY,
): readonly WikiConfigurationRule[] {
  const active = projectApplicableWikiRules(state, policy);
  const activeAutomatic = new Set(active
    .filter((rule) => rule.authority === "provisional")
    .map((rule) => JSON.stringify([rule.locale, rule.canonical])));

  return Object.freeze(state.lexemes
    .filter((lexeme) => lexeme.provenance === "human-confirmed" ||
      activeAutomatic.has(JSON.stringify([lexeme.locale, lexeme.canonical])))
    .map((lexeme) => Object.freeze({
      id: String(lexeme.id),
      lexemeId: lexeme.id,
      locale: lexeme.locale,
      canonical: lexeme.canonical,
      scope: lexeme.scope,
      origin: lexeme.provenance === "human-confirmed" ? "confirmed" as const : "automatic" as const,
    })));
}
