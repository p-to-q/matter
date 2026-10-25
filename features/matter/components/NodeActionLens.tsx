"use client";

// Loads with this lazy chunk; nothing in the initial graph renders these classes.
import "./NodeActionLens.css";
import {
  useCallback,
  useEffect,
  useId,
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
import type { MatterLocale } from "../config/locales";
import type { UnderBlockReason } from "../runtime/under-child";
import { MatterAiIcon, MinusIcon, PlusIcon, UnderIcon, WikiChangeIcon } from "./icons";
import { nodeActionLensCopy } from "./node-action-lens-copy";
import { useEscapeLayer } from "./escape-layers";
import { usePictureAvailabilityWarm } from "./use-picture-availability-warm";
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
  owner: Readonly<{
    actionCount: number;
    coarse: boolean;
    compact: boolean;
    element: HTMLElement;
    geometryKey: string;
    nodeId: string;
    target: LensTarget;
  }>;
}>;

/** One word Wiki changed in a passage, as the lens may offer it for review. */
export type NodeActionWikiReview = Readonly<{ id: string; heard: string; canonical: string }>;

/** A passage offers at most this many Wiki reviews; a tap on the word reaches the rest. */
export const MAX_NODE_ACTION_WIKI_REVIEWS = 3;
const NO_WIKI_REVIEWS: readonly NodeActionWikiReview[] = Object.freeze([]);

/**
 * The Under mark starts an admission whose child lands below a passage. The
 * lens only presents it: the controller owns the predicate and the lifecycle.
 */
export type NodeActionUnder = Readonly<{
  /** Why a passage cannot take a child now, or null when it can. */
  blockedReason: (nodeId: string) => UnderBlockReason | null;
  /** The passage whose Under recording is armed; tapping its mark withdraws it. */
  recordingNodeId: string | null;
  onActivate: (nodeId: string) => void;
}>;

export type NodeActionLensProps = Readonly<{
  activeNodeIds: ReadonlySet<string>;
  canvasRef: RefObject<HTMLDivElement | null>;
  documentRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  geometryKey: string;
  heldAsideRootIds: ReadonlySet<string>;
  interaction: "idle" | "pending";
  locale: MatterLocale;
  navigation: NavigationState;
  /** `origin` is the AI mark's centre in client pixels: the field grows from it. */
  onOpenPointTalk: (nodeId: string, origin: Readonly<{ x: number; y: number }> | null) => void;
  onOpenWikiReview?: (occurrenceId: string) => void;
  onToggleHeldAside: (nodeId: string) => void;
  pointTalkEligibleNodeIds: ReadonlySet<string>;
  positioningRef: RefObject<HTMLElement | null>;
  previewBranch: boolean;
  tree: ThoughtTree;
  under: NodeActionUnder;
  /** Live, disclosed Wiki changes by passage: the keyboard path to each takeover. */
  wikiReviews?: ReadonlyMap<string, readonly NodeActionWikiReview[]>;
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
  locale,
  navigation,
  onOpenPointTalk,
  onOpenWikiReview,
  onToggleHeldAside,
  pointTalkEligibleNodeIds,
  positioningRef,
  previewBranch,
  tree,
  under,
  wikiReviews,
}: NodeActionLensProps) {
  const copy = nodeActionLensCopy(locale);
  const underReasonId = useId();
  const [coarse, setCoarse] = useState(false);
  const [compact, setCompact] = useState(false);
  const [chromeSuppressed, setChromeSuppressed] = useState(false);
  const [target, setTarget] = useState<LensTarget | null>(null);
  const [placement, setPlacement] = useState<LensPlacement | null>(null);
  // Escape dismisses the selected passage's lens until that passage is
  // pressed or selected again; a selection alone never brings it back.
  const [dismissedSelectionNodeId, setDismissedSelectionNodeId] = useState<string | null>(null);
  // Wiki reviews are the keyboard's and touch's path to a changed word. A fine
  // pointer taps the word itself, so its lens never grows over that word.
  const [keyboardNodeId, setKeyboardNodeId] = useState<string | null>(null);
  const keyboardNodeIdRef = useRef<string | null>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const targetElementRef = useRef<HTMLElement | null>(null);
  const pendingKeyboardEntryRef = useRef<string | null>(null);
  const dismissedFocusNodeIdRef = useRef<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const noteKeyboardEntry = useCallback((nodeId: string | null) => {
    keyboardNodeIdRef.current = nodeId;
    setKeyboardNodeId(nodeId);
  }, []);
  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);
  const releaseTransientTarget = useCallback(() => {
    clearCloseTimer();
    targetElementRef.current = null;
    pendingKeyboardEntryRef.current = null;
    setTarget(null);
    noteKeyboardEntry(null);
  }, [clearCloseTimer, noteKeyboardEntry]);
  const close = useCallback(() => {
    releaseTransientTarget();
    setPlacement(null);
  }, [releaseTransientTarget]);
  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    // Departure releases hover, not the placement still owned by a selection.
    closeTimerRef.current = window.setTimeout(releaseTransientTarget, CLOSE_DELAY_MS);
  }, [clearCloseTimer, releaseTransientTarget]);
  const focusPendingKeyboardEntry = useCallback((nodeId: string) => {
    const lens = lensRef.current;
    if (pendingKeyboardEntryRef.current !== nodeId || lens?.dataset.nodeId !== nodeId) return false;
    // An unavailable mark stays reachable by arrow keys but is never where entry lands.
    const button = lens.querySelector<HTMLButtonElement>('button:not(:disabled):not([aria-disabled="true"])') ??
      lens.querySelector<HTMLButtonElement>("button:not(:disabled)");
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
      if (candidate === null) return;
      reveal(candidate, "focus");
      noteKeyboardEntry(isFocusVisible(candidate.element) ? candidate.nodeId : null);
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
      // A first keyboard entry may add Wiki reviews and re-place the lens;
      // focus then waits for that placement instead of a button about to go.
      const entered = keyboardNodeIdRef.current === candidate.nodeId;
      noteKeyboardEntry(candidate.nodeId);
      reveal(candidate, "focus");
      if (entered) focusPendingKeyboardEntry(candidate.nodeId);
    };
    // A press on a passage keeps that passage's lens: the click selects it,
    // and the selection holds the lens once the pointer leaves. A press on
    // anything else closes the pointer's lens.
    const pointerDown = (event: PointerEvent) => {
      const candidate = materialTarget(event.target);
      if (candidate === null) {
        close();
        return;
      }
      setDismissedSelectionNodeId(null);
      if (enabled && !chromeIsSuppressed() && event.pointerType !== "touch") reveal(candidate, "pointer");
    };
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
  }, [activeNodeIds, canvasRef, clearCloseTimer, close, documentRef, enabled, focusPendingKeyboardEntry, heldAsideRootIds, noteKeyboardEntry, scheduleClose]);

  // The selected passage keeps its lens for every pointer: a fine pointer's
  // click selects the passage it will act on, so the lens must not depend on
  // the pointer staying over it or on a later hover.
  const selectedTarget = useMemo<LensTarget | null>(
    () => navigation.selectedNodeId !== null &&
        navigation.selectedNodeId !== dismissedSelectionNodeId &&
        activeNodeIds.has(navigation.selectedNodeId)
      ? { kind: "active", nodeId: navigation.selectedNodeId, source: "selection" }
      : null,
    [activeNodeIds, dismissedSelectionNodeId, navigation.selectedNodeId],
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
      : retainedTarget ?? selectedTarget;

  // Wiki reviews grow only a touch selection's or keyboard's lens: a fine
  // pointer taps the changed word itself.
  const reviews = activeTarget?.kind === "active" && onOpenWikiReview !== undefined &&
      ((activeTarget.source === "selection" && coarse) || keyboardNodeId === activeTarget.nodeId)
    ? (wikiReviews?.get(activeTarget.nodeId) ?? NO_WIKI_REVIEWS).slice(0, MAX_NODE_ACTION_WIKI_REVIEWS)
    : NO_WIKI_REVIEWS;
  const actionCount = activeTarget === null ? 0 : (previewBranch ? 2 : 3) + reviews.length;
  const currentPlacement = placement !== null && activeTarget !== null &&
    placement.owner.actionCount === actionCount &&
    placement.owner.coarse === coarse &&
    placement.owner.compact === compact &&
    placement.owner.element.isConnected &&
    placement.owner.geometryKey === geometryKey &&
    placement.owner.nodeId === activeTarget.nodeId &&
    placement.owner.target === activeTarget
    ? placement
    : null;

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
    const owner = Object.freeze({
      actionCount,
      coarse,
      compact,
      element: text,
      geometryKey,
      nodeId: activeTarget.nodeId,
      target: activeTarget,
    });
    let disposed = false;

    const update = () => {
      if (disposed || !text.isConnected || !canvas.contains(text)) return;
      const paperRect = paper.getBoundingClientRect();
      const positioningRect = positioningRef.current?.getBoundingClientRect() ?? paperRect;
      const textRect = measureFirstLineInkRect(text);
      const metrics = projectNodeHandleMetrics({
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
            owner,
          };
      setPlacement((current) => current !== null && next !== null &&
        current.owner === next.owner &&
        current.left === next.left && current.top === next.top &&
        current.relation === next.relation &&
        current.materialCorner?.x === next.materialCorner?.x &&
        current.materialCorner?.y === next.materialCorner?.y &&
        current.metrics.button === next.metrics.button && current.metrics.gap === next.metrics.gap &&
        current.metrics.paddingX === next.metrics.paddingX && current.metrics.paddingY === next.metrics.paddingY
        ? current
        : next);
    };
    // Initial ResizeObserver delivery runs after the browser has completed
    // layout. Reading here in React's layout effect forces a full 2,000-node
    // document layout whenever focus returns to the complete tree.
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
      disposed = true;
      resizeObserver.disconnect();
      positioningElement?.removeEventListener("transitioncancel", finishPositioningTransition);
      positioningElement?.removeEventListener("transitionend", finishPositioningTransition);
      window.removeEventListener("resize", update);
    };
  }, [actionCount, activeTarget, canvasRef, close, coarse, compact, documentRef, enabled, geometryKey, positioningRef]);

  useLayoutEffect(() => {
    if (currentPlacement === null || activeTarget === null || pendingKeyboardEntryRef.current !== activeTarget.nodeId) return;
    focusPendingKeyboardEntry(activeTarget.nodeId);
  }, [activeTarget, currentPlacement, focusPendingKeyboardEntry, keyboardNodeId]);

  // Arming Under reserves a lane under the passage and the lens re-places once
  // the layout settles, which drops the focused mark for a frame. A keyboard
  // press that armed it gets its focus back; a pointer press never does.
  const underKeyboardArmedRef = useRef(false);
  const underRecordingNodeId = under.recordingNodeId;
  useLayoutEffect(() => {
    if (!underKeyboardArmedRef.current || underRecordingNodeId === null) return;
    if (currentPlacement === null || activeTarget?.nodeId !== underRecordingNodeId) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    lensRef.current?.querySelector<HTMLButtonElement>('[data-node-action="under"]')?.focus();
  }, [activeTarget, currentPlacement, underRecordingNodeId]);
  useEffect(() => {
    if (underRecordingNodeId === null) underKeyboardArmedRef.current = false;
  }, [underRecordingNodeId]);

  const lensVisible = activeTarget !== null && currentPlacement !== null && actionCount > 0;
  // The mark that opens Point and Talk is the moment to learn whether its field
  // will offer a picture, so the row is settled before the field opens.
  usePictureAvailabilityWarm(
    lensVisible && activeTarget.kind === "active" && pointTalkEligibleNodeIds.has(activeTarget.nodeId),
  );
  // A paper surface: chrome or a panel that covers the paper outranks it.
  useEscapeLayer(lensVisible, "paper", () => {
    if (activeTarget === null) return false;
    // Only a lens that holds keyboard focus hands it back to its passage.
    const focusWasInside = lensRef.current?.contains(document.activeElement) === true;
    dismissedFocusNodeIdRef.current = activeTarget.nodeId;
    if (activeTarget.nodeId === navigation.selectedNodeId) {
      setDismissedSelectionNodeId(activeTarget.nodeId);
    }
    close();
    if (focusWasInside) {
      canvasRef.current?.querySelector<HTMLElement>(
        `[data-thought-text-id="${CSS.escape(activeTarget.nodeId)}"]`,
      )?.focus();
    }
    return true;
  });

  if (activeTarget === null || currentPlacement === null || actionCount === 0) return null;

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
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
  // While an Under recording is armed the passage is spoken for: Point and Talk
  // and set-aside would each retarget material under a live microphone.
  const underArmed = under.recordingNodeId !== null;
  const underRecording = under.recordingNodeId === activeTarget.nodeId;
  const underReason = underRecording ? null : under.blockedReason(activeTarget.nodeId);
  const pointTalkEnabled = !underArmed && activeTarget.kind === "active" &&
    pointTalkEligibleNodeIds.has(activeTarget.nodeId);
  const underLabel = underRecording ? copy.underCancel : copy.under;
  const underReasonText = underReason === null ? undefined : copy.underBlocked[underReason];
  const lensStyle = {
    left: currentPlacement.left,
    top: currentPlacement.top,
    "--lens-action-count": actionCount,
    "--lens-button": `${currentPlacement.metrics.button}px`,
    "--lens-gap": `${currentPlacement.metrics.gap}px`,
    "--lens-pad-x": `${currentPlacement.metrics.paddingX}px`,
    "--lens-pad-y": `${currentPlacement.metrics.paddingY}px`,
    "--lens-material-x": `${currentPlacement.materialCorner?.x ?? currentPlacement.metrics.paddingX}px`,
    "--lens-material-y": `${currentPlacement.materialCorner?.y ?? currentPlacement.metrics.paddingY}px`,
  } as CSSProperties;

  return (
    <>
    <div
      aria-hidden="true"
      className="node-action-fog"
      data-node-action-fog
      data-node-id={activeTarget.nodeId}
      data-relation={currentPlacement.relation}
      style={lensStyle}
    />
    <div
      aria-label={copy.actions}
      className="node-action-lens"
      data-canvas-interactive
      data-node-action-lens
      data-node-id={activeTarget.nodeId}
      data-relation={currentPlacement.relation}
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
      style={lensStyle}
    >
      <button
        aria-label={copy.rewrite}
        aria-disabled={!pointTalkEnabled || undefined}
        className="node-action-lens__button node-action-lens__button--ai"
        data-node-action="point-talk"
        disabled={!pointTalkEnabled}
        onClick={(event) => {
          const mark = event.currentTarget.getBoundingClientRect();
          onOpenPointTalk(activeTarget.nodeId, Object.freeze({
            x: mark.left + mark.width / 2,
            y: mark.top + mark.height / 2,
          }));
          close();
        }}
        title={copy.rewriteShort}
        tabIndex={pointTalkEnabled ? 0 : -1}
        type="button"
      >
        <MatterAiIcon />
      </button>
      {!previewBranch && (
        <>
          <button
            aria-describedby={underReasonText === undefined ? undefined : underReasonId}
            aria-disabled={underReason !== null || undefined}
            aria-label={underLabel}
            className="node-action-lens__button"
            data-node-action="under"
            data-under-state={underRecording ? "recording" : undefined}
            onClick={(event) => {
              // `aria-disabled`, not `disabled`: the mark stays focusable to say why.
              if (underReason !== null) return;
              // A keyboard activation has no pointer position (`detail` 0).
              if (!underRecording) underKeyboardArmedRef.current = event.detail === 0;
              under.onActivate(activeTarget.nodeId);
            }}
            tabIndex={underArmed ? 0 : -1}
            title={underReasonText === undefined ? underLabel : `${underLabel} — ${underReasonText}`}
            type="button"
          >
            <UnderIcon />
          </button>
          {underReasonText === undefined ? null : (
            <span className="visually-hidden" id={underReasonId}>{underReasonText}</span>
          )}
        </>
      )}
      <button
        aria-label={activeTarget.kind === "active" ? copy.setAside : copy.include}
        className="node-action-lens__button"
        data-node-action={activeTarget.kind === "active" ? "set-aside" : "restore"}
        disabled={underArmed}
        onClick={() => {
          onToggleHeldAside(activeTarget.nodeId);
          close();
        }}
        title={activeTarget.kind === "active" ? copy.setAsideShort : copy.includeShort}
        tabIndex={pointTalkEnabled || underArmed ? -1 : 0}
        type="button"
      >
        {activeTarget.kind === "active" ? <MinusIcon /> : <PlusIcon />}
      </button>
      {reviews.map((review) => (
        <button
          aria-label={copy.wikiReview(review.heard, review.canonical)}
          className="node-action-lens__button"
          data-node-action="wiki-review"
          key={review.id}
          onClick={() => {
            close();
            onOpenWikiReview?.(review.id);
          }}
          tabIndex={-1}
          title={copy.wikiReviewShort}
          type="button"
        >
          <WikiChangeIcon />
        </button>
      ))}
    </div>
    </>
  );
}

function isFocusVisible(element: HTMLElement): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return false;
  }
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
