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
import type { ProjectedTool, ToolIntent } from "../tools/model";
import { projectNodeActions } from "../tools/project-node-actions";
import { MinusIcon, PlusIcon, ShowAllIcon } from "./icons";
import {
  projectNodeHandleMetrics,
  projectNodeHandlePosition,
  type NodeHandleMetrics,
  type NodeHandlePosition,
} from "./node-handle-position";

type LensTarget = Readonly<{
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
  interaction: "idle" | "pending";
  navigation: NavigationState;
  onIntent: (nodeId: string, intent: ToolIntent) => void;
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
  interaction,
  navigation,
  onIntent,
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
      if (element === null || !canvas.contains(element) || element.matches(":disabled")) return null;
      const nodeId = element.dataset.thoughtTextId;
      return nodeId !== undefined && activeNodeIds.has(nodeId) ? { element, nodeId } : null;
    };
    const reveal = (candidate: Readonly<{ element: HTMLElement; nodeId: string }>, source: LensTarget["source"]) => {
      clearCloseTimer();
      if (source === "pointer") dismissedFocusNodeIdRef.current = null;
      targetElementRef.current = candidate.element;
      setTarget((current) => current?.nodeId === candidate.nodeId && current.source === source
        ? current
        : { nodeId: candidate.nodeId, source });
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
    const syncChromeSuppression = () => {
      const suppressed = chromeIsSuppressed();
      setChromeSuppressed(suppressed);
      if (suppressed) close();
    };
    const chromeObserver = new MutationObserver(syncChromeSuppression);

    canvas.addEventListener("pointerover", pointerOver);
    canvas.addEventListener("pointerout", pointerOut);
    canvas.addEventListener("focusin", focusIn);
    canvas.addEventListener("focusout", focusOut);
    canvas.addEventListener("keydown", keyDown);
    canvas.addEventListener("pointerdown", pointerDown);
    syncChromeSuppression();
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
  }, [activeNodeIds, canvasRef, clearCloseTimer, close, documentRef, enabled, focusPendingKeyboardEntry, scheduleClose]);

  const selectedTarget = useMemo<LensTarget | null>(
    () => coarse && navigation.selectedNodeId !== null && activeNodeIds.has(navigation.selectedNodeId)
      ? { nodeId: navigation.selectedNodeId, source: "selection" }
      : null,
    [activeNodeIds, coarse, navigation.selectedNodeId],
  );
  const retainedTarget = target !== null && activeNodeIds.has(target.nodeId) && tree.nodes[target.nodeId] !== undefined
    ? target
    : null;
  const activeTarget = !enabled || chromeSuppressed || interaction === "pending"
    ? null
    : coarse
      ? retainedTarget?.source === "focus" ? retainedTarget : selectedTarget
      : retainedTarget;

  const tools = useMemo(() => activeTarget === null
    ? Object.freeze([]) as readonly ProjectedTool[]
    : projectNodeActions({
        activeNodeIds,
        interaction,
        navigation,
        nodeId: activeTarget.nodeId,
        tree,
      }), [activeNodeIds, activeTarget, interaction, navigation, tree]);

  useLayoutEffect(() => {
    const paper = documentRef.current;
    const canvas = canvasRef.current;
    if (!enabled || activeTarget === null || paper === null || canvas === null || tools.length === 0) {
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
        toolCount: tools.length,
        metrics,
      });
      const next = result === null
        ? null
        : {
            left: result.left - paperRect.left,
            top: result.top - paperRect.top,
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
    window.addEventListener("resize", update);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [activeTarget, canvasRef, close, coarse, compact, documentRef, enabled, geometryKey, tools.length]);

  useLayoutEffect(() => {
    if (placement === null || activeTarget === null || pendingKeyboardEntryRef.current !== activeTarget.nodeId) return;
    focusPendingKeyboardEntry(activeTarget.nodeId);
  }, [activeTarget, focusPendingKeyboardEntry, placement]);

  if (activeTarget === null || placement === null || tools.length === 0) return null;

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

  return (
    <div
      aria-label="Thought actions"
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
      {tools.map((tool, index) => (
        <NodeActionButton
          key={tool.id}
          tabIndex={index === tools.findIndex((candidate) => candidate.availability === "available") ? 0 : -1}
          tool={tool}
          onActivate={(intent) => {
            onIntent(activeTarget.nodeId, intent);
            close();
          }}
        />
      ))}
    </div>
  );
}

function NodeActionButton({
  onActivate,
  tabIndex,
  tool,
}: Readonly<{
  onActivate: (intent: ToolIntent) => void;
  tabIndex: number;
  tool: ProjectedTool;
}>) {
  const label = tool.id === "add-child"
    ? "Extend from this thought"
    : tool.id === "focus"
      ? "Focus this thought"
      : "Show all material";
  // The pair reads as one degree control: + grows a branch, − narrows to this one.
  const icon = tool.id === "add-child"
    ? <PlusIcon />
    : tool.id === "focus"
      ? <MinusIcon />
      : <ShowAllIcon />;
  return (
    <button
      aria-label={label}
      className="node-action-lens__button"
      data-node-action={tool.id}
      disabled={tool.availability !== "available"}
      onClick={tool.availability === "available" ? () => onActivate(tool.intent) : undefined}
      tabIndex={tabIndex}
      title={label}
      type="button"
    >
      {icon}
    </button>
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
