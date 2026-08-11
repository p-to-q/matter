import type {
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
  failed: string;
  stop: string;
  retry: string;
  dismiss: string;
  cancel: string;
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
    failed: "Couldn’t turn that recording into words.",
    stop: "Stop recording",
    retry: "Record again",
    dismiss: "Dismiss",
    cancel: "Cancel recording",
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
    failed: "没能把这段录音变成文字。",
    stop: "停止录音",
    retry: "重新录音",
    dismiss: "关闭",
    cancel: "取消录音",
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
    failed: "沒能把這段錄音變成文字。",
    stop: "停止錄音",
    retry: "重新錄音",
    dismiss: "關閉",
    cancel: "取消錄音",
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
    failed: "録音を文字にできませんでした。",
    stop: "録音を停止",
    retry: "もう一度録音",
    dismiss: "閉じる",
    cancel: "録音をキャンセル",
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
    failed: "Die Aufnahme konnte nicht in Text umgewandelt werden.",
    stop: "Aufnahme beenden",
    retry: "Erneut aufnehmen",
    dismiss: "Schließen",
    cancel: "Aufnahme abbrechen",
  }),
});

export type AdmissionFeedbackActions = Readonly<{
  stop: string;
  retry: string;
  dismiss: string;
  cancel: string;
}>;

export function admissionFeedbackMessage(
  language: CanvasLanguage,
  state: AdmissionInteractionState,
): string {
  const copy = COPY[language];
  switch (state.phase) {
    case "requesting": return copy.requesting;
    case "recording": return copy.recording;
    case "stopping": return copy.stopping;
    case "transcribing": return copy.transcribing;
    case "committing": return copy.committing;
    case "error": return admissionErrorMessage(copy, state.errorCode);
    case "idle": return "";
  }
}

export function admissionFeedbackActions(
  language: CanvasLanguage,
): AdmissionFeedbackActions {
  const { stop, retry, dismiss, cancel } = COPY[language];
  return Object.freeze({ stop, retry, dismiss, cancel });
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
