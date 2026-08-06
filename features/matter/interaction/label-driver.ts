import {
  createLabelSessionState,
  planLabelWork,
  reduceLabelSession,
  type LabelSessionState,
  type LabelWorkItem,
} from "../runtime/label-session";
import type { LabelRecord, LabelRepository } from "../persistence/label-repository";
import type { LabelSuccess } from "../server/label-contract";
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
export class LabelDriver {
  private state: LabelSessionState;
  private readonly dependencies: LabelDriverDependencies;
  private readonly limits: LabelDriverLimits;
  private readonly now: () => number;
  private readonly canonicalNow: () => string;
  private readonly listeners = new Set<(state: LabelSessionState) => void>();
  private readonly active = new Map<string, PendingRequest>();
  private readonly queue: PendingRequest[] = [];
  private consecutiveFailures = 0;
  private cooldownUntilMs = 0;
  private restoredTreeId: string | null = null;
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
    for (const item of items) {
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
  }

  /** Replaces the label of one node with a name the person typed. */
  rename(nodeId: string, label: string): void {
    if (this.disposed) return;
    const trimmed = label.trim();
    if (trimmed.length === 0) return;
    const next = reduceLabelSession(this.state, { type: "rename", nodeId, label: trimmed });
    if (next === this.state) return;
    this.cancelPending(nodeId);
    this.publish(next);
    // A name is written before anything else can overwrite it, because losing
    // it would lose a decision rather than a recomputable derivation.
    void this.dependencies.repository?.put(this.state.treeId, {
      nodeId,
      label: trimmed,
      origin: "user",
      basis: null,
      updatedAt: this.canonicalNow(),
    });
  }

  /** Returns one node to automatic naming. */
  resetName(nodeId: string): void {
    if (this.disposed) return;
    const next = reduceLabelSession(this.state, { type: "reset-name", nodeId });
    if (next === this.state) return;
    this.publish(next);
    void this.dependencies.repository?.remove(this.state.treeId, [nodeId]);
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
    void this.dependencies.repository.loadAll(treeId).then(
      (records) => this.applyRestored(treeId, records),
      () => this.applyRestored(treeId, []),
    );
  }

  private applyRestored(treeId: string, records: readonly LabelRecord[]): void {
    this.restoring = false;
    if (this.disposed || this.state.treeId !== treeId) return;
    if (records.length > 0) {
      const next = reduceLabelSession(this.state, {
        type: "restore",
        treeId,
        entries: records.map((record) => Object.freeze({
          nodeId: record.nodeId,
          label: record.label,
          origin: record.origin,
          basis: record.basis,
        })),
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
      this.settleSuccess(item, operationId, success);
    } catch {
      if (!controller.signal.aborted) this.settleFailure(item, operationId);
    } finally {
      this.active.delete(operationId);
      this.drain();
    }
  }

  private settleSuccess(item: LabelWorkItem, operationId: string, success: LabelSuccess): void {
    if (this.disposed) return;
    this.consecutiveFailures = 0;
    const next = reduceLabelSession(this.state, {
      type: "settled",
      nodeId: item.nodeId,
      basis: item.basis,
      operationId,
      label: success.label,
      source: success.source,
    });
    if (next === this.state) return;
    this.publish(next);
    if (success.source === "model") {
      void this.dependencies.repository?.put(this.state.treeId, {
        nodeId: item.nodeId,
        label: success.label,
        origin: "model",
        basis: item.basis,
        updatedAt: this.canonicalNow(),
      });
    }
  }

  private settleFailure(item: LabelWorkItem, operationId: string): void {
    if (this.disposed) return;
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.limits.failuresBeforeCooldown) {
      // The endpoint, not this node, is failing. Stop asking for a while rather
      // than spending a deadline per visible row.
      this.cooldownUntilMs = this.now() + this.limits.cooldownMs;
      this.consecutiveFailures = 0;
      for (const queued of this.queue) queued.controller.abort();
      this.queue.length = 0;
    }
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
