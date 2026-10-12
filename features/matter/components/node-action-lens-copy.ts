import type { MatterLocale } from "../config/locales";
import type { UnderBlockReason } from "../runtime/under-child";

// Provisional: the Under mark's name, cancel name and six reasons await native-speaker review in all five locales.
export type NodeActionLensCopy = Readonly<{
  actions: string;
  include: string;
  includeShort: string;
  rewrite: string;
  rewriteShort: string;
  setAside: string;
  setAsideShort: string;
  /** Names the Under mark: the spoken words become a child below this passage. */
  under: string;
  /** Names the same mark while its recording is armed and tapping it withdraws. */
  underCancel: string;
  /** Why the mark cannot act; it stays focusable and says so. */
  underBlocked: Readonly<Record<UnderBlockReason, string>>;
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
    under: "Add below",
    underCancel: "Cancel adding below",
    underBlocked: {
      "held-aside": "This passage is set aside.",
      "deepest-level": "This passage is at the deepest level.",
      "child-limit": "This passage already holds as many as it can.",
      "tree-full": "The document has reached its size limit.",
      "voice-unavailable": "Voice input isn’t available here.",
      busy: "Available when the current action finishes.",
    },
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
    under: "在下方添加",
    underCancel: "取消在下方添加",
    underBlocked: {
      "held-aside": "这段材料已暂置。",
      "deepest-level": "这段已在最深一层。",
      "child-limit": "这段下面已放满。",
      "tree-full": "文档已达大小上限。",
      "voice-unavailable": "此处暂不能语音输入。",
      busy: "当前操作结束后即可使用。",
    },
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
    under: "在下方新增",
    underCancel: "取消在下方新增",
    underBlocked: {
      "held-aside": "這段材料已暫置。",
      "deepest-level": "這段已在最深一層。",
      "child-limit": "這段下面已放滿。",
      "tree-full": "文件已達大小上限。",
      "voice-unavailable": "此處暫不能語音輸入。",
      busy: "目前的操作結束後即可使用。",
    },
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
    under: "下に追加",
    underCancel: "下への追加を取り消す",
    underBlocked: {
      "held-aside": "この素材は脇に置かれています。",
      "deepest-level": "この素材はいちばん深い階層です。",
      "child-limit": "この素材の下にはこれ以上置けません。",
      "tree-full": "文書がサイズの上限に達しています。",
      "voice-unavailable": "ここでは音声入力を使えません。",
      busy: "現在の操作が終わると使えます。",
    },
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
    under: "Darunter hinzufügen",
    underCancel: "Hinzufügen abbrechen",
    underBlocked: {
      "held-aside": "Dieses Material ist beiseitegelegt.",
      "deepest-level": "Dieses Material liegt auf der tiefsten Ebene.",
      "child-limit": "Unter diesem Material ist kein Platz mehr.",
      "tree-full": "Das Dokument hat seine Größengrenze erreicht.",
      "voice-unavailable": "Spracheingabe ist hier nicht verfügbar.",
      busy: "Verfügbar, sobald die laufende Aktion abgeschlossen ist.",
    },
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
