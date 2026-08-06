import {
  commitTreeCommand,
  undoTreeHistory,
  type EstimateInverseBytes,
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
  | AdmissionError["code"];

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
      operation: "commit" | "undo";
      status: "committed";
      revision: number;
      affectedNodeIds: readonly string[];
    }
  | {
      operation: "commit" | "undo";
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
  estimateBytes?: EstimateInverseBytes,
): RuntimeResult {
  const committed = commitTreeCommand(
    state.tree,
    state.history,
    command,
    limits,
    estimateBytes,
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
 * Human admission is translated and committed synchronously so no tree or
 * navigation change can enter between target validation and publication.
 */
export function commitHumanAdmission(
  state: RuntimeState,
  anchor: AdmissionAnchor,
  values: AdmissionValues,
  limits: TreeHistoryLimits,
  estimateBytes?: EstimateInverseBytes,
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
    estimateBytes,
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

export function commitHumanRemoval(
  state: RuntimeState,
  values: HumanRemovalValues,
  limits: TreeHistoryLimits,
  estimateBytes?: EstimateInverseBytes,
): RuntimeResult {
  const translated = selectedNodeToRemovalCommand(state.tree, state.navigation, values);
  if (!translated.ok) return reject(state, "commit", translated.error);
  return commitSessionCommand(state, translated.command, limits, estimateBytes);
}

export function undoSession(state: RuntimeState): RuntimeResult {
  const undone = undoTreeHistory(state.tree, state.history);
  if (!undone.ok) {
    return reject(state, "undo", undone.error);
  }

  return publish(
    state,
    "undo",
    undone.tree,
    undone.history,
    undone.affectedNodeIds,
  );
}

function publish(
  state: RuntimeState,
  operation: "commit" | "undo",
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
  operation: "commit" | "undo",
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
