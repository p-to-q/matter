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
  type MouseEvent as ReactMouseEvent,
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
  type InquiryNotice,
  type InquiryTurnOutcome,
} from "./inquiry-composer";
import { useInquiryDictation } from "./use-inquiry-dictation";
import { shouldSubmitInquiryOnEnter } from "./inquiry-submit-key";
import { askInquiry, createInquiryRequestId } from "../interaction/inquiry-client";
import type { InquiryContextPayload } from "../protocol/inquiry-contract";
import {
  sameInquiryContextOwner,
  subscribeInquiryUnload,
  type InquiryContextOwner,
} from "./inquiry-context-lifecycle";
import styles from "./CanvasChrome.module.css";
import { useEscapeLayer } from "./escape-layers";
import type { InquiryRecordBinding } from "../interaction/use-inquiry-record";
import { preloadNow, preloadWhenIdle } from "../interaction/idle-preload";
import { preloadableComponent } from "./preloadable-component";

// The provider form renders nothing until the API dialog opens. Its chunk
// loads after first paint, or when a menu offering it opens; the form mounts
// when that chunk arrives, or on first open if sooner, and then stays mounted
// so an accepted save outlives closing the dialog.
const ApiSettingsForm = preloadableComponent(() =>
  import("./ApiSettingsForm").then((module) => module.ApiSettingsForm));

// Wiki is a low-frequency settings capability; its persistence and editor code
// must not tax the paper's initial interaction bundle. It loads when a menu
// offering it opens, or when a word's takeover that links to it opens.
const WikiSettingsSection = preloadableComponent(() =>
  import("./WikiSettingsSection").then((module) => module.loadWikiSettingsSection()));

/** Intent signal from the paper: a surface that can open Wiki has opened. */
export function preloadWikiSettings(): void {
  preloadNow(WikiSettingsSection.preload);
}

export type CanvasChromeProps = CanvasPreferencesBinding & Readonly<{
  inquiryContext?: () => InquiryContextPayload;
  inquiryOwner: InquiryContextOwner;
  inquiryRecord?: InquiryRecordBinding;
  onInquiryOpen?: () => void;
  /** Ask Matter holds a question (typed, dictated, or awaiting its answer). */
  onInquiryHoldChange?: (held: boolean) => void;
  onOverlayChange: (overlay: CanvasChromeOverlay) => void;
  overlay: CanvasChromeOverlay;
}>;

export type CanvasChromeHandle = Readonly<{
  /** Synchronously revokes Ask Matter before another material AI surface opens. */
  closeInquiry: () => void;
  /**
   * Opens the Wiki settings dialog on one canonical term. This is a narrow
   * request channel for an error-local takeover; it decides nothing.
   */
  openWiki: (term: WikiSettingsFocusTerm, trigger: HTMLElement | null) => void;
}>;

export type WikiSettingsFocusTerm = Readonly<{ canonical: string; locale: CanvasLanguage }>;

export type CanvasChromeOverlay =
  | "inquiry"
  | "settings"
  | "language"
  | "mobile"
  | "api"
  | "wiki"
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
  api: string;
  ask: string;
  /** Replaces Ask while a submitted question waits; explicit cancellation. */
  askCancel: string;
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
  menuNavigation: string;
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
  wiki: string;
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

const CHROME_INFO_FLOOR: Readonly<Record<CanvasLanguage, CanvasChromeInfo>> = {
  "en-US": {
    "about": {
      "title": "About Matter",
      "body": [
        "Loading."
      ]
    },
    "pricing": {
      "title": "Pricing",
      "body": [
        "Loading."
      ]
    },
    "privacy": {
      "title": "Privacy",
      "body": [
        "Loading."
      ]
    },
    "terms": {
      "title": "Terms",
      "body": [
        "Loading."
      ]
    },
    "inquiry": {
      "title": "Ask Matter",
      "body": [
        "Ask one short question about the material included on this canvas. Asking never changes it."
      ]
    }
  },
  "zh-CN": {
    "about": {
      "title": "关于 Matter",
      "body": [
        "正在加载。"
      ]
    },
    "pricing": {
      "title": "定价",
      "body": [
        "正在加载。"
      ]
    },
    "privacy": {
      "title": "隐私",
      "body": [
        "正在加载。"
      ]
    },
    "terms": {
      "title": "服务条款",
      "body": [
        "正在加载。"
      ]
    },
    "inquiry": {
      "title": "询问 Matter",
      "body": [
        "就画面里被纳入的材料问一句短问题。询问不会改变它。"
      ]
    }
  },
  "zh-TW": {
    "about": {
      "title": "關於 Matter",
      "body": [
        "正在加载。"
      ]
    },
    "pricing": {
      "title": "定價",
      "body": [
        "正在加载。"
      ]
    },
    "privacy": {
      "title": "隱私",
      "body": [
        "正在加载。"
      ]
    },
    "terms": {
      "title": "服務條款",
      "body": [
        "正在加载。"
      ]
    },
    "inquiry": {
      "title": "詢問 Matter",
      "body": [
        "就畫面裡被納入的材料問一句短問題。詢問不會改變它。"
      ]
    }
  },
  "ja-JP": {
    "about": {
      "title": "Matter について",
      "body": [
        "読み込み中。"
      ]
    },
    "pricing": {
      "title": "料金",
      "body": [
        "読み込み中。"
      ]
    },
    "privacy": {
      "title": "プライバシー",
      "body": [
        "読み込み中。"
      ]
    },
    "terms": {
      "title": "利用規約",
      "body": [
        "読み込み中。"
      ]
    },
    "inquiry": {
      "title": "Matter に尋ねる",
      "body": [
        "この画面に含まれている素材について短く尋ねます。尋ねても素材は変わりません。"
      ]
    }
  },
  "de-DE": {
    "about": {
      "title": "Über Matter",
      "body": [
        "Wird geladen."
      ]
    },
    "pricing": {
      "title": "Preise",
      "body": [
        "Wird geladen."
      ]
    },
    "privacy": {
      "title": "Datenschutz",
      "body": [
        "Wird geladen."
      ]
    },
    "terms": {
      "title": "Nutzungsbedingungen",
      "body": [
        "Wird geladen."
      ]
    },
    "inquiry": {
      "title": "Matter fragen",
      "body": [
        "Stelle eine kurze Frage zu dem Material, das auf dieser Fläche einbezogen ist. Eine Frage verändert es nicht."
      ]
    }
  }
};

const CANVAS_CHROME_COPY: Readonly<Record<CanvasLanguage, CanvasChromeCopy>> = Object.freeze({
  "en-US": Object.freeze({
    about: "About",
    api: "Model API",
    ask: "Ask",
    askCancel: "Cancel",
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
    menuNavigation: "Matter menu",
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
    wiki: "WIKI",
  }),
  "zh-CN": Object.freeze({
    about: "关于",
    api: "模型 API",
    ask: "询问",
    askCancel: "取消",
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
    menuNavigation: "Matter 菜单",
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
    wiki: "词典 WIKI",
  }),
  "zh-TW": Object.freeze({
    about: "關於",
    api: "模型 API",
    ask: "詢問",
    askCancel: "取消",
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
    menuNavigation: "Matter 選單",
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
    wiki: "詞典 WIKI",
  }),
  "ja-JP": Object.freeze({
    about: "概要",
    api: "モデル API",
    ask: "尋ねる",
    askCancel: "キャンセル",
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
    menuNavigation: "Matter メニュー",
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
    wiki: "辞書 WIKI",
  }),
  "de-DE": Object.freeze({
    about: "Über",
    api: "Modell-API",
    ask: "Fragen",
    askCancel: "Abbrechen",
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
    menuNavigation: "Matter-Menü",
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
    wiki: "WÖRTERBUCH WIKI",
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
  "api",
  "mobile",
  "wiki",
]);

/** Modal chrome temporarily owns the surface without owning its material state. */
export function canvasOverlayOwnsSurface(overlay: CanvasChromeOverlay): boolean {
  return MODAL_OVERLAYS.has(overlay);
}

/** Mirrors the compact-chrome handoff in `CanvasChrome.module.css`. */
const COMPACT_CHROME_MAX_WIDTH_PX = 767;

/**
 * The desktop menus exist only above the compact breakpoint and the compact
 * menu sheet only below it; Ask Matter and every dialog exist at both.
 */
export function overlayOutlivesBreakpoint(
  overlay: CanvasChromeOverlay,
  compact: boolean,
): boolean {
  if (overlay === "settings" || overlay === "language") return !compact;
  if (overlay === "mobile") return compact;
  return true;
}

/** Shell-level chrome that an open modal dialog makes inert with the paper. */
const MODAL_INERT_SHELL_CHROME = [
  ".tool-rail",
  ".material-files",
  ".material-files-toggle",
  ".matter-header",
].join(", ");

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
  inquiryOwner,
  inquiryRecord,
  onInquiryOpen,
  onInquiryHoldChange,
  onOverlayChange,
  overlay,
  preferences,
  resolvedAppearance,
  setAppearance,
  setLanguage,
  setLeafFx,
}: CanvasChromeProps, forwardedRef) {
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
  const [wikiFocus, setWikiFocus] = useState<Readonly<WikiSettingsFocusTerm & {
    requestId: number;
  }> | null>(null);
  const copy = CANVAS_CHROME_COPY[preferences.language];
  const [infoData, setInfoData] = useState<Readonly<Record<CanvasLanguage, CanvasChromeInfo>> | null>(null);
  const [infoFailed, setInfoFailed] = useState(false);
  useEffect(() => {
    if (infoData !== null) return;
    let current = true;
    void import("./canvas-chrome-info").then((module) => {
      if (current) { setInfoData(module.readCanvasChromeInfo()); setInfoFailed(false); }
    }, () => { if (current) setInfoFailed(true); });
    return () => { current = false; };
  }, [overlay, infoData]);
  const info = (infoData ?? CHROME_INFO_FLOOR)[preferences.language];
  const languageLabel = CANVAS_LANGUAGE_OPTIONS.find(
    (option) => option.value === preferences.language,
  )?.label ?? preferences.language;
  const appearanceLabel = copy.appearance[preferences.appearance];
  const modalOpen = canvasOverlayOwnsSurface(overlay);
  const [apiFormMounted, setApiFormMounted] = useState(false);
  if (overlay === "api" && !apiFormMounted) setApiFormMounted(true);
  // Mounted hidden, the form's first opening is an ordinary prop change: one
  // status read, never a mount that Strict Mode rehearses mid-read.
  const prepareApiForm = useCallback(
    () => ApiSettingsForm.preload().then(() => setApiFormMounted(true)),
    [],
  );
  useEffect(() => preloadWhenIdle([prepareApiForm]), [prepareApiForm]);
  useEffect(() => {
    // Opening a menu is the intent signal for the dialogs it offers.
    if (overlay !== "settings" && overlay !== "mobile") return;
    preloadNow(prepareApiForm);
    preloadNow(WikiSettingsSection.preload);
  }, [overlay, prepareApiForm]);

  const dismissInquiry = useCallback(() => {
    inquiryBubbleRef.current?.detach();
    returnFocusRef.current = null;
    if (overlay === "inquiry") onOverlayChange(null);
  }, [onOverlayChange, overlay]);


  const closeOverlay = useCallback((restoreFocus = true) => {
    if (overlay === "inquiry") inquiryBubbleRef.current?.detach();
    const closingFocus = document.activeElement;
    onOverlayChange(null);
    const returnTarget = returnFocusRef.current;
    returnFocusRef.current = null;
    if (restoreFocus && returnTarget?.isConnected) {
      requestAnimationFrame(() => {
        // A released material error may already have moved focus to its
        // recovery action. Return focus only when the closing surface still
        // owns it (or the browser dropped it to the body).
        if (documentFocusChangedToUsableTarget(closingFocus)) return;
        focusWithoutScroll(returnTarget);
      });
    }
  }, [onOverlayChange, overlay]);

  const openOverlay = useCallback((
    next: Exclude<CanvasChromeOverlay, null>,
    trigger: HTMLElement | null,
  ) => {
    if (overlay === "inquiry" && next !== "inquiry") inquiryBubbleRef.current?.detach();
    if (next === "inquiry") onInquiryOpen?.();
    returnFocusRef.current = trigger;
    onOverlayChange(next);
  }, [onInquiryOpen, onOverlayChange, overlay]);

  const toggleMenu = useCallback((
    next: "settings" | "language" | "inquiry",
    trigger: HTMLElement | null,
  ) => {
    if (overlay === "inquiry") inquiryBubbleRef.current?.detach();
    if (next === "inquiry" && overlay !== "inquiry") onInquiryOpen?.();
    if (overlay === next) {
      returnFocusRef.current = null;
      onOverlayChange(null);
      return;
    }
    returnFocusRef.current = trigger;
    onOverlayChange(next);
  }, [onInquiryOpen, onOverlayChange, overlay]);

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

  // A menu is a transient surface above the paper; Ask Matter and the dialogs
  // are panels. Either way one Escape closes only this overlay, and an Escape a
  // focused field, a gesture, or an IME candidate window already owns never
  // reaches it.
  useEscapeLayer(
    overlay !== null,
    overlay === "settings" || overlay === "language" ? "transient" : "panel",
    () => {
      closeOverlay();
      return true;
    },
  );

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${COMPACT_CHROME_MAX_WIDTH_PX}px)`);
    const onBreakpointChange = () => {
      const compact = query.matches;
      // Every trigger outside the compact menu is hidden below the breakpoint,
      // and the compact trigger is hidden above it: hand the return path to
      // the control that still exists.
      const returnTarget = returnFocusRef.current;
      if (returnTarget !== null) {
        if (compact && returnTarget !== mobileTriggerRef.current) {
          returnFocusRef.current = mobileTriggerRef.current;
        } else if (!compact && returnTarget === mobileTriggerRef.current) {
          returnFocusRef.current = overlay === "inquiry"
            ? askButtonRef.current
            : settingsButtonRef.current;
        }
      }
      // Only a surface that no longer exists at this width closes. Ask Matter
      // keeps its turns and a dialog keeps its editor across the handoff.
      if (overlayOutlivesBreakpoint(overlay, compact)) return;
      closeOverlay();
    };
    query.addEventListener("change", onBreakpointChange);
    return () => query.removeEventListener("change", onBreakpointChange);
  }, [closeOverlay, overlay]);

  useLayoutEffect(() => {
    if (!modalOpen) return;
    const frame = requestAnimationFrame(() => {
      focusWithoutScroll(getFocusable(dialogRef.current)[0]);
    });
    return () => cancelAnimationFrame(frame);
  }, [modalOpen, overlay]);

  useLayoutEffect(() => {
    if (!modalOpen) return;
    const root = rootRef.current;
    const canvas = root?.closest<HTMLElement>(".matter-document");
    if (root == null || canvas == null) return;

    const shell = canvas.closest<HTMLElement>(".matter-shell");
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

    // Shell chrome outside the paper stays live above an aria-modal dialog
    // unless it is named here: the index and its drawer handle (which sits
    // above the paper and can slide over a phone dialog), the rail, and the
    // brand header.
    const hideShellChrome = () => {
      for (const element of shell?.querySelectorAll<HTMLElement>(MODAL_INERT_SHELL_CHROME) ?? []) {
        hide(element);
      }
    };
    const hideEverythingBehind = () => {
      hideCanvasChildren();
      hideShellChrome();
    };

    hideEverythingBehind();
    canvas.setAttribute("data-canvas-modal-open", "true");

    // A snapshot taken once leaves anything React mounts later — the empty-state
    // swap, a lasso count, a drawer handle after a breakpoint — tabbable behind
    // the dialog.
    const observer = new MutationObserver(hideEverythingBehind);
    observer.observe(canvas, { childList: true });
    if (shell !== null) observer.observe(shell, { childList: true });

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

  const openApi = useCallback((trigger: HTMLElement | null) => {
    if (overlay === "mobile") trigger = mobileTriggerRef.current;
    else if (overlay === "settings") trigger = settingsButtonRef.current;
    openOverlay("api", trigger);
  }, [openOverlay, overlay]);

  const openWiki = useCallback((trigger: HTMLElement | null) => {
    if (overlay === "mobile") trigger = mobileTriggerRef.current;
    else if (overlay === "settings") trigger = settingsButtonRef.current;
    setWikiFocus(null);
    openOverlay("wiki", trigger);
  }, [openOverlay, overlay]);

  const openWikiTerm = useCallback((term: WikiSettingsFocusTerm, trigger: HTMLElement | null) => {
    setWikiFocus((current) => Object.freeze({
      canonical: term.canonical,
      locale: term.locale,
      requestId: (current?.requestId ?? 0) + 1,
    }));
    openOverlay("wiki", trigger);
  }, [openOverlay]);

  useImperativeHandle(
    forwardedRef,
    () => ({ closeInquiry: dismissInquiry, openWiki: openWikiTerm }),
    [dismissInquiry, openWikiTerm],
  );

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
          <MenuButton icon={<WikiIcon />} label={copy.wiki} onClick={openWiki} />
          <MenuButton icon={<ApiIcon />} label={copy.api} onClick={openApi} />
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
                hint={typeof info.inquiry.body[0] === "string" ? info.inquiry.body[0] : ""}
                language={preferences.language}
                onHoldChange={onInquiryHoldChange}
                owner={inquiryOwner}
                presented={overlay === "inquiry"}
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
            <nav aria-label={copy.menuNavigation} className={styles.mobileNav}>
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
                <MobileRow icon={<WikiIcon />} label={copy.wiki} onClick={openWiki} />
                <MobileRow icon={<ApiIcon />} label={copy.api} onClick={openApi} />
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
              {infoFailed ? <p role="status">{preferences.language.startsWith("zh") ? "加载失败，请重新打开。" : "Could not load. Please reopen."}</p>
                : info[overlay].body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </div>
          </section>
        </>
      ) : null}

      <button
        aria-label={`${copy.close}: ${copy.api}`}
        className={styles.backdrop}
        hidden={overlay !== "api"}
        onClick={() => closeOverlay()}
        tabIndex={-1}
        type="button"
      />
      <section
        aria-labelledby="matter-api-title"
        aria-modal="true"
        className={`${styles.infoDialog} ${styles.apiDialog}`}
        hidden={overlay !== "api"}
        ref={overlay === "api" ? dialogRef : undefined}
        role="dialog"
      >
        <header className={styles.dialogHeader}>
          <h2 id="matter-api-title">{copy.api}</h2>
          <button aria-label={`${copy.close}: ${copy.api}`} onClick={() => closeOverlay()} type="button">
            <CloseIcon />
          </button>
        </header>
        {apiFormMounted ? (
          <ApiSettingsForm
            language={preferences.language}
            presented={overlay === "api"}
          />
        ) : null}
      </section>

      {overlay === "wiki" ? (
        <>
          <button
            aria-label={`${copy.close}: ${copy.wiki}`}
            className={styles.backdrop}
            onClick={() => closeOverlay()}
            tabIndex={-1}
            type="button"
          />
          <section
            aria-labelledby="matter-wiki-title"
            aria-modal="true"
            className={`${styles.infoDialog} ${styles.wikiDialog}`}
            ref={dialogRef}
            role="dialog"
          >
            <header className={styles.dialogHeader}>
              <h2 id="matter-wiki-title">{copy.wiki}</h2>
              <button autoFocus aria-label={`${copy.close}: ${copy.wiki}`} onClick={() => closeOverlay()} type="button">
                <CloseIcon />
              </button>
            </header>
            <div className={styles.wikiDialogBody}>
              <WikiSettingsSection
                active
                focusTerm={wikiFocus}
                language={preferences.language}
              />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
});

type InquiryBubbleHandle = Readonly<{ detach: () => void }>;

const InquiryBubble = forwardRef<InquiryBubbleHandle, {
  context?: () => InquiryContextPayload;
  copy: CanvasChromeCopy;
  hint: string;
  language: CanvasLanguage;
  onHoldChange?: (held: boolean) => void;
  owner: InquiryContextOwner;
  presented: boolean;
  record?: InquiryRecordBinding;
}>(function InquiryBubble({
  context,
  copy,
  hint,
  language,
  onHoldChange,
  owner,
  presented,
  record,
}, forwardedRef) {
  const [state, dispatch] = useReducer(reduceInquiry, undefined, createInquiryState);
  const [threadScrollable, setThreadScrollable] = useState(false);
  const [submissionPending, setSubmissionPending] = useState(false);
  // Cancel takes Ask's place the moment a question is sent. It stays inert for
  // a beat so the second click of a double-click, or a click already on its
  // way, cannot revoke the question it just sent.
  const [cancelArmed, setCancelArmed] = useState(true);
  const cancelArmTimerRef = useRef<number | null>(null);
  const [statusLive, setStatusLive] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);
  const authorityRef = useRef(0);
  const pendingSubmissionRef = useRef<Readonly<{ answerId: number; question: string }> | null>(null);
  const ownerRef = useRef(owner);
  const ownerSnapshotRef = useRef<InquiryContextOwner | undefined>(undefined);
  const followThreadRef = useRef(true);
  const listening = state.phase === "listening";
  const transcribing = state.phase === "transcribing";
  const voiceBusy = listening || transcribing;
  const text = inquiryText(state);
  const canAsk = canSubmitInquiry(state) && !submissionPending;
  const hasPendingAnswer = state.turns.some(
    (turn) => turn.role === "matter" && turn.outcome.status === "pending",
  );
  // A different document instance revokes all of this, so the root waits.
  const held = hasPendingAnswer || submissionPending || voiceBusy || text.trim().length > 0;
  useEffect(() => {
    onHoldChange?.(held);
  }, [held, onHoldChange]);
  useEffect(() => () => onHoldChange?.(false), [onHoldChange]);
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

  const presentedRef = useRef(presented);
  useLayoutEffect(() => {
    presentedRef.current = presented;
  }, [presented]);

  // Detaching dismisses presentation only. A submitted question keeps its
  // request, its pending turn, and its answer; another surface closing an
  // already-hidden bubble must not drop an answer the person has not yet seen.
  const detach = useCallback(() => {
    if (!presentedRef.current) return;
    cancelDictation();
    dispatch({ type: "close" });
  }, [cancelDictation]);

  useImperativeHandle(forwardedRef, () => ({ detach }), [detach]);

  useEffect(() => () => {
    if (cancelArmTimerRef.current !== null) window.clearTimeout(cancelArmTimerRef.current);
    authorityRef.current += 1;
    const request = requestRef.current;
    requestRef.current = null;
    pendingSubmissionRef.current = null;
    submittingRef.current = false;
    request?.abort();
  }, []);

  useEffect(() => subscribeInquiryUnload(() => {
    // A real unload retires the owner. Ordinary presentation dismissal and a
    // back-forward-cache hide do not: the page may return with this question.
    authorityRef.current += 1;
    requestRef.current?.abort(new DOMException("Page exited", "AbortError"));
    requestRef.current = null;
    submittingRef.current = false;
    setSubmissionPending(false);
    const pending = pendingSubmissionRef.current;
    pendingSubmissionRef.current = null;
    if (pending !== null) {
      dispatch({
        type: "withdraw",
        id: pending.answerId,
        question: pending.question,
        reason: null,
      });
    }
  }), []);

  useEffect(() => {
    if (!hasPendingAnswer && requestRef.current === null) submittingRef.current = false;
  }, [hasPendingAnswer]);

  useLayoutEffect(() => {
    ownerRef.current = owner;
    const previousOwner = ownerSnapshotRef.current;
    ownerSnapshotRef.current = owner;
    if (previousOwner === undefined || sameInquiryContextOwner(previousOwner, owner)) {
      return;
    }
    // Content and selection may change while an answer is in flight: the turn
    // still names its captured question and basis. Only a different loaded
    // document instance revokes presentation and durable-record authority.
    authorityRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    submittingRef.current = false;
    setSubmissionPending(false);
    pendingSubmissionRef.current = null;
    cancelDictation();
    dispatch({ type: "scope-changed" });
  }, [cancelDictation, context, owner]);

  useLayoutEffect(() => {
    if (!presented) return;
    const frame = requestAnimationFrame(() => focusWithoutScroll(fieldRef.current ?? undefined));
    return () => cancelAnimationFrame(frame);
  }, [presented]);

  // The status region mounts empty with each opening and speaks one frame
  // later, so a refusal that arrived while the bubble was closed is announced
  // when it is reopened rather than read silently as initial content.
  useLayoutEffect(() => {
    if (!presented) return;
    const frame = requestAnimationFrame(() => setStatusLive(true));
    return () => {
      cancelAnimationFrame(frame);
      setStatusLive(false);
    };
  }, [presented]);

  const ask = useCallback(() => {
    if (!canAsk || submittingRef.current) return;
    const question = inquiryText(state).trim();
    if (question.length === 0) return;
    const exchangeId = createInquiryRequestId();
    if (exchangeId === null) {
      dispatch({ type: "ask-refused", reason: "UNREACHABLE" });
      return;
    }
    // React state updates are asynchronous. This ref closes the small window
    // where a double-click or repeated Enter could otherwise submit the same
    // transient question twice before the disabled button is rendered.
    submittingRef.current = true;
    setSubmissionPending(true);
    followThreadRef.current = true;
    const answerId = pendingAnswerId(state);
    const askedAt = new Date().toISOString();
    dispatch({ type: "ask" });
    pendingSubmissionRef.current = { answerId, question };
    const payload = context?.();
    if (payload === undefined) {
      dispatch({ type: "answer", id: answerId, outcome: NO_MATERIAL });
      pendingSubmissionRef.current = null;
      submittingRef.current = false;
      setSubmissionPending(false);
      return;
    }
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    setCancelArmed(false);
    if (cancelArmTimerRef.current !== null) window.clearTimeout(cancelArmTimerRef.current);
    cancelArmTimerRef.current = window.setTimeout(() => {
      cancelArmTimerRef.current = null;
      setCancelArmed(true);
    }, INQUIRY_CANCEL_ARM_MS);
    const authority = authorityRef.current;
    const requestOwner = owner;
    void askInquiry({
      question,
      locale: language,
      context: payload,
      requestId: exchangeId,
      signal: request.signal,
    })
      .then((outcome) => {
        if (
          authorityRef.current !== authority ||
          requestRef.current !== request ||
          !sameInquiryContextOwner(requestOwner, ownerRef.current)
        ) return;
        if (outcome.status === "unavailable" && outcome.reason !== "NO_MATERIAL") {
          dispatch({ type: "withdraw", id: answerId, question, reason: outcome.reason });
          pendingSubmissionRef.current = null;
          return;
        }
        dispatch({ type: "answer", id: answerId, outcome });
        pendingSubmissionRef.current = null;
        appendInquiryRecord(record, exchangeId, askedAt, question, payload, outcome);
      })
      .catch(() => {
        if (requestRef.current !== request) return;
        dispatch({ type: "withdraw", id: answerId, question, reason: "UNREACHABLE" });
        pendingSubmissionRef.current = null;
      })
      .finally(() => {
        if (requestRef.current === request) {
          requestRef.current = null;
          submittingRef.current = false;
          setSubmissionPending(false);
        }
      });
  }, [canAsk, context, language, owner, record, state]);

  // Explicit cancellation is the one person-owned way to revoke a submitted
  // question. It returns the question to the field without a notice and gives
  // a late answer no authority over either the bubble or the local record.
  const cancelPendingAsk = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    if (!cancelArmed || !inquiryCancelAccepted(event.detail)) return;
    const pending = pendingSubmissionRef.current;
    const request = requestRef.current;
    if (pending === null || request === null) return;
    requestRef.current = null;
    pendingSubmissionRef.current = null;
    submittingRef.current = false;
    setSubmissionPending(false);
    request.abort(new DOMException("Inquiry cancelled", "AbortError"));
    dispatch({ type: "withdraw", id: pending.answerId, question: pending.question, reason: null });
    requestAnimationFrame(() => focusWithoutScroll(fieldRef.current ?? undefined));
  }, [cancelArmed]);

  useEffect(() => {
    const field = fieldRef.current;
    if (field === null) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, INQUIRY_FIELD_MAX_HEIGHT)}px`;
  }, [presented, text]);

  useLayoutEffect(() => {
    const thread = threadRef.current;
    if (thread === null) {
      setThreadScrollable(false);
      return;
    }
    const sync = () => {
      if (followThreadRef.current) thread.scrollTop = thread.scrollHeight;
      setThreadScrollable(thread.scrollHeight - thread.clientHeight > 1);
    };
    sync();
    const resizeObserver = new ResizeObserver(sync);
    const mutationObserver = new MutationObserver(sync);
    resizeObserver.observe(thread);
    mutationObserver.observe(thread, { childList: true, characterData: true, subtree: true });
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [presented, state.turns]);

  const trackThreadScroll = useCallback((event: ReactUIEvent<HTMLDivElement>) => {
    const thread = event.currentTarget;
    followThreadRef.current = thread.scrollHeight - thread.clientHeight - thread.scrollTop <= 2;
  }, []);

  if (!presented) return null;

  return (
    <div
      aria-label={copy.inquiry}
      className={styles.inquiry}
      data-inquiry-phase={state.phase}
      id="matter-inquiry"
      role="dialog"
    >
      {state.turns.length === 0 ? null : (
        <div
          aria-label={copy.inquiry}
          aria-live="off"
          className={styles.inquiryThread}
          data-inquiry-thread
          data-scrollable={threadScrollable || undefined}
          onScroll={trackThreadScroll}
          ref={threadRef}
          role="region"
          tabIndex={threadScrollable ? 0 : -1}
        >
          {state.turns.map((turn) => <InquiryTurn copy={copy} key={turn.id} turn={turn} />)}
        </div>
      )}
      {/* Mounted before it speaks, so a later notice is announced. It sits
          above the composer because the bubble is anchored at its bottom: a
          hint, notice, or listening line that comes or goes then moves the
          record, never the field and its controls under the pointer. */}
      <p
        aria-atomic="true"
        aria-live="polite"
        className={styles.inquiryStatus}
        role="status"
      >
        {!statusLive ? null : record?.phase === "error" ? copy.recordUnsaved : state.notice !== null
          ? noticeCopy(copy, state.notice)
          : listening ? copy.listening
            : transcribing ? copy.transcribing
              : state.turns.length === 0 ? hint : null}
      </p>
      <div className={styles.inquiryComposer}>
        <textarea
          aria-label={copy.askPlaceholder}
          className={styles.inquiryField}
          data-inquiry-field
          onChange={(event) => dispatch({ type: "type", value: event.currentTarget.value })}
          onKeyDown={(event) => {
            if (!shouldSubmitInquiryOnEnter(event.nativeEvent, canAsk)) return;
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
        {/* Distinct keys: the control that replaces Ask is a new element, and
            focus goes back to the field rather than landing on Cancel. A press
            on either keeps focus in the field. While arming, Cancel is inert
            through aria-disabled rather than disabled: pressing a disabled
            button still blurs the field, and the second press of a
            double-click on Ask lands exactly there. */}
        {hasPendingAnswer && submissionPending ? (
          <button
            aria-disabled={!cancelArmed || undefined}
            className={styles.inquiryAsk}
            data-inquiry-control="cancel"
            key="cancel"
            onClick={cancelPendingAsk}
            onMouseDown={keepInquiryFieldFocus}
            type="button"
          >
            {copy.askCancel}
          </button>
        ) : (
          <button
            className={styles.inquiryAsk}
            data-inquiry-control="ask"
            disabled={!canAsk}
            key="ask"
            onClick={() => {
              ask();
              focusWithoutScroll(fieldRef.current ?? undefined);
            }}
            onMouseDown={keepInquiryFieldFocus}
            type="button"
          >
            {copy.ask}
          </button>
        )}
      </div>
    </div>
  );
});

function InquiryTurn({ copy, turn }: Readonly<{ copy: CanvasChromeCopy; turn: ReturnType<typeof createInquiryState>["turns"][number] }>) {
  const [beganPending] = useState(
    () => turn.role === "matter" && turn.outcome.status === "pending",
  );

  return (
    <p
      aria-atomic={turn.role === "matter" ? "true" : undefined}
      aria-live={turn.role === "matter" && beganPending ? "polite" : "off"}
      className={styles.inquiryTurn}
      data-inquiry-role={turn.role}
      dir="auto"
    >
      {turn.role === "person" ? turn.text : (
        <>
          <InquiryAnswer animate={beganPending} copy={copy} outcome={turn.outcome} />
          {/* The visible answer types itself in and stays hidden from
              assistive technology; this node carries the final text once. */}
          <span className="visually-hidden">{answerCopy(copy, turn.outcome)}</span>
        </>
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
    return <span aria-hidden="true" data-inquiry-answer-text>{answerCopy(copy, outcome)}</span>;
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

  return <span aria-hidden="true" data-inquiry-answer-text>{text}</span>;
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
/** How long Cancel stays inert after the question it would revoke was sent. */
export const INQUIRY_CANCEL_ARM_MS = 400;

/**
 * Only a deliberate single activation cancels: the second click of a
 * double-click on Ask reports `detail` 2 and must not revoke the question the
 * first click sent. Keyboard activation reports 0.
 */
export function inquiryCancelAccepted(clickDetail: number): boolean {
  return clickDetail <= 1;
}

/** The field is the composer's focus home; a pointer press on its action keeps it there. */
function keepInquiryFieldFocus(event: ReactMouseEvent<HTMLButtonElement>): void {
  event.preventDefault();
}
type TerminalInquiryOutcome = Exclude<InquiryTurnOutcome, Readonly<{ status: "pending" }>>;
const NO_MATERIAL: TerminalInquiryOutcome = Object.freeze({ status: "unavailable", reason: "NO_MATERIAL" });

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

function noticeCopy(copy: CanvasChromeCopy, notice: InquiryNotice): string {
  if (notice.kind === "answer") {
    return answerCopy(copy, Object.freeze({ status: "unavailable", reason: notice.reason }));
  }
  switch (notice.reason) {
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
  const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
  const nextIndex = nextDialogTabFocusIndex(activeIndex, focusable.length, event.shiftKey);
  if (nextIndex === null) return;
  event.preventDefault();
  focusWithoutScroll(focusable[nextIndex]);
}

/** Re-enters the modal when its formerly focused action becomes disabled. */
export function nextDialogTabFocusIndex(
  activeIndex: number,
  focusableCount: number,
  backwards: boolean,
): number | null {
  if (focusableCount <= 0) return null;
  if (activeIndex < 0 || activeIndex >= focusableCount) {
    return backwards ? focusableCount - 1 : 0;
  }
  if (backwards && activeIndex === 0) return focusableCount - 1;
  if (!backwards && activeIndex === focusableCount - 1) return 0;
  return null;
}

function getFocusable(container: HTMLElement | null): HTMLElement[] {
  if (container === null) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => (
      !element.hidden &&
      element.getAttribute("aria-hidden") !== "true" &&
      !element.matches(":disabled")
    ));
}

function focusWithoutScroll(element: HTMLElement | undefined): void {
  element?.focus({ preventScroll: true });
}

function documentFocusChangedToUsableTarget(closingFocus: Element | null): boolean {
  const active = document.activeElement;
  return active !== closingFocus &&
    active instanceof HTMLElement &&
    active !== document.body &&
    active.isConnected;
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

function ApiIcon() {
  return <ChromeSvg><path d="M9 2v6m6-6v6m3 0v4a6 6 0 0 1-12 0V8h12M12 18v4" /></ChromeSvg>;
}

function AboutIcon() {
  return <ChromeSvg><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></ChromeSvg>;
}

function WikiIcon() {
  return <ChromeSvg><path d="M6 3.5h11.5A1.5 1.5 0 0 1 19 5v15H7a2.5 2.5 0 0 1 0-5h12M7 3.5V15M10.5 8h5M10.5 11.5h4" /></ChromeSvg>;
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
