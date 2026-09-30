import type {
  AdmissionAnchor,
  AdmissionErrorCode,
  AdmissionInteractionState,
} from "../runtime/admission-interaction";
import type { CanvasLanguage } from "./canvas-preferences";

type AdmissionFeedbackLocaleCopy = Readonly<{
  requesting: string;
  recording: string;
  stopping: string;
  transcribing: string;
  committing: string;
  microphoneDenied: string;
  microphoneUnavailable: string;
  recordingUnsupported: string;
  noAudio: string;
  staleTarget: string;
  heldWords: string;
  heldWordsRejected: string;
  failed: string;
  stop: string;
  retry: string;
  dismiss: string;
  cancel: string;
  cancelTranscription: string;
  discard: string;
  placeRootThought: string;
  placeTopLevelThought: string;
  placeBelowSelectedMaterial: string;
}>;

const COPY: Readonly<Record<CanvasLanguage, AdmissionFeedbackLocaleCopy>> = Object.freeze({
  "en-US": Object.freeze({
    requesting: "Waiting for microphone access",
    recording: "Listening",
    stopping: "Finishing the recording",
    transcribing: "Turning voice into material",
    committing: "Placing the thought",
    microphoneDenied: "Microphone access is blocked.",
    microphoneUnavailable: "No microphone is available.",
    recordingUnsupported: "Voice recording isn’t available here.",
    noAudio: "No words were heard.",
    staleTarget: "That thought changed before the recording finished.",
    heldWords: "Where these words were going changed before they arrived.",
    heldWordsRejected: "These words could not be placed.",
    failed: "Couldn’t turn that recording into words.",
    stop: "Stop recording",
    retry: "Record again",
    dismiss: "Dismiss",
    cancel: "Cancel recording",
    cancelTranscription: "Cancel transcription",
    discard: "Discard",
    placeRootThought: "Place as the root thought",
    placeTopLevelThought: "Place as a top-level thought",
    placeBelowSelectedMaterial: "Place below the selected material",
  }),
  "zh-CN": Object.freeze({
    requesting: "正在等待麦克风权限",
    recording: "正在听",
    stopping: "正在结束录音",
    transcribing: "正在把声音变成材料",
    committing: "正在放入这段想法",
    microphoneDenied: "麦克风权限已被阻止。",
    microphoneUnavailable: "没有可用的麦克风。",
    recordingUnsupported: "此处无法使用语音录制。",
    noAudio: "没有听到文字。",
    staleTarget: "录音结束前，这段想法已经发生变化。",
    heldWords: "这段话原本要放的位置，在它到达前变了。",
    heldWordsRejected: "这段话没能放进材料。",
    failed: "没能把这段录音变成文字。",
    stop: "停止录音",
    retry: "重新录音",
    dismiss: "关闭",
    cancel: "取消录音",
    cancelTranscription: "取消转写",
    discard: "丢弃",
    placeRootThought: "放为第一个想法",
    placeTopLevelThought: "放为一级想法",
    placeBelowSelectedMaterial: "放到所选材料下",
  }),
  "zh-TW": Object.freeze({
    requesting: "正在等待麥克風權限",
    recording: "正在聽",
    stopping: "正在結束錄音",
    transcribing: "正在把聲音變成材料",
    committing: "正在放入這段想法",
    microphoneDenied: "麥克風權限已被阻止。",
    microphoneUnavailable: "沒有可用的麥克風。",
    recordingUnsupported: "此處無法使用語音錄製。",
    noAudio: "沒有聽到文字。",
    staleTarget: "錄音結束前，這段想法已經發生變化。",
    heldWords: "這段話原本要放的位置，在它到達前變了。",
    heldWordsRejected: "這段話沒能放進材料。",
    failed: "沒能把這段錄音變成文字。",
    stop: "停止錄音",
    retry: "重新錄音",
    dismiss: "關閉",
    cancel: "取消錄音",
    cancelTranscription: "取消轉寫",
    discard: "丟棄",
    placeRootThought: "放為第一個想法",
    placeTopLevelThought: "放為第一層想法",
    placeBelowSelectedMaterial: "放到所選材料下",
  }),
  "ja-JP": Object.freeze({
    requesting: "マイクの許可を待っています",
    recording: "聞いています",
    stopping: "録音を終了しています",
    transcribing: "声を素材にしています",
    committing: "考えを配置しています",
    microphoneDenied: "マイクへのアクセスがブロックされています。",
    microphoneUnavailable: "利用できるマイクがありません。",
    recordingUnsupported: "ここでは音声を録音できません。",
    noAudio: "言葉を聞き取れませんでした。",
    staleTarget: "録音中に対象の考えが変更されました。",
    heldWords: "この言葉の置き場所が、届く前に変わりました。",
    heldWordsRejected: "この言葉を配置できませんでした。",
    failed: "録音を文字にできませんでした。",
    stop: "録音を停止",
    retry: "もう一度録音",
    dismiss: "閉じる",
    cancel: "録音をキャンセル",
    cancelTranscription: "文字起こしをキャンセル",
    discard: "破棄",
    placeRootThought: "最初の考えとして置く",
    placeTopLevelThought: "最上位の考えとして置く",
    placeBelowSelectedMaterial: "選択した素材の下に置く",
  }),
  "de-DE": Object.freeze({
    requesting: "Warte auf Mikrofonzugriff",
    recording: "Ich höre zu",
    stopping: "Aufnahme wird beendet",
    transcribing: "Sprache wird zu Material",
    committing: "Gedanke wird eingefügt",
    microphoneDenied: "Der Mikrofonzugriff ist blockiert.",
    microphoneUnavailable: "Es ist kein Mikrofon verfügbar.",
    recordingUnsupported: "Sprachaufnahmen sind hier nicht verfügbar.",
    noAudio: "Es wurden keine Wörter erkannt.",
    staleTarget: "Der Gedanke wurde während der Aufnahme geändert.",
    heldWords: "Der Platz für diese Worte hat sich vor ihrem Eintreffen geändert.",
    heldWordsRejected: "Diese Worte konnten nicht eingefügt werden.",
    failed: "Die Aufnahme konnte nicht in Text umgewandelt werden.",
    stop: "Aufnahme beenden",
    retry: "Erneut aufnehmen",
    dismiss: "Schließen",
    cancel: "Aufnahme abbrechen",
    cancelTranscription: "Transkription abbrechen",
    discard: "Verwerfen",
    placeRootThought: "Als ersten Gedanken einfügen",
    placeTopLevelThought: "Als Gedanken der ersten Ebene einfügen",
    placeBelowSelectedMaterial: "Unter dem ausgewählten Material einfügen",
  }),
});

export type AdmissionFeedbackActions = Readonly<{
  stop: string;
  retry: string;
  dismiss: string;
  cancel: string;
  cancelTranscription: string;
  discard: string;
}>;

export type AdmissionProgressPhase = Exclude<
  AdmissionInteractionState["phase"],
  "idle" | "error"
>;

export function admissionFeedbackMessage(
  language: CanvasLanguage,
  state: AdmissionInteractionState,
): string {
  switch (state.phase) {
    case "error": {
      const copy = COPY[language];
      if (state.transcript === undefined) return admissionErrorMessage(copy, state.errorCode);
      return state.errorCode === "STALE_TARGET" ? copy.heldWords : copy.heldWordsRejected;
    }
    case "idle": return "";
    default: return admissionPhaseMessage(language, state.phase);
  }
}

/** A phase label by itself, for a label still shown after its phase ended. */
export function admissionPhaseMessage(
  language: CanvasLanguage,
  phase: AdmissionProgressPhase,
): string {
  const copy = COPY[language];
  switch (phase) {
    case "requesting": return copy.requesting;
    case "recording": return copy.recording;
    case "stopping": return copy.stopping;
    case "transcribing": return copy.transcribing;
    case "committing": return copy.committing;
  }
}

export function admissionFeedbackActions(
  language: CanvasLanguage,
): AdmissionFeedbackActions {
  const {
    stop,
    retry,
    dismiss,
    cancel,
    cancelTranscription,
    discard,
  } = COPY[language];
  return Object.freeze({
    stop,
    retry,
    dismiss,
    cancel,
    cancelTranscription,
    discard,
  });
}

/**
 * Names what withdrawing a live attempt gives up. Once transcribed words wait
 * to be placed, withdrawing discards them, so the action says Discard, as it
 * does for held words, rather than cancelling a recording that already ended.
 */
export function admissionWithdrawLabel(
  language: CanvasLanguage,
  phase: Exclude<AdmissionProgressPhase, "recording">,
): string {
  const copy = COPY[language];
  switch (phase) {
    case "requesting":
    case "stopping":
      return copy.cancel;
    case "transcribing":
      return copy.cancelTranscription;
    case "committing":
      return copy.discard;
  }
}

/**
 * Names where held words would go, using the same distinctions as the Voice
 * tool, so placement is never a hidden guess.
 */
export function admissionPlacementLabel(
  language: CanvasLanguage,
  anchor: AdmissionAnchor,
  rootId: string | null,
): string {
  const copy = COPY[language];
  if (anchor.kind === "root") return copy.placeRootThought;
  return anchor.parentNodeId === rootId
    ? copy.placeTopLevelThought
    : copy.placeBelowSelectedMaterial;
}

function admissionErrorMessage(
  copy: AdmissionFeedbackLocaleCopy,
  errorCode: AdmissionErrorCode,
): string {
  switch (errorCode) {
    case "MICROPHONE_DENIED": return copy.microphoneDenied;
    case "MICROPHONE_UNAVAILABLE": return copy.microphoneUnavailable;
    case "RECORDING_UNSUPPORTED": return copy.recordingUnsupported;
    case "NO_AUDIO":
    case "EMPTY_TRANSCRIPT": return copy.noAudio;
    case "STALE_TARGET": return copy.staleTarget;
    default: return copy.failed;
  }
}
