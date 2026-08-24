"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { MatterLocale } from "../config/locales";
import type { SegmentSelection } from "../material/text-segments";
import {
  parseCurrentTextSwapReference,
  parseTextSwapEnvelope,
  TEXT_SWAP_REQUEST_VERSION,
  type TextSwapEnvelope,
  type TextSwapPlan,
} from "../protocol/text-swap-contract";
import { deriveTextSwapLength } from "../protocol/text-swap-policy";
import type {
  TextSwapBasis,
  TextSwapInteractionState,
} from "../runtime/text-swap-interaction";
import type { ThoughtTree } from "../tree/model";
import { selectLineage } from "../tree/selectors";
import { createBrowserVoicePort } from "./browser-voice";
import {
  TextSwapDriver,
  type TextSwapCommitResult,
  type TextSwapScope,
} from "./text-swap-driver";
import { requestTextSwap } from "./text-swap-client";
import { requestTranscription } from "./transcription-client";
import { subscribePageSuspension } from "./page-suspension";

export type UseTextSwapInput<TCommitted> = Readonly<{
  tree: ThoughtTree;
  documentEpoch: number;
  selection: SegmentSelection | null;
  locale: MatterLocale;
  enabled: boolean;
  interactionScopeKey: string;
  commit: (
    envelope: TextSwapEnvelope,
    plan: TextSwapPlan,
    expectedDocumentEpoch: number,
  ) => TextSwapCommitResult<TCommitted>;
  onCommitted: (change: TCommitted) => void;
}>;

export type TextSwapController = Readonly<{
  state: TextSwapInteractionState;
  enter: () => boolean;
  startRecording: () => boolean;
  stopRecording: () => void;
  acceptDirection: (text: string) => boolean;
  submit: () => boolean;
  retry: () => boolean;
  dismiss: () => void;
  cancel: () => void;
}>;

/** React binds current material to the focused driver; it owns no second state machine. */
export function useTextSwap<TCommitted>(
  input: UseTextSwapInput<TCommitted>,
): TextSwapController {
  const { commit, documentEpoch, locale, onCommitted, selection, tree } = input;
  const driver = useMemo(() => new TextSwapDriver<TCommitted>({
    createVoice: createBrowserVoicePort,
    transcribe: requestTranscription,
    request: requestTextSwap,
    buildEnvelope: (basis, direction, requestId) => createTextSwapEnvelope({
      tree,
      documentEpoch,
      selection,
      locale,
      basis,
      direction,
      id: requestId,
    }),
    commit: (envelope, plan, basis) => commit(
      envelope,
      plan,
      basis.documentEpoch,
    ),
    onCommitted,
    createInteractionId: () => createTextSwapId("interaction"),
    createRequestId: () => createTextSwapId("request"),
    monotonicNow,
    locale,
  }), [commit, documentEpoch, locale, onCommitted, selection, tree]);

  const subscribe = useCallback(
    (listener: () => void) => driver.subscribe(listener),
    [driver],
  );
  const getSnapshot = useCallback(() => driver.getState(), [driver]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useLayoutEffect(() => {
    driver.updateScope(toScope(input));
  }, [driver, input]);

  useLayoutEffect(() => {
    // Retain in the commit phase. React's development replay performs the
    // matching layout cleanup/setup synchronously, so the driver's deferred
    // final release cannot dispose the instance between paint and the first
    // person gesture.
    driver.retain();
    return () => driver.release();
  }, [driver]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || driver.getState().phase === "idle") return;
      event.preventDefault();
      driver.cancel();
    };
    window.addEventListener("keydown", onKeyDown);
    const unsubscribePageSuspension = subscribePageSuspension(() => driver.cancel());
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unsubscribePageSuspension();
    };
  }, [driver]);

  return {
    state,
    enter: () => {
      if (!input.enabled) return false;
      const basis = createTextSwapBasis({
        tree,
        documentEpoch,
        selection,
      });
      return basis !== null && driver.enter(basis);
    },
    startRecording: () => driver.startRecording(),
    stopRecording: () => driver.stopRecording(),
    acceptDirection: (text) => driver.acceptDirection(text),
    submit: () => driver.submit(),
    retry: () => driver.retry(),
    dismiss: () => driver.dismiss(),
    cancel: () => driver.cancel(),
  };
}

function monotonicNow(): number {
  return performance.now();
}

export function createTextSwapBasis(input: Readonly<{
  tree: ThoughtTree;
  documentEpoch: number;
  selection: SegmentSelection | null;
}>): TextSwapBasis | null {
  const { selection, tree } = input;
  if (
    selection === null ||
    !Number.isSafeInteger(input.documentEpoch) ||
    input.documentEpoch < 0
  ) return null;
  const node = tree.nodes[selection.nodeId];
  if (node === undefined || node.role === "document-root") return null;
  if (
    parseCurrentTextSwapReference(selection, node) === null ||
    node.text.slice(selection.start, selection.end) !== selection.selectedText ||
    deriveTextSwapLength(
      selection.selectedText,
      node.text.slice(0, selection.start),
      node.text.slice(selection.end),
    ) === null
  ) return null;
  return Object.freeze({
    treeId: tree.id,
    baseRevision: tree.revision,
    documentEpoch: input.documentEpoch,
    selection: Object.freeze({ ...selection }),
    sourceText: selection.selectedText,
  });
}

export function createTextSwapEnvelope(input: Readonly<{
  tree: ThoughtTree;
  documentEpoch: number;
  selection: SegmentSelection | null;
  locale: MatterLocale;
  basis: TextSwapBasis;
  direction: string;
  id: string;
}>): TextSwapEnvelope | null {
  const currentBasis = createTextSwapBasis({
    tree: input.tree,
    documentEpoch: input.documentEpoch,
    selection: input.selection,
  });
  if (currentBasis === null || !sameBasis(currentBasis, input.basis)) return null;
  const lineage = selectLineage(input.tree, input.basis.selection.nodeId);
  if (lineage === null || lineage.length === 0) return null;
  const parsed = parseTextSwapEnvelope({
    protocolVersion: input.tree.protocolVersion,
    requestVersion: TEXT_SWAP_REQUEST_VERSION,
    id: input.id,
    treeId: input.tree.id,
    mode: "transform",
    operation: "paraphrase-in-place",
    treeRevision: input.tree.revision,
    selection: input.basis.selection,
    direction: { text: input.direction },
    locale: input.locale,
    context: {
      lineage: lineage.map((node, index) => ({
        id: node.id,
        text: node.text,
        parentId: index === 0 ? null : node.parentId,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      })),
    },
  });
  return parsed.ok ? parsed.envelope : null;
}

function toScope<TCommitted>(input: UseTextSwapInput<TCommitted>): TextSwapScope {
  return {
    treeId: input.tree.id,
    revision: input.tree.revision,
    documentEpoch: input.documentEpoch,
    selection: input.selection,
    enabled: input.enabled,
    interactionScopeKey: input.interactionScopeKey,
  };
}

function sameBasis(left: TextSwapBasis, right: TextSwapBasis): boolean {
  return left.treeId === right.treeId &&
    left.baseRevision === right.baseRevision &&
    left.documentEpoch === right.documentEpoch &&
    left.sourceText === right.sourceText &&
    left.selection.type === right.selection.type &&
    left.selection.nodeId === right.selection.nodeId &&
    left.selection.start === right.selection.start &&
    left.selection.end === right.selection.end &&
    left.selection.selectedText === right.selection.selectedText;
}

function createTextSwapId(kind: "interaction" | "request"): string {
  const unique = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "")
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `text_swap_${kind}_${unique}`;
}
