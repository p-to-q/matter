"use client";

import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import {
  createFixtureInsertChildCommand,
  createFixtureReplaceTextCommand,
  createRootedMaterialFixture,
} from "../fixtures/rooted-material";
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
  commitHumanRemoval,
  commitSessionCommand,
  undoSession,
  type RuntimeError,
  type RuntimeReceipt,
  type RuntimeState,
} from "../runtime/session";
import type { AdmissionAnchor, AdmissionValues } from "../runtime/admission";
import type { HumanRemovalValues } from "../runtime/removal";
import { createTreeHistory } from "../tree/history";
import { validateThoughtTree } from "../tree/invariants";
import type { ThoughtTree } from "../tree/model";

const HISTORY_LIMITS: Readonly<TreeHistoryLimits> = Object.freeze({
  maxEntries: 64,
  maxRetainedInverseBytes: 512_000,
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

export type MatterStoreReceipt = RuntimeReceipt | NavigationReceipt | HydrationReceipt | DocumentSwitchReceipt;

type MatterStoreInternalState = Omit<RuntimeState, "lastError"> & {
  documentEpoch: number;
  lastError: MatterStoreError | null;
  lastReceipt: MatterStoreReceipt | null;
  insertFixtureChild: (parentId: string) => MatterStoreReceipt;
  applyFixtureText: (nodeId: string, text: string) => MatterStoreReceipt;
  admitHumanTranscript: (anchor: AdmissionAnchor, values: AdmissionValues) => MatterStoreReceipt;
  removeSelected: (values: HumanRemovalValues) => MatterStoreReceipt;
  undo: () => MatterStoreReceipt;
  select: (nodeId: string) => MatterStoreReceipt;
  clearSelection: () => MatterStoreReceipt;
  focus: (nodeId: string) => MatterStoreReceipt;
  showFull: () => MatterStoreReceipt;
  toggleFold: (nodeId: string) => MatterStoreReceipt;
  hydrateSnapshot: (tree: ThoughtTree) => MatterStoreReceipt;
  switchDocument: (tree: ThoughtTree) => DocumentSwitchReceipt;
  clearError: () => void;
};

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
export function createMatterStore(): MatterStore {
  assertFixedHistoryLimits(HISTORY_LIMITS);
  const fixture = createRootedMaterialFixture();
  const initialDomain = protectDomain({
    tree: fixture.tree,
    history: fixture.history,
    navigation: createNavigationState(),
  });

  const internalStore = createStore<MatterStoreInternalState>()((set) => freezeState({
    tree: initialDomain.tree,
    documentEpoch: 0,
    history: initialDomain.history,
    navigation: initialDomain.navigation,
    lastError: null,
    lastReceipt: null,

    insertFixtureChild: (parentId) => {
      let receipt: MatterStoreReceipt | undefined;
      set((current) => {
        if (!Object.hasOwn(current.tree.nodes, parentId)) {
          const error: MatterStoreError = {
            code: "INVALID_COMMAND",
            message: "The fixture parent node does not exist.",
          };
          receipt = {
            operation: "commit",
            status: "rejected",
            revision: current.tree.revision,
            errorCode: error.code,
          };
          return freezeState({ ...current, lastError: protectValue(error), lastReceipt: protectValue(receipt) });
        }
        const command = createFixtureInsertChildCommand(current.tree, parentId);
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

    applyFixtureText: (nodeId, text) => {
      let receipt: MatterStoreReceipt | undefined;
      set((current) => {
        const command = createFixtureReplaceTextCommand(current.tree, nodeId, text);
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
      let receipt: MatterStoreReceipt | undefined;
      set((current) => {
        const result = commitHumanAdmission(
          runtimeState(current),
          anchor,
          values,
          HISTORY_LIMITS,
        );
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

    undo: () => {
      let receipt: MatterStoreReceipt | undefined;
      set((current) => {
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

    hydrateSnapshot: (tree) => {
      let receipt: MatterStoreReceipt | undefined;
      set((current) => {
        const validation = validateThoughtTree(tree);
        if (!validation.ok || tree.id !== current.tree.id) {
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
        receipt = { operation: "hydrate", status: "hydrated", revision: tree.revision };
        return freezeState({
          ...current,
          documentEpoch: current.documentEpoch + 1,
          tree: protectValue(tree),
          history: protectValue(createTreeHistory()),
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
        const validation = validateThoughtTree(tree);
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
        receipt = {
          operation: "switch-document",
          status: "switched",
          treeId: tree.id,
          revision: tree.revision,
        };
        return freezeState({
          ...current,
          documentEpoch: current.documentEpoch + 1,
          tree: protectValue(tree),
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

function requireSynchronousReceipt(
  receipt: MatterStoreReceipt | undefined,
): MatterStoreReceipt {
  if (receipt === undefined) {
    throw new Error("The Zustand state updater did not execute synchronously.");
  }
  return receipt;
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

const matterStore = createMatterStore();

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
