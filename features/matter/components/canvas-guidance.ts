import type {
  AdmissionErrorCode,
  AdmissionInteractionState,
} from "../runtime/admission-interaction";
import type { CanvasLanguage } from "./canvas-preferences";

export type CanvasMaterialGuidanceState =
  | Readonly<{ kind: "empty" }>
  | Readonly<{
      kind: "full";
      selected: null | Readonly<{ folded: boolean }>;
    }>
  | Readonly<{ kind: "focus" }>;

export type CanvasLanguageGuidanceState =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "lasso-ready" }>
  | Readonly<{ kind: "lasso-drawing" }>
  | Readonly<{
      kind: "text-swap";
      phase: "permission" | "recording" | "transcribing" | "typing" | "pending" | "error";
    }>
  | Readonly<{
      kind: "selected";
      stretch:
        | Readonly<{ kind: "armed"; amount: 0 }>
        | Readonly<{ kind: "dragging"; amount: number }>
        | Readonly<{ kind: "adjusted"; amount: number }>
        | Readonly<{ kind: "pending"; amount: number }>
        | Readonly<{ kind: "error"; amount: number }>;
    }>;

export type CanvasGuidanceInput = Readonly<{
  admission: AdmissionInteractionState;
  language: CanvasLanguageGuidanceState;
  material: CanvasMaterialGuidanceState;
}>;

export type CanvasGuidanceId =
  | "allow-microphone"
  | "speak-recording"
  | "wait-recording"
  | "wait-transcription"
  | "wait-commit"
  | "enable-microphone"
  | "connect-microphone"
  | "use-recording-browser"
  | "record-again"
  | "dismiss-stale-recording"
  | "speak-root"
  | "close-lasso"
  | "reach-stretch-threshold"
  | "release-stretch"
  | "set-degree"
  | "apply-stretch"
  | "wait-expansion"
  | "reset-expansion"
  | "allow-rewrite-microphone"
  | "speak-rewrite-direction"
  | "wait-rewrite-direction"
  | "type-rewrite-direction"
  | "wait-rewrite"
  | "retry-rewrite"
  | "circle-reference"
  | "circle-focus"
  | "unfold-thought"
  | "speak-child"
  | "select-thought";

export const CANVAS_GUIDANCE_NARROW_CHARACTER_LIMIT = 34;

const GUIDANCE_COPY = Object.freeze({
  "allow-microphone": "Allow microphone access.",
  "speak-recording": "Speak your thought.",
  "wait-recording": "Wait for recording to finish.",
  "wait-transcription": "Wait while voice becomes material.",
  "wait-commit": "Wait while the thought is placed.",
  "enable-microphone": "Enable microphone access.",
  "connect-microphone": "Connect a microphone.",
  "use-recording-browser": "Use a browser that can record.",
  "record-again": "Record your thought again.",
  "dismiss-stale-recording": "Dismiss this recording.",
  "speak-root": "Speak to place your first thought.",
  "close-lasso": "Close the loop around a phrase.",
  "reach-stretch-threshold": "Pull to 15%, then release.",
  "release-stretch": "Release to expand at this degree.",
  "set-degree": "Pull the lower handle to expand.",
  "apply-stretch": "Press Enter to expand here.",
  "wait-expansion": "Expanding.",
  "reset-expansion": "No change—text kept. Pull again.",
  "allow-rewrite-microphone": "Allow the microphone for rewrite.",
  "speak-rewrite-direction": "Say how to reword this passage.",
  "wait-rewrite-direction": "Understanding your direction.",
  "type-rewrite-direction": "Type one rewrite direction.",
  "wait-rewrite": "Rewording in place.",
  "retry-rewrite": "No rewrite—retry or record again.",
  "circle-reference": "Circle one phrase as reference.",
  "circle-focus": "Circle the phrase to change.",
  "unfold-thought": "Unfold this thought.",
  "speak-child": "Speak to grow beneath it.",
  "select-thought": "Select one thought.",
} satisfies Readonly<Record<CanvasGuidanceId, string>>);

const GUIDANCE_COPY_ZH = Object.freeze({
  "allow-microphone": "允许使用麦克风。",
  "speak-recording": "说出你的想法。",
  "wait-recording": "请等待录音结束。",
  "wait-transcription": "正在将声音变成材料。",
  "wait-commit": "正在放置这段想法。",
  "enable-microphone": "请开启麦克风权限。",
  "connect-microphone": "请连接麦克风。",
  "use-recording-browser": "请使用支持录音的浏览器。",
  "record-again": "请重新录下这段想法。",
  "dismiss-stale-recording": "关闭这次录音。",
  "speak-root": "说出你的第一个想法。",
  "close-lasso": "闭合圈选这段文字。",
  "reach-stretch-threshold": "下拉到至少 15% 后松开。",
  "release-stretch": "松开，按当前程度展开。",
  "set-degree": "下拉底部把手展开这段文字。",
  "apply-stretch": "按回车键按当前程度展开。",
  "wait-expansion": "正在展开。",
  "reset-expansion": "未展开，原文保留；再拉一次。",
  "allow-rewrite-microphone": "允许麦克风听取改写方向。",
  "speak-rewrite-direction": "说出希望怎样换一种说法。",
  "wait-rewrite-direction": "正在听清改写方向。",
  "type-rewrite-direction": "输入一条改写方向。",
  "wait-rewrite": "正在原位换一种说法。",
  "retry-rewrite": "未改写；重试或重新录音。",
  "circle-reference": "圈选一段文字作为参照。",
  "circle-focus": "圈选需要改变的文字。",
  "unfold-thought": "展开这段想法。",
  "speak-child": "说话，让想法向下生长。",
  "select-thought": "选择一段想法。",
} satisfies Readonly<Record<CanvasGuidanceId, string>>);

export type CanvasGuidance = Readonly<{
  id: CanvasGuidanceId;
  kind: "action" | "progress" | "recovery";
  text: string;
}>;

/**
 * Projects transient interaction state into one truthful next action. Specific
 * interaction surfaces retain ownership of announcements and recovery controls.
 */
export function projectCanvasGuidance(input: CanvasGuidanceInput): CanvasGuidance {
  if (
    input.admission.phase !== "idle" &&
    !(input.admission.phase === "error" && input.language.kind === "text-swap")
  ) {
    return projectAdmissionGuidance(input.admission);
  }

  if (input.material.kind === "empty") {
    return guidance("speak-root", "action");
  }

  switch (input.language.kind) {
    case "lasso-drawing":
      return guidance("close-lasso", "action");
    case "selected":
      switch (input.language.stretch.kind) {
        case "dragging":
          return input.language.stretch.amount < .15
            ? guidance("reach-stretch-threshold", "action")
            : guidance("release-stretch", "action");
        case "armed":
          return guidance("set-degree", "action");
        case "adjusted":
          return input.language.stretch.amount < .15
            ? guidance("reach-stretch-threshold", "action")
            : guidance("apply-stretch", "action");
        case "pending":
          return guidance("wait-expansion", "progress");
        case "error":
          return guidance("reset-expansion", "recovery");
        default:
          return assertNever(input.language.stretch);
      }
    case "text-swap":
      switch (input.language.phase) {
        case "permission": return guidance("allow-rewrite-microphone", "action");
        case "recording": return guidance("speak-rewrite-direction", "action");
        case "transcribing": return guidance("wait-rewrite-direction", "progress");
        case "typing": return guidance("type-rewrite-direction", "action");
        case "pending": return guidance("wait-rewrite", "progress");
        case "error": return guidance("retry-rewrite", "recovery");
        default: return assertNever(input.language.phase);
      }
    case "lasso-ready":
      return guidance("circle-reference", "action");
    case "none":
      break;
    default:
      return assertNever(input.language);
  }

  switch (input.material.kind) {
    case "focus":
      return guidance("circle-focus", "action");
    case "full":
      if (input.material.selected === null) {
        return guidance("select-thought", "action");
      }
      return input.material.selected.folded
        ? guidance("unfold-thought", "action")
        : guidance("speak-child", "action");
    default:
      return assertNever(input.material);
  }
}

/** Localization changes copy only; the interaction state machine remains authoritative. */
export function localizeCanvasGuidance(
  guidanceState: CanvasGuidance,
  language: CanvasLanguage,
): CanvasGuidance {
  if (language === "en-US") return guidanceState;
  if (language === "zh-TW") {
    return Object.freeze({ ...guidanceState, text: GUIDANCE_COPY_ZH_TW[guidanceState.id] });
  }
  if (language === "ja-JP") {
    return Object.freeze({ ...guidanceState, text: GUIDANCE_COPY_JA[guidanceState.id] });
  }
  if (language === "de-DE") {
    return Object.freeze({ ...guidanceState, text: GUIDANCE_COPY_DE[guidanceState.id] });
  }
  return Object.freeze({
    ...guidanceState,
    text: GUIDANCE_COPY_ZH[guidanceState.id],
  });
}

const GUIDANCE_COPY_ZH_TW = Object.freeze({
  ...GUIDANCE_COPY_ZH,
  "allow-microphone": "允許使用麥克風。",
  "speak-recording": "說出你的想法。",
  "wait-recording": "請等待錄音結束。",
  "wait-transcription": "正在將聲音變成材料。",
  "wait-commit": "正在放置這段想法。",
  "enable-microphone": "請開啟麥克風權限。",
  "connect-microphone": "請連接麥克風。",
  "use-recording-browser": "請使用支援錄音的瀏覽器。",
  "record-again": "請重新錄下這段想法。",
  "dismiss-stale-recording": "關閉這次錄音。",
  "speak-root": "說出你的第一個想法。",
  "close-lasso": "閉合圈選這段文字。",
  "reach-stretch-threshold": "下拉到至少 15% 後放開。",
  "release-stretch": "放開，按目前程度展開。",
  "set-degree": "下拉底部把手展開這段文字。",
  "apply-stretch": "按 Enter 依目前程度展開。",
  "wait-expansion": "正在展開。",
  "reset-expansion": "未展開，原文保留；再拉一次。",
  "allow-rewrite-microphone": "允許麥克風聽取改寫方向。",
  "speak-rewrite-direction": "說出希望怎樣換一種說法。",
  "wait-rewrite-direction": "正在聽清改寫方向。",
  "type-rewrite-direction": "輸入一條改寫方向。",
  "wait-rewrite": "正在原位換一種說法。",
  "retry-rewrite": "未改寫；重試或重新錄音。",
  "circle-reference": "圈選一段文字作為參照。",
  "circle-focus": "圈選需要改變的文字。",
  "unfold-thought": "展開這段想法。",
  "speak-child": "說話，讓想法向下生長。",
  "select-thought": "選擇一段想法。",
});
const GUIDANCE_COPY_JA = Object.freeze({
  ...GUIDANCE_COPY,
  "allow-microphone": "マイクの使用を許可してください。",
  "speak-recording": "考えを話してください。",
  "wait-recording": "録音が終わるまで待ってください。",
  "wait-transcription": "声を素材にしています。",
  "wait-commit": "考えを配置しています。",
  "enable-microphone": "マイクの権限を有効にしてください。",
  "connect-microphone": "マイクを接続してください。",
  "use-recording-browser": "録音に対応したブラウザを使ってください。",
  "record-again": "もう一度考えを録音してください。",
  "dismiss-stale-recording": "この録音を閉じてください。",
  "speak-root": "最初の考えを話してください。",
  "close-lasso": "フレーズを囲んで輪を閉じてください。",
  "reach-stretch-threshold": "15%以上まで引いて放してください。",
  "release-stretch": "放して、この程度で展開します。",
  "set-degree": "下のハンドルを引いて展開します。",
  "apply-stretch": "Enterでこの程度に展開します。",
  "wait-expansion": "展開中。",
  "reset-expansion": "展開せず原文を保持。もう一度引いてください。",
  "allow-rewrite-microphone": "言い換えのためマイクを許可してください。",
  "speak-rewrite-direction": "どのように言い換えるか話してください。",
  "wait-rewrite-direction": "言い換え方を聞き取っています。",
  "type-rewrite-direction": "言い換え方を一つ入力してください。",
  "wait-rewrite": "その場で言い換えています。",
  "retry-rewrite": "言い換えられませんでした。再試行してください。",
  "circle-reference": "参照するフレーズを一つ囲んでください。",
  "circle-focus": "変えるフレーズを囲んでください。",
  "unfold-thought": "この考えを展開してください。",
  "speak-child": "話して、考えを下へ育ててください。",
  "select-thought": "考えを一つ選んでください。",
});
const GUIDANCE_COPY_DE = Object.freeze({
  ...GUIDANCE_COPY,
  "allow-microphone": "Mikrofonzugriff erlauben.",
  "speak-recording": "Sprich deinen Gedanken aus.",
  "wait-recording": "Warte, bis die Aufnahme beendet ist.",
  "wait-transcription": "Stimme wird zu Material.",
  "wait-commit": "Gedanke wird platziert.",
  "enable-microphone": "Mikrofonzugriff aktivieren.",
  "connect-microphone": "Mikrofon anschließen.",
  "use-recording-browser": "Einen Browser mit Aufnahmefunktion verwenden.",
  "record-again": "Gedanken erneut aufnehmen.",
  "dismiss-stale-recording": "Diese Aufnahme schließen.",
  "speak-root": "Sprich deinen ersten Gedanken aus.",
  "close-lasso": "Schließe den Kreis um eine Phrase.",
  "reach-stretch-threshold": "Bis 15 % ziehen, dann loslassen.",
  "release-stretch": "Loslassen, um in diesem Maß zu erweitern.",
  "set-degree": "Den unteren Griff zum Erweitern ziehen.",
  "apply-stretch": "Mit Enter in diesem Maß erweitern.",
  "wait-expansion": "Wird erweitert.",
  "reset-expansion": "Nicht erweitert; Text bleibt. Erneut ziehen.",
  "allow-rewrite-microphone": "Mikrofon für Umformulierung erlauben.",
  "speak-rewrite-direction": "Sag, wie der Text umformuliert werden soll.",
  "wait-rewrite-direction": "Richtung wird verstanden.",
  "type-rewrite-direction": "Eine Umformulierungsrichtung eingeben.",
  "wait-rewrite": "Text wird an Ort und Stelle umformuliert.",
  "retry-rewrite": "Nicht umformuliert. Erneut versuchen.",
  "circle-reference": "Eine Phrase als Referenz einkreisen.",
  "circle-focus": "Die zu ändernde Phrase einkreisen.",
  "unfold-thought": "Diesen Gedanken ausklappen.",
  "speak-child": "Sprich, damit der Gedanke darunter weiterwächst.",
  "select-thought": "Einen Gedanken auswählen.",
});

function projectAdmissionGuidance(
  admission: Exclude<AdmissionInteractionState, { readonly phase: "idle" }>,
): CanvasGuidance {
  switch (admission.phase) {
    case "requesting":
      return guidance("allow-microphone", "action");
    case "recording":
      return guidance("speak-recording", "action");
    case "stopping":
      return guidance("wait-recording", "progress");
    case "transcribing":
      return guidance("wait-transcription", "progress");
    case "committing":
      return guidance("wait-commit", "progress");
    case "error":
      return projectAdmissionError(admission.errorCode);
    default:
      return assertNever(admission);
  }
}

function projectAdmissionError(errorCode: AdmissionErrorCode): CanvasGuidance {
  switch (errorCode) {
    case "MICROPHONE_DENIED":
      return guidance("enable-microphone", "recovery");
    case "MICROPHONE_UNAVAILABLE":
      return guidance("connect-microphone", "recovery");
    case "RECORDING_UNSUPPORTED":
      return guidance("use-recording-browser", "recovery");
    case "NO_AUDIO":
    case "EMPTY_TRANSCRIPT":
    case "RECORDING_FAILED":
    case "TRANSCRIPTION_FAILED":
    case "TRANSCRIPTION_TIMEOUT":
    case "INTERNAL_FAILURE":
      return guidance("record-again", "recovery");
    case "COMMIT_REJECTED":
    case "STALE_TARGET":
      return guidance("dismiss-stale-recording", "recovery");
    default:
      return assertNever(errorCode);
  }
}

function guidance(
  id: CanvasGuidanceId,
  kind: CanvasGuidance["kind"],
): CanvasGuidance {
  const text = GUIDANCE_COPY[id];
  if (text.length > CANVAS_GUIDANCE_NARROW_CHARACTER_LIMIT) {
    throw new Error(`Canvas guidance exceeds narrow line budget: ${id}`);
  }
  return Object.freeze({ id, kind, text });
}

function assertNever(value: never): never {
  throw new Error(`Unhandled canvas guidance state: ${String(value)}`);
}
