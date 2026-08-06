"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  CANVAS_APPEARANCE_OPTIONS,
  CANVAS_LANGUAGE_OPTIONS,
  type CanvasAppearance,
  type CanvasLanguage,
} from "./canvas-preferences";
import type { CanvasPreferencesBinding } from "./use-canvas-preferences";
import styles from "./CanvasChrome.module.css";

export type CanvasChromeProps = CanvasPreferencesBinding;

export type CanvasChromeOverlay =
  | "settings"
  | "language"
  | "mobile"
  | CanvasChromeInfoId
  | null;

type CanvasChromeInfoId = "about" | "help" | "pricing" | "privacy" | "terms";
type CanvasChromeInfo = Readonly<Record<CanvasChromeInfoId, Readonly<{
  title: string;
  body: readonly ReactNode[];
}>>>;
type CanvasChromeCopy = Readonly<{
  about: string;
  appearance: Readonly<Record<CanvasAppearance, string>>;
  appearanceLabel: string;
  close: string;
  closeMenu: string;
  fxLabel: string;
  help: string;
  information: string;
  language: string;
  menu: string;
  on: string;
  off: string;
  openMenu: string;
  preferences: string;
  pricing: string;
  privacy: string;
  settings: string;
  terms: string;
}>;

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
      "We are building a brain-computer interface for thoughts shaping. Voice brings language in. Gesture touches what matters and sets how much it may change. A rooted structure lets each thought keep its lineage.",
      "It is a way of thinking with AI in material, not through a chat. Unfinished thoughts deserve room to remain uncertain, to be touched, and to keep growing.",
      "AI gives language intelligence. Matter gives thought a body.",
      "This is an early, local preview. The material and gesture layer are here; live transcription and generative transformation are still being built. We are sharing it while it is becoming.",
      <PToQAttribution after="." before="Matter is a project by " key="attribution" />,
    ]),
  }),
  help: Object.freeze({
    title: "Using Matter",
    body: Object.freeze([
      "Start with Voice to admit a root thought, then select material to keep growing beneath it.",
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
      "A published privacy policy is not available for this pre-release. When generation is invoked, only the visible root-to-focus lineage is used as context.",
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
      "我们正在做一个用于塑造思想的脑机接口。声音把语言带进来；手势触碰你在意的地方，决定它可以改变多少；根状结构让每个想法保留自己的脉络。",
      "这是一种在材料中与 AI 一起思考的方式，而不是在对话框里等待答案。尚未成形的想法需要保留犹豫、被触碰，也继续生长的空间。",
      "AI 赋予语言智能，Matter 让思想拥有身体。",
      "当前版本是一个本地运行的早期预览。材料与手势这一层已经在这里；实时转写与生成式改变仍在开发中。我们在它成形的过程中把它打开。",
      <PToQAttribution after=" 发起的项目。" before="Matter 是由 " key="attribution" />,
    ]),
  }),
  help: Object.freeze({
    title: "如何使用 Matter",
    body: Object.freeze([
      "先用麦克风说出根想法，再选中一段材料，继续向下生长。",
      "用套索圈定确切语言，拖动边缘决定改变多少；用分支生成相关想法，用撤销退回上一次已提交的改变。",
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
      "内测阶段尚未发布正式隐私政策。发起生成时，只使用画面上可见的根节点至焦点路径作为上下文。",
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
    "我們正在做一個用來塑造思想的腦機介面。聲音帶入語言，手勢觸碰在意之處，根狀結構保留每個想法的脈絡。",
    "這是在材料中與 AI 一起思考，而不是在對話框裡等待答案。未完成的想法需要保留猶豫、被觸碰並繼續生長的空間。",
    "AI 賦予語言智能，Matter 讓思想擁有身體。",
    "這是早期的本地預覽。材料與手勢已可使用，實時轉寫與生成式改變仍在開發中。",
    <PToQAttribution after=" 發起的項目。" before="Matter 是由 " key="attribution" />,
  ]) }),
  help: Object.freeze({ title: "如何使用 Matter", body: Object.freeze([
    "先用麥克風說出根想法，再選取一段材料，繼續向下生長。",
    "用套索圈定語言，拖動邊緣決定改變多少；用分支生成相關想法，用復原退回上一次已提交的改變。",
  ]) }),
  pricing: Object.freeze({ title: "定價", body: Object.freeze(["Matter 仍在預覽階段，此版本沒有付費方案或結帳功能。"])}),
  privacy: Object.freeze({ title: "隱私", body: Object.freeze(["材料保存在目前瀏覽器中，除非你主動匯出或發起模型改變。", "生成時只使用畫面上可見的根節點至焦點路徑作為上下文。"])}),
  terms: Object.freeze({ title: "服務條款", body: Object.freeze(["Matter 仍是預覽軟體，正式服務條款尚未發布。", "產品仍在驗證階段，請為無法替代的材料保留匯出副本。"])}),
});

const JAPANESE_INFO: CanvasChromeInfo = Object.freeze({
  about: Object.freeze({ title: "Matter について", body: Object.freeze([
    "Matter は、考えが答えになる前に、その考えと留まるための環境です。",
    "思考を形づくるためのブレイン・コンピューター・インターフェースをつくっています。声が言葉を運び、ジェスチャーが触れる場所と変化の量を決め、根のある構造が系譜を保ちます。",
    "これはチャットで答えを待つのではなく、素材の中で AI と考える方法です。未完成な考えにも、迷いを残し、触れ、育てる余白があります。",
    "AI は言葉に知性を与え、Matter は思考に身体を与えます。",
    "初期のローカルプレビューです。素材とジェスチャーは利用できますが、音声入力と生成的な変更は開発中です。",
    <PToQAttribution after=" の project です。" before="Matter は " key="attribution" />,
  ]) }),
  help: Object.freeze({ title: "Matter の使い方", body: Object.freeze([
    "まず Voice で根の考えを話し、素材を選んで下へ育てます。",
    "Lasso で言葉を囲み、伸縮で変化の量を決め、Branch で関連する考えを育て、Undo で直前の変更を戻します。",
  ]) }),
  pricing: Object.freeze({ title: "料金", body: Object.freeze(["Matter はプレビュー中です。このビルドに有料プランや決済はありません。"])}),
  privacy: Object.freeze({ title: "プライバシー", body: Object.freeze(["素材は、書き出しまたはモデルによる変更を行わない限り、このブラウザに保存されます。", "生成時は、画面に見えているルートからフォーカスまでの経路だけを文脈として使います。"])}),
  terms: Object.freeze({ title: "利用規約", body: Object.freeze(["Matter はプレビューソフトウェアで、正式な利用規約はまだありません。", "置き換えられない素材は、検証中のあいだ書き出しを保管してください。"])}),
});

const GERMAN_INFO: CanvasChromeInfo = Object.freeze({
  about: Object.freeze({ title: "Über Matter", body: Object.freeze([
    "Matter lädt dazu ein, bei einem Gedanken zu bleiben, bevor er zu einer Antwort wird.",
    "Wir entwickeln eine Gehirn-Computer-Schnittstelle zum Formen von Gedanken. Die Stimme bringt Sprache herein, Gesten berühren das Wesentliche und bestimmen das Maß der Veränderung, eine verwurzelte Struktur bewahrt die Herkunft jedes Gedankens.",
    "Es ist eine Art, mit KI im Material zu denken, nicht in einem Chat auf Antworten zu warten. Unfertige Gedanken dürfen unsicher bleiben, berührt werden und weiterwachsen.",
    "KI gibt Sprache Intelligenz. Matter gibt Gedanken einen Körper.",
    "Dies ist eine frühe lokale Vorschau. Material und Gesten sind vorhanden; Live-Diktat und generative Änderungen werden noch entwickelt.",
    <PToQAttribution after="." before="Matter ist ein project von " key="attribution" />,
  ]) }),
  help: Object.freeze({ title: "Matter verwenden", body: Object.freeze([
    "Beginne mit Voice und sprich einen Wurzelgedanken ein. Wähle dann Material, um darunter weiterzuwachsen.",
    "Mit Lasso markierst du Sprache, mit Stretch bestimmst du das Ausmaß, Branch erzeugt einen verwandten Gedanken und Undo macht die letzte Änderung rückgängig.",
  ]) }),
  pricing: Object.freeze({ title: "Preise", body: Object.freeze(["Matter ist in der Vorschau. Dieser Build hat keinen kostenpflichtigen Plan und keine Kasse."])}),
  privacy: Object.freeze({ title: "Datenschutz", body: Object.freeze(["Material bleibt in diesem Browser, außer du exportierst es oder startest eine modellgestützte Änderung.", "Bei einer Generierung wird nur der sichtbare Pfad von der Wurzel zum Fokus als Kontext verwendet."])}),
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
    appearance: Object.freeze({ auto: "Auto", dark: "Dark", light: "Light" }),
    appearanceLabel: "Appearance",
    close: "Close",
    closeMenu: "Close Matter menu",
    fxLabel: "Leaf shadows",
    help: "Guide",
    information: "Information",
    language: "Language",
    menu: "Matter",
    on: "On",
    off: "Off",
    openMenu: "Open Matter menu",
    preferences: "Preferences",
    pricing: "Pricing",
    privacy: "Privacy",
    settings: "Matter settings",
    terms: "Terms",
  }),
  "zh-CN": Object.freeze({
    about: "关于",
    appearance: Object.freeze({ auto: "自动", dark: "深色", light: "浅色" }),
    appearanceLabel: "外观",
    close: "关闭",
    closeMenu: "关闭 Matter 菜单",
    fxLabel: "树影",
    help: "使用说明",
    information: "关于",
    language: "语言",
    menu: "Matter",
    on: "开",
    off: "关",
    openMenu: "打开 Matter 菜单",
    preferences: "偏好设置",
    pricing: "定价",
    privacy: "隐私政策",
    settings: "Matter 设置",
    terms: "服务条款",
  }),
  "zh-TW": Object.freeze({
    about: "關於",
    appearance: Object.freeze({ auto: "自動", dark: "深色", light: "淺色" }),
    appearanceLabel: "外觀",
    close: "關閉",
    closeMenu: "關閉 Matter 選單",
    fxLabel: "樹影",
    help: "使用說明",
    information: "資訊",
    language: "語言",
    menu: "Matter",
    on: "開",
    off: "關",
    openMenu: "開啟 Matter 選單",
    preferences: "偏好設定",
    pricing: "定價",
    privacy: "隱私",
    settings: "Matter 設定",
    terms: "服務條款",
  }),
  "ja-JP": Object.freeze({
    about: "概要",
    appearance: Object.freeze({ auto: "自動", dark: "ダーク", light: "ライト" }),
    appearanceLabel: "外観",
    close: "閉じる",
    closeMenu: "Matter メニューを閉じる",
    fxLabel: "葉の影",
    help: "使い方",
    information: "情報",
    language: "言語",
    menu: "Matter",
    on: "オン",
    off: "オフ",
    openMenu: "Matter メニューを開く",
    preferences: "設定",
    pricing: "料金",
    privacy: "プライバシー",
    settings: "Matter の設定",
    terms: "利用規約",
  }),
  "de-DE": Object.freeze({
    about: "Über",
    appearance: Object.freeze({ auto: "Automatisch", dark: "Dunkel", light: "Hell" }),
    appearanceLabel: "Darstellung",
    close: "Schließen",
    closeMenu: "Matter-Menü schließen",
    fxLabel: "Blattschatten",
    help: "Hilfe",
    information: "Informationen",
    language: "Sprache",
    menu: "Matter",
    on: "An",
    off: "Aus",
    openMenu: "Matter-Menü öffnen",
    preferences: "Einstellungen",
    pricing: "Preise",
    privacy: "Datenschutz",
    settings: "Matter-Einstellungen",
    terms: "Nutzungsbedingungen",
  }),
});

const INFO_OVERLAYS = new Set<CanvasChromeInfoId>([
  "about",
  "help",
  "pricing",
  "privacy",
  "terms",
]);

const MODAL_OVERLAYS = new Set<CanvasChromeOverlay>([
  ...INFO_OVERLAYS,
  "mobile",
]);

// Menus close on outside pointer or Escape; information overlays remain modal.
const MENU_OVERLAYS = new Set<CanvasChromeOverlay>(["settings", "language"]);

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function CanvasChrome({
  preferences,
  resolvedAppearance,
  setAppearance,
  setLanguage,
  setLeafFx,
}: CanvasChromeProps) {
  const [overlay, setOverlay] = useState<CanvasChromeOverlay>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const languageButtonRef = useRef<HTMLButtonElement>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const copy = CANVAS_CHROME_COPY[preferences.language];
  const info = CANVAS_CHROME_INFO[preferences.language];
  const languageLabel = CANVAS_LANGUAGE_OPTIONS.find(
    (option) => option.value === preferences.language,
  )?.label ?? preferences.language;
  const appearanceLabel = copy.appearance[preferences.appearance];
  const modalOpen = MODAL_OVERLAYS.has(overlay);

  const closeOverlay = useCallback((restoreFocus = true) => {
    setOverlay(null);
    const returnTarget = returnFocusRef.current;
    returnFocusRef.current = null;
    if (restoreFocus && returnTarget?.isConnected) {
      requestAnimationFrame(() => focusWithoutScroll(returnTarget));
    }
  }, []);

  const openOverlay = useCallback((
    next: Exclude<CanvasChromeOverlay, null>,
    trigger: HTMLElement | null,
  ) => {
    returnFocusRef.current = trigger;
    setOverlay(next);
  }, []);

  const toggleMenu = useCallback((
    next: "settings" | "language",
    trigger: HTMLElement | null,
  ) => {
    setOverlay((current) => {
      if (current === next) {
        returnFocusRef.current = null;
        return null;
      }
      returnFocusRef.current = trigger;
      return next;
    });
  }, []);

  useEffect(() => {
    if (overlay === null) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!MENU_OVERLAYS.has(overlay)) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      const region = overlay === "settings"
        ? [settingsMenuRef.current, settingsButtonRef.current]
        : [languageMenuRef.current, languageButtonRef.current];
      if (!region.some((element) => element?.contains(target))) closeOverlay(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
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

    const rail = canvas.closest<HTMLElement>(".matter-shell")
      ?.querySelector<HTMLElement>(".tool-rail") ?? null;
    const railRecord = rail === null ? null : {
      element: rail,
      ariaHidden: rail.getAttribute("aria-hidden"),
      inert: rail.inert,
    };

    const records = Array.from(canvas.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement && child !== root)
      .map((element) => ({
        element,
        ariaHidden: element.getAttribute("aria-hidden"),
        inert: element.inert,
      }));
    for (const record of records) {
      record.element.inert = true;
      record.element.setAttribute("aria-hidden", "true");
    }
    canvas.setAttribute("data-canvas-modal-open", "true");
    if (railRecord !== null) {
      railRecord.element.inert = true;
      railRecord.element.setAttribute("aria-hidden", "true");
    }
    return () => {
      canvas.removeAttribute("data-canvas-modal-open");
      for (const record of records) {
        record.element.inert = record.inert;
        if (record.ariaHidden === null) record.element.removeAttribute("aria-hidden");
        else record.element.setAttribute("aria-hidden", record.ariaHidden);
      }
      if (railRecord !== null) {
        railRecord.element.inert = railRecord.inert;
        if (railRecord.ariaHidden === null) railRecord.element.removeAttribute("aria-hidden");
        else railRecord.element.setAttribute("aria-hidden", railRecord.ariaHidden);
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
        <div className={styles.topRight}>
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

        <div className={styles.bottomRight}>
          <div className={styles.popoverAnchor}>
            <button
              className={styles.askButton}
              data-chrome-control="help"
              onClick={(event) => openInfo("help", event.currentTarget)}
              type="button"
            >
              {copy.help}
            </button>
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
                  onClick={() => openOverlay("help", mobileTriggerRef.current)}
                  type="button"
                >
                  {copy.help}
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
