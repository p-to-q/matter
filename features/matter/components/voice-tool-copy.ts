import type { CanvasLanguage } from "./canvas-preferences";

export type VoiceToolCopy = Readonly<{
  stopRecording: string;
  recordRootThought: string;
  recordTopLevelThought: string;
  recordBelowSelectedMaterial: string;
  unavailableInFocusView: string;
  preparingVoiceInput: string;
  unavailableInPreview: string;
  unavailableOutsideFullView: string;
}>;

const COPY: Readonly<Record<CanvasLanguage, VoiceToolCopy>> = Object.freeze({
  "en-US": Object.freeze({
    stopRecording: "Stop recording",
    recordRootThought: "Record a root thought",
    recordTopLevelThought: "Record a top-level thought",
    recordBelowSelectedMaterial: "Record a thought below the selected material",
    unavailableInFocusView: "Voice admission unavailable in focus view",
    preparingVoiceInput: "Preparing voice input",
    unavailableInPreview: "Voice admission is unavailable in this preview",
    unavailableOutsideFullView: "Voice admission unavailable outside the full material view",
  }),
  "zh-CN": Object.freeze({
    stopRecording: "停止录音",
    recordRootThought: "录入第一个想法",
    recordTopLevelThought: "录入一级想法",
    recordBelowSelectedMaterial: "在所选材料下录入想法",
    unavailableInFocusView: "聚焦视图中不能录入语音",
    preparingVoiceInput: "正在准备语音输入",
    unavailableInPreview: "此预览版暂不能录入语音",
    unavailableOutsideFullView: "仅能在完整材料视图中录入语音",
  }),
  "zh-TW": Object.freeze({
    stopRecording: "停止錄音",
    recordRootThought: "錄入第一個想法",
    recordTopLevelThought: "錄入第一層想法",
    recordBelowSelectedMaterial: "在所選材料下錄入想法",
    unavailableInFocusView: "聚焦檢視中不能錄入語音",
    preparingVoiceInput: "正在準備語音輸入",
    unavailableInPreview: "此預覽版暫不能錄入語音",
    unavailableOutsideFullView: "僅能在完整材料檢視中錄入語音",
  }),
  "ja-JP": Object.freeze({
    stopRecording: "録音を停止",
    recordRootThought: "最初の考えを録音",
    recordTopLevelThought: "最上位の考えを録音",
    recordBelowSelectedMaterial: "選択した素材の下に考えを録音",
    unavailableInFocusView: "フォーカス表示では音声入力を使えません",
    preparingVoiceInput: "音声入力を準備しています",
    unavailableInPreview: "このプレビューでは音声入力を使えません",
    unavailableOutsideFullView: "音声入力は完全な素材表示でのみ使えます",
  }),
  "de-DE": Object.freeze({
    stopRecording: "Aufnahme beenden",
    recordRootThought: "Ersten Gedanken aufnehmen",
    recordTopLevelThought: "Gedanken der ersten Ebene aufnehmen",
    recordBelowSelectedMaterial: "Gedanken unter dem ausgewählten Material aufnehmen",
    unavailableInFocusView: "Spracheingabe ist in der Fokusansicht nicht verfügbar",
    preparingVoiceInput: "Spracheingabe wird vorbereitet",
    unavailableInPreview: "Spracheingabe ist in dieser Vorschau nicht verfügbar",
    unavailableOutsideFullView: "Spracheingabe ist nur in der vollständigen Materialansicht verfügbar",
  }),
});

export function voiceToolCopy(locale: CanvasLanguage): VoiceToolCopy {
  return COPY[locale];
}
