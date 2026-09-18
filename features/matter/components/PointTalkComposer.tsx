"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import type { TextSwapController } from "../interaction/use-text-swap";
import { textSwapActionWasSubmitted } from "../runtime/text-swap-interaction";
import type { CanvasLanguage } from "./canvas-preferences";
import { VoiceIcon } from "./icons";
import {
  projectPointTalkPlacementWithinSurfaces,
  projectPointTalkScale,
  type PointTalkBounds,
  type PointTalkPlacement,
} from "./point-talk-placement";
import { constrainPointTalkDirectionInput } from "./point-talk-direction-input";

export function PointTalkComposer({
  boundaryRef,
  canvasRef,
  canvasZoom,
  controller,
  geometryKey,
  locale,
  nodeId,
  onCancel,
  onRetry,
  onStartVoice,
  onStopVoice,
  onSubmit,
  positioningRef,
  surfaceAvailable,
  targetBounds,
  voiceAvailable,
}: Readonly<{
  boundaryRef: RefObject<HTMLElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  canvasZoom: number;
  controller: TextSwapController;
  geometryKey: string;
  locale: CanvasLanguage;
  nodeId: string;
  onCancel: () => void;
  onRetry: () => void;
  onStartVoice: () => void;
  onStopVoice: () => void;
  onSubmit: (direction: string) => void;
  positioningRef: RefObject<HTMLElement | null>;
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
      onCancel();
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
      onCancel();
      return;
    }
    const next = projection.placement;
    setPlacement((current) => current !== null &&
      current.left === next.left && current.top === next.top
      && current.maxWidth === next.maxWidth
      ? current
      : next);
  }, [boundaryRef, canvasRef, onCancel, positioningRef, surfaceAvailable, targetBounds, visualScale]);

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
    if (shell !== null) chromeObserver?.observe(shell, { childList: true, subtree: true });
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

  useEffect(() => {
    if (!surfaceAvailable) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancelAndRestoreFocus();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [cancelAndRestoreFocus, surfaceAvailable]);

  useEffect(() => {
    if (!surfaceAvailable) return;
    const cancelFromOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      const targetElement = target instanceof Element
        ? target
        : target instanceof Node
          ? target.parentElement
          : null;
      if (pointTalkOutsidePointerDismisses({
        insideBubble: target instanceof Node && bubbleRef.current?.contains(target) === true,
        insideCanvasChrome: targetElement?.closest("[data-canvas-chrome]") != null,
        insideVoiceTool: targetElement?.closest('[data-tool-id="voice"]') != null,
        submitted,
      })) onCancel();
    };
    document.addEventListener("pointerdown", cancelFromOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", cancelFromOutsidePointer, true);
  }, [onCancel, submitted, surfaceAvailable]);

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
  if (activeState.phase === "idle" || activeState.phase === "success" || activeState.phase === "stale") return null;
  const recording = activeState.phase === "recording";
  const status = pointTalkStatus(activeState, locale);

  return (
    <div
      aria-hidden={!surfaceAvailable || undefined}
      className="point-talk"
      data-canvas-interactive
      data-phase={phase}
      data-surface-available={surfaceAvailable || undefined}
      inert={!surfaceAvailable || undefined}
      ref={bubbleRef}
      role={formVisible || recoveryAvailable ? undefined : "status"}
      style={!surfaceAvailable || placement === null || targetBounds === null
        ? { visibility: "hidden" }
        : {
            left: placement.left,
            top: placement.top,
            "--point-talk-available-width": `${placement.maxWidth}px`,
            "--point-talk-scale": visualScale,
          } as CSSProperties}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {formVisible ? (
        <PointTalkForm
          copy={copy}
          initialDirection={activeState.phase === "ready" ? activeState.direction : ""}
          inputId={inputId}
          inputRef={inputRef}
          key={`${nodeId}:${activeState.phase === "ready" ? activeState.direction : ""}`}
          onStartVoice={onStartVoice}
          onSubmit={onSubmit}
          voiceAvailable={voiceAvailable}
        />
      ) : (
        <div className="point-talk__feedback">
          <span aria-atomic="true" aria-live="polite" dir="auto">{status}</span>
          {recording ? (
            <button onClick={onStopVoice} type="button">{copy.stop}</button>
          ) : recoveryAction === "request" ? (
            <button onClick={onRetry} ref={retryRef} type="button">{copy.retry}</button>
          ) : recoveryAction === "voice" ? (
            <button onClick={onStartVoice} ref={retryRef} type="button">{copy.recordAgain}</button>
          ) : null}
        </div>
      )}
    </div>
  );
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
  inputRef: RefObject<HTMLInputElement | null>;
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

function pointTalkStatus(
  state: TextSwapController["state"],
  locale: CanvasLanguage,
): string {
  const zh = locale === "zh-CN" || locale === "zh-TW";
  if (state.phase === "permission") return zh ? "正在等待麦克风…" : "Waiting for microphone…";
  if (state.phase === "recording") return state.partialDirection?.trim() || (zh ? "正在听…" : "Listening…");
  if (state.phase === "transcribing") return zh ? "正在听清…" : "Transcribing…";
  if (state.phase === "pending") return zh ? "正在换一种说法…" : "Rewording…";
  if (state.phase === "error") return zh ? "原文没有改变。" : "The original language was kept.";
  return "";
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

function pointTalkCopy(locale: CanvasLanguage) {
  if (locale === "zh-CN") return {
    label: "告诉 AI 这段文字应该怎样改变",
    placeholder: "例如：更凝练一些",
    voice: "说出改写方向",
    apply: "改写",
    stop: "完成",
    retry: "重试",
    recordAgain: "重新录音",
  };
  if (locale === "zh-TW") return {
    label: "告訴 AI 這段文字應該怎樣改變",
    placeholder: "例如：更精煉一些",
    voice: "說出改寫方向",
    apply: "改寫",
    stop: "完成",
    retry: "重試",
    recordAgain: "重新錄音",
  };
  if (locale === "ja-JP") return {
    label: "この文章をどう変えるか AI に伝える",
    placeholder: "例：もう少し簡潔に",
    voice: "書き換え方を話す",
    apply: "書換",
    stop: "完了",
    retry: "再試行",
    recordAgain: "もう一度録音",
  };
  if (locale === "de-DE") return {
    label: "AI eine Richtung für diesen Text geben",
    placeholder: "Zum Beispiel: etwas prägnanter",
    voice: "Richtung einsprechen",
    apply: "Ändern",
    stop: "Fertig",
    retry: "Erneut",
    recordAgain: "Erneut aufnehmen",
  };
  return {
    label: "Tell AI how this passage should change",
    placeholder: "For example: make it more concise",
    voice: "Speak a rewrite direction",
    apply: "Rewrite",
    stop: "Done",
    retry: "Retry",
    recordAgain: "Record again",
  };
}
