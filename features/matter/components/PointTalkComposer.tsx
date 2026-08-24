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
import type { CanvasLanguage } from "./canvas-preferences";
import { VoiceIcon } from "./icons";
import {
  projectPointTalkPlacement,
  type PointTalkPlacement,
} from "./point-talk-placement";

export function PointTalkComposer({
  canvasRef,
  controller,
  geometryKey,
  locale,
  nodeId,
  onCancel,
  onRetry,
  onStartVoice,
  onStopVoice,
  onSubmit,
  voiceAvailable,
}: Readonly<{
  canvasRef: RefObject<HTMLDivElement | null>;
  controller: TextSwapController;
  geometryKey: string;
  locale: CanvasLanguage;
  nodeId: string;
  onCancel: () => void;
  onRetry: () => void;
  onStartVoice: () => void;
  onStopVoice: () => void;
  onSubmit: (direction: string) => void;
  voiceAvailable: boolean;
}>) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [placement, setPlacement] = useState<PointTalkPlacement | null>(null);
  const inputId = useId();
  const phase = controller.state.phase;
  const formVisible = phase === "eligible" || phase === "ready";
  const copy = pointTalkCopy(locale);
  const cancelAndRestoreFocus = useCallback(() => {
    onCancel();
    queueMicrotask(() => {
      Array.from(canvasRef.current?.querySelectorAll<HTMLElement>("[data-thought-text-id]") ?? [])
        .find((candidate) => candidate.dataset.thoughtTextId === nodeId)
        ?.focus({ preventScroll: true });
    });
  }, [canvasRef, nodeId, onCancel]);

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    const bubble = bubbleRef.current;
    if (canvas === null || bubble === null) return;
    const target = Array.from(
      canvas.querySelectorAll<HTMLElement>("[data-thought-text-id]"),
    ).find((candidate) => candidate.dataset.thoughtTextId === nodeId);
    if (target === undefined) return;
    const bounds = contentBounds(target);
    const bubbleRect = bubble.getBoundingClientRect();
    const viewport = visualViewportBounds();
    const width = bubbleRect.width || 304;
    const height = bubbleRect.height || 52;
    const next = projectPointTalkPlacement({
      target: bounds,
      bubble: { width, height },
      viewport,
    });
    setPlacement((current) => current !== null && next !== null &&
      current.left === next.left && current.top === next.top
      ? current
      : next);
  }, [canvasRef, nodeId]);

  useLayoutEffect(() => {
    measure();
    const target = Array.from(
      canvasRef.current?.querySelectorAll<HTMLElement>("[data-thought-text-id]") ?? [],
    ).find((candidate) => candidate.dataset.thoughtTextId === nodeId);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (target !== undefined) observer?.observe(target);
    if (bubbleRef.current !== null) observer?.observe(bubbleRef.current);
    const visual = window.visualViewport;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    visual?.addEventListener("resize", measure);
    visual?.addEventListener("scroll", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      visual?.removeEventListener("resize", measure);
      visual?.removeEventListener("scroll", measure);
    };
  }, [canvasRef, geometryKey, measure, nodeId, phase]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancelAndRestoreFocus();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [cancelAndRestoreFocus]);

  useEffect(() => {
    const cancelFromOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && bubbleRef.current?.contains(event.target)) return;
      onCancel();
    };
    document.addEventListener("pointerdown", cancelFromOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", cancelFromOutsidePointer, true);
  }, [onCancel]);

  useEffect(() => {
    if (!formVisible) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [formVisible]);

  const activeState = controller.state;
  if (activeState.phase === "idle" || activeState.phase === "success" || activeState.phase === "stale") return null;
  const recording = activeState.phase === "recording";
  const retryable = activeState.phase === "error" && activeState.retryable &&
    activeState.direction !== undefined;
  const status = pointTalkStatus(activeState, locale);

  return (
    <div
      className="point-talk"
      data-canvas-interactive
      data-phase={phase}
      ref={bubbleRef}
      role={formVisible ? undefined : "status"}
      style={placement === null
        ? { visibility: "hidden" }
        : { left: placement.left, top: placement.top } as CSSProperties}
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
          ) : retryable ? (
            <button onClick={onRetry} type="button">{copy.retry}</button>
          ) : null}
        </div>
      )}
    </div>
  );
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
        autoFocus
        dir="auto"
        id={inputId}
        maxLength={240}
        onChange={(event) => setDirection(event.currentTarget.value)}
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

function contentBounds(element: HTMLElement): Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}> {
  const range = document.createRange();
  range.selectNodeContents(element);
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0,
  );
  range.detach();
  if (rects.length === 0) return element.getBoundingClientRect();
  return Object.freeze({
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  });
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

function pointTalkCopy(locale: CanvasLanguage) {
  if (locale === "zh-CN") return {
    label: "告诉 AI 这段文字应该怎样改变",
    placeholder: "例如：更凝练一些",
    voice: "说出改写方向",
    apply: "改写",
    stop: "完成",
    retry: "重试",
  };
  if (locale === "zh-TW") return {
    label: "告訴 AI 這段文字應該怎樣改變",
    placeholder: "例如：更精煉一些",
    voice: "說出改寫方向",
    apply: "改寫",
    stop: "完成",
    retry: "重試",
  };
  if (locale === "ja-JP") return {
    label: "この文章をどう変えるか AI に伝える",
    placeholder: "例：もう少し簡潔に",
    voice: "書き換え方を話す",
    apply: "書換",
    stop: "完了",
    retry: "再試行",
  };
  if (locale === "de-DE") return {
    label: "AI eine Richtung für diesen Text geben",
    placeholder: "Zum Beispiel: etwas prägnanter",
    voice: "Richtung einsprechen",
    apply: "Ändern",
    stop: "Fertig",
    retry: "Erneut",
  };
  return {
    label: "Tell AI how this passage should change",
    placeholder: "For example: make it more concise",
    voice: "Speak a rewrite direction",
    apply: "Rewrite",
    stop: "Done",
    retry: "Retry",
  };
}
