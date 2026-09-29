import type { CanvasLanguage } from "./canvas-preferences";

export type ToolRailCopy = Readonly<{
  editingTools: string;
  voice: string;
  lasso: string;
  branch: string;
  pan: string;
  undo: string;
  exitLanguageSelection: string;
  circleSelectLanguage: string;
  extendRelatedThought: string;
  returnToCanvasPan: string;
  exitCanvasPan: string;
  canvasPan: string;
  undoLastChange: string;
  /** Why a visible but unavailable tool cannot act yet. */
  unavailableWhilePending: string;
  unavailableWithoutSelection: string;
  unavailableWithoutHistory: string;
}>;

const COPY: Readonly<Record<CanvasLanguage, ToolRailCopy>> = Object.freeze({
  "en-US": Object.freeze({
    editingTools: "Editing tools",
    voice: "Voice",
    lasso: "Lasso",
    branch: "Branch",
    pan: "Pan",
    undo: "Undo",
    exitLanguageSelection: "Exit language selection",
    circleSelectLanguage: "Circle-select language",
    extendRelatedThought: "Extend related thought",
    returnToCanvasPan: "Return to canvas pan",
    exitCanvasPan: "Exit canvas pan",
    canvasPan: "Canvas pan",
    undoLastChange: "Undo last change",
    unavailableWhilePending: "Available when the current action finishes.",
    unavailableWithoutSelection: "Select a thought first.",
    unavailableWithoutHistory: "Nothing to undo yet.",
  }),
  "zh-CN": Object.freeze({
    editingTools: "编辑工具",
    voice: "语音",
    lasso: "套索",
    branch: "延展",
    pan: "移动",
    undo: "撤销",
    exitLanguageSelection: "退出文字选择",
    circleSelectLanguage: "圈选文字",
    extendRelatedThought: "延展相关想法",
    returnToCanvasPan: "回到画布移动",
    exitCanvasPan: "退出画布移动",
    canvasPan: "移动画布",
    undoLastChange: "撤销上一步更改",
    unavailableWhilePending: "当前操作结束后即可使用。",
    unavailableWithoutSelection: "先选中一段想法。",
    unavailableWithoutHistory: "还没有可以撤销的更改。",
  }),
  "zh-TW": Object.freeze({
    editingTools: "編輯工具",
    voice: "語音",
    lasso: "套索",
    branch: "延展",
    pan: "移動",
    undo: "復原",
    exitLanguageSelection: "離開文字選取",
    circleSelectLanguage: "圈選文字",
    extendRelatedThought: "延展相關想法",
    returnToCanvasPan: "回到畫布移動",
    exitCanvasPan: "離開畫布移動",
    canvasPan: "移動畫布",
    undoLastChange: "復原上一步變更",
    unavailableWhilePending: "目前的操作結束後即可使用。",
    unavailableWithoutSelection: "先選取一段想法。",
    unavailableWithoutHistory: "還沒有可以復原的變更。",
  }),
  "ja-JP": Object.freeze({
    editingTools: "編集ツール",
    voice: "音声",
    lasso: "なげなわ",
    branch: "展開",
    pan: "移動",
    undo: "取り消す",
    exitLanguageSelection: "言葉の選択を終了",
    circleSelectLanguage: "言葉を囲んで選択",
    extendRelatedThought: "関連する考えを展開",
    returnToCanvasPan: "キャンバス移動に戻る",
    exitCanvasPan: "キャンバス移動を終了",
    canvasPan: "キャンバスを移動",
    undoLastChange: "最後の変更を取り消す",
    unavailableWhilePending: "現在の操作が終わると使えます。",
    unavailableWithoutSelection: "先に考えを 1 つ選択してください。",
    unavailableWithoutHistory: "取り消せる変更はまだありません。",
  }),
  "de-DE": Object.freeze({
    editingTools: "Bearbeitungswerkzeuge",
    voice: "Spracheingabe",
    lasso: "Lasso",
    branch: "Verzweigen",
    pan: "Verschieben",
    undo: "Rückgängig",
    exitLanguageSelection: "Textauswahl beenden",
    circleSelectLanguage: "Text mit einem Kreis auswählen",
    extendRelatedThought: "Verwandten Gedanken erweitern",
    returnToCanvasPan: "Zur Canvas-Bewegung zurückkehren",
    exitCanvasPan: "Canvas-Bewegung beenden",
    canvasPan: "Canvas bewegen",
    undoLastChange: "Letzte Änderung rückgängig machen",
    unavailableWhilePending: "Verfügbar, sobald die laufende Aktion abgeschlossen ist.",
    unavailableWithoutSelection: "Zuerst einen Gedanken auswählen.",
    unavailableWithoutHistory: "Noch nichts rückgängig zu machen.",
  }),
});

export function toolRailCopy(locale: CanvasLanguage): ToolRailCopy {
  return COPY[locale];
}
