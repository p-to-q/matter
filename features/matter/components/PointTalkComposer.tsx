"use client";

// Loads with this lazy chunk; nothing in the initial graph renders these classes.
import "./PointTalkComposer.css";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type RefObject,
} from "react";
import type { TextSwapController } from "../interaction/use-text-swap";
import {
  textSwapActionWasSubmitted,
  type TextSwapInteractionState,
} from "../runtime/text-swap-interaction";
import type { CanvasLanguage } from "./canvas-preferences";
import { VoiceIcon } from "./icons";
import type { PresenceHandoff, SettledStatusInput } from "./presence";
import { usePresence, useSettledStatus } from "./use-presence";
import {
  projectPointTalkPlacementWithinSurfaces,
  projectPointTalkScale,
  type PointTalkBounds,
  type PointTalkPlacement,
} from "./point-talk-placement";
import { constrainPointTalkDirectionInput } from "./point-talk-direction-input";
import { useEscapeLayer } from "./escape-layers";
import { deferUntilTouchCommits } from "./touch-commitment";
import { outsidePressDismissal } from "../runtime/canvas-pointer-arbitration";

export type PointTalkStatusPhase = Extract<
  TextSwapInteractionState["phase"],
  "permission" | "recording" | "transcribing" | "pending" | "error"
>;

type PointTalkFeedbackAction = "stop" | "retry" | "record-again";

type PointTalkSurfaceContent =
  | Readonly<{ kind: "form"; direction: string; formKey: string; voiceAvailable: boolean }>
  | Readonly<{
      kind: "feedback";
      /** The settled phase label; the only text a live region announces. */
      label: string;
      /** What is painted: the live partial while listening, else the label. */
      text: string;
      action: PointTalkFeedbackAction | null;
    }>;

/** Everything needed to paint a frozen copy of the bubble after its owner left. */
export type PointTalkSurfaceView = Readonly<{
  phase: TextSwapInteractionState["phase"];
  left: number;
  top: number;
  maxWidth: number;
  scale: number;
  content: PointTalkSurfaceContent;
}>;

type PointTalkHandlers = Readonly<{
  onRetry: () => void;
  onStartVoice: () => void;
  onStopVoice: () => void;
  onSubmit: (direction: string) => void;
}>;

export function PointTalkComposer({
  boundaryRef,
  canvasRef,
  canvasZoom,
  controller,
  exitHandoff,
  geometryKey,
  locale,
  nodeId,
  onCancel,
  onPlacementLost,
  onRetry,
  onStartVoice,
  onStopVoice,
  onSubmit,
  penActive,
  positioningRef,
  presenceIdentity,
  surfaceAvailable,
  targetBounds,
  voiceAvailable,
}: Readonly<{
  boundaryRef: RefObject<HTMLElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  canvasZoom: number;
  controller: TextSwapController;
  /** Receives the last painted bubble so its exit outlives this owner. */
  exitHandoff?: PresenceHandoff<PointTalkSurfaceView>;
  geometryKey: string;
  locale: CanvasLanguage;
  nodeId: string;
  /** The person dismissed the field. */
  onCancel: () => void;
  /** Geometry made the field unusable; a system close, not the person's. */
  onPlacementLost: () => void;
  onRetry: () => void;
  onStartVoice: () => void;
  onStopVoice: () => void;
  onSubmit: (direction: string) => void;
  penActive: (timeStamp: number) => boolean;
  positioningRef: RefObject<HTMLElement | null>;
  /** One opening of the field; a new opening never inherits the last one's exit. */
  presenceIdentity: string;
  surfaceAvailable: boolean;
  targetBounds: PointTalkBounds | null;
  voiceAvailable: boolean;
}>) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const measurementFrameRef = useRef<number | null>(null);
  const [placement, setPlacement] = useState<PointTalkPlacement | null>(null);
  const inputId = useId();
  const phase = controller.state.phase;
  const submitted = textSwapActionWasSubmitted(controller.state);
  const recoveryAction = pointTalkRecoveryAction(controller.state, voiceAvailable);
  const recoveryAvailable = recoveryAction !== null;
  const placementReady = placement !== null && targetBounds !== null;
  const visualScale = projectPointTalkScale(canvasZoom);
  const formVisible = phase === "eligible" || phase === "ready";
  const copy = pointTalkCopy(locale);
  const cancelAndRestoreFocus = useCallback(() => {
    onCancel();
    queueMicrotask(() => {
      const canvas = canvasRef.current;
      if (canvas !== null) findPointTalkTarget(canvas, nodeId)?.focus({ preventScroll: true });
    });
  }, [canvasRef, nodeId, onCancel]);

  const measure = useCallback(() => {
    if (!surfaceAvailable) return;
    const boundary = boundaryRef.current;
    const canvas = canvasRef.current;
    const bubble = bubbleRef.current;
    const positioningSurface = positioningRef.current;
    // The controller renders one idle pass before entering its usable phase;
    // no bubble exists yet, so absence here is not damaged geometry.
    if (bubble === null) return;
    if (targetBounds === null) {
      setPlacement(null);
      return;
    }
    if (boundary === null || canvas === null || positioningSurface === null) {
      onPlacementLost();
      return;
    }
    const bubbleRect = bubble.getBoundingClientRect();
    const toolRail = visiblePointTalkToolRail(boundary);
    const projection = projectPointTalkPlacementWithinSurfaces({
      target: targetBounds,
      bubble: {
        width: bubbleRect.width || 264,
        height: bubbleRect.height || 38,
      },
      visualViewport: visualViewportBounds(),
      boundary: boundary.getBoundingClientRect(),
      positioningSurface: positioningSurface.getBoundingClientRect(),
      rightOccluder: toolRail?.getBoundingClientRect() ?? null,
      gap: 14 * visualScale,
    });
    if (projection.kind === "temporarily-unavailable") {
      setPlacement(null);
      return;
    }
    if (projection.kind === "unusable") {
      onPlacementLost();
      return;
    }
    const next = projection.placement;
    setPlacement((current) => current !== null &&
      current.left === next.left && current.top === next.top
      && current.maxWidth === next.maxWidth
      ? current
      : next);
  }, [boundaryRef, canvasRef, onPlacementLost, positioningRef, surfaceAvailable, targetBounds, visualScale]);

  const scheduleMeasure = useCallback(() => {
    if (measurementFrameRef.current !== null) return;
    measurementFrameRef.current = requestAnimationFrame(() => {
      measurementFrameRef.current = null;
      measure();
    });
  }, [measure]);

  useLayoutEffect(() => {
    scheduleMeasure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
    if (bubbleRef.current !== null) observer?.observe(bubbleRef.current);
    if (boundaryRef.current !== null) observer?.observe(boundaryRef.current);
    if (positioningRef.current !== null) observer?.observe(positioningRef.current);
    const toolRail = boundaryRef.current === null
      ? null
      : visiblePointTalkToolRail(boundaryRef.current);
    if (toolRail !== null) observer?.observe(toolRail);
    const paper = boundaryRef.current;
    const shell = paper?.closest<HTMLElement>(".matter-shell") ?? null;
    let observedFiles: HTMLElement | null = null;
    const chromeObserver = paper === null
      ? null
      : new MutationObserver(() => {
          observeFiles();
          scheduleMeasure();
        });
    const observeFiles = () => {
      const files = shell?.querySelector<HTMLElement>(".material-files") ?? null;
      if (files === null || files === observedFiles) return;
      observedFiles = files;
      chromeObserver?.observe(files, {
        attributes: true,
        attributeFilter: ["data-open"],
      });
    };
    if (paper !== null) chromeObserver?.observe(paper, {
      attributes: true,
      attributeFilter: ["data-canvas-modal-open"],
    });
    // The lazily loaded index mounts its drawer as a direct child of the shell;
    // watching the whole subtree remeasured on every material text mutation.
    if (shell !== null) chromeObserver?.observe(shell, { childList: true });
    observeFiles();
    const visual = window.visualViewport;
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);
    visual?.addEventListener("resize", scheduleMeasure);
    visual?.addEventListener("scroll", scheduleMeasure);
    return () => {
      observer?.disconnect();
      chromeObserver?.disconnect();
      if (measurementFrameRef.current !== null) cancelAnimationFrame(measurementFrameRef.current);
      measurementFrameRef.current = null;
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
      visual?.removeEventListener("resize", scheduleMeasure);
      visual?.removeEventListener("scroll", scheduleMeasure);
    };
  }, [boundaryRef, canvasRef, geometryKey, measure, nodeId, phase, positioningRef, scheduleMeasure]);

  // Before submit Escape cancels the local turn; after submit it only detaches
  // this presentation. An IME candidate dismissal never reaches it. The field
  // is a paper surface, so chrome or a panel that covers it closes first.
  useEscapeLayer(pointTalkSurfaceVisible(controller.state.phase), "paper", () => {
    cancelAndRestoreFocus();
    return true;
  });

  useEffect(() => {
    if (!surfaceAvailable) return;
    let pendingTouchDismissal: (() => void) | null = null;
    const cancelFromOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      const targetElement = target instanceof Element
        ? target
        : target instanceof Node
          ? target.parentElement
          : null;
      if (!pointTalkOutsidePointerDismisses({
        insideBubble: target instanceof Node && bubbleRef.current?.contains(target) === true,
        insideCanvasChrome: targetElement?.closest("[data-canvas-chrome]") != null,
        insideVoiceTool: targetElement?.closest('[data-tool-id="voice"]') != null,
        submitted,
      })) return;
      // A palm while a pen writes (perhaps into this very field) is not a tap,
      // and a palm resting beside the pen must not discard a typed direction:
      // a touch dismisses only once it commits to a real tap or gesture.
      switch (outsidePressDismissal(event.pointerType, penActive(event.timeStamp))) {
        case "now":
          onCancel();
          return;
        case "when-touch-commits":
          pendingTouchDismissal?.();
          pendingTouchDismissal = deferUntilTouchCommits(
            { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY },
            onCancel,
          );
          return;
        case "never":
          return;
      }
    };
    document.addEventListener("pointerdown", cancelFromOutsidePointer, true);
    return () => {
      document.removeEventListener("pointerdown", cancelFromOutsidePointer, true);
      pendingTouchDismissal?.();
    };
  }, [onCancel, penActive, submitted, surfaceAvailable]);

  useEffect(() => {
    if (
      !surfaceAvailable || !formVisible || !placementReady ||
      document.visibilityState !== "visible"
    ) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [formVisible, placementReady, surfaceAvailable]);

  useLayoutEffect(() => {
    if (
      !surfaceAvailable || !recoveryAvailable || !placementReady ||
      document.visibilityState !== "visible"
    ) return;
    retryRef.current?.focus({ preventScroll: true });
  }, [placementReady, recoveryAvailable, surfaceAvailable]);

  const activeState = controller.state;
  const surfaceLive = pointTalkSurfaceVisible(activeState.phase);
  const statusPhase: PointTalkStatusPhase | null =
    surfaceLive && !formVisible ? activeState.phase as PointTalkStatusPhase : null;
  const shownStatus = useSettledStatus(pointTalkStatusInput(presenceIdentity, statusPhase), false);
  const partialDirection = activeState.phase === "recording"
    ? activeState.partialDirection?.trim() ?? ""
    : "";
  const readyDirection = activeState.phase === "ready" ? activeState.direction : "";
  const feedbackAction: PointTalkFeedbackAction | null = activeState.phase === "recording"
    ? "stop"
    : recoveryAction === "request"
      ? "retry"
      : recoveryAction === "voice" ? "record-again" : null;
  const content = useMemo<PointTalkSurfaceContent>(() => {
    if (formVisible) {
      return Object.freeze({
        kind: "form",
        direction: readyDirection,
        formKey: `${nodeId}:${readyDirection}`,
        voiceAvailable,
      });
    }
    const label = shownStatus === null ? "" : pointTalkPhaseLabel(shownStatus, locale);
    return Object.freeze({
      kind: "feedback",
      label,
      text: shownStatus === "recording" && partialDirection.length > 0 ? partialDirection : label,
      action: feedbackAction,
    });
  }, [
    feedbackAction,
    formVisible,
    locale,
    nodeId,
    partialDirection,
    readyDirection,
    shownStatus,
    voiceAvailable,
  ]);
  const surfaceView = useMemo<PointTalkSurfaceView | null>(
    () => !surfaceLive || !surfaceAvailable || placement === null || targetBounds === null
      ? null
      : Object.freeze({
          phase,
          left: placement.left,
          top: placement.top,
          maxWidth: placement.maxWidth,
          scale: visualScale,
          content,
        }),
    [content, phase, placement, surfaceAvailable, surfaceLive, targetBounds, visualScale],
  );
  const lastSurfaceViewRef = useRef<PointTalkSurfaceView | null>(null);
  const typedDirectionRef = useRef<Readonly<{ formKey: string; value: string }> | null>(null);
  const recordTypedDirection = useCallback((event: FormEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLInputElement) || content.kind !== "form") return;
    typedDirectionRef.current = Object.freeze({
      formKey: content.formKey,
      value: constrainPointTalkDirectionInput(event.target.value),
    });
  }, [content]);
  const releaseSurface = useCallback(() => {
    exitHandoff?.release(
      presenceIdentity,
      withTypedDirection(lastSurfaceViewRef.current, typedDirectionRef.current),
    );
  }, [exitHandoff, presenceIdentity]);
  useLayoutEffect(() => {
    exitHandoff?.enter(presenceIdentity);
  }, [exitHandoff, presenceIdentity]);
  useLayoutEffect(() => {
    if (surfaceView === null) return;
    lastSurfaceViewRef.current = surfaceView;
    exitHandoff?.show(presenceIdentity, surfaceView);
  }, [exitHandoff, presenceIdentity, surfaceView]);
  const surfaceShown = surfaceView !== null;
  useLayoutEffect(() => {
    // Hands the painted bubble to its exit host as it stops being live or
    // unmounts. Every listener, observer, and frame above is torn down with
    // this owner, so the frozen copy can own none of them.
    if (!surfaceShown) return;
    return releaseSurface;
  }, [releaseSurface, surfaceShown]);

  if (!surfaceLive) return null;
  const placed = surfaceAvailable && placement !== null && targetBounds !== null;

  return (
    <div
      aria-hidden={!surfaceAvailable || undefined}
      className="point-talk"
      data-canvas-interactive
      data-phase={phase}
      data-placed={placed ? "" : undefined}
      data-presence="present"
      data-surface-available={surfaceAvailable || undefined}
      inert={!surfaceAvailable || undefined}
      ref={bubbleRef}
      style={!placed
        ? { visibility: "hidden" }
        : {
            left: placement.left,
            top: placement.top,
            "--point-talk-available-width": `${placement.maxWidth}px`,
            "--point-talk-scale": visualScale,
          } as CSSProperties}
      onInput={recordTypedDirection}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <PointTalkContent
        content={content}
        copy={copy}
        handlers={{ onRetry, onStartVoice, onStopVoice, onSubmit }}
        inputId={inputId}
        inputRef={inputRef}
        retryRef={retryRef}
      />
    </div>
  );
}

/**
 * Hosts the frozen exit of a Point Talk bubble whose live owner already
 * unmounted. It paints only the handed-off copy: inert, hidden from assistive
 * technology, and without handlers, focus, or a live region.
 */
export function PointTalkExit({
  available,
  handoff,
  locale,
}: Readonly<{
  /** False while a modal, hidden page, or another AI surface owns the paper. */
  available: boolean;
  handoff: PresenceHandoff<PointTalkSurfaceView>;
  locale: CanvasLanguage;
}>) {
  const record = useSyncExternalStore(handoff.subscribe, handoff.getSnapshot, handoff.getSnapshot);
  const live = useMemo(
    () => record === null || record.view === null
      ? null
      : { identity: record.identity, view: record.view },
    [record],
  );
  const frame = usePresence(live, available ? record?.close ?? "preempted" : "preempted");
  if (
    frame === null ||
    frame.stage === "present" ||
    record === null ||
    record.identity !== frame.identity
  ) return null;
  const view = record.lastView ?? frame.view;
  return (
    <div
      aria-hidden="true"
      className="point-talk"
      data-phase={view.phase}
      data-placed=""
      data-presence={frame.stage}
      data-presence-close={frame.close ?? undefined}
      inert
      style={{
        left: view.left,
        top: view.top,
        "--point-talk-available-width": `${view.maxWidth}px`,
        "--point-talk-scale": view.scale,
      } as CSSProperties}
    >
      <PointTalkContent content={view.content} copy={pointTalkCopy(locale)} handlers={null} />
    </div>
  );
}

function PointTalkContent({
  content,
  copy,
  handlers,
  inputId,
  inputRef,
  retryRef,
}: Readonly<{
  content: PointTalkSurfaceContent;
  copy: ReturnType<typeof pointTalkCopy>;
  /** Null for a frozen copy, which must not act. */
  handlers: PointTalkHandlers | null;
  inputId?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  retryRef?: RefObject<HTMLButtonElement | null>;
}>) {
  const frozenInputId = useId();
  if (content.kind === "form") {
    return (
      <PointTalkForm
        copy={copy}
        initialDirection={content.direction}
        inputId={inputId ?? frozenInputId}
        inputRef={inputRef}
        key={content.formKey}
        onStartVoice={handlers?.onStartVoice ?? ignore}
        onSubmit={handlers?.onSubmit ?? ignore}
        voiceAvailable={content.voiceAvailable}
      />
    );
  }
  const live = handlers !== null;
  return (
    <div className="point-talk__feedback">
      {/* Partials repaint as the person speaks; only phase labels are announced. */}
      <span aria-hidden={live || undefined} dir="auto">{content.text}</span>
      {live ? (
        <span aria-atomic="true" aria-live="polite" className="visually-hidden" role="status">
          {content.label}
        </span>
      ) : null}
      {content.action === "stop" ? (
        <button onClick={handlers?.onStopVoice} type="button">{copy.stop}</button>
      ) : content.action === "retry" ? (
        <button onClick={handlers?.onRetry} ref={retryRef} type="button">{copy.retry}</button>
      ) : content.action === "record-again" ? (
        <button onClick={handlers?.onStartVoice} ref={retryRef} type="button">{copy.recordAgain}</button>
      ) : null}
    </div>
  );
}

function withTypedDirection(
  view: PointTalkSurfaceView | null,
  typed: Readonly<{ formKey: string; value: string }> | null,
): PointTalkSurfaceView | null {
  if (view === null || view.content.kind !== "form" || typed?.formKey !== view.content.formKey) {
    return view;
  }
  return Object.freeze({ ...view, content: Object.freeze({ ...view.content, direction: typed.value }) });
}

function ignore(): void {}

function pointTalkSurfaceVisible(phase: TextSwapController["state"]["phase"]): boolean {
  return phase !== "idle" && phase !== "success" && phase !== "stale";
}

export function pointTalkOutsidePointerDismisses({
  insideBubble,
  insideCanvasChrome,
  insideVoiceTool,
  submitted,
}: Readonly<{
  insideBubble: boolean;
  insideCanvasChrome: boolean;
  insideVoiceTool: boolean;
  submitted: boolean;
}>): boolean {
  // Chrome may temporarily occlude accepted work, but draft and capture still
  // follow their visible control and remain easy to dismiss. The fixed Voice
  // tool belongs to the current turn even though it lives outside the bubble.
  return !insideBubble && !insideVoiceTool && (!insideCanvasChrome || !submitted);
}

function PointTalkForm({
  copy,
  initialDirection,
  inputId,
  inputRef,
  onStartVoice,
  onSubmit,
  voiceAvailable,
}: Readonly<{
  copy: ReturnType<typeof pointTalkCopy>;
  initialDirection: string;
  inputId: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onStartVoice: () => void;
  onSubmit: (direction: string) => void;
  voiceAvailable: boolean;
}>) {
  const [direction, setDirection] = useState(initialDirection);
  return (
    <form
      className="point-talk__composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(direction);
      }}
    >
      <label className="visually-hidden" htmlFor={inputId}>{copy.label}</label>
      <input
        dir="auto"
        id={inputId}
        onChange={(event) => setDirection(
          constrainPointTalkDirectionInput(event.currentTarget.value),
        )}
        placeholder={copy.placeholder}
        ref={inputRef}
        type="text"
        value={direction}
      />
      <button
        aria-label={copy.voice}
        className="point-talk__voice"
        disabled={!voiceAvailable}
        onClick={onStartVoice}
        title={copy.voice}
        type="button"
      >
        <VoiceIcon />
      </button>
      <button className="point-talk__submit" disabled={direction.trim().length === 0} type="submit">
        {copy.apply}
      </button>
    </form>
  );
}

function findPointTalkTarget(canvas: HTMLElement, nodeId: string): HTMLElement | undefined {
  for (const candidate of canvas.querySelectorAll<HTMLElement>("[data-thought-text-id]")) {
    if (candidate.dataset.thoughtTextId === nodeId) return candidate;
  }
  return undefined;
}

function visiblePointTalkToolRail(boundary: HTMLElement): HTMLElement | null {
  const rail = boundary.closest<HTMLElement>(".matter-shell")
    ?.querySelector<HTMLElement>(".tool-rail") ?? null;
  if (rail === null || !rail.isConnected) return null;
  const style = getComputedStyle(rail);
  return style.display === "none" || style.visibility === "hidden" ? null : rail;
}

function visualViewportBounds(): Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}> {
  const visual = window.visualViewport;
  return visual === null
    ? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
    : {
        left: visual.offsetLeft,
        top: visual.offsetTop,
        right: visual.offsetLeft + visual.width,
        bottom: visual.offsetTop + visual.height,
      };
}

/**
 * How one status phase settles. Listening, the person's own submit, and a
 * failure show at once; waiting for the microphone or for transcription
 * settles first. Neither "Listening" nor a failure may stay once its phase
 * ended: after the person's Stop the field must not claim it still listens.
 */
export function pointTalkStatusInput(
  scope: string,
  phase: PointTalkStatusPhase | null,
): SettledStatusInput<PointTalkStatusPhase> {
  return {
    scope,
    value: phase,
    urgent: phase === "recording" || phase === "pending" || phase === "error",
    lingers: phase !== "recording" && phase !== "error",
  };
}

export function pointTalkPhaseLabel(
  phase: PointTalkStatusPhase,
  locale: CanvasLanguage,
): string {
  const copy = pointTalkCopy(locale);
  switch (phase) {
    case "permission": return copy.waitingForMicrophone;
    case "recording": return copy.listening;
    case "transcribing": return copy.transcribing;
    case "pending": return copy.rewording;
    case "error": return copy.originalKept;
  }
}

export function pointTalkRecoveryAction(
  state: TextSwapController["state"],
  voiceAvailable: boolean,
): "request" | "voice" | null {
  if (state.phase !== "error" || !state.retryable) return null;
  if (state.direction !== undefined) return "request";
  if (!voiceAvailable) return null;
  switch (state.errorCode) {
    case "MICROPHONE_UNAVAILABLE":
    case "RECORDING_FAILED":
    case "NO_AUDIO":
    case "TRANSCRIPTION_FAILED":
    case "TRANSCRIPTION_TIMEOUT":
      return "voice";
    default:
      return null;
  }
}

type PointTalkCopy = Readonly<{
  label: string;
  placeholder: string;
  voice: string;
  apply: string;
  stop: string;
  retry: string;
  recordAgain: string;
  waitingForMicrophone: string;
  listening: string;
  transcribing: string;
  rewording: string;
  originalKept: string;
}>;

// Complete per locale: status lines once fell back to English for Japanese and
// German and to Simplified Chinese for Traditional Chinese.
const POINT_TALK_COPY: Readonly<Record<CanvasLanguage, PointTalkCopy>> = Object.freeze({
  "zh-CN": Object.freeze({
    label: "告诉 AI 这段文字应该怎样改变",
    placeholder: "例如：更凝练一些",
    voice: "说出改写方向",
    apply: "改写",
    stop: "完成",
    retry: "重试",
    recordAgain: "重新录音",
    waitingForMicrophone: "正在等待麦克风…",
    listening: "正在听…",
    transcribing: "正在听清…",
    rewording: "正在换一种说法…",
    originalKept: "原文没有改变。",
  }),
  "zh-TW": Object.freeze({
    label: "告訴 AI 這段文字應該怎樣改變",
    placeholder: "例如：更精煉一些",
    voice: "說出改寫方向",
    apply: "改寫",
    stop: "完成",
    retry: "重試",
    recordAgain: "重新錄音",
    waitingForMicrophone: "正在等待麥克風…",
    listening: "正在聽…",
    transcribing: "正在聽清…",
    rewording: "正在換一種說法…",
    originalKept: "原文沒有改變。",
  }),
  "ja-JP": Object.freeze({
    label: "この文章をどう変えるか AI に伝える",
    placeholder: "例：もう少し簡潔に",
    voice: "書き換え方を話す",
    apply: "書換",
    stop: "完了",
    retry: "再試行",
    recordAgain: "もう一度録音",
    waitingForMicrophone: "マイクを待っています…",
    listening: "聞いています…",
    transcribing: "文字に起こしています…",
    rewording: "言い換えています…",
    originalKept: "元の文章はそのままです。",
  }),
  "de-DE": Object.freeze({
    label: "AI eine Richtung für diesen Text geben",
    placeholder: "Zum Beispiel: etwas prägnanter",
    voice: "Richtung einsprechen",
    apply: "Ändern",
    stop: "Fertig",
    retry: "Erneut",
    recordAgain: "Erneut aufnehmen",
    waitingForMicrophone: "Warte auf das Mikrofon …",
    listening: "Hört zu …",
    transcribing: "Wird transkribiert …",
    rewording: "Wird umformuliert …",
    originalKept: "Der ursprüngliche Text bleibt erhalten.",
  }),
  "en-US": Object.freeze({
    label: "Tell AI how this passage should change",
    placeholder: "For example: make it more concise",
    voice: "Speak a rewrite direction",
    apply: "Rewrite",
    stop: "Done",
    retry: "Retry",
    recordAgain: "Record again",
    waitingForMicrophone: "Waiting for microphone…",
    listening: "Listening…",
    transcribing: "Transcribing…",
    rewording: "Rewording…",
    originalKept: "The original language was kept.",
  }),
});

export function pointTalkCopy(locale: CanvasLanguage): PointTalkCopy {
  return POINT_TALK_COPY[locale];
}
