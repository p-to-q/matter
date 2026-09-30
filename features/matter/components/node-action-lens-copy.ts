import type { MatterLocale } from "../config/locales";

export type NodeActionLensCopy = Readonly<{
  actions: string;
  include: string;
  includeShort: string;
  rewrite: string;
  rewriteShort: string;
  setAside: string;
  setAsideShort: string;
  /** Opens the takeover of one word Wiki changed in this passage. */
  wikiReview: (heard: string, canonical: string) => string;
  wikiReviewShort: string;
}>;

const COPY: Readonly<Record<MatterLocale, NodeActionLensCopy>> = Object.freeze({
  "en-US": lensCopy({
    actions: "Material actions",
    include: "Include this material branch",
    includeShort: "Include",
    rewrite: "Rewrite this material with AI",
    rewriteShort: "Rewrite with AI",
    setAside: "Set this material branch aside",
    setAsideShort: "Set aside",
    wikiReview: (heard, canonical) => `Review Wiki change: ‘${heard}’ became ‘${canonical}’`,
    wikiReviewShort: "Review Wiki change",
  }),
  "zh-CN": lensCopy({
    actions: "材料操作",
    include: "重新纳入这支材料",
    includeShort: "纳入",
    rewrite: "用 AI 改写这段材料",
    rewriteShort: "用 AI 改写",
    setAside: "将这支材料暂置",
    setAsideShort: "暂置",
    wikiReview: (heard, canonical) => `查看词典 WIKI 的改动：“${heard}”改为“${canonical}”`,
    wikiReviewShort: "查看词典改动",
  }),
  "zh-TW": lensCopy({
    actions: "材料操作",
    include: "重新納入這支材料",
    includeShort: "納入",
    rewrite: "用 AI 改寫這段材料",
    rewriteShort: "用 AI 改寫",
    setAside: "將這支材料暫置",
    setAsideShort: "暫置",
    wikiReview: (heard, canonical) => `查看詞典 WIKI 的改動：「${heard}」改為「${canonical}」`,
    wikiReviewShort: "查看詞典改動",
  }),
  "ja-JP": lensCopy({
    actions: "素材の操作",
    include: "この素材の枝を戻す",
    includeShort: "戻す",
    rewrite: "AI でこの素材を書き換える",
    rewriteShort: "AI で書き換え",
    setAside: "この素材の枝を脇に置く",
    setAsideShort: "脇に置く",
    wikiReview: (heard, canonical) => `辞書 WIKI の変更を確認：「${heard}」→「${canonical}」`,
    wikiReviewShort: "辞書の変更を確認",
  }),
  "de-DE": lensCopy({
    actions: "Materialaktionen",
    include: "Diesen Materialzweig wieder einbeziehen",
    includeShort: "Einbeziehen",
    rewrite: "Dieses Material mit KI umformulieren",
    rewriteShort: "Mit KI umformulieren",
    setAside: "Diesen Materialzweig beiseitelegen",
    setAsideShort: "Beiseitelegen",
    wikiReview: (heard, canonical) => `Wiki-Änderung prüfen: „${heard}“ wurde zu „${canonical}“`,
    wikiReviewShort: "Wiki-Änderung prüfen",
  }),
});

export function nodeActionLensCopy(locale: MatterLocale): NodeActionLensCopy {
  return COPY[locale];
}

function lensCopy(copy: NodeActionLensCopy): NodeActionLensCopy {
  return Object.freeze(copy);
}
