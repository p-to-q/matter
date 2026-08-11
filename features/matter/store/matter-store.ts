"use client";

import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import {
  createBranchChildCommand,
  createSeededDocument,
  SEEDED_DOCUMENT_TREE_ID,
  SEEDED_ROOT_ONLY_TREE_ID,
  type SeededDocumentVariant,
} from "../material/seeded-document";
import {
  DEFAULT_MATTER_DOCUMENT_TITLE,
  LEGACY_MATTER_DOCUMENT_TITLE,
  normalizeMatterInitialDocument,
} from "../config/initial-document";
import type { TreeHistoryLimits } from "../tree/history";
import {
  clearSelection,
  createNavigationState,
  focusNode,
  selectNode,
  showFull,
  toggleFold,
  type NavigationErrorCode,
  type NavigationResult,
} from "../runtime/navigation";
import {
  commitHumanAdmission,
  commitHumanAdmissionRepair,
  commitHumanRemoval,
  commitSessionCommand,
  redoSession,
  undoSession,
  type RuntimeError,
  type RuntimeReceipt,
  type RuntimeState,
} from "../runtime/session";
import type { AdmissionAnchor, AdmissionValues } from "../runtime/admission";
import {
  ADMISSION_REPAIR_WINDOW_MS,
  type AdmissionRepairValues,
} from "../runtime/admission-repair";
import {
  adjudicateRepair,
  normalizeRepairInput,
} from "../material/transcript-repair";
import { repairAdmittedTranscript } from "../runtime/transcript-punctuation";
import { moveNodeToParentCommand, type MoveNodeValues } from "../runtime/move";
import type { HumanRemovalValues } from "../runtime/removal";
import { createTreeHistory } from "../tree/history";
import { validateThoughtTree } from "../tree/invariants";
import type { ThoughtTree } from "../tree/model";
import { normalizeDocumentTree } from "../tree/document-root";
import { renameDocumentCommand, type RenameDocumentValues } from "../runtime/title";
import { deriveMaterialTitle } from "../material/material-files";
import { recoverPersistedHistory } from "../persistence/history-recovery";
import {
  planToTreeCommand,
  type TransformEnvelope,
  type TransformPlan,
} from "../protocol/transform-contract";
import { isMatterLocale, type MatterLocale } from "../config/locales";

const HISTORY_LIMITS: Readonly<TreeHistoryLimits> = Object.freeze({
  // Durable history must not silently discard an old inverse. Browser storage
  // remains the physical limit and surfaces a recoverable save error instead.
  maxEntries: Number.MAX_SAFE_INTEGER,
  maxRetainedInverseBytes: Number.MAX_SAFE_INTEGER,
});

type NavigationOperation = "select" | "clear-selection" | "focus" | "show-full" | "toggle-fold";

export type MatterStoreError =
  | RuntimeError
  | { code: NavigationErrorCode; message: string };

export type NavigationReceipt =
  | {
      operation: NavigationOperation;
      status: "navigated";
      revision: number;
    }
  | {
      operation: Exclude<NavigationOperation, "show-full">;
      status: "rejected";
      revision: number;
      errorCode: NavigationErrorCode;
    };

export type HydrationReceipt =
  | { operation: "hydrate"; status: "hydrated"; revision: number }
  | { operation: "hydrate"; status: "rejected"; revision: number; errorCode: "TREE_INVARIANT_VIOLATION" };

export type DocumentSwitchReceipt =
  | { operation: "switch-document"; status: "switched"; treeId: string; revision: number }
  | {
      operation: "switch-document";
      status: "rejected";
      treeId: string;
      revision: number;
      errorCode: "TREE_INVARIANT_VIOLATION";
    };

export type AdmissionCommitReceipt = Extract<RuntimeReceipt, { status: "committed" }> &
  Readonly<{ repairLeaseId: string }>;

export type MatterAdmissionValues = AdmissionValues & Readonly<{
  expectedDocumentEpoch: number;
  admittedAtMs?: number;
  repairLocale?: MatterLocale;
}>;

export type AdmissionRepairCommittedChange = Readonly<{
  id: string;
  treeId: string;
  documentEpoch: number;
  nodeId: string;
  committedRevision: number;
  before: Readonly<{ text: string; updatedAt: string }>;
  after: Readonly<{ text: string; updatedAt: string }>;
}>;

/**
 * Returned only to the synchronous repair owner. The material store keeps the
 * base runtime receipt in observable state so ephemeral presentation data can
 * never become a persistence, replay, or cross-document protocol.
 */
export type AdmissionRepairCommitReceipt = Extract<RuntimeReceipt, { status: "committed" }> &
  Readonly<{ repairChange: AdmissionRepairCommittedChange }>;

export type AdmissionRepairSettlement =
  | Readonly<{ repairLeaseId: string; outcome: "discarded" }>
  | Readonly<{
      repairLeaseId: string;
      outcome: "candidate";
      text: string;
      source: "rules" | "model";
      createdAt: string;
    }>;

type AdmissionRepairLease = Readonly<{
  id: string;
  treeId: string;
  nodeId: string;
  expectedText: string;
  expectedUpdatedAt: string;
  documentEpoch: number;
  admittedAtMs: number;
  locale: MatterLocale;
  interactionId: string;
}>;

export type ObservableMatterStoreReceipt =
  | RuntimeReceipt
  | NavigationReceipt
  | HydrationReceipt
  | DocumentSwitchReceipt;

export type AdmissionStoreReceipt = RuntimeReceipt | AdmissionCommitReceipt;
export type AdmissionRepairStoreReceipt = RuntimeReceipt | AdmissionRepairCommitReceipt;
export type MatterStoreReceipt =
  | ObservableMatterStoreReceipt
  | AdmissionCommitReceipt
  | AdmissionRepairCommitReceipt;

type MatterStoreInternalState = Omit<RuntimeState, "lastError"> & {
  documentEpoch: number;
  lastError: MatterStoreError | null;
  lastReceipt: ObservableMatterStoreReceipt | null;
  extendMaterial: (parentId: string, values: BranchValues) => MatterStoreReceipt;
  admitHumanTranscript: (anchor: AdmissionAnchor, values: MatterAdmissionValues) => AdmissionStoreReceipt;
  settleHumanTranscriptRepair: (settlement: AdmissionRepairSettlement) => AdmissionRepairStoreReceipt;
  removeSelected: (values: HumanRemovalValues) => MatterStoreReceipt;
  moveNode: (values: MoveNodeValues) => MatterStoreReceipt;
  renameDocument: (values: RenameDocumentValues) => MatterStoreReceipt;
  undo: () => MatterStoreReceipt;
  redo: () => MatterStoreReceipt;
  commitTransform: (envelope: TransformEnvelope, plan: TransformPlan, nowMs: number) => MatterStoreReceipt;
  select: (nodeId: string) => MatterStoreReceipt;
  clearSelection: () => MatterStoreReceipt;
  focus: (nodeId: string) => MatterStoreReceipt;
  showFull: () => MatterStoreReceipt;
  toggleFold: (nodeId: string) => MatterStoreReceipt;
  hydrateSnapshot: (tree: ThoughtTree, history?: unknown) => MatterStoreReceipt;
  switchDocument: (tree: ThoughtTree) => DocumentSwitchReceipt;
  clearError: () => void;
};

/**
 * Identity and time for one extension. They arrive as values because a pure
 * domain command may not read a clock or a random source, and because a node a
 * person made must carry the moment they made it rather than a build constant.
 */
export type BranchValues = Readonly<{ nodeId: string; createdAt: string }>;

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends ReadonlySet<infer Value>
    ? ReadonlySet<DeepReadonly<Value>>
    : T extends readonly (infer Value)[]
      ? readonly DeepReadonly<Value>[]
      : T extends object
        ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
        : T;

export type MatterStoreState = DeepReadonly<MatterStoreInternalState>;

export type MatterStore = {
  getState: () => MatterStoreState;
  getInitialState: () => MatterStoreState;
  subscribe: (listener: (state: MatterStoreState, previousState: MatterStoreState) => void) => () => void;
};

/**
 * Each factory owns an isolated fixture session. The singleton below is only a
 * React binding; tests and future document tabs must create their own store.
 */
export function createMatterStore(
  initialDocument: SeededDocumentVariant = normalizeMatterInitialDocument(
    process.env.NEXT_PUBLIC_MATTER_INITIAL_DOCUMENT,
  ),
  options: Readonly<{
    documentRoot?: boolean;
    initialTitle?: string;
    monotonicNow?: () => number;
  }> = {},
): MatterStore {
  assertFixedHistoryLimits(HISTORY_LIMITS);
  // Leases are capability state, not document state. Undo/redo, hydration,
  // import, reload, or store disposal cannot recreate one from a tree memento.
  const repairLeases = new Map<string, AdmissionRepairLease>();
  let repairLeaseSequence = 0;
  const monotonicNow = options.monotonicNow ?? defaultMonotonicNow;
  const fixture = createSeededDocument(initialDocument);
  const initialTree = options.documentRoot === true
    ? normalizeForDocumentModel(fixture.tree, options.initialTitle)
    : fixture.tree;
  const initialDomain = protectDomain({
    tree: initialTree,
    history: options.documentRoot === true ? createTreeHistory() : fixture.history,
    navigation: createNavigationState(),
  });

  const internalStore = createStore<MatterStoreInternalState>()((set) => freezeState({
    tree: initialDomain.tree,
    documentEpoch: 0,
    history: initialDomain.history,
    navigation: initialDomain.navigation,
    lastError: null,
    lastReceipt: null,

    extendMaterial: (parentId, values) => {
      let receipt: MatterStoreReceipt | undefined;
      set((current) => {
        if (!Object.hasOwn(current.tree.nodes, parentId)) {
          const error: MatterStoreError = {
            code: "INVALID_COMMAND",
            message: "The parent thought does not exist.",
          };
          receipt = {
            operation: "commit",
            status: "rejected",
            revision: current.tree.revision,
            errorCode: error.code,
          };
          return freezeState({ ...current, lastError: protectValue(error), lastReceipt: protectValue(receipt) });
        }
        const command = createBranchChildCommand(current.tree, parentId, values);
        const result = commitSessionCommand(runtimeState(current), command, HISTORY_LIMITS);
        receipt = result.receipt;
        const domain = protectDomain(result.state);
        return freezeState({
          ...current,
          ...domain,
          lastError: domain.lastError,
          lastReceipt: protectValue(receipt),
        });
      });
      return requireSynchronousReceipt(receipt);
    },

    admitHumanTranscript: (anchor, values) => {
      let receipt: AdmissionStoreReceipt | undefined;
      set((current) => {
        pruneExpiredRepairLeases(repairLeases, monotonicNow());
        if (
          !Number.isSafeInteger(values.expectedDocumentEpoch) ||
          values.expectedDocumentEpoch < 0 ||
          values.expectedDocumentEpoch !== current.documentEpoch
        ) {
          const error: MatterStoreError = {
            code: "INVALID_INTERACTION",
            message: "The material document changed before admission completed.",
          };
          receipt = {
            operation: "commit",
            status: "rejected",
            revision: current.tree.revision,
            errorCode: error.code,
          };
          return freezeState({
            ...current,
            lastError: protectValue(error),
            lastReceipt: protectValue(receipt),
          });
        }
        const result = commitHumanAdmission(
          runtimeState(current),
          anchor,
          values,
          HISTORY_LIMITS,
        );
        receipt = result.receipt;
        if (
          result.ok &&
          Number.isFinite(values.admittedAtMs) &&
          (values.admittedAtMs ?? -1) >= 0 &&
          typeof values.repairLocale === "string" &&
          isMatterLocale(values.repairLocale)
        ) {
          const node = result.state.tree.nodes[values.nodeId];
          if (node !== undefined) {
            const repairLeaseId =
              `admission_repair_lease_${++repairLeaseSequence}_${values.commandId}`;
            repairLeases.set(repairLeaseId, Object.freeze({
              id: repairLeaseId,
              treeId: result.state.tree.id,
              nodeId: node.id,
              expectedText: node.text,
              expectedUpdatedAt: node.updatedAt,
              documentEpoch: current.documentEpoch,
              admittedAtMs: values.admittedAtMs ?? 0,
              locale: values.repairLocale,
              interactionId: values.interactionId,
            }));
            receipt = Object.freeze({ ...result.receipt, repairLeaseId });
          }
        }
        const domain = protectDomain(result.state);
        return freezeState({
          ...current,
          ...domain,
          lastError: domain.lastError,
          // The lease is returned synchronously to the admission driver but is
          // not observable store state. It is a short-lived capability, not a
          // user-facing receipt or recoverable material value.
          lastReceipt: protectValue(result.receipt),
        });
      });
      return requireSynchronousReceipt(receipt);
    },

    settleHumanTranscriptRepair: (settlement) => {
      let receipt: AdmissionRepairStoreReceipt | undefined;
      set((current) => {
        const settledAtMs = monotonicNow();
        const lease = repairLeases.get(settlement.repairLeaseId);
        repairLeases.delete(settlement.repairLeaseId);
        pruneExpiredRepairLeases(repairLeases, settledAtMs);
        if (
          lease !== undefined &&
          settledAtMs - lease.admittedAtMs > ADMISSION_REPAIR_WINDOW_MS
        ) {
          receipt = silentRepairRejection(current.tree.revision, "REPAIR_EXPIRED");
          return current;
        }
        if (
          lease === undefined ||
          lease.documentEpoch !== current.documentEpoch ||
          lease.treeId !== current.tree.id
        ) {
          receipt = silentRepairRejection(current.tree.revision, "REPAIR_STALE");
          return current;
        }
        if (settlement.outcome === "discarded") {
          receipt = silentRepairRejection(current.tree.revision, "INVALID_REPAIR");
          return current;
        }
        const ruleFloor = repairAdmittedTranscript(lease.expectedText, lease.locale);
        const adjudicated = settlement.source === "rules"
          ? settlement.text === ruleFloor
            ? Object.freeze({ ok: true as const, text: settlement.text, changed: settlement.text !== lease.expectedText })
            : Object.freeze({ ok: false as const })
          : adjudicateRepair(
              // Rules and model are one candidate, not two model edits. The
              // recomputed floor is trusted only because the rules branch above
              // is pure and exact; the model receives authority solely over its
              // bounded delta from that floor.
              normalizeRepairInput({ text: ruleFloor, locale: lease.locale }),
              settlement.text,
            );
        if (!adjudicated.ok || !adjudicated.changed) {
          receipt = silentRepairRejection(current.tree.revision, "INVALID_REPAIR");
          return current;
        }
        const values: AdmissionRepairValues = {
          interactionId: lease.interactionId,
          // A consumed capability is still not durable identity. The admitted
          // node id is already validated, bounded, document-unique material;
          // never persist the opaque lease token used to authorize this call.
          commandId: `human_admission_repair_${lease.nodeId}`,
          treeId: lease.treeId,
          nodeId: lease.nodeId,
          expectedText: lease.expectedText,
          expectedUpdatedAt: lease.expectedUpdatedAt,
          text: adjudicated.text,
          createdAt: settlement.createdAt,
          admittedAtMs: lease.admittedAtMs,
          settledAtMs,
        };
        const result = commitHumanAdmissionRepair(
          runtimeState(current),
          values,
          HISTORY_LIMITS,
        );
        receipt = result.receipt;
        // A late repair owns no visible failure state. Stale text, an expired
        // lease, or a rejected candidate all mean the admitted words remain
        // authoritative; they must not replace an unrelated existing error or
        // advertise a failed user action in the store.
        if (!result.ok) return current;
        const afterNode = result.state.tree.nodes[lease.nodeId];
        if (afterNode === undefined) return current;
        const baseReceipt = result.receipt;
        receipt = Object.freeze({
          ...baseReceipt,
          repairChange: Object.freeze({
            id: values.commandId,
            treeId: lease.treeId,
            documentEpoch: lease.documentEpoch,
            nodeId: lease.nodeId,
            committedRevision: result.state.tree.revision,
            before: Object.freeze({
              text: lease.expectedText,
              updatedAt: lease.expectedUpdatedAt,
            }),
            after: Object.freeze({
              text: afterNode.text,
              updatedAt: afterNode.updatedAt,
            }),
          }),
        });
        const domain = protectDomain(result.state);
        return freezeState({
          ...current,
          ...domain,
          lastError: domain.lastError,
          lastReceipt: protectValue(baseReceipt),
        });
      });
      return requireSynchronousReceipt(receipt);
    },

    removeSelected: (values) => {
      let receipt: MatterStoreReceipt | undefined;
      set((current) => {
        const result = commitHumanRemoval(runtimeState(current), values, HISTORY_LIMITS);
        receipt = result.receipt;
        const domain = protectDomain(result.state);
        return freezeState({
          ...current,
          ...domain,
          lastError: domain.lastError,
          lastReceipt: protectValue(receipt),
        });
      });
      return requireSynchronousReceipt(receipt);
    },

    moveNode: (values) => {
      let receipt: MatterStoreReceipt | undefined;
      set((current) => {
        const command = moveNodeToParentCommand(current.tree, values);
        if (!command) {
          receipt = { operation: "commit", status: "rejected", revision: current.tree.revision, errorCode: "INVALID_COMMAND" };
          return freezeState({ ...current, lastError: { code: "INVALID_COMMAND", message: "The node move is not valid." }, lastReceipt: receipt });
        }
        const result = commitSessionCommand(runtimeState(current), command, HISTORY_LIMITS);
        receipt = result.receipt;
        if (result.ok) repairLeases.clear();
        const domain = protectDomain(result.state);
        return freezeState({ ...current, ...domain, lastError: domain.lastError, lastReceipt: protectValue(receipt) });
      });
      return requireSynchronousReceipt(receipt);
    },

    renameDocument: (values) => {
      let receipt: MatterStoreReceipt | undefined;
      set((current) => {
        const command = renameDocumentCommand(current.tree, values);
        if (!command) {
          receipt = { operation: "commit", status: "rejected", revision: current.tree.revision, errorCode: "INVALID_COMMAND" };
          return freezeState({ ...current, lastError: { code: "INVALID_COMMAND", message: "The document title is unchanged." }, lastReceipt: receipt });
        }
        const result = commitSessionCommand(runtimeState(current), command, HISTORY_LIMITS);
        receipt = result.receipt;
        const domain = protectDomain(result.state);
        return freezeState({ ...current, ...domain, lastError: domain.lastError, lastReceipt: protectValue(receipt) });
      });
      return requireSynchronousReceipt(receipt);
    },

    undo: () => {
      let receipt: MatterStoreReceipt | undefined;
      set((current) => {
        repairLeases.clear();
        const result = undoSession(runtimeState(current));
        receipt = result.receipt;
        const domain = protectDomain(result.state);
        return freezeState({
          ...current,
          ...domain,
          lastError: domain.lastError,
          lastReceipt: protectValue(receipt),
        });
      });
      return requireSynchronousReceipt(receipt);
    },

    redo: () => {
      let receipt: MatterStoreReceipt | undefined;
      set((current) => {
        repairLeases.clear();
        const result = redoSession(runtimeState(current));
        receipt = result.receipt;
        const domain = protectDomain(result.state);
        return freezeState({
          ...current,
          ...domain,
          lastError: domain.lastError,
          lastReceipt: protectValue(receipt),
        });
      });
      return requireSynchronousReceipt(receipt);
    },

    commitTransform: (envelope, plan, nowMs) => {
      let receipt: MatterStoreReceipt | undefined;
      set((current) => {
        const translated = Number.isFinite(nowMs) && nowMs >= 0
          ? planToTreeCommand(current.tree, envelope, plan, {
              source: "agent",
              now: () => nowMs,
            })
          : null;
        if (translated === null || !translated.ok) {
          receipt = { operation: "commit", status: "rejected", revision: current.tree.revision, errorCode: "INVALID_COMMAND" };
          return freezeState({
            ...current,
            lastError: { code: "INVALID_COMMAND", message: "The material changed before this turn could commit." },
            lastReceipt: receipt,
          });
        }
        const result = commitSessionCommand(runtimeState(current), translated.command, HISTORY_LIMITS);
        receipt = result.receipt;
        const domain = protectDomain(result.state);
        return freezeState({ ...current, ...domain, lastError: domain.lastError, lastReceipt: protectValue(receipt) });
      });
      return requireSynchronousReceipt(receipt);
    },

    select: (nodeId) => {
      let receipt: MatterStoreReceipt | undefined;
      set((current) => {
        const result = selectNode(current.tree, current.navigation, nodeId);
        const update = navigationUpdate(current, "select", result);
        receipt = update.lastReceipt;
        return freezeState({ ...current, ...protectValue(update) });
      });
      return requireSynchronousReceipt(receipt);
    },

    clearSelection: () => {
      let receipt: MatterStoreReceipt | undefined;
      set((current) => {
        const navigation = clearSelection(current.navigation);
        receipt = {
          operation: "clear-selection",
          status: "navigated",
          revision: current.tree.revision,
        };
        if (navigation === current.navigation && current.lastError === null) return current;
        return freezeState({
          ...current,
          navigation: protectValue(navigation),
          lastError: null,
          lastReceipt: protectValue(receipt),
        });
      });
      return requireSynchronousReceipt(receipt);
    },

    focus: (nodeId) => {
      let receipt: MatterStoreReceipt | undefined;
      set((current) => {
        const result = focusNode(current.tree, current.navigation, nodeId);
        const update = navigationUpdate(current, "focus", result);
        receipt = update.lastReceipt;
        return freezeState({ ...current, ...protectValue(update) });
      });
      return requireSynchronousReceipt(receipt);
    },

    showFull: () => {
      let receipt: MatterStoreReceipt | undefined;
      set((current) => {
        const navigation = showFull(current.tree, current.navigation);
        receipt = {
          operation: "show-full",
          status: "navigated",
          revision: current.tree.revision,
        };
        return freezeState({
          ...current,
          navigation: protectValue(navigation),
          lastError: null,
          lastReceipt: protectValue(receipt),
        });
      });
      return requireSynchronousReceipt(receipt);
    },

    toggleFold: (nodeId) => {
      let receipt: MatterStoreReceipt | undefined;
      set((current) => {
        const result = toggleFold(current.tree, current.navigation, nodeId);
        const update = navigationUpdate(current, "toggle-fold", result);
        receipt = update.lastReceipt;
        return freezeState({ ...current, ...protectValue(update) });
      });
      return requireSynchronousReceipt(receipt);
    },

    hydrateSnapshot: (tree, persistedHistory) => {
      let receipt: MatterStoreReceipt | undefined;
      set((current) => {
        const normalizedTree = options.documentRoot === true
          ? normalizeForDocumentModel(tree, options.initialTitle)
          : tree;
        const validation = validateThoughtTree(normalizedTree);
        if (!validation.ok || normalizedTree.id !== current.tree.id) {
          const error: MatterStoreError = {
            code: "TREE_INVARIANT_VIOLATION",
            message: validation.ok ? "The stored material belongs to another tree." : validation.error.message,
          };
          receipt = {
            operation: "hydrate",
            status: "rejected",
            revision: current.tree.revision,
            errorCode: "TREE_INVARIANT_VIOLATION",
          };
          return freezeState({ ...current, lastError: protectValue(error), lastReceipt: protectValue(receipt) });
        }
        const recoveredHistory = recoverPersistedHistory(
          normalizedTree,
          persistedHistory,
          HISTORY_LIMITS,
        );
        repairLeases.clear();
        receipt = { operation: "hydrate", status: "hydrated", revision: normalizedTree.revision };
        return freezeState({
          ...current,
          documentEpoch: current.documentEpoch + 1,
          tree: protectValue(normalizedTree),
          history: protectValue(recoveredHistory),
          navigation: protectValue(createNavigationState()),
          lastError: null,
          lastReceipt: protectValue(receipt),
        });
      });
      return requireSynchronousReceipt(receipt);
    },

    switchDocument: (tree) => {
      let receipt: DocumentSwitchReceipt | undefined;
      set((current) => {
        const normalizedTree = options.documentRoot === true
          ? normalizeForDocumentModel(tree, options.initialTitle)
          : tree;
        const validation = validateThoughtTree(normalizedTree);
        if (!validation.ok) {
          const error: MatterStoreError = {
            code: "TREE_INVARIANT_VIOLATION",
            message: validation.error.message,
          };
          receipt = {
            operation: "switch-document",
            status: "rejected",
            treeId: current.tree.id,
            revision: current.tree.revision,
            errorCode: "TREE_INVARIANT_VIOLATION",
          };
          return freezeState({ ...current, lastError: protectValue(error), lastReceipt: protectValue(receipt) });
        }

        // Import is a document boundary, not hydration of the current tree.
        // No in-session inverse, focus, or fold can cross that boundary.
        repairLeases.clear();
        receipt = {
          operation: "switch-document",
          status: "switched",
          treeId: normalizedTree.id,
          revision: normalizedTree.revision,
        };
        return freezeState({
          ...current,
          documentEpoch: current.documentEpoch + 1,
          tree: protectValue(normalizedTree),
          history: protectValue(createTreeHistory()),
          navigation: protectValue(createNavigationState()),
          lastError: null,
          lastReceipt: protectValue(receipt),
        });
      });
      if (receipt === undefined) {
        throw new Error("The Zustand state updater did not execute synchronously.");
      }
      return receipt;
    },

    clearError: () => {
      set((current) =>
        current.lastError === null
          ? current
          : freezeState({ ...current, lastError: null }),
      );
    },
  }));

  // `setState` is intentionally not public: every material write must pass a
  // named action and the runtime's atomic tree/history boundary.
  return {
    getState: internalStore.getState,
    getInitialState: internalStore.getInitialState,
    subscribe: internalStore.subscribe,
  };
}

function runtimeState(state: MatterStoreInternalState): RuntimeState {
  return {
    tree: state.tree,
    history: state.history,
    navigation: state.navigation,
    // A material publication owns the next error; an earlier navigation error
    // is not part of the pure session boundary.
    lastError: null,
  };
}

function normalizeForDocumentModel(tree: ThoughtTree, initialTitle?: string): ThoughtTree {
  const root = tree.rootId === null ? undefined : tree.nodes[tree.rootId];
  const firstChild = root?.children[0] === undefined ? undefined : tree.nodes[root.children[0]];
  const source = root?.text.trim() ? root.text : firstChild?.text ?? "";
  return migrateFixtureDefaults(
    normalizeDocumentTree(tree, initialTitle ?? deriveMaterialTitle(source)),
    initialTitle,
  );
}

/**
 * Compatibility belongs to the seeded demo ids, never to arbitrary material.
 * These exact old defaults shipped before the document title was shortened.
 */
function migrateFixtureDefaults(tree: ThoughtTree, initialTitle?: string): ThoughtTree {
  if (tree.id !== SEEDED_DOCUMENT_TREE_ID && tree.id !== SEEDED_ROOT_ONLY_TREE_ID) return tree;
  const nextTitle = initialTitle === DEFAULT_MATTER_DOCUMENT_TITLE && tree.title === LEGACY_MATTER_DOCUMENT_TITLE
    ? DEFAULT_MATTER_DOCUMENT_TITLE
    : tree.title;
  if (nextTitle === tree.title) return tree;
  return {
    ...tree,
    title: nextTitle,
  };
}

function navigationUpdate(
  current: MatterStoreInternalState,
  operation: Exclude<NavigationOperation, "show-full">,
  result: NavigationResult,
): {
  navigation: MatterStoreInternalState["navigation"];
  lastError: MatterStoreError | null;
  lastReceipt: NavigationReceipt;
} {
  if (result.ok) {
    return {
      navigation: result.navigation,
      lastError: null,
      lastReceipt: {
        operation,
        status: "navigated",
        revision: current.tree.revision,
      },
    };
  }

  return {
    navigation: current.navigation,
    lastError: result.error,
    lastReceipt: {
      operation,
      status: "rejected",
      revision: current.tree.revision,
      errorCode: result.error.code,
    },
  };
}

function requireSynchronousReceipt<Receipt extends MatterStoreReceipt>(
  receipt: Receipt | undefined,
): Receipt {
  if (receipt === undefined) {
    throw new Error("The Zustand state updater did not execute synchronously.");
  }
  return receipt;
}

function silentRepairRejection(
  revision: number,
  errorCode: "REPAIR_STALE" | "INVALID_REPAIR" | "REPAIR_EXPIRED",
): Extract<RuntimeReceipt, { status: "rejected" }> {
  return Object.freeze({
    operation: "commit",
    status: "rejected",
    revision,
    errorCode,
  });
}

function pruneExpiredRepairLeases(
  leases: Map<string, AdmissionRepairLease>,
  nowMs: number,
): void {
  if (!Number.isFinite(nowMs)) return;
  for (const [id, lease] of leases) {
    if (nowMs - lease.admittedAtMs > ADMISSION_REPAIR_WINDOW_MS) leases.delete(id);
  }
}

function defaultMonotonicNow(): number {
  return performance.now();
}

function assertFixedHistoryLimits(limits: Readonly<TreeHistoryLimits>): void {
  if (!Number.isSafeInteger(limits.maxEntries) || limits.maxEntries < 1) {
    throw new RangeError("Matter history maxEntries must be a positive safe integer.");
  }
  if (
    !Number.isSafeInteger(limits.maxRetainedInverseBytes) ||
    limits.maxRetainedInverseBytes < 0
  ) {
    throw new RangeError(
      "Matter history maxRetainedInverseBytes must be a non-negative safe integer.",
    );
  }
}

class ImmutableReadonlySet<Value> implements ReadonlySet<Value> {
  readonly #values: Set<Value>;

  constructor(values: Iterable<Value>) {
    this.#values = new Set(values);
    Object.freeze(this);
  }

  get size(): number {
    return this.#values.size;
  }

  get [Symbol.toStringTag](): string {
    return "Set";
  }

  has(value: Value): boolean {
    return this.#values.has(value);
  }

  entries(): SetIterator<[Value, Value]> {
    return this.#values.entries();
  }

  keys(): SetIterator<Value> {
    return this.#values.keys();
  }

  values(): SetIterator<Value> {
    return this.#values.values();
  }

  forEach(
    callbackfn: (value: Value, value2: Value, set: ReadonlySet<Value>) => void,
    thisArg?: unknown,
  ): void {
    for (const value of this.#values) {
      callbackfn.call(thisArg, value, value, this);
    }
  }

  [Symbol.iterator](): SetIterator<Value> {
    return this.#values[Symbol.iterator]();
  }

  union<Other>(other: ReadonlySetLike<Other>): Set<Value | Other> {
    return this.#values.union(other);
  }

  intersection<Other>(other: ReadonlySetLike<Other>): Set<Value & Other> {
    return this.#values.intersection(other);
  }

  difference<Other>(other: ReadonlySetLike<Other>): Set<Value> {
    return this.#values.difference(other);
  }

  symmetricDifference<Other>(other: ReadonlySetLike<Other>): Set<Value | Other> {
    return this.#values.symmetricDifference(other);
  }

  isSubsetOf(other: ReadonlySetLike<unknown>): boolean {
    return this.#values.isSubsetOf(other);
  }

  isSupersetOf(other: ReadonlySetLike<unknown>): boolean {
    return this.#values.isSupersetOf(other);
  }

  isDisjointFrom(other: ReadonlySetLike<unknown>): boolean {
    return this.#values.isDisjointFrom(other);
  }
}

function protectDomain<State extends RuntimeState | Pick<RuntimeState, "tree" | "history" | "navigation">>(
  state: State,
): State {
  return protectValue(state);
}

function protectValue<Value>(value: Value): Value {
  return protectUnknown(value, new WeakMap<object, unknown>()) as Value;
}

function protectUnknown(
  value: unknown,
  seen: WeakMap<object, unknown>,
): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof ImmutableReadonlySet) return value;
  if (value instanceof Set) {
    const protectedSet = new ImmutableReadonlySet(
      [...value].map((entry) => protectUnknown(entry, seen)),
    );
    seen.set(value, protectedSet);
    return protectedSet;
  }
  const prior = seen.get(value);
  if (prior !== undefined) return prior;
  if (Object.isFrozen(value)) return value;

  seen.set(value, value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.writable === true) {
      Reflect.set(value, key, protectUnknown(Reflect.get(value, key), seen));
    }
  }
  return Object.freeze(value);
}

function freezeState(state: MatterStoreInternalState): MatterStoreInternalState {
  return Object.freeze(state);
}

const matterStore = createMatterStore(undefined, {
  documentRoot: true,
  initialTitle: DEFAULT_MATTER_DOCUMENT_TITLE,
});

export function useMatterStore<T>(
  selector: (state: MatterStoreInternalState) => T,
): T {
  return useStore(
    matterStore as Pick<
      StoreApi<MatterStoreInternalState>,
      "getState" | "getInitialState" | "subscribe"
    >,
    selector,
  );
}
