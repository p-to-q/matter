import {
  createLabelSessionState,
  inputForLabelWorkItem,
  labelMaterialBasis,
  planLabelWork,
  reduceLabelSession,
  type LabelSessionState,
  type LabelWorkItem,
} from "../runtime/label-session";
import {
  adjudicateModelLabel,
  validateSemanticLabel,
} from "../material/semantic-label";
import type {
  LabelRecord,
  LabelRepository,
  LabelWriteReceipt,
} from "../persistence/label-repository";
import type { LabelSuccess } from "../protocol/label-contract";
import type { ThoughtTree } from "../tree/model";
import type { requestLabel } from "./label-client";

export type LabelScope = Readonly<{
  tree: ThoughtTree;
  documentEpoch: number;
}>;

export type LabelDriverLimits = Readonly<{
  maxConcurrentRequests: number;
  maxQueuedRequests: number;
  failuresBeforeCooldown: number;
  cooldownMs: number;
}>;

export const DEFAULT_LABEL_DRIVER_LIMITS: LabelDriverLimits = Object.freeze({
  maxConcurrentRequests: 3,
  maxQueuedRequests: 24,
  failuresBeforeCooldown: 3,
  cooldownMs: 20_000,
});

export type LabelDriverDependencies = Readonly<{
  request: typeof requestLabel;
  createOperationId: () => string;
  locale: string;
  /**
   * Durable storage for labels that cost something to produce. Absent in tests
   * and wherever storage is unavailable; the session works either way.
   */
  repository?: LabelRepository;
  canonicalNow?: () => string;
  now?: () => number;
  limits?: LabelDriverLimits;
}>;

type PendingRequest = Readonly<{
  item: LabelWorkItem;
  operationId: string;
  controller: AbortController;
}>;

/**
 * Serializes label work and owns its network effects.
 *
 * The interface never waits for this driver: a deterministic label is committed
 * to session state synchronously, and a model answer only ever replaces it
 * later, after the reducer confirms the node, its material, and the operation
 * are all still current.
 */
/**
 * No write was attempted: disposed, empty, or already this name. Not a failure
 * — there is nothing here that could have been lost.
 */
const WRITE_SKIPPED: LabelWriteReceipt = Object.freeze({ ok: true });

export class LabelDriver {
  private state: LabelSessionState;
  private readonly dependencies: LabelDriverDependencies;
  private readonly limits: LabelDriverLimits;
  private readonly now: () => number;
  private readonly canonicalNow: () => string;
  private readonly listeners = new Set<(state: LabelSessionState) => void>();
  private readonly active = new Map<string, PendingRequest>();
  private readonly queue: PendingRequest[] = [];
  private readonly durableMutations = new Map<string, Promise<unknown>>();
  /**
   * Nodes whose manual name is in this session but not on disk.
   *
   * Without this, retrying the same name after a failed write is a no-op the
   * reducer reports as unchanged — so the retry returns success and never
   * reaches storage, which is the exact failure this receipt exists to end.
   */
  private readonly unpersistedNames = new Set<string>();
  private consecutiveFailures = 0;
  private cooldownUntilMs = 0;
  private restoredTreeId: string | null = null;
  private restoreGeneration = 0;
  private restoring = false;
  private lastScope: LabelScope | null = null;
  private lastNodeIds: readonly string[] = [];
  private disposed = false;
  private leases = 0;
  private leaseGeneration = 0;

  constructor(scope: LabelScope, dependencies: LabelDriverDependencies) {
    this.dependencies = dependencies;
    this.limits = dependencies.limits ?? DEFAULT_LABEL_DRIVER_LIMITS;
    this.now = dependencies.now ?? Date.now;
    this.canonicalNow = dependencies.canonicalNow ?? (() => new Date().toISOString());
    this.state = createLabelSessionState(scope.tree.id, scope.documentEpoch);
  }

  getState(): LabelSessionState {
    return this.state;
  }

  subscribe(listener: (state: LabelSessionState) => void): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  retain(): void {
    if (this.disposed) return;
    this.leases += 1;
    this.leaseGeneration += 1;
  }

  release(): void {
    if (this.disposed || this.leases === 0) return;
    this.leases -= 1;
    const generation = ++this.leaseGeneration;
    if (this.leases !== 0) return;
    // Strict Mode reconnects effects in the same task; deferring disposal lets
    // that replay reuse this driver without cancelling live requests.
    queueMicrotask(() => {
      if (!this.disposed && this.leases === 0 && this.leaseGeneration === generation) {
        this.dispose();
      }
    });
  }

  /**
   * Declares which nodes are worth labelling now — in practice the rows the
   * person can actually see. Work is bounded by that set, so a large document
   * never turns one commit into hundreds of requests.
   */
  observe(scope: LabelScope, nodeIds: readonly string[]): void {
    if (this.disposed) return;
    this.applyDocument(scope);
    this.lastScope = scope;
    this.lastNodeIds = nodeIds;
    this.restoreOnce(scope.tree.id);

    const items = planLabelWork(scope.tree, nodeIds, this.state, this.dependencies.locale);
    let cancelledSupersededWork = false;
    for (const item of items) {
      cancelledSupersededWork = this.cancelSupersededPending(item) || cancelledSupersededWork;
      // While stored labels are still loading, the deterministic label is
      // committed but nothing is asked: a node that was named in an earlier
      // session must not be paid for twice.
      const askable = item.requestModel && !this.restoring && this.mayRequest();
      const operationId = askable ? this.dependencies.createOperationId() : null;
      const next = reduceLabelSession(this.state, {
        type: "begin",
        item,
        operationId,
        // A node whose model call was withheld keeps the right to be asked once
        // restoration finishes or the endpoint recovers.
        deferred: item.requestModel && !askable,
      });
      if (next === this.state) continue;
      this.publish(next);
      if (operationId !== null) this.enqueue({ item, operationId, controller: new AbortController() });
    }
    // A changed node may no longer need a model at all. Its cancelled request
    // must still free the lane for unrelated visible work.
    if (cancelledSupersededWork) this.drain();
  }

  /**
   * Replaces the label of one node with a name the person typed.
   *
   * Resolves to whether the name reached disk. The name is shown either way —
   * it is their decision and discarding it would be the worse error — but a
   * name that only exists in this session must not be reported as kept.
   */
  rename(nodeId: string, label: string): Promise<LabelWriteReceipt> {
    if (this.disposed) return Promise.resolve(WRITE_SKIPPED);
    const trimmed = label.trim();
    if (trimmed.length === 0) return Promise.resolve(WRITE_SKIPPED);
    const treeId = this.state.treeId;
    const next = reduceLabelSession(this.state, { type: "rename", nodeId, label: trimmed });
    // An unchanged session is not a reason to skip the write when the last
    // write did not land: that is precisely a retry of the same name.
    if (next === this.state && !this.unpersistedNames.has(`${treeId} ${nodeId}`)) {
      return Promise.resolve(WRITE_SKIPPED);
    }
    const documentEpoch = this.state.documentEpoch;
    this.cancelPending(nodeId);
    this.drain();
    return this.enqueueDurableMutation(treeId, nodeId, async () => {
      let receipt: LabelWriteReceipt;
      try {
        receipt = await this.dependencies.repository?.put(treeId, {
          nodeId,
          label: trimmed,
          origin: "user",
          basis: null,
          updatedAt: this.canonicalNow(),
        }) ?? WRITE_SKIPPED;
      } catch {
        receipt = Object.freeze({ ok: false, code: "STORAGE_UNAVAILABLE" });
      }
      const unpersistedKey = `${treeId} ${nodeId}`;
      if (receipt.ok) this.unpersistedNames.delete(unpersistedKey);
      else this.unpersistedNames.add(unpersistedKey);
      if (
        this.disposed ||
        this.state.treeId !== treeId ||
        this.state.documentEpoch !== documentEpoch ||
        this.lastScope?.tree.nodes[nodeId] === undefined
      ) return receipt;
      const committed = reduceLabelSession(this.state, { type: "rename", nodeId, label: trimmed });
      if (committed !== this.state) this.publish(committed);
      return receipt;
    });
  }

  /** Returns one node to automatic naming only after its manual name is gone from disk. */
  resetName(nodeId: string): Promise<LabelWriteReceipt> {
    if (this.disposed) return Promise.resolve(WRITE_SKIPPED);
    const next = reduceLabelSession(this.state, { type: "reset-name", nodeId });
    if (next === this.state) return Promise.resolve(WRITE_SKIPPED);
    const treeId = this.state.treeId;
    const documentEpoch = this.state.documentEpoch;
    return this.enqueueDurableMutation(treeId, nodeId, async () => {
      let receipt: LabelWriteReceipt;
      try {
        receipt = await this.dependencies.repository?.remove(treeId, [nodeId]) ?? WRITE_SKIPPED;
      } catch {
        receipt = Object.freeze({ ok: false, code: "STORAGE_UNAVAILABLE" });
      }
      if (!receipt.ok) return receipt;
      this.unpersistedNames.delete(`${treeId} ${nodeId}`);
      if (
        this.disposed ||
        this.state.treeId !== treeId ||
        this.state.documentEpoch !== documentEpoch ||
        this.lastScope?.tree.nodes[nodeId] === undefined
      ) return receipt;
      const committed = reduceLabelSession(this.state, { type: "reset-name", nodeId });
      if (committed !== this.state) {
        this.publish(committed);
        if (this.lastScope !== null) this.observe(this.lastScope, this.lastNodeIds);
      }
      return receipt;
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of [...this.active.values(), ...this.queue]) pending.controller.abort();
    this.active.clear();
    this.queue.length = 0;
    this.listeners.clear();
  }

  private applyDocument(scope: LabelScope): void {
    const next = reduceLabelSession(this.state, {
      type: "document-changed",
      treeId: scope.tree.id,
      documentEpoch: scope.documentEpoch,
    });
    if (next !== this.state) {
      this.restoredTreeId = null;
      this.restoreGeneration += 1;
      this.restoring = false;
      // Node ids are unique per document, so no outstanding answer may survive.
      for (const pending of [...this.active.values(), ...this.queue]) pending.controller.abort();
      this.active.clear();
      this.queue.length = 0;
      this.publish(next);
      return;
    }
    const live = new Set(Object.keys(scope.tree.nodes));
    const removed = [...this.state.entries.keys()].filter((nodeId) => !live.has(nodeId));
    const pruned = reduceLabelSession(this.state, { type: "prune", liveNodeIds: live });
    if (pruned === this.state) return;
    this.publish(pruned);
    if (removed.length > 0) {
      for (const nodeId of removed) this.cancelPending(nodeId);
      this.drain();
      void this.dependencies.repository?.remove(this.state.treeId, removed);
    }
  }

  /**
   * Reads stored labels once per document. A restored label carries the
   * fingerprint of the material it came from, so an unchanged node is never
   * asked about again — that is what makes a label cost one generation rather
   * than one per reload.
   */
  private restoreOnce(treeId: string): void {
    if (this.restoredTreeId === treeId || this.dependencies.repository === undefined) return;
    this.restoredTreeId = treeId;
    this.restoring = true;
    const documentEpoch = this.state.documentEpoch;
    const generation = ++this.restoreGeneration;
    void this.dependencies.repository.loadAll(treeId).then(
      (records) => this.applyRestored(treeId, documentEpoch, generation, records),
      () => this.applyRestored(treeId, documentEpoch, generation, []),
    );
  }

  private applyRestored(
    treeId: string,
    documentEpoch: number,
    generation: number,
    records: readonly LabelRecord[],
  ): void {
    // A load that resolves for a previous document must not clear the flag the
    // current document's load is still holding, or stored labels are re-asked
    // of the model while their own restore is in flight.
    if (
      this.disposed ||
      this.state.treeId !== treeId ||
      this.state.documentEpoch !== documentEpoch ||
      this.restoreGeneration !== generation
    ) {
      return;
    }
    this.restoring = false;
    if (records.length > 0) {
      const tree = this.lastScope?.tree;
      const next = reduceLabelSession(this.state, {
        type: "restore",
        treeId,
        entries: records.flatMap((record) => {
          const node = tree?.nodes[record.nodeId];
          if (node === undefined) return [];
          if (
            record.origin === "model" &&
            record.basis !== labelMaterialBasis(node.text, this.dependencies.locale)
          ) {
            return [];
          }
          return [Object.freeze({
            nodeId: record.nodeId,
            label: record.label,
            origin: record.origin,
            basis: record.basis,
          })];
        }),
      });
      if (next !== this.state) this.publish(next);
    }
    // Whatever was deferred while loading is now planned against the restored
    // session, so only genuinely unnamed nodes reach the network.
    if (this.lastScope !== null) this.observe(this.lastScope, this.lastNodeIds);
  }

  private cancelPending(nodeId: string): void {
    for (const [operationId, pending] of this.active) {
      if (pending.item.nodeId !== nodeId) continue;
      pending.controller.abort();
      this.active.delete(operationId);
    }
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      const pending = this.queue[index];
      if (pending === undefined || pending.item.nodeId !== nodeId) continue;
      pending.controller.abort();
      this.queue.splice(index, 1);
    }
  }

  /** Cancels work whose captured material can no longer name this node. */
  private cancelSupersededPending(item: LabelWorkItem): boolean {
    let cancelled = false;
    for (const [operationId, pending] of this.active) {
      if (pending.item.nodeId !== item.nodeId || pending.item.basis === item.basis) continue;
      pending.controller.abort();
      this.active.delete(operationId);
      cancelled = true;
    }
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      const pending = this.queue[index];
      if (
        pending === undefined ||
        pending.item.nodeId !== item.nodeId ||
        pending.item.basis === item.basis
      ) {
        continue;
      }
      pending.controller.abort();
      this.queue.splice(index, 1);
      cancelled = true;
    }
    return cancelled;
  }

  private enqueueDurableMutation<Result>(
    treeId: string,
    nodeId: string,
    mutation: () => Promise<Result>,
  ): Promise<Result> {
    const key = `${treeId} ${nodeId}`;
    const previous = this.durableMutations.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(mutation);
    this.durableMutations.set(key, current);
    const cleanUp = () => {
      if (this.durableMutations.get(key) === current) this.durableMutations.delete(key);
    };
    void current.then(cleanUp, cleanUp);
    return current;
  }

  private mayRequest(): boolean {
    if (this.now() < this.cooldownUntilMs) return false;
    return this.active.size + this.queue.length < this.limits.maxQueuedRequests;
  }

  private enqueue(pending: PendingRequest): void {
    this.queue.push(pending);
    this.drain();
  }

  private drain(): void {
    while (
      !this.disposed &&
      this.active.size < this.limits.maxConcurrentRequests &&
      this.queue.length > 0
    ) {
      const pending = this.queue.shift();
      if (pending === undefined) return;
      this.active.set(pending.operationId, pending);
      void this.run(pending);
    }
  }

  private async run(pending: PendingRequest): Promise<void> {
    const { item, operationId, controller } = pending;
    try {
      // Duplicate questions are collapsed on the server, where one answer can
      // be shared without any client rewriting the identity it was signed with.
      const success = await this.dependencies.request({
        operationId,
        basis: { treeId: this.state.treeId, nodeId: item.nodeId, revision: item.revision },
        locale: item.locale,
        maxGraphemes: item.maxGraphemes,
        text: item.text,
        reference: item.reference,
        signal: controller.signal,
      });
      if (controller.signal.aborted || this.active.get(operationId) !== pending) return;
      this.settleSuccess(item, operationId, success);
    } catch {
      if (!controller.signal.aborted) this.settleFailure(item, operationId);
    } finally {
      if (this.active.get(operationId) === pending) this.active.delete(operationId);
      this.drain();
    }
  }

  private settleSuccess(item: LabelWorkItem, operationId: string, success: LabelSuccess): void {
    if (this.disposed) return;
    let label = success.label;
    if (success.source === "provisional") {
      // A fallback is allowed to report only the floor the browser already
      // derived from this exact request. It cannot smuggle a second proposal
      // through the less-trusted provisional origin.
      if (label !== item.provisional) {
        this.releaseRejectedResult(item, operationId);
        return;
      }
      if (
        success.fallbackReason === "MODEL_TIMEOUT" ||
        success.fallbackReason === "MODEL_UNAVAILABLE" ||
        success.fallbackReason === "MODEL_BUSY"
      ) {
        this.recordProviderFailure();
      } else {
        // MODEL_REJECTED means the provider answered and the semantic gate did
        // its job. It is not evidence that the endpoint is unavailable.
        this.consecutiveFailures = 0;
      }
    } else {
      // The provider returned content. Semantic refusal is not an
      // infrastructure outage and therefore closes any prior failure streak.
      this.consecutiveFailures = 0;
      if (success.fallbackReason !== undefined) {
        this.releaseRejectedResult(item, operationId);
        return;
      }
      const input = inputForLabelWorkItem(item);
      const validation = validateSemanticLabel(label, {
        locale: input.locale,
        maxGraphemes: input.maxGraphemes,
        siblingLabels: input.context.siblingLabels,
      });
      if (!validation.ok || !adjudicateModelLabel(input, item.provisional, validation.label).ok) {
        this.releaseRejectedResult(item, operationId);
        return;
      }
      label = validation.label;
    }
    const next = reduceLabelSession(this.state, {
      type: "settled",
      nodeId: item.nodeId,
      basis: item.basis,
      operationId,
      label,
      source: success.source,
    });
    if (next === this.state) return;
    this.publish(next);
    if (success.source === "model") {
      void this.dependencies.repository?.put(this.state.treeId, {
        nodeId: item.nodeId,
        label,
        origin: "model",
        basis: item.basis,
        updatedAt: this.canonicalNow(),
      });
    }
  }

  private settleFailure(item: LabelWorkItem, operationId: string): void {
    if (this.disposed) return;
    this.recordProviderFailure();
    const next = reduceLabelSession(this.state, {
      type: "failed",
      nodeId: item.nodeId,
      basis: item.basis,
      operationId,
    });
    if (next !== this.state) this.publish(next);
  }

  private recordProviderFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.limits.failuresBeforeCooldown) {
      // The endpoint, not this node, is failing. Stop asking for a while rather
      // than spending a deadline per visible row.
      this.cooldownUntilMs = this.now() + this.limits.cooldownMs;
      this.consecutiveFailures = 0;
      // Dropping a queued request must also release its session entry. An entry
      // left holding a pending operation id is skipped by every later plan, so
      // one bad endpoint window would otherwise cost those rows their model
      // label permanently, long after the cooldown expires.
      const abandoned = this.queue.splice(0, this.queue.length);
      for (const queued of abandoned) {
        queued.controller.abort();
        const released = reduceLabelSession(this.state, {
          type: "failed",
          nodeId: queued.item.nodeId,
          basis: queued.item.basis,
          operationId: queued.operationId,
          deferred: true,
        });
        if (released !== this.state) this.publish(released);
      }
    }
  }

  private releaseRejectedResult(item: LabelWorkItem, operationId: string): void {
    const next = reduceLabelSession(this.state, {
      type: "failed",
      nodeId: item.nodeId,
      basis: item.basis,
      operationId,
    });
    if (next !== this.state) this.publish(next);
  }

  private publish(state: LabelSessionState): void {
    this.state = state;
    for (const listener of [...this.listeners]) {
      try {
        listener(state);
      } catch {
        // Observation cannot interrupt request lifecycle or ordering.
      }
    }
  }
}
