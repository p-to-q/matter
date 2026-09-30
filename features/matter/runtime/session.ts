import {
  commitDeliveredTreeCommand,
  commitTreeCommand,
  redoTreeHistory,
  undoTreeHistory,
  type TreeHistory,
  type TreeHistoryLimits,
} from "../tree/history";
import type { CommandErrorCode, ThoughtTree, TreeCommand } from "../tree/model";
import {
  admissionToTreeCommand,
  type AdmissionAnchor,
  type AdmissionError,
  type AdmissionValues,
} from "./admission";
import {
  admissionRepairToTreeCommand,
  type AdmissionRepairError,
  type AdmissionRepairValues,
} from "./admission-repair";
import {
  selectedNodeToRemovalCommand,
  type HumanRemovalValues,
} from "./removal";
import {
  reconcileNavigation,
  type NavigationState,
} from "./navigation";

export type RuntimeErrorCode =
  | CommandErrorCode
  | "HISTORY_LIMIT_EXCEEDED"
  | "EMPTY_HISTORY"
  | "EMPTY_REDO"
  | "HISTORY_UNAVAILABLE"
  | AdmissionError["code"]
  | AdmissionRepairError["code"];

export type RuntimeError = {
  code: RuntimeErrorCode;
  message: string;
};

export type RuntimeState = {
  tree: ThoughtTree;
  history: TreeHistory;
  navigation: NavigationState;
  lastError: RuntimeError | null;
};

export type RuntimeReceipt =
  | {
      operation: "commit" | "undo" | "redo";
      status: "committed";
      revision: number;
      affectedNodeIds: readonly string[];
    }
  | {
      operation: "commit" | "undo" | "redo";
      status: "rejected";
      revision: number;
      errorCode: RuntimeErrorCode;
    };

export type RuntimeResult =
  | { ok: true; state: RuntimeState; receipt: Extract<RuntimeReceipt, { status: "committed" }> }
  | { ok: false; state: RuntimeState; receipt: Extract<RuntimeReceipt, { status: "rejected" }> };

/**
 * This is the material publication boundary for the UI binding. It accepts an
 * already-constructed command but never exposes private mutation construction.
 */
export function commitSessionCommand(
  state: RuntimeState,
  command: TreeCommand,
  limits: TreeHistoryLimits,
): RuntimeResult {
  const committed = commitTreeCommand(
    state.tree,
    state.history,
    command,
    limits,
  );
  if (!committed.ok) {
    return reject(state, "commit", committed.error);
  }

  return publish(
    state,
    "commit",
    committed.tree,
    committed.history,
    committed.affectedNodeIds,
  );
}

/**
 * Publishes the result of work the person submitted earlier (a model turn or
 * an admission repair). Unlike a human command it keeps any redo future that
 * still replays exactly; see `commitDeliveredTreeCommand`.
 */
export function commitDeliveredSessionCommand(
  state: RuntimeState,
  command: TreeCommand,
  limits: TreeHistoryLimits,
): RuntimeResult {
  const committed = commitDeliveredTreeCommand(
    state.tree,
    state.history,
    command,
    limits,
  );
  if (!committed.ok) return reject(state, "commit", committed.error);
  return publish(
    state,
    "commit",
    committed.tree,
    committed.history,
    committed.affectedNodeIds,
  );
}

/**
 * Human admission is translated and committed synchronously so no tree or
 * navigation change can enter between target validation and publication.
 */
export function commitHumanAdmission(
  state: RuntimeState,
  anchor: AdmissionAnchor,
  values: AdmissionValues,
  limits: TreeHistoryLimits,
): RuntimeResult {
  const translated = admissionToTreeCommand(
    state.tree,
    state.navigation,
    anchor,
    values,
  );
  if (!translated.ok) {
    return reject(state, "commit", translated.error);
  }

  const committed = commitSessionCommand(
    state,
    translated.command,
    limits,
  );
  if (!committed.ok) return committed;

  if (anchor.target === "child") {
    if (!committed.state.navigation.foldedNodeIds.has(anchor.parentNodeId)) {
      return committed;
    }
    const foldedNodeIds = new Set(committed.state.navigation.foldedNodeIds);
    foldedNodeIds.delete(anchor.parentNodeId);
    return {
      ...committed,
      state: {
        ...committed.state,
        navigation: {
          ...committed.state.navigation,
          foldedNodeIds,
        },
      },
    };
  }

  return {
    ...committed,
    state: {
      ...committed.state,
      navigation: {
        mode: "full",
        focusNodeId: null,
        selectedNodeId: values.nodeId,
        foldedNodeIds: committed.state.navigation.foldedNodeIds,
      },
    },
  };
}

/**
 * Publishes a bounded repair as a second ordinary command. The translator uses
 * the latest tree revision but requires the admitted node's exact text and
 * timestamp, so unrelated material may move without granting a late result
 * permission to overwrite the person's own follow-up edit. A repair settles
 * after its admission, so it is a delivery and keeps a replayable redo future.
 */
export function commitHumanAdmissionRepair(
  state: RuntimeState,
  values: AdmissionRepairValues,
  limits: TreeHistoryLimits,
): RuntimeResult {
  const translated = admissionRepairToTreeCommand(state.tree, values);
  if (!translated.ok) return reject(state, "commit", translated.error);
  return commitDeliveredSessionCommand(state, translated.command, limits);
}

export function commitHumanRemoval(
  state: RuntimeState,
  values: HumanRemovalValues,
  limits: TreeHistoryLimits,
): RuntimeResult {
  const translated = selectedNodeToRemovalCommand(state.tree, state.navigation, values);
  if (!translated.ok) return reject(state, "commit", translated.error);
  return commitSessionCommand(state, translated.command, limits);
}

/**
 * A rejected Undo or Redo may still publish a smaller history: an inverse that
 * no longer applies releases the stack it heads, and the tree is unchanged.
 */
export function undoSession(state: RuntimeState, limits: TreeHistoryLimits): RuntimeResult {
  const undone = undoTreeHistory(state.tree, state.history, limits);
  if (!undone.ok) {
    return reject({ ...state, history: undone.history }, "undo", undone.error);
  }

  return publish(
    state,
    "undo",
    undone.tree,
    undone.history,
    undone.affectedNodeIds,
  );
}

export function redoSession(state: RuntimeState, limits: TreeHistoryLimits): RuntimeResult {
  const redone = redoTreeHistory(state.tree, state.history, limits);
  if (!redone.ok) return reject({ ...state, history: redone.history }, "redo", redone.error);

  return publish(
    state,
    "redo",
    redone.tree,
    redone.history,
    redone.affectedNodeIds,
  );
}

function publish(
  state: RuntimeState,
  operation: "commit" | "undo" | "redo",
  tree: ThoughtTree,
  history: TreeHistory,
  affectedNodeIds: string[],
): RuntimeResult {
  const navigation = reconcileNavigation(state.tree, tree, state.navigation);
  return {
    ok: true,
    state: { tree, history, navigation, lastError: null },
    receipt: {
      operation,
      status: "committed",
      revision: tree.revision,
      affectedNodeIds: [...affectedNodeIds],
    },
  };
}

function reject(
  state: RuntimeState,
  operation: "commit" | "undo" | "redo",
  error: RuntimeError,
): RuntimeResult {
  return {
    ok: false,
    state: {
      tree: state.tree,
      history: state.history,
      navigation: state.navigation,
      lastError: error,
    },
    receipt: {
      operation,
      status: "rejected",
      revision: state.tree.revision,
      errorCode: error.code,
    },
  };
}
