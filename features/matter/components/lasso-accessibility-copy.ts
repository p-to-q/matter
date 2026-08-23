import type { CanvasLanguage } from "./canvas-preferences";

/**
 * Accessible copy for the lasso's transient selection and shared stretch
 * controls. Keeping this beside the other surface-specific copy owners makes
 * every supported locale explicit instead of letting RootedMaterial become a
 * second localization registry.
 */
export type LassoAccessibilityCopy = Readonly<{
  selectedLanguage: string;
  groupLabel: string;
  groupRoleDescription: string;
  groupInstructions: string;
  upperGripLabel: string;
  lowerGripLabel: string;
  keyboardSelectionHint: string;
}>;

const COPY: Readonly<Record<CanvasLanguage, LassoAccessibilityCopy>> = Object.freeze({
  "en-US": Object.freeze({
    selectedLanguage: "Selected language",
    groupLabel: "Expansion degree",
    groupRoleDescription: "two grips for one shared degree",
    groupInstructions: "Both grips control the same expansion degree. Pull the upper grip upward to hold its upper boundary and open the selected language plus following material downward; pull the lower grip downward to move only the following material. Up or Right increases; Down or Left decreases. Page Up and Page Down adjust farther. Home resets, End maximizes, Enter or Space applies, and Escape resets.",
    upperGripLabel: "Set selected language expansion with the upper grip",
    lowerGripLabel: "Set selected language expansion with the lower grip",
    keyboardSelectionHint: "Lasso mode. Use Left and Right Arrow to address the previous or next punctuation segment in this material.",
  }),
  "zh-CN": Object.freeze({
    selectedLanguage: "已选文字",
    groupLabel: "展开程度",
    groupRoleDescription: "共同控制同一程度的上下两个握点",
    groupInstructions: "两个握点控制同一个展开程度。上握点向上拉，保持上边界并向下打开所选文字及其后的内容；下握点向下拉，只移动所选文字后的内容。上箭头或右箭头增加，下箭头或左箭头减少；Page Up 和 Page Down 大步调整；Home 归零，End 调至最大，回车或空格应用，Escape 重置。",
    upperGripLabel: "用上握点设置所选文字的展开程度",
    lowerGripLabel: "用下握点设置所选文字的展开程度",
    keyboardSelectionHint: "套索模式。用左、右箭头定位这段材料中上一个或下一个标点分段。",
  }),
  "zh-TW": Object.freeze({
    selectedLanguage: "已選文字",
    groupLabel: "展開程度",
    groupRoleDescription: "共同控制同一程度的上下兩個握點",
    groupInstructions: "兩個握點控制同一個展開程度。上握點向上拉，保持上邊界並向下打開所選文字及其後的內容；下握點向下拉，只移動所選文字後的內容。上方向鍵或右方向鍵增加，下方向鍵或左方向鍵減少；Page Up 和 Page Down 大幅調整；Home 歸零，End 調至最大，Enter 或空白鍵套用，Escape 重設。",
    upperGripLabel: "用上握點設定所選文字的展開程度",
    lowerGripLabel: "用下握點設定所選文字的展開程度",
    keyboardSelectionHint: "套索模式。用左、右方向鍵定位這段材料中上一個或下一個標點分段。",
  }),
  "ja-JP": Object.freeze({
    selectedLanguage: "選択した言葉",
    groupLabel: "展開の度合い",
    groupRoleDescription: "1つの度合いを共有する上下2つのグリップ",
    groupInstructions: "2つのグリップは同じ展開量を操作します。上のグリップは上へ引き、上の境界を固定したまま選択した言葉と後続の素材を下へ開きます。下のグリップは下へ引き、後続の素材だけを動かします。上または右矢印で増加、下または左矢印で減少します。Page Up と Page Down は大きく調整し、Home はゼロ、End は最大、Enter またはスペースで適用、Escape でリセットします。",
    upperGripLabel: "上のグリップで選択した言葉の展開量を設定",
    lowerGripLabel: "下のグリップで選択した言葉の展開量を設定",
    keyboardSelectionHint: "投げ縄モードです。左右の矢印キーで、この素材の前後の句読点区切りを指定します。",
  }),
  "de-DE": Object.freeze({
    selectedLanguage: "Ausgewählter Text",
    groupLabel: "Erweiterungsgrad",
    groupRoleDescription: "zwei Griffe für einen gemeinsamen Grad",
    groupInstructions: "Beide Griffe steuern denselben Erweiterungsgrad. Der obere Griff wird nach oben gezogen, hält die obere Grenze fest und öffnet den ausgewählten Text mit allem Folgenden nach unten; der untere Griff wird nach unten gezogen und bewegt nur das Folgende. Pfeil nach oben oder rechts erhöht, nach unten oder links verringert. Bild auf und Bild ab ändern stärker. Pos1 setzt auf null, Ende auf das Maximum, Eingabe oder Leertaste wendet an und Escape setzt zurück.",
    upperGripLabel: "Erweiterung des ausgewählten Textes mit dem oberen Griff einstellen",
    lowerGripLabel: "Erweiterung des ausgewählten Textes mit dem unteren Griff einstellen",
    keyboardSelectionHint: "Lasso-Modus. Mit der linken und rechten Pfeiltaste den vorherigen oder nächsten Satzzeichenabschnitt dieses Materials adressieren.",
  }),
});

export function lassoAccessibilityCopy(locale: CanvasLanguage): LassoAccessibilityCopy {
  return COPY[locale];
}
