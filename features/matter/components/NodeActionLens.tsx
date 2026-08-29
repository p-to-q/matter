"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { NavigationState } from "../runtime/navigation";
import type { ThoughtTree } from "../tree/model";
import { MatterAiIcon, MinusIcon, PlusIcon } from "./icons";
import {
  projectNodeHandleMetrics,
  projectNodeHandlePosition,
  type NodeHandleMetrics,
  type NodeHandlePosition,
} from "./node-handle-position";

type LensTarget = Readonly<{
  kind: "active" | "held-root";
  nodeId: string;
  source: "focus" | "pointer" | "selection";
}>;

type LensPlacement = Readonly<{
  left: number;
  top: number;
  metrics: NodeHandleMetrics;
  relation: NodeHandlePosition["relation"];
  materialCorner: NodeHandlePosition["materialCorner"];
}>;

export type NodeActionLensProps = Readonly<{
  activeNodeIds: ReadonlySet<string>;
  canvasRef: RefObject<HTMLDivElement | null>;
  documentRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  geometryKey: string;
  heldAsideRootIds: ReadonlySet<string>;
  interaction: "idle" | "pending";
  navigation: NavigationState;
  onOpenPointTalk: (nodeId: string) => void;
  onToggleHeldAside: (nodeId: string) => void;
  pointTalkEligibleNodeIds: ReadonlySet<string>;
  positioningRef: RefObject<HTMLElement | null>;
  tree: ThoughtTree;
}>;

const CLOSE_DELAY_MS = 200;

/**
 * One render-edge action presenter serves every material node. Its delegated
 * listeners keep hover churn out of the measured 2,000-node React list.
 */
export function NodeActionLens({
  activeNodeIds,
  canvasRef,
  documentRef,
  enabled,
  geometryKey,
  heldAsideRootIds,
  interaction,
  navigation,
  onOpenPointTalk,
  onToggleHeldAside,
  pointTalkEligibleNodeIds,
  positioningRef,
  tree,
}: NodeActionLensProps) {
  const [coarse, setCoarse] = useState(false);
  const [compact, setCompact] = useState(false);
  const [chromeSuppressed, setChromeSuppressed] = useState(false);
  const [target, setTarget] = useState<LensTarget | null>(null);
  const [placement, setPlacement] = useState<LensPlacement | null>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const targetElementRef = useRef<HTMLElement | null>(null);
  const pendingKeyboardEntryRef = useRef<string | null>(null);
  const dismissedFocusNodeIdRef = useRef<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);
  const close = useCallback(() => {
    clearCloseTimer();
    targetElementRef.current = null;
    pendingKeyboardEntryRef.current = null;
    setTarget(null);
    setPlacement(null);
  }, [clearCloseTimer]);
  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(close, CLOSE_DELAY_MS);
  }, [clearCloseTimer, close]);
  const focusPendingKeyboardEntry = useCallback((nodeId: string) => {
    const lens = lensRef.current;
    if (pendingKeyboardEntryRef.current !== nodeId || lens?.dataset.nodeId !== nodeId) return false;
    const button = lens.querySelector<HTMLButtonElement>("button:not(:disabled)");
    if (button === null) return false;
    button.focus();
    pendingKeyboardEntryRef.current = null;
    return true;
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const paper = documentRef.current;
    if (canvas === null || paper === null) return;
    const shell = paper.closest<HTMLElement>(".matter-shell");
    const chrome = paper.querySelector<HTMLElement>("[data-canvas-chrome]");
    const chromeIsSuppressed = () => paper.dataset.canvasModalOpen === "true" ||
      (chrome?.dataset.overlay !== undefined && chrome.dataset.overlay !== "none") ||
      shell?.dataset.nodeDragging === "true";

    const materialTarget = (eventTarget: EventTarget | null) => {
      if (!(eventTarget instanceof Element)) return null;
      const element = eventTarget.closest<HTMLElement>("[data-thought-text-id]");
      if (element === null || !canvas.contains(element)) return null;
      const nodeId = element.dataset.thoughtTextId;
      if (nodeId === undefined) return null;
      if (activeNodeIds.has(nodeId)) return { element, kind: "active" as const, nodeId };
      if (heldAsideRootIds.has(nodeId)) return { element, kind: "held-root" as const, nodeId };
      return null;
    };
    const reveal = (candidate: Readonly<{ element: HTMLElement; kind: LensTarget["kind"]; nodeId: string }>, source: LensTarget["source"]) => {
      clearCloseTimer();
      if (source === "pointer") dismissedFocusNodeIdRef.current = null;
      targetElementRef.current = candidate.element;
      setTarget((current) => current?.nodeId === candidate.nodeId && current.kind === candidate.kind && current.source === source
        ? current
        : { kind: candidate.kind, nodeId: candidate.nodeId, source });
    };
    const pointerOver = (event: PointerEvent) => {
      if (!enabled || chromeIsSuppressed() || event.pointerType === "touch") return;
      const candidate = materialTarget(event.target);
      if (candidate !== null) reveal(candidate, "pointer");
    };
    const pointerOut = (event: PointerEvent) => {
      const from = materialTarget(event.target);
      if (from === null || materialTarget(event.relatedTarget)?.nodeId === from.nodeId) return;
      if (event.relatedTarget instanceof Node && lensRef.current?.contains(event.relatedTarget)) return;
      scheduleClose();
    };
    const focusIn = (event: FocusEvent) => {
      if (!enabled || chromeIsSuppressed()) return;
      const candidate = materialTarget(event.target);
      if (candidate?.nodeId === dismissedFocusNodeIdRef.current) return;
      if (candidate !== null) reveal(candidate, "focus");
    };
    const focusOut = (event: FocusEvent) => {
      const from = materialTarget(event.target);
      if (from?.nodeId === dismissedFocusNodeIdRef.current) dismissedFocusNodeIdRef.current = null;
      if (event.relatedTarget instanceof Node && lensRef.current?.contains(event.relatedTarget)) return;
      if (materialTarget(event.relatedTarget) !== null) return;
      scheduleClose();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (!enabled || chromeIsSuppressed() || event.key !== "ArrowRight" || event.altKey || event.ctrlKey || event.metaKey) return;
      const candidate = materialTarget(event.target);
      if (candidate === null) return;
      event.preventDefault();
      dismissedFocusNodeIdRef.current = null;
      pendingKeyboardEntryRef.current = candidate.nodeId;
      reveal(candidate, "focus");
      focusPendingKeyboardEntry(candidate.nodeId);
    };
    const pointerDown = () => close();
    const reconcileCurrentTarget = () => {
      const focused = materialTarget(document.activeElement);
      const hovered = window.matchMedia("(pointer: coarse)").matches
        ? null
        : materialTarget(canvas.querySelector<HTMLElement>("[data-thought-text-id]:hover"));
      if (focused !== null && focused.nodeId !== dismissedFocusNodeIdRef.current) reveal(focused, "focus");
      else if (hovered !== null && hovered.nodeId !== dismissedFocusNodeIdRef.current) reveal(hovered, "pointer");
    };
    const syncChromeSuppression = () => {
      const suppressed = chromeIsSuppressed();
      setChromeSuppressed(suppressed);
      if (suppressed) close();
      else reconcileCurrentTarget();
    };
    const chromeObserver = new MutationObserver(syncChromeSuppression);

    canvas.addEventListener("pointerover", pointerOver);
    canvas.addEventListener("pointerout", pointerOut);
    canvas.addEventListener("focusin", focusIn);
    canvas.addEventListener("focusout", focusOut);
    canvas.addEventListener("keydown", keyDown);
    canvas.addEventListener("pointerdown", pointerDown);
    syncChromeSuppression();
    // A secondary lens may finish loading after the pointer or keyboard focus
    // already entered its passage. Reconcile that current browser state once
    // so lazy delivery never requires an artificial leave-and-reenter gesture.
    chromeObserver.observe(paper, { attributes: true, attributeFilter: ["data-canvas-modal-open"] });
    if (chrome !== null) chromeObserver.observe(chrome, { attributes: true, attributeFilter: ["data-overlay"] });
    if (shell !== null) chromeObserver.observe(shell, { attributes: true, attributeFilter: ["data-node-dragging"] });
    return () => {
      canvas.removeEventListener("pointerover", pointerOver);
      canvas.removeEventListener("pointerout", pointerOut);
      canvas.removeEventListener("focusin", focusIn);
      canvas.removeEventListener("focusout", focusOut);
      canvas.removeEventListener("keydown", keyDown);
      canvas.removeEventListener("pointerdown", pointerDown);
      chromeObserver.disconnect();
    };
  }, [activeNodeIds, canvasRef, clearCloseTimer, close, documentRef, enabled, focusPendingKeyboardEntry, heldAsideRootIds, scheduleClose]);

  const selectedTarget = useMemo<LensTarget | null>(
    () => coarse && navigation.selectedNodeId !== null && activeNodeIds.has(navigation.selectedNodeId)
      ? { kind: "active", nodeId: navigation.selectedNodeId, source: "selection" }
      : null,
    [activeNodeIds, coarse, navigation.selectedNodeId],
  );
  const retainedTarget = target !== null && tree.nodes[target.nodeId] !== undefined && (
    target.kind === "active" ? activeNodeIds.has(target.nodeId) : heldAsideRootIds.has(target.nodeId)
  )
    ? target
    : null;
  const activeTarget = !enabled || chromeSuppressed || interaction === "pending"
    ? null
    : coarse
      ? retainedTarget?.kind === "held-root" || retainedTarget?.source === "focus"
        ? retainedTarget
        : selectedTarget
      : retainedTarget;

  const actionCount = activeTarget === null ? 0 : 2;

  useLayoutEffect(() => {
    const paper = documentRef.current;
    const canvas = canvasRef.current;
    if (!enabled || activeTarget === null || paper === null || canvas === null || actionCount === 0) {
      setPlacement(null);
      return;
    }
    const retainedElement = targetElementRef.current;
    const text = retainedElement?.isConnected === true && canvas.contains(retainedElement) &&
      retainedElement.dataset.thoughtTextId === activeTarget.nodeId
      ? retainedElement
      : canvas.querySelector<HTMLElement>(`[data-thought-text-id="${CSS.escape(activeTarget.nodeId)}"]`);
    if (text === null || text.matches(":disabled")) {
      close();
      return;
    }
    targetElementRef.current = text;

    const update = () => {
      const paperRect = paper.getBoundingClientRect();
      const positioningRect = positioningRef.current?.getBoundingClientRect() ?? paperRect;
      const textRect = measureFirstLineInkRect(text);
      // The field belongs to this passage, so it is sized from this passage's
      // own type rather than one fixed control size for the whole tree.
      const metrics = projectNodeHandleMetrics({
        inkHeight: textRect.height,
        coarse: coarse || compact,
      });
      const result = projectNodeHandlePosition({
        documentRect: paperRect,
        guidanceRect: paper.querySelector<HTMLElement>(".matter-guidance")?.getBoundingClientRect() ?? null,
        railRect: paper.closest<HTMLElement>(".matter-shell")
          ?.querySelector<HTMLElement>(".tool-rail")?.getBoundingClientRect() ?? null,
        textRect,
        toolCount: actionCount,
        metrics,
      });
      const next = result === null
        ? null
        : {
            // The lens is rendered inside the translated material plane. Its
            // placement is constrained in paper/client space, then expressed
            // in that plane's local space so the transform is applied once.
            left: result.left - positioningRect.left,
            top: result.top - positioningRect.top,
            metrics,
            relation: result.relation,
            materialCorner: result.materialCorner,
          };
      setPlacement((current) => current !== null && next !== null &&
        current.left === next.left && current.top === next.top &&
        current.relation === next.relation &&
        current.materialCorner?.x === next.materialCorner?.x &&
        current.materialCorner?.y === next.materialCorner?.y &&
        current.metrics.button === next.metrics.button && current.metrics.gap === next.metrics.gap &&
        current.metrics.paddingX === next.metrics.paddingX && current.metrics.paddingY === next.metrics.paddingY
        ? current
        : next);
    };
    update();
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(paper);
    resizeObserver.observe(text);
    const positioningElement = positioningRef.current;
    const finishPositioningTransition = (event: TransitionEvent) => {
      if (event.target === positioningElement && event.propertyName === "transform") update();
    };
    positioningElement?.addEventListener("transitioncancel", finishPositioningTransition);
    positioningElement?.addEventListener("transitionend", finishPositioningTransition);
    window.addEventListener("resize", update);
    return () => {
      resizeObserver.disconnect();
      positioningElement?.removeEventListener("transitioncancel", finishPositioningTransition);
      positioningElement?.removeEventListener("transitionend", finishPositioningTransition);
      window.removeEventListener("resize", update);
    };
  }, [actionCount, activeTarget, canvasRef, close, coarse, compact, documentRef, enabled, geometryKey, positioningRef]);

  useLayoutEffect(() => {
    if (placement === null || activeTarget === null || pendingKeyboardEntryRef.current !== activeTarget.nodeId) return;
    focusPendingKeyboardEntry(activeTarget.nodeId);
  }, [activeTarget, focusPendingKeyboardEntry, placement]);

  if (activeTarget === null || placement === null || actionCount === 0) return null;

  const restoreTargetFocus = () => {
    canvasRef.current?.querySelector<HTMLElement>(
      `[data-thought-text-id="${CSS.escape(activeTarget.nodeId)}"]`,
    )?.focus();
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dismissedFocusNodeIdRef.current = activeTarget.nodeId;
      close();
      restoreTargetFocus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    if (buttons.length === 0) return;
    event.preventDefault();
    const currentIndex = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : event.key === "ArrowDown" || event.key === "ArrowRight"
          ? (currentIndex + 1) % buttons.length
          : (currentIndex - 1 + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  };
  const stopPointer = (event: ReactPointerEvent<HTMLDivElement>) => event.stopPropagation();
  const pointTalkEnabled = activeTarget.kind === "active" &&
    pointTalkEligibleNodeIds.has(activeTarget.nodeId);

  return (
    <div
      aria-label="Thought context"
      className="node-action-lens"
      data-canvas-interactive
      data-node-action-lens
      data-node-id={activeTarget.nodeId}
      data-relation={placement.relation}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        scheduleClose();
      }}
      onFocus={clearCloseTimer}
      onKeyDown={handleKeyDown}
      onPointerDown={stopPointer}
      onPointerEnter={clearCloseTimer}
      onPointerLeave={() => {
        if (lensRef.current?.contains(document.activeElement)) return;
        scheduleClose();
      }}
      ref={lensRef}
      role="toolbar"
      aria-orientation="horizontal"
      style={{
        left: placement.left,
        top: placement.top,
        "--lens-button": `${placement.metrics.button}px`,
        "--lens-gap": `${placement.metrics.gap}px`,
        "--lens-pad-x": `${placement.metrics.paddingX}px`,
        "--lens-pad-y": `${placement.metrics.paddingY}px`,
        "--lens-material-x": `${placement.materialCorner?.x ?? placement.metrics.paddingX}px`,
        "--lens-material-y": `${placement.materialCorner?.y ?? placement.metrics.paddingY}px`,
      } as CSSProperties}
    >
      <button
        aria-label="Rewrite this material with AI"
        aria-disabled={!pointTalkEnabled || undefined}
        className="node-action-lens__button node-action-lens__button--ai"
        data-node-action="point-talk"
        disabled={!pointTalkEnabled}
        onClick={() => {
          onOpenPointTalk(activeTarget.nodeId);
          close();
        }}
        title="Rewrite with AI"
        tabIndex={pointTalkEnabled ? 0 : -1}
        type="button"
      >
        <MatterAiIcon />
      </button>
      <button
        aria-label={activeTarget.kind === "active"
          ? "Set this material branch aside"
          : "Include this material branch"}
        className="node-action-lens__button"
        data-node-action={activeTarget.kind === "active" ? "set-aside" : "restore"}
        onClick={() => {
          onToggleHeldAside(activeTarget.nodeId);
          close();
        }}
        title={activeTarget.kind === "active" ? "Set aside" : "Include"}
        tabIndex={pointTalkEnabled ? -1 : 0}
        type="button"
      >
        {activeTarget.kind === "active" ? <MinusIcon /> : <PlusIcon />}
      </button>
    </div>
  );
}

function measureFirstLineInkRect(element: HTMLElement) {
  const fallback = element.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(element);
  const fragments = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  if (fragments.length === 0) return fallback;
  const firstTop = Math.min(...fragments.map((rect) => rect.top));
  const firstLine = fragments.filter((rect) => Math.abs(rect.top - firstTop) <= 2);
  const left = Math.min(...firstLine.map((rect) => rect.left));
  const top = Math.min(...firstLine.map((rect) => rect.top));
  const right = Math.max(...firstLine.map((rect) => rect.right));
  const bottom = Math.max(...firstLine.map((rect) => rect.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}
