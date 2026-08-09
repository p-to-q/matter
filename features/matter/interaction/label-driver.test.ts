import { describe, expect, it } from "vitest";
import { labelFor } from "../runtime/label-session";
import { SEMANTIC_LABEL_PROMPT_VERSION } from "../material/semantic-label";
import type { LabelSuccess } from "../protocol/label-contract";
import { PROTOCOL_VERSION, type ThoughtNode, type ThoughtTree } from "../tree/model";
import { LabelDriver, DEFAULT_LABEL_DRIVER_LIMITS, type LabelScope } from "./label-driver";
import type { requestLabel } from "./label-client";
import type { LabelRecord, LabelRepository } from "../persistence/label-repository";

const SPOKEN = "呃，我觉得我们怀念的其实不是过去，而是那个过去仍然允许我们想象的生活。";
const OTHER = "然后还有成本的问题，其实这一块我完全没有算过，需要单独看一下。";

function node(id: string, text: string, parentId: string | null, children: string[] = []): ThoughtNode {
  return {
    id,
    text,
    parentId,
    children,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function scope(nodes: readonly ThoughtNode[], treeId = "tree-1", documentEpoch = 0, revision = 1): LabelScope {
  const tree: ThoughtTree = {
    protocolVersion: PROTOCOL_VERSION,
    id: treeId,
    rootId: nodes[0]?.id ?? null,
    nodes: Object.fromEntries(nodes.map((entry) => [entry.id, entry])),
    revision,
  };
  return { tree, documentEpoch };
}

const ROOT = scope([node("root", SPOKEN, null, ["child"]), node("child", OTHER, "root")]);

type Deferred = {
  readonly promise: Promise<LabelSuccess>;
  resolve: (value: LabelSuccess) => void;
  reject: (reason: unknown) => void;
};

function deferred(): Deferred {
  let resolve!: (value: LabelSuccess) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<LabelSuccess>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function success(
  input: Parameters<typeof requestLabel>[0],
  label: string,
  source: LabelSuccess["source"] = "model",
): LabelSuccess {
  return {
    protocolVersion: PROTOCOL_VERSION,
    promptVersion: SEMANTIC_LABEL_PROMPT_VERSION,
    operationId: input.operationId,
    basis: input.basis,
    label,
    source,
  };
}

type Recorded = {
  readonly calls: Parameters<typeof requestLabel>[0][];
  readonly pending: Deferred[];
};

function recorder(): Recorded & { request: typeof requestLabel } {
  const calls: Parameters<typeof requestLabel>[0][] = [];
  const pending: Deferred[] = [];
  return {
    calls,
    pending,
    request: (input) => {
      calls.push(input);
      const next = deferred();
      pending.push(next);
      return next.promise;
    },
  };
}

type FakeRepository = LabelRepository & {
  readonly stored: Map<string, LabelRecord>;
  readonly removed: string[];
  resolveLoad: () => void;
  resolvePut: () => void;
  failNextPut: () => void;
};

function repository(
  seed: readonly LabelRecord[] = [],
  defer = false,
  deferPut = false,
): FakeRepository {
  const stored = new Map(seed.map((record) => [record.nodeId, record]));
  const removed: string[] = [];
  let release: () => void = () => undefined;
  const gate = defer
    ? new Promise<void>((resolve) => {
        release = resolve;
      })
    : Promise.resolve();
  let releasePut: () => void = () => undefined;
  const putGate = deferPut
    ? new Promise<void>((resolve) => {
        releasePut = resolve;
      })
    : Promise.resolve();
  let putFails = false;
  return {
    stored,
    removed,
    failNextPut: () => { putFails = true; },
    resolveLoad: () => release(),
    resolvePut: () => releasePut(),
    async loadAll() {
      await gate;
      return [...stored.values()];
    },
    async put(_treeId, record) {
      await putGate;
      if (putFails) return { ok: false, code: "STORAGE_FULL" } as const;
      stored.set(record.nodeId, record);
      return { ok: true } as const;
    },
    async remove(_treeId, nodeIds) {
      for (const nodeId of nodeIds) {
        removed.push(nodeId);
        stored.delete(nodeId);
      }
    },
    async clear() {
      stored.clear();
    },
    close() {
      // Nothing to release in the fake.
    },
  };
}

function driver(
  request: typeof requestLabel,
  overrides: Partial<{
    now: () => number;
    limits: typeof DEFAULT_LABEL_DRIVER_LIMITS;
    repository: LabelRepository;
  }> = {},
): LabelDriver {
  let counter = 0;
  return new LabelDriver(ROOT, {
    request,
    createOperationId: () => `op-${++counter}`,
    locale: "zh-CN",
    canonicalNow: () => "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

/** The material fingerprint the planner would compute for one fixture node. */
function storedBasis(nodeId: string): string {
  const probe = new LabelDriver(ROOT, {
    request: () => new Promise(() => undefined),
    createOperationId: () => "probe",
    locale: "zh-CN",
  });
  probe.observe(ROOT, [nodeId]);
  const basis = probe.getState().entries.get(nodeId)?.basis ?? "";
  probe.dispose();
  return basis;
}

/**
 * Flushes microtasks and one macrotask. Restoration from storage is genuinely
 * asynchronous, so a microtask-only flush would observe the driver mid-restore.
 */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe("LabelDriver", () => {
  it("publishes a deterministic label before any request resolves", () => {
    const recorded = recorder();
    const instance = driver(recorded.request);
    instance.observe(ROOT, ["root"]);
    expect(labelFor(instance.getState(), "root")).not.toBeNull();
    expect(instance.getState().entries.get("root")?.origin).toBe("provisional");
  });

  it("replaces the label when the model answers", async () => {
    const recorded = recorder();
    const instance = driver(recorded.request);
    instance.observe(ROOT, ["root"]);
    const call = recorded.calls[0];
    expect(call).toBeDefined();
    recorded.pending[0]?.resolve(success(call!, "想象的生活"));
    await settle();
    expect(labelFor(instance.getState(), "root")).toBe("想象的生活");
    expect(instance.getState().entries.get("root")?.origin).toBe("model");
  });

  it("keeps the deterministic label when the request fails", async () => {
    const recorded = recorder();
    const instance = driver(recorded.request);
    instance.observe(ROOT, ["root"]);
    const before = labelFor(instance.getState(), "root");
    recorded.pending[0]?.reject(new Error("offline"));
    await settle();
    expect(labelFor(instance.getState(), "root")).toBe(before);
    expect(instance.getState().entries.get("root")?.pendingOperationId).toBeNull();
  });

  it("does not ask twice for the same unchanged node", () => {
    const recorded = recorder();
    const instance = driver(recorded.request);
    instance.observe(ROOT, ["root"]);
    instance.observe(ROOT, ["root"]);
    instance.observe(ROOT, ["root", "root"]);
    expect(recorded.calls).toHaveLength(1);
  });

  it("ignores an answer whose node has since been edited", async () => {
    const recorded = recorder();
    const instance = driver(recorded.request);
    instance.observe(ROOT, ["root"]);
    const call = recorded.calls[0];

    const edited = scope([node("root", OTHER, null, ["child"]), node("child", OTHER, "root")], "tree-1", 0, 2);
    instance.observe(edited, ["root"]);
    const afterEdit = labelFor(instance.getState(), "root");

    recorded.pending[0]?.resolve(success(call!, "想象的生活"));
    await settle();
    expect(labelFor(instance.getState(), "root")).toBe(afterEdit);
  });

  it("drops labels and requests at a document boundary", async () => {
    const recorded = recorder();
    const instance = driver(recorded.request);
    instance.observe(ROOT, ["root"]);
    const call = recorded.calls[0];

    const replaced = scope([node("root", SPOKEN, null)], "tree-2", 1);
    instance.observe(replaced, []);
    expect(instance.getState().entries.size).toBe(0);
    expect(instance.getState().treeId).toBe("tree-2");

    recorded.pending[0]?.resolve(success(call!, "想象的生活"));
    await settle();
    expect(instance.getState().entries.size).toBe(0);
  });

  it("removes the label of a deleted node", () => {
    const recorded = recorder();
    const instance = driver(recorded.request);
    instance.observe(ROOT, ["root", "child"]);
    expect(instance.getState().entries.size).toBe(2);

    instance.observe(scope([node("root", SPOKEN, null)]), ["root"]);
    expect(instance.getState().entries.has("child")).toBe(false);
  });

  it("bounds concurrent requests and drains the queue", async () => {
    const recorded = recorder();
    const instance = driver(recorded.request, {
      limits: { ...DEFAULT_LABEL_DRIVER_LIMITS, maxConcurrentRequests: 1 },
    });
    instance.observe(ROOT, ["root", "child"]);
    expect(recorded.calls).toHaveLength(1);

    recorded.pending[0]?.resolve(success(recorded.calls[0]!, "想象的生活"));
    await settle();
    expect(recorded.calls).toHaveLength(2);
  });

  it("stops asking after the endpoint fails repeatedly", async () => {
    let clock = 1_000;
    const recorded = recorder();
    const instance = driver(recorded.request, {
      now: () => clock,
      limits: { ...DEFAULT_LABEL_DRIVER_LIMITS, failuresBeforeCooldown: 1, cooldownMs: 30_000 },
    });
    instance.observe(ROOT, ["root"]);
    recorded.pending[0]?.reject(new Error("offline"));
    await settle();

    instance.observe(ROOT, ["child"]);
    expect(recorded.calls).toHaveLength(1);
    expect(labelFor(instance.getState(), "child")).not.toBeNull();

    clock += 60_000;
    instance.observe(scope([node("root", SPOKEN, null, ["child"]), node("child", `${OTHER}再补一句`, "root")]), ["child"]);
    expect(recorded.calls).toHaveLength(2);
  });

  it("cancels outstanding work on dispose and stops publishing", async () => {
    const recorded = recorder();
    const instance = driver(recorded.request);
    instance.observe(ROOT, ["root"]);
    const signal = recorded.calls[0]?.signal;
    const provisional = labelFor(instance.getState(), "root");
    instance.dispose();
    expect(signal?.aborted).toBe(true);

    recorded.pending[0]?.resolve(success(recorded.calls[0]!, "想象的生活"));
    await settle();
    expect(labelFor(instance.getState(), "root")).toBe(provisional);
    instance.observe(ROOT, ["child"]);
    expect(recorded.calls).toHaveLength(1);
  });

  it("asks nothing for a node whose label was stored in an earlier session", async () => {
    const recorded = recorder();
    const store = repository([
      { nodeId: "root", label: "允许我们想象的其他生活", origin: "model", basis: storedBasis("root"), updatedAt: "t" },
    ]);
    const instance = driver(recorded.request, { repository: store });
    instance.observe(ROOT, ["root"]);
    await settle();
    expect(labelFor(instance.getState(), "root")).toBe("允许我们想象的其他生活");
    expect(recorded.calls).toHaveLength(0);
  });

  it("does not pay for a label twice while storage is still loading", async () => {
    const recorded = recorder();
    const store = repository(
      [{ nodeId: "root", label: "允许我们想象的其他生活", origin: "model", basis: storedBasis("root"), updatedAt: "t" }],
      true,
    );
    const instance = driver(recorded.request, { repository: store });
    instance.observe(ROOT, ["root"]);
    // The deterministic label is on screen immediately; nothing is asked yet.
    expect(labelFor(instance.getState(), "root")).not.toBeNull();
    expect(recorded.calls).toHaveLength(0);

    store.resolveLoad();
    await settle();
    expect(recorded.calls).toHaveLength(0);
    expect(labelFor(instance.getState(), "root")).toBe("允许我们想象的其他生活");
  });

  it("stores a model answer so the next session does not regenerate it", async () => {
    const recorded = recorder();
    const store = repository();
    const instance = driver(recorded.request, { repository: store });
    instance.observe(ROOT, ["root"]);
    await settle();
    recorded.pending[0]?.resolve(success(recorded.calls[0]!, "想象的生活"));
    await settle();
    expect(store.stored.get("root")).toMatchObject({ label: "想象的生活", origin: "model" });
    expect(store.stored.get("root")?.basis).not.toBeNull();
  });

  it("stores a name a person typed and stops asking about that node", async () => {
    const recorded = recorder();
    const store = repository();
    const instance = driver(recorded.request, { repository: store });
    instance.observe(ROOT, ["root"]);
    await settle();
    const signal = recorded.calls[0]?.signal;

    const rename = instance.rename("root", "  过去的另一种生活  ");
    // The outstanding request for that node is abandoned, not raced.
    expect(signal?.aborted).toBe(true);
    await rename;
    expect(labelFor(instance.getState(), "root")).toBe("过去的另一种生活");
    expect(store.stored.get("root")).toMatchObject({
      label: "过去的另一种生活",
      origin: "user",
      basis: null,
    });

    const before = recorded.calls.length;
    instance.observe(ROOT, ["root"]);
    expect(recorded.calls).toHaveLength(before);
  });

  it("publishes a person's name only after its durable write settles", async () => {
    const recorded = recorder();
    const store = repository([], false, true);
    const instance = driver(recorded.request, { repository: store });
    instance.observe(ROOT, ["root"]);
    await settle();
    const before = labelFor(instance.getState(), "root");

    const rename = instance.rename("root", "过去的另一种生活");
    expect(labelFor(instance.getState(), "root")).toBe(before);
    expect(recorded.calls[0]?.signal.aborted).toBe(true);

    store.resolvePut();
    await rename;
    expect(labelFor(instance.getState(), "root")).toBe("过去的另一种生活");
    expect(instance.getState().entries.get("root")?.origin).toBe("user");
  });

  it("returns a node to automatic naming when its name is reset", async () => {
    const recorded = recorder();
    const store = repository();
    const instance = driver(recorded.request, { repository: store });
    instance.observe(ROOT, ["root"]);
    await settle();
    await instance.rename("root", "过去的另一种生活");

    await instance.resetName("root");
    expect(store.removed).toContain("root");
    instance.observe(ROOT, ["root"]);
    expect(labelFor(instance.getState(), "root")).not.toBe("过去的另一种生活");
  });

  it("does not report a manual name as kept when it never reached disk", async () => {
    const recorded = recorder();
    const store = repository();
    const instance = driver(recorded.request, { repository: store });
    instance.observe(ROOT, ["root"]);
    await settle();

    await expect(instance.rename("root", "过去的另一种生活")).resolves.toEqual({ ok: true });
    expect(store.stored.get("root")?.label).toBe("过去的另一种生活");

    store.failNextPut();
    // The name is still theirs and still on screen — discarding what they typed
    // would be the worse error — but the caller is told it exists only in this
    // session, instead of a silent success and an empty field after a reload.
    await expect(instance.rename("root", "另一种被允许的生活")).resolves.toEqual({
      ok: false,
      code: "STORAGE_FULL",
    });
    expect(labelFor(instance.getState(), "root")).toBe("另一种被允许的生活");
    expect(store.stored.get("root")?.label).toBe("过去的另一种生活");
  });

  it("forgets the stored label of a deleted node", async () => {
    const recorded = recorder();
    const store = repository();
    const instance = driver(recorded.request, { repository: store });
    instance.observe(ROOT, ["root", "child"]);
    await settle();
    instance.observe(scope([node("root", SPOKEN, null)]), ["root"]);
    await settle();
    expect(store.removed).toContain("child");
  });

  it("survives storage that fails on every call", async () => {
    const recorded = recorder();
    const failing: LabelRepository = {
      loadAll: () => Promise.reject(new Error("blocked")),
      put: () => Promise.reject(new Error("blocked")),
      remove: () => Promise.reject(new Error("blocked")),
      clear: () => Promise.reject(new Error("blocked")),
      close: () => undefined,
    };
    const instance = driver(recorded.request, { repository: failing });
    instance.observe(ROOT, ["root"]);
    await settle();
    expect(labelFor(instance.getState(), "root")).not.toBeNull();
    expect(recorded.calls.length).toBeGreaterThan(0);
  });

  it("notifies subscribers without letting one listener break another", () => {
    const recorded = recorder();
    const instance = driver(recorded.request);
    let second = 0;
    instance.subscribe(() => {
      throw new Error("listener failed");
    });
    instance.subscribe(() => {
      second += 1;
    });
    instance.observe(ROOT, ["root"]);
    expect(second).toBeGreaterThan(0);
  });
});
