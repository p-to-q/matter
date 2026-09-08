import type { MatterLocale } from "../config/locales";

export type NodeActionLensCopy = Readonly<{
  actions: string;
  include: string;
  includeShort: string;
  rewrite: string;
  rewriteShort: string;
  setAside: string;
  setAsideShort: string;
}>;

const COPY: Readonly<Record<MatterLocale, NodeActionLensCopy>> = Object.freeze({
  "en-US": Object.freeze({
    actions: "Thought context",
    include: "Include this material branch",
    includeShort: "Include",
    rewrite: "Rewrite this material with AI",
    rewriteShort: "Rewrite with AI",
    setAside: "Set this material branch aside",
    setAsideShort: "Set aside",
  }),
  "zh-CN": Object.freeze({
    actions: "材料操作",
    include: "重新纳入这支材料",
    includeShort: "纳入",
    rewrite: "用 AI 改写这段材料",
    rewriteShort: "用 AI 改写",
    setAside: "将这支材料暂置",
    setAsideShort: "暂置",
  }),
  "zh-TW": Object.freeze({
    actions: "材料操作",
    include: "重新納入這支材料",
    includeShort: "納入",
    rewrite: "用 AI 改寫這段材料",
    rewriteShort: "用 AI 改寫",
    setAside: "將這支材料暫置",
    setAsideShort: "暫置",
  }),
  "ja-JP": Object.freeze({
    actions: "素材の操作",
    include: "この素材の枝を戻す",
    includeShort: "戻す",
    rewrite: "AI でこの素材を書き換える",
    rewriteShort: "AI で書き換え",
    setAside: "この素材の枝を脇に置く",
    setAsideShort: "脇に置く",
  }),
  "de-DE": Object.freeze({
    actions: "Materialaktionen",
    include: "Diesen Materialzweig wieder einbeziehen",
    includeShort: "Einbeziehen",
    rewrite: "Dieses Material mit KI umformulieren",
    rewriteShort: "Mit KI umformulieren",
    setAside: "Diesen Materialzweig beiseitelegen",
    setAsideShort: "Beiseitelegen",
  }),
});

export function nodeActionLensCopy(locale: MatterLocale): NodeActionLensCopy {
  return COPY[locale];
}
