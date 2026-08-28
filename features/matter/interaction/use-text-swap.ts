"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
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
  const { documentEpoch, locale, selection, tree } = input;
  const [driver] = useState(() => new TextSwapDriver<TCommitted>({
    createVoice: createBrowserVoicePort,
    transcribe: requestTranscription,
    request: requestTextSwap,
    ...toDriverBindings(input),
    createInteractionId: () => createTextSwapId("interaction"),
    createRequestId: () => createTextSwapId("request"),
    monotonicNow,
  }));

  const subscribe = useCallback(
    (listener: () => void) => driver.subscribe(listener),
    [driver],
  );
  const getSnapshot = useCallback(() => driver.getState(), [driver]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useLayoutEffect(() => {
    driver.updateBindings(toDriverBindings(input));
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
        locale,
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

function toDriverBindings<TCommitted>(input: UseTextSwapInput<TCommitted>) {
  return {
    buildEnvelope: (basis: TextSwapBasis, direction: string, requestId: string) =>
      createTextSwapEnvelope({
        tree: input.tree,
        documentEpoch: input.documentEpoch,
        selection: input.selection,
        basis,
        direction,
        id: requestId,
      }),
    commit: (envelope: TextSwapEnvelope, plan: TextSwapPlan, basis: TextSwapBasis) =>
      input.commit(envelope, plan, basis.documentEpoch),
    onCommitted: input.onCommitted,
  };
}

function monotonicNow(): number {
  return performance.now();
}

export function createTextSwapBasis(input: Readonly<{
  tree: ThoughtTree;
  documentEpoch: number;
  selection: SegmentSelection | null;
  locale: MatterLocale;
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
  const lineage = currentTextSwapLineage(tree, selection.nodeId);
  if (lineage === null) return null;
  return Object.freeze({
    treeId: tree.id,
    baseRevision: tree.revision,
    documentEpoch: input.documentEpoch,
    selection: Object.freeze({ ...selection }),
    sourceText: selection.selectedText,
    locale: input.locale,
    lineage,
  });
}

export function createTextSwapEnvelope(input: Readonly<{
  tree: ThoughtTree;
  documentEpoch: number;
  selection: SegmentSelection | null;
  basis: TextSwapBasis;
  direction: string;
  id: string;
}>): TextSwapEnvelope | null {
  const currentBasis = createTextSwapBasis({
    tree: input.tree,
    documentEpoch: input.documentEpoch,
    selection: input.selection,
    locale: input.basis.locale,
  });
  if (currentBasis === null || !sameBasis(currentBasis, input.basis)) return null;
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
    locale: input.basis.locale,
    context: {
      lineage: input.basis.lineage,
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
    lineage: input.selection === null
      ? null
      : currentTextSwapLineage(input.tree, input.selection.nodeId),
    enabled: input.enabled,
    interactionScopeKey: input.interactionScopeKey,
  };
}

function sameBasis(left: TextSwapBasis, right: TextSwapBasis): boolean {
  return left.treeId === right.treeId &&
    left.documentEpoch === right.documentEpoch &&
    left.sourceText === right.sourceText &&
    left.locale === right.locale &&
    sameLineage(left.lineage, right.lineage) &&
    left.selection.type === right.selection.type &&
    left.selection.nodeId === right.selection.nodeId &&
    left.selection.start === right.selection.start &&
    left.selection.end === right.selection.end &&
    left.selection.selectedText === right.selection.selectedText;
}

function currentTextSwapLineage(tree: ThoughtTree, nodeId: string) {
  const lineage = selectLineage(tree, nodeId);
  if (lineage === null || lineage.length === 0) return null;
  return Object.freeze(lineage.map((node, index) => Object.freeze({
    id: node.id,
    text: node.text,
    parentId: index === 0 ? null : node.parentId,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  })));
}

function sameLineage(left: TextSwapBasis["lineage"], right: TextSwapBasis["lineage"]): boolean {
  return left.length === right.length && left.every((node, index) => {
    const other = right[index];
    return other !== undefined &&
      node.id === other.id &&
      node.text === other.text &&
      node.parentId === other.parentId &&
      node.createdAt === other.createdAt &&
      node.updatedAt === other.updatedAt;
  });
}

function createTextSwapId(kind: "interaction" | "request"): string {
  const unique = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "")
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `text_swap_${kind}_${unique}`;
}
