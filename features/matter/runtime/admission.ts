import {
  MAX_NODE_TEXT_CODE_UNITS,
  isCanonicalTimestamp,
} from "../tree/invariants";
import type { ThoughtTree, TreeCommand } from "../tree/model";
import type { NavigationState } from "./navigation";

export type AdmissionAnchor =
  | {
      readonly target: "root";
      readonly treeId: string;
      readonly baseRevision: number;
    }
  | {
      readonly target: "child";
      readonly treeId: string;
      readonly baseRevision: number;
      readonly parentNodeId: string;
    };

export type AdmissionValues = {
  readonly interactionId: string;
  readonly commandId: string;
  readonly nodeId: string;
  readonly createdAt: string;
  readonly transcript: string;
};

export type AdmissionError = {
  readonly code:
    | "INVALID_INTERACTION"
    | "INVALID_ADMISSION_TRANSCRIPT"
    | "BOUND_EXCEEDED";
  readonly message: string;
};

export type AdmissionAnchorResult =
  | { readonly ok: true; readonly anchor: AdmissionAnchor }
  | { readonly ok: false; readonly error: AdmissionError };

export type AdmissionCommandResult =
  | { readonly ok: true; readonly command: TreeCommand }
  | { readonly ok: false; readonly error: AdmissionError };

export function createAdmissionAnchor(
  tree: ThoughtTree,
  navigation: NavigationState,
): AdmissionAnchorResult {
  if (tree.rootId === null) {
    if (navigation.mode !== "full" || navigation.selectedNodeId !== null) {
      return invalidInteraction("An empty document cannot have an admission handle.");
    }
    return {
      ok: true,
      anchor: {
        target: "root",
        treeId: tree.id,
        baseRevision: tree.revision,
      },
    };
  }

  const parentNodeId = navigation.selectedNodeId;
  if (
    navigation.mode !== "full" ||
    parentNodeId === null ||
    !Object.hasOwn(tree.nodes, parentNodeId)
  ) {
    return invalidInteraction("Select material before admitting a child thought.");
  }
  return {
    ok: true,
    anchor: {
      target: "child",
      treeId: tree.id,
      baseRevision: tree.revision,
      parentNodeId,
    },
  };
}

/**
 * Translation revalidates the transient handle immediately before constructing
 * the only durable admission command. Fold state is intentionally irrelevant.
 */
export function admissionToTreeCommand(
  tree: ThoughtTree,
  navigation: NavigationState,
  anchor: AdmissionAnchor,
  values: AdmissionValues,
): AdmissionCommandResult {
  const transcript = validateTranscript(values.transcript);
  if (!transcript.ok) return transcript;
  if (!hasNonEmptyString(values.interactionId) || !hasNonEmptyString(values.commandId)) {
    return invalidInteraction("Admission operation identifiers must be non-empty.");
  }
  if (!hasNonEmptyString(values.nodeId) || !isCanonicalTimestamp(values.createdAt)) {
    return invalidInteraction("Admission material values are invalid.");
  }
  if (tree.id !== anchor.treeId || tree.revision !== anchor.baseRevision) {
    return invalidInteraction("The material changed before admission completed.");
  }

  const base = {
    id: values.commandId,
    source: "human" as const,
    interactionId: values.interactionId,
    expectedTreeId: tree.id,
    expectedRevision: tree.revision,
    createdAt: values.createdAt,
  };

  if (anchor.target === "root") {
    if (
      tree.rootId !== null ||
      Object.keys(tree.nodes).length !== 0 ||
      navigation.mode !== "full" ||
      navigation.selectedNodeId !== null
    ) {
      return invalidInteraction("The root admission handle is no longer current.");
    }
    return {
      ok: true,
      command: {
        ...base,
        mutation: {
          type: "initialize-root",
          root: {
            id: values.nodeId,
            text: values.transcript,
            parentId: null,
            children: [],
            createdAt: values.createdAt,
            updatedAt: values.createdAt,
          },
        },
      },
    };
  }

  if (
    navigation.mode !== "full" ||
    navigation.selectedNodeId !== anchor.parentNodeId ||
    !Object.hasOwn(tree.nodes, anchor.parentNodeId)
  ) {
    return invalidInteraction("The child admission handle is no longer current.");
  }
  const parent = tree.nodes[anchor.parentNodeId];
  return {
    ok: true,
    command: {
      ...base,
      mutation: {
        type: "insert-node",
        node: {
          id: values.nodeId,
          text: values.transcript,
          parentId: parent.id,
          children: [],
          createdAt: values.createdAt,
          updatedAt: values.createdAt,
        },
        parentId: parent.id,
        index: parent.children.length,
        expectedParentChildren: [...parent.children],
      },
    },
  };
}

function validateTranscript(
  transcript: unknown,
): { readonly ok: true } | { readonly ok: false; readonly error: AdmissionError } {
  if (typeof transcript !== "string" || transcript.trim().length === 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_ADMISSION_TRANSCRIPT",
        message: "Admission requires a non-empty transcript.",
      },
    };
  }
  if (transcript.length > MAX_NODE_TEXT_CODE_UNITS) {
    return {
      ok: false,
      error: {
        code: "BOUND_EXCEEDED",
        message: "The admission transcript exceeds the node text bound.",
      },
    };
  }
  return { ok: true };
}

function invalidInteraction(message: string): {
  readonly ok: false;
  readonly error: AdmissionError;
} {
  return { ok: false, error: { code: "INVALID_INTERACTION", message } };
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
