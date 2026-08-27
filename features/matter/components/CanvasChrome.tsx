"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  type UIEvent as ReactUIEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  INQUIRY_REVEAL_STEP_MS,
  INQUIRY_TERMINAL_SETTLE_MS,
  inquiryPresentationText,
  revealSteps,
} from "./inquiry-bubble-presentation";
import {
  CANVAS_APPEARANCE_OPTIONS,
  CANVAS_LANGUAGE_OPTIONS,
  type CanvasAppearance,
  type CanvasLanguage,
} from "./canvas-preferences";
import type { CanvasPreferencesBinding } from "./use-canvas-preferences";
import {
  createInquiryState,
  canSubmitInquiry,
  inquiryText,
  pendingAnswerId,
  reduceInquiry,
  type InquiryTurnOutcome,
  type InquiryVoiceNotice,
} from "./inquiry-composer";
import { useInquiryDictation } from "./use-inquiry-dictation";
import { shouldSubmitInquiryOnEnter } from "./inquiry-submit-key";
import { askInquiry, createInquiryRequestId } from "../interaction/inquiry-client";
import {
  sameInquiryContext,
  type InquiryContextPayload,
} from "../protocol/inquiry-contract";
import {
  inquiryContextChanged,
  inquiryContextScopeChanged,
} from "./inquiry-context-lifecycle";
import styles from "./CanvasChrome.module.css";
import { isCancelEscape } from "./composition-safe-keys";
import type { InquiryRecordBinding } from "../interaction/use-inquiry-record";
import { subscribePageSuspension } from "../interaction/page-suspension";

export type CanvasChromeProps = CanvasPreferencesBinding & Readonly<{
  inquiryContext?: () => InquiryContextPayload;
  inquiryRecord?: InquiryRecordBinding;
  onInquiryOpen?: () => void;
}>;

export type CanvasChromeHandle = Readonly<{
  /** Synchronously revokes Ask Matter before another material AI surface opens. */
  closeInquiry: () => void;
}>;

export type CanvasChromeOverlay =
  | "inquiry"
  | "settings"
  | "language"
  | "mobile"
  | CanvasChromeInfoId
  | null;

type CanvasChromeInfoId = "about" | "pricing" | "privacy" | "terms";
type CanvasChromeInquiryInfo = Readonly<{
  title: string;
  body: readonly ReactNode[];
}>;
type CanvasChromeInfo = Readonly<Record<CanvasChromeInfoId, Readonly<{
  title: string;
  body: readonly ReactNode[];
}>> & { inquiry: CanvasChromeInquiryInfo }>;
type CanvasChromeCopy = Readonly<{
  about: string;
  ask: string;
  askPlaceholder: string;
  asking: string;
  appearance: Readonly<Record<CanvasAppearance, string>>;
  appearanceLabel: string;
  close: string;
  closeMenu: string;
  dictate: string;
  dictateCancel: string;
  dictateStop: string;
  fxLabel: string;
  inquiry: string;
  information: string;
  language: string;
  listening: string;
  transcribing: string;
  menu: string;
  noticeModelUnavailable: string;
  noticeNoMaterial: string;
  noticeRateLimited: string;
  noticeBusy: string;
  noticeTimedOut: string;
  noticeTemporarilyUnavailable: string;
  noticeUnreachable: string;
  noticeVoiceDenied: string;
  noticeVoiceFailed: string;
  noticeVoiceUnsupported: string;
  on: string;
  off: string;
  openMenu: string;
  preferences: string;
  pricing: string;
  privacy: string;
  recordUnsaved: string;
  settings: string;
  terms: string;
}>;

export type InquiryDictationControl = Readonly<{
  action: "start" | "stop" | "cancel";
  disabled: boolean;
  label: string;
  pressed: boolean;
}>;

/** Keeps the one microphone control reversible throughout a potentially long
 * transcription without presenting cancellation as another permanent tool. */
export function projectInquiryDictationControl(input: Readonly<{
  listening: boolean;
  transcribing: boolean;
  supported: boolean | null;
  startLabel: string;
  stopLabel: string;
  cancelLabel: string;
}>): InquiryDictationControl {
  if (input.listening) {
    return Object.freeze({
      action: "stop",
      disabled: false,
      label: input.stopLabel,
      pressed: true,
    });
  }
  if (input.transcribing) {
    return Object.freeze({
      action: "cancel",
      disabled: false,
      label: input.cancelLabel,
      pressed: true,
    });
  }
  return Object.freeze({
    action: "start",
    disabled: input.supported !== true,
    label: input.startLabel,
    pressed: false,
  });
}

function PToQAttribution({ before, after }: Readonly<{ before: string; after: string }>) {
  return (
    <>
      {before}
      <a href="https://www.ptoq.io/">[p → q]</a>
      {after}
    </>
  );
}

const ENGLISH_INFO: CanvasChromeInfo = Object.freeze({
  about: Object.freeze({
    title: "About Matter",
    body: Object.freeze([
      "Matter is an invitation to stay with a thought before it becomes an answer.",
      "Matter is an interface for unfinished thought. Voice brings language in, gesture touches exact material and sets how much it may change, and a rooted structure keeps each thought's lineage.",
      "It is a way of thinking with AI in material, not through a chat. Unfinished thoughts deserve room to remain uncertain, to be touched, and to keep growing.",
      "AI gives language intelligence. Matter gives thought a body.",
      "This is an early preview. Live voice input, transcript repair, and Ask Matter are available; material transformation remains unavailable. We are sharing Matter while its material language is becoming.",
      <PToQAttribution after="." before="Matter is a project by " key="attribution" />,
    ]),
  }),
  inquiry: Object.freeze({
    title: "Ask Matter",
    body: Object.freeze([
      "Ask one short question about the material included on this canvas. Asking never changes it.",
      "Use Lasso to circle exact language, stretch to set how much should change, Branch to grow a related thought, and Undo to reverse the last committed change.",
    ]),
  }),
  pricing: Object.freeze({
    title: "Pricing",
    body: Object.freeze([
      "Matter is in pre-release. There is no paid plan or checkout in this build.",
    ]),
  }),
  privacy: Object.freeze({
    title: "Privacy",
    body: Object.freeze([
      "Material is kept in this browser unless you export it or invoke a model-powered change.",
      "A published privacy policy is not available for this pre-release. Each model call receives only its bounded task material. An inquiry sends only bounded lassoed language or the bounded material included on this canvas; held-aside material is not sent.",
      "Voice normally uses browser-managed recognition, whose service handling depends on the browser. If Matter falls back to on-device recognition, audio stays on this device; first use downloads an approximately 152 MB fixed model from Hugging Face, may take time, and can be cancelled. That figure covers the model graphs; tokenizer and WASM runtime assets may download separately.",
    ]),
  }),
  terms: Object.freeze({
    title: "Terms",
    body: Object.freeze([
      "Matter is pre-release software. Published terms of service are not available yet.",
      "Keep an export of material you cannot replace while the product is still being proven.",
    ]),
  }),
});

const CHINESE_INFO: CanvasChromeInfo = Object.freeze({
  about: Object.freeze({
    title: "关于 Matter",
    body: Object.freeze([
      "Matter 邀请你在一个想法变成答案之前，先和它待在一起。",
      "Matter 是一个让未完成想法获得形体的界面。声音把语言带进来；手势触碰确切的材料，决定它可以改变多少；根状结构让每个想法保留自己的脉络。",
      "这是一种在材料中与 AI 一起思考的方式，而不是在对话框里等待答案。尚未成形的想法需要保留犹豫、被触碰，也继续生长的空间。",
      "AI 赋予语言智能，Matter 让思想拥有身体。",
      "当前是早期预览。实时语音输入、语音整理和询问 Matter 已可使用；材料生成变换尚未开放。我们在 Matter 的材料语言成形过程中把它打开。",
      <PToQAttribution after=" 发起的项目。" before="Matter 是由 " key="attribution" />,
    ]),
  }),
  inquiry: Object.freeze({
    title: "询问 Matter",
    body: Object.freeze([
      "就画面里被纳入的材料问一句短问题。询问不会改变它。",
      "用套索圈定确切语言，拖动边缘决定改变多少；用延展生成相关想法，用撤销退回上一次已提交的改变。",
    ]),
  }),
  pricing: Object.freeze({
    title: "定价",
    body: Object.freeze([
      "Matter 仍在内测。此版本尚无付费方案或结账功能。",
    ]),
  }),
  privacy: Object.freeze({
    title: "隐私",
    body: Object.freeze([
      "材料保存在当前浏览器中，除非你主动导出，或发起一次由模型完成的改变。",
      "内测阶段尚未发布正式隐私政策。每次模型调用只接收该任务所需的有限材料；询问只发送套索圈定且受限长度的语言，或画面里被纳入的有限材料，暂不纳入的材料不会发送。",
      "语音通常使用浏览器管理的识别服务，其服务处理方式取决于浏览器。若 Matter 回退到本机识别，音频会留在这台设备上；首次使用会从 Hugging Face 下载约 152 MB 的固定模型，可能需要一些时间，且可以取消。该数字只涵盖模型图；分词器和 WASM 运行时资源可能另行下载。",
    ]),
  }),
  terms: Object.freeze({
    title: "服务条款",
    body: Object.freeze([
      "Matter 仍是内测软件，尚未发布正式服务条款。",
      "产品仍在验证阶段，请为无法替代的材料保留一份导出副本。",
    ]),
  }),
});

const TRADITIONAL_CHINESE_INFO: CanvasChromeInfo = Object.freeze({
  about: Object.freeze({ title: "關於 Matter", body: Object.freeze([
    "Matter 邀請你在一個想法變成答案之前，先和它待在一起。",
    "Matter 是讓未完成想法獲得形體的介面。聲音帶入語言，手勢觸碰確切材料並決定改變多少，根狀結構保留每個想法的脈絡。",
    "這是在材料中與 AI 一起思考，而不是在對話框裡等待答案。未完成的想法需要保留猶豫、被觸碰並繼續生長的空間。",
    "AI 賦予語言智能，Matter 讓思想擁有身體。",
    "這是早期預覽。實時語音輸入、語音整理和詢問 Matter 已可使用；材料生成變換尚未開放。",
    <PToQAttribution after=" 發起的項目。" before="Matter 是由 " key="attribution" />,
  ]) }),
  inquiry: Object.freeze({ title: "詢問 Matter", body: Object.freeze([
    "就畫面裡被納入的材料問一句短問題。詢問不會改變它。",
    "用套索圈定語言，拖動邊緣決定改變多少；用延展生成相關想法，用復原退回上一次已提交的改變。",
  ]) }),
  pricing: Object.freeze({ title: "定價", body: Object.freeze(["Matter 仍在預覽階段，此版本沒有付費方案或結帳功能。"])}),
  privacy: Object.freeze({ title: "隱私", body: Object.freeze(["材料保存在目前瀏覽器中，除非你主動匯出或發起模型改變。", "正式隱私政策尚未發布。每次模型呼叫只接收該任務所需的有限材料；詢問只傳送套索圈定且受限長度的語言，或畫面裡被納入的有限材料，暫不納入的材料不會傳送。", "語音通常使用由瀏覽器管理的辨識服務，其服務處理方式取決於瀏覽器。若 Matter 改用本機辨識，音訊會留在這台裝置；首次使用會從 Hugging Face 下載約 152 MB 的固定模型，可能需要一些時間，而且可以取消。這個數字只涵蓋模型圖；分詞器和 WASM 執行期資源可能另行下載。"])}),
  terms: Object.freeze({ title: "服務條款", body: Object.freeze(["Matter 仍是預覽軟體，正式服務條款尚未發布。", "產品仍在驗證階段，請為無法替代的材料保留匯出副本。"])}),
});

const JAPANESE_INFO: CanvasChromeInfo = Object.freeze({
  about: Object.freeze({ title: "Matter について", body: Object.freeze([
    "Matter は、考えが答えになる前に、その考えと留まるための環境です。",
    "Matter は未完成の考えに形を与えるためのインターフェースです。声が言葉を運び、ジェスチャーが触れる場所と変化の量を決め、根のある構造が系譜を保ちます。",
    "これはチャットで答えを待つのではなく、素材の中で AI と考える方法です。未完成な考えにも、迷いを残し、触れ、育てる余白があります。",
    "AI は言葉に知性を与え、Matter は思考に身体を与えます。",
    "初期プレビューです。リアルタイム音声入力、音声の整形、Matter への質問は利用できます。素材を変換する生成機能はまだ利用できません。",
    <PToQAttribution after=" の project です。" before="Matter は " key="attribution" />,
  ]) }),
  inquiry: Object.freeze({ title: "Matter に尋ねる", body: Object.freeze([
    "この画面に含まれている素材について短く尋ねます。尋ねても素材は変わりません。",
    "なげなわで言葉を囲み、伸縮で変化の量を決め、展開で関連する考えを育て、取り消すで直前の変更を戻します。",
  ]) }),
  pricing: Object.freeze({ title: "料金", body: Object.freeze(["Matter はプレビュー中です。このビルドに有料プランや決済はありません。"])}),
  privacy: Object.freeze({ title: "プライバシー", body: Object.freeze(["素材は、書き出しまたはモデルによる変更を行わない限り、このブラウザに保存されます。", "正式なプライバシーポリシーはまだありません。各モデル呼び出しには、その処理に必要な範囲の素材だけが渡されます。問い合わせでは、上限内の Lasso で選んだ言葉、またはこの画面に含まれている範囲内の素材だけを送り、除外した素材は送りません。", "音声入力は通常、ブラウザ管理の認識機能を使うため、サービス側の扱いはブラウザに依存します。Matter が端末内認識へ切り替わる場合、音声はこの端末に残ります。初回は Hugging Face から約 152 MB の固定モデルを取得するため時間がかかることがありますが、キャンセルできます。この数値はモデルグラフのみで、トークナイザーと WASM ランタイムの資産は別途取得されることがあります。"])}),
  terms: Object.freeze({ title: "利用規約", body: Object.freeze(["Matter はプレビューソフトウェアで、正式な利用規約はまだありません。", "置き換えられない素材は、検証中のあいだ書き出しを保管してください。"])}),
});

const GERMAN_INFO: CanvasChromeInfo = Object.freeze({
  about: Object.freeze({ title: "Über Matter", body: Object.freeze([
    "Matter lädt dazu ein, bei einem Gedanken zu bleiben, bevor er zu einer Antwort wird.",
    "Matter ist eine Schnittstelle für unfertige Gedanken. Die Stimme bringt Sprache herein, Gesten berühren genaues Material und bestimmen das Maß der Veränderung, eine verwurzelte Struktur bewahrt die Herkunft jedes Gedankens.",
    "Es ist eine Art, mit KI im Material zu denken, nicht in einem Chat auf Antworten zu warten. Unfertige Gedanken dürfen unsicher bleiben, berührt werden und weiterwachsen.",
    "KI gibt Sprache Intelligenz. Matter gibt Gedanken einen Körper.",
    "Dies ist eine frühe Vorschau. Live-Spracheingabe, Transkriptreparatur und Matter fragen sind verfügbar; generative Materialtransformation bleibt deaktiviert.",
    <PToQAttribution after="." before="Matter ist ein project von " key="attribution" />,
  ]) }),
  inquiry: Object.freeze({ title: "Matter fragen", body: Object.freeze([
    "Stelle eine kurze Frage zu dem Material, das auf dieser Fläche einbezogen ist. Eine Frage verändert es nicht.",
    "Mit Lasso markierst du Sprache, mit Stretch bestimmst du das Ausmaß, Verzweigen erzeugt einen verwandten Gedanken und Rückgängig macht die letzte Änderung rückgängig.",
  ]) }),
  pricing: Object.freeze({ title: "Preise", body: Object.freeze(["Matter ist in der Vorschau. Dieser Build hat keinen kostenpflichtigen Plan und keine Kasse."])}),
  privacy: Object.freeze({ title: "Datenschutz", body: Object.freeze(["Material bleibt in diesem Browser, außer du exportierst es oder startest eine modellgestützte Änderung.", "Eine veröffentlichte Datenschutzerklärung gibt es noch nicht. Jeder Modellaufruf erhält nur das für seine begrenzte Aufgabe nötige Material. Eine Frage sendet begrenztes, mit Lasso markiertes Sprachmaterial oder das begrenzte, auf dieser Fläche einbezogene Material; zurückgestelltes Material wird nicht gesendet.", "Spracheingabe nutzt normalerweise die browserverwaltete Erkennung; wie deren Dienst mit Daten umgeht, hängt vom Browser ab. Falls Matter auf Erkennung auf dem Gerät zurückfällt, bleibt das Audio auf diesem Gerät. Beim ersten Mal wird ein festes Modell von etwa 152 MB von Hugging Face geladen; das kann dauern und lässt sich abbrechen. Diese Angabe umfasst die Modellgraphen; Tokenizer- und WASM-Laufzeitressourcen können getrennt geladen werden."])}),
  terms: Object.freeze({ title: "Nutzungsbedingungen", body: Object.freeze(["Matter ist Vorschau-Software; veröffentlichte Nutzungsbedingungen gibt es noch nicht.", "Bewahre für unersetzliches Material einen Export auf, solange das Produkt erprobt wird."])}),
});

export const CANVAS_CHROME_INFO: Readonly<Record<CanvasLanguage, CanvasChromeInfo>> = Object.freeze({
  "en-US": ENGLISH_INFO,
  "zh-CN": CHINESE_INFO,
  "zh-TW": TRADITIONAL_CHINESE_INFO,
  "ja-JP": JAPANESE_INFO,
  "de-DE": GERMAN_INFO,
});

const CANVAS_CHROME_COPY: Readonly<Record<CanvasLanguage, CanvasChromeCopy>> = Object.freeze({
  "en-US": Object.freeze({
    about: "About",
    ask: "Ask",
    askPlaceholder: "Ask about this material",
    asking: "Asking…",
    appearance: Object.freeze({ auto: "Auto", dark: "Dark", light: "Light" }),
    appearanceLabel: "Appearance",
    close: "Close",
    closeMenu: "Close Matter menu",
    dictate: "Dictate",
    dictateCancel: "Cancel dictation",
    dictateStop: "Stop dictating",
    fxLabel: "Leaf shadows",
    inquiry: "Ask Matter",
    information: "Information",
    language: "Language",
    listening: "Listening",
    transcribing: "Finishing the dictation…",
    menu: "Matter",
    noticeModelUnavailable: "Matter received this, but no answer model is connected yet.",
    noticeNoMaterial: "There is no material to answer about yet.",
    noticeRateLimited: "Matter has this question. Give it a moment before asking again.",
    noticeBusy: "Matter has this question but is busy right now. Try again shortly.",
    noticeTimedOut: "Matter received this question, but the answer did not arrive in time. Try again.",
    noticeTemporarilyUnavailable: "Matter received this question but could not answer it this time.",
    noticeUnreachable: "Matter could not be reached. The question was not sent further.",
    noticeVoiceDenied: "Microphone access was declined, so nothing was heard.",
    noticeVoiceFailed: "Dictation stopped early. Anything already heard was kept.",
    noticeVoiceUnsupported: "This browser cannot dictate. Typing still works.",
    on: "On",
    off: "Off",
    openMenu: "Open Matter menu",
    preferences: "Preferences",
    pricing: "Pricing",
    privacy: "Privacy",
    recordUnsaved: "This record has not saved locally.",
    settings: "Matter settings",
    terms: "Terms",
  }),
  "zh-CN": Object.freeze({
    about: "关于",
    ask: "询问",
    askPlaceholder: "问一句关于这份材料的话",
    asking: "正在询问…",
    appearance: Object.freeze({ auto: "自动", dark: "深色", light: "浅色" }),
    appearanceLabel: "外观",
    close: "关闭",
    closeMenu: "关闭 Matter 菜单",
    dictate: "口述",
    dictateCancel: "取消口述",
    dictateStop: "停止口述",
    fxLabel: "树影",
    inquiry: "询问 Matter",
    information: "关于",
    language: "语言",
    listening: "正在听",
    transcribing: "正在整理口述…",
    menu: "Matter",
    noticeModelUnavailable: "Matter 收到了，但还没有连接可以回答的模型。",
    noticeNoMaterial: "还没有材料可以回答。",
    noticeRateLimited: "Matter 收到了这句话，先等一下再问。",
    noticeBusy: "Matter 收到了这句话，但现在有点忙，稍后再试。",
    noticeTimedOut: "Matter 收到了这句话，但回答没有及时回来。可以再试一次。",
    noticeTemporarilyUnavailable: "Matter 收到了这句话，但这一次没能回答。",
    noticeUnreachable: "没能连上 Matter，这句话没有继续发送。",
    noticeVoiceDenied: "麦克风权限被拒绝，没有听到任何内容。",
    noticeVoiceFailed: "口述提前结束，已经听到的部分保留了下来。",
    noticeVoiceUnsupported: "此浏览器无法口述，但仍然可以打字。",
    on: "开",
    off: "关",
    openMenu: "打开 Matter 菜单",
    preferences: "偏好设置",
    pricing: "定价",
    privacy: "隐私政策",
    recordUnsaved: "这份记录还没有保存在本地。",
    settings: "Matter 设置",
    terms: "服务条款",
  }),
  "zh-TW": Object.freeze({
    about: "關於",
    ask: "詢問",
    askPlaceholder: "問一句關於這份材料的話",
    asking: "正在詢問…",
    appearance: Object.freeze({ auto: "自動", dark: "深色", light: "淺色" }),
    appearanceLabel: "外觀",
    close: "關閉",
    closeMenu: "關閉 Matter 選單",
    dictate: "口述",
    dictateCancel: "取消口述",
    dictateStop: "停止口述",
    fxLabel: "樹影",
    inquiry: "詢問 Matter",
    information: "資訊",
    language: "語言",
    listening: "正在聽",
    transcribing: "正在整理口述…",
    menu: "Matter",
    noticeModelUnavailable: "Matter 收到了，但還沒有連接可以回答的模型。",
    noticeNoMaterial: "還沒有材料可以回答。",
    noticeRateLimited: "Matter 收到了這句話，先等一下再問。",
    noticeBusy: "Matter 收到了這句話，但現在有點忙，稍後再試。",
    noticeTimedOut: "Matter 收到了這句話，但回答沒有及時回來。可以再試一次。",
    noticeTemporarilyUnavailable: "Matter 收到了這句話，但這一次未能回答。",
    noticeUnreachable: "沒能連上 Matter，這句話沒有繼續傳送。",
    noticeVoiceDenied: "麥克風權限被拒絕，沒有聽到任何內容。",
    noticeVoiceFailed: "口述提前結束，已聽到的部分保留了下來。",
    noticeVoiceUnsupported: "此瀏覽器無法口述，但仍然可以打字。",
    on: "開",
    off: "關",
    openMenu: "開啟 Matter 選單",
    preferences: "偏好設定",
    pricing: "定價",
    privacy: "隱私",
    recordUnsaved: "這份記錄尚未儲存在本機。",
    settings: "Matter 設定",
    terms: "服務條款",
  }),
  "ja-JP": Object.freeze({
    about: "概要",
    ask: "尋ねる",
    askPlaceholder: "この素材について尋ねる",
    asking: "問い合わせ中…",
    appearance: Object.freeze({ auto: "自動", dark: "ダーク", light: "ライト" }),
    appearanceLabel: "外観",
    close: "閉じる",
    closeMenu: "Matter メニューを閉じる",
    dictate: "音声入力",
    dictateCancel: "音声入力をキャンセル",
    dictateStop: "音声入力を停止",
    fxLabel: "葉の影",
    inquiry: "Matter に尋ねる",
    information: "情報",
    language: "言語",
    listening: "聞いています",
    transcribing: "音声入力を整えています…",
    menu: "Matter",
    noticeModelUnavailable: "Matter は受け取りましたが、答えるモデルがまだ接続されていません。",
    noticeNoMaterial: "まだ答える材料がありません。",
    noticeRateLimited: "Matter はこの問いを受け取りました。少し待ってからもう一度どうぞ。",
    noticeBusy: "Matter はこの問いを受け取りましたが、今は混み合っています。少し後でどうぞ。",
    noticeTimedOut: "Matter はこの問いを受け取りましたが、回答が間に合いませんでした。もう一度お試しください。",
    noticeTemporarilyUnavailable: "Matter はこの問いを受け取りましたが、今回は回答できませんでした。",
    noticeUnreachable: "Matter に接続できず、この問いは送信されませんでした。",
    noticeVoiceDenied: "マイクへのアクセスが拒否されたため、何も聞き取れませんでした。",
    noticeVoiceFailed: "音声入力が途中で終了しました。聞き取った内容は保持されています。",
    noticeVoiceUnsupported: "このブラウザは音声入力に対応していません。入力は利用できます。",
    on: "オン",
    off: "オフ",
    openMenu: "Matter メニューを開く",
    preferences: "設定",
    pricing: "料金",
    privacy: "プライバシー",
    recordUnsaved: "この記録はまだこの端末に保存されていません。",
    settings: "Matter の設定",
    terms: "利用規約",
  }),
  "de-DE": Object.freeze({
    about: "Über",
    ask: "Fragen",
    askPlaceholder: "Zu diesem Material fragen",
    asking: "Wird gefragt …",
    appearance: Object.freeze({ auto: "Automatisch", dark: "Dunkel", light: "Hell" }),
    appearanceLabel: "Darstellung",
    close: "Schließen",
    closeMenu: "Matter-Menü schließen",
    dictate: "Diktieren",
    dictateCancel: "Diktat abbrechen",
    dictateStop: "Diktat stoppen",
    fxLabel: "Blattschatten",
    inquiry: "Matter fragen",
    information: "Informationen",
    language: "Sprache",
    listening: "Hört zu",
    transcribing: "Diktat wird verarbeitet …",
    menu: "Matter",
    noticeModelUnavailable: "Matter hat die Frage erhalten, aber noch ist kein Antwortmodell verbunden.",
    noticeNoMaterial: "Es gibt noch kein Material für eine Antwort.",
    noticeRateLimited: "Matter hat die Frage. Warte einen Moment, bevor du erneut fragst.",
    noticeBusy: "Matter hat die Frage, ist aber gerade ausgelastet. Versuche es gleich noch einmal.",
    noticeTimedOut: "Matter hat die Frage erhalten, aber die Antwort kam nicht rechtzeitig. Versuche es erneut.",
    noticeTemporarilyUnavailable: "Matter hat die Frage erhalten, konnte sie diesmal aber nicht beantworten.",
    noticeUnreachable: "Matter war nicht erreichbar; die Frage wurde nicht weitergesendet.",
    noticeVoiceDenied: "Der Mikrofonzugriff wurde abgelehnt; es wurde nichts gehört.",
    noticeVoiceFailed: "Das Diktat endete vorzeitig. Bereits Gehörtes wurde behalten.",
    noticeVoiceUnsupported: "Dieser Browser kann nicht diktieren. Tippen funktioniert weiterhin.",
    on: "An",
    off: "Aus",
    openMenu: "Matter-Menü öffnen",
    preferences: "Einstellungen",
    pricing: "Preise",
    privacy: "Datenschutz",
    recordUnsaved: "Dieser Verlauf wurde noch nicht lokal gespeichert.",
    settings: "Matter-Einstellungen",
    terms: "Nutzungsbedingungen",
  }),
});

const INFO_OVERLAYS = new Set<CanvasChromeInfoId>([
  "about",
  "pricing",
  "privacy",
  "terms",
]);

const MODAL_OVERLAYS = new Set<CanvasChromeOverlay>([
  ...INFO_OVERLAYS,
  "mobile",
]);

// Inquiry stays over the material rather than making the material inert.
const MENU_OVERLAYS = new Set<CanvasChromeOverlay>(["settings", "language", "inquiry"]);

/**
 * A pointer-down on the paper or the editing rail is how a person addresses
 * material — starting a lasso is the gesture that gives an inquiry its
 * selection scope. Treating it as a dismissal made a selection-scoped question
 * impossible to ask: reaching for the passage discarded the exchange first.
 * An actual scope change still resets the composer through `scope-changed`.
 */
function addressesMaterial(target: Node): boolean {
  const element = target instanceof Element ? target : target.parentElement;
  return element?.closest(".matter-document, .tool-rail") != null;
}


const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export const CanvasChrome = forwardRef<CanvasChromeHandle, CanvasChromeProps>(function CanvasChrome({
  inquiryContext,
  inquiryRecord,
  onInquiryOpen,
  preferences,
  resolvedAppearance,
  setAppearance,
  setLanguage,
  setLeafFx,
}: CanvasChromeProps, forwardedRef) {
  const [overlay, setOverlay] = useState<CanvasChromeOverlay>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const languageButtonRef = useRef<HTMLButtonElement>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const askButtonRef = useRef<HTMLButtonElement>(null);
  const inquiryAnchorRef = useRef<HTMLDivElement>(null);
  const inquiryBubbleRef = useRef<InquiryBubbleHandle>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const copy = CANVAS_CHROME_COPY[preferences.language];
  const info = CANVAS_CHROME_INFO[preferences.language];
  const languageLabel = CANVAS_LANGUAGE_OPTIONS.find(
    (option) => option.value === preferences.language,
  )?.label ?? preferences.language;
  const appearanceLabel = copy.appearance[preferences.appearance];
  const modalOpen = MODAL_OVERLAYS.has(overlay);

  const dismissInquiry = useCallback(() => {
    inquiryBubbleRef.current?.invalidate();
    returnFocusRef.current = null;
    setOverlay((current) => current === "inquiry" ? null : current);
  }, []);

  useImperativeHandle(forwardedRef, () => ({ closeInquiry: dismissInquiry }), [dismissInquiry]);

  const closeOverlay = useCallback((restoreFocus = true) => {
    if (overlay === "inquiry") inquiryBubbleRef.current?.invalidate();
    setOverlay(null);
    const returnTarget = returnFocusRef.current;
    returnFocusRef.current = null;
    if (restoreFocus && returnTarget?.isConnected) {
      requestAnimationFrame(() => focusWithoutScroll(returnTarget));
    }
  }, [overlay]);

  const openOverlay = useCallback((
    next: Exclude<CanvasChromeOverlay, null>,
    trigger: HTMLElement | null,
  ) => {
    if (overlay === "inquiry" && next !== "inquiry") inquiryBubbleRef.current?.invalidate();
    if (next === "inquiry") onInquiryOpen?.();
    returnFocusRef.current = trigger;
    setOverlay(next);
  }, [onInquiryOpen, overlay]);

  const toggleMenu = useCallback((
    next: "settings" | "language" | "inquiry",
    trigger: HTMLElement | null,
  ) => {
    if (overlay === "inquiry") inquiryBubbleRef.current?.invalidate();
    if (next === "inquiry" && overlay !== "inquiry") onInquiryOpen?.();
    setOverlay((current) => {
      if (current === next) {
        returnFocusRef.current = null;
        return null;
      }
      returnFocusRef.current = trigger;
      return next;
    });
  }, [onInquiryOpen, overlay]);

  useEffect(() => {
    if (overlay === null) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!MENU_OVERLAYS.has(overlay)) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (overlay === "inquiry" && addressesMaterial(target)) return;
      const region = overlay === "settings"
        ? [settingsMenuRef.current, settingsButtonRef.current]
        : overlay === "language"
          ? [languageMenuRef.current, languageButtonRef.current]
          : [inquiryAnchorRef.current, askButtonRef.current];
      if (!region.some((element) => element?.contains(target))) closeOverlay(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // Closing the inquiry discards its draft and answers, so an Escape that
      // is only dismissing an IME candidate window must not reach it.
      if (isCancelEscape({ key: event.key, isComposing: event.isComposing })) {
        event.preventDefault();
        closeOverlay();
        return;
      }
      if (overlay === "settings") moveMenuFocus(event, settingsMenuRef.current);
      else if (overlay === "language") moveMenuFocus(event, languageMenuRef.current);
      else if (MODAL_OVERLAYS.has(overlay)) trapTabKey(event, dialogRef.current);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeOverlay, overlay]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const onBreakpointChange = () => {
      inquiryBubbleRef.current?.invalidate();
      returnFocusRef.current = null;
      setOverlay(null);
    };
    query.addEventListener("change", onBreakpointChange);
    return () => query.removeEventListener("change", onBreakpointChange);
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const frame = requestAnimationFrame(() => {
      focusWithoutScroll(getFocusable(dialogRef.current)[0]);
    });
    return () => cancelAnimationFrame(frame);
  }, [modalOpen, overlay]);

  useEffect(() => {
    if (!modalOpen) return;
    const root = rootRef.current;
    const canvas = root?.closest<HTMLElement>(".matter-document");
    if (root == null || canvas == null) return;

    const shell = canvas.closest<HTMLElement>(".matter-shell");
    // The docked material index is a sibling of the paper, not a child of it,
    // so inerting the canvas alone left it clickable behind an aria-modal
    // dialog at desk widths, where it is always visible.
    const siblings = [
      shell?.querySelector<HTMLElement>(".tool-rail") ?? null,
      shell?.querySelector<HTMLElement>(".material-files") ?? null,
    ].filter((element): element is HTMLElement => element !== null);

    const records = new Map<HTMLElement, Readonly<{ ariaHidden: string | null; inert: boolean }>>();
    const hide = (element: HTMLElement) => {
      if (element === root || records.has(element)) return;
      records.set(element, { ariaHidden: element.getAttribute("aria-hidden"), inert: element.inert });
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    };
    const hideCanvasChildren = () => {
      for (const child of Array.from(canvas.children)) {
        if (child instanceof HTMLElement) hide(child);
      }
    };

    hideCanvasChildren();
    for (const sibling of siblings) hide(sibling);
    canvas.setAttribute("data-canvas-modal-open", "true");

    // A snapshot taken once leaves anything React mounts later — the empty-state
    // swap, a lasso count — tabbable behind the dialog.
    const observer = new MutationObserver(hideCanvasChildren);
    observer.observe(canvas, { childList: true });

    return () => {
      observer.disconnect();
      canvas.removeAttribute("data-canvas-modal-open");
      for (const [element, record] of records) {
        if (!element.isConnected) continue;
        element.inert = record.inert;
        if (record.ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", record.ariaHidden);
      }
    };
  }, [modalOpen]);

  const openInfo = useCallback((id: CanvasChromeInfoId, trigger: HTMLElement | null) => {
    if (overlay === "mobile") trigger = mobileTriggerRef.current;
    else if (overlay === "settings") trigger = settingsButtonRef.current;
    openOverlay(id, trigger);
  }, [openOverlay, overlay]);

  const openMenuFromKeyboard = useCallback((
    event: ReactKeyboardEvent<HTMLButtonElement>,
    name: "settings" | "language",
    menuRef: RefObject<HTMLDivElement | null>,
  ) => {
    if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openOverlay(name, event.currentTarget);
    requestAnimationFrame(() => {
      const focusable = getFocusable(menuRef.current);
      const index = event.key === "ArrowUp" ? focusable.length - 1 : 0;
      focusWithoutScroll(focusable[index]);
    });
  }, [openOverlay]);

  const cycleAppearance = useCallback(() => {
    const currentIndex = CANVAS_APPEARANCE_OPTIONS.findIndex(
      (option) => option.value === preferences.appearance,
    );
    const nextIndex = (currentIndex + 1) % CANVAS_APPEARANCE_OPTIONS.length;
    setAppearance(CANVAS_APPEARANCE_OPTIONS[nextIndex]!.value);
  }, [preferences.appearance, setAppearance]);

  return (
    <div
      className={styles.root}
      data-canvas-chrome
      // The shell's wheel listener is native and attached lower in the tree, so
      // it runs before React's delegated `onWheel` below and cannot be stopped
      // by it. Without this attribute the shell claims the wheel while a lasso
      // is active or the canvas is panning — the two modes Ask Matter is opened
      // from — and the inquiry record cannot be scrolled by pointer at all.
      data-canvas-interactive
      data-language={preferences.language}
      data-overlay={overlay ?? "none"}
      data-resolved-appearance={resolvedAppearance}
      onPointerDown={stopPointerPropagation}
      onWheel={stopWheelPropagation}
      ref={rootRef}
    >
      <div
        aria-hidden={modalOpen || undefined}
        className={styles.desktopSurface}
        data-chrome-region="desktop"
        inert={modalOpen || undefined}
      >
        <div className={styles.topRight} data-chrome-region="top">
          <button
            className={styles.textControl}
            data-chrome-control="about"
            onClick={(event) => openInfo("about", event.currentTarget)}
            type="button"
          >
            {copy.about}
          </button>
          <button
            aria-controls="matter-settings-menu"
            aria-expanded={overlay === "settings"}
            aria-haspopup="menu"
            aria-label={copy.settings}
            className={styles.gearButton}
            data-chrome-control="settings"
            onClick={() => toggleMenu("settings", settingsButtonRef.current)}
            onKeyDown={(event) => openMenuFromKeyboard(event, "settings", settingsMenuRef)}
            ref={settingsButtonRef}
            type="button"
          >
            <GearIcon />
          </button>
        </div>

        <div
          aria-label={copy.settings}
          className={`${styles.popover} ${styles.settingsMenu}`}
          hidden={overlay !== "settings"}
          id="matter-settings-menu"
          ref={settingsMenuRef}
          role="menu"
        >
          <MenuButton icon={<PricingIcon />} label={copy.pricing} onClick={(target) => openInfo("pricing", target)} />
          <MenuButton icon={<PrivacyIcon />} label={copy.privacy} onClick={(target) => openInfo("privacy", target)} />
          <MenuButton icon={<TermsIcon />} label={copy.terms} onClick={(target) => openInfo("terms", target)} />
        </div>

        <div className={styles.bottomRight} data-chrome-region="bottom">
          <div className={styles.popoverAnchor}>
            <button
              aria-controls="matter-inquiry"
              aria-expanded={overlay === "inquiry"}
              aria-haspopup="dialog"
              className={styles.askButton}
              data-chrome-control="inquiry"
              onClick={() => toggleMenu("inquiry", askButtonRef.current)}
              ref={askButtonRef}
              type="button"
            >
              {copy.inquiry}
            </button>
            <div className={styles.inquiryAnchor} ref={inquiryAnchorRef}>
              <InquiryBubble
                context={inquiryContext}
                copy={copy}
                hidden={overlay !== "inquiry"}
                hint={typeof info.inquiry.body[0] === "string" ? info.inquiry.body[0] : ""}
                language={preferences.language}
                record={inquiryRecord}
                ref={inquiryBubbleRef}
              />
            </div>
          </div>
          <div className={styles.popoverAnchor}>
            <button
              aria-controls="matter-language-menu"
              aria-expanded={overlay === "language"}
              aria-haspopup="menu"
              aria-label={`${copy.language}: ${languageLabel}`}
              className={`${styles.chromeControl} ${styles.iconLabelControl}`}
              data-chrome-control="language"
              onClick={() => toggleMenu("language", languageButtonRef.current)}
              onKeyDown={(event) => openMenuFromKeyboard(event, "language", languageMenuRef)}
              ref={languageButtonRef}
              type="button"
            >
              <GlobeIcon />
              <span>{languageLabel}</span>
            </button>
            <div
              aria-label={`${copy.language}: ${languageLabel}`}
              className={`${styles.popover} ${styles.languageMenu}`}
              hidden={overlay !== "language"}
              id="matter-language-menu"
              ref={languageMenuRef}
              role="menu"
            >
              {CANVAS_LANGUAGE_OPTIONS.map((option) => (
                <button
                  aria-checked={option.value === preferences.language}
                  key={option.value}
                  lang={option.value}
                  onClick={() => {
                    setLanguage(option.value);
                    closeOverlay();
                  }}
                  role="menuitemradio"
                  type="button"
                >
                  <RadioMark />
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <button
            aria-label={`${copy.fxLabel}: ${preferences.leafFx ? copy.on : copy.off}`}
            aria-pressed={preferences.leafFx}
            className={`${styles.chromeControl} ${styles.iconLabelControl} ${styles.fxButton}`}
            data-chrome-control="fx"
            onClick={() => setLeafFx(!preferences.leafFx)}
            type="button"
          >
            <LeafIcon />
            <span>FX</span>
          </button>
          <button
              aria-label={`${copy.appearanceLabel}: ${appearanceLabel}`}
            className={styles.chromeControl}
            data-chrome-control="appearance"
            onClick={cycleAppearance}
            type="button"
          >
            {appearanceLabel}
          </button>
        </div>
      </div>

      <button
        aria-controls="matter-mobile-sheet"
        aria-expanded={overlay === "mobile"}
        aria-haspopup="dialog"
        aria-hidden={modalOpen || undefined}
        aria-label={copy.openMenu}
        className={styles.mobileTrigger}
        data-chrome-control="menu"
        inert={modalOpen || undefined}
        onClick={() => overlay === "mobile"
          ? closeOverlay()
          : openOverlay("mobile", mobileTriggerRef.current)}
        ref={mobileTriggerRef}
        type="button"
      >
        <MenuIcon />
      </button>

      {overlay === "mobile" ? (
        <>
          <button
            aria-label={copy.closeMenu}
            className={styles.backdrop}
            onClick={() => closeOverlay()}
            tabIndex={-1}
            type="button"
          />
          <aside
            aria-labelledby="matter-mobile-menu-title"
            aria-modal="true"
            className={styles.mobileSheet}
            id="matter-mobile-sheet"
            ref={dialogRef}
            role="dialog"
          >
            <header className={styles.sheetHeader}>
              <h2 id="matter-mobile-menu-title">{copy.menu}</h2>
              <button aria-label={copy.closeMenu} onClick={() => closeOverlay()} type="button">
                <CloseIcon />
              </button>
            </header>
            <nav aria-label="Matter menu" className={styles.mobileNav}>
              <section className={styles.mobileSection}>
                <button
                  className={styles.mobilePrimary}
                  onClick={() => openOverlay("inquiry", mobileTriggerRef.current)}
                  type="button"
                >
                  {copy.inquiry}
                </button>
              </section>
              <section className={styles.mobileSection}>
                <h3>{copy.information}</h3>
                <MobileRow icon={<AboutIcon />} label={info.about.title} onClick={(target) => openInfo("about", target)} />
                <MobileRow icon={<PricingIcon />} label={copy.pricing} onClick={(target) => openInfo("pricing", target)} />
                <MobileRow icon={<PrivacyIcon />} label={copy.privacy} onClick={(target) => openInfo("privacy", target)} />
                <MobileRow icon={<TermsIcon />} label={copy.terms} onClick={(target) => openInfo("terms", target)} />
              </section>
              <section className={styles.mobileSection}>
                <h3>{copy.preferences}</h3>
                <div className={styles.mobilePreference}>
                  <span className={styles.mobilePreferenceLabel}><GlobeIcon />{copy.language}</span>
                  <div aria-label={copy.language} className={styles.segmentedControl} role="group">
                    {CANVAS_LANGUAGE_OPTIONS.map((option) => (
                      <button
                        aria-pressed={option.value === preferences.language}
                        key={option.value}
                        lang={option.value}
                        onClick={() => setLanguage(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  aria-pressed={preferences.leafFx}
                  className={styles.mobileRow}
                  onClick={() => setLeafFx(!preferences.leafFx)}
                  type="button"
                >
                  <span className={styles.rowLeading}><LeafIcon />{copy.fxLabel}</span>
                  <span className={styles.rowValue}>{preferences.leafFx ? copy.on : copy.off}</span>
                </button>
                <button className={styles.mobileRow} onClick={cycleAppearance} type="button">
                  <span className={styles.rowLeading}><AppearanceIcon />{copy.appearanceLabel}</span>
                  <span className={styles.rowValue}>{appearanceLabel}</span>
                </button>
              </section>
            </nav>
          </aside>
        </>
      ) : null}

      {isCanvasChromeInfoOverlay(overlay) ? (
        <>
          <button
            aria-label={`${copy.close}: ${info[overlay].title}`}
            className={styles.backdrop}
            onClick={() => closeOverlay()}
            tabIndex={-1}
            type="button"
          />
          <section
            aria-labelledby={`matter-${overlay}-title`}
            aria-modal="true"
            className={styles.infoDialog}
            ref={dialogRef}
            role="dialog"
          >
            <header className={styles.dialogHeader}>
              <h2 id={`matter-${overlay}-title`}>{info[overlay].title}</h2>
              <button aria-label={`${copy.close}: ${info[overlay].title}`} onClick={() => closeOverlay()} type="button">
                <CloseIcon />
              </button>
            </header>
            <div className={styles.dialogBody}>
              {info[overlay].body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
});

type InquiryBubbleHandle = Readonly<{ invalidate: () => void }>;

const InquiryBubble = forwardRef<InquiryBubbleHandle, {
  context?: () => InquiryContextPayload;
  copy: CanvasChromeCopy;
  hidden: boolean;
  hint: string;
  language: CanvasLanguage;
  record?: InquiryRecordBinding;
}>(function InquiryBubble({
  context,
  copy,
  hidden,
  hint,
  language,
  record,
}, forwardedRef) {
  const [state, dispatch] = useReducer(reduceInquiry, undefined, createInquiryState);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);
  const authorityRef = useRef(0);
  const pendingSubmissionRef = useRef<Readonly<{ answerId: number; question: string }> | null>(null);
  const contextRef = useRef(context);
  const contextSnapshotRef = useRef<InquiryContextPayload | undefined>(undefined);
  const hasContextSnapshotRef = useRef(false);
  const followThreadRef = useRef(true);
  const listening = state.phase === "listening";
  const transcribing = state.phase === "transcribing";
  const voiceBusy = listening || transcribing;
  const text = inquiryText(state);
  const canAsk = canSubmitInquiry(state);
  const hasPendingAnswer = state.turns.some(
    (turn) => turn.role === "matter" && turn.outcome.status === "pending",
  );
  const dictation = useInquiryDictation({
    onHeard: (transcript) => dispatch({ type: "hear", value: transcript }),
    onProcessing: () => dispatch({ type: "transcribe" }),
    onSettled: () => dispatch({ type: "listened" }),
    onFailed: (notice) => dispatch({ type: "listen-failed", notice }),
  }, language);
  const cancelDictation = dictation.cancel;
  const dictationControl = projectInquiryDictationControl({
    listening,
    transcribing,
    supported: dictation.supported,
    startLabel: copy.dictate,
    stopLabel: copy.dictateStop,
    cancelLabel: copy.dictateCancel,
  });

  const invalidate = useCallback(() => {
    authorityRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    submittingRef.current = false;
    pendingSubmissionRef.current = null;
    cancelDictation();
    dispatch({ type: "close" });
  }, [cancelDictation]);

  useImperativeHandle(forwardedRef, () => ({ invalidate }), [invalidate]);

  useEffect(() => () => {
    authorityRef.current += 1;
    requestRef.current?.abort();
  }, []);

  useEffect(() => subscribePageSuspension(() => {
    // Keep completed local turns, but return an in-flight question to its
    // editable draft through the request's existing abort/fallback path.
    authorityRef.current += 1;
    requestRef.current?.abort(new DOMException("Page suspended", "AbortError"));
    requestRef.current = null;
    submittingRef.current = false;
    const pending = pendingSubmissionRef.current;
    pendingSubmissionRef.current = null;
    if (pending !== null) {
      dispatch({
        type: "withdraw-unavailable",
        id: pending.answerId,
        question: pending.question,
      });
    }
  }), []);

  useEffect(() => {
    if (!hasPendingAnswer) submittingRef.current = false;
  }, [hasPendingAnswer]);

  useLayoutEffect(() => {
    contextRef.current = context;
    if (hidden) {
      hasContextSnapshotRef.current = false;
      contextSnapshotRef.current = undefined;
      return;
    }
    const nextContext = context?.();
    if (!hasContextSnapshotRef.current) {
      hasContextSnapshotRef.current = true;
      contextSnapshotRef.current = nextContext;
      return;
    }
    const previousContext = contextSnapshotRef.current;
    contextSnapshotRef.current = nextContext;
    if (!inquiryContextChanged(previousContext, nextContext)) return;
    // A parent render may replace this callback without changing the bounded
    // material it projects. Any real change ends the request in flight, because
    // its answer would describe material that has moved.
    authorityRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    submittingRef.current = false;
    pendingSubmissionRef.current = null;
    cancelDictation();
    if (inquiryContextScopeChanged(previousContext, nextContext)) {
      dispatch({ type: "scope-changed" });
      return;
    }
    // Same material, new revision. The record is kept; only the unanswerable
    // turn settles.
    dispatch({ type: "settle-pending", outcome: UNREACHABLE });
  }, [cancelDictation, context, hidden]);

  useLayoutEffect(() => {
    if (hidden) {
      invalidate();
      return;
    }
    const frame = requestAnimationFrame(() => focusWithoutScroll(fieldRef.current ?? undefined));
    return () => cancelAnimationFrame(frame);
  }, [hidden, invalidate]);

  const ask = useCallback(() => {
    if (!canAsk || submittingRef.current) return;
    const question = inquiryText(state).trim();
    if (question.length === 0) return;
    // React state updates are asynchronous. This ref closes the small window
    // where a double-click or repeated Enter could otherwise submit the same
    // transient question twice before the disabled button is rendered.
    submittingRef.current = true;
    followThreadRef.current = true;
    const answerId = pendingAnswerId(state);
    const exchangeId = createInquiryRequestId();
    const askedAt = new Date().toISOString();
    dispatch({ type: "ask" });
    pendingSubmissionRef.current = { answerId, question };
    const payload = context?.();
    if (payload === undefined) {
      dispatch({ type: "answer", id: answerId, outcome: NO_MATERIAL });
      pendingSubmissionRef.current = null;
      return;
    }
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    const authority = authorityRef.current;
    void askInquiry({
      question,
      locale: language,
      context: payload,
      requestId: exchangeId,
      signal: request.signal,
    })
      .then((outcome) => {
        const currentContext = contextRef.current?.();
        if (
          authorityRef.current !== authority ||
          requestRef.current !== request ||
          currentContext === undefined ||
          !sameInquiryContext(payload, currentContext)
        ) return;
        if (outcome.status === "unavailable" && outcome.reason !== "NO_MATERIAL") {
          dispatch({ type: "withdraw-unavailable", id: answerId, question });
          pendingSubmissionRef.current = null;
          return;
        }
        dispatch({ type: "answer", id: answerId, outcome });
        pendingSubmissionRef.current = null;
        appendInquiryRecord(record, exchangeId, askedAt, question, payload, outcome);
      })
      .catch(() => {
        if (requestRef.current !== request) return;
        dispatch({ type: "withdraw-unavailable", id: answerId, question });
        pendingSubmissionRef.current = null;
      })
      .finally(() => {
        if (requestRef.current === request) {
          requestRef.current = null;
          submittingRef.current = false;
        }
      });
  }, [canAsk, context, language, record, state]);

  useEffect(() => {
    const field = fieldRef.current;
    if (field === null) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, INQUIRY_FIELD_MAX_HEIGHT)}px`;
  }, [hidden, text]);

  useLayoutEffect(() => {
    const thread = threadRef.current;
    if (thread !== null && followThreadRef.current) thread.scrollTop = thread.scrollHeight;
  }, [state.turns]);

  const trackThreadScroll = useCallback((event: ReactUIEvent<HTMLDivElement>) => {
    const thread = event.currentTarget;
    followThreadRef.current = thread.scrollHeight - thread.clientHeight - thread.scrollTop <= 2;
  }, []);

  return (
    <div
      aria-label={copy.inquiry}
      className={styles.inquiry}
      data-inquiry-phase={state.phase}
      hidden={hidden}
      id="matter-inquiry"
      role="dialog"
    >
      {state.turns.length === 0 ? null : (
        <div
          aria-live="off"
          className={styles.inquiryThread}
          data-inquiry-thread
          onScroll={trackThreadScroll}
          ref={threadRef}
        >
          {state.turns.map((turn) => <InquiryTurn copy={copy} key={turn.id} turn={turn} />)}
        </div>
      )}
      <div className={styles.inquiryComposer}>
        <textarea
          aria-label={copy.askPlaceholder}
          className={styles.inquiryField}
          data-inquiry-field
          onChange={(event) => dispatch({ type: "type", value: event.currentTarget.value })}
          onKeyDown={(event) => {
            if (!shouldSubmitInquiryOnEnter({
              key: event.key,
              shiftKey: event.shiftKey,
              isComposing: event.nativeEvent.isComposing,
              canSubmit: canAsk,
            })) return;
            event.preventDefault();
            ask();
          }}
          placeholder={copy.askPlaceholder}
          readOnly={voiceBusy}
          ref={fieldRef}
          rows={1}
          value={text}
        />
        <button
          aria-label={dictationControl.label}
          aria-pressed={dictationControl.pressed}
          className={styles.inquiryDictate}
          data-inquiry-control="dictate"
          data-voice-available={dictation.supported === true}
          disabled={dictationControl.disabled}
          onClick={() => {
            if (dictationControl.action === "cancel") {
              dictation.cancel();
              return;
            }
            if (dictationControl.action === "stop") {
              dictation.stop();
              return;
            }
            dispatch({ type: "listen" });
            dictation.start();
          }}
          type="button"
        >
          <MicIcon />
        </button>
        <button
          className={styles.inquiryAsk}
          data-inquiry-control="ask"
          disabled={!canAsk}
          onClick={ask}
          type="button"
        >
          {copy.ask}
        </button>
      </div>
      {voiceBusy || state.notice !== null || state.turns.length === 0 || record?.phase === "error" ? (
        <p
          aria-atomic="true"
          aria-live="polite"
          className={styles.inquiryStatus}
          role="status"
        >
          {record?.phase === "error" ? copy.recordUnsaved : state.notice !== null
            ? voiceNoticeCopy(copy, state.notice)
            : listening ? copy.listening
              : transcribing ? copy.transcribing
                : hint}
        </p>
      ) : null}
    </div>
  );
});

function InquiryTurn({ copy, turn }: Readonly<{ copy: CanvasChromeCopy; turn: ReturnType<typeof createInquiryState>["turns"][number] }>) {
  const [beganPending] = useState(
    () => turn.role === "matter" && turn.outcome.status === "pending",
  );
  const accessibleAnswer = turn.role === "matter" ? answerCopy(copy, turn.outcome) : undefined;

  return (
    <p
      aria-atomic={turn.role === "matter" ? "true" : undefined}
      aria-label={accessibleAnswer}
      aria-live={turn.role === "matter" && beganPending ? "polite" : "off"}
      className={styles.inquiryTurn}
      data-inquiry-role={turn.role}
      dir="auto"
    >
      {turn.role === "person" ? turn.text : (
        <InquiryAnswer animate={beganPending} copy={copy} outcome={turn.outcome} />
      )}
    </p>
  );
}

function InquiryAnswer({ animate, copy, outcome }: Readonly<{
  animate: boolean;
  copy: CanvasChromeCopy;
  outcome: InquiryTurnOutcome;
}>) {
  if (outcome.status === "pending") {
    return (
      <span aria-hidden="true" className={styles.inquiryLoading} data-inquiry-loading>
        <span>...</span>
      </span>
    );
  }
  if (outcome.status !== "answered" || !animate) {
    return <span aria-hidden="true">{answerCopy(copy, outcome)}</span>;
  }
  return <AnimatedInquiryAnswer answer={outcome.text} />;
}

function AnimatedInquiryAnswer({ answer }: Readonly<{ answer: string }>) {
  const [presentation] = useState(() => inquiryPresentationText(answer));
  const [steps] = useState(() => revealSteps(presentation.typed));
  const [text, setText] = useState(() => {
    const reducedMotion = typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return reducedMotion ? presentation.terminal : steps[0] ?? presentation.terminal;
  });

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let index = 0;
    const reveal = window.setInterval(() => {
      index += 1;
      const next = steps[index];
      if (next === undefined) {
        window.clearInterval(reveal);
        return;
      }
      setText(next);
    }, INQUIRY_REVEAL_STEP_MS);
    const settle = window.setTimeout(() => {
      window.clearInterval(reveal);
      setText(presentation.terminal);
    }, Math.max(steps.length * INQUIRY_REVEAL_STEP_MS, INQUIRY_TERMINAL_SETTLE_MS));
    return () => {
      window.clearInterval(reveal);
      window.clearTimeout(settle);
    };
  }, [presentation.terminal, steps]);

  return <span aria-hidden="true">{text}</span>;
}

function appendInquiryRecord(
  record: InquiryRecordBinding | undefined,
  exchangeId: string,
  askedAt: string,
  question: string,
  context: InquiryContextPayload,
  outcome: TerminalInquiryOutcome,
) {
  if (record === undefined) return;
  record.append(Object.freeze({
    id: exchangeId,
    askedAt,
    question,
    outcome,
    basis: Object.freeze({ treeId: context.treeId, revision: context.revision, scope: context.scope }),
  }));
}

const INQUIRY_FIELD_MAX_HEIGHT = 95;
type TerminalInquiryOutcome = Exclude<InquiryTurnOutcome, Readonly<{ status: "pending" }>>;
const NO_MATERIAL: TerminalInquiryOutcome = Object.freeze({ status: "unavailable", reason: "NO_MATERIAL" });
const UNREACHABLE: TerminalInquiryOutcome = Object.freeze({ status: "unavailable", reason: "UNREACHABLE" });

function answerCopy(copy: CanvasChromeCopy, outcome: InquiryTurnOutcome): string {
  if (outcome.status === "answered") return outcome.text;
  if (outcome.status === "pending") return copy.asking;
  switch (outcome.reason) {
    case "NO_PROVIDER": return copy.noticeModelUnavailable;
    case "NO_MATERIAL": return copy.noticeNoMaterial;
    case "RATE_LIMITED": return copy.noticeRateLimited;
    case "BUSY": return copy.noticeBusy;
    case "TIMED_OUT": return copy.noticeTimedOut;
    case "TEMPORARILY_UNAVAILABLE": return copy.noticeTemporarilyUnavailable;
    case "UNREACHABLE": return copy.noticeUnreachable;
  }
}

function voiceNoticeCopy(copy: CanvasChromeCopy, notice: InquiryVoiceNotice): string {
  switch (notice) {
    case "voice-denied": return copy.noticeVoiceDenied;
    case "voice-unsupported": return copy.noticeVoiceUnsupported;
    case "voice-failed": return copy.noticeVoiceFailed;
  }
}

export function nextMenuFocusIndex(
  key: string,
  currentIndex: number,
  itemCount: number,
): number | null {
  if (itemCount <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  if (key === "ArrowDown") return currentIndex < 0 ? 0 : (currentIndex + 1) % itemCount;
  if (key === "ArrowUp") return currentIndex < 0
    ? itemCount - 1
    : (currentIndex - 1 + itemCount) % itemCount;
  return null;
}

export function isCanvasChromeInfoOverlay(
  overlay: CanvasChromeOverlay,
): overlay is CanvasChromeInfoId {
  return overlay !== null && INFO_OVERLAYS.has(overlay as CanvasChromeInfoId);
}

function moveMenuFocus(event: KeyboardEvent, menu: HTMLElement | null) {
  const items = getFocusable(menu);
  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  const nextIndex = nextMenuFocusIndex(event.key, currentIndex, items.length);
  if (nextIndex === null) return;
  event.preventDefault();
  focusWithoutScroll(items[nextIndex]);
}

function trapTabKey(event: KeyboardEvent, dialog: HTMLElement | null) {
  if (event.key !== "Tab" || dialog === null) return;
  const focusable = getFocusable(dialog);
  if (focusable.length === 0) {
    event.preventDefault();
    focusWithoutScroll(dialog);
    return;
  }
  const first = focusable[0]!;
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    focusWithoutScroll(last);
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    focusWithoutScroll(first);
  }
}

function getFocusable(container: HTMLElement | null): HTMLElement[] {
  if (container === null) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function focusWithoutScroll(element: HTMLElement | undefined): void {
  element?.focus({ preventScroll: true });
}

function MenuButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: (target: HTMLButtonElement) => void;
}) {
  return (
    <button onClick={(event) => onClick(event.currentTarget)} role="menuitem" type="button">
      {icon}
      {label}
    </button>
  );
}

function MobileRow({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: (target: HTMLButtonElement) => void;
}) {
  return (
    <button className={styles.mobileRow} onClick={(event) => onClick(event.currentTarget)} type="button">
      <span className={styles.rowLeading}>{icon}{label}</span>
    </button>
  );
}

function stopPointerPropagation(event: ReactPointerEvent<HTMLDivElement>) {
  event.stopPropagation();
}

function stopWheelPropagation(event: ReactWheelEvent<HTMLDivElement>) {
  event.stopPropagation();
}

function ChromeSvg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      {children}
    </svg>
  );
}

function GearIcon() {
  return <ChromeSvg><path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" /><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></ChromeSvg>;
}

function GlobeIcon() {
  return <ChromeSvg><path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 0 1 9-9" /></ChromeSvg>;
}

function MicIcon() {
  return <ChromeSvg><rect x="8" y="3" width="8" height="12" rx="4" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" /></ChromeSvg>;
}

function LeafIcon() {
  return (
    <span aria-hidden="true" className={styles.leafIcon}>
      <ChromeSvg className={styles.leafShadow}><path d="M10.4 20.6v-.3l-.6-.5v-2l-.8-1.4c-1.9-2.8-2.2-5.5-.8-7.8 1.6-2.5 4.6-4.1 8.1-5.5.8 3.4 1.3 6.4.4 9.1-.8 2.5-2.8 4.1-6 4.9v3.5Z" /></ChromeSvg>
      <ChromeSvg><path d="M10.4 20.6v-.3l-.6-.5v-2l-.8-1.4c-1.9-2.8-2.2-5.5-.8-7.8 1.6-2.5 4.6-4.1 8.1-5.5.8 3.4 1.3 6.4.4 9.1-.8 2.5-2.8 4.1-6 4.9v3.5Z" /></ChromeSvg>
    </span>
  );
}

function PricingIcon() {
  return <ChromeSvg><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3Z" /></ChromeSvg>;
}

function PrivacyIcon() {
  return <ChromeSvg><path d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2Zm10-10V7a4 4 0 0 0-8 0v4h8Z" /></ChromeSvg>;
}

function TermsIcon() {
  return <ChromeSvg><path d="M12 6.04A8.97 8.97 0 0 0 6 3.75c-1.05 0-2.06.18-3 .51v14.25A8.99 8.99 0 0 1 6 18c2.3 0 4.41.87 6 2.29m0-14.25A8.97 8.97 0 0 1 18 3.75c1.05 0 2.06.18 3 .51v14.25A8.99 8.99 0 0 0 18 18a8.97 8.97 0 0 0-6 2.29m0-14.25v14.25" /></ChromeSvg>;
}

function AboutIcon() {
  return <ChromeSvg><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></ChromeSvg>;
}

function AppearanceIcon() {
  return <ChromeSvg><path d="M20 15.4A8 8 0 1 1 8.6 4a6.5 6.5 0 0 0 11.4 11.4Z" /></ChromeSvg>;
}

function MenuIcon() {
  return <ChromeSvg><path d="M3 6h18M3 12h18M3 18h18" /></ChromeSvg>;
}

function CloseIcon() {
  return <ChromeSvg><path d="m6 18 12-12M6 6l12 12" /></ChromeSvg>;
}

function RadioMark() {
  return <span aria-hidden="true" className={styles.radioMark} />;
}
